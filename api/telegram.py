"""Webhook Telegram cho bot @sepaycheckbot.

Nhận update từ Telegram, tự động phân phối xử lý:
- Mã đơn hàng (DH… / BIZ…) -> Tra cứu đơn hệ thống nội bộ.
- Từ khóa/Mã phim -> Tra cứu luồng stream phim (MissAV).
"""
import json
import os
import sys
import urllib.request
import urllib.parse
from http.server import BaseHTTPRequestHandler

sys.path.append(os.path.dirname(__file__))
from _core import lookup_order, detect_system  # noqa: E402
from _missav import search_missav, get_movie_detail, get_category_list  # Import đầy đủ các hàm cần thiết

VERCEL_DOMAIN = "https://sepay-order-lookup.vercel.app"
TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
ALLOWED_IDS = set(
    x.strip() for x in os.environ.get("TELEGRAM_ALLOWED_IDS", "").split(",") if x.strip()
)
WEBHOOK_SECRET = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "")

# Danh sách menu cấu hình
CATEGORIES = [
    {'slug': 'vi/today-hot', 'title': '🔥 Hot Hôm Nay'},
    {'slug': 'vi/weekly-hot', 'title': '📅 Hot Trong Tuần'},
    {'slug': 'vi/monthly-hot', 'title': '📆 Hot Trong Tháng'},
    {'slug': 'vi/uncensored-leak', 'title': '🔞 Không Che'},
    {'slug': 'vi/release', 'title': '🆕 Mới Cập Nhật'}
]

HELP_TEXT = (
    "👋 <b>Bot tích hợp Đơn hàng & Giải trí</b>\n\n"
    "<b>1. Tra cứu đơn hàng:</b>\n"
    "• Gửi mã <code>DH18700</code> (Hệ thống 10X)\n"
    "• Gửi mã <code>BIZ02120</code> (Hệ thống SOLOBIZ)\n"
    "<i>(Có thể gửi nhiều mã đơn hàng, mỗi mã một dòng)</i>\n\n"
    "<b>2. Tra cứu phim:</b>\n"
    "• Gửi lệnh <code>/menu</code> để hiển thị các danh mục phim Hot.\n"
    "• Gửi trực tiếp mã phim (Ví dụ: <code>snos-056</code>) để lấy link xem.\n"
    "• Gửi từ khóa bất kỳ để tìm kiếm danh sách phim."
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


def show_main_menu(chat_id):
    keyboard = {"inline_keyboard": []}
    for cat in CATEGORIES:
        keyboard["inline_keyboard"].append([
            {"text": cat['title'], "callback_data": f"cat_{cat['slug']}"}
        ])
    tg_call("sendMessage", {
        "chat_id": chat_id, 
        "text": "🍿 <b>Chọn danh mục phim để xem danh sách:</b>", 
        "parse_mode": "HTML",
        "reply_markup": keyboard
    })


def esc(s):
    return (str(s or "")
            .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def format_result(d):
    if d.get("status_msg") != "Thành công":
        return f"❌ <b>{esc(d.get('order_code'))}</b>: {esc(d.get('status_msg'))}"

    try:
        amount = float(d.get('orders_amount') or 0)
        formatted_amount = f"{amount:,.0f}".replace(",", ".")
    except (ValueError, TypeError):
        formatted_amount = d.get('orders_amount')

    lines = [
        f"✅ <b>{esc(d.get('order_code'))}</b> ({esc(d.get('system'))})",
        f"📧 Email KH: <code>{esc(d.get('lead_email'))}</code>",
        f"📞 SĐT KH: <code>{esc(d.get('lead_phone'))}</code>",
        f"👤 Username: <code>{esc(d.get('username'))}</code>",
        f"🧑 Họ tên: {esc(d.get('users_name'))}",
        f"💰 Số tiền: {esc(formatted_amount)}",
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
    # 1. Xử lý Callback Query (Khi bấm nút danh mục phim)
    if "callback_query" in update:
        query = update["callback_query"]
        chat_id = query["message"]["chat"]["id"]
        data = query["data"]
        
        if data.startswith("cat_"):
            slug = data.replace("cat_", "")
            # --- CHUYỂN LÊN ĐÂY: Tắt vòng xoay loading của nút bấm ngay lập tức ---
            tg_call("answerCallbackQuery", {"callback_query_id": query["id"]})
            movies = get_category_list(slug)
            
            # Lấy tiêu đề danh mục hiển thị cho đẹp
            cat_title = next((c['title'] for c in CATEGORIES if c['slug'] == slug), "Danh sách phim")
            
            if movies:
                text = f"<b>{cat_title} (Top 10):</b>\n"
                for m in movies:
                    text += f"\n• <code>{m['code']}</code>\n  👉 {esc(m['title'])}\n"
            else:
                text = "⚠️ Hệ thống không lấy được danh sách phim từ danh mục này. Vui lòng thử lại sau!"
            
            tg_call("answerCallbackQuery", {"callback_query_id": query["id"]})
            send_message(chat_id, text)
        return

    # 2. Xử lý tin nhắn văn bản thông thường
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

    # Thêm điều kiện bắt lệnh gõ /menu để gọi danh mục
    if text.lower() == "/menu":
        show_main_menu(chat_id)
        return

    # Phân tách dòng tin nhắn để kiểm tra danh sách mã đơn hàng
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    
    # Trường hợp 1: Nhập nhiều dòng HOẶC dòng đầu tiên khớp định dạng mã đơn hàng nội bộ (SePay)
    if len(lines) > 1 or detect_system(lines[0]) is not None:
        codes = lines[:20]
        replies = []
        for code in codes:
            if detect_system(code) is None:
                replies.append(f"⚠️ <b>{esc(code)}</b>: mã không hợp lệ (phải bắt đầu bằng DH/BIZ)")
                continue
            replies.append(format_result(lookup_order(code)))
        send_message(chat_id, "\n\n".join(replies) if replies else HELP_TEXT)
        return

    # Trường hợp 2: Tin nhắn đơn dòng và KHÔNG PHẢI mã đơn hàng -> Xử lý luồng phim tĩnh
    target = lines[0]
    
    # Thử quét chi tiết phim trực tiếp (Đã sửa thụt lề chuẩn vào trong IF)
    movie_detail = get_movie_detail(target)
    if movie_detail:
        stream_url = movie_detail['stream_url']
        # Tạo URL cho Mini App, mã hóa đường link m3u8 sạch
        web_app_url = f"{VERCEL_DOMAIN}/player.html?vid={urllib.parse.quote(stream_url)}"
        
        reply = f"🎬 <b>{esc(movie_detail['title'])}</b>\n\nPhim đã sẵn sàng. Nhấn nút bên dưới để xem!"
        
        # Tạo nút Mini App
        keyboard = {
            "inline_keyboard": [[
                {"text": "▶️ Xem Phim (Mini App)", "web_app": {"url": web_app_url}}
            ]]
        }
        
        tg_call("sendMessage", {
            "chat_id": chat_id, 
            "text": reply, 
            "parse_mode": "HTML",
            "reply_markup": keyboard
        })
        return

    # Nếu không phải mã phim trực tiếp, tiến hành tìm kiếm danh sách theo từ khóa
    search_results = search_missav(target)
    if search_results:
        output_lines = [f"🔍 <b>Kết quả tìm kiếm phim cho: {esc(target)}</b>\n"]
        for res in search_results[:8]:  # Giới hạn hiển thị 8 kết quả phù hợp nhất
            short_code = res['slug'].replace("vi/", "")
            output_lines.append(f"• <b>{esc(res['code'])}</b> - {esc(res['title'])}\n  👉 <i>Gửi lại mã:</i> <code>{short_code}</code>")
        send_message(chat_id, "\n".join(output_lines))
    else:
        send_message(chat_id, f"⚠️ Hệ thống không tìm thấy đơn hàng hoặc dữ liệu phim tương ứng với: <b>{esc(target)}</b>")


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
        if WEBHOOK_SECRET:
            got = self.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
            if got != WEBHOOK_SECRET:
                self._ok()
                return
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b"{}"
            update = json.loads(raw.decode("utf-8") or "{}")
            handle_update(update)
        except Exception:
            pass
        self._ok()
