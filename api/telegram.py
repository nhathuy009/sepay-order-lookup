"""Webhook Telegram cho bot @sepaycheckbot."""
import json
import os
import sys
import urllib.request
from http.server import BaseHTTPRequestHandler

sys.path.append(os.path.dirname(__file__))
from _core import lookup_order, detect_system
from index import handle_p2p_usdt_vnd
from datetime import datetime, timedelta, timezone

TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
ALLOWED_IDS = set(x.strip() for x in os.environ.get("TELEGRAM_ALLOWED_IDS", "").split(",") if x.strip())
WEBHOOK_SECRET = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "")

HELP_TEXT = (
    "👋 <b>Bot tra cứu đơn hàng & giá USDT</b>\n\n"
    "<b>Tra cứu đơn:</b> Gửi mã <code>DH18700</code> hoặc <code>BIZ02120</code>\n"
    "<b>Giá USDT P2P:</b> Gửi <code>p2p</code>\n"
    "<b>Lấy Telegram ID của bạn:</b> Gửi <code>/id</code>\n"
)

def tg_call(method, payload):
    if not TOKEN: return
    url = f"https://api.telegram.org/bot{TOKEN}/{method}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try: urllib.request.urlopen(req, timeout=15)
    except: pass

def send_message(chat_id, text):
    tg_call("sendMessage", {"chat_id": chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True})

def esc(s):
    return str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def format_result(d):
    if d.get("status_msg") != "Thành công":
        return f"❌ <b>{esc(d.get('order_code'))}</b>: {esc(d.get('status_msg'))}"
    try:
        amount = float(d.get('orders_amount') or 0)
        formatted_amount = f"{amount:,.0f}".replace(",", ".")
    except:
        formatted_amount = d.get('orders_amount')
    lines = [
        f"✅ <b>{esc(d.get('order_code'))}</b> ({esc(d.get('system'))})",
        f"📧 Email KH: <code>{esc(d.get('lead_email'))}</code>",
        f"💰 Số tiền: {esc(formatted_amount)}"
    ]
    return "\n".join(lines)

def vnd(n):
    return f"{n:,.0f}".replace(",", ".")

def format_p2p():
    status, data = handle_p2p_usdt_vnd({})
    if status != 200:
        return f"❌ {esc(data.get('error'))}"
    if not data.get("ads"):
        return "❌ Binance P2P không có quảng cáo phù hợp."
    t = datetime.fromtimestamp(data["updated_at"], timezone(timedelta(hours=7)))
    lines = [f"💵 <b>Giá mua USDT bằng VND</b> (Binance P2P, lệnh ≥{vnd(data['min_amount'])} ₫)", ""]
    for i, ad in enumerate(data["ads"], 1):
        lines.append(f"{i}. <b>{vnd(ad['price'])} ₫</b> · {esc(ad['merchant'])}")
        rate = f"{ad['finish_rate'] * 100:.1f}".replace(".", ",")
        lines.append(f"    {vnd(ad['orders'])} lệnh/30 ngày · {rate}% hoàn thành")
        lines.append(f"    Hạn mức {vnd(ad['min'])} – {vnd(ad['max'])} ₫ · còn {vnd(ad['available'])} USDT")
    lines.append("")
    lines.append(f"🕒 {t:%H:%M %d/%m}")
    return "\n".join(lines)

def handle_update(update):
    message = update.get("message") or update.get("edited_message")
    if not message: return
    chat_id = message.get("chat", {}).get("id")
    text = (message.get("text") or "").strip()
    if not text: return
    user_id = str(message.get("from", {}).get("id", ""))

    # /id luôn trả lời, để người chưa có quyền lấy ID gửi cho admin thêm vào TELEGRAM_ALLOWED_IDS.
    if text.lower().split("@")[0] == "/id":
        send_message(chat_id, f"🆔 Telegram ID của bạn: <code>{esc(user_id)}</code>")
        return

    if ALLOWED_IDS and user_id not in ALLOWED_IDS:
        send_message(chat_id, f"⛔ Bạn chưa được phép dùng bot này. ID của bạn: <code>{esc(user_id)}</code>")
        return

    if text.startswith("/start") or text.startswith("/help"):
        send_message(chat_id, HELP_TEXT)
        return

    if text.lower().split("@")[0] in ("p2p", "/p2p"):
        send_message(chat_id, format_p2p())
        return

    lines = [l.strip() for l in text.split("\n") if l.strip()]
    if len(lines) > 1 or detect_system(lines[0]) is not None:
        codes = lines[:20]
        replies = []
        for code in codes:
            if detect_system(code) is None: continue
            replies.append(format_result(lookup_order(code)))
        send_message(chat_id, "\n\n".join(replies) if replies else HELP_TEXT)
        return

class handler(BaseHTTPRequestHandler):
    def _ok(self):
        body = b'{"ok":true}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self): self._ok()

    def do_POST(self):
        # Telegram gửi kèm secret_token đã đặt khi setWebhook; sai/thiếu = request giả mạo, bỏ qua.
        if WEBHOOK_SECRET and self.headers.get("X-Telegram-Bot-Api-Secret-Token") != WEBHOOK_SECRET:
            self.send_response(401)
            self.end_headers()
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b"{}"
            update = json.loads(raw.decode("utf-8") or "{}")
            handle_update(update)
        except: pass
        self._ok()
