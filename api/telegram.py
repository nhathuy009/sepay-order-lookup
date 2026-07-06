"""Webhook Telegram cho bot @sepaycheckbot.

Nhận update từ Telegram, tra cứu mã đơn (DH… / BIZ…) và trả kết quả về chat.
Dùng chung logic với web app qua `_core.lookup_order`.

Env vars:
  TELEGRAM_BOT_TOKEN      (bắt buộc) token bot
  TELEGRAM_ALLOWED_IDS    (tùy chọn) danh sách user id được phép, ngăn cách bằng dấu phẩy
  TELEGRAM_WEBHOOK_SECRET (tùy chọn) chuỗi bí mật khớp với secret_token khi set webhook
"""
import json
import os
import sys
import urllib.request
from http.server import BaseHTTPRequestHandler

sys.path.append(os.path.dirname(__file__))
from _core import lookup_order, detect_system  # noqa: E402

TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
ALLOWED_IDS = set(
    x.strip() for x in os.environ.get("TELEGRAM_ALLOWED_IDS", "").split(",") if x.strip()
)
WEBHOOK_SECRET = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "")

HELP_TEXT = (
    "👋 <b>Bot tra cứu đơn hàng (10X + SOLOBIZ)</b>\n\n"
    "Gửi mã đơn để tra cứu:\n"
    "• <code>DH18700</code> (hệ thống 10X)\n"
    "• <code>BIZ02120</code> (hệ thống SOLOBIZ)\n\n"
    "Có thể gửi nhiều mã, mỗi mã một dòng."
)


def tg_call(method, payload):
    if not TOKEN:
        return
    url = f"https://api.telegram.org/bot{TOKEN}/{method}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=15)
    except Exception:
        pass


def send_message(chat_id, text):
    tg_call("sendMessage", {"chat_id": chat_id, "text": text, "parse_mode": "HTML",
                            "disable_web_page_preview": True})


def esc(s):
    return (str(s or "")
            .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def format_result(d):
    if d.get("status_msg") != "Thành công":
        return f"❌ <b>{esc(d.get('order_code'))}</b>: {esc(d.get('status_msg'))}"

    # Lấy số tiền, ép kiểu về float (mặc định là 0 nếu None hoặc rỗng)
    try:
        amount = float(d.get('orders_amount') or 0)
        # Định dạng dấu phẩy hàng ngàn rồi đổi thành dấu chấm
        formatted_amount = f"{amount:,.0f}".replace(",", ".")
    except (ValueError, TypeError):
        # Phòng trường hợp orders_amount là chuỗi không thể ép kiểu thành số
        formatted_amount = d.get('orders_amount')

    lines = [
        f"✅ <b>{esc(d.get('order_code'))}</b> ({esc(d.get('system'))})",
        f"📧 Email KH: <code>{esc(d.get('lead_email'))}</code>",
        f"📞 SĐT KH: <code>{esc(d.get('lead_phone'))}</code>",
        f"👤 Username: <code>{esc(d.get('username'))}</code>",
        f"🧑 Họ tên: {esc(d.get('users_name'))}",
        f"💰 Số tiền: {esc(formatted_amount)}",  # <-- Đã thay đổi ở đây
        f"🗓 Ngày TT: {esc(d.get('einvoice_created_at'))}",
        f"🧾 Số hóa đơn: {esc(d.get('invoice_number'))}",
    ]
    ref_u = d.get("ref_username")
    ref_n = d.get("ref_name")
    if ref_u:
        lines.append(f"🤝 Ref: {esc(ref_u)}" + (f" ({esc(ref_n)})" if ref_n else ""))
    else:
        lines.append("🤝 Ref: (không có)")
    return "\n".join(lines)

def handle_update(update):
    message = update.get("message") or update.get("edited_message")
    if not message:
        return
    chat_id = message.get("chat", {}).get("id")
    user_id = str(message.get("from", {}).get("id", ""))
    if chat_id is None:
        return

    if ALLOWED_IDS and user_id not in ALLOWED_IDS:
        send_message(chat_id, f"⛔ Bạn chưa được cấp quyền dùng bot.\nID Telegram của bạn: <code>{esc(user_id)}</code>")
        return

    if message.get("document"):
        send_message(chat_id, "📄 Xử lý file Excel qua Telegram chưa hỗ trợ. Dùng web app để upload file nhé.")
        return

    text = (message.get("text") or "").strip()
    if not text:
        return
    if text.startswith("/start") or text.startswith("/help") or text.startswith("/id"):
        send_message(chat_id, HELP_TEXT + f"\n\n🆔 ID Telegram của bạn: <code>{esc(user_id)}</code>")
        return

    codes = [c.strip() for c in text.split("\n") if c.strip()][:20]
    replies = []
    for code in codes:
        if detect_system(code) is None:
            replies.append(f"⚠️ <b>{esc(code)}</b>: mã không hợp lệ (phải bắt đầu bằng DH/BIZ)")
            continue
        replies.append(format_result(lookup_order(code)))
    send_message(chat_id, "\n\n".join(replies) if replies else HELP_TEXT)


class handler(BaseHTTPRequestHandler):
    def _ok(self):
        body = b'{"ok":true}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._ok()

    def do_POST(self):
        # Xác thực secret_token của Telegram nếu có cấu hình.
        if WEBHOOK_SECRET:
            got = self.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
            if got != WEBHOOK_SECRET:
                self._ok()  # bỏ qua request không hợp lệ, vẫn trả 200
                return
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b"{}"
            update = json.loads(raw.decode("utf-8") or "{}")
            handle_update(update)
        except Exception:
            pass
        self._ok()
