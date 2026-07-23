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
    "lead_cccd",
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
    "Số CCCD",
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
    "lead_cccd",
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
        details["lead_cccd"] = lead.get("cccd", "")
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

    def _run_with_relogin(self, builder, code):
        """Chạy 1 hàm builder(code) -> dict, tự đăng nhập/re-login khi cần (thread-safe)."""
        with self._lock:
            if not self.token and not self.login():
                d = empty_details()
                d["status_msg"] = "Không đăng nhập được (thiếu LOGIN_EMAIL/LOGIN_PASSWORD?)"
                return d

        result = builder(code)
        if result == UNAUTHORIZED:
            with self._lock:
                relogged = self.login()
            if relogged:
                result = builder(code)
            else:
                d = empty_details()
                d["status_msg"] = "Không thể làm mới token"
                return d
        if result == UNAUTHORIZED:
            d = empty_details()
            d["status_msg"] = "Token hết hạn (401/403)"
            return d
        return result

    def lookup(self, order_code):
        """Tra cứu 1 đơn, tự đăng nhập và refresh token khi cần (thread-safe)."""
        return self._run_with_relogin(self._build_details, order_code)

    def _fetch_all_orders(self, page_limit=1000, date_from=None, date_to=None, status=None):
        """Tải toàn bộ đơn hàng của hệ thống (phân trang), dùng cho tra ngược hàng loạt.

        date_from, date_to: chuỗi "YYYY-MM-DD" (khớp tham số dateFrom/dateTo của
        API admin/orders). Nếu truyền vào, server tự lọc theo khoảng ngày - giảm
        hẳn dữ liệu phải tải, thay vì lấy toàn bộ lịch sử đơn hàng.
        status: bộ lọc trạng thái đơn hàng (VD "new"), tùy chọn - CHƯA xác nhận
        cùng tên/giá trị giữa 10X và Solobiz, nên mặc định để trống (không lọc)
        trừ khi bạn đã kiểm tra kỹ giá trị phù hợp cho từng hệ thống.

        KHÁC với _fetch_orders (search theo 'q', chỉ trả 1 đơn) - hàm này lấy hết
        (trong khoảng ngày, nếu có) để dựng map tra cứu 1 lần cho nhiều số hóa đơn.
        Trả về: list[dict] đơn hàng, hoặc UNAUTHORIZED, hoặc None nếu lỗi kết nối.
        """
        base_url = self.config["orders_url"].split("?")[0]
        headers = {"Authorization": self.token or "", "Origin": self.config["origin_orders"]}
        all_data = []
        page = 1
        while True:
            params = {"page": page, "limit": page_limit}
            if date_from:
                params["dateFrom"] = date_from
            if date_to:
                params["dateTo"] = date_to
            if status:
                params["status"] = status
            try:
                resp = self.session.get(
                    base_url, params=params,
                    headers=headers, timeout=REQUEST_TIMEOUT,
                )
            except requests.exceptions.RequestException:
                return None
            if resp.status_code in (401, 403):
                return UNAUTHORIZED
            if resp.status_code != 200:
                return None

            payload = resp.json()
            page_data = payload.get("data", [])
            all_data.extend(page_data)
            total = payload.get("total", len(page_data))
            if not page_data or page * page_limit >= total:
                break
            page += 1
        return all_data

    def _build_batch_reverse(self, invoice_numbers, date_from=None, date_to=None, status=None):
        """Fetch đơn hàng trong khoảng ngày (nếu có) ĐÚNG 1 LẦN, dựng map
        invoice_number -> order, rồi tra cứu ngược cho cả danh sách số hóa đơn.
        """
        all_orders = self._fetch_all_orders(date_from=date_from, date_to=date_to, status=status)
        if all_orders is None:
            return None
        if all_orders == UNAUTHORIZED:
            return UNAUTHORIZED

        index = {}
        for order in all_orders:
            einvoice = order.get("einvoice") or {}
            inv_no = str(einvoice.get("invoice_number", "")).strip()
            if inv_no:
                index[inv_no] = order

        results = {}
        for inv_no in invoice_numbers:
            key = str(inv_no).strip()
            details = empty_details()
            order = index.get(key)
            if order is None:
                details["order_code"] = ""
                details["status_msg"] = "Không tìm thấy đơn hàng khớp số hóa đơn này"
            else:
                lead = order.get("lead") or {}
                item = order.get("item") or {}
                details["order_code"] = order.get("code", "")
                details["lead_email"] = lead.get("email", "")
                details["lead_phone"] = lead.get("phone", "")
                details["lead_cccd"] = lead.get("cccd", "")
                details["lead_name"] = lead.get("name", "")
                details["orders_amount"] = order.get("amount", "")
                details["ref_username"] = order.get("ref_username", "")
                details["commission_rate"] = order.get("commissionRate", "")
                details["hoahong"] = order.get("hoahong", "")
                details["item_id"] = item.get("id", "")
                details["item_title"] = item.get("title", "")
                einvoice = order.get("einvoice") or {}
                details["einvoice_created_at"] = einvoice.get("created_at", "")
                details["invoice_number"] = einvoice.get("invoice_number", "")
                details["status_msg"] = "Thành công"
            results[inv_no] = details
        return results

    def reverse_lookup_batch(self, invoice_numbers, date_from=None, date_to=None, status=None):
        """Tra ngược hàng loạt số hóa đơn -> mã đơn hàng, tự đăng nhập/refresh token (thread-safe).

        invoice_numbers: list[str]. date_from/date_to: "YYYY-MM-DD" (tùy chọn) để
        giới hạn phạm vi fetch đơn hàng, giảm dữ liệu tải về. status: bộ lọc
        trạng thái đơn hàng (tùy chọn, xem docstring _fetch_all_orders).
        Trả về dict {invoice_number: details} nếu thành công, hoặc None nếu lỗi
        kết nối/không đăng nhập được (khác None nghĩa là đã có kết quả, kể cả khi
        từng số không tìm thấy đơn khớp).
        """
        with self._lock:
            if not self.token and not self.login():
                return None

        result = self._build_batch_reverse(invoice_numbers, date_from=date_from, date_to=date_to, status=status)
        if result == UNAUTHORIZED:
            with self._lock:
                relogged = self.login()
            if not relogged:
                return None
            result = self._build_batch_reverse(invoice_numbers, date_from=date_from, date_to=date_to, status=status)
        if result == UNAUTHORIZED or result is None:
            return None
        return result

    def _build_user_details(self, code):
        """Tra cứu trực tiếp theo mã KH (SA...) qua API Users, không qua Orders."""
        details = empty_details()

        users_response = self._fetch_users(code)
        if users_response is None:
            details["status_msg"] = "Lỗi kết nối API Users"
            return details
        if users_response.status_code in (401, 403):
            return UNAUTHORIZED
        if users_response.status_code != 200:
            details["status_msg"] = f"Lỗi API Users: {users_response.status_code}"
            return details

        users_data = users_response.json().get("data", [])
        if not users_data:
            details["status_msg"] = "Không tìm thấy mã KH"
            return details

        user = users_data[0]
        details["lead_email"] = user.get("email", "")
        details["lead_phone"] = user.get("phone", "")
        details["lead_cccd"] = user.get("cccd", "")
        details["username"] = user.get("code", "")
        details["users_name"] = user.get("name", "")
        details["ref_username"] = user.get("ref_username", "")

        if details["ref_username"] and details["ref_username"].startswith("SA"):
            details["ref_name"] = self._lookup_ref_name(details["ref_username"])

        details["status_msg"] = "Thành công"
        return details

    def lookup_user_by_code(self, code):
        """Tra cứu 1 mã KH (SA...) trực tiếp theo Username, tự đăng nhập khi cần (thread-safe)."""
        return self._run_with_relogin(self._build_user_details, code)


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


def reverse_lookup_orders_by_invoices(invoice_numbers, date_from=None, date_to=None, status=None):
    """Điểm vào chính: nhận danh sách số hóa đơn -> dict tra ngược mã đơn hàng.

    Dùng khi cần tra nhiều số hóa đơn cùng lúc (VD 100-300 số theo 1 khoảng ngày).
    Mỗi hệ thống (10X, Solobiz) chỉ fetch đơn hàng ĐÚNG 1 LẦN rồi tra map ngược
    cho tất cả số hóa đơn trong danh sách - không lặp gọi API theo từng số.

    invoice_numbers: list[str] các số hóa đơn cần tra.
    date_from, date_to: "YYYY-MM-DD" (khuyến nghị luôn truyền vào) - giới hạn
    server chỉ trả đơn hàng trong khoảng ngày này, nhẹ hơn hẳn so với fetch toàn
    bộ lịch sử. Nên bao trùm rộng hơn khoảng ngày lập hóa đơn 1-2 ngày để tránh
    lệch múi giờ/ngày ghi nhận giữa 2 hệ thống.
    status: bộ lọc trạng thái đơn hàng (VD "new"), tùy chọn - CHƯA xác nhận cùng
    tên/giá trị giữa 10X và Solobiz nên để mặc định None (không lọc) trừ khi đã
    kiểm tra kỹ, tránh vô tình loại bỏ đơn hợp lệ có trạng thái khác.
    Trả về: dict { invoice_number: {..."order_code", "system", "status_msg"...} }
    """
    invoice_numbers = [str(n).strip() for n in (invoice_numbers or []) if str(n).strip()]
    if not invoice_numbers:
        return {}

    remaining = set(invoice_numbers)
    final = {}

    for system_name in ("10X", "SOLOBIZ"):
        if not remaining:
            break
        batch_result = get_client(system_name).reverse_lookup_batch(
            list(remaining), date_from=date_from, date_to=date_to, status=status
        )
        if not isinstance(batch_result, dict):
            # Lỗi kết nối/đăng nhập ở hệ thống này - bỏ qua, vẫn thử hệ thống còn lại
            continue
        for inv_no, details in batch_result.items():
            if inv_no in remaining and details.get("status_msg") == "Thành công":
                details["system"] = system_name
                final[inv_no] = details
                remaining.discard(inv_no)

    for inv_no in remaining:
        d = empty_details()
        d["order_code"] = ""
        d["system"] = ""
        d["status_msg"] = "Không tìm thấy đơn hàng khớp số hóa đơn này ở cả 2 hệ thống (10X & Solobiz)"
        final[inv_no] = d

    return final


def lookup_customer(code, sa_system=None):
    """Điểm vào cho "Tra cứu hàng loạt" mở rộng: nhận mã đơn (DH/BIZ) HOẶC mã KH (SA...).

    - DH...  -> tra cứu đơn hàng bên 10X (giống lookup_order).
    - BIZ... -> tra cứu đơn hàng bên SOLOBIZ (giống lookup_order).
    - SA...  -> tra cứu trực tiếp mã KH (Username) qua API Users. Vì cả 2 hệ thống
      đều dùng chung định dạng mã SA..., bắt buộc truyền sa_system ("10X" hoặc
      "SOLOBIZ") để biết tra cứu ở hệ thống nào.
    """
    code = (code or "").strip()
    up = code.upper()

    if up.startswith("DH"):
        result = get_client("10X").lookup(code)
        result["order_code"] = code
        result["system"] = "10X"
        return result

    if up.startswith("BIZ"):
        result = get_client("SOLOBIZ").lookup(code)
        result["order_code"] = code
        result["system"] = "SOLOBIZ"
        return result

    if up.startswith("SA"):
        if sa_system not in ("10X", "SOLOBIZ"):
            d = empty_details()
            d["order_code"] = code
            d["system"] = ""
            d["status_msg"] = "Mã SA... cần chọn hệ thống (10X hoặc SOLOBIZ) trước khi tra cứu"
            return d
        result = get_client(sa_system).lookup_user_by_code(code)
        result["order_code"] = code
        result["system"] = sa_system
        return result

    d = empty_details()
    d["order_code"] = code
    d["system"] = ""
    d["status_msg"] = "Mã không hợp lệ (phải bắt đầu bằng DH, BIZ hoặc SA)"
    return d
