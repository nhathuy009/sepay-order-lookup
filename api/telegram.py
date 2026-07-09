"""Webhook Telegram cho bot @sepaycheckbot."""
import json
import os
import sys
import urllib.request
import urllib.parse
from http.server import BaseHTTPRequestHandler

sys.path.append(os.path.dirname(__file__))
from _core import lookup_order, detect_system  
from _missav import search_missav, get_movie_detail, get_category_list  
from _subtitle import search_subtitle

VERCEL_DOMAIN = "https://nhathuy009.vercel.app"
TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
ALLOWED_IDS = set(x.strip() for x in os.environ.get("TELEGRAM_ALLOWED_IDS", "").split(",") if x.strip())
WEBHOOK_SECRET = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "")

CATEGORIES = [
    {'slug': 'vi/today-hot', 'title': '🔥 Hot Hôm Nay'},
    {'slug': 'vi/weekly-hot', 'title': '📅 Hot Trong Tuần'},
    {'slug': 'vi/monthly-hot', 'title': '📆 Hot Trong Tháng'},
    {'slug': 'vi/uncensored-leak', 'title': '🔞 Không Che'},
    {'slug': 'vi/release', 'title': '🆕 Mới Cập Nhật'}
]

HELP_TEXT = (
    "👋 <b>Bot tích hợp Đơn hàng & Giải trí</b>\n\n"
    "<b>1. Tra cứu đơn:</b> Gửi mã <code>DH18700</code> hoặc <code>BIZ02120</code>\n"
    "<b>2. Phim ảnh:</b>\n"
    "• Gõ <code>/menu</code> để xem danh sách Hot.\n"
    "• Gửi mã phim (VD: <code>snos-056</code>) để lấy link xem trực tiếp."
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

def show_main_menu(chat_id):
    keyboard = {"inline_keyboard": []}
    for cat in CATEGORIES:
        keyboard["inline_keyboard"].append([{"text": cat['title'], "callback_data": f"cat_{cat['slug']}"}])
    tg_call("sendMessage", {"chat_id": chat_id, "text": "🍿 <b>Danh mục phim:</b>", "parse_mode": "HTML", "reply_markup": keyboard})

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

def handle_update(update):
    if "callback_query" in update:
        query = update["callback_query"]
        chat_id = query["message"]["chat"]["id"]
        data = query["data"]
        
        if data.startswith("cat_"):
            slug = data.replace("cat_", "")
            movies = get_category_list(slug)
            cat_title = next((c['title'] for c in CATEGORIES if c['slug'] == slug), "Danh sách phim")
            if movies:
                text = f"<b>{cat_title} (Top 10):</b>\n"
                for m in movies: text += f"\n• <code>{m['code']}</code>\n  👉 {esc(m['title'])}\n"
            else:
                text = "⚠️ Hệ thống không lấy được danh sách."
            tg_call("answerCallbackQuery", {"callback_query_id": query["id"]})
            send_message(chat_id, text)
        return

    message = update.get("message") or update.get("edited_message")
    if not message: return
    chat_id = message.get("chat", {}).get("id")
    text = (message.get("text") or "").strip()
    if not text: return

    if text.startswith("/start") or text.startswith("/help"):
        send_message(chat_id, HELP_TEXT)
        return
    if text.lower() == "/menu":
        show_main_menu(chat_id)
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

    target = lines[0]
    movie_detail = get_movie_detail(target)
    
    if movie_detail:
        stream_url = movie_detail['stream_url']
        subtitle_url = movie_detail.get('subtitle_url', '')
        web_app_url = f"{VERCEL_DOMAIN}/player.html?vid={urllib.parse.quote(stream_url)}&sub={search_subtitle(code_clean.upper())}"
        reply = f"🎬 <b>{esc(movie_detail['title'])}</b>\n\nPhim đã sẵn sàng. Nhấn nút bên dưới để xem!"
        keyboard = {"inline_keyboard": [[{"text": "▶️ Xem Phim (Giao diện gốc)", "web_app": {"url": web_app_url}}]]}
        tg_call("sendMessage", {"chat_id": chat_id, "text": reply, "parse_mode": "HTML", "reply_markup": keyboard})
        return

    search_results = search_missav(target)
    if search_results:
        output_lines = [f"🔍 <b>Kết quả tìm kiếm cho: {esc(target)}</b>\n"]
        for res in search_results[:8]:
            short_code = res['slug'].replace("vi/", "")
            output_lines.append(f"• <b>{esc(res['code'])}</b>\n  👉 <i>Gửi mã:</i> <code>{short_code}</code>")
        send_message(chat_id, "\n".join(output_lines))
    else:
        send_message(chat_id, f"⚠️ Không tìm thấy: <b>{esc(target)}</b>")

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
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b"{}"
            update = json.loads(raw.decode("utf-8") or "{}")
            handle_update(update)
        except: pass
        self._ok()
