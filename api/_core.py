"""Core logic tra cứu đơn hàng dùng chung cho các serverless function.

Khác với bản CLI: token được cache trong bộ nhớ (module-global) thay vì ghi
file .txt, vì filesystem của Vercel là read-only và mỗi lần gọi là stateless.
Thông tin đăng nhập lấy từ Environment Variables.
"""
import os
import threading

import requests

REQUEST_TIMEOUT = 15

LOGIN_EMAIL = os.environ.get("LOGIN_EMAIL", "")
LOGIN_PASSWORD = os.environ.get("LOGIN_PASSWORD", "")

# Mật khẩu bảo vệ truy cập app. Nếu để trống -> app mở công khai (không khuyến nghị).
APP_ACCESS_TOKEN = os.environ.get("APP_ACCESS_TOKEN", "")

BASE_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0)"

SYSTEMS_CONFIG = {
    "10X": {
        "login_url": "https://10xtrading.net/api/auth/login",
        "orders_url": "https://10xtrading.net/api/admin/orders?q={}&limit=1",
        "users_url": "https://10xtrading.net/api/admin/users?page=1&limit=20&q={}",
        "origin_login": "https://10xtrading.net",
        "origin_orders": "https://10xtrading.net/admin/order",
        "origin_users": "https://10xtrading.net/admin/user",
        "referer_login": "https://10xtrading.net/",
    },
    "SOLOBIZ": {
        "login_url": "https://api.solobiz.academy/api/auth/login",
        "orders_url": "https://api.solobiz.academy/api/admin/orders?page=1&limit=20&q={}",
        "users_url": "https://api.solobiz.academy/api/admin/users?page=1&limit=20&q={}",
        "origin_login": "https://api.solobiz.academy",
        "origin_orders": "https://www.solobiz.academy",
        "origin_users": "https://www.solobiz.academy",
        "referer_login": "https://api.solobiz.academy/",
    },
}

UNAUTHORIZED = "UNAUTHORIZED"

# Thứ tự trường xuất ra (dùng cho cả JSON lẫn Excel).
FIELD_ORDER = [
    "lead_email",
    "lead_phone",
    "username",
    "users_name",
    "orders_amount",
    "einvoice_created_at",
    "invoice_number",
    "ref_username",
    "ref_name",
    "status_msg",
]

EXCEL_HEADERS = [
    "Mã Đơn (Cột A)",
    "Email KH",
    "SĐT KH",
    "Username",
    "Họ Tên",
    "Số Tiền",
    "Ngày TT",
    "Số Hóa Đơn",
    "Ref User",
    "Ref Tên",
    "Trạng thái Tool",
]
# Trường tương ứng với từng cột Excel (None = cột mã đơn gốc, ghi riêng).
EXCEL_FIELDS = [
    None,
    "lead_email",
    "lead_phone",
    "username",
    "users_name",
    "orders_amount",
    "einvoice_created_at",
    "invoice_number",
    "ref_username",
    "ref_name",
    "status_msg",
]


def empty_details():
    return {f: "" for f in FIELD_ORDER}


def detect_system(order_code):
    up = order_code.upper()
    if up.startswith("DH"):
        return "10X"
    if up.startswith("BIZ"):
        return "SOLOBIZ"
    return None


def check_access(provided_token):
    """True nếu được phép truy cập. App mở nếu APP_ACCESS_TOKEN trống."""
    if not APP_ACCESS_TOKEN:
        return True
    return provided_token == APP_ACCESS_TOKEN


class SepayClient:
    """Client cho mỗi hệ thống, tái sử dụng kết nối và cache token in-memory."""

    def __init__(self, system_name):
        self.system_name = system_name
        self.config = SYSTEMS_CONFIG[system_name]
        self.token = None
        self._ref_cache = {}
        self._lock = threading.Lock()
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": BASE_USER_AGENT,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "vi",
            "Connection": "keep-alive",
        })

    def login(self):
        if not LOGIN_EMAIL or not LOGIN_PASSWORD:
            return False
        headers = {
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json",
            "Origin": self.config["origin_login"],
            "Referer": self.config["referer_login"],
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15)",
        }
        payload = {"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD}
        try:
            resp = requests.post(
                self.config["login_url"], json=payload, headers=headers, timeout=REQUEST_TIMEOUT
            )
            resp.raise_for_status()
            data = resp.json()
            token = (data.get("data") or {}).get("access_token") if data.get("status") == 200 else None
            if token:
                self.token = f"Bearer {token}"
                self._ref_cache.clear()
                return True
        except Exception:
            pass
        return False

    def _get(self, url, origin):
        headers = {"Authorization": self.token or "", "Origin": origin}
        try:
            return self.session.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        except requests.exceptions.RequestException:
            return None

    def _fetch_orders(self, order_code):
        return self._get(self.config["orders_url"].format(order_code), self.config["origin_orders"])

    def _fetch_users(self, query_string):
        return self._get(self.config["users_url"].format(query_string), self.config["origin_users"])

    def _lookup_ref_name(self, ref_username):
        if ref_username in self._ref_cache:
            return self._ref_cache[ref_username]
        name = ""
        resp = self._fetch_users(ref_username)
        if resp is not None and resp.status_code == 200:
            ref_data = resp.json().get("data", [])
            if ref_data:
                name = ref_data[0].get("name", "")
        self._ref_cache[ref_username] = name
        return name

    def _build_details(self, order_code):
        details = empty_details()

        orders_response = self._fetch_orders(order_code)
        if orders_response is None:
            details["status_msg"] = "Lỗi kết nối API Orders"
            return details
        if orders_response.status_code in (401, 403):
            return UNAUTHORIZED
        if orders_response.status_code != 200:
            details["status_msg"] = f"Lỗi API Orders: {orders_response.status_code}"
            return details

        orders_data = orders_response.json().get("data", [])
        if not orders_data:
            details["status_msg"] = "Không tìm thấy mã đơn hàng"
            return details

        order = orders_data[0]
        lead = order.get("lead") or {}
        details["lead_email"] = lead.get("email", "")
        details["lead_phone"] = lead.get("phone", "")
        details["orders_amount"] = order.get("amount", "")

        einvoice = order.get("einvoice") or {}
        details["einvoice_created_at"] = einvoice.get("created_at", "")
        details["invoice_number"] = einvoice.get("invoice_number", "")

        if not details["lead_email"]:
            details["status_msg"] = "Đơn hàng rỗng/Không có email"
            return details

        users_response = self._fetch_users(details["lead_email"])
        if users_response is None or users_response.status_code != 200:
            details["status_msg"] = "Lỗi khi tra cứu User"
            return details

        users_data = users_response.json().get("data", [])
        if not users_data:
            details["status_msg"] = "Không tìm thấy User theo email"
            return details

        user = users_data[0]
        details["username"] = user.get("code", "")
        details["users_name"] = user.get("name", "")
        details["ref_username"] = user.get("ref_username", "")

        if details["ref_username"] and details["ref_username"].startswith("SA"):
            details["ref_name"] = self._lookup_ref_name(details["ref_username"])

        details["status_msg"] = "Thành công"
        return details

    def lookup(self, order_code):
        """Tra cứu 1 đơn, tự đăng nhập và refresh token khi cần (thread-safe)."""
        with self._lock:
            if not self.token and not self.login():
                d = empty_details()
                d["status_msg"] = "Không đăng nhập được (thiếu LOGIN_EMAIL/LOGIN_PASSWORD?)"
                return d

        result = self._build_details(order_code)
        if result == UNAUTHORIZED:
            with self._lock:
                relogged = self.login()
            if relogged:
                result = self._build_details(order_code)
            else:
                d = empty_details()
                d["status_msg"] = "Không thể làm mới token"
                return d
        if result == UNAUTHORIZED:
            d = empty_details()
            d["status_msg"] = "Token hết hạn (401/403)"
            return d
        return result


# Cache client giữa các lần gọi warm invocation.
_clients = {}
_clients_lock = threading.Lock()


def get_client(system_name):
    with _clients_lock:
        if system_name not in _clients:
            _clients[system_name] = SepayClient(system_name)
        return _clients[system_name]


def lookup_order(order_code):
    """Điểm vào chính: nhận mã đơn -> dict kết quả (kèm system & order_code)."""
    order_code = (order_code or "").strip()
    system_name = detect_system(order_code)
    if system_name is None:
        d = empty_details()
        d["status_msg"] = "Mã không hợp lệ (phải bắt đầu bằng DH hoặc BIZ)"
        d["order_code"] = order_code
        d["system"] = ""
        return d

    result = get_client(system_name).lookup(order_code)
    result["order_code"] = order_code
    result["system"] = system_name
    return result
