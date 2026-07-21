"""
Module tra cứu Hóa đơn điện tử (hoadondientu.gdt.gov.vn).
Dùng bởi action "gdt_invoice" trong index.py.

Hàm chính: lookup_gdt_invoices(username, password, start_date, end_date, is_purchase)
Trả về dict:
  - Thành công: {"count": N, "invoices": [...], "warnings": [...], "chunks_processed": M}
  - Thất bại:   {"error": "..."}

LƯU Ý BẢO MẬT: username/password của GDT chỉ tồn tại trong biến cục bộ của lần gọi này,
KHÔNG được log, KHÔNG được lưu vào bất kỳ đâu (file, DB, biến toàn cục...).
"""
import re
import time
import calendar
from datetime import datetime, timedelta

import requests

DOMAIN = "https://hoadondientu.gdt.gov.vn"
BASE_API = f"{DOMAIN}/api"
CAPTCHA_URL = f"{BASE_API}/captcha"
LOGIN_URL = f"{BASE_API}/security-taxpayer/authenticate"

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

# Giới hạn an toàn cho môi trường serverless: tránh 1 request chạy quá lâu / vượt timeout của Vercel.
MAX_PAGES_PER_TYPE = 40
PAGE_SIZE = 50

WRONG_CREDENTIAL_KEYWORDS = [
    "mật khẩu", "password", "tài khoản", "sai tên đăng nhập",
    "không tồn tại", "invalid", "unauthorized", "incorrect"
]

# ==========================================
# GIẢI MÃ SVG CAPTCHA
# ==========================================
def get_captcha_dictionary():
    signatures_list = [
        "MQQQQQZMQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQQZMQQZ", "MQQQQQQQQQZMQQQQQQZMQQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQZMQQQQQQQQZMQQQQQQQQZ",
        "MQQQQQQQQQQQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQQQQQQQQZ", "MQQQQQQQQZMQQQQQQQQQQZMQQQQQQQQQQQQQQQZMQQQQQQQZ",
        "MQQQQQQQQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQQQQQQQQQQQZ", "MQQQQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQQQQQZ",
        "MQQQQQQQQQQQQQQQQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQZ", "MQQQQQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQQQQQQQQZ",
        "", "MQQQQQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQZ", "MQQQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQQQQZ", "",
        "MQQQQQQQQQQQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQQQQQQQQQZ", "MQQQQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQQZ", "",
        "MQQQQQQZMQQQQQQQQQQZMQQQQQQQQQQQQQQQZMQQQQQQQQZ", "MQQQQQQQQQQQQQQQZMQQQQQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQQQQQQZMQQQQQQQQQQQQZ",
        "MQQQQQQZMQQQQQQQQQQQQZMQQQQQQQQQQQQQQQZMQQQQQQQQZ", "MQQQQQQQQQQQQQQQQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQZ",
        "MQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQQQZ", "", "MQQQQQQQQQQZMQQQQQQQQQQQQQQQQZ",
        "MQQQQQQQQQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQQQQQQQQQQQZ", "MQQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQQQQZ",
        "MQQQQQQQQQZMQQQQQQQQQQQQQZ", "MQQQQQQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQQQQQZ", "", "",
        "MQQQQQQQQQQQQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQQQQQQQQQQQQQZ", "MQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQZ",
        "MQQQQZMQQQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQQQQZMQQQQQZ", "MQQQQQQQQQQQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQZ",
        "MQQQQQQQQQZMQQQQQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQQQQQZMQQQQQQQQZ", "MQQQQQQQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQQQQQQZ",
        "MQQQQQQQQZMQQQQQQQZMQQQQQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQQQQQZMQQQQQQQQQZMQQQQQQQZ", "MQQQQQQQQZMQQQQQQQQQQQQQQQQQZMQQQQQQQQQQQQQQQQQQQQZMQQQQQQQQQQQZ"
    ]
    return {sig: chr(idx + 65) if idx <= 25 else str(idx - 26) for idx, sig in enumerate(signatures_list) if sig}


def detect_svg_captcha(svg_captcha: str) -> str:
    captcha_dict = get_captcha_dictionary()
    extracted_chars = []
    cmd_pattern = re.compile(r'([MQZ])([^MQZ]*)', re.IGNORECASE)
    number_pattern = re.compile(r'[-+]?\d*\.?\d+')

    for part in svg_captcha.split(' d="')[1:]:
        matches = cmd_pattern.findall(part.split('"')[0])
        if matches:
            shape_sig = "".join(m[0].upper() for m in matches)
            if shape_sig in captcha_dict:
                val_match = number_pattern.search(matches[0][1])
                x_coord = float(val_match.group()) if val_match else 0.0
                extracted_chars.append((x_coord, captcha_dict[shape_sig]))

    if not extracted_chars:
        return ""
    extracted_chars.sort(key=lambda item: item[0])
    return "".join(item[1] for item in extracted_chars)


# ==========================================
# SESSION / ĐĂNG NHẬP
# ==========================================
def make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": USER_AGENT,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": f"{DOMAIN}/",
        "Origin": DOMAIN,
    })
    return s


def login_tax_system(session: requests.Session, username: str, password: str, max_retries: int = 3):
    """Trả về (token, error_message). Thành công: (token, None). Thất bại: (None, "lý do")."""
    last_message = None
    empty_captcha_count = 0

    for attempt in range(1, max_retries + 1):
        try:
            resp_captcha = session.get(CAPTCHA_URL, timeout=10)
            try:
                c_data = resp_captcha.json()
            except Exception:
                return None, (
                    f"Không đọc được dữ liệu captcha từ máy chủ Thuế "
                    f"(HTTP {resp_captcha.status_code}, nội dung: {resp_captcha.text[:150]!r})."
                )

            raw_content = c_data.get("content", "")
            c_value = detect_svg_captcha(raw_content)
            if not c_value:
                empty_captcha_count += 1
                time.sleep(1)
                continue

            payload = {"username": username, "password": password, "cvalue": c_value, "ckey": c_data.get("key")}
            session.options(LOGIN_URL)
            resp_auth = session.post(LOGIN_URL, json=payload, headers={"Content-Type": "application/json"}, timeout=15)

            try:
                auth_data = resp_auth.json()
            except Exception:
                return None, (
                    f"Máy chủ Thuế trả về dữ liệu đăng nhập không hợp lệ "
                    f"(HTTP {resp_auth.status_code}, nội dung: {resp_auth.text[:150]!r})."
                )

            if "token" in auth_data:
                return auth_data["token"], None

            message = str(auth_data.get("message", "Unknown Error"))
            last_message = message
            message_lower = message.lower()
            if any(kw in message_lower for kw in WRONG_CREDENTIAL_KEYWORDS):
                return None, f"Sai tài khoản hoặc mật khẩu: {message}"

            time.sleep(1)  # có thể do captcha đoán sai -> thử lại

        except requests.exceptions.Timeout:
            last_message = "Timeout khi gọi máy chủ Thuế."
            time.sleep(1)
        except requests.exceptions.ConnectionError as e:
            last_message = f"Lỗi kết nối mạng: {e}"
            time.sleep(1)
        except Exception as e:
            return None, f"Lỗi không xác định khi đăng nhập: {e}"

    detail_parts = [f"Đăng nhập thất bại sau {max_retries} lần thử."]
    if last_message:
        detail_parts.append(f"Phản hồi gần nhất từ máy chủ Thuế: \"{last_message}\".")
    if empty_captcha_count:
        detail_parts.append(f"Không giải được captcha {empty_captcha_count}/{max_retries} lần.")
    return None, " ".join(detail_parts)


# ==========================================
# GỌI API DANH SÁCH HÓA ĐƠN
# ==========================================
def api_get(session: requests.Session, url: str, token: str, max_retries: int = 3):
    """Trả về (json_data, error_message). error_message=None nếu thành công."""
    headers = {"Authorization": f"Bearer {token}"}
    for attempt in range(1, max_retries + 1):
        try:
            resp = session.get(url, headers=headers, timeout=(10, 25))
            if resp.status_code in (401, 403):
                return None, f"Token hết hạn hoặc bị từ chối (HTTP {resp.status_code})."
            if resp.status_code == 429:
                time.sleep(3)
                continue
            if resp.status_code in (500, 504):
                time.sleep(2)
                continue
            resp.raise_for_status()
            return resp.json(), None
        except requests.exceptions.Timeout:
            time.sleep(2)
        except requests.exceptions.ConnectionError:
            time.sleep(2)
        except Exception as e:
            return None, str(e)
    return None, f"Không tải được dữ liệu sau {max_retries} lần thử: {url}"


def fetch_invoice_list(session: requests.Session, token: str, start_date: str, end_date: str, is_purchase: bool):
    """Trả về (invoices, warnings). Chỉ lấy DANH SÁCH (không gọi API chi tiết)."""
    url_type = "purchase" if is_purchase else "sold"

    query_configs = [
        {"url": f"{BASE_API}/query/invoices/{url_type}", "ttxly": 5, "loai": "Hóa đơn có mã CQT"},
        {"url": f"{BASE_API}/query/invoices/{url_type}", "ttxly": 6, "loai": "Hóa đơn không mã"},
        {"url": f"{BASE_API}/sco-query/invoices/{url_type}", "ttxly": 8, "loai": "Hóa đơn từ máy tính tiền"},
    ]

    invoices = []
    warnings = []

    for cfg in query_configs:
        state = ""
        page = 0
        while page < MAX_PAGES_PER_TYPE:
            page += 1
            search_param = f"tdlap=ge={start_date}T00:00:00;tdlap=le={end_date}T23:59:59;ttxly=={cfg['ttxly']}"
            query_string = f"?sort=tdlap:desc&size={PAGE_SIZE}&search={search_param}"
            if state:
                query_string += f"&state={state}"
            full_url = cfg["url"] + query_string

            data, err = api_get(session, full_url, token)
            if err:
                warnings.append(f"[{cfg['loai']}] {err}")
                break
            if not data:
                break

            datas = data.get("datas", [])
            if not datas:
                break

            for item in datas:
                invoices.append({
                    "loai": cfg["loai"],
                    "khhdon": item.get("khhdon"),
                    "shdon": item.get("shdon"),
                    "khmshdon": item.get("khmshdon"),
                    "nbmst": item.get("nbmst"),
                    "nbten": item.get("nbten"),
                    "tdlap": item.get("tdlap"),
                    "tgtttbso": item.get("tgtttbso"),
                })

            state = data.get("state")
            if not state:
                break

        if page >= MAX_PAGES_PER_TYPE:
            warnings.append(f"[{cfg['loai']}] Đã đạt giới hạn {MAX_PAGES_PER_TYPE} trang, có thể còn hóa đơn chưa lấy hết.")

    return invoices, warnings


# ==========================================
# HÀM CHÍNH - gọi từ index.py
# ==========================================
def lookup_gdt_invoices(username: str, password: str, start_date: str, end_date: str, is_purchase: bool = True) -> dict:
    try:
        start_dt = datetime.strptime(start_date, "%d/%m/%Y")
        end_dt = datetime.strptime(end_date, "%d/%m/%Y")
    except ValueError:
        return {"error": "Định dạng ngày phải là dd/mm/yyyy."}

    if start_dt > end_dt:
        return {"error": "'Từ ngày' phải trước hoặc bằng 'Đến ngày'."}

    # ---------------------------------------------------------
    # DATE CHUNKING: Chia nhỏ khoảng thời gian tối đa 1 tháng
    # Dùng thư viện chuẩn calendar và datetime thay vì dateutil
    # ---------------------------------------------------------
    date_chunks = []
    cursor = start_dt
    while cursor <= end_dt:
        # Lấy ngày cuối cùng của tháng thuộc biến cursor hiện tại
        last_day_of_month = calendar.monthrange(cursor.year, cursor.month)[1]
        end_of_month = cursor.replace(day=last_day_of_month)
        
        # Điểm kết thúc của chunk này là ngày cuối tháng hoặc end_dt (nếu end_dt đến sớm hơn)
        chunk_end = min(end_of_month, end_dt)
        
        date_chunks.append((
            cursor.strftime("%d/%m/%Y"), 
            chunk_end.strftime("%d/%m/%Y")
        ))
        
        # Tiến cursor sang ngày đầu tiên của tháng tiếp theo
        cursor = chunk_end + timedelta(days=1)

    # Đăng nhập vào hệ thống thuế
    session = make_session()
    token, err = login_tax_system(session, username, password)
    if not token:
        return {"error": err or "Đăng nhập thất bại."}

    all_invoices = []
    all_warnings = []

    # Lặp qua từng khoảng chunk (tối đa 1 tháng) để gọi API
    for i, (s_date, e_date) in enumerate(date_chunks):
        # Nghỉ nhẹ giữa các chunk nếu có nhiều chunk để tránh WAF block
        if i > 0:
            time.sleep(1)

        invoices, warnings = fetch_invoice_list(
            session, token,
            s_date, e_date,
            is_purchase
        )
        all_invoices.extend(invoices)
        
        # Gắn thêm nhãn thời gian vào warning để biết lỗi ở giai đoạn nào
        if warnings:
            all_warnings.extend([f"[{s_date} - {e_date}] {w}" for w in warnings])

    return {
        "count": len(all_invoices),
        "invoices": all_invoices,
        "warnings": all_warnings,
        "chunks_processed": len(date_chunks)
    }


# ==========================================
# CÁC HÀM CHIA NHỎ THEO BƯỚC 
# (Dùng khi frontend muốn kiểm soát luồng chạy theo từng trang)
# ==========================================

LOAI_MAP = {
    5: "Hóa đơn có mã CQT",
    6: "Hóa đơn không mã",
    8: "Hóa đơn từ máy tính tiền",
}


def gdt_login(username: str, password: str):
    """Chỉ thực hiện đăng nhập. Trả về (token, error_message)."""
    session = make_session()
    return login_tax_system(session, username, password)


def gdt_fetch_one_page(token: str, url_type: str, ttxly: int, state: str, start_date: str, end_date: str):
    """
    Lấy ĐÚNG 1 TRANG của ĐÚNG 1 LOẠI hóa đơn.
    Lưu ý: Nếu frontend dùng hàm này, frontend phải tự chia chunk ngày tháng
    và đảm bảo start_date đến end_date <= 31 ngày.
    """
    session = make_session()
    base_url = f"{BASE_API}/sco-query/invoices/{url_type}" if ttxly == 8 else f"{BASE_API}/query/invoices/{url_type}"

    search_param = f"tdlap=ge={start_date}T00:00:00;tdlap=le={end_date}T23:59:59;ttxly=={ttxly}"
    query_string = f"?sort=tdlap:desc&size={PAGE_SIZE}&search={search_param}"
    if state:
        query_string += f"&state={state}"
    full_url = base_url + query_string

    data, err = api_get(session, full_url, token)
    if err:
        return [], None, err
    if not data:
        return [], None, None

    datas = data.get("datas", [])
    invoices = []
    for item in datas:
        invoices.append({
            "loai": LOAI_MAP.get(ttxly, ""),
            "khhdon": item.get("khhdon"),
            "shdon": item.get("shdon"),
            "khmshdon": item.get("khmshdon"),
            "nbmst": item.get("nbmst"),
            "nbten": item.get("nbten"),
            "tdlap": item.get("tdlap"),
            "tgtttbso": item.get("tgtttbso"),
        })

    return invoices, data.get("state"), None
