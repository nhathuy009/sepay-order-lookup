# Project Context: sepay-order-lookup

## Cấu trúc thư mục

```
sepay-order-lookup/
├── api
│   ├── _core.py
│   ├── _gdt_invoice.py
│   ├── _invoice.py
│   ├── _missav.py
│   ├── _payment.py
│   ├── _subtitle.py
│   ├── index.py
│   └── telegram.py
├── .env.example
├── .gitignore
├── ebook.html
├── gopcode.py
├── index.html
├── movies_data.json
├── player.html
├── player1.html
├── player2.html
├── PROJECT_CONTEXT.md
├── README.md
├── requirements.txt
└── vercel.json
```

## Nội dung file

### `.env.example`

```
# Sao chép thành .env (chạy local) hoặc đặt trong Vercel > Settings > Environment Variables.

# Thông tin đăng nhập hệ thống 10X/SOLOBIZ (BẮT BUỘC)
LOGIN_EMAIL=your-email-here
LOGIN_PASSWORD=your-password-here

# Mật khẩu bảo vệ truy cập web app (khuyến nghị đặt; để trống = app công khai)
APP_ACCESS_TOKEN=doi-thanh-mot-chuoi-bi-mat

# Tra cứu hóa đơn điện tử (tab "Tra cứu hóa đơn") — BẮT BUỘC nếu dùng chức năng này
EINVOICE_BASE_URL=https://xxxxxxxxxx.sepay-einvoice.com
EINVOICE_USERNAME=your-einvoice-username
EINVOICE_PASSWORD=your-einvoice-password
# Ký hiệu mẫu hóa đơn dùng để lọc khi gọi API, đổi nếu doanh nghiệp đổi mẫu/năm khác
EINVOICE_SERIAL=C26MSL


```

### `.gitignore`

```
__pycache__/
*.pyc
.env
.env.local
.vercel
node_modules/
SEPAY/
*.xlsx

```

### `api/_core.py`

```python
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

    def _fetch_all_users(self, page_limit=1000):
        """Tải toàn bộ user (phân trang), dùng để dựng map email -> username (mã KH)
        cho tra ngược hàng loạt. Cùng pattern với _fetch_all_orders, KHÁC với
        _fetch_users (search theo 'q', chỉ trả 1 user khớp).
        Trả về: list[dict] user, hoặc UNAUTHORIZED, hoặc None nếu lỗi kết nối.
        """
        base_url = self.config["users_url"].split("?")[0]
        headers = {"Authorization": self.token or "", "Origin": self.config["origin_users"]}
        all_data = []
        page = 1
        while True:
            try:
                resp = self.session.get(
                    base_url, params={"page": page, "limit": page_limit},
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

        # Fetch toàn bộ user 1 lần để dựng map email -> username (Mã KH), tái sử
        # dụng đúng nguồn dữ liệu mà "Tra cứu hàng loạt" (_build_details) dùng qua
        # API Users - nhưng ở đây lấy 1 lần cho cả lô, không lặp gọi theo từng KH.
        all_users = self._fetch_all_users()
        if all_users == UNAUTHORIZED:
            return UNAUTHORIZED
        email_to_username = {}
        if isinstance(all_users, list):
            for u in all_users:
                email = str(u.get("email", "")).strip()
                if email:
                    email_to_username[email] = u.get("code", "")

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
                details["username"] = email_to_username.get(str(lead.get("email", "")).strip(), "")
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

```

### `api/_gdt_invoice.py`

```python
"""
Module tra cứu Hóa đơn điện tử (hoadondientu.gdt.gov.vn).
Dùng bởi action "gdt_invoice" (lấy DANH SÁCH) và action "gdt_invoice_detail"
(lấy CHI TIẾT một hóa đơn cụ thể) trong index.py.

Hàm chính:
  - lookup_gdt_invoices(username, password, start_date, end_date, is_purchase)
      -> lấy danh sách hóa đơn trong khoảng ngày.
  - gdt_fetch_invoice_detail(username, password, invoice)
      -> lấy chi tiết đầy đủ (người mua/bán, hàng hóa dịch vụ, thuế suất...)
         của MỘT hóa đơn, dựa trên object hóa đơn đã có từ danh sách ở trên.

Trả về dict:
  - Thành công: {"count": N, "invoices": [...], "warnings": [...], "chunks_processed": M}
                hoặc {"detail": {...}} (đối với gdt_fetch_invoice_detail)
  - Thất bại:   {"error": "..."}

LƯU Ý BẢO MẬT: username/password của GDT chỉ tồn tại trong biến cục bộ của lần gọi này,
KHÔNG được log, KHÔNG được lưu vào bất kỳ đâu (file, DB, biến toàn cục...).
"""
import re
import time
import calendar
from datetime import datetime, timedelta
from urllib.parse import quote

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
            if resp.status_code == 404:
                return None, "Không tìm thấy hóa đơn này trên hệ thống Thuế (HTTP 404)."
            resp.raise_for_status()
            return resp.json(), None
        except requests.exceptions.Timeout:
            time.sleep(2)
        except requests.exceptions.ConnectionError:
            time.sleep(2)
        except Exception as e:
            return None, str(e)
    return None, f"Không tải được dữ liệu sau {max_retries} lần thử: {url}"


def fetch_invoices_of_type(session: requests.Session, token: str, start_date: str, end_date: str,
                            is_purchase: bool, ttxly: int):
    """
    Lấy toàn bộ hóa đơn của DUY NHẤT 1 loại (ttxly: 5, 6 hoặc 8) trong MỘT khoảng ngày
    (khoảng ngày này phải đã <= 1 tháng, việc chia chunk theo tháng do lớp gọi bên trên xử lý).
    Trả về (invoices, warnings).
    """
    url_type = "purchase" if is_purchase else "sold"
    base_url = f"{BASE_API}/sco-query/invoices/{url_type}" if ttxly == 8 else f"{BASE_API}/query/invoices/{url_type}"
    loai = LOAI_MAP.get(ttxly, "")

    invoices = []
    warnings = []
    state = ""
    page = 0
    while page < MAX_PAGES_PER_TYPE:
        page += 1
        search_param = f"tdlap=ge={start_date}T00:00:00;tdlap=le={end_date}T23:59:59;ttxly=={ttxly}"
        query_string = f"?sort=tdlap:desc&size={PAGE_SIZE}&search={search_param}"
        if state:
            query_string += f"&state={state}"
        full_url = base_url + query_string

        data, err = api_get(session, full_url, token)
        if err:
            warnings.append(err)
            break
        if not data:
            break

        datas = data.get("datas", [])
        if not datas:
            break

        for item in datas:
            invoices.append({
                "loai": loai,
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
        warnings.append(f"Đã đạt giới hạn {MAX_PAGES_PER_TYPE} trang, có thể còn hóa đơn chưa lấy hết.")

    return invoices, warnings


def fetch_invoice_list(session: requests.Session, token: str, start_date: str, end_date: str, is_purchase: bool):
    """Trả về (invoices, warnings). Lấy DANH SÁCH cả 3 loại hóa đơn (không gọi API chi tiết)."""
    invoices = []
    warnings = []

    for ttxly in (5, 6, 8):
        type_invoices, type_warnings = fetch_invoices_of_type(session, token, start_date, end_date, is_purchase, ttxly)
        invoices.extend(type_invoices)
        if type_warnings:
            loai = LOAI_MAP.get(ttxly, "")
            warnings.extend([f"[{loai}] {w}" for w in type_warnings])

    return invoices, warnings


# ==========================================
# HÀM CHÍNH - gọi từ index.py (action "gdt_invoice")
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
# TRA CỨU RIÊNG TỪNG LOẠI HÓA ĐƠN (dùng khi frontend muốn gọi 3 lần API
# tuần tự - mỗi loại trả kết quả về ngay, hiển thị luôn 1 bảng riêng thay vì
# phải chờ lấy xong cả 3 loại rồi mới trả 1 lần) - action "gdt_invoice_by_type"
# ==========================================
def lookup_gdt_invoices_by_type(username: str, password: str, start_date: str, end_date: str,
                                 is_purchase: bool, ttxly: int, token: str = None) -> dict:
    """
    Lấy DANH SÁCH hóa đơn của DUY NHẤT 1 loại (ttxly: 5, 6 hoặc 8), tự chia nhỏ
    khoảng ngày theo từng tháng giống lookup_gdt_invoices().

    Nếu đã có sẵn `token` hợp lệ (lấy từ 1 lần đăng nhập trước đó, ví dụ lần gọi
    ttxly=5 đầu tiên trong phiên tra cứu 3 loại), truyền vào để BỎ QUA đăng nhập
    lại (đỡ phải giải captcha thêm 2 lần nữa cho ttxly=6 và ttxly=8). Nếu không
    truyền, hoặc token đã hết hạn giữa chừng, hàm sẽ tự đăng nhập lại bằng
    username/password.

    Trả về dict:
      - Thành công: {"token": "...", "loai": "...", "invoices": [...], "warnings": [...]}
        (token trả về để frontend dùng cho các lần gọi tiếp theo của 2 loại còn lại)
      - Thất bại:   {"error": "..."}
    """
    if ttxly not in LOAI_MAP:
        return {"error": f"ttxly không hợp lệ: {ttxly} (chỉ chấp nhận 5, 6 hoặc 8)."}

    try:
        start_dt = datetime.strptime(start_date, "%d/%m/%Y")
        end_dt = datetime.strptime(end_date, "%d/%m/%Y")
    except ValueError:
        return {"error": "Định dạng ngày phải là dd/mm/yyyy."}

    if start_dt > end_dt:
        return {"error": "'Từ ngày' phải trước hoặc bằng 'Đến ngày'."}

    date_chunks = []
    cursor = start_dt
    while cursor <= end_dt:
        last_day_of_month = calendar.monthrange(cursor.year, cursor.month)[1]
        end_of_month = cursor.replace(day=last_day_of_month)
        chunk_end = min(end_of_month, end_dt)
        date_chunks.append((cursor.strftime("%d/%m/%Y"), chunk_end.strftime("%d/%m/%Y")))
        cursor = chunk_end + timedelta(days=1)

    session = make_session()

    used_token = token
    logged_in_fresh = False
    if not used_token:
        used_token, err = login_tax_system(session, username, password)
        if not used_token:
            return {"error": err or "Đăng nhập thất bại."}
        logged_in_fresh = True

    all_invoices = []
    all_warnings = []

    for i, (s_date, e_date) in enumerate(date_chunks):
        if i > 0:
            time.sleep(1)

        invoices, warnings = fetch_invoices_of_type(session, used_token, s_date, e_date, is_purchase, ttxly)

        # Nếu đang dùng token cũ (không tự đăng nhập ở bước trên) mà bị từ chối/hết hạn
        # thì thử đăng nhập lại 1 lần bằng username/password rồi gọi lại chunk này.
        token_rejected = any(("hết hạn" in w or "từ chối" in w) for w in warnings)
        if token_rejected and not logged_in_fresh:
            new_token, err = login_tax_system(session, username, password)
            if new_token:
                used_token = new_token
                logged_in_fresh = True
                invoices, warnings = fetch_invoices_of_type(session, used_token, s_date, e_date, is_purchase, ttxly)

        all_invoices.extend(invoices)
        if warnings:
            all_warnings.extend([f"[{s_date} - {e_date}] {w}" for w in warnings])

    return {
        "token": used_token,
        "loai": LOAI_MAP[ttxly],
        "invoices": all_invoices,
        "warnings": all_warnings,
    }


# ==========================================
# CHI TIẾT MỘT HÓA ĐƠN - gọi từ index.py (action "gdt_invoice_detail")
# ==========================================
def gdt_fetch_invoice_detail(username: str, password: str, invoice: dict) -> dict:
    """
    Lấy CHI TIẾT đầy đủ (thông tin người mua/bán, danh sách hàng hóa dịch vụ,
    thuế suất, tiền thuế từng dòng...) của MỘT hóa đơn cụ thể.

    `invoice` chính là object hóa đơn đã có trong danh sách trả về bởi
    lookup_gdt_invoices() / gdt_fetch_one_page() (frontend gửi nguyên object này
    lên khi người dùng bấm vào 1 dòng trong bảng kết quả). Cần tối thiểu các khóa:
    nbmst, khhdon, shdon (khmshdon là tùy chọn, một số hệ thống không trả về);
    khóa "loai" dùng để xác định có phải hóa đơn máy tính tiền hay không
    (quyết định gọi endpoint sco-query hay query).

    Trả về:
      - Thành công: {"detail": {...}}   (nguyên dữ liệu JSON máy chủ Thuế trả về)
      - Thất bại:   {"error": "..."}
    """
    if not isinstance(invoice, dict):
        return {"error": "Thiếu thông tin hóa đơn cần tra cứu chi tiết."}

    nbmst = invoice.get("nbmst")
    khhdon = invoice.get("khhdon")
    shdon = invoice.get("shdon")
    khmshdon = invoice.get("khmshdon")
    loai = invoice.get("loai", "")

    missing = [name for name, val in [("nbmst", nbmst), ("khhdon", khhdon), ("shdon", shdon)] if not val]
    if missing:
        return {"error": f"Thiếu thông tin định danh hóa đơn ({', '.join(missing)}) để tra cứu chi tiết."}

    session = make_session()
    token, err = login_tax_system(session, username, password)
    if not token:
        return {"error": err or "Đăng nhập thất bại."}

    # "Hóa đơn từ máy tính tiền" (ttxly=8) dùng endpoint sco-query, còn lại dùng query
    is_sco = (loai == LOAI_MAP.get(8))
    base_url = f"{BASE_API}/sco-query/invoices/detail" if is_sco else f"{BASE_API}/query/invoices/detail"

    params = {"nbmst": nbmst, "khhdon": khhdon, "shdon": shdon}
    if khmshdon not in (None, ""):
        params["khmshdon"] = khmshdon

    query_string = "?" + "&".join(f"{k}={quote(str(v))}" for k, v in params.items())
    full_url = base_url + query_string

    data, err = api_get(session, full_url, token)
    if err:
        return {"error": err}
    if not data:
        return {"error": "Máy chủ Thuế không trả về dữ liệu chi tiết cho hóa đơn này."}

    return {"detail": data}


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

```

### `api/_invoice.py`

```python
"""Tra cứu hóa đơn điện tử (ASP.NET WebForms) - bản serverless cho Vercel.

Đăng nhập bằng cách bóc __VIEWSTATE / __VIEWSTATEGENERATOR / __EVENTVALIDATION
rồi POST lại form đăng nhập, sau đó gọi API nội bộ (ajax/Envoice/method.aspx)
kèm cookie đã đăng nhập, lọc theo invNo để lấy đúng 1 hóa đơn.

Cookie được cache trong bộ nhớ (module-global) thay vì ghi ra file, vì
filesystem của Vercel là read-only và mỗi lần gọi function là stateless
(giống cơ chế cache token trong _core.py).

Thông tin đăng nhập lấy từ Environment Variables — KHÔNG hardcode trong code:
  EINVOICE_BASE_URL  vd: https://0319353578.sepay-einvoice.com
  EINVOICE_USERNAME
  EINVOICE_PASSWORD
  EINVOICE_SERIAL    (tùy chọn) ký hiệu mẫu hóa đơn dùng để lọc, mặc định "C26MSL"
"""
import os
import re
import threading
from datetime import datetime

import requests

REQUEST_TIMEOUT = 15

EINVOICE_BASE_URL = os.environ.get("EINVOICE_BASE_URL", "").rstrip("/")
EINVOICE_USERNAME = os.environ.get("EINVOICE_USERNAME", "")
EINVOICE_PASSWORD = os.environ.get("EINVOICE_PASSWORD", "")
EINVOICE_SERIAL = os.environ.get("EINVOICE_SERIAL", "C26MSL")

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

UNAUTHORIZED = "UNAUTHORIZED"

FIELD_ORDER = [
    "pattern_serial",
    "arising_date",
    "customer_name",
    "customer_id",
    "customer_address",
    "amount_before_tax",
    "vat_amount",
    "total_amount",
    "payment_method",
    "invoice_type",
    "status_msg",
]

EXCEL_HEADERS = [
    "Số hóa đơn (Cột A)",
    "Mẫu số & Ký hiệu",
    "Ngày lập",
    "Tên khách hàng",
    "Số CCCD",
    "Địa chỉ",
    "Tiền hàng",
    "Tiền thuế GTGT",
    "Tổng tiền",
    "Hình thức TT",
    "Loại hóa đơn",
    "Trạng thái Tool",
]
EXCEL_FIELDS = [
    None,
    "pattern_serial",
    "arising_date",
    "customer_name",
    "customer_id",
    "customer_address",
    "amount_before_tax",
    "vat_amount",
    "total_amount",
    "payment_method",
    "invoice_type",
    "status_msg",
]


def empty_details():
    return {f: "" for f in FIELD_ORDER}


def _extract_adjusted_invoice_no(process_note):
    """Trích số hóa đơn GỐC bị điều chỉnh/thay thế từ trường ProcessInvNote, dạng:
    "Điều chỉnh cho hóa đơn điện tử  Mẫu số 1, ký hiệu C26MSL, số 1071, ngày..."
    "Thay thế cho hóa đơn điện tử  Mẫu số 1, ký hiệu C26MSL, số 1071, ngày..."

    Chỉ khớp số đứng ngay sau "ký hiệu <ký hiệu>, số " để tránh nhầm với
    "Mẫu số 1" (số mẫu hóa đơn - luôn là "1", không phải số hóa đơn gốc).
    """
    if not process_note:
        return ""
    match = re.search(r"ký hiệu\s+[^,]+,\s*số\s+(\d+)", process_note, re.IGNORECASE)
    return match.group(1) if match else ""


def _detect_adjustment_type(process_note):
    """Phân loại hóa đơn số tiền âm dựa vào tiền tố của ProcessInvNote:
    - "dieu_chinh": "Điều chỉnh cho hóa đơn điện tử..." -> hóa đơn điều chỉnh giảm
      (thường là hoàn tiền cho khách, tiền không còn giá trị thật ở hóa đơn gốc).
    - "thay_the": "Thay thế cho hóa đơn điện tử..." -> hóa đơn thay thế (thường do
      đổi thông tin xuất hóa đơn, VD khách đổi từ cá nhân sang công ty; tiền ở
      hóa đơn gốc vẫn là tiền thật, không nên xóa).
    - "": không khớp mẫu nào (không phải hóa đơn điều chỉnh/thay thế đã biết).
    """
    if not process_note:
        return ""
    note = process_note.strip()
    if note.lower().startswith("điều chỉnh cho hóa đơn điện tử".lower()):
        return "dieu_chinh"
    if note.lower().startswith("thay thế cho hóa đơn điện tử".lower()):
        return "thay_the"
    return ""


def _extract_hidden(field_id, html_text):
    match = re.search(rf'id="{field_id}"[^>]*value="([^"]*)"', html_text)
    if not match:
        match = re.search(rf'name="{field_id}"[^>]*value="([^"]*)"', html_text)
    return match.group(1) if match else ""


class InvoiceClient:
    """Client dùng chung, tái sử dụng session và cache cookie in-memory."""

    def __init__(self):
        self.cookies = None
        self.last_error = ""
        self._lock = threading.Lock()
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})

    def login(self):
        if not EINVOICE_BASE_URL or not EINVOICE_USERNAME or not EINVOICE_PASSWORD:
            missing = [
                name for name, val in (
                    ("EINVOICE_BASE_URL", EINVOICE_BASE_URL),
                    ("EINVOICE_USERNAME", EINVOICE_USERNAME),
                    ("EINVOICE_PASSWORD", EINVOICE_PASSWORD),
                ) if not val
            ]
            self.last_error = f"Thiếu biến môi trường: {', '.join(missing)}"
            print(f"[einvoice] {self.last_error}")
            return False

        login_url = EINVOICE_BASE_URL + "/"
        try:
            resp_get = self.session.get(login_url, timeout=REQUEST_TIMEOUT)
            print(f"[einvoice] GET {login_url} -> {resp_get.status_code}, final_url={resp_get.url}")
            resp_get.raise_for_status()
            html = resp_get.text

            viewstate = _extract_hidden("__VIEWSTATE", html)
            viewstate_gen = _extract_hidden("__VIEWSTATEGENERATOR", html)
            event_validation = _extract_hidden("__EVENTVALIDATION", html)
            print(f"[einvoice] hidden fields lengths: VIEWSTATE={len(viewstate)}, "
                  f"GENERATOR={len(viewstate_gen)}, EVENTVALIDATION={len(event_validation)}")
            if not viewstate or not event_validation:
                self.last_error = ("Không đọc được __VIEWSTATE/__EVENTVALIDATION từ trang đăng nhập "
                                    "(có thể trang bị chặn bot/Cloudflare, hoặc EINVOICE_BASE_URL sai)")
                print(f"[einvoice] {self.last_error}. HTML preview: {html[:300]!r}")
                return False

            payload = {
                "__VIEWSTATE": viewstate,
                "__VIEWSTATEGENERATOR": viewstate_gen,
                "__EVENTVALIDATION": event_validation,
                "txtUserName": EINVOICE_USERNAME,
                "txtPassword": EINVOICE_PASSWORD,
                "btnLogin": "Đăng nhập",
                "tenDangNhap": "",
            }
            headers = {
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": login_url,
                "Origin": EINVOICE_BASE_URL,
            }
            resp_post = self.session.post(
                login_url, data=payload, headers=headers,
                timeout=REQUEST_TIMEOUT, allow_redirects=True,
            )
            print(f"[einvoice] POST {login_url} -> {resp_post.status_code}, final_url={resp_post.url}")
            resp_post.raise_for_status()

            cookies_dict = self.session.cookies.get_dict()
            print(f"[einvoice] cookies after login: {list(cookies_dict.keys())}")
            if ".ASPXAUTH" not in cookies_dict:
                self.last_error = ("Đăng nhập thất bại: không có cookie .ASPXAUTH sau khi POST "
                                    "(sai EINVOICE_USERNAME/EINVOICE_PASSWORD, hoặc trang chặn IP server)")
                return False
            self.cookies = cookies_dict
            self.last_error = ""
            return True
        except requests.exceptions.RequestException as e:
            self.last_error = f"Lỗi mạng khi đăng nhập: {type(e).__name__}: {e}"
            print(f"[einvoice] {self.last_error}")
            return False

    def _fetch(self, invoice_no):
        url = EINVOICE_BASE_URL + "/ajax/Envoice/method.aspx"
        today = datetime.now().strftime("%d/%m/%Y")
        params = {
            "r": "0." + str(int(datetime.now().timestamp() * 1000) % 10**8),
            "type": "GetListInvoice",
            "fromDate": "01/01/2020",
            "toDate": today,
            "pattern": "1",
            "serial": EINVOICE_SERIAL,
            "nameCus": "",
            "invNo": invoice_no,
            "typeInvoice": "-1",
            "status": "-1",
            "paymentMethod": "-1",
            "pageSizeSelect": "0",
        }
        headers = {
            "Accept": "*/*",
            "Accept-Language": "vi,en-US;q=0.9,en;q=0.8",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": EINVOICE_BASE_URL + "/Pages/IndexVatInvoice.aspx",
        }
        try:
            resp = self.session.get(
                url, params=params, headers=headers,
                cookies=self.cookies, timeout=REQUEST_TIMEOUT,
            )
        except requests.exceptions.RequestException:
            return None

        if resp.status_code != 200:
            return None
        raw_text = resp.text.strip()
        if not raw_text:
            return None
        if "<html" in raw_text.lower() or "login" in resp.url.lower():
            return UNAUTHORIZED
        if raw_text == "Không có dữ liệu":
            return []
        try:
            return resp.json()
        except ValueError:
            return None

    def _build_details(self, invoice_no):
        details = empty_details()
        data = self._fetch(invoice_no)
        if data is None:
            details["status_msg"] = "Lỗi kết nối API hóa đơn"
            return details
        if data == UNAUTHORIZED:
            return UNAUTHORIZED
        if not data:
            details["status_msg"] = "Không tìm thấy hóa đơn"
            return details

        target = None
        for inv in data:
            no_str = str(inv.get("No", "")).split(".")[0]
            if no_str == str(invoice_no).strip():
                target = inv
                break
        if target is None:
            target = data[0]

        arising = target.get("ArisingDate", "") or ""
        details["pattern_serial"] = target.get("PatternSerial", "")
        details["arising_date"] = arising[:10]
        details["customer_name"] = target.get("CusName", "")
        details["customer_id"] = target.get("CMND", "")
        details["customer_address"] = target.get("CusAddress", "")
        details["amount_before_tax"] = target.get("Total", "")
        details["vat_amount"] = target.get("VATAmount", "")
        details["total_amount"] = target.get("Amount", "")
        details["payment_method"] = target.get("PaymentMethod", "")
        details["invoice_type"] = target.get("LoaiHoaDon") or "Hóa đơn thông thường"
        details["status_msg"] = "Thành công"
        return details

    def _parse_invoice(self, inv):
        """Chuẩn hoá 1 bản ghi hóa đơn thô từ API thành dict theo FIELD_ORDER."""
        details = empty_details()
        arising = inv.get("ArisingDate", "") or ""
        details["pattern_serial"] = inv.get("PatternSerial", "")
        details["arising_date"] = arising[:10]
        details["customer_name"] = inv.get("CusName", "")
        details["customer_id"] = inv.get("CMND", "")
        details["customer_address"] = inv.get("CusAddress", "")
        details["amount_before_tax"] = inv.get("Total", "")
        details["vat_amount"] = inv.get("VATAmount", "")
        details["total_amount"] = inv.get("Amount", "")
        details["payment_method"] = inv.get("PaymentMethod", "")
        details["invoice_type"] = inv.get("LoaiHoaDon") or "Hóa đơn thông thường"
        details["status_msg"] = "Thành công"
        details["invoice_no"] = str(inv.get("No", "")).split(".")[0]
        # Hóa đơn điều chỉnh giảm (số tiền âm) có ProcessInvNote ghi rõ số hóa đơn
        # gốc bị điều chỉnh - trích ra để phía gọi hàm (index.py) tự tra cứu ngược
        # xem hóa đơn gốc đó có nằm trong cùng đợt tra cứu không.
        process_note = inv.get("ProcessInvNote", "") or ""
        details["process_note"] = process_note
        details["adjusts_invoice_no"] = _extract_adjusted_invoice_no(process_note)
        details["adjustment_type"] = _detect_adjustment_type(process_note)
        details["note"] = ""
        return details

    def _fetch_batch(self, from_date, to_date, invoice_kind="2"):
        """Gọi API 1 lần, lấy toàn bộ hóa đơn trong khoảng ngày (không lọc theo invNo).

        invoice_kind: mã lọc loại hóa đơn (tham số 'paymentMethod' trên API,
        tên gọi gây hiểu nhầm nhưng thực chất đây là loại hóa đơn):
          "-1" = tất cả (gốc + điều chỉnh + thay thế)
          "2"  = chỉ hóa đơn gốc (mới), loại trừ điều chỉnh/thay thế
          Các mã khác cần xác nhận thêm qua giao diện web trước khi dùng.
        """
        url = EINVOICE_BASE_URL + "/ajax/Envoice/method.aspx"
        params = {
            "r": "0." + str(int(datetime.now().timestamp() * 1000) % 10**8),
            "type": "GetListInvoice",
            "fromDate": from_date,
            "toDate": to_date,
            "pattern": "1",
            "serial": EINVOICE_SERIAL,
            "nameCus": "",
            "invNo": "",
            "typeInvoice": "-1",
            "status": "-1",
            "paymentMethod": invoice_kind,
            "pageSizeSelect": "0",
        }
        headers = {
            "Accept": "*/*",
            "Accept-Language": "vi,en-US;q=0.9,en;q=0.8",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": EINVOICE_BASE_URL + "/Pages/IndexVatInvoice.aspx",
        }
        try:
            resp = self.session.get(
                url, params=params, headers=headers,
                cookies=self.cookies, timeout=REQUEST_TIMEOUT,
            )
        except requests.exceptions.RequestException:
            return None

        if resp.status_code != 200:
            return None
        raw_text = resp.text.strip()
        if not raw_text:
            return None
        if "<html" in raw_text.lower() or "login" in resp.url.lower():
            return UNAUTHORIZED
        if raw_text == "Không có dữ liệu":
            return []
        try:
            return resp.json()
        except ValueError:
            return None

    def fetch_all_invoices(self, from_date, to_date, invoice_kind="2"):
        """Lấy toàn bộ hóa đơn trong khoảng ngày, tự re-login khi session hết hạn.

        from_date, to_date: chuỗi định dạng "dd/MM/yyyy" (giống UI, VD "01/07/2026")
        invoice_kind: "-1" tất cả | "2" chỉ hóa đơn gốc, xem docstring _fetch_batch
        Trả về: list[dict] đã chuẩn hoá theo FIELD_ORDER (kèm invoice_no),
                 [] nếu không có dữ liệu, hoặc None nếu lỗi kết nối/không đăng nhập được.
        """
        with self._lock:
            if not self.cookies and not self.login():
                self.last_error = self.last_error or "Không đăng nhập được"
                return None

        data = self._fetch_batch(from_date, to_date, invoice_kind)

        if data == UNAUTHORIZED:
            with self._lock:
                relogged = self.login()
            if not relogged:
                return None
            data = self._fetch_batch(from_date, to_date, invoice_kind)

        if data == UNAUTHORIZED or data is None:
            return None
        if not data:
            return []

        return [self._parse_invoice(inv) for inv in data]

    def lookup(self, invoice_no):
        """Tra cứu 1 hóa đơn, tự đăng nhập và re-login khi cần (thread-safe)."""
        with self._lock:
            if not self.cookies and not self.login():
                d = empty_details()
                d["status_msg"] = self.last_error or "Không đăng nhập được"
                return d

        result = self._build_details(invoice_no)
        if result == UNAUTHORIZED:
            with self._lock:
                relogged = self.login()
            if relogged:
                result = self._build_details(invoice_no)
            else:
                d = empty_details()
                d["status_msg"] = self.last_error or "Không thể đăng nhập lại (session hết hạn)"
                return d
        if result == UNAUTHORIZED:
            d = empty_details()
            d["status_msg"] = "Session hết hạn"
            return d
        return result


# Cache client giữa các lần gọi warm invocation (giống get_client trong _core.py).
_client = None
_client_lock = threading.Lock()


def get_client():
    global _client
    with _client_lock:
        if _client is None:
            _client = InvoiceClient()
        return _client


def lookup_invoice(invoice_no):
    """Điểm vào chính: nhận số hóa đơn -> dict kết quả (kèm invoice_no)."""
    invoice_no = (invoice_no or "").strip()
    if not invoice_no:
        d = empty_details()
        d["status_msg"] = "Thiếu số hóa đơn"
        d["invoice_no"] = ""
        return d
    result = get_client().lookup(invoice_no)
    result["invoice_no"] = invoice_no
    return result


def fetch_invoices_by_date(from_date, to_date, invoice_kind="2"):
    """Điểm vào chính cho tra cứu hàng loạt theo khoảng ngày (1 request, không lặp invNo).

    from_date, to_date: chuỗi "dd/MM/yyyy", VD "01/07/2026"
    invoice_kind: "-1" tất cả | "2" chỉ hóa đơn gốc (mặc định)
    Trả về: list[dict] hoặc [] (không có dữ liệu); None nghĩa là lỗi kết nối/đăng nhập,
             kiểm tra get_client().last_error để biết chi tiết.
    """
    return get_client().fetch_all_invoices(from_date, to_date, invoice_kind)

```

### `api/_missav.py`

```python
import re
import requests
from _subtitle import search_subtitle

BASE_URL = "https://missav.media"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://missav.media/",
}

def normalize_html(html):
    """
    Chuẩn hóa HTML giống cơ chế của plugin JS (PluginUtils.normalizeHtml).
    Gỡ bỏ các prefix (như missav_media-) mà MissAV chèn vào class CSS để chống bóc tách.
    """
    if not html:
        return ""
    
    def repl(match):
        class_val = match.group(1)
        # Xóa prefix missav_media- y hệt JS Plugin
        class_val = class_val.replace('missav_media-', '')
        
        # Mở rộng an toàn: Quét xóa mọi prefix ngẫu nhiên dính với các class key của trang
        class_val = re.sub(r'[a-zA-Z0-9_]+-(thumbnail)', r'\1', class_val)
        class_val = re.sub(r'[a-zA-Z0-9_]+-(group)', r'\1', class_val)
        class_val = re.sub(r'[a-zA-Z0-9_]+-(text-nord13)', r'\1', class_val)
        
        return f'class="{class_val}"'
        
    # Tìm và xử lý tất cả các nội dung nằm trong class="..."
    return re.sub(r'class="([^"]*)"', repl, html)

def clean_text(text):
    if not text:
        return ""
    text = re.sub(r'<[^>]*>', '', text)
    replacements = {"&amp;": "&", "&quot;": '"', "&#039;": "'", "&lt;": "<", "&gt;": ">"}
    for k, v in replacements.items():
        text = text.replace(k, v)
    return " ".join(text.split()).strip()

def get_category_list(slug):
    """Lấy danh sách phim theo slug danh mục"""
    url = f"{BASE_URL}/{slug}"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200: return []
        
        # BƯỚC QUAN TRỌNG: Làm sạch HTML trước khi cắt chuỗi
        html = normalize_html(resp.text)
        
        parts = html.split('thumbnail group')
        if len(parts) <= 1:
            parts = html.split('class="thumbnail')
            
        results = []
        for part in parts[1:]:
            link_match = re.search(r'<a[^>]+href="[^"]*/vi/([^"/\ ?]+)"', part)
            if not link_match: continue
            code_str = link_match.group(1)
            
            # Ưu tiên lấy tiêu đề phim nằm trong thuộc tính alt của ảnh
            title_match = re.search(r'<img[^>]+(?:alt|title)="([^"]+)"', part, re.IGNORECASE)
            title = clean_text(title_match.group(1)) if title_match else code_str.upper()
            
            results.append({
                "code": code_str.upper(),
                "title": title
            })
            
            # Lấy 15 phim mỗi dòng để đủ hiển thị cuộn trên web
            if len(results) >= 15: break 
        return results
    except Exception as e:
        return []

def search_missav(keyword):
    """Tìm kiếm danh sách phim theo từ khóa"""
    url = f"{BASE_URL}/vi/search/{requests.utils.quote(keyword)}"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return []
            
        # BƯỚC QUAN TRỌNG: Làm sạch HTML trước khi cắt chuỗi
        html = normalize_html(resp.text)
        
        parts = html.split('thumbnail group')
        if len(parts) <= 1:
            parts = html.split('class="thumbnail')
            
        results = []
        for part in parts[1:]:
            link_match = re.search(r'<a[^>]+href="[^"]*/vi/([^"/\ ?]+)"', part)
            if not link_match: continue
            code_str = link_match.group(1)
            
            code_match = re.search(r'class="[^"]*text-nord13[^"]*"[^>]*>([\s\S]*?)<\/a>', part)
            code = clean_text(code_match.group(1)) if code_match else code_str
            
            title_match = re.search(r'<img[^>]+(?:alt|title)="([^"]+)"', part, re.IGNORECASE)
            title = clean_text(title_match.group(1)) if title_match else code
            
            results.append({
                "slug": f"vi/{code_str}",
                "code": code.upper(),
                "title": title
            })
        return results
    except Exception:
        return []

def get_movie_detail(slug_or_code):
    """Lấy chi tiết phim và bóc tách UUID Stream URL bằng Deep Scan"""
    code_clean = slug_or_code.replace("vi/", "").strip().lower()
    url = f"{BASE_URL}/vi/{code_clean}"
    
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return None
        html = resp.text
        
        uuid = None
        uuid_matches = re.findall(r'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', html, re.IGNORECASE)
        blacklist = ["snaptrckr", "user_uuid", "popunder", "banner", "monitoring", "crypto", "randomuuid", "generateuuid"]
        
        for u in uuid_matches:
            idx = html.find(u)
            if idx != -1:
                context = html[max(0, idx - 80):min(len(html), idx + 80)].lower()
                if any(b in context for b in blacklist):
                    continue
            uuid = u
            break
            
        if not uuid:
            return None
            
        title_match = re.search(r'property="og:title"\s+content="([^"]+)"', html, re.IGNORECASE)
        title = clean_text(title_match.group(1)) if title_match else code_clean.upper()
        subtitle_url = search_subtitle(code_clean.upper())       
        return {
            "title": title,
            "stream_url": f"https://surrit.mrstcdn.store/{uuid}/playlist.m3u8",
            "code": code_clean.upper(),
            "subtitle_url": subtitle_url
        }
    except Exception:
        return None

```

### `api/_payment.py`

```python
import os
import time
import requests

def search_sepay_transaction(keyword):
    """
    Tìm kiếm giao dịch trên SePay v2 theo từ khóa và trả về TOÀN BỘ thông tin.
    """
    # Lấy token từ biến môi trường Vercel
    api_token = os.environ.get("SEPAY_API_TOKEN")
    if not api_token:
        return {"error": "Chưa cấu hình biến môi trường SEPAY_API_TOKEN trên Vercel."}
    
    url = "https://userapi.sepay.vn/v2/transactions"
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json"
    }
    
    # Chỉ tìm giao dịch nạp tiền vào (in)
    params = {
        "q": keyword,
        "transfer_type": "in",
        "page": 1,
        "per_page": 20
    }
    
    session = requests.Session()
    
    while True:
        resp = session.get(url, headers=headers, params=params)
        
        # Xử lý Rate Limit
        if resp.status_code == 429:
            retry_after = resp.headers.get("x-sepay-userapi-retry-after", 1)
            time.sleep(float(retry_after))
            continue
            
        if resp.status_code != 200:
            return {"error": f"Lỗi từ SePay (HTTP {resp.status_code}): {resp.text}"}
            
        data = resp.json()
        if data.get("status") != "success":
            return {"error": "Dữ liệu trả về từ SePay không hợp lệ."}
            
        transactions = data.get("data", [])
        if not transactions:
            return {"error": f"Chưa tìm thấy giao dịch chuyển tiền nào chứa mã: {keyword}"}
            
        # Lấy giao dịch mới nhất khớp với mã và trả về toàn bộ (raw data)
        return {"transaction": transactions[0]}

def get_sepay_bank_accounts():
    """
    Lấy danh sách tài khoản ngân hàng đã liên kết trên SePay.
    Chỉ lấy các tài khoản đang hoạt động.
    """
    api_token = os.environ.get("SEPAY_API_TOKEN")
    if not api_token:
        return {"error": "Chưa cấu hình biến môi trường SEPAY_API_TOKEN trên Vercel."}
    
    url = "https://userapi.sepay.vn/v2/bank-accounts"
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json"
    }
    
    # Lấy tài khoản đang active, tối đa 100 tài khoản
    params = {
        "active": "1",
        "per_page": 100
    }
    
    session = requests.Session()
    
    while True:
        resp = session.get(url, headers=headers, params=params)
        
        if resp.status_code == 429:
            retry_after = resp.headers.get("x-sepay-userapi-retry-after", 1)
            time.sleep(float(retry_after))
            continue
            
        if resp.status_code != 200:
            return {"error": f"Lỗi từ SePay (HTTP {resp.status_code}): {resp.text}"}
            
        data = resp.json()
        if data.get("status") != "success":
            return {"error": "Dữ liệu trả về từ SePay không hợp lệ."}
            
        return {"bank_accounts": data.get("data", [])}

def list_sepay_transactions(date_from, date_to, bank_brand=None, bank_account_id=None):
    """
    Lấy danh sách giao dịch nạp tiền (in) trong khoảng thời gian.
    Tự động lặp qua tất cả các trang để lấy toàn bộ dữ liệu.
    """
    api_token = os.environ.get("SEPAY_API_TOKEN")
    if not api_token:
        return {"error": "Chưa cấu hình biến môi trường SEPAY_API_TOKEN trên Vercel."}
    
    url = "https://userapi.sepay.vn/v2/transactions"
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json"
    }
    
    params = {
        "transaction_date_from": date_from,
        "transaction_date_to": date_to,
        "per_page": 100,
        "transaction_date_sort": "desc"
    }
    
    # Thêm điều kiện lọc nếu có truyền vào
    if bank_brand:
        params["bank_brand_name"] = bank_brand
    if bank_account_id:
        params["bank_account_id"] = bank_account_id
        
    session = requests.Session()
    
    all_transactions = []
    current_page = 1
    
    while current_page <= 10: # Đặt giới hạn an toàn 50 trang để tránh lặp vô tận
        params["page"] = current_page
        resp = session.get(url, headers=headers, params=params)
        
        if resp.status_code == 429:
            retry_after = int(resp.headers.get("x-sepay-userapi-retry-after", 2))
            time.sleep(retry_after)
            continue
            
        if resp.status_code != 200:
            # Ghi log lỗi để debug trên Vercel
            print(f"Error: {resp.status_code} - {resp.text}")
            break 
            
        data = resp.json()
        page_data = data.get("data")
        
        # Kiểm tra dữ liệu an toàn
        if not page_data: 
            break
            
        all_transactions.extend(page_data)
        
        # Nếu số lượng bản ghi nhận được ít hơn per_page, chắc chắn đã hết dữ liệu
        if len(page_data) < 100:
            break
            
        current_page += 1
        
    return {"transactions": all_transactions}

```

### `api/_subtitle.py`

```python
import re
import requests
import urllib.parse

def search_subtitle(code_str):
    """
    Tìm kiếm phụ đề trên SubtitleCat theo mã phim.
    Lọc kết quả chứa chính xác mã phim, chọn kết quả có số lượng languages cao nhất,
    và vào tận trang chi tiết để lấy link tải file .srt tiếng Việt.
    """
    encoded_code = urllib.parse.quote(code_str)
    url = f"https://www.subtitlecat.com/index.php?search={encoded_code}"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    
    try:
        # --- BƯỚC 1: Tìm kiếm danh sách ---
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code != 200:
            return "chưa có phụ đề"
            
        html = resp.text
        
        tbody_match = re.search(r'<tbody>(.*?)</tbody>', html, re.DOTALL | re.IGNORECASE)
        if not tbody_match:
            return "chưa có phụ đề"
            
        tbody_html = tbody_match.group(1)
        rows = re.findall(r'<tr>(.*?)</tr>', tbody_html, re.DOTALL | re.IGNORECASE)
        
        valid_results = []
        target_code = code_str.upper()
        
        for row in rows:
            link_match = re.search(r'<td[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', row, re.IGNORECASE)
            if not link_match:
                continue
                
            href = link_match.group(1)
            link_text = re.sub(r'<[^>]*>', '', link_match.group(2)).strip()
            
            lang_match = re.search(r'<td[^>]*>(\d+)\s+languages\s*</td>', row, re.IGNORECASE)
            languages_count = int(lang_match.group(1)) if lang_match else 0
            
            # Kiểm tra xem tiêu đề link có chứa CHÍNH XÁC mã phim hay không
            if target_code in link_text.upper():
                valid_results.append({
                    "href": href,
                    "languages": languages_count
                })
        
        # --- BƯỚC 2: Chọn trang kết quả tốt nhất ---
        if not valid_results:
            return "chưa có phụ đề"
            
        best_match = max(valid_results, key=lambda x: x['languages'])
        
        detail_url = best_match['href']
        if not detail_url.startswith("http"):
            detail_url = "https://www.subtitlecat.com/" + detail_url.lstrip("/")
            
        # --- BƯỚC 3: Truy cập trang chi tiết để lấy link tiếng Việt ---
        detail_resp = requests.get(detail_url, headers=headers, timeout=15)
        if detail_resp.status_code != 200:
            return "chưa có phụ đề"
            
        detail_html = detail_resp.text
        
        # Tìm link tải tiếng Việt (Ưu tiên thẻ a có id="download_vi")
        vi_link_match = re.search(r'<a[^>]+id="download_vi"[^>]+href="([^"]+)"', detail_html, re.IGNORECASE)
        
        # Dự phòng: Quét khối div có chứa chữ "Vietnamese" và trích xuất href
        if not vi_link_match:
            vi_div_match = re.search(r'<div class="sub-single">.*?Vietnamese.*?<a[^>]+href="([^"]+)"', detail_html, re.DOTALL | re.IGNORECASE)
            if vi_div_match:
                vi_link_match = vi_div_match

        # --- BƯỚC 4: Trả về link file .srt ---
        if vi_link_match:
            srt_link = vi_link_match.group(1)
            # Chuẩn hóa link thành đường dẫn tuyệt đối
            if not srt_link.startswith("http"):
                srt_link = "https://www.subtitlecat.com/" + srt_link.lstrip("/")
            return srt_link
        else:
            # Phim có trong hệ thống nhưng không có phụ đề tiếng Việt
            return "chưa có phụ đề"
            
    except Exception:
        # Xử lý an toàn cho mọi lỗi phát sinh (Timeout, lỗi parse...)
        return "chưa có phụ đề"

```

### `api/index.py`

```python
"""Serverless function duy nhất cho toàn bộ API."""
import base64
import io
import json
import os
import sys
import urllib.parse
import requests
import re
from http.server import BaseHTTPRequestHandler

import openpyxl

sys.path.append(os.path.dirname(__file__))
from _core import (  # noqa: E402
    lookup_order,
    lookup_customer,
    check_access,
    detect_system,
    reverse_lookup_orders_by_invoices,
    APP_ACCESS_TOKEN,
    EXCEL_HEADERS,
    EXCEL_FIELDS,
)
from _missav import get_movie_detail, get_category_list
from _subtitle import search_subtitle
from collections import defaultdict
# Thêm dòng này vào cụm import từ file nội bộ
from _payment import search_sepay_transaction, list_sepay_transactions, get_sepay_bank_accounts
from _invoice import lookup_invoice, fetch_invoices_by_date
from _gdt_invoice import lookup_gdt_invoices, lookup_gdt_invoices_by_type, gdt_fetch_invoice_detail

def handle_movie(body):
    code = (body.get("code") or "").strip()
    if not code:
        return 400, {"error": "Thiếu mã phim"}
    
    detail = get_movie_detail(code)
    if not detail:
        return 404, {"error": "Không tìm thấy phim hoặc mã không hợp lệ"}
        
    # Tự động quét và lấy link phụ đề
    detail["subtitle_url"] = search_subtitle(code)
    
    return 200, detail

def handle_fetch_employees_excel(body):
    file_b64 = body.get("file_base64", "")
    if not file_b64:
        return 400, {"error": "Thiếu file Excel"}
    try:
        # Tách phần header của base64 nếu có
        if "," in file_b64:
            file_b64 = file_b64.split(",", 1)[1]
        
        # Đọc dữ liệu excel trong RAM bằng openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(base64.b64decode(file_b64)), data_only=True)
        
        # Biểu thức chính quy (Regex) bắt các sheet có tên như T012026, T122026...
        pattern = re.compile(r"^T\d{2}20\d{2}$")
        sheets_data = {}
        
        for sheet_name in wb.sheetnames:
            clean_name = sheet_name.strip()
            if pattern.match(clean_name):
                ws = wb[sheet_name]
                data = []
                # Lấy dữ liệu từ dòng 7 trở đi
                for row in range(7, ws.max_row + 1):
                    ma_nv = ws.cell(row=row, column=2).value  # Cột B
                    ten_nv = ws.cell(row=row, column=3).value # Cột C
                    
                    # Nếu dòng có chứa mã NV hoặc Tên NV thì mới đưa vào danh sách
                    if ma_nv is not None or ten_nv is not None:
                        data.append({
                            "ma_nv": str(ma_nv).strip() if ma_nv is not None else "",
                            "ten_nv": str(ten_nv).strip() if ten_nv is not None else ""
                        })
                
                # Lưu mảng data theo key là tên sheet
                sheets_data[clean_name] = data
                
        return 200, {"sheets": sheets_data}
        
    except Exception as e:
        return 400, {"error": f"Lỗi đọc file Excel: {str(e)}"}
        
def handle_category(body):
    slug = (body.get("slug") or "").strip()
    if not slug:
        return 400, {"error": "Thiếu slug danh mục"}
    movies = get_category_list(slug)
    return 200, {"movies": movies}

def handle_invoice(body):
    code = (body.get("code") or "").strip()
    if not code:
        return 400, {"error": "Thiếu số hóa đơn"}
    return 200, lookup_invoice(code)

def _dmy_to_iso_date(d):
    """Đổi 'DD/MM/YYYY' (định dạng flatpickr đang dùng ở frontend) sang 'YYYY-MM-DD'
    (định dạng dateFrom/dateTo mà API admin/orders của 10X & Solobiz yêu cầu)."""
    d = (d or "").strip()
    parts = d.split("/")
    if len(parts) == 3:
        dd, mm, yyyy = parts
        return f"{yyyy}-{mm.zfill(2)}-{dd.zfill(2)}"
    return d

def _strip_course_duration_suffix(title):
    """Bỏ hậu tố kỳ hạn dạng '- N tháng' ở cuối tên khóa học, để gộp các kỳ hạn
    (3/6/12 tháng...) của cùng 1 khóa học vào chung 1 nhóm/1 bảng.

    VD: "MEMBERSHIP-10xVIP (Thầy Hùng Bigman) - 3 tháng"
        -> "MEMBERSHIP-10xVIP (Thầy Hùng Bigman)"
    Nếu tên không khớp mẫu (không có hậu tố kỳ hạn), trả về nguyên văn.
    """
    title = (title or "").strip()
    return re.sub(r"\s*-\s*\d+\s*th[áa]ng\s*$", "", title, flags=re.IGNORECASE).strip() or title

def handle_invoice_by_date(body):
    start_date = (body.get("start_date") or "").strip()
    end_date = (body.get("end_date") or "").strip()
    invoice_kind = (body.get("invoice_kind") or "2").strip()

    if not start_date or not end_date:
        return 400, {"error": "Vui lòng chọn Từ ngày và Đến ngày."}

    result = fetch_invoices_by_date(start_date, end_date, invoice_kind)
    if result is None:
        return 400, {"error": "Không lấy được dữ liệu hóa đơn (lỗi đăng nhập hoặc kết nối tới hệ thống hóa đơn)."}

    # Tra ngược mã đơn hàng (10X/Solobiz) cho từng số hóa đơn vừa lấy được từ SePay eInvoice.
    invoice_numbers = [inv.get("invoice_no", "") for inv in result if inv.get("invoice_no")]
    if invoice_numbers:
        order_map = reverse_lookup_orders_by_invoices(
            invoice_numbers,
            date_from=_dmy_to_iso_date(start_date),
            date_to=_dmy_to_iso_date(end_date),
        )
        for inv in result:
            match = order_map.get(inv.get("invoice_no", ""), {})
            inv["order_code"] = match.get("order_code", "")
            inv["order_system"] = match.get("system", "")
            inv["lead_name"] = match.get("lead_name", "")
            inv["username"] = match.get("username", "")
            inv["ref_username"] = match.get("ref_username", "")
            inv["commission_rate"] = match.get("commission_rate", "")
            inv["hoahong"] = match.get("hoahong", "")
            inv["item_id"] = match.get("item_id", "")
            inv["item_title"] = match.get("item_title", "")

    # Hóa đơn số tiền âm có "adjusts_invoice_no" (trích từ ProcessInvNote ở
    # _invoice.py) là số hóa đơn GỐC bị điều chỉnh/thay thế. Tra trong CHÍNH danh
    # sách hóa đơn vừa lấy được (cùng đợt/khoảng ngày) - nếu thấy, ghi chú vào cột
    # Note của DÒNG HÓA ĐƠN GỐC (không phải dòng điều chỉnh/thay thế), phân biệt 2 loại:
    #   - "dieu_chinh" (điều chỉnh giảm, thường là hoàn tiền): tiền hóa đơn gốc
    #     không còn giá trị thật -> frontend sẽ xóa trắng 7 cột tiền/ref của dòng gốc.
    #   - "thay_the" (thay thế, VD đổi cá nhân sang công ty): tiền hóa đơn gốc vẫn
    #     là tiền thật -> giữ nguyên 7 cột, chỉ thêm ghi chú.
    invoice_by_no = {inv.get("invoice_no", ""): inv for inv in result if inv.get("invoice_no")}
    for inv in result:
        adjusts_no = inv.get("adjusts_invoice_no", "")
        if not adjusts_no:
            continue
        original = invoice_by_no.get(adjusts_no)
        if original is None:
            continue
        adj_type = inv.get("adjustment_type", "")
        inv_no = inv.get("invoice_no", "")
        if adj_type == "thay_the":
            original["note"] = f"KH đổi sang cty, HĐ thay thế {inv_no}"
            original["note_type"] = "thay_the"
        else:
            # Mặc định coi là điều chỉnh giảm (giữ hành vi cũ) nếu ProcessInvNote
            # không khớp mẫu "Thay thế..." đã biết.
            original["note"] = f"KH hoàn tiền, HĐ điều chỉnh {inv_no}"
            original["note_type"] = "dieu_chinh"

    # Phân loại hàng hóa: mỗi item.id là 1 khóa học/kỳ hạn khác nhau. Một số khóa
    # học có nhiều kỳ hạn con (VD "... - 3 tháng", "... - 6 tháng", "... - 12 tháng")
    # nhưng vẫn nên gộp chung 1 bảng/1 tab - nên gộp nhóm theo TÊN ĐÃ CHUẨN HÓA
    # (bỏ hậu tố kỳ hạn) thay vì theo item_id thô. Đơn không tra ngược được
    # (chưa rõ khóa học nào) gộp vào nhóm "Chưa xác định".
    courses = {}
    for inv in result:
        item_title = inv.get("item_title") or "Chưa xác định (không tra ngược được đơn hàng)"
        group_key = _strip_course_duration_suffix(item_title)
        if group_key not in courses:
            courses[group_key] = {"title": group_key, "invoices": []}
        courses[group_key]["invoices"].append(inv)

    # SePay eInvoice trả về mặc định mới nhất trước - đổi lại thành cũ -> mới
    # theo "arising_date" (định dạng "YYYY-MM-DD" nên so sánh chuỗi trực tiếp
    # là đủ, không cần parse ngày). Hóa đơn thiếu ngày (hiếm khi xảy ra) đẩy
    # xuống cuối bảng thay vì lên đầu.
    for group in courses.values():
        group["invoices"].sort(key=lambda inv: inv.get("arising_date") or "9999-99-99")

    return 200, {"courses": list(courses.values()), "total": len(result)}

def handle_gdt_invoice(body):
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    start_date = (body.get("start_date") or "").strip()
    end_date = (body.get("end_date") or "").strip()
    is_purchase = bool(body.get("is_purchase", True))

    if not username or not password:
        return 400, {"error": "Vui lòng nhập Mã số thuế và Mật khẩu."}
    if not start_date or not end_date:
        return 400, {"error": "Vui lòng chọn Từ ngày và Đến ngày."}

    res = lookup_gdt_invoices(username, password, start_date, end_date, is_purchase)
    status = 400 if "error" in res else 200
    return status, res

def handle_gdt_invoice_by_type(body):
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    start_date = (body.get("start_date") or "").strip()
    end_date = (body.get("end_date") or "").strip()
    is_purchase = bool(body.get("is_purchase", True))
    token = (body.get("token") or "").strip() or None

    if not username or not password:
        return 400, {"error": "Vui lòng nhập Mã số thuế và Mật khẩu."}
    if not start_date or not end_date:
        return 400, {"error": "Vui lòng chọn Từ ngày và Đến ngày."}

    try:
        ttxly = int(body.get("ttxly"))
    except (TypeError, ValueError):
        return 400, {"error": "Thiếu hoặc sai tham số ttxly (chỉ chấp nhận 5, 6 hoặc 8)."}

    res = lookup_gdt_invoices_by_type(username, password, start_date, end_date, is_purchase, ttxly, token=token)
    status = 400 if "error" in res else 200
    return status, res

def handle_gdt_invoice_detail(body):
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    invoice = body.get("invoice") or {}

    if not username or not password:
        return 400, {"error": "Vui lòng nhập Mã số thuế và Mật khẩu."}
    if not isinstance(invoice, dict) or not invoice:
        return 400, {"error": "Thiếu thông tin hóa đơn cần tra cứu chi tiết."}

    res = gdt_fetch_invoice_detail(username, password, invoice)
    status = 400 if "error" in res else 200
    return status, res

def handle_lookup(body):
    code = (body.get("code") or "").strip()
    if not code:
        return 400, {"error": "Thiếu mã đơn hàng / mã KH"}
    sa_system = (body.get("sa_system") or "").strip() or None
    return 200, lookup_customer(code, sa_system=sa_system)
    
def handle_excel(body):
    file_b64 = body.get("file_base64", "")
    if not file_b64:
        return 400, {"error": "Thiếu file Excel"}
    try:
        if "," in file_b64:
            file_b64 = file_b64.split(",", 1)[1]
        wb = openpyxl.load_workbook(io.BytesIO(base64.b64decode(file_b64)))
        sheet = wb.active
    except Exception as e:
        return 400, {"error": f"Không đọc được file Excel: {e}"}

    for col_idx, header in enumerate(EXCEL_HEADERS, start=1):
        sheet.cell(row=1, column=col_idx, value=header)

    status_col = len(EXCEL_HEADERS)
    total = 0
    success = 0
    for row in range(2, sheet.max_row + 1):
        cell_val = sheet.cell(row=row, column=1).value
        if not cell_val:
            continue
        total += 1
        order_code = str(cell_val).strip()
        if detect_system(order_code) is None:
            sheet.cell(row=row, column=status_col, value="Bỏ qua (Mã không hợp lệ)")
            continue
        result = lookup_order(order_code)
        for col_idx, field_name in enumerate(EXCEL_FIELDS, start=1):
            if field_name is not None:
                sheet.cell(row=row, column=col_idx, value=result.get(field_name, ""))
        if result.get("status_msg") == "Thành công":
            success += 1

    out = io.BytesIO()
    wb.save(out)
    out.seek(0)
    return 200, {
        "file_base64": base64.b64encode(out.read()).decode("ascii"),
        "total": total,
        "success": success,
    }
    
def handle_bank_statement(body):
    file_b64 = body.get("file_base64", "")
    if not file_b64:
        return 400, {"error": "Thiếu file Excel"}
    try:
        if "," in file_b64:
            file_b64 = file_b64.split(",", 1)[1]
        wb = openpyxl.load_workbook(io.BytesIO(base64.b64decode(file_b64)), data_only=True)
        sheet = wb.active
    except Exception as e:
        return 400, {"error": f"Không đọc được file Excel: {e}"}

    so_du_dau_ky_raw = sheet.cell(row=7, column=4).value
    so_du_dau_ky = 0
    if so_du_dau_ky_raw is not None:
        try:
            chuoi_so = str(so_du_dau_ky_raw).replace(",", "").replace(" ", "").strip()
            so_du_dau_ky = float(chuoi_so)
        except ValueError:
            so_du_dau_ky = 0

    dem_gui_vao = defaultdict(int)
    dem_rut_ra = defaultdict(int)

    current_row = 9
    last_valid_row = 8 

    while True:
        rut_ra = sheet.cell(row=current_row, column=5).value
        gui_vao = sheet.cell(row=current_row, column=6).value
        ngay_gd = sheet.cell(row=current_row, column=1).value 

        if ngay_gd is None and rut_ra is None and gui_vao is None:
            break

        last_valid_row = current_row 

        if rut_ra is not None:
            try:
                val = float(rut_ra)
                if val > 0: dem_rut_ra[val] += 1
            except ValueError: pass 

        if gui_vao is not None:
            try:
                val = float(gui_vao)
                if val > 0: dem_gui_vao[val] += 1
            except ValueError: pass

        current_row += 1

    so_du_cuoi_ky_raw = sheet.cell(row=last_valid_row, column=7).value
    so_du_cuoi_ky = 0
    if so_du_cuoi_ky_raw is not None:
        try:
            chuoi_so_cuoi = str(so_du_cuoi_ky_raw).replace(",", "").replace(" ", "").strip()
            so_du_cuoi_ky = float(chuoi_so_cuoi)
        except ValueError:
            so_du_cuoi_ky = 0

    tat_ca_gia_tri = set(dem_gui_vao.keys()).union(set(dem_rut_ra.keys()))
    tat_ca_gia_tri = sorted(list(tat_ca_gia_tri)) 

    wb_new = openpyxl.Workbook()
    ws = wb_new.active
    ws.title = "Tong_Hop_Sao_Ke"

    ws.append(["Nội dung diễn giải", "Gửi vào", "Rút ra", "Số dư lũy kế", "Ghi chú (Để bạn dò số)"])
    ws.append(["Số dư đầu kỳ STK ...", "", "", so_du_dau_ky, "Tự động lấy từ ô D7 file gốc"])

    current_excel_row = 3
    for gia_tri in tat_ca_gia_tri:
        sl_vao = dem_gui_vao[gia_tri]
        sl_ra = dem_rut_ra[gia_tri]
        
        tong_vao = (gia_tri * sl_vao) if sl_vao > 0 else ""
        tong_ra = -(gia_tri * sl_ra) if sl_ra > 0 else "" 
        
        ghi_chu = []
        if sl_vao > 0: ghi_chu.append(f"Vào: {gia_tri:,.0f} x {sl_vao}")
        if sl_ra > 0: ghi_chu.append(f"Ra: {gia_tri:,.0f} x {sl_ra}")
        
        ws.append([
            "", 
            tong_vao, 
            tong_ra, 
            f"=D{current_excel_row-1}+SUM(B{current_excel_row}:C{current_excel_row})", 
            " | ".join(ghi_chu)
        ])
        current_excel_row += 1

    ws.append([
        "Số dư cuối kỳ", 
        f"=SUM(B3:B{current_excel_row-1})", 
        f"=SUM(C3:C{current_excel_row-1})", 
        so_du_cuoi_ky, 
        f"Tự động lấy từ cột G, dòng {last_valid_row} file gốc"
    ])

    # ==========================================
    # LÀM ĐẸP GIAO DIỆN EXCEL (CẬP NHẬT TẠI ĐÂY)
    # ==========================================
    # Ép format phân cách phần ngàn, không thập phân cho toàn bộ cột B, C, D (Kể cả ô chứa công thức)
    for row in ws.iter_rows(min_row=2, max_row=current_excel_row, min_col=2, max_col=4):
        for cell in row:
            # '#,##0' là format chuẩn: có dấu phẩy phần ngàn, không có số sau dấu chấm thập phân
            # ;(#,##0) đảm bảo nếu là số âm thì tự chui vào trong ngoặc đơn
            cell.number_format = '#,##0;(#,##0)'
    
    for col in range(1, 6):
        ws.cell(row=1, column=col).font = openpyxl.styles.Font(bold=True)
        ws.cell(row=current_excel_row, column=col).font = openpyxl.styles.Font(bold=True)
    ws.cell(row=2, column=1).font = openpyxl.styles.Font(bold=True) 

    ws.column_dimensions['A'].width = 35
    ws.column_dimensions['B'].width = 18
    ws.column_dimensions['C'].width = 18
    ws.column_dimensions['D'].width = 20
    ws.column_dimensions['E'].width = 45

    out = io.BytesIO()
    wb_new.save(out)
    out.seek(0)
    return 200, {
        "file_base64": base64.b64encode(out.read()).decode("ascii")
    } 
    
class handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        # ------ TRẠM TRUNG CHUYỂN PHỤ ĐỀ (CORS & SRT to VTT Proxy) ------
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/subtitle":
            qs = urllib.parse.parse_qs(parsed.query)
            url = qs.get("url", [""])[0]
            if url:
                try:
                    resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
                    if resp.status_code == 200:
                        # Biến đổi SRT sang WebVTT chuẩn xác (Chỉ thay đổi dấu phẩy ở mốc thời gian thành dấu chấm)
                        vtt_text = "WEBVTT\n\n" + re.sub(r'(\d{2}:\d{2}:\d{2}),(\d{3})', r'\1.\2', resp.text)
                        body = vtt_text.encode("utf-8")
                        
                        self.send_response(200)
                        self.send_header("Content-Type", "text/vtt; charset=utf-8")
                        self.send_header("Content-Length", str(len(body)))
                        self.send_header("Access-Control-Allow-Origin", "*") # Mở khóa CORS
                        self.end_headers()
                        self.wfile.write(body)
                        return
                except Exception:
                    pass
            self.send_response(404)
            self.end_headers()
            return
        # -----------------------------------------------------------------

        self._send(200, {"auth_required": bool(APP_ACCESS_TOKEN)})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b"{}"
            body = json.loads(raw.decode("utf-8") or "{}")
        except (ValueError, json.JSONDecodeError):
            self._send(400, {"error": "JSON không hợp lệ"})
            return

        token = body.get("access_token") or self.headers.get("X-Access-Token", "")
        if not check_access(token):
            self._send(401, {"error": "Sai mật khẩu truy cập"})
            return

        action = body.get("action", "lookup")
        
        if action == "movie":
            status, payload = handle_movie(body)
        elif action == "category":
            status, payload = handle_category(body)
        elif action == "excel":
            status, payload = handle_excel(body)
        elif action == "bank_statement":
            status, payload = handle_bank_statement(body)
        elif action == "lookup":
            status, payload = handle_lookup(body)
        elif action == "invoice":
            status, payload = handle_invoice(body)
        elif action == "invoice_by_date":
            status, payload = handle_invoice_by_date(body)
        elif action == "gdt_invoice":
            status, payload = handle_gdt_invoice(body)
        elif action == "gdt_invoice_by_type":
            status, payload = handle_gdt_invoice_by_type(body)
        elif action == "gdt_invoice_detail":
            status, payload = handle_gdt_invoice_detail(body)
        elif action == "fetch_employees_excel":
            status, payload = handle_fetch_employees_excel(body)
        elif action == "search_transaction":
            code = (body.get("code") or "").strip()
            if not code:
                status, payload = 400, {"error": "Thiếu mã đơn hàng"}
            else:
                res = search_sepay_transaction(code)
                status, payload = (400 if "error" in res else 200), res
        elif action == "list_transactions":
            date_from = body.get("date_from", "").strip()
            date_to = body.get("date_to", "").strip()
            bank_brand = body.get("bank_brand", "").strip()
            bank_account = body.get("bank_account", "").strip()
            
            if not date_from or not date_to:
                status, payload = 400, {"error": "Thiếu thông tin ngày bắt đầu/kết thúc."}
            else:
                res = list_sepay_transactions(date_from, date_to, bank_brand, bank_account)
                status, payload = (400 if "error" in res else 200), res
        elif action == "get_bank_accounts":
            res = get_sepay_bank_accounts()
            status, payload = (400 if "error" in res else 200), res
        else:
            status, payload = 400, {"error": f"action không hợp lệ: {action}"}       
        self._send(status, payload)

```

### `api/telegram.py`

```python
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
        print(f"DEBUG: Subtitle URL truyền đi là: {subtitle_url}")
        web_app_url = f"{VERCEL_DOMAIN}/player.html?vid={urllib.parse.quote(stream_url)}&sub={urllib.parse.quote(subtitle_url)}"
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

```

### `ebook.html`

```html
[Bỏ qua: file lớn hơn 300000 bytes]
```

### `gopcode.py`

```python
#!/usr/bin/env python3
"""
gen_context.py
Gộp toàn bộ code trong project thành 1 file Markdown (PROJECT_CONTEXT.md)
để paste/upload cho Claude (hoặc AI khác) nắm bắt nhanh toàn bộ dự án.

Cách dùng:
    python gen_context.py
    # hoặc chỉ định thư mục gốc khác:
    python gen_context.py --root ./sepay-order-lookup --out CONTEXT.md
"""

import argparse
import os
from pathlib import Path

# --- CẤU HÌNH ---------------------------------------------------------

# Các đuôi file sẽ được đưa vào file gộp
INCLUDE_EXT = {
    ".py", ".html", ".js", ".ts", ".jsx", ".tsx", ".css",
    ".json", ".md", ".txt", ".yaml", ".yml",
}

# Tên file cụ thể luôn được đưa vào dù không khớp đuôi ở trên
INCLUDE_FILENAMES = {
    ".gitignore", ".env.example", "vercel.json", "requirements.txt",
}

# Thư mục sẽ bỏ qua hoàn toàn
EXCLUDE_DIRS = {
    ".git", "node_modules", "__pycache__", ".vercel", ".venv",
    "venv", "dist", "build", ".next",
}

# File/pattern nhạy cảm tuyệt đối không đưa vào (tránh lộ secret)
EXCLUDE_FILENAMES = {
    ".env", ".env.local", ".env.production",
}

# Đuôi file coi là "ngôn ngữ" để tô màu code block trong markdown
LANG_MAP = {
    ".py": "python", ".js": "javascript", ".ts": "typescript",
    ".jsx": "jsx", ".tsx": "tsx", ".html": "html", ".css": "css",
    ".json": "json", ".md": "markdown", ".yaml": "yaml", ".yml": "yaml",
    ".txt": "text",
}

MAX_FILE_SIZE_BYTES = 300_000  # bỏ qua file quá lớn (vd. data json khổng lồ)

# -----------------------------------------------------------------------


def should_include(path: Path) -> bool:
    if path.name in EXCLUDE_FILENAMES:
        return False
    if path.name in INCLUDE_FILENAMES:
        return True
    return path.suffix.lower() in INCLUDE_EXT


def build_tree(root: Path) -> str:
    lines = []

    def walk(dir_path: Path, prefix: str = ""):
        entries = sorted(
            [p for p in dir_path.iterdir() if p.name not in EXCLUDE_DIRS],
            key=lambda p: (p.is_file(), p.name.lower()),
        )
        for i, entry in enumerate(entries):
            connector = "└── " if i == len(entries) - 1 else "├── "
            lines.append(f"{prefix}{connector}{entry.name}")
            if entry.is_dir():
                extension = "    " if i == len(entries) - 1 else "│   "
                walk(entry, prefix + extension)

    lines.append(root.name + "/")
    walk(root)
    return "\n".join(lines)


def gather_files(root: Path):
    result = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for fname in sorted(filenames):
            fpath = Path(dirpath) / fname
            if should_include(fpath):
                result.append(fpath)
    return sorted(result)


def read_file_safe(path: Path) -> str:
    try:
        if path.stat().st_size > MAX_FILE_SIZE_BYTES:
            return f"[Bỏ qua: file lớn hơn {MAX_FILE_SIZE_BYTES} bytes]"
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return f"[Lỗi khi đọc file: {e}]"


def main():
    parser = argparse.ArgumentParser(description="Gộp code project thành 1 file Markdown")
    parser.add_argument("--root", default=".", help="Thư mục gốc của project (mặc định: thư mục hiện tại)")
    parser.add_argument("--out", default="PROJECT_CONTEXT.md", help="Tên file markdown xuất ra")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    out_path = root / args.out

    files = gather_files(root)

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(f"# Project Context: {root.name}\n\n")
        f.write("## Cấu trúc thư mục\n\n```\n")
        f.write(build_tree(root))
        f.write("\n```\n\n")
        f.write("## Nội dung file\n\n")

        for fpath in files:
            rel = fpath.relative_to(root)
            lang = LANG_MAP.get(fpath.suffix.lower(), "")
            content = read_file_safe(fpath)
            f.write(f"### `{rel.as_posix()}`\n\n")
            f.write(f"```{lang}\n{content}\n```\n\n")

    print(f"Đã tạo: {out_path}")
    print(f"Tổng số file đã gộp: {len(files)}")


if __name__ == "__main__":
    main()
```

### `index.html`

```html
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Công cụ tra cứu đơn hàng & Sao kê | 10X</title>

<link id="flatpickr-theme" rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/light.css">

<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap');
  /* 10X DESIGN SYSTEM - CÁC BIẾN MẶC ĐỊNH LÀ DARK MODE */
  :root { 
    --bg-app: #0C1640; 
    --bg-gradient: radial-gradient(900px 480px at 50% -140px, rgba(46,151,224,.18), transparent 70%), 
                   radial-gradient(800px 500px at 50% 120%, rgba(240,161,36,.12), transparent 70%), 
                   linear-gradient(180deg,#0C1640,#070D26);
    
    --header-bg: rgba(12,22,64,0.4);       
    --sidebar-bg: transparent;      
    --card-bg: linear-gradient(180deg, rgba(20,32,78,.9), rgba(15,25,64,.8));         
    --card-bg-solid: #141F4E;
    --border: rgba(120,150,220,.22);          
    
    --text-main: #FFFFFF;        
    --text-muted: rgba(255,255,255,.6);      
    --heading-color: #FFFFFF;
    --brand-color: #F0A124;

    --accent: #2E97E0;          
    --accent-gradient: linear-gradient(90deg,#2E97E0,#63B8F0);
    --accent-hover: #63B8F0; 
    
    --btn-orange: linear-gradient(180deg,#F4AE36,#E08B10);
    --btn-orange-text: #241400;Đ
    --btn-text: #0C1640;

    --badge-ok-bg: rgba(46,151,224,.16);     
    --badge-ok-text: rgba(159,212,248,.95);
    --badge-err-bg: rgba(240,161,36,.16);    
    --badge-err-text: #FFD98A;

    --input-bg: rgba(15,25,64,.5);
    --input-border: rgba(255,255,255,.14);

    --card-shadow: 0 12px 30px -12px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.1);
    --table-th-bg: rgba(0,0,0,0.2);
    --table-th-text: #AEC0E6;
    --table-row-hover: rgba(255,255,255,0.04);
    
    --amount-in: rgba(159,212,248,.95);
    --amount-out: #FFD98A;
    --total-row-bg: rgba(46,151,224,.16);
    --total-row-bg-solid: #183265;
    --checkbox-bg: rgba(255,255,255,0.012);
    --settings-panel-bg: rgba(0,0,0,0.2);

    /* BIẾN MÀU WIDGET LỊCH TUẦN */
    --cal-active-bg: #C5221F; 
    --cal-active-text: #FFFFFF;
    --cal-block-bg: rgba(255,255,255,0.05);
  }

  /* GIAO DIỆN LIGHT MODE SẼ GHI ĐÈ CÁC BIẾN NÀY */
  body.light-mode {
    --bg-app: #F4F7F9; 
    --bg-gradient: radial-gradient(900px 480px at 50% -140px, rgba(46,151,224,.06), transparent 70%),
                   linear-gradient(180deg, #F4F7F9, #E9EEF2);
    --header-bg: rgba(255,255,255,0.85);       
    --card-bg: #FFFFFF;         
    --card-bg-solid: #FFFFFF;
    --border: rgba(0,0,0,0.08);          
    --text-main: #1E293B;        
    --text-muted: #64748B;       
    --heading-color: #0F172A;
    --brand-color: #E08B10;

    --accent: #2563EB;          
    --accent-gradient: linear-gradient(90deg, #2563EB, #3B82F6);
    
    --btn-orange: linear-gradient(180deg, #F4AE36, #E08B10);
    --btn-orange-text: #FFFFFF;
    --btn-text: #FFFFFF;

    --badge-ok-bg: #DCFCE7;     
    --badge-ok-text: #166534;
    --badge-err-bg: #FEE2E2;    
    --badge-err-text: #991B1B;

    --input-bg: #F8FAFC;
    --input-border: #CBD5E1;

    --card-shadow: 0 4px 12px rgba(0,0,0,0.05);
    --table-th-bg: #F1F5F9;
    --table-th-text: #475569;
    --table-row-hover: #F8FAFC;
    
    --amount-in: #16A34A;
    --amount-out: #DC2626;
    --total-row-bg: #EFF6FF;
    --total-row-bg-solid: #EFF6FF;
    --checkbox-bg: #F8FAFC;
    --settings-panel-bg: rgba(0,0,0,0.04);

    --cal-active-bg: #C5221F; 
    --cal-active-text: #FFFFFF;
    --cal-block-bg: #FFFFFF;
  }
  
  * { box-sizing: border-box; }
  html { height: 100%; height: 100dvh; }
  body { 
    margin: 0; 
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
    background: var(--bg-app); 
    background-image: var(--bg-gradient);
    background-attachment: fixed;
    color: var(--text-main); 
    font-size: 14px;
    height: 100vh;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: background 0.3s ease, color 0.3s ease;
  }

  /* HEADER */
  .top-header {
    background: var(--header-bg); 
    color: var(--text-main); 
    height: 64px;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 24px; flex-shrink: 0;
    border-bottom: 1px solid var(--border);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    z-index: 10;
    transition: 0.3s ease;
  }
  .header-brand { 
    display: flex; align-items: center; 
    color: var(--brand-color);
  }
  
  /* NÚT THU GỌN SIDEBAR */
  #toggleSidebarBtn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 18px;
    cursor: pointer;
    padding: 6px 10px;
    margin-right: 8px;
    border-radius: 8px;
    transition: 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: none;
  }
  #toggleSidebarBtn:hover {
    background: var(--border);
    color: var(--text-main);
  }

  .header-actions { display: flex; align-items: center; gap: 12px; }
  .header-actions input {
    background: var(--input-bg); color: var(--text-main); border: 1px solid var(--input-border);
    padding: 8px 12px; border-radius: 8px; font-size: 13px; outline: none; transition: 0.2s;
  }
  .header-actions input:focus { border-color: var(--accent); }
  .header-actions input::placeholder { color: var(--text-muted); }
  .header-actions button:not(.acc-seg-btn) { 
    background: var(--btn-orange); 
    color: var(--btn-orange-text); 
    padding: 8px 16px; 
    font-weight: 700;
    border-radius: 8px;
    box-shadow: 0 4px 12px -2px rgba(240,161,36,.4);
  }

  /* --- WIDGET LỊCH TUẦN TRONG HEADER --- */
  .weekly-calendar-widget {
    display: flex; align-items: center; gap: 12px; height: 100%;
    user-select: none; flex: 1; justify-content: center;
  }
  .cal-info {
    display: flex; flex-direction: column; align-items: flex-end;
    justify-content: center; line-height: 1.2;
  }
  .cal-month { font-size: 12px; font-weight: 700; color: var(--text-main); }
  .cal-lunar { font-size: 10px; font-weight: 600; color: var(--cal-active-bg); margin-top: 2px;}
  .cal-days-wrap { display: flex; gap: 4px; align-items: center; }
  .cal-day-block {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    width: 38px; height: 48px; background: var(--cal-block-bg);
    border: 1px solid var(--border); border-radius: 8px; transition: 0.2s ease; cursor: default;
  }
  .cal-day-block:hover { border-color: var(--text-muted); }
  .cal-dow { font-size: 9px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 2px; }
  .cal-date { font-size: 15px; font-weight: 800; color: var(--text-main); line-height: 1; }
  .cal-lunar-date { font-size: 9px; font-weight: 500; color: var(--text-muted); margin-top: 2px; }
  
  /* Highlight ngày nghỉ Thứ 7, Chủ Nhật (Màu pastel xanh lá) */
  .cal-day-block.weekend {
    background-color: #e6f4ea; 
    border-color: #ceead6;
  }
  .cal-day-block.weekend .cal-dow {
    color: #137333; 
  }
  .cal-day-block.weekend .cal-date { color: #1E293B; }
  .cal-day-block.weekend .cal-lunar-date { color: #64748B; }

  /* Đảm bảo nếu hôm nay là cuối tuần thì màu đỏ vẫn được ưu tiên hiển thị */
  .cal-day-block.active {
    background: var(--cal-active-bg); border-color: var(--cal-active-bg);
    box-shadow: 0 4px 8px -2px rgba(197, 34, 31, 0.4); transform: translateY(-1px);
  }
  .cal-day-block.active.weekend {
    background-color: var(--cal-active-bg); border-color: var(--cal-active-bg);
  }
  .cal-day-block.active .cal-dow,
  .cal-day-block.active .cal-date,
  .cal-day-block.active .cal-lunar-date { color: var(--cal-active-text); }
  
  .cal-dot { display: none; width: 4px; height: 4px; background: var(--cal-active-bg); border-radius: 50%; margin-top: 2px; }
  .cal-day-block.active .cal-dot { background: var(--cal-active-text); display: block;}

  @media (max-width: 1024px) {
    .weekly-calendar-widget { display: none; } /* Ẩn lịch trên màn hình nhỏ để tránh vỡ Header */
  }

  /* Khi máy đã lưu mật khẩu (ô input được ẩn đi), nhường chỗ đó cho widget lịch
     kể cả trên tablet/mobile. Cho phép header tự xuống dòng nếu vẫn không đủ chỗ
     để không bao giờ vỡ layout. */
  @media (max-width: 1024px) {
    body.has-token .top-header { flex-wrap: wrap; row-gap: 8px; }
    body.has-token .weekly-calendar-widget {
      display: flex; order: 3; flex: 1 1 auto; justify-content: center;
    }
    body.has-token .header-actions { flex: 0 0 auto; }
  }
  /* Ẩn ô nhập mật khẩu khi đã có mật khẩu lưu sẵn */
  body.has-token #accessToken { display: none; }

  /* BODY LAYOUT */
  .app-body { display: flex; flex-grow: 1; overflow: hidden; }

  /* SIDEBAR */
  .sidebar {
    width: 250px; background: var(--sidebar-bg); border-right: 1px solid var(--border);
    display: flex; flex-direction: column; justify-content: space-between; padding: 24px 0; flex-shrink: 0;
    z-index: 5;
    transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1), background 0.3s;
  }
  .sidebar-top, .sidebar-bottom { display: flex; flex-direction: column; }
  
  .sidebar-menu-title {
    font-size: 11px; font-weight: 700; color: var(--text-muted);
    text-transform: uppercase; padding: 0 20px; margin-bottom: 12px; letter-spacing: 0.8px;
    transition: opacity 0.2s ease, visibility 0.2s;
  }
  .menu-item {
    padding: 12px 20px; margin: 4px 14px; border-radius: 11px;
    display: flex; align-items: center; gap: 12px;
    cursor: pointer; color: var(--text-muted); font-weight: 600; transition: all 0.2s;
  }
  .menu-item:hover { background: var(--border); color: var(--text-main); }
  .menu-item.active { 
    background: var(--btn-orange); 
    color: var(--btn-orange-text); 
    box-shadow: 0 6px 16px -4px rgba(240,161,36,.5);
    font-weight: 800;
  }
  .menu-icon { font-size: 15px; flex-shrink: 0; }
  .menu-text { transition: opacity 0.2s ease; }

  /* TAB CHUYỂN ĐỔI GIỮA CÁC BẢNG KHÓA HỌC (tra cứu hóa đơn theo khoảng ngày) */
  .course-tab-bar {
    display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px;
  }
  .course-tab {
    padding: 8px 16px; border-radius: 999px; border: 1px solid var(--input-border);
    background: var(--input-bg); color: var(--text-muted);
    font-weight: 600; font-size: 13px; cursor: pointer; transition: all 0.15s;
    white-space: nowrap;
  }
  .course-tab:hover { background: var(--border); color: var(--text-main); }
  .course-tab.active {
    background: var(--btn-orange); color: var(--btn-orange-text);
    border-color: var(--btn-orange); font-weight: 800;
  }
  .course-tab .count { opacity: 0.75; margin-left: 4px; }

  /* LỌC + SẮP XẾP KIỂU EXCEL cho các bảng tra cứu hóa đơn */
  .table-filter-row td { padding: 4px 8px !important; }
  .table-filter-input {
    width: 100%; box-sizing: border-box; padding: 4px 6px; font-size: 12px;
    border: 1px solid var(--input-border); border-radius: 6px;
    background: var(--input-bg); color: var(--text-main);
  }
  .table-filter-input:focus { outline: none; border-color: var(--accent); }
  .sort-indicator { font-size: 10px; opacity: 0.7; margin-left: 3px; }

  /* SWITCH TOGGLE GIAO DIỆN */
  .settings-panel {
    padding: 12px 18px; margin: 4px 14px 0;
    background: var(--settings-panel-bg);
    border-radius: 11px;
    border: 1px solid var(--border);
    transition: all 0.3s ease;
    overflow: hidden;
  }
  .settings-panel.hidden {
    display: none;
  }
  .theme-switch-wrapper {
    display: flex; align-items: center; justify-content: space-between; width: 100%;
  }
  .theme-switch-wrapper span { font-size: 13px; font-weight: 600; color: var(--text-main); }
  
  .switch { position: relative; display: inline-block; width: 42px; height: 24px; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .slider {
    position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
    background-color: #cbd5e1; transition: .4s; border-radius: 24px;
  }
  .slider:before {
    position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px;
    background-color: white; transition: .4s; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }
  input:checked + .slider { background-color: var(--accent); }
  input:checked + .slider:before { transform: translateX(18px); }

  body.light-mode .slider { background-color: #94a3b8; }

  /* TRẠNG THÁI SIDEBAR KHI THU GỌN */
  .sidebar.collapsed { width: 78px; }
  .sidebar.collapsed .sidebar-menu-title {
    opacity: 0; visibility: hidden; height: 0; margin: 0; padding: 0; overflow: hidden;
  }
  .sidebar.collapsed .menu-item {
    margin: 4px 12px; padding: 12px 0; justify-content: center; border-radius: 10px;
  }
  .sidebar.collapsed .menu-text { display: none; }
  .sidebar.collapsed .menu-icon { font-size: 18px; margin: 0; }
  .sidebar.collapsed .settings-panel { display: none !important; }

  /* --- DROPDOWN CHECKBOX (MULTI-SELECT) --- */
  .multi-select-container { position: relative; width: 100%; user-select: none; }
  
  .multi-select-label { 
    background: var(--input-bg); /* Sửa từ white thành biến hệ thống */
    cursor: pointer; padding: 12px 14px; border-radius: 11px; /* Bo góc và padding đồng bộ với input */
    border: 1px solid var(--input-border); font-size: 14px; color: var(--text-main);
    overflow: hidden; white-space: nowrap; text-overflow: ellipsis; 
  }
  
  .multi-select-dropdown { 
    display: none; position: absolute; top: 100%; left: 0; right: 0; 
    background: var(--card-bg); /* Sửa từ white thành màu nền thẻ */
    border: 1px solid var(--border); z-index: 100; 
    max-height: 250px; overflow-y: auto; box-shadow: var(--card-shadow); 
    border-radius: 11px; margin-top: 4px; padding: 8px; 
  }
  
  .multi-select-dropdown.show { display: block; }
  
  .ms-checkbox-item { 
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    display: flex; align-items: center; gap: 8px; padding: 8px 10px; 
    cursor: pointer; font-size: 13px; border-radius: 6px; color: var(--text-main);
    white-space: nowrap;
  }
  
  .ms-checkbox-item:hover { 
    background: var(--table-row-hover); /* Đổi màu nền hover đồng bộ với bảng */ 
  }
  
  .ms-checkbox-item input { cursor: pointer; margin: 0; accent-color: var(--accent); }
  
  /* MAIN CONTENT */
  .main-content { flex-grow: 1; padding: 28px 36px; padding-bottom: 80px; overflow-y: auto; -webkit-overflow-scrolling: touch; }

  h2 { margin: 0 0 20px; font-size: 20px; font-weight: 800; color: var(--heading-color); font-family: 'Inter', sans-serif;}
  h3 { color: var(--heading-color); font-family: 'Inter', sans-serif;}
  .card { 
    background: var(--card-bg); border: 1px solid var(--border); 
    border-radius: 16px; padding: 24px; margin-bottom: 24px; 
    box-shadow: var(--card-shadow); transition: 0.3s;
  }
  label { display: block; font-size: 13px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px; }
  
  input[type=text], input[type=file], textarea, select {
    width: 100%; padding: 12px 14px; border-radius: 11px; 
    border: 1px solid var(--input-border); background: var(--input-bg); 
    color: var(--text-main); font-size: 14px; font-family: inherit; outline: none; transition: 0.2s;
  }
  input[type=text]:focus, textarea:focus, select:focus { 
    border-color: var(--accent); 
    box-shadow: 0 0 0 3px rgba(46,151,224,0.15); 
  }
  select option { background: var(--bg-app); color: var(--text-main); }
  textarea { resize: vertical; }

  button { 
    background: var(--accent-gradient); color: var(--btn-text); border: none; 
    padding: 12px 20px; border-radius: 11px; font-size: 14px; font-family: inherit;
    cursor: pointer; font-weight: 700; transition: all 0.2s ease; 
    box-shadow: 0 4px 12px rgba(46,151,224,0.2);
  }
  button:hover { filter: brightness(1.1); transform: translateY(-1px); box-shadow: 0 6px 16px rgba(46,151,224,0.35); }
  button:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }
  
  .btn-outline { background: transparent; color: var(--text-muted); border: 1px solid var(--input-border); box-shadow: none; }
  .btn-outline:hover { background: var(--border); color: var(--text-main); box-shadow: none;}

  .hidden { display: none !important; }
  .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
  .row > div { flex: 1; min-width: 250px; }

  /* CHECKBOX DRAG & DROP */
  .checkbox-group { 
    display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; 
    background: var(--checkbox-bg); padding: 14px; border-radius: 11px; border: 1px dashed var(--border); 
  }
  .checkbox-item { 
    display: flex; align-items: center; gap: 6px; font-size: 13px; 
    cursor: grab; user-select: none; margin: 0; color: var(--text-main);
    background: var(--card-bg); padding: 6px 12px; border-radius: 6px;
    border: 1px solid var(--border); transition: 0.2s;
  }
  .checkbox-item:hover { border-color: var(--accent); }
  .checkbox-item.over { border-color: var(--accent); background: var(--total-row-bg); }
  .checkbox-item input { cursor: pointer; accent-color: var(--accent); margin:0; }
  .drag-handle { color: var(--text-muted); cursor: grab; padding-right: 4px;}

  /* --- BẢNG BULK & CHUNG --- */
  .table-responsive { overflow-x: auto; border: 1px solid var(--border); border-radius: 11px; border-bottom: none;}
  table { width: 100%; border-collapse: collapse; text-align: center; background: transparent;}
  th, td { padding: 14px 16px; border-bottom: 1px solid var(--border); vertical-align: middle; white-space: nowrap; }
  th { 
    background: var(--table-th-bg); font-size: 12px; font-weight: 600; 
    color: var(--table-th-text); text-transform: uppercase; letter-spacing: 0.5px;
  }
  td { font-size: 13px; color: var(--text-main); }
  tr:hover td { background: var(--table-row-hover); }

  .badge { display: inline-flex; align-items: center; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; }
  .badge.ok { background: var(--badge-ok-bg); color: var(--badge-ok-text); }
  .badge.err { background: var(--badge-err-bg); color: var(--badge-err-text); }
  
  .msg { margin-top: 12px; font-size: 14px; }
  .msg.err { color: var(--badge-err-text); }
  .hint { font-size: 12px; color: var(--text-muted); margin-top: 8px; }

  .spinner { 
    display: inline-block; width: 14px; height: 14px; 
    border: 2px solid var(--border); border-top-color: var(--accent); 
    border-radius: 50%; animation: spin .7s linear infinite; vertical-align: -2px; 
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* --- MODAL CHI TIẾT HÓA ĐƠN GDT --- */
  .gdt-modal-overlay {
    position: fixed; inset: 0; background: rgba(6,10,28,.6);
    backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000; padding: 24px; animation: gdtFadeIn .18s ease;
  }
  @keyframes gdtFadeIn { from { opacity: 0; } to { opacity: 1; } }
  .gdt-modal-box {
    background: var(--card-bg-solid); border: 1px solid var(--border);
    border-radius: 16px; box-shadow: var(--card-shadow);
    width: 100%; max-width: 720px; max-height: 88vh;
    display: flex; flex-direction: column; overflow: hidden;
  }
  .gdt-modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 24px; border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .gdt-modal-header h3 { margin: 0; font-size: 16px; font-weight: 800; }
  .gdt-modal-close {
    background: transparent; box-shadow: none; color: var(--text-muted);
    padding: 4px 10px; font-size: 18px; line-height: 1; border-radius: 8px;
  }
  .gdt-modal-close:hover { background: var(--border); color: var(--text-main); transform: none; box-shadow: none; }
  .gdt-modal-body { padding: 20px 24px; overflow-y: auto; }
  .gdt-field-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px 20px;
  }
  .gdt-field {
    border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px;
    background: var(--checkbox-bg);
  }
  .gdt-field .gdt-field-label {
    font-size: 11px; font-weight: 700; color: var(--text-muted);
    text-transform: uppercase; letter-spacing: .4px; margin-bottom: 4px;
  }
  .gdt-field .gdt-field-value {
    font-size: 13.5px; color: var(--text-main); word-break: break-word; white-space: pre-wrap;
  }
  .gdt-section-title {
    font-size: 13px; font-weight: 800; color: var(--heading-color);
    margin: 22px 0 10px; padding-top: 16px; border-top: 1px dashed var(--border);
  }
  .gdt-section-title:first-child { margin-top: 0; padding-top: 0; border-top: none; }
  #gdtResultsContainer table tbody tr { cursor: pointer; }

  /* --- GIAO DIỆN BẢNG CHUẨN SEPAY V2 --- */
  .sepay-table { 
    width: 100%; border-collapse: collapse; background: transparent; 
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
  }
  
  .sepay-table th { 
    background: var(--table-th-bg); color: var(--table-th-text); font-weight: 600; font-size: 12px; 
    text-transform: uppercase; padding: 14px 16px; 
    border-bottom: 1px solid var(--border); border-right: 1px solid var(--border); 
  }
  .sepay-table td { 
    padding: 14px 16px; border-bottom: 1px solid var(--border); border-right: 1px solid var(--border); 
    color: var(--text-main); vertical-align: middle; font-size: 13px;
  }
  .sepay-table th:last-child, .sepay-table td:last-child { border-right: none; }

  /* --- BẢNG DANH SÁCH CHUYỂN KHOẢN LƯƠNG: thu gọn vừa nội dung --- */
  #bankTransferTable { table-layout: auto; }
  #bankTransferTable th, #bankTransferTable td { padding: 8px 10px; font-size: 12.5px; white-space: nowrap; }
  #bankTransferTable th:nth-child(1), #bankTransferTable td:nth-child(1) { width: 34px; text-align: center; }
  #bankTransferTable th:nth-child(3), #bankTransferTable td:nth-child(3) { width: 1%; }
  #bankTransferTable th:nth-child(4), #bankTransferTable td:nth-child(4) { width: 1%; }

  /* --- 3 BẢNG TRONG CARD "ĐỊNH KHOẢN HẠCH TOÁN": co vừa độ dài chữ, không kéo giãn hết chỗ --- */
  #accountingTable, #accountingTable2, #accountingTable3 { width: auto; }
  #accountingTable th, #accountingTable td,
  #accountingTable2 th, #accountingTable2 td,
  #accountingTable3 th, #accountingTable3 td { padding: 8px 12px; font-size: 12.5px; white-space: nowrap; }
  
  .amount-in { color: var(--amount-in); font-weight: 600; font-size: 13px;}
  .amount-out { color: var(--amount-out); font-weight: 600; font-size: 13px;}
  
  .tx-content-cell { max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .text-muted-small { color: var(--text-muted); font-size: 12px; margin-top: 4px; }
  .text-id { color: var(--text-muted); font-size: 12px; font-family: monospace;}

  .bank-tag { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; color: var(--text-main); }
  .bank-icon {
    width: 22px; height: 22px; border-radius: 50%; background: var(--accent); color: #fff;
    display: flex; justify-content: center; align-items: center; font-size: 11px; font-weight: 800;
  }
  .bank-logo-img {
    width: 22px; height: 22px; border-radius: 50%; object-fit: contain; background: #fff;
    border: 1px solid var(--border); flex-shrink: 0;
  }

  .tx-content-cell { cursor: pointer; transition: background-color 0.15s ease; }
  .tx-content-cell:hover { background-color: var(--accent-soft, rgba(37, 99, 235, 0.08)); text-decoration: underline dotted; }

  .sepay-table .total-row td {
    background-color: var(--total-row-bg) !important; 
    color: var(--text-main) !important;            
    border-bottom: none; border-right: 1px solid var(--border); 
  }
  .sepay-table .total-row td:last-child { border-right: none; }

  #airTable .total-row td {
    background-color: var(--total-row-bg) !important;
    color: var(--text-main) !important;
  }

  /* --- BẢNG LƯƠNG: thu gọn tiêu đề 2 dòng + cố định 2 cột đầu --- */
  #employeeTable { table-layout: auto; }
  #employeeTable th, #employeeTable td { white-space: normal; word-break: keep-all; }
  #employeeTable th {
    font-size: 11px; line-height: 1.35; padding: 8px 8px; letter-spacing: 0.2px;
    text-align: center !important;
  }
  #employeeTable td { padding: 8px 10px; white-space: nowrap; }
  #employeeTable .freeze-col-1, #employeeTable .freeze-col-2 {
    position: sticky; z-index: 2; background: var(--card-bg-solid);
  }
  #employeeTable thead .freeze-col-1, #employeeTable thead .freeze-col-2 { z-index: 4; }
  #employeeTable .freeze-col-1 {
    left: 0; width: auto; min-width: 60px; padding-left: 10px; padding-right: 10px;
  }
  #employeeTable .freeze-col-2 {
    left: 72px; width: 150px; min-width: 150px; max-width: 150px;
    box-shadow: 3px 0 6px -2px rgba(0,0,0,0.15);
  }
  #employeeTable td.freeze-col-1 {
    white-space: nowrap;
  }
  #employeeTable td.freeze-col-2 {
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .sepay-table .total-row td.freeze-col-1, .sepay-table .total-row td.freeze-col-2 {
    background-color: var(--total-row-bg-solid) !important;
  }
  #employeeTable .freeze-col-total {
    position: sticky; left: 0; z-index: 2;
    box-shadow: 3px 0 6px -2px rgba(0,0,0,0.15);
    background-color: var(--total-row-bg-solid) !important;
  }

  @media (max-width: 768px) {
    .app-body { flex-direction: column; overflow: auto; }
    .sidebar { width: 100% !important; flex-direction: row; justify-content: flex-start; overflow-x: auto; padding: 12px; border-right: none; border-bottom: 1px solid var(--border); }
    .sidebar-top { flex-direction: row; }
    .sidebar-bottom { display: none; /* Ẩn cụm Setting ở Mobile hoặc phải thiết kế lại dạng Popup */ }
    .sidebar-menu-title { display: none !important; }
    .menu-item { white-space: nowrap; padding: 10px 14px; margin: 0 4px; justify-content: flex-start !important; }
    .menu-text { display: inline !important; }
    .main-content { padding: 16px; padding-bottom: 80px; overflow: visible; -webkit-overflow-scrolling: touch; }
    #toggleSidebarBtn { display: none !important; }
    #accountingRow { flex-direction: column; }
    #accountingRow #accountingWrapper, #accountingRow #bankTransferWrapper { max-width: 100%; width: 100%; flex: 1 1 auto; }
    #accountingTable, #accountingTable2, #accountingTable3 { width: 100%; }

    /* --- HEADER GỌN LẠI TRÊN ĐIỆN THOẠI --- */
    .top-header {
      height: auto;
      flex-wrap: wrap;
      align-items: center;
      padding: 10px 14px;
      row-gap: 8px;
      gap: 8px;
    }
    .header-brand {
      font-size: 15px;
      letter-spacing: 0.2px;
      flex: 1 1 auto;
      min-width: 0;
    }
    .header-actions {
      width: 100%;
      flex-wrap: wrap;
      gap: 8px;
    }
    .header-actions #themeSegWrap {
      order: 1;
    }
    .header-actions #accessToken {
      order: 2;
      flex: 1 1 140px;
      min-width: 0;
    }
    .header-actions button:not(.acc-seg-btn) {
      order: 3;
      padding: 8px 14px;
      font-size: 12.5px;
      white-space: nowrap;
    }
    .header-actions #themeSegWrap .acc-seg-btn {
      padding: 6px 10px;
      font-size: 12px;
    }
  }

  /* --- Nút switch dạng pill cho card Định khoản Hạch toán --- */
  .acc-seg-wrap { display: inline-flex; flex-wrap: wrap; gap: 4px; padding: 4px; border-radius: 12px; background: var(--input-bg); border: 1px solid var(--input-border); }
  .header-actions .acc-seg-wrap { background: transparent; border: 1px solid var(--input-border); }
  .acc-seg-btn {
    padding: 7px 15px; border-radius: 9px; font-size: 13px; font-weight: 700; cursor: pointer;
    border: none; font-family: var(--font-body, inherit); transition: 0.15s;
    background: transparent; color: var(--text-muted);
    appearance: none; -webkit-appearance: none; outline: none; box-shadow: none;
  }
  .acc-seg-btn:focus, .acc-seg-btn:focus-visible { outline: none; box-shadow: none; }
  .acc-seg-btn.active {
    background: var(--btn-orange); color: var(--btn-orange-text);
    box-shadow: 0 6px 16px -4px rgba(240,161,36,.5);
  }

  /* --- GIAO DIỆN BẢNG GIAO DỊCH NHỎ GỌN --- */
  #txListTable th, 
  #txListTable td {
    padding: 16px 8px !important;
    font-size: 12px !important;
    line-height: 1.2;
    white-space: nowrap;
  }
  #txListTable th {
    font-size: 11px !important;
  }
  
  /* --- GIAO DIỆN BẢNG LƯƠNG NHỎ GỌN NHƯ EXCEL --- */
  #employeeTable th, 
  #employeeTable td {
    padding: 6px 8px !important; /* Thu nhỏ khoảng cách trên dưới trái phải */
    font-size: 12px !important;  /* Giảm cỡ chữ xuống một chút */
    line-height: 1.2;            /* Cắt giảm khoảng không thừa giữa các dòng */
    white-space: nowrap;         /* Ép chữ không tự động rớt dòng */
  }

  #employeeTable th {
    font-size: 11px !important;  /* Cỡ chữ tiêu đề nhỏ hơn dữ liệu 1 xíu */
    padding: 4px 8px !important;
  }
</style>
</head>
<body class="light-mode">

  <header class="top-header">
    <div class="header-brand">
      <button id="toggleSidebarBtn" onclick="toggleSidebar()" title="Thu gọn / Mở rộng Sidebar"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-menu-icon lucide-menu"><path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/></svg></button>
    </div>
    
    <!-- MODULE LỊCH TUẦN -->
    <div class="weekly-calendar-widget" id="weeklyCalendar">
      <div class="cal-info">
        <div class="cal-month" id="calMonthText"></div>
        <div class="cal-lunar" id="calLunarText"></div>
      </div>
      <div class="cal-days-wrap" id="calDaysWrap"></div>
    </div>

    <div class="header-actions" id="authCard">
      <div class="acc-seg-wrap" id="themeSegWrap">
        <button type="button" class="acc-seg-btn" id="themeBtnDark" onclick="changeTheme(false)">Tối</button>
        <button type="button" class="acc-seg-btn" id="themeBtnLight" onclick="changeTheme(true)">Sáng</button>
      </div>
      <input type="password" id="accessToken" placeholder="Mật khẩu hệ thống" />
      <button id="saveTokenBtn" onclick="saveToken()">Lưu khóa</button>
    </div>
  </header>

  <div class="app-body">
    
    <aside class="sidebar" id="appSidebar">
      <div class="sidebar-top">
        <div class="sidebar-menu-title">Chức năng chính</div>
        <div class="menu-item active" id="tabBulkBtn" onclick="switchTab('bulk')">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-text-search-icon lucide-text-search"><path d="M21 5H3"/><path d="M10 12H3"/><path d="M10 19H3"/><circle cx="17" cy="15" r="3"/><path d="m21 19-1.9-1.9"/></svg><span class="menu-text">Tra cứu hàng loạt</span>
        </div>
        <div class="menu-item" id="tabBankBtn" onclick="switchTab('bank')">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-chart-column-icon lucide-file-chart-column"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M8 18v-1"/><path d="M12 18v-6"/><path d="M16 18v-3"/></svg><span class="menu-text">Tổng hợp sao kê</span>
        </div>
        <div class="menu-item" id="tabTransactionBtn" onclick="switchTab('transaction')">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-piggy-bank-icon lucide-piggy-bank"><path d="M11 17h3v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a3.16 3.16 0 0 0 2-2h1a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-1a5 5 0 0 0-2-4V3a4 4 0 0 0-3.2 1.6l-.3.4H11a6 6 0 0 0-6 6v1a5 5 0 0 0 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1z"/><path d="M16 10h.01"/><path d="M2 8v1a2 2 0 0 0 2 2h1"/></svg><span class="menu-text">Tra cứu CK (SePay)</span>
        </div>
        <div class="menu-item" id="tabInvoiceBtn" onclick="switchTab('invoice')">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-search-icon lucide-file-search"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><circle cx="11.5" cy="14.5" r="2.5"/><path d="M13.3 16.3 15 18"/></svg><span class="menu-text">Tra cứu hóa đơn</span>
        </div>
        <div class="menu-item" id="tabGdtBtn" onclick="switchTab('gdt')">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-receipt-text-icon lucide-receipt-text"><path d="M13 16H8"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z"/></svg><span class="menu-text">Tra cứu HĐĐT (GDT)</span>
        </div>
        <div class="menu-item" id="tabEmployeeBtn" onclick="switchTab('employee')">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-users-icon lucide-users"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/></svg><span class="menu-text">Xử lý bảng lương</span>
        </div>
        <div class="menu-item" id="tabAirBtn" onclick="switchTab('air')">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plane-takeoff-icon lucide-plane-takeoff"><path d="M2 22h20"/><path d="M6.36 17.4 4 17l-2-4 1.1-.55a2 2 0 0 1 1.8 0l.17.1a2 2 0 0 0 1.8 0L8 12 5 6l.9-.45a2 2 0 0 1 2.09.2l4.02 3a2 2 0 0 0 2.1.2l4.19-2.06a2.41 2.41 0 0 1 1.73-.17L21 7a1.4 1.4 0 0 1 .87 1.99l-.38.76c-.23.46-.6.84-1.07 1.08L7.58 17.2a2 2 0 0 1-1.22.18Z"/></svg><span class="menu-text">Xuất Air Packing List</span>
        </div>
      </div>

      <div class="sidebar-bottom">
      </div>
    </aside>

    <main class="content main-content">

      <div id="tabBulk">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2 style="margin:0">Tra cứu hàng loạt</h2>
          <button id="copyExcelBtn" class="btn-outline" onclick="copyTableToExcel()" style="display: none; font-size: 13px;">📋 Copy cho Excel / Sheets</button>
        </div>
        <div class="card">
          <label>Danh sách mã đơn / mã KH (DH..., BIZ..., SA...) — cách nhau bằng phẩy hoặc xuống dòng</label>
          <textarea id="bulkCodes" rows="5" placeholder="VD:&#10;DH18700&#10;BIZ02120&#10;SA00123"></textarea>
          <div style="margin-top: 14px;">
            <label>Hệ thống tra cứu cho mã KH (SA...) — bắt buộc chọn nếu danh sách có mã SA</label>
            <select id="bulkSaSystem" style="width: 100%; max-width: 320px; padding: 12px 14px; border-radius: 11px; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-main); font-size: 14px; outline: none; cursor: pointer;">
              <option value="">-- Chọn hệ thống (chỉ cần khi có mã SA...) --</option>
              <option value="10X">10X (10xtrading)</option>
              <option value="SOLOBIZ">SOLOBIZ</option>
            </select>
          </div>
          <div style="margin-top: 16px;">
            <label style="color: var(--accent); margin-bottom: 4px;">⚙ Tùy chỉnh cột (Kéo thả '☰' để đổi chỗ, Tích để ẩn/hiện)</label>
            <div id="colSelector" class="checkbox-group"></div>
          </div>
          <div style="margin-top: 20px;">
            <button id="bulkBtn" onclick="doBulkLookup()">Chạy tiến trình tra cứu</button>
          </div>
        </div>
        <div id="bulkResultArea">
          <div class="msg" id="bulkProgress" style="display:none; margin-bottom: 12px;"></div>
          <div class="table-responsive" style="display:none;" id="bulkTableWrap">
            <table class="bulk-table" id="bulkTable">
              <thead id="bulkThead"></thead>
              <tbody id="bulkTbody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div id="tabBank" class="hidden">
        <h2>Tổng hợp Sao kê Ngân hàng</h2>
        <div class="card">
          <label>Chọn file Excel Sao kê ngân hàng (.xlsx)</label>
          <div class="row">
            <div><input type="file" id="bankExcelFile" accept=".xlsx" /></div>
            <!-- Đổi tên nút để phù hợp luồng UX mới -->
            <button id="bankBtn" onclick="doBankStatement()">Xử lý & Xem trước</button>
          </div>
          <div class="hint" style="margin-top: 12px; color: var(--badge-ok-text); font-weight:500;">
            Hệ thống sẽ gộp các giao dịch có chung số tiền thành 1 dòng, tính toán và tự thiết lập file có sẵn công thức số dư lũy kế.
          </div>
          <div id="bankResult" class="msg"></div>
        </div>
        
        <!-- Khung chứa bảng dữ liệu (mặc định ẩn) -->
        <div id="bankTableWrap" style="display:none;" class="card"></div>
      </div>

      <div id="tabTransaction" class="hidden">
        <h2>Kiểm tra giao dịch SePay v2</h2>
        
        <div class="card">
          <label>Mã đơn hàng / Nội dung CK cần tìm (Enter để tìm)</label>
          <div class="row">
            <div><input type="text" id="txSearchCode" placeholder="Nhập mã... VD: DH18700" onkeydown="if(event.key==='Enter') doTxSearch()" /></div>
            <button id="txSearchBtn" onclick="doTxSearch()">Tra cứu 1 mã</button>
          </div>
          <div id="txSearchResult" style="margin-top: 20px;"></div>
        </div>

        <div class="card">
          <h3 style="margin-top:0; font-size:16px; font-weight:700;">Liệt kê giao dịch theo thời gian & Ngân hàng</h3>
          <div class="row" style="align-items: flex-end; margin-bottom: 20px;">
            <div style="flex: 1; min-width: 120px;">
              <label>Từ ngày</label>
              <input type="text" id="txDateFrom" placeholder="DD/MM/YYYY" style="cursor: pointer;" />
            </div>
            <div style="flex: 1; min-width: 120px;">
              <label>Đến ngày</label>
              <input type="text" id="txDateTo" placeholder="DD/MM/YYYY" style="cursor: pointer;" />
            </div>
            <div style="flex: 1; min-width: 200px;">
              <label>Tài khoản (Tùy chọn)</label>
              <div class="multi-select-container" id="multiSelectContainer">
                <div class="multi-select-label" id="txBankAccountIdLabel" onclick="document.getElementById('txBankAccountIdDropdown').classList.toggle('show')">
                  -- Tất cả tài khoản --
                </div>
                <div class="multi-select-dropdown" id="txBankAccountIdDropdown">
                  </div>
              </div>
            </div>
            <div style="flex: 1; min-width: 120px;">
              <label>&nbsp;</label>
              <button id="txListBtn" onclick="doTxList()" style="width: 100%;">Lấy danh sách</button>
            </div>
          </div>
          <div id="txListResult" style="margin-top: 20px;"></div>
        </div>

      </div>
      <div id="tabEmployee" class="hidden">
        <h2>Lấy dữ liệu Nhân sự (Từ file Excel)</h2>
        <div class="card">
          <label>Chọn file Excel (.xlsx) chứa các sheet nhân sự (VD: T012026, T022026...)</label>
          <div class="row" style="align-items: flex-end;">
            <div style="flex: 1 1 0%; min-width: 160px;">
              <input type="file" id="employeeExcelFile" accept=".xlsx" style="width:100%;" />
            </div>
            <div style="flex: 0 0 175px; min-width: 175px;">
              <label style="margin-bottom: 8px;">Chọn Sheet (Tháng)</label>
              <select id="sheetSelect" onchange="displaySheetData()" style="width: 100%; padding: 12px 14px; border-radius: 11px; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-main); font-size: 14px; outline: none; cursor: pointer;">
                <option value="">-- Chưa có dữ liệu --</option>
              </select>
            </div>
            <div style="flex: 0 0 auto; min-width: 0;">
              <button id="fetchSheetsBtn" onclick="doFetchEmployeesExcel()">Xử lý file</button>
            </div>
          </div>
          <div id="sheetsResult" class="msg" style="margin-top: 12px;"></div>
        </div>

        <div class="card" id="employeeTableWrapper" style="display:none;">
          <h3 style="margin-top:0; font-size:16px;">Bảng lương chi tiết (Từ dòng 8)</h3>
          <div class="table-responsive">
            <table class="sepay-table" id="employeeTable">
              <thead>
                <tr>
                  <th class="freeze-col-1" rowspan="2" style="vertical-align: middle;">Mã NV<br>(B)</th>
                  <th class="freeze-col-2" rowspan="2" style="vertical-align: middle;">Tên NV<br>(C)</th>
                  <th rowspan="2" style="text-align: right; vertical-align: middle;">Lương<br>cơ bản (H)</th>
                  <th rowspan="2" style="text-align: center; vertical-align: middle;">Ngày công<br>TT (J)</th>
                  <th rowspan="2" style="text-align: center; vertical-align: middle;">Ngày công<br>HL (K)</th>
                  <th colspan="4" style="text-align: center; background: var(--badge-ok-bg); color: var(--heading-color);">Các khoản chế độ và phúc lợi</th>
                  <th rowspan="2" style="text-align: right; vertical-align: middle;">Lương<br>tính toán</th>
                  <th colspan="5" style="text-align: center; background: var(--badge-ok-bg); color: var(--heading-color);">Thu nhập bổ sung</th>
                  <th colspan="5" style="text-align: center; background: var(--badge-err-bg); color: var(--heading-color);">Các khoản khấu trừ</th>
                  <th rowspan="2" style="text-align: right; vertical-align: middle;">Thực<br>nhận (AD)</th>
                  <th colspan="2" style="text-align: center; background: var(--badge-ok-bg); color: var(--heading-color);">Thông tin nhận lương</th>
                  <th colspan="8" style="text-align: center; background: var(--badge-err-bg); color: var(--heading-color);">BHXH Công ty đóng</th>
                  <th rowspan="2" style="text-align: right; vertical-align: middle;">CĐ<br>(AO)</th>
                </tr>
                <tr>
                  <th style="text-align: right;">Trang<br>Phục (L)</th>
                  <th style="text-align: right;">Cơm<br>Trưa (M)</th>
                  <th style="text-align: right;">Trách<br>nhiệm (N)</th>
                  <th style="text-align: right;">Chi phí HT-<br>BHXH (O)</th>
                  <th style="text-align: right;">Hoa hồng<br>bán hàng (P)</th>
                  <th style="text-align: right;">Thưởng ghi nhận<br>đóng góp (Q)</th>
                  <th style="text-align: right;">Lương phép<br>năm (R)</th>
                  <th style="text-align: right;">Khác<br>(S)</th>
                  <th style="text-align: right;">Tổng thu nhập<br>trong tháng (T)</th>
                  <th style="text-align: right;">BHXH<br>(U)</th>
                  <th style="text-align: right;">BHYT<br>(V)</th>
                  <th style="text-align: right;">BHTN<br>(W)</th>
                  <th style="text-align: right;">CĐ<br>(X)</th>
                  <th style="text-align: right;">Tiền thuế<br>TNCN (AB)</th>
                  <th style="text-align: center;">STK<br>(AE)</th>
                  <th style="text-align: center;">Ngân hàng<br>(AF)</th>
                  <th style="text-align: right;">HT-TT<br>(AJ)</th>
                  <th style="text-align: right;">ÔĐ-TS<br>(AK)</th>
                  <th style="text-align: right;">TNLĐ-BNN<br>(AL)</th>
                  <th style="text-align: right;">Tổng<br>BHXH</th>
                  <th style="text-align: right;">BHYT<br>(AM)</th>
                  <th style="text-align: right;">BHTN<br>(AN)</th>
                  <th style="text-align: right;">Tổng BHXH<br>NLĐ Đóng</th>
                  <th style="text-align: right;">Tổng BHXH<br>CTY Đóng</th>
                </tr>
              </thead>
              <tbody id="employeeTbody"></tbody>
            </table>
          </div>
        </div>
        <div id="accountingRow" style="margin-top: 20px; display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start;">
          <div class="card" id="accountingWrapper" style="display:none; margin-top: 0; flex: 0 0 auto; min-width: 0;">
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom: 16px;">
              <h3 style="margin:0; font-size:16px;">Định khoản Hạch toán</h3>
              <div class="acc-seg-wrap">
                <button type="button" class="acc-seg-btn active" id="accTabBtn-luongthuong" onclick="switchAccTab('luongthuong')">Lương thưởng</button>
                <button type="button" class="acc-seg-btn" id="accTabBtn-bhxh" onclick="switchAccTab('bhxh')">BHXH cty đóng</button>
                <button type="button" class="acc-seg-btn" id="accTabBtn-bhxhnld" onclick="switchAccTab('bhxhnld')">BHXH NLĐ đóng</button>
              </div>
            </div>
            <div id="accPanelLuongThuong">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom: 12px; flex-wrap: nowrap;">
                <div class="text-muted-small" style="margin:0; white-space:nowrap;">Click vào dòng để xem chi tiết</div>
                <button id="copyAmisBtn" class="btn-outline" onclick="copyForMisaAmis()" style="font-size: 12px; padding: 6px 10px; white-space:nowrap; flex-shrink:0;">📋 Copy cho MISA AMIS</button>
              </div>
              <div class="table-responsive">
                <table class="sepay-table" id="accountingTable">
                  <thead>
                    <tr>
                      <th style="width: 80px;">TK Nợ</th>
                      <th style="width: 80px;">TK Có</th>
                      <th>Diễn giải</th>
                      <th style="text-align: right;">Số tiền (VNĐ)</th>
                      <th style="text-align: center; width: 60px;">Mở rộng</th>
                    </tr>
                  </thead>
                  <tbody id="accountingTbody"></tbody>
                </table>
              </div>
            </div>
            <div id="accPanelBhxh" style="display:none;">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom: 12px; flex-wrap: nowrap;">
                <div class="text-muted-small" style="margin:0; white-space:nowrap;">Click vào dòng để xem chi tiết</div>
                <button id="copyAmisBhxhBtn" class="btn-outline" onclick="copyForMisaAmisBhxh()" style="font-size: 12px; padding: 6px 10px; white-space:nowrap; flex-shrink:0;">📋 Copy cho MISA AMIS</button>
              </div>
              <div class="table-responsive">
                <table class="sepay-table" id="accountingTable2">
                  <thead>
                    <tr>
                      <th style="width: 80px;">TK Nợ</th>
                      <th style="width: 80px;">TK Có</th>
                      <th>Diễn giải</th>
                      <th style="text-align: right;">Số tiền (VNĐ)</th>
                      <th style="text-align: center; width: 60px;">Mở rộng</th>
                    </tr>
                  </thead>
                  <tbody id="accountingTbody2"></tbody>
                </table>
              </div>
            </div>
            <div id="accPanelBhxhNld" style="display:none;">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom: 12px; flex-wrap: nowrap;">
                <div class="text-muted-small" style="margin:0; white-space:nowrap;">Click vào dòng để xem chi tiết</div>
                <button id="copyAmisBhxhNldBtn" class="btn-outline" onclick="copyForMisaAmisBhxhNld()" style="font-size: 12px; padding: 6px 10px; white-space:nowrap; flex-shrink:0;">📋 Copy cho MISA AMIS</button>
              </div>
              <div class="table-responsive">
                <table class="sepay-table" id="accountingTable3">
                  <thead>
                    <tr>
                      <th style="width: 80px;">TK Nợ</th>
                      <th style="width: 80px;">TK Có</th>
                      <th>Diễn giải</th>
                      <th style="text-align: right;">Số tiền (VNĐ)</th>
                      <th style="text-align: center; width: 60px;">Mở rộng</th>
                    </tr>
                  </thead>
                  <tbody id="accountingTbody3"></tbody>
                </table>
              </div>
            </div>
          </div>
          <div class="card" id="bankTransferWrapper" style="display:none; margin-top: 0; flex: 1 1 340px; min-width: 340px;">
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom: 16px;">
              <h3 style="margin:0; font-size:16px;">Danh sách chuyển khoản lương</h3>
              <div class="acc-seg-wrap" id="bankTabsWrap"></div>
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom: 12px; flex-wrap: wrap;">
              <div class="text-muted-small" style="margin:0;">ACB đi theo lô, NH khác đi tay từng GD</div>
              <button id="copyBankTransferBtn" class="btn-outline" onclick="copyBankTransferForBank()" style="font-size: 12px; padding: 6px 10px; white-space:nowrap; flex-shrink:0;">📋 Copy dán vào file NH</button>
            </div>
            <div class="table-responsive">
              <table class="sepay-table" id="bankTransferTable">
                <thead>
                  <tr>
                    <th style="width: 50px; text-align: center;">STT</th>
                    <th>Tên NV</th>
                    <th>Số tài khoản</th>
                    <th style="text-align: right;">Số tiền</th>
                  </tr>
                </thead>
                <tbody id="bankTransferTbody"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <div id="tabInvoice" class="hidden">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2 style="margin:0">Tra cứu hóa đơn</h2>
          <button id="copyInvoiceBtn" class="btn-outline" onclick="copyTableToClipboard('invoiceTable', 'copyInvoiceBtn')" style="display: none; font-size: 13px;">📋 Copy cho Excel / Sheets</button>
        </div>
        <div class="card">
          <label>Danh sách số hóa đơn (cách nhau bằng phẩy hoặc xuống dòng)</label>
          <textarea id="invoiceCodes" rows="5" placeholder="VD:&#10;1277&#10;1280"></textarea>
          <div style="margin-top: 20px;">
            <button id="invoiceBtn" onclick="doInvoiceLookup()">Chạy tiến trình tra cứu</button>
          </div>
        </div>
        <div id="invoiceResultArea">
          <div class="msg" id="invoiceProgress" style="display:none; margin-bottom: 12px;"></div>
          <div class="table-responsive" style="display:none;" id="invoiceTableWrap">
            <table class="bulk-table" id="invoiceTable">
              <thead>
                <tr>
                  <th>Trạng thái</th>
                  <th>Số hóa đơn</th>
                  <th>Mẫu số &amp; Ký hiệu</th>
                  <th>Ngày lập</th>
                  <th>Khách hàng</th>
                  <th>Số CCCD</th>
                  <th>Địa chỉ</th>
                  <th>Tiền hàng</th>
                  <th>Tiền thuế</th>
                  <th>Tổng tiền</th>
                  <th>Hình thức TT</th>
                  <th>Loại hóa đơn</th>
                </tr>
              </thead>
              <tbody id="invoiceTbody"></tbody>
            </table>
          </div>
        </div>
        <div class="card" style="margin-top: 20px;">
          <h3 style="margin: 0 0 14px 0;">Tra cứu theo khoảng ngày (lấy toàn bộ hóa đơn)</h3>
          <div class="row" style="align-items: flex-end;">
            <div style="flex: 1; min-width: 120px;">
              <label>Từ ngày</label>
              <input type="text" id="invDateFrom" placeholder="DD/MM/YYYY" style="cursor: pointer;" />
            </div>
            <div style="flex: 1; min-width: 120px;">
              <label>Đến ngày</label>
              <input type="text" id="invDateTo" placeholder="DD/MM/YYYY" style="cursor: pointer;" />
            </div>
            <div style="flex: 1; min-width: 200px;">
              <label>Loại hóa đơn</label>
              <select id="invInvoiceKind" style="width: 100%; padding: 12px 14px; border-radius: 11px; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-main); font-size: 14px; outline: none; cursor: pointer;">
                <option value="2" selected>Chỉ hóa đơn gốc</option>
                <option value="-1">Tất cả (gồm điều chỉnh/thay thế)</option>
              </select>
            </div>
            <div style="flex: 1; min-width: 140px;">
              <label>&nbsp;</label>
              <button id="invByDateBtn" onclick="doInvoiceLookupByDate()" style="width: 100%;">Lấy toàn bộ hóa đơn</button>
            </div>
          </div>
        </div>
        <div id="invoiceByDateResultArea" style="margin-top: 16px;">
          <div class="msg" id="invoiceByDateProgress" style="display:none; margin-bottom: 12px;"></div>
          <div id="invoiceByDateResultsContainer"></div>
        </div>
      </div>
      <div id="tabGdt" class="hidden">
        <h2 style="margin:0 0 16px 0">Tra cứu Hóa đơn điện tử (Tổng cục Thuế)</h2>
        <div class="card">
          <div class="row">
            <div style="flex: 1; min-width: 180px;">
              <label>Mã số thuế (Username)</label>
              <input type="text" id="gdtUsername" placeholder="VD: 0319353578" autocomplete="off" />
            </div>
            <div style="flex: 1; min-width: 180px;">
              <label>Mật khẩu (Password)</label>
              <input type="text" id="gdtPassword" placeholder="Mật khẩu tài khoản HĐĐT" autocomplete="off" />
            </div>
          </div>
          <div class="row" style="align-items: flex-end; margin-top: 14px;">
            <div style="flex: 1; min-width: 120px;">
              <label>Từ ngày</label>
              <input type="text" id="gdtDateFrom" placeholder="DD/MM/YYYY" style="cursor: pointer;" />
            </div>
            <div style="flex: 1; min-width: 120px;">
              <label>Đến ngày</label>
              <input type="text" id="gdtDateTo" placeholder="DD/MM/YYYY" style="cursor: pointer;" />
            </div>
            <div style="flex: 1; min-width: 160px;">
              <label>Loại hóa đơn</label>
              <select id="gdtIsPurchase" style="width: 100%; padding: 12px 14px; border-radius: 11px; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-main); font-size: 14px; outline: none; cursor: pointer;">
                <option value="true">Mua vào</option>
                <option value="false">Bán ra</option>
              </select>
            </div>
            <div style="flex: 1; min-width: 140px;">
              <label>&nbsp;</label>
              <button id="gdtSearchBtn" onclick="doGdtInvoiceLookup()" style="width: 100%;">Tra cứu hóa đơn</button>
            </div>
          </div>
          <div class="hint" style="margin-top: 12px; color: var(--text-muted); font-size: 12.5px;">
            🔒 Mã số thuế/mật khẩu chỉ được gửi trực tiếp tới máy chủ Thuế để đăng nhập, không lưu lại ở đâu cả.
          </div>
        </div>

        <div id="gdtResultArea">
          <div class="msg" id="gdtProgress" style="display:none; margin-bottom: 12px;"></div>
          <div id="gdtResultsContainer"></div>
        </div>
      </div>
      <div id="tabAir" class="hidden">
        <h2>Phần mềm Xuất Air Packing List</h2>
        <div class="card">
          <label>Chọn file Excel gốc (.xlsx, .xls) để xử lý</label>
          <div class="row">
            <div><input type="file" id="airExcelFile" accept=".xlsx, .xls" /></div>
            <button id="exportAirBtn" onclick="doProcessAirPacking()">Xử lý & Xem trước</button>
          </div>
          <div class="hint" style="margin-top: 12px; color: var(--badge-ok-text); font-weight:500;">
            Hệ thống sẽ tự động lọc BAG NO, cộng dồn QTITY, lấy KGS đầu tiên. Kết quả sẽ hiển thị bên dưới để bạn kiểm tra trước khi tải file Excel.
          </div>
          <div id="airResult" class="msg" style="margin-top: 12px;"></div>
        </div>

        <div id="airResultArea" style="display:none;">
          <div class="card" style="margin-top: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
              <div>
                <h3 style="margin:0 0 4px 0;" id="airPreviewTitle">Xem trước dữ liệu</h3>
                <div class="hint" style="margin:0;">Kiểm tra kỹ số liệu bên dưới. Nếu đúng, bấm "Tải về Excel" để xuất file.</div>
              </div>
              <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <button id="downloadAirBtn" onclick="doDownloadAirPacking()">⬇️ Tải về Excel</button>
                <button id="shareAirBtn" onclick="doShareAirPacking()" style="display:none; background: var(--accent-gradient);">📤 Chia sẻ ngay (Zalo/WhatsApp...)</button>
              </div>
            </div>
            <div style="display:flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; margin-top: 14px;">
              <div class="table-responsive" style="width: fit-content; max-width: 100%; flex: 0 0 auto;">
                <table class="bulk-table" id="airTable" style="width: auto;">
                  <thead>
                    <tr>
                      <th>STT</th>
                      <th>Bag Mark</th>
                      <th>Customer Name</th>
                      <th style="text-align:right;">SET</th>
                      <th style="text-align:right;">Weight (KGS)</th>
                    </tr>
                  </thead>
                  <tbody id="airTbody"></tbody>
                  <tfoot>
                    <tr id="airTotalRow" class="total-row" style="font-weight:700;">
                      <td></td>
                      <td id="airTotalBags"></td>
                      <td></td>
                      <td id="airTotalSets" style="text-align:right;"></td>
                      <td id="airTotalWeight" style="text-align:right;"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div style="flex: 1 1 300px; max-width: 50%; min-width: 220px;">
                <label style="display:block; margin-bottom:8px;">Ghi chú thêm (sẽ được ghi vào cột B của file Excel, cách dòng tổng 2 dòng)</label>
                <div style="display:flex; flex-direction: column; gap: 10px;">
                  <input type="text" class="air-extra-input" id="airNote1" placeholder="Dòng ghi chú 1" />
                  <input type="text" class="air-extra-input" id="airNote2" placeholder="Dòng ghi chú 2" />
                  <input type="text" class="air-extra-input" id="airNote3" placeholder="Dòng ghi chú 3" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>

<div id="gdtDetailOverlay" class="gdt-modal-overlay hidden" onclick="if(event.target===this) closeGdtInvoiceDetail()">
  <div class="gdt-modal-box">
    <div class="gdt-modal-header">
      <h3>📄 Chi tiết hóa đơn</h3>
      <button type="button" class="gdt-modal-close" onclick="closeGdtInvoiceDetail()">✕</button>
    </div>
    <div class="gdt-modal-body" id="gdtDetailBody">
      <span class="spinner" style="color:var(--accent)"></span> Đang tải chi tiết hóa đơn...
    </div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/flatpickr"></script>
<script src="https://npmcdn.com/flatpickr/dist/l10n/vn.js"></script>
<script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js"></script>

<script>
// =======================================================
// THUẬT TOÁN TÍNH ÂM LỊCH CỦA HỒ NGỌC ĐỨC (Múi giờ +7)
// =======================================================
const PI = Math.PI;

function jdFromDate(dd, mm, yyyy) {
    let a, b, c, e, f;
    if (mm < 3) { yyyy--; mm += 12; }
    a = Math.floor(yyyy / 100);
    b = Math.floor(a / 4);
    c = 2 - a + b;
    e = Math.floor(365.25 * (yyyy + 4716));
    f = Math.floor(30.6001 * (mm + 1));
    return dd + c + e + f - 1524.5;
}

function jdToDate(jd) {
    let a, b, c, d, e, m, day, month, year;
    let z, f, alpha;
    z = Math.floor(jd + 0.5);
    f = (jd + 0.5) - z;
    if (z < 2299161) { a = z; } 
    else {
        alpha = Math.floor((z - 1867216.25) / 36524.25);
        a = z + 1 + alpha - Math.floor(alpha / 4);
    }
    b = a + 1524;
    c = Math.floor((b - 122.1) / 365.25);
    d = Math.floor(365.25 * c);
    e = Math.floor((b - d) / 30.6001);
    day = b - d - Math.floor(30.6001 * e) + f;
    month = (e < 14) ? (e - 1) : (e - 13);
    year = (month > 2) ? (c - 4716) : (c - 4715);
    return [day, month, year];
}

function getSunLongitude(jdn, timeZone) {
    let T = (jdn - 2451545.0 - timeZone / 24.0) / 36525.0;
    let T2 = T * T;
    let dr = PI / 180.0;
    let L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T2;
    let M = 357.52911 + 35999.05029 * T - 0.0001537 * T2;
    let e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T2;
    let C = (1.914602 - 0.004817 * T - 0.000014 * T2) * Math.sin(M * dr) +
            (0.019993 - 0.000101 * T) * Math.sin(2 * M * dr) +
            0.000289 * Math.sin(3 * M * dr);
    let theta = L0 + C;
    return theta - 360.0 * Math.floor(theta / 360.0);
}

function getNewMoonDay(k, timeZone) {
    let T = k / 1236.85;
    let T2 = T * T;
    let T3 = T2 * T;
    let dr = PI / 180.0;
    let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
    let Jd2 = Jd1 + 0.1734 - 0.000393 * T * Math.sin(145.1 * dr) + 0.0021 * Math.sin(199.5 * dr);
    let M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
    let Mprime = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
    let F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
    let deltaJd = (0.1734 - 0.000393 * T) * Math.sin(M * dr) +
                  0.0021 * Math.sin(2 * M * dr) - 0.4068 * Math.sin(Mprime * dr) +
                  0.0161 * Math.sin(2 * Mprime * dr) - 0.0004 * Math.sin(3 * Mprime * dr) +
                  0.0104 * Math.sin(2 * F * dr) - 0.0051 * Math.sin(M * dr + Mprime * dr) -
                  0.0074 * Math.sin(M * dr - Mprime * dr) + 0.0004 * Math.sin(2 * F * dr + M * dr) -
                  0.0004 * Math.sin(2 * F * dr - M * dr) - 0.0006 * Math.sin(2 * F * dr + Mprime * dr) +
                  0.0010 * Math.sin(2 * F * dr - Mprime * dr) + 0.0005 * Math.sin(M * dr + 2 * Mprime * dr);
    return Math.floor(Jd1 + deltaJd + 0.5 + timeZone / 24.0);
}

function getLunarMonth11(yy, timeZone) {
    let off = yy - 1900;
    let k = Math.floor(off * 12.3685);
    let nm = getNewMoonDay(k, timeZone);
    let sunLong = getSunLongitude(nm, timeZone);
    if (sunLong >= 9) nm = getNewMoonDay(k - 1, timeZone);
    return nm;
}

function getLeapMonthOffset(a11, timeZone) {
    let k, arc, i, leapMonth = 0, isLeap = false;
    let last = a11;
    arc = getSunLongitude(last, timeZone);
    for (i = 1; i <= 14; i++) {
        let next = getNewMoonDay(1, timeZone); 
    }
    return leapMonth;
}

function convertSolar2Lunar(dd, mm, yyyy, timeZone) {
    let jdn = jdFromDate(dd, mm, yyyy);
    let k = Math.floor((jdn - 2415021.076998695) / 29.530588853);
    let monthStart = getNewMoonDay(k + 1, timeZone);
    if (monthStart > jdn) monthStart = getNewMoonDay(k, timeZone);
    let a11 = getLunarMonth11(yyyy, timeZone);
    let b11 = a11;
    if (a11 >= monthStart) {
        a11 = getLunarMonth11(yyyy - 1, timeZone);
    } else {
        b11 = getLunarMonth11(yyyy + 1, timeZone);
    }
    let lunarDay = Math.floor(jdn + 0.5) - monthStart + 1;
    let diff = Math.floor((monthStart - a11) / 29);
    let lunarMonth = diff + 11;
    let lunarYear = yyyy;
    if (lunarMonth > 12) { lunarMonth -= 12; }
    if (lunarMonth < 11) { lunarYear++; }
    
    return { 
        lunarDay: lunarDay, 
        lunarMonth: lunarMonth, 
        lunarYear: lunarYear 
    };
}

// =======================================================
// RENDER LỊCH TUẦN LÊN HEADER (Bắt đầu từ Thứ 2)
// =======================================================
function renderWeeklyCalendar() {
    const wrap = document.getElementById("calDaysWrap");
    const monthText = document.getElementById("calMonthText");
    const lunarText = document.getElementById("calLunarText");
    
    if (!wrap) return;

    const today = new Date();
    const currentDayOfWeek = today.getDay(); // 0: CN, 1: T2, ..., 6: T7
    
    // TÍNH TOÁN LÙI VỀ THỨ 2 ĐẦU TUẦN
    const offset = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - offset);

    // Mảng thứ tự bắt đầu từ Thứ 2
    const daysOfWeek = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
    let html = "";

    for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        
        const isToday = d.toDateString() === today.toDateString();
        
        // Vì mảng bắt đầu từ T2 (index 0), nên T7 là index 5 và CN là index 6
        const isWeekend = i === 5 || i === 6; 
        
        const dateNum = d.getDate();
        const monthNum = d.getMonth() + 1;
        const yearNum = d.getFullYear();
        
        // GỌI HÀM ÂM LỊCH CHUẨN (Múi giờ +7)
        const lunar = convertSolar2Lunar(dateNum, monthNum, yearNum, 7);
        
        if (isToday) {
            if (monthText) monthText.innerText = `Tháng ${monthNum} - ${yearNum}`;
            if (lunarText) lunarText.innerText = `Âm Lịch tháng ${lunar.lunarMonth}`;
        }

        let classes = "cal-day-block";
        if (isToday) classes += " active";
        if (isWeekend) classes += " weekend"; // Đánh dấu màu pastel cho T7, CN

        html += `
            <div class="${classes}">
                <div class="cal-dow">${daysOfWeek[i]}</div>
                <div class="cal-date">${dateNum}</div>
                <div class="cal-lunar-date">${lunar.lunarDay}</div>
                <div class="cal-dot"></div>
            </div>
        `;
    }
    
    wrap.innerHTML = html;
}

const FIELDS = [
  ["order_code", "Mã đơn/KH"], ["system", "Hệ thống"], ["lead_email", "Email KH"],
  ["lead_phone", "SĐT KH"], ["lead_cccd", "Số CCCD"], ["username", "Username"],
  ["users_name", "Họ tên"], ["orders_amount", "Số tiền"], ["einvoice_created_at", "Ngày TT"],
  ["invoice_number", "Số hóa đơn"], ["ref_username", "Ref user"], ["ref_name", "Ref tên"]
];

let currentColumns = [
  { key: "status", label: "Trạng thái", visible: true },
  ...FIELDS.map(f => ({ key: f[0], label: f[1], visible: true }))
];
let bulkData = []; 

function getToken() { 
  try { return localStorage.getItem("sepay_access_token") || ""; } catch(e) { return ""; } 
}

// Cập nhật giao diện ô mật khẩu / nút theo trạng thái đã lưu hay chưa.
// showInput = true  -> hiện ô nhập để gõ/đổi mật khẩu
// showInput = false -> ẩn ô nhập, nhường chỗ cho widget lịch, đổi nút thành "Đổi mật khẩu"
function setAuthUIState(showInput) {
  const input = document.getElementById("accessToken");
  const btn = document.getElementById("saveTokenBtn");
  if (!input || !btn) return;

  if (showInput) {
    document.body.classList.remove("has-token");
    input.style.display = "";
    input.value = "";
    input.placeholder = "Mật khẩu hệ thống";
    btn.innerText = "Lưu khóa";
    btn.onclick = saveToken;
  } else {
    document.body.classList.add("has-token");
    input.style.display = "none";
    btn.innerText = "Đổi mật khẩu";
    btn.onclick = function () { setAuthUIState(true); };
  }
}

function saveToken() {
  const token = document.getElementById("accessToken").value.trim();
  if (!token) { return; } // Không lưu chuỗi rỗng
  try {
    localStorage.setItem("sepay_access_token", token);
    setAuthUIState(false);
  } catch(e) { alert("Không thể lưu mật khẩu do trình duyệt chặn."); }
}

/* ---------------- LOGIC GIAO DIỆN & SIDEBAR ---------------- */
function toggleSidebar() {
  const sidebar = document.getElementById("appSidebar");
  sidebar.classList.toggle("collapsed");
  const isCollapsed = sidebar.classList.contains("collapsed");
  localStorage.setItem("sidebar_collapsed", isCollapsed ? "true" : "false");
}

function changeTheme(isLight) {
  const flatpickrTheme = document.getElementById("flatpickr-theme");
  const btnDark = document.getElementById("themeBtnDark");
  const btnLight = document.getElementById("themeBtnLight");
  if(isLight) {
    document.body.classList.add("light-mode");
    localStorage.setItem("app_theme", "light");
    flatpickrTheme.href = "https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/light.css";
    if(btnLight) btnLight.classList.add("active");
    if(btnDark) btnDark.classList.remove("active");
  } else {
    document.body.classList.remove("light-mode");
    localStorage.setItem("app_theme", "dark");
    flatpickrTheme.href = "https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/dark.css";
    if(btnDark) btnDark.classList.add("active");
    if(btnLight) btnLight.classList.remove("active");
  }
}
/* ----------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  try {
    setAuthUIState(!getToken());
  } catch(e) {}

  // Đọc cấu hình giao diện từ bộ nhớ
  try {
    const isCollapsed = localStorage.getItem("sidebar_collapsed") === "true";
    if (isCollapsed) document.getElementById("appSidebar").classList.add("collapsed");

    const savedTheme = localStorage.getItem("app_theme");
    if(savedTheme === "dark") {
      changeTheme(false);
    } else {
      changeTheme(true);
    }
  } catch(e) {}

  fetch("/api/index").then(r => r.json()).then(d => {
    if (d && d.auth_required === false) {
      const authCard = document.getElementById("authCard");
      if(authCard) authCard.classList.add("hidden");
    }
  }).catch(() => {});
  
  initColumnSelector();

  // Khởi tạo Flatpickr
  // disableMobile: true -> BẮT BUỘC dùng giao diện lịch tùy chỉnh của Flatpickr trên mọi thiết bị.
  // Nếu để mặc định (false), trên điện thoại/tablet Flatpickr sẽ tự chuyển sang date-picker
  // gốc của hệ điều hành/trình duyệt (mất hết style, hiển thị dạng mm/dd/yyyy như báo lỗi).
  const dateConfig = { dateFormat: "d/m/Y", locale: "vn", defaultDate: new Date(), allowInput: true, disableMobile: true };
  const elFrom = document.getElementById('txDateFrom');
  const elTo = document.getElementById('txDateTo');
  if (elFrom && typeof flatpickr !== 'undefined') flatpickr(elFrom, dateConfig);
  if (elTo && typeof flatpickr !== 'undefined') flatpickr(elTo, dateConfig);

  const elGdtFrom = document.getElementById('gdtDateFrom');
  const elGdtTo = document.getElementById('gdtDateTo');
  if (elGdtFrom && typeof flatpickr !== 'undefined') flatpickr(elGdtFrom, dateConfig);
  if (elGdtTo && typeof flatpickr !== 'undefined') flatpickr(elGdtTo, dateConfig);

  const elInvFrom = document.getElementById('invDateFrom');
  const elInvTo = document.getElementById('invDateTo');
  if (elInvFrom && typeof flatpickr !== 'undefined') flatpickr(elInvFrom, dateConfig);
  if (elInvTo && typeof flatpickr !== 'undefined') flatpickr(elInvTo, dateConfig);
  
  // RENDER LỊCH TUẦN LÊN HEADER
  renderWeeklyCalendar();
});

function switchTab(which) {
  const tabs = ["bulk", "bank", "transaction", "invoice", "gdt", "employee", "air"];
  
  tabs.forEach(tab => {
    const idSuffix = tab.charAt(0).toUpperCase() + tab.slice(1);
    const contentEl = document.getElementById("tab" + idSuffix);
    const btnEl = document.getElementById("tab" + idSuffix + "Btn");
    
    if (contentEl) contentEl.classList.toggle("hidden", which !== tab);
    if (btnEl) btnEl.classList.toggle("active", which === tab);
  });

  // Bắt sự kiện tải tài khoản ngân hàng khi vào tab transaction
  if (which === "transaction") {
    const dropdownEl = document.getElementById("txBankAccountIdDropdown");
    // Nếu dropdown trống (chưa có checkbox nào) thì mới tải dữ liệu
    if (dropdownEl && dropdownEl.children.length === 0) {
      loadBankAccounts();
    }
  }
}

// Chuyển đổi Thời gian
function formatTxDate(dateString) {
  if (!dateString) return "";
  const [date, time] = dateString.split(" ");
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y} ${time}`;
}

function timeAgo(dateString) {
  if (!dateString) return "";
  const txDate = new Date(dateString.replace(" ", "T") + "+07:00");
  const now = new Date();
  const diffMs = now - txDate;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return `Vừa xong`;
  if (diffMins < 60) return `${diffMins} phút trước`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  return `${Math.floor(diffHours / 24)} ngày trước`;
}

// Trả về HTML icon ngân hàng: dùng logo thật cho ACB / MB, ngân hàng khác dùng badge chữ cái như cũ
function getBankIconHtml(bankBrandName) {
  const name = (bankBrandName || "").toLowerCase();
  let logoUrl = "";
  if (name.includes("acb")) {
    logoUrl = "https://my.sepay.vn/assets/images/banklogo/acb-icon.png";
  } else if (name.includes("mb")) {
    logoUrl = "https://my.sepay.vn/assets/images/banklogo/mbbank-icon.png";
  }
  if (logoUrl) {
    return `<img src="${logoUrl}" alt="${escapeHtml(bankBrandName || "")}" class="bank-logo-img">`;
  }
  const bankLetter = bankBrandName ? bankBrandName.charAt(0) : "B";
  return `<span class="bank-icon">${escapeHtml(bankLetter)}</span>`;
}

// Copy riêng lẻ nội dung giao dịch của 1 dòng khi bấm vào ô "Nội dung"
function copyTxContentByIndex(i) {
  try {
    const tx = currentTxListData[i];
    if (!tx) return;
    const text = tx.transaction_content || "";
    const cell = document.getElementById(`tx-content-${i}`);
    navigator.clipboard.writeText(text).then(() => {
      if (cell) {
        const original = cell.innerHTML;
        cell.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-check-icon lucide-check-check"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg> Đã copy nội dung!';
        setTimeout(() => { cell.innerHTML = original; }, 1200);
      }
    }).catch(() => { alert("Không thể copy nội dung. Vui lòng thử lại."); });
  } catch (e) {
    alert("Đã xảy ra lỗi khi copy: " + e.message);
  }
}

/* Các hàm Kéo Thả & Tra cứu Bulk */
let dragSrcEl = null;
function initColumnSelector() {
  const container = document.getElementById('colSelector');
  if (!container) return;
  container.innerHTML = '';
  currentColumns.forEach(col => {
    const label = document.createElement('label');
    label.className = 'checkbox-item'; label.draggable = true; label.dataset.key = col.key;
    label.addEventListener('dragstart', function(e) { dragSrcEl = this; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', this.dataset.key); this.style.opacity = '0.4'; });
    label.addEventListener('dragover', function(e) { if (e.preventDefault) e.preventDefault(); e.dataTransfer.dropEffect = 'move'; return false; });
    label.addEventListener('dragenter', function(e) { this.classList.add('over'); });
    label.addEventListener('dragleave', function(e) { this.classList.remove('over'); });
    label.addEventListener('drop', function(e) {
      if (e.stopPropagation) e.stopPropagation();
      if (dragSrcEl !== this) {
        const draggedKey = dragSrcEl.dataset.key; const targetKey = this.dataset.key;
        const draggedIdx = currentColumns.findIndex(c => c.key === draggedKey);
        const targetIdx = currentColumns.findIndex(c => c.key === targetKey);
        const [draggedItem] = currentColumns.splice(draggedIdx, 1);
        currentColumns.splice(targetIdx, 0, draggedItem);
        initColumnSelector(); renderBulkTable();
      }
      return false;
    });
    label.addEventListener('dragend', function(e) { this.style.opacity = '1'; document.querySelectorAll('.checkbox-item').forEach(item => item.classList.remove('over')); });
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = col.key; cb.checked = col.visible;
    cb.addEventListener('change', (e) => { col.visible = e.target.checked; renderBulkTable(); });
    label.innerHTML = `<span class="drag-handle">☰</span>`; label.appendChild(cb); label.appendChild(document.createTextNode(' ' + col.label)); container.appendChild(label);
  });
}

function renderBulkTable() {
  const thead = document.getElementById("bulkThead"); const tbody = document.getElementById("bulkTbody");
  if (!thead || !tbody) return;
  let theadHTML = '<tr>'; currentColumns.forEach(col => { if (col.visible) theadHTML += `<th>${col.label}</th>`; }); theadHTML += '</tr>';
  thead.innerHTML = theadHTML; tbody.innerHTML = ''; bulkData.forEach(rowObj => { appendRowToDOM(rowObj, tbody); });
}

let globalSheetsData = {};
let currentBankTransferRows = [];
let currentTxListData = []; // Lưu dữ liệu gốc (đã gộp thông tin KH/hóa đơn) của bảng Kiểm tra giao dịch SePay v2 để phục vụ nút Copy
let currentBankTransferContent = "";
let accActiveTab = 'luongthuong'; // 'luongthuong' | 'bhxh'
let bankGroupsData = {};
let bankActiveTab = '';
let gdtLastInvoices = []; // Danh sách hóa đơn thô (từ API gdt_invoice) để mở chi tiết khi bấm dòng
let gdtLastCreds = null;  // { username, password, is_purchase } dùng để gọi lại API lấy chi tiết hóa đơn

function removeVietnameseDiacritics(str) {
  if (!str) return "";
  let s = String(str);
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/đ/g, "d").replace(/Đ/g, "D");
  return s;
}

async function doFetchEmployeesExcel() {
  const fileInput = document.getElementById("employeeExcelFile");
  const box = document.getElementById("sheetsResult");
  const btn = document.getElementById("fetchSheetsBtn");
  
  if (!fileInput.files.length) { 
    box.innerHTML = '<span class="err">Vui lòng chọn file Excel.</span>'; 
    return; 
  }
  
  const file = fileInput.files[0];
  btn.disabled = true;
  box.innerHTML = '<span class="spinner" style="color:var(--accent)"></span> Đang xử lý file...';
  
  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    
    const pattern = /^T\d{2}20\d{2}$/;
    globalSheetsData = {};
    
    workbook.SheetNames.forEach(sheetName => {
      const cleanName = sheetName.trim();
      if (pattern.test(cleanName)) {
        const worksheet = workbook.Sheets[sheetName];
        
        // Đọc ô T5 để làm số ngày công chuẩn (nếu trống hoặc lỗi thì mặc định là 26)
        let soNgayCongChuan = 26;
        if (worksheet['T5'] && worksheet['T5'].v) {
            const t5Val = parseFloat(worksheet['T5'].v);
            if (!isNaN(t5Val) && t5Val > 0) soNgayCongChuan = t5Val;
        }

        // Đọc dữ liệu từ dòng 8 (index 7)
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 7 });
        
        let sheetData = [];
        jsonData.forEach(row => {
          const ma_nv = row[1]; 
          const ten_nv = row[2];
          const luong_cb_raw = row[7];
          const ngay_cong_tt_raw = row[9];
          const ngay_cong_hl_raw = row[10];
          const trang_phuc_raw = row[11];
          const com_trua_raw = row[12];
          const trach_nhiem_raw = row[13];
          const bhxh_raw = row[14];
          const hoa_hong_raw = row[15];         // P: Hoa hồng bán hàng
          const thuong_dong_gop_raw = row[16];  // Q: Thưởng ghi nhận đóng góp
          const luong_phep_raw = row[17];       // R: Lương phép năm
          const khac_raw = row[18];             // S: Khác
          const tong_thu_nhap_raw = row[19];    // T: Tổng thu nhập trong tháng
          const bhxh_tru_raw = row[20];         // U: BHXH
          const bhyt_tru_raw = row[21];         // V: BHYT
          const bhtn_tru_raw = row[22];         // W: BHTN
          const cd_tru_raw = row[23];           // X: CĐ
          const thue_tncn_raw = row[27];        // AB: Tiền thuế TNCN
          const thuc_nhan_raw = row[29];        // AD: Thực nhận
          const stk_raw = row[30];              // AE: STK
          const ngan_hang_raw = row[31];        // AF: Ngân hàng
          const ht_tt_raw = row[35];             // AJ: HT-TT
          const od_ts_raw = row[36];             // AK: ÔĐ-TS
          const tnld_bnn_raw = row[37];           // AL: TNLĐ-BNN
          const bhyt_cty_raw = row[38];           // AM: BHYT
          const bhtn_cty_raw = row[39];           // AN: BHTN
          const cd_cty_raw = row[40];             // AO: CĐ
          
          const ma_nv_str = ma_nv !== undefined ? String(ma_nv).trim() : "";
          const ten_nv_str = ten_nv !== undefined ? String(ten_nv).trim() : "";
          
          if (ma_nv_str !== "" && ten_nv_str !== "") {
            const luong_cb = parseFloat(luong_cb_raw) || 0;
            const ngay_cong_tt = parseFloat(ngay_cong_tt_raw) || 0;
            const ngay_cong_hl = parseFloat(ngay_cong_hl_raw) || 0;
            const trang_phuc = parseFloat(trang_phuc_raw) || 0;
            const com_trua = parseFloat(com_trua_raw) || 0;
            const trach_nhiem = parseFloat(trach_nhiem_raw) || 0;
            const bhxh = parseFloat(bhxh_raw) || 0;
            const hoa_hong = parseFloat(hoa_hong_raw) || 0;
            const thuong_dong_gop = parseFloat(thuong_dong_gop_raw) || 0;
            const luong_phep = parseFloat(luong_phep_raw) || 0;
            const khac = parseFloat(khac_raw) || 0;
            const tong_thu_nhap = parseFloat(tong_thu_nhap_raw) || 0;
            const bhxh_tru = parseFloat(bhxh_tru_raw) || 0;
            const bhyt_tru = parseFloat(bhyt_tru_raw) || 0;
            const bhtn_tru = parseFloat(bhtn_tru_raw) || 0;
            const cd_tru = parseFloat(cd_tru_raw) || 0;
            const thue_tncn = parseFloat(thue_tncn_raw) || 0;
            const thuc_nhan = parseFloat(thuc_nhan_raw) || 0;
            const stk = stk_raw !== undefined ? String(stk_raw).trim() : "";
            const ngan_hang = ngan_hang_raw !== undefined ? String(ngan_hang_raw).trim() : "";
            const ht_tt = parseFloat(ht_tt_raw) || 0;
            const od_ts = parseFloat(od_ts_raw) || 0;
            const tnld_bnn = parseFloat(tnld_bnn_raw) || 0;
            const bhyt_cty = parseFloat(bhyt_cty_raw) || 0;
            const bhtn_cty = parseFloat(bhtn_cty_raw) || 0;
            const cd_cty = parseFloat(cd_cty_raw) || 0;
            const tong_bhxh_nld = bhxh_tru + bhyt_tru + bhtn_tru; // U + V + W (BHXH người lao động đóng)
            const tong_ajakal = ht_tt + od_ts + tnld_bnn; // Cột mới: AJ + AK + AL
            const tong_bhxh_moi = ht_tt + od_ts + tnld_bnn + bhyt_cty + bhtn_cty; // Tổng BHXH CTY Đóng (không gồm CĐ)
            
            // XỬ LÝ ĐIỀU KIỆN MẪU SỐ CHIA (Theo ô T5 hoặc theo Cột K)
            let mauSoChia = soNgayCongChuan;
            // Nếu cột K có số ngày lớn hơn 0 VÀ khác với T5 -> Dùng giá trị cột K làm mẫu số
            if (ngay_cong_hl > 0 && ngay_cong_hl !== soNgayCongChuan) {
                mauSoChia = ngay_cong_hl;
            }

            // CÔNG THỨC MỚI: (H / mẫu số * K) + (L + M + N + O)
            const luong_tinh_toan = Math.round((luong_cb / mauSoChia) * ngay_cong_hl) + trang_phuc + com_trua + trach_nhiem + bhxh;

            sheetData.push({
              ma_nv: ma_nv_str,
              ten_nv: ten_nv_str,
              luong_cb: luong_cb,
              ngay_cong_tt: ngay_cong_tt,
              ngay_cong_hl: ngay_cong_hl,
              trang_phuc: trang_phuc,
              com_trua: com_trua,
              trach_nhiem: trach_nhiem,
              bhxh: bhxh,
              luong_tinh_toan: luong_tinh_toan,
              hoa_hong: hoa_hong,
              thuong_dong_gop: thuong_dong_gop,
              luong_phep: luong_phep,
              khac: khac,
              tong_thu_nhap: tong_thu_nhap,
              bhxh_tru: bhxh_tru,
              bhyt_tru: bhyt_tru,
              bhtn_tru: bhtn_tru,
              cd_tru: cd_tru,
              thue_tncn: thue_tncn,
              thuc_nhan: thuc_nhan,
              stk: stk,
              ngan_hang: ngan_hang,
              ht_tt: ht_tt,
              od_ts: od_ts,
              tnld_bnn: tnld_bnn,
              tong_ajakal: tong_ajakal,
              bhyt_cty: bhyt_cty,
              bhtn_cty: bhtn_cty,
              cd_cty: cd_cty,
              tong_bhxh_nld: tong_bhxh_nld,
              tong_bhxh_moi: tong_bhxh_moi
            });
          }
        });
        
        globalSheetsData[cleanName] = sheetData;
      }
    });
    
    const sheetNames = Object.keys(globalSheetsData);
    
    if (sheetNames.length === 0) {
      box.innerHTML = '<span class="err">Không tìm thấy Sheet nào có định dạng tên T012026, T022026...</span>';
      document.getElementById("sheetSelect").innerHTML = '<option value="">-- Chưa có dữ liệu --</option>';
      document.getElementById("employeeTableWrapper").style.display = "none";
      return;
    }
    
    const select = document.getElementById("sheetSelect");
    select.innerHTML = '<option value="">-- Chọn Tháng / Sheet --</option>';
    sheetNames.forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });
    
    box.innerHTML = `<span class="badge ok">🎉 Đã đọc xong! Tìm thấy ${sheetNames.length} sheet hợp lệ.</span>`;
    
  } catch (e) {
    box.innerHTML = `<span class="err">❌ Lỗi: ${e.message}</span>`;
  } finally {
    btn.disabled = false;
  }
}
function displaySheetData() {
  const selectedSheet = document.getElementById("sheetSelect").value;
  const wrapper = document.getElementById("employeeTableWrapper");
  const tbody = document.getElementById("employeeTbody");
  
  const accWrapper = document.getElementById("accountingWrapper");
  const accTbody = document.getElementById("accountingTbody");
  const accTbody2 = document.getElementById("accountingTbody2");
  const accTbody3 = document.getElementById("accountingTbody3");
  const bankWrapper = document.getElementById("bankTransferWrapper");
  const bankTbody = document.getElementById("bankTransferTbody");
  
  if (!selectedSheet) {
    wrapper.style.display = "none";
    accWrapper.style.display = "none";
    bankWrapper.style.display = "none";
    currentBankTransferRows = [];
    currentBankTransferContent = "";
    bankGroupsData = {};
    bankActiveTab = '';
    const bankTabsWrapEmpty = document.getElementById("bankTabsWrap");
    if (bankTabsWrapEmpty) bankTabsWrapEmpty.innerHTML = "";
    return;
  }
  
  const rows = globalSheetsData[selectedSheet] || [];
  tbody.innerHTML = "";
  accTbody.innerHTML = "";
  accTbody2.innerHTML = "";
  accTbody3.innerHTML = "";
  bankTbody.innerHTML = "";
  
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="31" style="text-align:center;">Không có dữ liệu trong sheet này.</td></tr>`;
    accWrapper.style.display = "none";
    bankWrapper.style.display = "none";
    currentBankTransferRows = [];
    currentBankTransferContent = "";
    bankGroupsData = {};
    bankActiveTab = '';
    const bankTabsWrapEmpty2 = document.getElementById("bankTabsWrap");
    if (bankTabsWrapEmpty2) bankTabsWrapEmpty2.innerHTML = "";
  } else {
    const formatMoney = (v) => Number(v).toLocaleString('vi-VN');
    
    // Các biến cộng dồn cho dòng Tổng
    let sumLuongCb = 0, sumTrangPhuc = 0, sumComTrua = 0, sumTrachNhiem = 0, sumBhxh = 0, sumLuongTinhToan = 0;
    let sumHoaHong = 0, sumThuongDongGop = 0, sumLuongPhep = 0, sumKhac = 0, sumTongThuNhap = 0;
    let sumBhxhTru = 0, sumBhytTru = 0, sumBhtnTru = 0, sumCdTru = 0, sumThueTncn = 0, sumThucNhan = 0;
    let sumHtTt = 0, sumOdTs = 0, sumTnldBnn = 0, sumTongAjakal = 0, sumBhytCty = 0, sumBhtnCty = 0, sumCdCty = 0, sumTongBhxhNld = 0, sumTongBhxhMoi = 0;
    let detailRowsHoaHongHTML = '', detailRowsThuongDgHTML = '', detailRowsLuongTtHTML = '', detailRowsLuongPhepHTML = '', detailRowsKhacHTML = '', detailRows3341HTML = '';
    let detailRows3383HTML = '', detailRows3384HTML = '', detailRows3385HTML = '', detailRows3382HTML = '', detailRows6422HTML = '';
    let detailRowsNld3383HTML = '', detailRowsNld3384HTML = '', detailRowsNld3385HTML = '', detailRowsNld3335HTML = '', detailRowsNld3341HTML = '';

    rows.forEach(r => {
      // Đổ dữ liệu ra bảng chính (Lương tính toán ở cuối cùng)
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="freeze-col-1" style="font-weight:600; color:var(--accent);">${escapeHtml(r.ma_nv)}</td>
        <td class="freeze-col-2" title="${escapeHtml(r.ten_nv)}">${escapeHtml(toTitleCaseVN(r.ten_nv))}</td>
        <td style="text-align: right;">${formatMoney(r.luong_cb)}</td>
        <td style="text-align: center;">${r.ngay_cong_tt}</td>
        <td style="text-align: center;">${r.ngay_cong_hl}</td>
        <td style="text-align: right;">${formatMoney(r.trang_phuc)}</td>
        <td style="text-align: right;">${formatMoney(r.com_trua)}</td>
        <td style="text-align: right;">${formatMoney(r.trach_nhiem)}</td>
        <td style="text-align: right;">${formatMoney(r.bhxh)}</td>
        <td style="text-align: right; font-weight: 700; color: var(--amount-in);">${formatMoney(r.luong_tinh_toan)}</td>
        <td style="text-align: right;">${formatMoney(r.hoa_hong)}</td>
        <td style="text-align: right;">${formatMoney(r.thuong_dong_gop)}</td>
        <td style="text-align: right;">${formatMoney(Math.round(r.luong_phep))}</td>
        <td style="text-align: right;">${formatMoney(r.khac)}</td>
        <td style="text-align: right; font-weight: 700;">${formatMoney(r.tong_thu_nhap)}</td>
        <td style="text-align: right;">${formatMoney(r.bhxh_tru)}</td>
        <td style="text-align: right;">${formatMoney(r.bhyt_tru)}</td>
        <td style="text-align: right;">${formatMoney(r.bhtn_tru)}</td>
        <td style="text-align: right;">${formatMoney(r.cd_tru)}</td>
        <td style="text-align: right;">${formatMoney(Math.round(r.thue_tncn))}</td>
        <td style="text-align: right; font-weight: 800; color: var(--amount-in);">${formatMoney(Math.round(r.thuc_nhan))}</td>
        <td style="text-align: center;">${escapeHtml(r.stk)}</td>
        <td style="text-align: center;">${escapeHtml(r.ngan_hang)}</td>
        <td style="text-align: right;">${formatMoney(r.ht_tt)}</td>
        <td style="text-align: right;">${formatMoney(r.od_ts)}</td>
        <td style="text-align: right;">${formatMoney(r.tnld_bnn)}</td>
        <td style="text-align: right; font-weight: 700;">${formatMoney(r.tong_ajakal)}</td>
        <td style="text-align: right;">${formatMoney(r.bhyt_cty)}</td>
        <td style="text-align: right;">${formatMoney(r.bhtn_cty)}</td>
        <td style="text-align: right; font-weight: 700;">${formatMoney(r.tong_bhxh_nld)}</td>
        <td style="text-align: right; font-weight: 700;">${formatMoney(r.tong_bhxh_moi)}</td>
        <td style="text-align: right;">${formatMoney(r.cd_cty)}</td>
      `;
      tbody.appendChild(tr);

      // Cộng dồn các cột
      sumLuongCb += r.luong_cb;
      sumTrangPhuc += r.trang_phuc;
      sumComTrua += r.com_trua;
      sumTrachNhiem += r.trach_nhiem;
      sumBhxh += r.bhxh;
      sumLuongTinhToan += r.luong_tinh_toan;
      sumHoaHong += r.hoa_hong;
      sumThuongDongGop += r.thuong_dong_gop;
      sumLuongPhep += r.luong_phep;
      sumKhac += r.khac;
      sumTongThuNhap += r.tong_thu_nhap;
      sumBhxhTru += r.bhxh_tru;
      sumBhytTru += r.bhyt_tru;
      sumBhtnTru += r.bhtn_tru;
      sumCdTru += r.cd_tru;
      sumThueTncn += r.thue_tncn;
      sumThucNhan += r.thuc_nhan;
      sumHtTt += r.ht_tt;
      sumOdTs += r.od_ts;
      sumTnldBnn += r.tnld_bnn;
      sumTongAjakal += r.tong_ajakal;
      sumBhytCty += r.bhyt_cty;
      sumBhtnCty += r.bhtn_cty;
      sumCdCty += r.cd_cty;
      sumTongBhxhNld += r.tong_bhxh_nld;
      sumTongBhxhMoi += r.tong_bhxh_moi;
      
      // Tạo dòng chi tiết Hạch toán theo nhân viên — tách riêng từng cột nguồn
      // Nợ 6421: Hoa hồng bán hàng (P)
      detailRowsHoaHongHTML += `
        <tr class="detail-row-hoahong" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3341</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(r.hoa_hong)}</td>
          <td></td>
        </tr>
      `;

      // Nợ 6421: Thưởng ghi nhận đóng góp (Q)
      detailRowsThuongDgHTML += `
        <tr class="detail-row-thuongdg" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3341</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(r.thuong_dong_gop)}</td>
          <td></td>
        </tr>
      `;

      // Nợ 6422: Lương tính toán
      detailRowsLuongTtHTML += `
        <tr class="detail-row-luongtt" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3341</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(r.luong_tinh_toan)}</td>
          <td></td>
        </tr>
      `;

      // Nợ 6422: Lương phép năm (R)
      detailRowsLuongPhepHTML += `
        <tr class="detail-row-luongphep" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3341</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(Math.round(r.luong_phep))}</td>
          <td></td>
        </tr>
      `;

      // Nợ 6422: Khác (S)
      detailRowsKhacHTML += `
        <tr class="detail-row-khac" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3341</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(r.khac)}</td>
          <td></td>
        </tr>
      `;

      // Có 3341: tổng các khoản Nợ ở trên (per nhân viên)
      const tong_phai_tra_nv = r.hoa_hong + r.thuong_dong_gop + r.luong_tinh_toan + r.luong_phep + r.khac;
      detailRows3341HTML += `
        <tr class="detail-row-3341" style="display: none; background: rgba(0,0,0,0.02);">
          <td style="font-weight: 600;">6421/6422</td>
          <td></td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(Math.round(tong_phai_tra_nv))}</td>
          <td></td>
        </tr>
      `;

      // ---- Chi tiết theo từng nhân viên cho bảng "Trích BHXH và KPCĐ cty đóng" ----
      // Có 3383: BHXH (r.tong_ajakal = AJ + AK + AL)
      detailRows3383HTML += `
        <tr class="detail-row-3383" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3383</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(r.tong_ajakal)}</td>
          <td></td>
        </tr>
      `;

      // Có 3384: BHYT (cột AM)
      detailRows3384HTML += `
        <tr class="detail-row-3384" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3384</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(r.bhyt_cty)}</td>
          <td></td>
        </tr>
      `;

      // Có 3385: BHTN (cột AN)
      detailRows3385HTML += `
        <tr class="detail-row-3385" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3385</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(r.bhtn_cty)}</td>
          <td></td>
        </tr>
      `;

      // Có 3382: KPCĐ (cột AO)
      detailRows3382HTML += `
        <tr class="detail-row-3382" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3382</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(r.cd_cty)}</td>
          <td></td>
        </tr>
      `;

      // Nợ 6422 (tổng): BHXH + BHYT + BHTN + KPCĐ theo từng nhân viên
      const tong_6422_nv = r.tong_ajakal + r.bhyt_cty + r.bhtn_cty + r.cd_cty;
      detailRows6422HTML += `
        <tr class="detail-row-6422" style="display: none; background: rgba(0,0,0,0.02);">
          <td style="font-weight: 600;">6422</td>
          <td></td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(tong_6422_nv)}</td>
          <td></td>
        </tr>
      `;

      // ---- Chi tiết theo từng nhân viên cho bảng "Trích BHXH và TNCN từ lương NLĐ" ----
      // Có 3383: BHXH (cột U)
      detailRowsNld3383HTML += `
        <tr class="detail-row-nld3383" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3383</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(r.bhxh_tru)}</td>
          <td></td>
        </tr>
      `;

      // Có 3384: BHYT (cột V)
      detailRowsNld3384HTML += `
        <tr class="detail-row-nld3384" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3384</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(r.bhyt_tru)}</td>
          <td></td>
        </tr>
      `;

      // Có 3385: BHTN (cột W)
      detailRowsNld3385HTML += `
        <tr class="detail-row-nld3385" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3385</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(r.bhtn_tru)}</td>
          <td></td>
        </tr>
      `;

      // Có 3335: Thuế TNCN (cột AB)
      detailRowsNld3335HTML += `
        <tr class="detail-row-nld3335" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3335</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(Math.round(r.thue_tncn))}</td>
          <td></td>
        </tr>
      `;

      // Nợ 3341 (tổng): BHXH + BHYT + BHTN + Thuế TNCN theo từng nhân viên
      const tong_nld_3341 = r.bhxh_tru + r.bhyt_tru + r.bhtn_tru + r.thue_tncn;
      detailRowsNld3341HTML += `
        <tr class="detail-row-nld3341" style="display: none; background: rgba(0,0,0,0.02);">
          <td style="font-weight: 600;">3341</td>
          <td></td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(Math.round(tong_nld_3341))}</td>
          <td></td>
        </tr>
      `;
    });

    // Thêm dòng TỔNG CỘNG vào cuối bảng lương
    const totalTr = document.createElement("tr");
    totalTr.style.background = "var(--total-row-bg)";
    totalTr.innerHTML = `
      <td colspan="2" class="freeze-col-total" style="text-align: right; font-weight: 800; text-transform: uppercase;">Tổng cộng:</td>
      <td style="text-align: right; font-weight: 700; color: var(--amount-in);">${formatMoney(sumLuongCb)}</td>
      <td colspan="2"></td>
      <td style="text-align: right; font-weight: 700; color: var(--amount-in);">${formatMoney(sumTrangPhuc)}</td>
      <td style="text-align: right; font-weight: 700; color: var(--amount-in);">${formatMoney(sumComTrua)}</td>
      <td style="text-align: right; font-weight: 700; color: var(--amount-in);">${formatMoney(sumTrachNhiem)}</td>
      <td style="text-align: right; font-weight: 700; color: var(--amount-in);">${formatMoney(sumBhxh)}</td>
      <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(sumLuongTinhToan)}</td>
      <td style="text-align: right; font-weight: 700; color: var(--amount-in);">${formatMoney(sumHoaHong)}</td>
      <td style="text-align: right; font-weight: 700; color: var(--amount-in);">${formatMoney(sumThuongDongGop)}</td>
      <td style="text-align: right; font-weight: 700; color: var(--amount-in);">${formatMoney(Math.round(sumLuongPhep))}</td>
      <td style="text-align: right; font-weight: 700; color: var(--amount-in);">${formatMoney(sumKhac)}</td>
      <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(Math.round(sumTongThuNhap))}</td>
      <td style="text-align: right; font-weight: 700;">${formatMoney(sumBhxhTru)}</td>
      <td style="text-align: right; font-weight: 700;">${formatMoney(sumBhytTru)}</td>
      <td style="text-align: right; font-weight: 700;">${formatMoney(sumBhtnTru)}</td>
      <td style="text-align: right; font-weight: 700;">${formatMoney(sumCdTru)}</td>
      <td style="text-align: right; font-weight: 700;">${formatMoney(Math.round(sumThueTncn))}</td>
      <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(Math.round(sumThucNhan))}</td>
      <td colspan="2"></td>
      <td style="text-align: right; font-weight: 700;">${formatMoney(sumHtTt)}</td>
      <td style="text-align: right; font-weight: 700;">${formatMoney(sumOdTs)}</td>
      <td style="text-align: right; font-weight: 700;">${formatMoney(sumTnldBnn)}</td>
      <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(sumTongAjakal)}</td>
      <td style="text-align: right; font-weight: 700;">${formatMoney(sumBhytCty)}</td>
      <td style="text-align: right; font-weight: 700;">${formatMoney(sumBhtnCty)}</td>
      <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(sumTongBhxhNld)}</td>
      <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(sumTongBhxhMoi)}</td>
      <td style="text-align: right; font-weight: 700;">${formatMoney(sumCdCty)}</td>
    `;
    tbody.appendChild(totalTr);

    // Đổ dữ liệu vào bảng Hạch toán: 5 dòng Nợ riêng biệt, Có 3341 là tổng
    const sumTong3341 = Math.round(sumHoaHong + sumThuongDongGop + sumLuongTinhToan + sumLuongPhep + sumKhac);

    let accHTML = `
      <tr style="cursor: pointer; background: var(--badge-ok-bg); transition: 0.2s;" onclick="toggleAccDetail('hoahong')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">6421</td>
        <td></td>
        <td style="font-weight: 700;">Hoa hồng bán hàng (P)</td>
        <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(sumHoaHong)}</td>
        <td style="text-align: center;"><span id="icon-hoahong" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
    `;
    accHTML += detailRowsHoaHongHTML;

    accHTML += `
      <tr style="cursor: pointer; background: var(--badge-ok-bg); transition: 0.2s;" onclick="toggleAccDetail('thuongdg')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">6421</td>
        <td></td>
        <td style="font-weight: 700;">Thưởng ghi nhận đóng góp (Q)</td>
        <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(sumThuongDongGop)}</td>
        <td style="text-align: center;"><span id="icon-thuongdg" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
    `;
    accHTML += detailRowsThuongDgHTML;

    accHTML += `
      <tr style="cursor: pointer; background: var(--badge-ok-bg); transition: 0.2s;" onclick="toggleAccDetail('luongtt')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">6422</td>
        <td></td>
        <td style="font-weight: 700;">Lương tính toán</td>
        <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(sumLuongTinhToan)}</td>
        <td style="text-align: center;"><span id="icon-luongtt" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
    `;
    accHTML += detailRowsLuongTtHTML;

    accHTML += `
      <tr style="cursor: pointer; background: var(--badge-ok-bg); transition: 0.2s;" onclick="toggleAccDetail('luongphep')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">6422</td>
        <td></td>
        <td style="font-weight: 700;">Lương phép năm (R)</td>
        <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(Math.round(sumLuongPhep))}</td>
        <td style="text-align: center;"><span id="icon-luongphep" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
    `;
    accHTML += detailRowsLuongPhepHTML;

    accHTML += `
      <tr style="cursor: pointer; background: var(--badge-ok-bg); transition: 0.2s;" onclick="toggleAccDetail('khac')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">6422</td>
        <td></td>
        <td style="font-weight: 700;">Khác (S)</td>
        <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(sumKhac)}</td>
        <td style="text-align: center;"><span id="icon-khac" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
    `;
    accHTML += detailRowsKhacHTML;

    accHTML += `
      <tr style="cursor: pointer; background: var(--badge-err-bg); transition: 0.2s;" onclick="toggleAccDetail('3341')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td></td>
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">3341</td>
        <td style="font-weight: 700;">Phải trả người lao động</td>
        <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(sumTong3341)}</td>
        <td style="text-align: center;"><span id="icon-3341" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
    `;
    accHTML += detailRows3341HTML;

    accTbody.innerHTML = accHTML;
    accWrapper.style.display = "block";

    // Bảng con: Trích BHXH và KPCĐ cty đóng
    // Nợ 6422 = tổng 4 khoản Có bên dưới (3383 BHXH + 3384 BHYT + 3385 BHTN + 3382 KPCĐ)
    const sumBHXH_3383 = Math.round(sumTongAjakal);   // Cột "Tổng BHXH" (AJ+AK+AL)
    const sumBHYT_3384 = Math.round(sumBhytCty);      // Cột AM
    const sumBHTN_3385 = Math.round(sumBhtnCty);      // Cột AN
    const sumKPCD_3382 = Math.round(sumCdCty);        // Cột AO
    const sumTong6422 = sumBHXH_3383 + sumBHYT_3384 + sumBHTN_3385 + sumKPCD_3382;

    accTbody2.innerHTML = `
      <tr style="cursor: pointer; background: var(--badge-err-bg); transition: 0.2s;" onclick="toggleAccDetail('6422')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">6422</td>
        <td></td>
        <td style="font-weight: 700;">Trích BHXH, KPCĐ cty đóng</td>
        <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(sumTong6422)}</td>
        <td style="text-align: center;"><span id="icon-6422" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
      ${detailRows6422HTML}
      <tr style="cursor: pointer; background: var(--badge-ok-bg); transition: 0.2s;" onclick="toggleAccDetail('3383')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td></td>
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">3383</td>
        <td style="font-weight: 700;">BHXH</td>
        <td style="text-align: right; font-weight: 700;">${formatMoney(sumBHXH_3383)}</td>
        <td style="text-align: center;"><span id="icon-3383" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
      ${detailRows3383HTML}
      <tr style="cursor: pointer; background: var(--badge-ok-bg); transition: 0.2s;" onclick="toggleAccDetail('3384')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td></td>
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">3384</td>
        <td style="font-weight: 700;">BHYT</td>
        <td style="text-align: right; font-weight: 700;">${formatMoney(sumBHYT_3384)}</td>
        <td style="text-align: center;"><span id="icon-3384" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
      ${detailRows3384HTML}
      <tr style="cursor: pointer; background: var(--badge-ok-bg); transition: 0.2s;" onclick="toggleAccDetail('3385')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td></td>
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">3385</td>
        <td style="font-weight: 700;">BHTN</td>
        <td style="text-align: right; font-weight: 700;">${formatMoney(sumBHTN_3385)}</td>
        <td style="text-align: center;"><span id="icon-3385" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
      ${detailRows3385HTML}
      <tr style="cursor: pointer; background: var(--badge-ok-bg); transition: 0.2s;" onclick="toggleAccDetail('3382')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td></td>
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">3382</td>
        <td style="font-weight: 700;">KPCĐ</td>
        <td style="text-align: right; font-weight: 700;">${formatMoney(sumKPCD_3382)}</td>
        <td style="text-align: center;"><span id="icon-3382" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
      ${detailRows3382HTML}
    `;

    // Bảng con: Trích BHXH và TNCN từ lương NLĐ
    // Nợ 3341 = tổng 4 khoản Có bên dưới (3383 BHXH + 3384 BHYT + 3385 BHTN + 3335 Thuế TNCN)
    const sumBHXH_U = Math.round(sumBhxhTru);     // Cột BHXH (U)
    const sumBHYT_V = Math.round(sumBhytTru);     // Cột BHYT (V)
    const sumBHTN_W = Math.round(sumBhtnTru);     // Cột BHTN (W)
    const sumTNCN_AB = Math.round(sumThueTncn);   // Cột Tiền thuế TNCN (AB)
    const sumTong3341Nld = sumBHXH_U + sumBHYT_V + sumBHTN_W + sumTNCN_AB;

    accTbody3.innerHTML = `
      <tr style="cursor: pointer; background: var(--badge-err-bg); transition: 0.2s;" onclick="toggleAccDetail('nld3341')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">3341</td>
        <td></td>
        <td style="font-weight: 700;">Trích BHXH, thuế TNCN NLĐ đóng</td>
        <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(sumTong3341Nld)}</td>
        <td style="text-align: center;"><span id="icon-nld3341" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
      ${detailRowsNld3341HTML}
      <tr style="cursor: pointer; background: var(--badge-ok-bg); transition: 0.2s;" onclick="toggleAccDetail('nld3383')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td></td>
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">3383</td>
        <td style="font-weight: 700;">BHXH</td>
        <td style="text-align: right; font-weight: 700;">${formatMoney(sumBHXH_U)}</td>
        <td style="text-align: center;"><span id="icon-nld3383" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
      ${detailRowsNld3383HTML}
      <tr style="cursor: pointer; background: var(--badge-ok-bg); transition: 0.2s;" onclick="toggleAccDetail('nld3384')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td></td>
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">3384</td>
        <td style="font-weight: 700;">BHYT</td>
        <td style="text-align: right; font-weight: 700;">${formatMoney(sumBHYT_V)}</td>
        <td style="text-align: center;"><span id="icon-nld3384" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
      ${detailRowsNld3384HTML}
      <tr style="cursor: pointer; background: var(--badge-ok-bg); transition: 0.2s;" onclick="toggleAccDetail('nld3385')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td></td>
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">3385</td>
        <td style="font-weight: 700;">BHTN</td>
        <td style="text-align: right; font-weight: 700;">${formatMoney(sumBHTN_W)}</td>
        <td style="text-align: center;"><span id="icon-nld3385" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
      ${detailRowsNld3385HTML}
      <tr style="cursor: pointer; background: var(--badge-ok-bg); transition: 0.2s;" onclick="toggleAccDetail('nld3335')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td></td>
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">3335</td>
        <td style="font-weight: 700;">Thuế TNCN</td>
        <td style="text-align: right; font-weight: 700;">${formatMoney(sumTNCN_AB)}</td>
        <td style="text-align: center;"><span id="icon-nld3335" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
      ${detailRowsNld3335HTML}
    `;

    // Giữ đúng panel đang được chọn (mặc định 'luongthuong') khi đổi sheet
    applyAccTabView();

    // Bảng: Danh sách chuyển khoản lương - nhóm theo Ngân hàng (AF), mỗi ngân hàng 1 bảng riêng qua pill switch
    bankGroupsData = {};
    rows.forEach(r => {
      const bankKeyRaw = removeVietnameseDiacritics(r.ngan_hang || "").trim().toUpperCase();
      const bankKey = bankKeyRaw || "KHÁC";
      if (!bankGroupsData[bankKey]) bankGroupsData[bankKey] = [];
      bankGroupsData[bankKey].push(r);
    });
    const bankKeys = getSortedBankKeys();

    // Nội dung giao dịch theo tháng dùng cho nút Copy (không đổi theo ngân hàng)
    const monthMatch = selectedSheet.match(/^T(\d{2})(\d{4})$/i);
    currentBankTransferContent = monthMatch ? `CHI LUONG T${monthMatch[1]}/${monthMatch[2]}` : `CHI LUONG ${selectedSheet}`;

    if (bankKeys.length === 0) {
      bankWrapper.style.display = "none";
      currentBankTransferRows = [];
      const bankTabsWrapEmpty3 = document.getElementById("bankTabsWrap");
      if (bankTabsWrapEmpty3) bankTabsWrapEmpty3.innerHTML = "";
    } else {
      if (!bankActiveTab || !bankKeys.includes(bankActiveTab)) {
        bankActiveTab = bankKeys[0];
      }
      renderBankTabs(bankKeys);
      renderBankTransferTable();
      bankWrapper.style.display = "block";
    }
  }
  
  wrapper.style.display = "block";

  // Cột "Mã NV" co dãn theo độ dài mã dài nhất; cập nhật lại vị trí cố định (sticky)
  // của cột "Tên NV" ngay sau đó cho khớp, tránh bị đè/khuất chữ.
  updateFreezeCol1Width();
}

function updateFreezeCol1Width() {
  const table = document.getElementById("employeeTable");
  if (!table) return;
  const col1Cells = table.querySelectorAll("td.freeze-col-1, th.freeze-col-1");
  let maxWidth = 60;
  col1Cells.forEach(cell => {
    const w = cell.getBoundingClientRect().width;
    if (w > maxWidth) maxWidth = w;
  });
  const leftPx = Math.ceil(maxWidth) + "px";
  table.querySelectorAll("td.freeze-col-2, th.freeze-col-2").forEach(cell => {
    cell.style.left = leftPx;
  });
}

// Trả về danh sách mã ngân hàng đã sắp xếp: ACB lên đầu, còn lại theo bảng chữ cái
function getSortedBankKeys() {
  return Object.keys(bankGroupsData).sort((a, b) => {
    if (a === "ACB") return -1;
    if (b === "ACB") return 1;
    return a.localeCompare(b, 'vi');
  });
}

// Vẽ các nút pill switch giữa các ngân hàng
function renderBankTabs(bankKeys) {
  const tabsWrap = document.getElementById("bankTabsWrap");
  if (!tabsWrap) return;
  let html = "";
  bankKeys.forEach(key => {
    const count = (bankGroupsData[key] || []).length;
    const active = key === bankActiveTab ? " active" : "";
    const keyEscaped = escapeHtml(key);
    html += `<button type="button" class="acc-seg-btn${active}" onclick="switchBankTab('${key.replace(/'/g, "\\'")}')">${keyEscaped} (${count})</button>`;
  });
  tabsWrap.innerHTML = html;
}

// Chuyển tab ngân hàng đang xem
function switchBankTab(bankKey) {
  bankActiveTab = bankKey;
  renderBankTabs(getSortedBankKeys());
  renderBankTransferTable();
}

// Vẽ bảng chuyển khoản cho ngân hàng đang được chọn (tab hiện tại)
function renderBankTransferTable() {
  const bankTbody = document.getElementById("bankTransferTbody");
  if (!bankTbody) return;
  const formatMoney = (v) => Number(v).toLocaleString('vi-VN');
  const activeRows = bankGroupsData[bankActiveTab] || [];
  // Ghi nhớ dữ liệu gốc (số thật) của bảng đang hiển thị để dùng cho nút Copy
  currentBankTransferRows = activeRows;

  let bankHTML = "";
  let totalAmount = 0;
  activeRows.forEach((r, idx) => {
    const tenNvKhongDau = removeVietnameseDiacritics(r.ten_nv).toUpperCase();
    const soTienRounded = Math.round(r.thuc_nhan);
    totalAmount += soTienRounded;
    bankHTML += `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td style="font-weight: 600;">${escapeHtml(tenNvKhongDau)}</td>
        <td>${escapeHtml(r.stk)}</td>
        <td style="text-align: right; font-weight: 700; color: var(--amount-in);">${formatMoney(soTienRounded)}</td>
      </tr>
    `;
  });
  if (activeRows.length > 0) {
    bankHTML += `
      <tr style="background: var(--badge-ok-bg);">
        <td colspan="3" style="text-align: right; font-weight: 800;">Tổng cộng (${activeRows.length} người)</td>
        <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(totalAmount)}</td>
      </tr>
    `;
  }
  bankTbody.innerHTML = bankHTML || `<tr><td colspan="4" style="text-align:center;">Không có dữ liệu.</td></tr>`;
}

function copyForMisaAmis() {
  try {
    const selectedSheet = document.getElementById("sheetSelect").value;
    if (!selectedSheet || !globalSheetsData[selectedSheet]) {
      alert("Vui lòng chọn Sheet (Tháng) để có dữ liệu.");
      return;
    }

    const rows = globalSheetsData[selectedSheet];
    let tsvLines = [];
    
    // Bạn có thể tùy biến ngày theo sheet (VD: "30/06/2026")
    const dateStr = "30/06/2026"; 
    const loaiNV = "Khác";

    // GOM NHÓM 1: HOA HỒNG BÁN HÀNG (Nợ 6421 / Có 3341)
    rows.forEach(r => {
      if (r.hoa_hong > 0) {
        let dienGiai = "Hoa hồng bán hàng " + selectedSheet;
        tsvLines.push([
          dateStr,                // Cột A: Ngày CT
          dateStr,                // Cột B: Ngày HT
          "",                     // Cột C: Số CT
          dienGiai,               // Cột D: Diễn giải
          loaiNV,                 // Cột E: Loại nghiệp vụ
          "",                     // Cột F: BỊ ẨN TRONG EXCEL (để rỗng để không lấn cột)
          dienGiai,               // Cột G: Diễn giải hạch toán
          "6421",                 // Cột H: TK Nợ
          "3341",                 // Cột I: TK Có
          Math.round(r.hoa_hong), // Cột J: Số tiền
          "",                     // Cột K: Mã ĐT Nợ
          r.ma_nv                 // Cột L: Mã ĐT Có
        ].join("\t"));
      }
    });

    // GOM NHÓM 2: THƯỞNG GHI NHẬN ĐÓNG GÓP (Nợ 6421 / Có 3341)
    rows.forEach(r => {
      if (r.thuong_dong_gop > 0) {
        let dienGiai = "Chi phí thưởng ghi nhận đóng góp " + selectedSheet;
        tsvLines.push([
          dateStr, dateStr, "", dienGiai, loaiNV, "", dienGiai, 
          "6421", "3341", Math.round(r.thuong_dong_gop), "", r.ma_nv
        ].join("\t"));
      }
    });

    // GOM NHÓM 3: CHI PHÍ LƯƠNG THÁNG (Nợ 6422 / Có 3341)
    rows.forEach(r => {
      if (r.luong_tinh_toan > 0) {
        let dienGiai = "Chi phí lương tháng " + selectedSheet;
        tsvLines.push([
          dateStr, dateStr, "", dienGiai, loaiNV, "", dienGiai, 
          "6422", "3341", Math.round(r.luong_tinh_toan), "", r.ma_nv
        ].join("\t"));
      }
    });

    if (tsvLines.length === 0) {
      alert("Không có phát sinh hạch toán nào.");
      return;
    }

    const tsv = tsvLines.join("\n") + "\n";

    navigator.clipboard.writeText(tsv).then(() => {
      const btn = document.getElementById("copyAmisBtn"); 
      const originalText = btn.innerHTML; 
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-check-icon lucide-check-check"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg> Đã Copy! Dán vào file MISA';
      setTimeout(() => { btn.innerText = originalText; }, 3000);
    }).catch(() => { alert("Không thể copy. Vui lòng thử lại."); });

  } catch (e) {
    alert("Đã xảy ra lỗi: " + e.message);
  }
}

function copyForMisaAmisBhxh() {
  try {
    const selectedSheet = document.getElementById("sheetSelect").value;
    if (!selectedSheet || !globalSheetsData[selectedSheet]) {
      alert("Vui lòng chọn Sheet (Tháng) để có dữ liệu.");
      return;
    }

    const rows = globalSheetsData[selectedSheet];
    let tsvLines = [];

    // Định dạng tháng dạng T06/2026 từ tên sheet (VD: T062026)
    const monthMatch = selectedSheet.match(/^T(\d{2})(\d{4})$/i);
    const thangStr = monthMatch ? `T${monthMatch[1]}/${monthMatch[2]}` : selectedSheet;

    // Bạn có thể tùy biến ngày theo sheet (VD: "30/06/2026")
    const dateStr = "30/06/2026";
    const loaiNV = ""; // Cột E bỏ trống theo yêu cầu

    // Diễn giải (cột D) LUÔN CỐ ĐỊNH cho mọi dòng
    const dienGiaiCoDinh = "Trích BHXH, BHYT, BHTN, KPCĐ cty đóng " + thangStr;

    // BƯỚC 1: Lần lượt từng nhân viên -> 3383 (BHXH) -> 3384 (BHYT) -> 3385 (BHTN)
    rows.forEach(r => {
      if (r.tong_ajakal > 0) {
        // Nếu NV không có HT-TT (AJ) và ÔĐ-TS (AK), chỉ có TNLĐ-BNN (AL) -> đổi diễn giải hạch toán riêng
        const chiCoTnlDBnn = (r.ht_tt === 0 && r.od_ts === 0 && r.tnld_bnn > 0);
        let dienGiaiHT = (chiCoTnlDBnn ? "Trích BHXH-TNBNN cty đóng " : "Trích BHXH cty đóng ") + thangStr;
        tsvLines.push([
          dateStr,                    // Cột A: Ngày CT
          dateStr,                    // Cột B: Ngày HT
          "",                         // Cột C: Số CT
          dienGiaiCoDinh,             // Cột D: Diễn giải (cố định)
          loaiNV,                     // Cột E: Loại nghiệp vụ
          "",                         // Cột F: BỊ ẨN TRONG EXCEL
          dienGiaiHT,                 // Cột G: Diễn giải hạch toán
          "6422",                     // Cột H: TK Nợ
          "3383",                     // Cột I: TK Có
          Math.round(r.tong_ajakal),  // Cột J: Số tiền
          r.ma_nv,                    // Cột K: Mã ĐT Nợ
          r.ma_nv                     // Cột L: Mã ĐT Có
        ].join("\t"));
      }
      if (r.bhyt_cty > 0) {
        let dienGiaiHT = "Trích BHYT cty đóng " + thangStr;
        tsvLines.push([
          dateStr, dateStr, "", dienGiaiCoDinh, loaiNV, "", dienGiaiHT,
          "6422", "3384", Math.round(r.bhyt_cty), r.ma_nv, r.ma_nv
        ].join("\t"));
      }
      if (r.bhtn_cty > 0) {
        let dienGiaiHT = "Trích BHTN cty đóng " + thangStr;
        tsvLines.push([
          dateStr, dateStr, "", dienGiaiCoDinh, loaiNV, "", dienGiaiHT,
          "6422", "3385", Math.round(r.bhtn_cty), r.ma_nv, r.ma_nv
        ].join("\t"));
      }
    });

    // BƯỚC 2: Sau khi hết danh sách NV ở bước 1, duyệt lại toàn bộ để xuất KPCĐ (3382) dồn cuối
    rows.forEach(r => {
      if (r.cd_cty > 0) {
        let dienGiaiHT = "Trích KPCĐ cty đóng " + thangStr;
        tsvLines.push([
          dateStr, dateStr, "", dienGiaiCoDinh, loaiNV, "", dienGiaiHT,
          "6422", "3382", Math.round(r.cd_cty), r.ma_nv, r.ma_nv
        ].join("\t"));
      }
    });

    if (tsvLines.length === 0) {
      alert("Không có phát sinh hạch toán nào.");
      return;
    }

    const tsv = tsvLines.join("\n") + "\n";

    navigator.clipboard.writeText(tsv).then(() => {
      const btn = document.getElementById("copyAmisBhxhBtn");
      const originalText = btn.innerHTML;
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-check-icon lucide-check-check"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg> Đã Copy! Dán vào file MISA';
      setTimeout(() => { btn.innerText = originalText; }, 3000);
    }).catch(() => { alert("Không thể copy. Vui lòng thử lại."); });

  } catch (e) {
    alert("Đã xảy ra lỗi: " + e.message);
  }
}

function copyForMisaAmisBhxhNld() {
  try {
    const selectedSheet = document.getElementById("sheetSelect").value;
    if (!selectedSheet || !globalSheetsData[selectedSheet]) {
      alert("Vui lòng chọn Sheet (Tháng) để có dữ liệu.");
      return;
    }

    const rows = globalSheetsData[selectedSheet];
    let tsvLines = [];

    // Định dạng tháng dạng T06/2026 từ tên sheet (VD: T062026)
    const monthMatch = selectedSheet.match(/^T(\d{2})(\d{4})$/i);
    const thangStr = monthMatch ? `T${monthMatch[1]}/${monthMatch[2]}` : selectedSheet;

    const dateStr = "30/06/2026";
    const loaiNV = ""; // Cột E bỏ trống theo yêu cầu

    // Diễn giải (cột D) LUÔN CỐ ĐỊNH cho mọi dòng
    const dienGiaiCoDinh = "Trích BHXH và TNCN từ lương NLĐ " + thangStr;

    // BƯỚC 1: Lần lượt từng nhân viên -> 3383 (BHXH) -> 3384 (BHYT) -> 3385 (BHTN)
    rows.forEach(r => {
      if (r.bhxh_tru > 0) {
        let dienGiaiHT = "Trích BHXH từ lương NLĐ " + thangStr;
        tsvLines.push([
          dateStr, dateStr, "", dienGiaiCoDinh, loaiNV, "", dienGiaiHT,
          "3341", "3383", Math.round(r.bhxh_tru), r.ma_nv, r.ma_nv
        ].join("\t"));
      }
      if (r.bhyt_tru > 0) {
        let dienGiaiHT = "Trích BHYT từ lương NLĐ " + thangStr;
        tsvLines.push([
          dateStr, dateStr, "", dienGiaiCoDinh, loaiNV, "", dienGiaiHT,
          "3341", "3384", Math.round(r.bhyt_tru), r.ma_nv, r.ma_nv
        ].join("\t"));
      }
      if (r.bhtn_tru > 0) {
        let dienGiaiHT = "Trích BHTN từ lương NLĐ " + thangStr;
        tsvLines.push([
          dateStr, dateStr, "", dienGiaiCoDinh, loaiNV, "", dienGiaiHT,
          "3341", "3385", Math.round(r.bhtn_tru), r.ma_nv, r.ma_nv
        ].join("\t"));
      }
    });

    // BƯỚC 2: Sau khi hết danh sách NV ở bước 1, duyệt lại toàn bộ để xuất Thuế TNCN (33351)
    rows.forEach(r => {
      if (r.thue_tncn > 0) {
        let dienGiaiHT = "Trích thuế TNCN từ lương NLĐ " + thangStr;
        tsvLines.push([
          dateStr, dateStr, "", dienGiaiCoDinh, loaiNV, "", dienGiaiHT,
          "3341", "33351", Math.round(r.thue_tncn), r.ma_nv, r.ma_nv
        ].join("\t"));
      }
    });

    if (tsvLines.length === 0) {
      alert("Không có phát sinh hạch toán nào.");
      return;
    }

    const tsv = tsvLines.join("\n") + "\n";

    navigator.clipboard.writeText(tsv).then(() => {
      const btn = document.getElementById("copyAmisBhxhNldBtn");
      const originalText = btn.innerHTML;
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-check-icon lucide-check-check"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg> Đã Copy! Dán vào file MISA';
      setTimeout(() => { btn.innerText = originalText; }, 3000);
    }).catch(() => { alert("Không thể copy. Vui lòng thử lại."); });

  } catch (e) {
    alert("Đã xảy ra lỗi: " + e.message);
  }
}
  
function switchAccTab(tab) {
  accActiveTab = tab;
  applyAccTabView();
}

function applyAccTabView() {
  const panels = {
    luongthuong: document.getElementById("accPanelLuongThuong"),
    bhxh: document.getElementById("accPanelBhxh"),
    bhxhnld: document.getElementById("accPanelBhxhNld")
  };
  const btns = {
    luongthuong: document.getElementById("accTabBtn-luongthuong"),
    bhxh: document.getElementById("accTabBtn-bhxh"),
    bhxhnld: document.getElementById("accTabBtn-bhxhnld")
  };
  if (!panels.luongthuong || !panels.bhxh || !panels.bhxhnld) return;
  Object.keys(panels).forEach(key => {
    panels[key].style.display = accActiveTab === key ? "block" : "none";
    btns[key].classList.toggle("active", accActiveTab === key);
  });
}
  
function appendRowToDOM(rowObj, tbody) {
  let tr = document.createElement("tr"); let tds = ''; let errorPrinted = false; 
  currentColumns.forEach(col => {
    if (!col.visible) return;
    if (col.key === 'status') { tds += `<td>${rowObj.badgeHTML}</td>`; } 
    else if (rowObj.isError) {
      if (!errorPrinted) { tds += `<td><span style="color:var(--badge-err-text); font-weight:600;">${escapeHtml(rowObj.errorMsg)}</span></td>`; errorPrinted = true; } 
      else { tds += `<td></td>`; }
    } else { tds += `<td>${escapeHtml(rowObj.raw[col.key] || "")}</td>`; }
  });
  tr.innerHTML = tds; tbody.appendChild(tr);
}
  
async function doBulkLookup() {
  const rawInput = document.getElementById("bulkCodes").value;
  const codes = rawInput.split(/[\n,; \t]+/).map(c => c.trim()).filter(c => c !== "");
  const saSystem = document.getElementById("bulkSaSystem").value;
  const btn = document.getElementById("bulkBtn"); const progress = document.getElementById("bulkProgress");
  const tableWrap = document.getElementById("bulkTableWrap"); const copyBtn = document.getElementById("copyExcelBtn");
  if (codes.length === 0) { progress.style.display = 'block'; progress.innerHTML = '<span class="err">Vui lòng nhập ít nhất 1 mã đơn.</span>'; return; }
  const hasSaCode = codes.some(c => c.toUpperCase().startsWith("SA"));
  if (hasSaCode && !saSystem) { progress.style.display = 'block'; progress.innerHTML = '<span class="err">Danh sách có mã SA... — vui lòng chọn hệ thống tra cứu (10X hoặc SOLOBIZ) ở trên trước khi chạy.</span>'; return; }
  btn.disabled = true; bulkData = []; progress.style.display = 'block'; tableWrap.style.display = 'block'; copyBtn.style.display = 'none';
  renderBulkTable(); const tbody = document.getElementById("bulkTbody"); let successCount = 0;
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]; progress.innerHTML = `<span class="spinner" style="color:var(--accent)"></span> Đang xử lý ${i + 1}/${codes.length}... (${code})`;
    let rowObj = { code: code, raw: {}, isError: false, errorMsg: "" };
    try {
      const resp = await fetch("/api/index", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "lookup", code, sa_system: saSystem, access_token: getToken() }) });
      const data = await resp.json();
      if (resp.ok) {
        const ok = data.status_msg === "Thành công"; if (ok) successCount++;
        const badgeText = ok ? 'Thành công' : (data.status_msg || 'Thất bại');
        rowObj.badgeHTML = ok ? `<span class="badge ok">${escapeHtml(badgeText)}</span>` : `<span class="badge err">${escapeHtml(badgeText)}</span>`; rowObj.raw = data;
      } else { rowObj.isError = true; rowObj.badgeHTML = `<span class="badge err">Lỗi</span>`; rowObj.errorMsg = `${data.error || "Lỗi server"} (${code})`; }
    } catch (e) { rowObj.isError = true; rowObj.badgeHTML = `<span class="badge err">Lỗi</span>`; rowObj.errorMsg = `${e.message} (${code})`; }
    bulkData.push(rowObj); appendRowToDOM(rowObj, tbody);
  }
  progress.innerHTML = `🎉 Hoàn tất! Thành công <strong style="color:var(--badge-ok-text)">${successCount}/${codes.length}</strong> mã.`; copyBtn.style.display = "inline-flex"; btn.disabled = false;
}

function copyTableToExcel() {
  try {
    const table = document.getElementById('bulkTable'); if (!table) return; let tsv = "";
    const tbody = table.querySelector('tbody');
    const rows = tbody ? Array.from(tbody.querySelectorAll('tr')) : [];
    rows.forEach(row => { const cells = Array.from(row.querySelectorAll('th, td')).map(td => td.innerText.trim()); tsv += cells.join("\t") + "\n"; });
    navigator.clipboard.writeText(tsv).then(() => {
      const btn = document.getElementById("copyExcelBtn"); const originalText = btn.innerHTML; btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-check-icon lucide-check-check"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg> Đã Copy vào Khay nhớ tạm!';
      setTimeout(() => { btn.innerText = originalText; }, 2000);
    }).catch(err => { alert("Không thể tự động copy. Vui lòng thử lại."); });
  } catch(e) { alert("Đã xảy ra lỗi khi copy: " + e.message); }
}

async function loadBankAccounts() {
  const dropdownEl = document.getElementById("txBankAccountIdDropdown");
  const selectBrandEl = document.getElementById("txBankBrand");
  
  // Chỉ dừng nếu không tìm thấy khung dropdown của multi-select
  if (!dropdownEl) return; 

  try {
    const resp = await fetch("/api/index", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_bank_accounts", access_token: getToken() })
    });
    const data = await resp.json();
    
    if (resp.ok && data.bank_accounts) {
      dropdownEl.innerHTML = '';
      if (selectBrandEl) selectBrandEl.innerHTML = '<option value="">-- Tất cả ngân hàng --</option>';
      
      const uniqueBrands = new Set();

      data.bank_accounts.forEach(bank => {
        // Tạo Checkbox cho từng tài khoản và chèn vào dropdown
        const label = document.createElement('label');
        label.className = 'ms-checkbox-item';
        label.innerHTML = `<input type="checkbox" value="${bank.id}" onchange="updateMultiSelectLabel()" /> <span>${bank.bank_short_name} - ${bank.account_number}</span>`;
        dropdownEl.appendChild(label);

        if (bank.bank_short_name) uniqueBrands.add(bank.bank_short_name);
      });

      // Nếu có dùng bộ lọc txBankBrand ở giao diện thì mới đổ dữ liệu vào
      if (selectBrandEl) {
        uniqueBrands.forEach(brand => {
          const optionBrand = document.createElement("option");
          optionBrand.value = brand; optionBrand.text = brand;
          selectBrandEl.appendChild(optionBrand);
        });
      }
    }
  } catch (e) { console.error("Lỗi tải danh sách ngân hàng:", e); }
}

// Hàm phụ: Cập nhật chữ trên label khi tích chọn checkbox
function updateMultiSelectLabel() {
  const checked = document.querySelectorAll('#txBankAccountIdDropdown input:checked');
  const labelEl = document.getElementById('txBankAccountIdLabel');
  if (checked.length === 0) {
    labelEl.innerText = '-- Tất cả tài khoản --';
  } else {
    labelEl.innerText = `Đã chọn ${checked.length} tài khoản`;
  }
}

// Ẩn bảng checkbox đi khi bấm chuột ra ngoài khung
document.addEventListener('click', function(e) {
  const container = document.getElementById('multiSelectContainer');
  if (container && !container.contains(e.target)) {
    const dropdown = document.getElementById('txBankAccountIdDropdown');
    if(dropdown) dropdown.classList.remove('show');
  }
});

// Khai báo biến toàn cục
let bankStatementBase64 = "";
let bankStatementFileName = "";
let bankStatementTsv = ""; // Thêm biến để lưu sẵn chuỗi copy bảng

async function doBankStatement() {
  const fileInput = document.getElementById("bankExcelFile"); 
  const box = document.getElementById("bankResult"); 
  const btn = document.getElementById("bankBtn");
  const tableWrap = document.getElementById("bankTableWrap");
  
  if (!fileInput.files.length) { 
    box.innerHTML = '<span class="err" style="color:var(--badge-err-text)">Vui lòng chọn file sao kê.</span>'; 
    return; 
  }
  
  const file = fileInput.files[0]; 
  btn.disabled = true; 
  box.innerHTML = '<span class="spinner" style="color:var(--accent)"></span> Đang xử lý tổng hợp sao kê, vui lòng đợi…';
  if (tableWrap) tableWrap.style.display = 'none';

  try {
    const b64 = await fileToBase64(file);
    const resp = await fetch("/api/index", { 
      method: "POST", 
      headers: { "Content-Type": "application/json" }, 
      body: JSON.stringify({ action: "bank_statement", file_base64: b64, access_token: getToken() }) 
    });
    const data = await resp.json();
    
    if (!resp.ok) { 
      box.innerHTML = `<span class="err" style="color:var(--badge-err-text)">❌ ${data.error || "Lỗi"}</span>`; 
      return; 
    }
    
    // Lưu lại dữ liệu Base64 để dùng cho nút tải về
    bankStatementBase64 = data.file_base64;
    bankStatementFileName = "TongHop_" + file.name;

    // Dùng SheetJS để đọc file Excel Base64 trả về
    const wb = XLSX.read(data.file_base64, { type: 'base64', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: "dd/mm/yyyy" });

    // TẠO SẴN DỮ LIỆU COPY (TSV) TỪ JSON 
    // Chỉ lấy từ index 1 trở đi (bỏ qua dòng tiêu đề ở index 0)
    bankStatementTsv = jsonData.slice(1).map(row => {
      return row.map(cell => {
        let cellStr = cell !== undefined && cell !== null ? String(cell) : "";
        // Lọc bỏ ký tự tab/xuống dòng thừa để không vỡ cột khi dán
        return cellStr.replace(/\t/g, " ").replace(/\n/g, " ");
      }).join("\t");
    }).join("\n");

    // Tạo giao diện bảng HTML - Đã thêm cụm nút Tải về & Copy
    let tableHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
        <h3 style="margin:0;">Xem trước Kết quả</h3>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button id="copyBankTableBtn" class="btn-outline" onclick="copyBankStatementTable()" style="font-size:13px; padding:8px 16px;">📋 Copy cho Excel / Sheets</button>
          <button onclick="downloadBankStatement()" style="font-size:13px; padding:8px 16px;">⬇️ Tải về Excel</button>
        </div>
      </div>
      <div class="table-responsive">
        <table class="sepay-table" style="width:100%; white-space:nowrap;">
          <thead>
    `;

    if (jsonData.length > 0) {
       const headers = jsonData[0];
       tableHTML += '<tr>';
       headers.forEach(h => { tableHTML += `<th>${escapeHtml(h || "")}</th>`; });
       tableHTML += '</tr></thead><tbody>';

       for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0) continue;
          
          tableHTML += '<tr>';
          for (let j = 0; j < headers.length; j++) {
             let cellData = row[j];
             let displayCell = cellData !== undefined && cellData !== null ? String(cellData) : "";
             
             // Căn phải đối với các cột số
             const align = (!isNaN(parseFloat(cellData)) && isFinite(cellData) && !displayCell.includes("/")) ? "text-align: right;" : "text-align: left;";
             
             tableHTML += `<td style="${align}">${escapeHtml(displayCell)}</td>`;
          }
          tableHTML += '</tr>';
       }
    }
    tableHTML += '</tbody></table></div>';
    
    box.innerHTML = `<span class="badge ok">🎉 Đã xử lý xong! Vui lòng xem kết quả bên dưới.</span>`;
    if (tableWrap) {
       tableWrap.innerHTML = tableHTML;
       tableWrap.style.display = 'block';
    }

  } catch (e) { 
    box.innerHTML = `<span class="err" style="color:var(--badge-err-text)">❌ Lỗi: ${e.message}</span>`; 
  } finally { 
    btn.disabled = false; 
  }
}

// Hàm tải về Excel
function downloadBankStatement() {
  if (bankStatementBase64 && bankStatementFileName) {
      downloadBase64(bankStatementBase64, bankStatementFileName);
  } else {
      alert("Chưa có file để tải về!");
  }
}

// Hàm Copy bảng Sao kê
function copyBankStatementTable() {
  if (!bankStatementTsv) {
      alert("Chưa có dữ liệu để copy!");
      return;
  }
  navigator.clipboard.writeText(bankStatementTsv).then(() => {
      const btn = document.getElementById("copyBankTableBtn");
      const originalText = btn.innerHTML;
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-check-icon lucide-check-check"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg> Đã Copy vào Khay nhớ tạm!';
      setTimeout(() => { btn.innerText = originalText; }, 2000);
  }).catch(err => {
      alert("Không thể copy. Vui lòng kiểm tra quyền trình duyệt.");
  });
}

async function doTxSearch() {
  const code = document.getElementById("txSearchCode").value.trim(); const box = document.getElementById("txSearchResult"); const btn = document.getElementById("txSearchBtn");
  if (!code) { box.innerHTML = '<div class="msg err">Vui lòng nhập mã cần tìm.</div>'; return; }
  btn.disabled = true; box.innerHTML = '<div class="msg"><span class="spinner" style="color:var(--accent)"></span> Đang kết nối SePay v2...</div>';
  try {
    const resp = await fetch("/api/index", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "search_transaction", code: code, access_token: getToken() }) });
    const data = await resp.json();
    if (!resp.ok) { box.innerHTML = `<div class="msg err">❌ ${data.error || "Lỗi server"}</div>`; return; }
    const tx = data.transaction;
    let rows = "";
    for (const [key, value] of Object.entries(tx)) {
        let displayValue = escapeHtml(value);
        if (key === "amount_in") displayValue = `<span style="color:var(--badge-ok-text); font-weight:bold;">+ ${Number(value).toLocaleString('vi-VN')} VND</span>`;
        if (value === null) displayValue = '<span style="color:var(--text-muted)">null</span>';
        rows += `<tr><td style="color:var(--text-muted); font-weight:600; width:200px;">${escapeHtml(key)}</td><td style="word-break: break-all;">${displayValue}</td></tr>`;
    }
    box.innerHTML = `<div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; flex-wrap: wrap;"><span class="badge ok">🎉 Tìm thấy giao dịch!</span><button id="copyTxSearchBtn" class="btn-outline" onclick="copyTableToClipboard('txSearchTable', 'copyTxSearchBtn')" style="font-size: 12px; padding: 6px 10px; white-space:nowrap; flex-shrink:0;">📋 Copy</button></div><div class="table-responsive"><table id="txSearchTable" style="width:100%; border-collapse: collapse;"><tbody>${rows}</tbody></table></div>`;
  } catch (e) { box.innerHTML = `<div class="msg err">❌ Lỗi kết nối mạng: ${e.message}</div>`; } finally { btn.disabled = false; }
}

// HÀM LIỆT KÊ DANH SÁCH GIAO DỊCH
async function doTxList() {
  const dateFromVal = document.getElementById("txDateFrom").value; 
  const dateToVal = document.getElementById("txDateTo").value;
  const selectBrandEl = document.getElementById("txBankBrand");
  const bankBrandVal = selectBrandEl ? selectBrandEl.value.trim() : "";
  
  // Lấy danh sách các tài khoản đang được Tích Chọn
  const selectedAccounts = Array.from(document.querySelectorAll('#txBankAccountIdDropdown input:checked')).map(cb => cb.value);
  
  const box = document.getElementById("txListResult");
  const btn = document.getElementById("txListBtn");
  
  if (!dateFromVal || !dateToVal) {
    box.innerHTML = '<div class="msg err">Vui lòng chọn "Từ ngày" và "Đến ngày".</div>'; 
    return; 
  }
  
  const parseDateToAPI = (str) => {
    const parts = str.split('/');
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return str;
  };
  
  const dateFrom = parseDateToAPI(dateFromVal) + " 00:00:00";
  const dateTo = parseDateToAPI(dateToVal) + " 23:59:59";
  
  btn.disabled = true;
  box.innerHTML = '<div class="msg"><span class="spinner" style="color:var(--accent)"></span> Đang tải danh sách từ SePay...</div>';
  
  try {
    const resp = await fetch("/api/index", { 
      method: "POST", 
      headers: { "Content-Type": "application/json" }, 
      body: JSON.stringify({ 
          action: "list_transactions", 
          date_from: dateFrom, 
          date_to: dateTo, 
          bank_brand: bankBrandVal,          
          bank_account: "", 
          access_token: getToken() 
      }) 
    });
    const data = await resp.json();
    
    if (!resp.ok) { 
      box.innerHTML = `<div class="msg err">❌ ${data.error || "Lỗi server"}</div>`; 
      return; 
    }
    
    let txs = data.transactions;
    
    // BỘ LỌC ĐA TÀI KHOẢN
    if (selectedAccounts.length > 0) {
      txs = txs.filter(tx => selectedAccounts.includes(tx.bank_account_id));
    }

    if (!txs || txs.length === 0) {
      box.innerHTML = '<div class="msg">⚠️ Không có giao dịch chuyển khoản nào khớp với điều kiện lọc.</div>';
      return;
    }
    
    // TÍNH TOÁN SỐ DƯ LŨY KẾ
    let runningBalance = 0;
    let totalAmountIn = 0;
    let totalAmountOut = 0;

    // 2. Sắp xếp giao dịch từ cũ đến mới để tính lũy kế đúng dòng thời gian
    txs.sort((a, b) => new Date(a.transaction_date.replace(" ", "T")) - new Date(b.transaction_date.replace(" ", "T")));

    txs.forEach(tx => {
      let inAmt = Number(tx.amount_in || 0);
      let outAmt = Number(tx.amount_out || 0);
      totalAmountIn += inAmt;
      totalAmountOut += outAmt;
      
      runningBalance = runningBalance + inAmt - outAmt;
      tx.currentBalance = runningBalance; // Gắn số dư tương ứng vào object
    });

    // 3. Đảo ngược mảng để hiển thị Giao dịch mới nhất lên đầu bảng (Tùy chọn UX)
    txs.reverse();
    
    // Lưu lại dữ liệu gốc để nút Copy dùng (không phụ thuộc vào innerText của DOM)
    currentTxListData = txs;

    // VẼ BẢNG HTML
    let rows = "";
    txs.forEach((tx, i) => {
      const formattedDate = formatTxDate(tx.transaction_date);
      const relativeTime = timeAgo(tx.transaction_date);
      
      let amountInHtml = Number(tx.amount_in) > 0 ? `<span class="amount-in">+${Number(tx.amount_in).toLocaleString('vi-VN')}</span>` : "";
      let amountOutHtml = Number(tx.amount_out) > 0 ? `<span class="amount-out">-${Number(tx.amount_out).toLocaleString('vi-VN')}</span>` : "";
      const bankIconHtml = getBankIconHtml(tx.bank_brand_name);
      const paymentCode = (tx.code || "").trim();
      const lookupCellContent = paymentCode ? `<span class="spinner" style="color:var(--accent)"></span>` : "—";

      rows += `
        <tr>
          <td>
            <div>${formattedDate}</div>
            <div class="text-muted-small">${relativeTime}</div>
          </td>
          <td>
            <div class="bank-tag">
              ${bankIconHtml}
              ${escapeHtml(tx.account_number)}
            </div>
          </td>
          <td class="tx-content-cell" id="tx-content-${i}" title="${escapeHtml(tx.transaction_content)} — Click để copy" onclick="copyTxContentByIndex(${i})">
            ${escapeHtml(tx.transaction_content)}
          </td>
          <td style="text-align: right;">${amountInHtml}</td>
          <td style="text-align: right;">${amountOutHtml}</td>
          <td class="text-id">${escapeHtml(tx.code || "—")}</td>
          <td id="tx-name-${i}">${lookupCellContent}</td>
          <td id="tx-userid-${i}">${lookupCellContent}</td>
          <td id="tx-invoice-${i}">${lookupCellContent}</td>
          <td id="tx-arisingdate-${i}">${lookupCellContent}</td>
          <td id="tx-amountbeforetax-${i}" style="text-align: right;">${lookupCellContent}</td>
          <td id="tx-vatamount-${i}" style="text-align: right;">${lookupCellContent}</td>
          <td id="tx-totalamount-${i}" style="text-align: right;">${lookupCellContent}</td>
        </tr>`;
    });

    // Chèn dòng Tổng phát sinh vào cuối bảng
    rows += `
      <tr class="total-row">
        <td colspan="3" style="text-align: right; font-weight: 800; text-transform: uppercase;">Tổng phát sinh:</td>
        <td style="text-align: right; font-weight: 700; color: var(--amount-in);">${totalAmountIn.toLocaleString('vi-VN')}</td>
        <td style="text-align: right; font-weight: 700; color: var(--amount-out);">${totalAmountOut.toLocaleString('vi-VN')}</td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>`;
      
    box.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; flex-wrap: wrap;">
        <span class="badge ok">🎉 Đã tải ${txs.length} giao dịch</span>
        <button id="copyTxListBtn" class="btn-outline" onclick="copyTxListTable()" style="font-size: 12px; padding: 6px 10px; white-space:nowrap; flex-shrink:0;">📋 Copy cho Excel / Sheets</button>
      </div>
      <div class="table-responsive" style="border: 1px solid var(--border); border-radius: 8px;">
        <table class="sepay-table" id="txListTable">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Tài khoản</th>
              <th>Nội dung</th>
              <th style="text-align: right;">Tiền vào (+)</th>
              <th style="text-align: right;">Tiền ra (-)</th>
              <th>Mã thanh toán</th>
              <th>Tên KH</th>
              <th>Mã KH</th>
              <th>Số HĐ</th>
              <th>Ngày lập</th>
              <th style="text-align: right;">Tiền hàng</th>
              <th style="text-align: right;">Tiền thuế</th>
              <th style="text-align: right;">Tổng tiền</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    // Tự động tra cứu Tên KH / Mã KH / Số HĐ cho từng dòng có Mã thanh toán
    lookupCustomerInfoForTxList(txs);
      
  } catch (e) { 
    box.innerHTML = `<div class="msg err">❌ Lỗi kết nối mạng: ${e.message}</div>`; 
  } finally { 
    btn.disabled = false; 
  }
}

async function lookupCustomerInfoForTxList(txs) {
  const amountFmt = (v) => (v === "" || v === null || v === undefined) ? "—" : Number(v).toLocaleString('vi-VN');
  for (let i = 0; i < txs.length; i++) {
    const code = (txs[i].code || "").trim();
    const nameEl = document.getElementById(`tx-name-${i}`);
    const userEl = document.getElementById(`tx-userid-${i}`);
    const invEl = document.getElementById(`tx-invoice-${i}`);
    const dateEl = document.getElementById(`tx-arisingdate-${i}`);
    const beforeTaxEl = document.getElementById(`tx-amountbeforetax-${i}`);
    const vatEl = document.getElementById(`tx-vatamount-${i}`);
    const totalEl = document.getElementById(`tx-totalamount-${i}`);
    if (!code) continue; // Đã hiển thị "—" sẵn khi render bảng

    let invoiceNumber = "";
    try {
      const resp = await fetch("/api/index", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lookup", code, sa_system: "", access_token: getToken() })
      });
      const data = await resp.json();
      const ok = resp.ok && data.status_msg === "Thành công";
      if (nameEl) nameEl.textContent = ok ? (data.users_name || "—") : "—";
      if (userEl) userEl.textContent = ok ? (data.username || "—") : "—";
      invoiceNumber = ok ? (data.invoice_number || "") : "";
      if (invEl) invEl.textContent = invoiceNumber || "—";
      // Lưu lại vào đối tượng tx gốc để nút Copy dùng
      txs[i].customer_name = ok ? (data.users_name || "") : "";
      txs[i].customer_code = ok ? (data.username || "") : "";
      txs[i].invoice_number = invoiceNumber;
    } catch (e) {
      if (nameEl) nameEl.textContent = "—";
      if (userEl) userEl.textContent = "—";
      if (invEl) invEl.textContent = "—";
      txs[i].customer_name = "";
      txs[i].customer_code = "";
      txs[i].invoice_number = "";
    }

    // Nếu tìm được Số HĐ, tra cứu tiếp thông tin hóa đơn (Ngày lập, Tiền hàng, Tiền thuế, Tổng tiền)
    if (!invoiceNumber) {
      if (dateEl) dateEl.textContent = "—";
      if (beforeTaxEl) beforeTaxEl.textContent = "—";
      if (vatEl) vatEl.textContent = "—";
      if (totalEl) totalEl.textContent = "—";
      txs[i].invoice_date = "";
      txs[i].amount_before_tax = "";
      txs[i].vat_amount = "";
      txs[i].total_amount = "";
      continue;
    }
    try {
      const respInv = await fetch("/api/index", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invoice", code: invoiceNumber, access_token: getToken() })
      });
      const dataInv = await respInv.json();
      const okInv = respInv.ok && dataInv.status_msg === "Thành công";
      if (dateEl) dateEl.textContent = okInv ? (dataInv.arising_date || "—") : "—";
      if (beforeTaxEl) beforeTaxEl.textContent = okInv ? amountFmt(dataInv.amount_before_tax) : "—";
      if (vatEl) vatEl.textContent = okInv ? amountFmt(dataInv.vat_amount) : "—";
      if (totalEl) totalEl.textContent = okInv ? amountFmt(dataInv.total_amount) : "—";
      // Lưu lại vào đối tượng tx gốc để nút Copy dùng (giữ số thô, không định dạng)
      txs[i].invoice_date = okInv ? (dataInv.arising_date || "") : "";
      txs[i].amount_before_tax = okInv ? (dataInv.amount_before_tax ?? "") : "";
      txs[i].vat_amount = okInv ? (dataInv.vat_amount ?? "") : "";
      txs[i].total_amount = okInv ? (dataInv.total_amount ?? "") : "";
    } catch (e) {
      if (dateEl) dateEl.textContent = "—";
      if (beforeTaxEl) beforeTaxEl.textContent = "—";
      if (vatEl) vatEl.textContent = "—";
      if (totalEl) totalEl.textContent = "—";
      txs[i].invoice_date = "";
      txs[i].amount_before_tax = "";
      txs[i].vat_amount = "";
      txs[i].total_amount = "";
    }
  }
}
  
function copyBankTransferForBank() {
  try {
    if (!currentBankTransferRows || currentBankTransferRows.length === 0) {
      alert("Chưa có dữ liệu để copy. Vui lòng chọn Sheet (Tháng) trước.");
      return;
    }
    let tsv = "";
    currentBankTransferRows.forEach((r, idx) => {
      const tenNvKhongDau = removeVietnameseDiacritics(r.ten_nv).toUpperCase();
      // Số tiền copy dưới dạng số nguyên thật (không có dấu chấm/phẩy ngăn cách)
      // để khi dán vào file Excel của ngân hàng, ô nhận đúng kiểu Number chứ không phải Text.
      const soTien = Math.round(Number(r.thuc_nhan) || 0);
      tsv += [idx + 1, tenNvKhongDau, r.stk, soTien, currentBankTransferContent].join("\t") + "\n";
    });
    navigator.clipboard.writeText(tsv).then(() => {
      const btn = document.getElementById("copyBankTransferBtn");
      const originalText = btn.innerHTML;
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-check-icon lucide-check-check"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg> Đã Copy! Dán vào file NH';
      setTimeout(() => { btn.innerText = originalText; }, 2500);
    }).catch(() => { alert("Không thể tự động copy. Vui lòng thử lại."); });
  } catch (e) {
    alert("Đã xảy ra lỗi khi copy: " + e.message);
  }
}

function copyTableToClipboard(tableId, btnId) {
  try {
    const table = document.getElementById(tableId); if (!table) return;
    const tbody = table.querySelector('tbody');
    const rows = tbody ? Array.from(tbody.querySelectorAll('tr')) : [];
    // Dùng join("\n") giữa các dòng thay vì nối "\n" sau MỖI dòng (kể cả dòng cuối) -
    // tránh để lại ký tự xuống dòng thừa ở cuối chuỗi, thứ khiến Excel hiểu nhầm là
    // còn thêm 1 dòng nữa (trống) sau khi dán.
    // Bỏ qua dòng đang bị ẩn (display:none) do người dùng đang áp dụng bộ lọc -
    // giống hành vi copy trong Excel khi có AutoFilter, chỉ copy đúng phần đang xem.
    const tsv = rows
      .filter(row => row.style.display !== 'none')
      .map(row => Array.from(row.querySelectorAll('th, td')).map(td => td.innerText.trim()).join("\t"))
      .join("\n");
    navigator.clipboard.writeText(tsv).then(() => {
      const btn = document.getElementById(btnId); const originalText = btn.innerText; btn.innerText = "✅ Đã Copy vào Khay nhớ tạm!";
      setTimeout(() => { btn.innerText = originalText; }, 2000);
    }).catch(err => { alert("Không thể tự động copy. Vui lòng thử lại."); });
  } catch(e) { alert("Đã xảy ra lỗi khi copy: " + e.message); }
}

// ==== LỌC + SẮP XẾP KIỂU EXCEL cho các bảng tra cứu hóa đơn theo khoảng ngày ====
// colTypes: mảng cùng độ dài số cột header, giá trị 'text' | 'number' | null.
// null = cột không có ô lọc/không sắp xếp được (VD cột STT, cột luôn để trống).
// onVisibilityChange(visibleRows): callback tùy chọn, gọi lại mỗi khi bộ lọc đổi -
// dùng để tính lại dòng "Tổng cộng" đúng theo các dòng đang hiển thị (giống AutoFilter + SUBTOTAL trong Excel).
function attachTableFilterSort(table, colTypes, onVisibilityChange) {
  const thead = table.querySelector('thead');
  const headerRow = thead.querySelector('tr');
  const ths = Array.from(headerRow.children);

  const filterRow = document.createElement('tr');
  filterRow.className = 'table-filter-row';
  ths.forEach((th, i) => {
    const td = document.createElement('td');
    if (colTypes[i] !== null) {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Lọc...';
      input.className = 'table-filter-input';
      input.addEventListener('input', () => applyTableFilters(table, onVisibilityChange));
      td.appendChild(input);
    }
    filterRow.appendChild(td);
  });
  thead.appendChild(filterRow);

  ths.forEach((th, i) => {
    if (colTypes[i] === null) return;
    th.style.cursor = 'pointer';
    th.title = 'Bấm để sắp xếp';
    th.dataset.sortDir = '';
    th.addEventListener('click', () => sortTableByColumn(table, i, colTypes[i], th, ths));
  });
}

function applyTableFilters(table, onVisibilityChange) {
  const tbody = table.querySelector('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const filters = [];
  Array.from(table.querySelectorAll('.table-filter-row td')).forEach((td, i) => {
    const input = td.querySelector('.table-filter-input');
    const val = input ? input.value.trim().toLowerCase() : '';
    if (val) filters.push({ col: i, val });
  });

  rows.forEach((row) => {
    const cells = Array.from(row.children);
    const visible = filters.every(f => (cells[f.col]?.innerText || '').toLowerCase().includes(f.val));
    row.style.display = visible ? '' : 'none';
  });

  if (onVisibilityChange) {
    onVisibilityChange(rows.filter(r => r.style.display !== 'none'));
  }
}

function sortTableByColumn(table, colIdx, colType, th, allThs) {
  const tbody = table.querySelector('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const dir = th.dataset.sortDir === 'asc' ? 'desc' : 'asc';
  allThs.forEach((h) => {
    h.dataset.sortDir = '';
    const ind = h.querySelector('.sort-indicator');
    if (ind) ind.remove();
  });
  th.dataset.sortDir = dir;

  const getValue = (row) => {
    const text = (row.children[colIdx]?.innerText || '').trim();
    if (colType === 'number') {
      // Số Việt Nam dùng dấu chấm ngăn cách hàng nghìn (VD "7.388.889") - bỏ dấu
      // chấm trước khi parse, kèm bỏ ký tự "%" và "—" (ô trống/không xác định).
      const num = parseFloat(text.replace(/\./g, '').replace(',', '.').replace('%', '').replace('—', ''));
      return isNaN(num) ? -Infinity : num;
    }
    return text.toLowerCase();
  };

  rows.sort((a, b) => {
    const va = getValue(a), vb = getValue(b);
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
  rows.forEach(row => tbody.appendChild(row));

  const indicator = document.createElement('span');
  indicator.className = 'sort-indicator';
  indicator.textContent = dir === 'asc' ? ' ▲' : ' ▼';
  th.appendChild(indicator);
}

// Nút Copy riêng cho bảng "Kiểm tra giao dịch SePay v2"
// Lấy trực tiếp từ dữ liệu gốc (currentTxListData) thay vì đọc innerText của DOM,
// để mỗi giao dịch luôn ra đúng 1 hàng ngang, không bị tách dòng do "44 phút trước" / icon ngân hàng,
// và không copy kèm dòng "Tổng phát sinh".
function copyTxListTable() {
  try {
    if (!currentTxListData || currentTxListData.length === 0) {
      alert("Chưa có dữ liệu để copy. Vui lòng tra cứu danh sách giao dịch trước.");
      return;
    }
    let tsv = "";
    currentTxListData.forEach(tx => {
      const formattedDate = formatTxDate(tx.transaction_date); // ngày tháng năm giờ giao dịch
      const soTaiKhoan = tx.account_number || "";
      const noiDung = (tx.transaction_content || "").replace(/[\r\n\t]+/g, " ").trim();

      const inAmt = Number(tx.amount_in || 0);
      const outAmt = Number(tx.amount_out || 0);
      let soTien = "0";
      if (inAmt > 0) soTien = "+" + inAmt.toLocaleString('vi-VN');
      else if (outAmt > 0) soTien = "-" + outAmt.toLocaleString('vi-VN');

      const maDonHang = tx.code || "";
      const tenKh = tx.customer_name || "";
      const maKh = tx.customer_code || "";
      const soHd = tx.invoice_number || "";
      const ngayHd = tx.invoice_date || "";
      const tienChuaVat = (tx.amount_before_tax === "" || tx.amount_before_tax === undefined || tx.amount_before_tax === null) ? "" : Number(tx.amount_before_tax).toLocaleString('vi-VN');
      const soTienVat = (tx.vat_amount === "" || tx.vat_amount === undefined || tx.vat_amount === null) ? "" : Number(tx.vat_amount).toLocaleString('vi-VN');
      const tongTien = (tx.total_amount === "" || tx.total_amount === undefined || tx.total_amount === null) ? "" : Number(tx.total_amount).toLocaleString('vi-VN');

      tsv += [formattedDate, soTaiKhoan, noiDung, soTien, maDonHang, tenKh, maKh, soHd, ngayHd, tienChuaVat, soTienVat, tongTien].join("\t") + "\n";
    });
    navigator.clipboard.writeText(tsv).then(() => {
      const btn = document.getElementById("copyTxListBtn");
      const originalText = btn.innerText; btn.innerText = "✅ Đã Copy vào Khay nhớ tạm!";
      setTimeout(() => { btn.innerText = originalText; }, 2000);
    }).catch(() => { alert("Không thể tự động copy. Vui lòng thử lại."); });
  } catch (e) {
    alert("Đã xảy ra lỗi khi copy: " + e.message);
  }
}

async function doInvoiceLookup() {
  const rawInput = document.getElementById("invoiceCodes").value;
  const codes = rawInput.split(/[\n,; \t]+/).map(c => c.trim()).filter(c => c !== "");
  const btn = document.getElementById("invoiceBtn"); const progress = document.getElementById("invoiceProgress");
  const tableWrap = document.getElementById("invoiceTableWrap"); const copyBtn = document.getElementById("copyInvoiceBtn");
  const tbody = document.getElementById("invoiceTbody");
  if (codes.length === 0) { progress.style.display = 'block'; progress.innerHTML = '<span class="err">Vui lòng nhập ít nhất 1 số hóa đơn.</span>'; return; }
  btn.disabled = true; progress.style.display = 'block'; tableWrap.style.display = 'block'; copyBtn.style.display = 'none';
  tbody.innerHTML = ''; let successCount = 0;
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]; progress.innerHTML = `<span class="spinner" style="color:var(--accent)"></span> Đang xử lý ${i + 1}/${codes.length}... (${code})`;
    let tr = document.createElement("tr");
    try {
      const resp = await fetch("/api/index", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invoice", code, access_token: getToken() }) });
      const data = await resp.json();
      if (resp.ok) {
        const ok = data.status_msg === "Thành công"; if (ok) successCount++;
        const badgeHTML = ok ? `<span class="badge ok">${escapeHtml(data.status_msg)}</span>` : `<span class="badge err">${escapeHtml(data.status_msg || 'Thất bại')}</span>`;
        const amountFmt = (v) => (v === "" || v === null || v === undefined) ? "" : Number(v).toLocaleString('vi-VN');
        tr.innerHTML = `
          <td>${badgeHTML}</td>
          <td>${escapeHtml(data.invoice_no)}</td>
          <td>${escapeHtml(data.pattern_serial)}</td>
          <td>${escapeHtml(data.arising_date)}</td>
          <td>${escapeHtml(data.customer_name)}</td>
          <td>${escapeHtml(data.customer_id)}</td>
          <td>${escapeHtml(data.customer_address)}</td>
          <td>${amountFmt(data.amount_before_tax)}</td>
          <td>${amountFmt(data.vat_amount)}</td>
          <td>${amountFmt(data.total_amount)}</td>
          <td>${escapeHtml(data.payment_method)}</td>
          <td>${escapeHtml(data.invoice_type)}</td>`;
      } else {
        tr.innerHTML = `<td><span class="badge err">Lỗi</span></td><td>${escapeHtml(code)}</td><td colspan="10">${escapeHtml(data.error || "Lỗi server")}</td>`;
      }
    } catch (e) {
      tr.innerHTML = `<td><span class="badge err">Lỗi</span></td><td>${escapeHtml(code)}</td><td colspan="10">${escapeHtml(e.message)}</td>`;
    }
    tbody.appendChild(tr);
  }
  progress.innerHTML = `🎉 Hoàn tất! Thành công <strong style="color:var(--badge-ok-text)">${successCount}/${codes.length}</strong> hóa đơn.`; copyBtn.style.display = "inline-flex"; btn.disabled = false;
}

// TRA CỨU HÓA ĐƠN THEO KHOẢNG NGÀY (SePay eInvoice) - lấy toàn bộ hóa đơn 1 lần,
// không cần nhập từng số hóa đơn như doInvoiceLookup() ở trên.
async function doInvoiceLookupByDate() {
  const dateFrom = document.getElementById("invDateFrom").value.trim();
  const dateTo = document.getElementById("invDateTo").value.trim();
  const invoiceKind = document.getElementById("invInvoiceKind").value;
  const btn = document.getElementById("invByDateBtn");
  const progress = document.getElementById("invoiceByDateProgress");
  const resultsContainer = document.getElementById("invoiceByDateResultsContainer");

  if (!dateFrom || !dateTo) {
    progress.style.display = 'block';
    progress.innerHTML = '<span class="err">Vui lòng chọn Từ ngày và Đến ngày.</span>';
    return;
  }

  btn.disabled = true;
  progress.style.display = 'block';
  progress.innerHTML = '<span class="spinner" style="color:var(--accent)"></span> Đang tải toàn bộ hóa đơn...';
  resultsContainer.innerHTML = '';

  try {
    const resp = await fetch("/api/index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "invoice_by_date",
        start_date: dateFrom,
        end_date: dateTo,
        invoice_kind: invoiceKind,
        access_token: getToken()
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      progress.innerHTML = `<span class="err">${escapeHtml(data.error || "Lỗi server")}</span>`;
      btn.disabled = false;
      return;
    }

    const courses = data.courses || [];
    const summaryRow = document.createElement("div");
    summaryRow.style.cssText = "display:flex; flex-wrap:wrap; gap:20px; margin-bottom:24px; align-items:flex-start;";
    resultsContainer.appendChild(summaryRow);
    renderInvoiceByDateSummaryTable(courses, summaryRow);
    renderInvoiceByDateRefSummaryTable(courses, summaryRow);
    renderInvoiceByDateTabs(courses);

    const total = data.total || 0;
    progress.innerHTML = total
      ? `🎉 Hoàn tất! Tìm thấy <strong style="color:var(--badge-ok-text)">${total}</strong> hóa đơn, chia thành <strong style="color:var(--badge-ok-text)">${courses.length}</strong> khóa học.`
      : 'Không tìm thấy hóa đơn nào trong khoảng ngày này.';
  } catch (e) {
    progress.innerHTML = `<span class="err">${escapeHtml(e.message)}</span>`;
  }
  btn.disabled = false;
}

// Bảng tổng hợp: mỗi khóa học 1 dòng, kèm dòng TỔNG CỘNG gộp tất cả khóa học.
// Dùng lại đúng logic loại trừ hóa đơn gốc đã bị điều chỉnh (inv.note) như từng
// bảng chi tiết, để không cộng trùng tiền.
function renderInvoiceByDateSummaryTable(courses, targetContainer) {
  const amountFmt = (v) => (v === "" || v === null || v === undefined) ? "" : Number(v).toLocaleString('vi-VN');

  const wrap = document.createElement("div");
  wrap.style.cssText = "flex: 3 1 560px; min-width: 480px;";

  const headerRow = document.createElement("div");
  headerRow.style.cssText = "display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;";
  headerRow.innerHTML = `
    <h3 style="margin:0; font-size:14px;">Tổng hợp theo khóa học</h3>
    <button id="copyInvoiceSummaryBtn" class="btn-outline" onclick="copyTableToClipboard('invoiceByDateSummaryTable', 'copyInvoiceSummaryBtn')" style="font-size: 13px;">📋 Copy cho Excel / Sheets</button>`;
  wrap.appendChild(headerRow);

  const tableResponsive = document.createElement("div");
  tableResponsive.className = "table-responsive";
  const table = document.createElement("table");
  table.className = "bulk-table";
  table.id = "invoiceByDateSummaryTable";
  table.innerHTML = `
    <thead>
      <tr>
        <th>STT</th><th>Tên khóa học</th><th>Số lượng HĐ</th>
        <th>Số tiền</th><th>VAT (8%)</th><th>Tổng tiền</th><th>Số tiền REF</th>
      </tr>
    </thead>
    <tbody></tbody>`;
  const tbody = table.querySelector("tbody");

  let grandAmount = 0, grandVat = 0, grandTotal = 0, grandRef = 0, grandCount = 0;

  courses.forEach((course, idx) => {
    const invoices = course.invoices || [];
    let sumAmount = 0, sumVat = 0, sumTotal = 0, sumRef = 0;
    invoices.forEach((inv) => {
      if (inv.note && inv.note_type !== "thay_the") return; // chỉ bỏ qua hóa đơn gốc bị điều chỉnh giảm (hoàn tiền), hóa đơn bị thay thế vẫn tính vì tiền vẫn là thật
      sumAmount += Number(inv.amount_before_tax) || 0;
      sumVat += Number(inv.vat_amount) || 0;
      sumTotal += Number(inv.total_amount) || 0;
      sumRef += Number(inv.hoahong) || 0;
    });
    grandAmount += sumAmount; grandVat += sumVat; grandTotal += sumTotal; grandRef += sumRef;
    grandCount += invoices.length;

    const tr = document.createElement("tr");
    tr.dataset.count = invoices.length;
    tr.dataset.amount = sumAmount;
    tr.dataset.vat = sumVat;
    tr.dataset.total = sumTotal;
    tr.dataset.ref = sumRef;
    tr.style.cursor = "pointer";
    tr.title = "Bấm để xem chi tiết khóa học này";
    tr.onclick = () => switchInvoiceCourseTab(idx, courses.length);
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${escapeHtml(course.title)}</td>
      <td>${invoices.length}</td>
      <td>${amountFmt(sumAmount)}</td>
      <td>${amountFmt(sumVat)}</td>
      <td>${amountFmt(sumTotal)}</td>
      <td>${amountFmt(sumRef)}</td>`;
    tbody.appendChild(tr);
  });

  // Dòng tổng cộng đặt trong <tfoot> - không bị copyTableToClipboard() lấy vào
  // (hàm này chỉ đọc <tbody>), tránh copy nhầm dòng tổng khi dán qua Excel/Sheets.
  const tfoot = document.createElement("tfoot");
  tfoot.innerHTML = `
    <tr style="font-weight:700; background:var(--total-row-bg);">
      <td colspan="2" style="text-align:right;">TỔNG CỘNG TẤT CẢ KHÓA HỌC</td>
      <td>${grandCount}</td>
      <td>${amountFmt(grandAmount)}</td>
      <td>${amountFmt(grandVat)}</td>
      <td>${amountFmt(grandTotal)}</td>
      <td>${amountFmt(grandRef)}</td>
    </tr>`;
  table.appendChild(tfoot);

  // Lọc kiểu Excel + sắp xếp, giống bảng chi tiết từng khóa học.
  const summaryColTypes = [null, 'text', 'number', 'number', 'number', 'number', 'number'];
  attachTableFilterSort(table, summaryColTypes, (visibleRows) => {
    let vCount = 0, vAmount = 0, vVat = 0, vTotal = 0, vRef = 0;
    visibleRows.forEach((row) => {
      vCount += Number(row.dataset.count) || 0;
      vAmount += Number(row.dataset.amount) || 0;
      vVat += Number(row.dataset.vat) || 0;
      vTotal += Number(row.dataset.total) || 0;
      vRef += Number(row.dataset.ref) || 0;
    });
    const tfootTds = tfoot.querySelectorAll('tr td');
    tfootTds[1].textContent = vCount;
    tfootTds[2].textContent = amountFmt(vAmount);
    tfootTds[3].textContent = amountFmt(vVat);
    tfootTds[4].textContent = amountFmt(vTotal);
    tfootTds[5].textContent = amountFmt(vRef);
  });

  tableResponsive.appendChild(table);
  wrap.appendChild(tableResponsive);
  targetContainer.appendChild(wrap);
}

// Bảng tổng hợp tiền REF theo Mã ref (gộp từ TẤT CẢ khóa học). Bấm vào 1 dòng
// để mở rộng xem breakdown: mã ref đó kiếm được bao nhiêu tiền REF từ mỗi khóa học.
function renderInvoiceByDateRefSummaryTable(courses, targetContainer) {
  const amountFmt = (v) => (v === "" || v === null || v === undefined) ? "" : Number(v).toLocaleString('vi-VN');

  // Một số mã ref thực chất là CÙNG 1 NGƯỜI, chỉ khác mã do đổi username/mã KH
  // theo thời gian - gộp về đúng 1 tên chuẩn duy nhất trước khi tính tổng.
  // Key của map này PHẢI viết thường (chữ thường) vì bước chuẩn hóa bên dưới
  // luôn so khớp theo dạng chữ thường, không phân biệt hoa/thường.
  const REF_ALIAS_MAP = {
    "sa0005": "phk",
    "sa0003": "cqm",
    "sa0009": "bigman",
  };

  // refMap: { [mã ref đã chuẩn hóa]: { total: number, byCourse: { [tên khóa học]: number } } }
  const refMap = {};
  courses.forEach((course) => {
    (course.invoices || []).forEach((inv) => {
      if (inv.note && inv.note_type !== "thay_the") return; // chỉ bỏ qua hóa đơn gốc bị điều chỉnh giảm (hoàn tiền), thay thế vẫn tính ref
      const rawRef = (inv.ref_username || "").trim();
      if (!rawRef) return;
      // Không phân biệt hoa/thường: "phk", "PHK", "Phk" đều gộp về cùng 1 dòng.
      const normalizedRef = rawRef.toLowerCase();
      const ref = REF_ALIAS_MAP[normalizedRef] || normalizedRef;
      const amount = Number(inv.hoahong) || 0;
      if (!refMap[ref]) refMap[ref] = { total: 0, byCourse: {} };
      refMap[ref].total += amount;
      refMap[ref].byCourse[course.title] = (refMap[ref].byCourse[course.title] || 0) + amount;
    });
  });
  // Bỏ qua mã ref có tổng tiền REF bằng 0 (VD hoa hồng 0% hoặc dữ liệu rỗng).
  // Dùng Math.round thay vì so sánh !== 0 trực tiếp - phép cộng/trừ số thực có
  // thể để lại sai số cực nhỏ (VD 0.0000000001) khiến tổng không đúng bằng 0 tuyệt đối.
  const refEntries = Object.entries(refMap)
    .filter(([, data]) => Math.round(data.total) !== 0)
    .sort((a, b) => b[1].total - a[1].total);

  const wrap = document.createElement("div");
  wrap.style.cssText = "flex: 1 1 300px; max-width: 400px; min-width: 280px;";

  const headerRow = document.createElement("div");
  headerRow.style.cssText = "display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;";
  headerRow.innerHTML = `
    <h3 style="margin:0; font-size:14px;">Tổng hợp tiền REF theo Mã ref</h3>
    <button id="copyInvoiceRefSummaryBtn" class="btn-outline" onclick="copyTableToClipboard('invoiceByDateRefSummaryTable', 'copyInvoiceRefSummaryBtn')" style="font-size: 13px;">📋 Copy cho Excel / Sheets</button>`;
  wrap.appendChild(headerRow);

  const tableResponsive = document.createElement("div");
  tableResponsive.className = "table-responsive";
  const table = document.createElement("table");
  table.className = "bulk-table";
  table.id = "invoiceByDateRefSummaryTable";
  table.innerHTML = `
    <thead>
      <tr><th style="width:28px;"></th><th>STT</th><th>Mã ref</th><th>Tổng tiền REF</th></tr>
    </thead>
    <tbody></tbody>`;
  const tbody = table.querySelector("tbody");

  let grandRef = 0;

  refEntries.forEach(([ref, data], idx) => {
    grandRef += data.total;
    const detailId = `refDetail_${idx}`;

    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.title = "Bấm để xem chi tiết theo khóa học";
    tr.innerHTML = `
      <td class="ref-toggle-icon" style="text-align:center;">▶</td>
      <td>${idx + 1}</td>
      <td>${escapeHtml(ref)}</td>
      <td>${amountFmt(data.total)}</td>`;
    tr.onclick = () => toggleRefDetailRow(detailId, tr);
    tbody.appendChild(tr);

    const courseRowsHTML = Object.entries(data.byCourse)
      .sort((a, b) => b[1] - a[1])
      .map(([title, amt]) => `
        <tr>
          <td style="padding:4px 8px 4px 24px; border:none;">${escapeHtml(title)}</td>
          <td style="padding:4px 8px; text-align:right; border:none; white-space:nowrap;">${amountFmt(amt)}</td>
        </tr>`)
      .join("");

    const detailTr = document.createElement("tr");
    detailTr.id = detailId;
    detailTr.style.display = "none";
    detailTr.innerHTML = `
      <td colspan="4" style="padding:0; background:var(--input-bg);">
        <table style="width:100%; border-collapse:collapse;"><tbody>${courseRowsHTML}</tbody></table>
      </td>`;
    tbody.appendChild(detailTr);
  });

  const tfoot = document.createElement("tfoot");
  tfoot.innerHTML = `
    <tr style="font-weight:700; background:var(--total-row-bg);">
      <td colspan="3" style="text-align:right;">TỔNG CỘNG</td>
      <td>${amountFmt(grandRef)}</td>
    </tr>`;
  table.appendChild(tfoot);

  tableResponsive.appendChild(table);
  wrap.appendChild(tableResponsive);
  targetContainer.appendChild(wrap);
}

function toggleRefDetailRow(detailId, triggerRow) {
  const detailRow = document.getElementById(detailId);
  if (!detailRow) return;
  const isOpen = detailRow.style.display !== "none";
  detailRow.style.display = isOpen ? "none" : "table-row";
  const icon = triggerRow.querySelector(".ref-toggle-icon");
  if (icon) icon.textContent = isOpen ? "▶" : "▼";
}
// Dựng tab-bar + các bảng khóa học (mỗi khóa học 1 bảng, ẩn/hiện qua lại bằng tab
// thay vì xếp chồng dài từ trên xuống). Mỗi bảng vẫn dùng chung 13 cột đã thống nhất
// và có nút copy riêng (copyTableToClipboard đã có sẵn, dùng chung cho toàn app).
function renderInvoiceByDateTabs(courses) {
  const container = document.getElementById("invoiceByDateResultsContainer");
  if (courses.length === 0) return;

  const tabBar = document.createElement("div");
  tabBar.className = "course-tab-bar";
  courses.forEach((course, idx) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "course-tab" + (idx === 0 ? " active" : "");
    tab.id = `courseTab_${idx}`;
    tab.innerHTML = `${escapeHtml(course.title)} <span class="count">(${(course.invoices || []).length})</span>`;
    tab.onclick = () => switchInvoiceCourseTab(idx, courses.length);
    tabBar.appendChild(tab);
  });
  container.appendChild(tabBar);

  courses.forEach((course, idx) => {
    const panel = document.createElement("div");
    panel.id = `coursePanel_${idx}`;
    panel.style.display = idx === 0 ? "block" : "none";
    renderInvoiceByDateCourseTable(course, idx, panel);
    container.appendChild(panel);
  });
}

function switchInvoiceCourseTab(activeIdx, total) {
  for (let i = 0; i < total; i++) {
    const tab = document.getElementById(`courseTab_${i}`);
    const panel = document.getElementById(`coursePanel_${i}`);
    if (tab) tab.classList.toggle("active", i === activeIdx);
    if (panel) panel.style.display = i === activeIdx ? "block" : "none";
  }
}

// Dựng 1 bảng riêng cho 1 khóa học (item.id), dùng chung 13 cột đã thống nhất.
// Mỗi bảng có nút copy riêng (copyTableToClipboard đã có sẵn, dùng chung cho toàn app).
function renderInvoiceByDateCourseTable(course, courseIdx, panel) {
  const amountFmt = (v) => (v === "" || v === null || v === undefined) ? "" : Number(v).toLocaleString('vi-VN');
  const invoices = course.invoices || [];
  const tableId = `invoiceByDateTable_${courseIdx}`;
  const btnId = `copyInvoiceByDateBtn_${courseIdx}`;

  const headerRow = document.createElement("div");
  headerRow.style.cssText = "display:flex; justify-content:flex-end; align-items:center; margin-bottom:10px;";
  headerRow.innerHTML = `
    <button id="${btnId}" class="btn-outline" onclick="copyTableToClipboard('${tableId}', '${btnId}')" style="font-size: 13px;">📋 Copy cho Excel / Sheets</button>`;
  panel.appendChild(headerRow);

  const tableResponsive = document.createElement("div");
  tableResponsive.className = "table-responsive";
  const table = document.createElement("table");
  table.className = "bulk-table";
  table.id = tableId;
  table.innerHTML = `
    <thead>
      <tr>
        <th>STT</th><th>Mã ĐH</th><th>Họ và Tên</th><th>Mã KH</th><th>Số tiền</th><th>VAT (8%)</th>
        <th>Tổng tiền</th><th>Mã ref</th><th>Tên ref</th><th>% Ref</th><th>Số tiền REF</th>
        <th>Số HĐ</th><th>Note</th><th>Ngày GD</th>
      </tr>
    </thead>
    <tbody></tbody>`;
  const tbody = table.querySelector("tbody");

  invoices.forEach((inv, idx) => {
    // Hóa đơn GỐC bị điều chỉnh giảm (note_type = "dieu_chinh", thường là hoàn
    // tiền) -> xóa trắng 7 cột tiền/ref để không cộng nhầm vào tổng cuối bảng.
    // Hóa đơn GỐC bị thay thế (note_type = "thay_the", VD đổi cá nhân sang công
    // ty) -> tiền vẫn là tiền thật, GIỮ NGUYÊN 7 cột, chỉ thêm ghi chú.
    const blankColumns = !!inv.note && inv.note_type !== "thay_the";
    const orderCodeHTML = inv.order_code
      ? escapeHtml(inv.order_code)
      : `<span style="color:var(--text-muted);">—</span>`;
    const refRateHTML = (inv.commission_rate === "" || inv.commission_rate === null || inv.commission_rate === undefined)
      ? ""
      : `${escapeHtml(inv.commission_rate)}%`;
    const tr = document.createElement("tr");
    tr.dataset.amount = blankColumns ? "0" : (Number(inv.amount_before_tax) || 0);
    tr.dataset.vat = blankColumns ? "0" : (Number(inv.vat_amount) || 0);
    tr.dataset.total = blankColumns ? "0" : (Number(inv.total_amount) || 0);
    tr.dataset.ref = blankColumns ? "0" : (Number(inv.hoahong) || 0);
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${orderCodeHTML}</td>
      <td>${escapeHtml(inv.lead_name)}</td>
      <td>${escapeHtml(inv.username)}</td>
      <td>${blankColumns ? "" : amountFmt(inv.amount_before_tax)}</td>
      <td>${blankColumns ? "" : amountFmt(inv.vat_amount)}</td>
      <td>${blankColumns ? "" : amountFmt(inv.total_amount)}</td>
      <td>${blankColumns ? "" : escapeHtml(inv.ref_username)}</td>
      <td></td>
      <td>${blankColumns ? "" : refRateHTML}</td>
      <td>${blankColumns ? "" : amountFmt(inv.hoahong)}</td>
      <td>${escapeHtml(inv.invoice_no)}</td>
      <td>${escapeHtml(inv.note)}</td>
      <td>${escapeHtml(inv.arising_date)}</td>`;
    tbody.appendChild(tr);
  });

  // Dòng tổng cộng đặt trong <tfoot> (KHÔNG phải <tbody>) - vì copyTableToClipboard()
  // chỉ đọc dữ liệu trong <tbody>, nên đặt ở đây là cách tự nhiên nhất để nút copy
  // không vô tình copy luôn dòng tổng này.
  let sumAmount = 0, sumVat = 0, sumTotal = 0, sumRef = 0;
  invoices.forEach((inv) => {
    if (inv.note && inv.note_type !== "thay_the") return; // chỉ bỏ qua hóa đơn gốc bị điều chỉnh giảm (hoàn tiền), thay thế vẫn cộng vào tổng
    sumAmount += Number(inv.amount_before_tax) || 0;
    sumVat += Number(inv.vat_amount) || 0;
    sumTotal += Number(inv.total_amount) || 0;
    sumRef += Number(inv.hoahong) || 0;
  });
  const tfoot = document.createElement("tfoot");
  tfoot.innerHTML = `
    <tr style="font-weight:700; background:var(--total-row-bg);">
      <td colspan="4" style="text-align:right;">Tổng cộng</td>
      <td>${amountFmt(sumAmount)}</td>
      <td>${amountFmt(sumVat)}</td>
      <td>${amountFmt(sumTotal)}</td>
      <td colspan="3"></td>
      <td>${amountFmt(sumRef)}</td>
      <td colspan="3"></td>
    </tr>`;
  table.appendChild(tfoot);

  // Lọc kiểu Excel (ô nhập dưới mỗi tiêu đề cột) + bấm tiêu đề để sắp xếp.
  // Khi lọc thay đổi, tính lại dòng "Tổng cộng" theo đúng các dòng đang hiển thị,
  // dùng data-amount/vat/total/ref đã gắn sẵn (tránh phải parse lại số đã format).
  const courseColTypes = [null, 'text', 'text', 'text', 'number', 'number', 'number', 'text', null, 'number', 'number', 'text', 'text', 'text'];
  attachTableFilterSort(table, courseColTypes, (visibleRows) => {
    let vSumAmount = 0, vSumVat = 0, vSumTotal = 0, vSumRef = 0;
    visibleRows.forEach((row) => {
      vSumAmount += Number(row.dataset.amount) || 0;
      vSumVat += Number(row.dataset.vat) || 0;
      vSumTotal += Number(row.dataset.total) || 0;
      vSumRef += Number(row.dataset.ref) || 0;
    });
    const tfootTds = tfoot.querySelectorAll('tr td');
    tfootTds[1].textContent = amountFmt(vSumAmount);
    tfootTds[2].textContent = amountFmt(vSumVat);
    tfootTds[3].textContent = amountFmt(vSumTotal);
    tfootTds[5].textContent = amountFmt(vSumRef);
  });

  tableResponsive.appendChild(table);
  panel.appendChild(tableResponsive);
}

// TRA CỨU HÓA ĐƠN ĐIỆN TỬ (GDT) - đăng nhập bằng MST/mật khẩu + khoảng ngày
// Chia làm 3 lần gọi API tuần tự theo từng loại hóa đơn (ttxly), mỗi lần trả kết quả
// xong là hiển thị luôn 1 bảng riêng, nối tiếp bảng trước, không cần chờ đủ cả 3 loại.
const GDT_INVOICE_TYPES = [
  { ttxly: 5, title: "Hóa đơn có mã CQT" },
  { ttxly: 6, title: "Hóa đơn không mã" },
  { ttxly: 8, title: "Hóa đơn từ máy tính tiền" },
];

async function doGdtInvoiceLookup() {
  const username = document.getElementById("gdtUsername").value.trim();
  const password = document.getElementById("gdtPassword").value;
  const dateFrom = document.getElementById("gdtDateFrom").value.trim();
  const dateTo = document.getElementById("gdtDateTo").value.trim();
  const isPurchase = document.getElementById("gdtIsPurchase").value === "true";

  const btn = document.getElementById("gdtSearchBtn");
  const progress = document.getElementById("gdtProgress");
  const resultsContainer = document.getElementById("gdtResultsContainer");

  if (!username || !password) {
    progress.style.display = "block";
    progress.innerHTML = '<span class="err">Vui lòng nhập Mã số thuế và Mật khẩu.</span>';
    return;
  }
  if (!dateFrom || !dateTo) {
    progress.style.display = "block";
    progress.innerHTML = '<span class="err">Vui lòng chọn "Từ ngày" và "Đến ngày".</span>';
    return;
  }

  btn.disabled = true;
  progress.style.display = "block";
  resultsContainer.innerHTML = "";
  gdtLastInvoices = [];
  gdtLastCreds = { username, password, is_purchase: isPurchase };

  let sharedToken = null;   // Dùng lại token đăng nhập lần đầu cho 2 lần gọi sau, khỏi phải giải captcha lại
  let totalFound = 0;
  const problems = [];

  for (let t = 0; t < GDT_INVOICE_TYPES.length; t++) {
    const { ttxly, title } = GDT_INVOICE_TYPES[t];
    progress.innerHTML = `<span class="spinner" style="color:var(--accent)"></span> Đang tra cứu "${escapeHtml(title)}"... (${t + 1}/${GDT_INVOICE_TYPES.length})`;

    try {
      const resp = await fetch("/api/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "gdt_invoice_by_type",
          username, password,
          start_date: dateFrom, end_date: dateTo,
          is_purchase: isPurchase,
          ttxly,
          token: sharedToken,
          access_token: getToken()
        })
      });
      const data = await resp.json();

      if (!resp.ok) {
        problems.push(`${title}: ${data.error || "Lỗi không xác định"}`);
        // Nếu ngay lần đầu tiên (đăng nhập) đã lỗi thì dừng luôn, không thử tiếp các loại còn lại
        if (t === 0) break;
        continue;
      }

      if (data.token) sharedToken = data.token;
      const invoices = data.invoices || [];
      totalFound += invoices.length;
      renderGdtTypeTable(title, invoices);

      if (data.warnings && data.warnings.length > 0) {
        problems.push(...data.warnings.map(w => `${title}: ${w}`));
      }
    } catch (e) {
      problems.push(`${title}: Lỗi kết nối - ${e.message}`);
      if (t === 0) break;
    }
  }

  // Xoá mật khẩu khỏi ô nhập ngay sau khi gửi xong, không giữ lại trên form
  document.getElementById("gdtPassword").value = "";

  let summaryHtml;
  if (totalFound > 0) {
    summaryHtml = `🎉 Tìm thấy tổng cộng <strong style="color:var(--badge-ok-text)">${totalFound}</strong> hóa đơn.`;
  } else if (problems.length === 0) {
    summaryHtml = "⚠️ Không tìm thấy hóa đơn nào trong khoảng thời gian đã chọn.";
  } else {
    summaryHtml = "";
  }

  let problemHtml = "";
  if (problems.length > 0) {
    problemHtml = `<div style="margin-top:8px; color: var(--amount-out);">⚠️ ${problems.map(escapeHtml).join("<br>")}</div>`;
  }
  progress.innerHTML = summaryHtml + problemHtml;
  btn.disabled = false;
}

// Vẽ 1 bảng kết quả cho MỘT loại hóa đơn, nối tiếp vào bên dưới các bảng trước đó.
// Mỗi dòng trong bảng được gán index toàn cục trong gdtLastInvoices để mở popup chi tiết đúng hóa đơn.
function renderGdtTypeTable(title, invoices) {
  const container = document.getElementById("gdtResultsContainer");
  const amountFmt = (v) => (v === "" || v === null || v === undefined) ? "" : Number(v).toLocaleString('vi-VN');
  const dateFmt = (v) => {
    if (!v) return "";
    // API trả dạng "2026-07-19T17:00:00Z" -> hiển thị dd/mm/yyyy
    const d = new Date(v);
    if (isNaN(d.getTime())) return escapeHtml(v);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  };

  const wrap = document.createElement("div");
  wrap.style.marginBottom = "20px";

  const heading = document.createElement("h3");
  heading.style.cssText = "margin:0 0 10px; font-size:14px;";
  heading.innerHTML = `${escapeHtml(title)} <span style="color:var(--text-muted); font-weight:600;">(${invoices.length})</span>`;
  wrap.appendChild(heading);

  if (invoices.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.innerText = "Không có hóa đơn nào thuộc loại này.";
    wrap.appendChild(empty);
    container.appendChild(wrap);
    return;
  }

  const tableResponsive = document.createElement("div");
  tableResponsive.className = "table-responsive";
  const table = document.createElement("table");
  table.className = "bulk-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>#</th><th>Ký hiệu</th><th>Số HĐ</th><th>Ngày lập</th>
        <th>MST đối tác</th><th>Tên đối tác</th><th style="text-align:right;">Tổng tiền</th>
      </tr>
    </thead>
    <tbody></tbody>`;
  const tbody = table.querySelector("tbody");

  invoices.forEach((inv, idx) => {
    const globalIdx = gdtLastInvoices.length;
    gdtLastInvoices.push(inv);

    const tr = document.createElement("tr");
    tr.title = "Bấm để xem chi tiết hóa đơn";
    tr.onclick = () => openGdtInvoiceDetail(globalIdx);
    tr.innerHTML = `
      <td style="text-align:center;">${idx + 1}</td>
      <td>${escapeHtml(inv.khhdon)}</td>
      <td>${escapeHtml(inv.shdon)}</td>
      <td>${dateFmt(inv.tdlap)}</td>
      <td>${escapeHtml(inv.nbmst)}</td>
      <td>${escapeHtml(inv.nbten)}</td>
      <td style="text-align:right;">${amountFmt(inv.tgtttbso)}</td>`;
    tbody.appendChild(tr);
  });

  tableResponsive.appendChild(table);
  wrap.appendChild(tableResponsive);
  container.appendChild(wrap);
}

// Nhãn tiếng Việt thân thiện cho các trường hay gặp trong dữ liệu hóa đơn GDT.
// Trường nào không có trong danh sách này vẫn được hiển thị bình thường (dùng luôn tên trường gốc).
const GDT_FIELD_LABELS = {
  loai: "Loại hóa đơn", khhdon: "Ký hiệu hóa đơn", khmshdon: "Mẫu số hóa đơn",
  shdon: "Số hóa đơn", tdlap: "Ngày lập", nbmst: "MST người bán", nbten: "Tên người bán",
  nbdchi: "Địa chỉ người bán", nmmst: "MST người mua", nmten: "Tên người mua",
  nmdchi: "Địa chỉ người mua", tgtcthue: "Tổng tiền trước thuế", tgtthue: "Tổng tiền thuế",
  tgtttbso: "Tổng tiền thanh toán", thtruocthue: "Tổng tiền trước thuế", ttxly: "Trạng thái xử lý",
  ttcktmai: "Tiền chiết khấu thương mại", nlap: "Người lập", hdon: "Mã hóa đơn", id: "ID hóa đơn",
  hthdon: "Hình thức hóa đơn", tthai: "Trạng thái", dvtte: "Đơn vị tiền tệ", tgia: "Tỷ giá",
  hsgcnkntt: "Ký hiệu mã CQT", cqt: "Cơ quan thuế", khdon: "Ký hiệu đơn hàng"
};

function gdtFieldLabel(key) {
  if (GDT_FIELD_LABELS[key]) return GDT_FIELD_LABELS[key];
  return String(key).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function gdtFormatValue(val) {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "boolean") return val ? "Có" : "Không";
  if (typeof val === "number") {
    // Các trường số tiền lớn hiển thị theo định dạng VN, còn lại giữ nguyên
    return Number.isInteger(val) || Math.abs(val) >= 1000 ? val.toLocaleString('vi-VN') : String(val);
  }
  if (typeof val === "string") {
    // Nhận diện chuỗi ngày dạng ISO để hiển thị dễ đọc hơn
    const isoMatch = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val);
    if (isoMatch) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      }
    }
    return escapeHtml(val);
  }
  return escapeHtml(JSON.stringify(val));
}

// Render một object phẳng (key -> giá trị đơn) thành lưới các ô field
function renderGdtFieldGrid(obj) {
  const keys = Object.keys(obj).filter(k => {
    const v = obj[k];
    return !(Array.isArray(v) || (v && typeof v === "object"));
  });
  if (keys.length === 0) return '<div class="hint">Không có trường dữ liệu nào.</div>';
  return `<div class="gdt-field-grid">` + keys.map(k => `
    <div class="gdt-field">
      <div class="gdt-field-label">${escapeHtml(gdtFieldLabel(k))}</div>
      <div class="gdt-field-value">${gdtFormatValue(obj[k])}</div>
    </div>`).join("") + `</div>`;
}

// Render một mảng object (VD: danh sách hàng hóa/dịch vụ) thành bảng con
function renderGdtArrayTable(title, arr) {
  if (!arr || arr.length === 0) return "";
  const allKeys = [];
  arr.forEach(item => {
    if (item && typeof item === "object") {
      Object.keys(item).forEach(k => { if (!allKeys.includes(k)) allKeys.push(k); });
    }
  });
  if (allKeys.length === 0) return "";
  let html = `<div class="gdt-section-title">${escapeHtml(title)}</div>`;
  html += `<div class="table-responsive"><table class="bulk-table"><thead><tr>` +
    allKeys.map(k => `<th>${escapeHtml(gdtFieldLabel(k))}</th>`).join("") + `</tr></thead><tbody>`;
  arr.forEach(item => {
    html += "<tr>" + allKeys.map(k => `<td>${gdtFormatValue(item ? item[k] : "")}</td>`).join("") + "</tr>";
  });
  html += `</tbody></table></div>`;
  return html;
}

// Render toàn bộ dữ liệu chi tiết hóa đơn nhận được từ API (không giả định trước cấu trúc,
// hiển thị đầy đủ mọi trường trả về: field đơn -> lưới ô, field là mảng object -> bảng con,
// field là object lồng -> đệ quy thành 1 khối riêng có tiêu đề).
function renderGdtDetailContent(data) {
  if (!data || typeof data !== "object") {
    return `<div class="hint">Không có dữ liệu chi tiết.</div>`;
  }
  let html = "";
  html += `<div class="gdt-section-title">Thông tin chung</div>`;
  html += renderGdtFieldGrid(data);

  Object.keys(data).forEach(k => {
    const v = data[k];
    if (Array.isArray(v)) {
      html += renderGdtArrayTable(gdtFieldLabel(k), v);
    } else if (v && typeof v === "object") {
      html += `<div class="gdt-section-title">${escapeHtml(gdtFieldLabel(k))}</div>`;
      html += renderGdtFieldGrid(v);
    }
  });
  return html;
}

async function openGdtInvoiceDetail(idx) {
  const inv = gdtLastInvoices[idx];
  if (!inv || !gdtLastCreds) return;

  const overlay = document.getElementById("gdtDetailOverlay");
  const body = document.getElementById("gdtDetailBody");
  overlay.classList.remove("hidden");
  body.innerHTML = '<span class="spinner" style="color:var(--accent)"></span> Đang tải chi tiết hóa đơn...';

  try {
    const resp = await fetch("/api/index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "gdt_invoice_detail",
        username: gdtLastCreds.username,
        password: gdtLastCreds.password,
        is_purchase: gdtLastCreds.is_purchase,
        invoice: inv,
        access_token: getToken()
      })
    });
    const data = await resp.json();

    if (!resp.ok) {
      body.innerHTML = `<span class="err">❌ ${escapeHtml(data.error || "Không lấy được chi tiết hóa đơn.")}</span>`;
      return;
    }

    // Chấp nhận cả trường hợp API trả thẳng object chi tiết hoặc bọc trong { detail: {...} } / { invoice: {...} }
    const detail = data.detail || data.invoice || data;
    body.innerHTML = renderGdtDetailContent(detail);
  } catch (e) {
    body.innerHTML = `<span class="err">❌ Lỗi kết nối: ${escapeHtml(e.message)}</span>`;
  }
}

function closeGdtInvoiceDetail() {
  document.getElementById("gdtDetailOverlay").classList.add("hidden");
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const overlay = document.getElementById("gdtDetailOverlay");
    if (overlay && !overlay.classList.contains("hidden")) closeGdtInvoiceDetail();
  }
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",", 2)[1]); r.onerror = reject; r.readAsDataURL(file);
  });
}
function downloadBase64(b64, filename) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
}

// Chuyển tên viết hoa toàn bộ (VD: "HỒ ANH ĐỨC") thành dạng viết hoa đầu mỗi từ ("Hồ Anh Đức"), chỉ dùng để hiển thị
function toTitleCaseVN(str) {
  if (str === null || str === undefined) return "";
  return String(str).toLowerCase().split(" ").map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(" ");
}

// Lưu dữ liệu đã xử lý để dùng lại khi bấm "Tải về Excel", không cần đọc lại file
let airProcessedData = null;

async function doProcessAirPacking() {
  const fileInput = document.getElementById("airExcelFile");
  const box = document.getElementById("airResult");
  const btn = document.getElementById("exportAirBtn");
  const resultArea = document.getElementById("airResultArea");

  if (!fileInput.files.length) {
    box.innerHTML = '<span class="err">Vui lòng chọn file Excel.</span>';
    return;
  }

  const file = fileInput.files[0];
  btn.disabled = true;
  resultArea.style.display = "none";
  box.innerHTML = '<span class="spinner" style="color:var(--accent)"></span> Đang đọc và xử lý dữ liệu...';

  try {
    // 1. ĐỌC DỮ LIỆU BẰNG SHEETJS
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array' });

    let allBagsData = [];
    let customerName = "Khách hàng";
    let firstSheetProcessed = false;

    for (let i = 0; i < wb.SheetNames.length; i++) {
      const sheetName = wb.SheetNames[i];
      if (sheetName.toUpperCase() === 'TOTAL') continue;

      const ws = wb.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (jsonData.length === 0) continue;

      if (!firstSheetProcessed && jsonData.length > 3) {
        if (jsonData[3][1]) customerName = String(jsonData[3][1]).trim();
        firstSheetProcessed = true;
      }

      let headerIdx = jsonData.findIndex(row => row && row.some(cell => String(cell).toUpperCase().includes('BAG NO')));
      if (headerIdx === -1) continue;

      const headers = jsonData[headerIdx];
      const colBagNo = headers.findIndex(h => String(h).toUpperCase().includes('BAG NO'));
      const colItems = headers.findIndex(h => String(h).toUpperCase().includes('ITEMS'));
      const colKgs = headers.findIndex(h => String(h).toUpperCase().includes('KGS'));
      const colQtity = headers.findIndex(h => String(h).toUpperCase().includes('QTITY'));

      let currentBagNo = null;
      let currentKgs = null;
      let sheetBagsMap = new Map();

      for (let r = headerIdx + 1; r < jsonData.length; r++) {
        const row = jsonData[r];
        if (!row || row.length === 0) continue;
        if (colItems !== -1 && (row[colItems] === undefined || row[colItems] === null || String(row[colItems]).trim() === "")) continue;

        let bagNo = row[colBagNo];
        currentBagNo = (bagNo !== undefined && bagNo !== null && String(bagNo).trim() !== "") ? String(bagNo).trim() : currentBagNo;

        let kgsRaw = row[colKgs];
        if (kgsRaw !== undefined && kgsRaw !== null && String(kgsRaw).trim() !== "") {
          let kgs = parseFloat(String(kgsRaw).replace(',', '.'));
          if (!isNaN(kgs)) currentKgs = kgs;
        }

        let qtity = parseFloat(row[colQtity]) || 0;

        if (currentBagNo) {
          if (!sheetBagsMap.has(currentBagNo)) {
            sheetBagsMap.set(currentBagNo, { BAG_NO: currentBagNo, QTITY: 0, KGS: currentKgs });
          }
          sheetBagsMap.get(currentBagNo).QTITY += qtity;
        }
      }
      sheetBagsMap.forEach(val => allBagsData.push(val));
    }

    if (allBagsData.length === 0) {
      box.innerHTML = `<span class="err">❌ Không tìm thấy dữ liệu hợp lệ trong file!</span>`;
      return;
    }

    // Lưu lại để tải về sau, không tự động tải xuống ngay
    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth()+1).toString().padStart(2, '0')}/${today.getFullYear()}`;
    airProcessedData = { allBagsData, customerName, dateStr };

    renderAirPreviewTable(airProcessedData);
    resultArea.style.display = "block";
    box.innerHTML = `<span class="badge ok">✅ Đã xử lý xong ${allBagsData.length} bao. Vui lòng kiểm tra bảng bên dưới trước khi tải về.</span>`;
  } catch (e) {
    box.innerHTML = `<span class="err">❌ Lỗi: ${e.message}</span>`;
  } finally {
    btn.disabled = false;
  }
}

function renderAirPreviewTable(processed) {
  const { allBagsData, customerName, dateStr } = processed;
  const tbody = document.getElementById("airTbody");
  document.getElementById("airPreviewTitle").innerText = `Xem trước dữ liệu - HÀNG XUẤT AIR - ${dateStr}`;

  let totalSets = 0;
  let totalWeight = 0;
  let rowsHtml = "";
  allBagsData.forEach((bag, idx) => {
    totalSets += bag.QTITY;
    totalWeight += (bag.KGS || 0);
    rowsHtml += `<tr>
      <td style="text-align:center;">${idx + 1}</td>
      <td style="text-align:center;">${bag.BAG_NO}</td>
      <td>${customerName}</td>
      <td style="text-align:right;">${bag.QTITY}</td>
      <td style="text-align:right;">${(bag.KGS || 0)}</td>
    </tr>`;
  });
  tbody.innerHTML = rowsHtml;

  document.getElementById("airTotalBags").innerText = allBagsData.length;
  document.getElementById("airTotalSets").innerText = totalSets;
  document.getElementById("airTotalWeight").innerText = totalWeight.toFixed ? (Math.round(totalWeight * 100) / 100) : totalWeight;

  // Chỉ hiện nút "Chia sẻ ngay" trên thiết bị/trình duyệt hỗ trợ Web Share API (đa số điện thoại)
  const shareBtn = document.getElementById("shareAirBtn");
  if (shareBtn) {
    shareBtn.style.display = (typeof navigator.share === "function") ? "inline-block" : "none";
  }
}

// Tạo file Excel Air Packing List (dùng chung cho cả Tải về và Chia sẻ)
async function buildAirExcelFile() {
  if (!airProcessedData) {
    throw new Error("Vui lòng xử lý file trước.");
  }
  const { allBagsData, customerName, dateStr } = airProcessedData;

  // TẠO FILE MỚI & ĐỊNH DẠNG BẰNG EXCELJS
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sheet1');

  const titleRow = worksheet.addRow([`HÀNG XUẤT AIR - ${dateStr}`]);
  worksheet.mergeCells('A1:E1');
  const titleCell = worksheet.getCell('A1');
  titleCell.font = { name: 'Arial', size: 14, bold: true };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7C7AC' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  const customBorder = {
    top: { style: 'thin', color: { argb: 'FFBE5014' } },
    left: { style: 'thin', color: { argb: 'FFBE5014' } },
    bottom: { style: 'thin', color: { argb: 'FFBE5014' } },
    right: { style: 'thin', color: { argb: 'FFBE5014' } }
  };

  const headerRow = worksheet.addRow(['STT', 'Bag\nMARK', 'Customer Name', 'SET', 'Weight']);
  headerRow.height = 49.5;
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBE2D5' } };
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = customBorder;
  });

  let totalSets = 0;
  let totalWeight = 0;
  allBagsData.forEach((bag, idx) => {
    totalSets += bag.QTITY;
    totalWeight += (bag.KGS || 0);
    const row = worksheet.addRow([idx + 1, bag.BAG_NO, customerName, bag.QTITY, bag.KGS || 0]);
    row.eachCell((cell) => {
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = customBorder;
    });
  });

  const totalRow = worksheet.addRow(['', allBagsData.length, '', totalSets, totalWeight]);
  totalRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7C7AC' } };
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = customBorder;
  });

  worksheet.getColumn(1).width = 8.38;
  worksheet.getColumn(2).width = 8.38;
  worksheet.getColumn(3).width = 24.38;
  worksheet.getColumn(4).width = 8.38;
  worksheet.getColumn(5).width = 8.38;

  // Ghi 3 dòng ghi chú thêm vào cột B, cách dòng tổng 2 dòng, bỏ qua ô trống (không tạo dòng cho ô trống)
  const noteValues = [
    document.getElementById("airNote1").value.trim(),
    document.getElementById("airNote2").value.trim(),
    document.getElementById("airNote3").value.trim()
  ].filter(v => v !== "");

  let noteRowNum = totalRow.number + 2;
  noteValues.forEach((val) => {
    worksheet.getCell(`B${noteRowNum}`).value = val;
    noteRowNum++;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const exportFileName = `AIR-${dateStr.replace(/\//g, '-')}.xlsx`;
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  return { blob, exportFileName };
}

async function doDownloadAirPacking() {
  const box = document.getElementById("airResult");
  const dlBtn = document.getElementById("downloadAirBtn");

  if (!airProcessedData) {
    box.innerHTML = '<span class="err">Vui lòng xử lý file trước khi tải về.</span>';
    return;
  }

  dlBtn.disabled = true;
  box.innerHTML = '<span class="spinner" style="color:var(--accent)"></span> Đang tạo file Excel và định dạng Style (Màu, Viền)...';

  try {
    const { blob, exportFileName } = await buildAirExcelFile();
    saveAs(blob, exportFileName);
    box.innerHTML = `<span class="badge ok">🎉 Tuyệt vời! File  <b>${exportFileName}</b>  với đầy đủ Style đã được tạo ra.</span>`;
  } catch (e) {
    box.innerHTML = `<span class="err">❌ Lỗi: ${e.message}</span>`;
  } finally {
    dlBtn.disabled = false;
  }
}
  
async function doShareAirPacking() {
  const box = document.getElementById("airResult");
  const shareBtn = document.getElementById("shareAirBtn");

  if (!airProcessedData) {
    box.innerHTML = '<span class="err">Vui lòng xử lý file trước khi chia sẻ.</span>';
    return;
  }

  if (typeof navigator.share !== "function") {
    box.innerHTML = '<span class="err">Trình duyệt này không hỗ trợ chia sẻ trực tiếp. Vui lòng dùng nút "Tải về Excel" rồi gửi thủ công.</span>';
    return;
  }

  shareBtn.disabled = true;
  box.innerHTML = '<span class="spinner" style="color:var(--accent)"></span> Đang tạo file để chia sẻ...';

  try {
    const { blob, exportFileName } = await buildAirExcelFile();
    const file = new File([blob], exportFileName, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    // Kiểm tra thiết bị có hỗ trợ chia sẻ FILE (không chỉ text/link) hay không
    if (navigator.canShare && !navigator.canShare({ files: [file] })) {
      box.innerHTML = '<span class="err">Thiết bị này không hỗ trợ chia sẻ file Excel trực tiếp. Vui lòng dùng nút "Tải về Excel" rồi gửi thủ công qua Zalo/WhatsApp.</span>';
      return;
    }

    await navigator.share({
      files: [file],
      title: exportFileName,
      text: `File Air Packing List - ${exportFileName}`
    });

    box.innerHTML = `<span class="badge ok">🎉 Đã mở bảng chia sẻ cho file <b>${exportFileName}</b>. Chọn Zalo/WhatsApp để gửi tiếp.</span>`;
  } catch (e) {
    // Người dùng bấm huỷ bảng chia sẻ cũng sẽ rơi vào đây (AbortError) -> không coi là lỗi thật sự
    if (e && e.name === "AbortError") {
      box.innerHTML = '<span class="hint">Đã huỷ chia sẻ.</span>';
    } else {
      box.innerHTML = `<span class="err">❌ Lỗi khi chia sẻ: ${e.message}</span>`;
    }
  } finally {
    shareBtn.disabled = false;
  }
}

function toggleAccDetail(accountId) {
  const rows = document.querySelectorAll('.detail-row-' + accountId);
  const icon = document.getElementById('icon-' + accountId);
  
  if (rows.length > 0) {
    // Kiểm tra trạng thái của dòng đầu tiên
    const isHidden = rows[0].style.display === 'none';
    
    rows.forEach(r => {
      r.style.display = isHidden ? 'table-row' : 'none';
    });
    
    // Đổi icon mũi tên
    if (icon) icon.innerText = isHidden ? '▲' : '▼';
  }
}
</script>
</body>
</html>

```

### `movies_data.json`

```json
[
    {
        "title": "Chơi cô em gái mông to Onosaka Yuka",
        "link": "https://javhdz.video/choi-co-em-gai-mong-to-onosaka-yuka-3952.html",
        "image": "https://javhdz.video/data/LULU-441-2026-01.jpg",
        "views": "639,832",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/d72fa9ad6f3f04d4279e69671bf2602c/javhd-3952-playlist.m3u8"
    },
    {
        "title": "Chị gái đã dùng cặc của tôi để luyện kỹ năng Rikka Ono",
        "link": "https://javhdz.video/chi-gai-da-dung-cac-cua-toi-de-luyen-ky-nang-rikka-ono-3950.html",
        "image": "https://javhdz.video/data/MIDA-689-2026-01.jpg",
        "views": "645,482",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/13822fe22a3597f20dded7e258aada40/javhd-3950-playlist.m3u8"
    },
    {
        "title": "Hiếp em nhân viên vú to Yua Fukuda",
        "link": "https://javhdz.video/hiep-em-nhan-vien-vu-to-yua-fukuda-3953.html",
        "image": "https://javhdz.video/data/MIDA-688-2026-01.jpg",
        "views": "732,385",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/77b754e39ab75eb0f26b6c9ef45378c8/javhd-3953-playlist.m3u8"
    },
    {
        "title": "Chuyến tập huấn đầy giông bão của Nao Satsuki",
        "link": "https://javhdz.video/chuyen-tap-huan-day-giong-bao-cua-nao-satsuki-3951.html",
        "image": "https://javhdz.video/data/MNGS-067-2026-01.jpg",
        "views": "755,492",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/0d1c9bbb5e1af0dbc677bb4dc7e83f16/javhd-3951-playlist.m3u8"
    },
    {
        "title": "Cái giá của việc mê gái Ichika",
        "link": "https://javhdz.video/cai-gia-cua-viec-me-gai-ichika-3924.html",
        "image": "https://javhdz.video/data/JUR-072-2026-01.jpg",
        "views": "689,915",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/3f02b0f9e7d40633439f8f6cd0752131/javhd-3924-playlist.m3u8"
    },
    {
        "title": "Nhìn trộm chị gái thủ dâm và... Mei Washio",
        "link": "https://javhdz.video/nhin-trom-chi-gai-thu-dam-va----mei-washio-3946.html",
        "image": "https://javhdz.video/data/OFES-046-2026-01.jpg",
        "views": "961,988",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/2a76f6a1bd0230fd9575324f350af792/javhd-3946-playlist.m3u8"
    },
    {
        "title": "Vợ yêu đã bị gã giao hàng hiếp Mitsuha Chiharu",
        "link": "https://javhdz.video/vo-yeu-da-bi-ga-giao-hang-hiep-mitsuha-chiharu-3947.html",
        "image": "https://javhdz.video/data/DLDSS-520-2026-01.jpg",
        "views": "669,889",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/a366672241820c0c095d6fd0c5da50af/javhd-3947-playlist.m3u8"
    },
    {
        "title": "Thầy giáo may mắn và em nữ sinh dâm đảng Mio Ishikawa",
        "link": "https://javhdz.video/thay-giao-may-man-va-em-nu-sinh-dam-dang-mio-ishikawa-3949.html",
        "image": "https://javhdz.video/data/MIDA-726-2026-01.jpg",
        "views": "447,122",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/5afa3b7c8358a02b992d3e1ebffb347d/javhd-3949-playlist.m3u8"
    },
    {
        "title": "Ngoại tình với sếp vì chồng không chịch Miu Shiramine",
        "link": "https://javhdz.video/ngoai-tinh-voi-sep-vi-chong-khong-chich-miu-shiramine-3948.html",
        "image": "https://javhdz.video/data/ADN-789-2026-01.jpg",
        "views": "775,680",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/5adaf9f4734b1c53e34f8729054275d8/javhd-3948-playlist.m3u8"
    },
    {
        "title": "Khoe cặc trước mặt chị gái và cái kết Mina Kitano",
        "link": "https://javhdz.video/khoe-cac-truoc-mat-chi-gai-va-cai-ket-mina-kitano-3945.html",
        "image": "https://javhdz.video/data/OFES-043-2026-01.jpg",
        "views": "694,945",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/90f999f8a16149edda5836a1d10ccf03/javhd-3945-playlist.m3u8"
    },
    {
        "title": "Rình trộm em giúp việc vú to Megami Jun",
        "link": "https://javhdz.video/rinh-trom-em-giup-viec-vu-to-megami-jun-3944.html",
        "image": "https://javhdz.video/data/FNS-224-2026-01.jpg",
        "views": "732,880",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/46f960d7cf07bf727bb87d1219c846d4/javhd-3944-playlist.m3u8"
    },
    {
        "title": "Vợ dâm và anh thợ mát xa Riho Fujimori",
        "link": "https://javhdz.video/vo-dam-va-anh-tho-mat-xa-riho-fujimori-3939.html",
        "image": "https://javhdz.video/data/DASS-365-2026-01.jpg",
        "views": "669,942",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/b6005f6b3780ad78b6c74c9ec83f744e/javhd-3939-playlist.m3u8"
    },
    {
        "title": "Lần đầu của đôi bạn thân Yatsugake Umi",
        "link": "https://javhdz.video/lan-dau-cua-doi-ban-than-yatsugake-umi-3943.html",
        "image": "https://javhdz.video/data/ABF-362-2026-01.jpg",
        "views": "713,198",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/5332ac4dba3aaf6f2fd95a23e119c7bc/javhd-3943-playlist.m3u8"
    },
    {
        "title": "Húp chị gái vú to của thằng bạn thân Saitsuki Nanao",
        "link": "https://javhdz.video/hup-chi-gai-vu-to-cua-thang-ban-than-saitsuki-nanao-3941.html",
        "image": "https://javhdz.video/data/OFES-033-2026-01.jpg",
        "views": "617,950",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/0d11d0116e5e0c3ececd06808cbe947e/javhd-3941-playlist.m3u8"
    },
    {
        "title": "Bán thân giúp chồng trả nợ Ena Satsuki",
        "link": "https://javhdz.video/ban-than-giup-chong-tra-no-ena-satsuki-3935.html",
        "image": "https://javhdz.video/data/NSFS-239-2026-01.jpg",
        "views": "644,884",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/258f45836634197cc280535cc75146af/javhd-3935-playlist.m3u8"
    },
    {
        "title": "Chàng trai trẻ sung mãn Yui Tenma",
        "link": "https://javhdz.video/chang-trai-tre-sung-man-yui-tenma-3940.html",
        "image": "https://javhdz.video/data/NIMA-050-2026-02.jpg",
        "views": "568,581",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/06834af27fee247b57a50bfe186f8d8a/javhd-3940-playlist.m3u8"
    },
    {
        "title": "Những ngày học bú cùng chị gia sư Mei Itsukaichi",
        "link": "https://javhdz.video/nhung-ngay-hoc-bu-cung-chi-gia-su-mei-itsukaichi-3932.html",
        "image": "https://javhdz.video/data/HMN-872-2026-02.jpg",
        "views": "566,910",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/effc0f8b83ea2b93065f8ba2311f58e6/javhd-3932-playlist.m3u8"
    },
    {
        "title": "Lén lút mò vào phòng mẹ kế Yui Hatano",
        "link": "https://javhdz.video/len-lut-mo-vao-phong-me-ke-yui-hatano-3930.html",
        "image": "https://javhdz.video/data/HZGD-332-2026-02.jpg",
        "views": "705,828",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/7324d64adc270f5ae79e2541a1eb9954/javhd-3930-playlist.m3u8"
    },
    {
        "title": "Đi chơi gái gặp phải chị hàng xóm Natsume Reika",
        "link": "https://javhdz.video/di-choi-gai-gap-phai-chi-hang-xom-natsume-reika-3936.html",
        "image": "https://javhdz.video/data/DSOD-007-2026-01.jpg",
        "views": "754,389",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/d1d1d8cfaa790376dff614b7283c465b/javhd-3936-playlist.m3u8"
    },
    {
        "title": "Rình trộm mẹ vợ tắm Shinohara Iyo",
        "link": "https://javhdz.video/rinh-trom-me-vo-tam-shinohara-iyo-3937.html",
        "image": "https://javhdz.video/data/JUR-356-2026-01.jpg",
        "views": "857,759",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/906c7f673cbd059cce4baae37e467cc3/javhd-3937-playlist.m3u8?v1"
    },
    {
        "title": "Khe bím quyến rũ của nàng dâu Miu Nakamura",
        "link": "https://javhdz.video/khe-bim-quyen-ru-cua-nang-dau-miu-nakamura-3934.html",
        "image": "https://javhdz.video/data/JUR-094-2026-01.jpg",
        "views": "679,068",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/58daf5391d7e06c64e971424d5254799/javhd-3934-playlist.m3u8"
    },
    {
        "title": "Kỳ nghỉ hè khó quên cùng dì trẻ lẳng lơ Nagai Mihina",
        "link": "https://javhdz.video/ky-nghi-he-kho-quen-cung-di-tre-lang-lo-nagai-mihina-3925.html",
        "image": "https://javhdz.video/data/JUR-770-2026-01.jpg",
        "views": "1,181,107",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/5121a84f59bd5f9906b8fadfbcbeef95/javhd-3925-playlist.m3u8"
    },
    {
        "title": "Có không giữ mất thì tiếc Kuon Mio",
        "link": "https://javhdz.video/co-khong-giu-mat-thi-tiec-kuon-mio-3933.html",
        "image": "https://javhdz.video/data/JUR-088-2026-01.jpg",
        "views": "857,037",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/feaa80c6c2d8847aef19bc4750f2e747/javhd-3933-playlist.m3u8"
    },
    {
        "title": "Món quà tốt nghiệp của mẹ kế Tina Nanami",
        "link": "https://javhdz.video/mon-qua-tot-nghiep-cua-me-ke-tina-nanami-3931.html",
        "image": "https://javhdz.video/data/JUR-759-2026-01.jpg",
        "views": "949,374",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/3868075c8fdac7bc3460f836389fede8/javhd-3931-playlist.m3u8"
    },
    {
        "title": "Những gã đàn ông xấu xa Kashiwagi Fumika",
        "link": "https://javhdz.video/nhung-ga-dan-ong-xau-xa-kashiwagi-fumika-3926.html",
        "image": "https://javhdz.video/data/EBWH-338-2026-01.jpg",
        "views": "588,177",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/886dcf9080b436318c986c8976fea763/javhd-3926-playlist.m3u8"
    },
    {
        "title": "Mười giây đút cặc vào bím chị dâu Waka Natsuki",
        "link": "https://javhdz.video/muoi-giay-dut-cac-vao-bim-chi-dau-waka-natsuki-3929.html",
        "image": "https://javhdz.video/data/PRED-883-2026-01.jpg",
        "views": "1,027,661",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/be1cb1dc40a231afdc55b75cc7e3400e/javhd-3929-playlist.m3u8"
    },
    {
        "title": "Lồn tớ sướng quá... Jun Kasui",
        "link": "https://javhdz.video/lon-to-suong-qua----jun-kasui-3927.html",
        "image": "https://javhdz.video/data/MIMK-284-2026-01.jpg",
        "views": "680,693",
        "type": "Vietsub",
        "m3u8_url": ""
    },
    {
        "title": "Chơi em kế toán Miru Sakamichi",
        "link": "https://javhdz.video/choi-em-ke-toan-miru-sakamichi-3919.html",
        "image": "https://javhdz.video/data/SNOS-250-2026-01.jpg",
        "views": "474,628",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/55c5f702e4610b93092e8558aea1dee0/javhd-3919-playlist.m3u8"
    },
    {
        "title": "Bú em gái mưa Yamada Suzuna",
        "link": "https://javhdz.video/bu-em-gai-mua-yamada-suzuna-3918.html",
        "image": "https://javhdz.video/data/IPZZ-857-2026-01.jpg",
        "views": "634,229",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/2684d85852f856b9a27622f62dc54b40/javhd-3918-playlist.m3u8"
    },
    {
        "title": "Nữ sinh và gã thầy giáo đê tiện Nao Satsuki",
        "link": "https://javhdz.video/nu-sinh-va-ga-thay-giao-de-tien-nao-satsuki-3909.html",
        "image": "https://javhdz.video/data/CAWD-987-2026-01.jpg",
        "views": "510,737",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/139884caef453f6c4ae3ef8580e867b2/javhd-3909-playlist.m3u8"
    },
    {
        "title": "Sau ánh hào quang Shido Rui",
        "link": "https://javhdz.video/sau-anh-hao-quang-shido-rui-3917.html",
        "image": "https://javhdz.video/data/SNOS-234-2026-02.jpg",
        "views": "578,099",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/572a1eedc55aac973bdf6e989a8ddd9d/javhd-3917-playlist.m3u8"
    },
    {
        "title": "Chơi cô bạn thân vú to trong khách sạn Miina Tsuji",
        "link": "https://javhdz.video/choi-co-ban-than-vu-to-trong-khach-san-miina-tsuji-3923.html",
        "image": "https://javhdz.video/data/IPZZ-872-2026-01.jpg",
        "views": "862,262",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/3a2460f204a14925ff4165b6627049eb/javhd-3923-playlist.m3u8"
    },
    {
        "title": "Bán thân trả nợ cho thằng em trai báo thủ Fujisaki Mai",
        "link": "https://javhdz.video/ban-than-tra-no-cho-thang-em-trai-bao-thu-fujisaki-mai-3922.html",
        "image": "https://javhdz.video/data/IPZZ-869-2026-02.jpg",
        "views": "774,942",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/9d1affba3a3fcc3abc3c642425dc5f6a/javhd-3922-playlist.m3u8"
    },
    {
        "title": "Vợ dâm mê cặc thằng bạn thân Fuji Kanna",
        "link": "https://javhdz.video/vo-dam-me-cac-thang-ban-than-fuji-kanna-3921.html",
        "image": "https://javhdz.video/data/JUR-780-2026-01-02.jpg",
        "views": "680,554",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/7ca2dbf644e87b613521fb87062f0532/javhd-3921-playlist.m3u8"
    },
    {
        "title": "Cho anh đút cặc vào đi Kaede Fuua",
        "link": "https://javhdz.video/cho-anh-dut-cac-vao-di-kaede-fuua-3916.html",
        "image": "https://javhdz.video/data/SNOS-283-2026-01.jpg",
        "views": "752,684",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/a7b90c00077ba959a91927d1eb24966f/javhd-3916-playlist.m3u8"
    },
    {
        "title": "Trả quần lót cho mẹ đi Yuuka Niizuma",
        "link": "https://javhdz.video/tra-quan-lot-cho-me-di-yuuka-niizuma-3915.html",
        "image": "https://javhdz.video/data/JUR-735-2026-01.jpg",
        "views": "875,447",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/c5396a123b6eb11982d8445ef3333cb1/javhd-3915-playlist.m3u8"
    },
    {
        "title": "Tôi đã đụ em trưởng phòng kiêu ngạo Mai Tsubasa",
        "link": "https://javhdz.video/toi-da-du-em-truong-phong-kieu-ngao-mai-tsubasa-3914.html",
        "image": "https://javhdz.video/data/FNS-205-2026-01.jpg",
        "views": "732,095",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/186ed2fa643a3a9f1401927b2a5d35a2/javhd-3914-playlist.m3u8"
    },
    {
        "title": "Tôi đã yêu mẹ kế Reika Natsume",
        "link": "https://javhdz.video/toi-da-yeu-me-ke-reika-natsume-3911.html",
        "image": "https://javhdz.video/data/DASS-968-2026-01.jpg",
        "views": "666,866",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/b914c74c69143b0b2dc43a353c511eb9/javhd-3911-playlist.m3u8"
    },
    {
        "title": "Tôi đã bị hai cô sếp nữ vú to hiếp cả đêm Megami Jun",
        "link": "https://javhdz.video/toi-da-bi-hai-co-sep-nu-vu-to-hiep-ca-dem-megami-jun-3912.html",
        "image": "https://javhdz.video/data/FNS-211-2026-01.jpg",
        "views": "653,268",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/5eda0b34287f365a9612072cff6dab7b/javhd-3912-playlist.m3u8"
    },
    {
        "title": "Anh thợ sửa điều hoà may mắn Mei Satsuki",
        "link": "https://javhdz.video/anh-tho-sua-dieu-hoa-may-man-mei-satsuki-3905.html",
        "image": "https://javhdz.video/data/JUR-752-2026-01.jpg",
        "views": "782,276",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/db11cc13a99a34bd9076c796f8ac9b74/javhd-3905-playlist.m3u8"
    },
    {
        "title": "Cho tớ bóp vú cái đi Rikka Ono",
        "link": "https://javhdz.video/cho-to-bop-vu-cai-di-rikka-ono-3907.html",
        "image": "https://javhdz.video/data/MIDA-653-2026-01.jpg",
        "views": "829,869",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/46209df69885175dee3c354e2f26f1e4/javhd-3907-playlist.m3u8"
    },
    {
        "title": "Cái bím bót của em nữ sinh và con cặc bự",
        "link": "https://javhdz.video/cai-bim-bot-cua-em-nu-sinh-va-con-cac-bu-3903.html",
        "image": "https://javhdz.video/data/fc2ppv-4413473-2026-01.jpg",
        "views": "888,939",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/590c5136a2dfb6d51e0e8fb03043e70b/javhd-3903-playlist.m3u8"
    },
    {
        "title": "Lại phải sang nhờ bố chồng đút lò Mio Kuon",
        "link": "https://javhdz.video/lai-phai-sang-nho-bo-chong-dut-lo-mio-kuon-3904.html",
        "image": "https://javhdz.video/data/JUR-082-2026-01.jpg",
        "views": "1,063,003",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/c43b287ff05227635bfa8e048cc082f5/javhd-3904-playlist.m3u8"
    },
    {
        "title": "Bú lol chị gia sư ngọt nước Mio Ishikawa",
        "link": "https://javhdz.video/bu-lol-chi-gia-su-ngot-nuoc-mio-ishikawa-3906.html",
        "image": "https://javhdz.video/data/MIDA-649-2026-01.jpg",
        "views": "933,005",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/5a3b120a22abe422b5303a79d365fa3f/javhd-3906-playlist.m3u8"
    },
    {
        "title": "Hiếp em gái tây mê cặc lạ Melody Marks",
        "link": "https://javhdz.video/hiep-em-gai-tay-me-cac-la-melody-marks-3890.html",
        "image": "https://javhdz.video/data/FJIN-103-2026-01.jpg",
        "views": "577,824",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/cc960cb584dff163680576f4e1eeee09/javhd-3890-playlist.m3u8"
    },
    {
        "title": "Bố ơi, em nứng Mami Mashiro",
        "link": "https://javhdz.video/bo-oi-em-nung-mami-mashiro-3902.html",
        "image": "https://javhdz.video/data/DLDSS-499-2026-01.jpg",
        "views": "742,327",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/99d27b7541cf586ef74365a530146e2d/javhd-3902-playlist.m3u8"
    },
    {
        "title": "Chơi cô vợ xinh đẹp của gã sếp đáng ghét Miu Shiramine",
        "link": "https://javhdz.video/choi-co-vo-xinh-dep-cua-ga-sep-dang-ghet-miu-shiramine-3900.html",
        "image": "https://javhdz.video/data/DASS-943-2026-01.jpg",
        "views": "979,355",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/fce45a3574d6bb86a8bc605ef5a15abe/javhd-3900-playlist.m3u8"
    },
    {
        "title": "Tôi đã bị cô bạn thân của vợ đã vắt cực khô Miru",
        "link": "https://javhdz.video/toi-da-bi-co-ban-than-cua-vo-da-vat-cuc-kho-miru-3889.html",
        "image": "https://javhdz.video/data/SNOS-218-2026-01.jpg",
        "views": "709,782",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/22542f06c9dd99e061b104d856f653d5/javhd-3889-playlist.m3u8"
    },
    {
        "title": "Cô vợ đa nghi và tài xế của chồng Hayama Sayuri",
        "link": "https://javhdz.video/co-vo-da-nghi-va-tai-xe-cua-chong-hayama-sayuri-3901.html",
        "image": "https://javhdz.video/data/NSFS-481-2026-01.jpg",
        "views": "1,015,850",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/992fca2084f67b9cafd7cf453cf829cf/javhd-3901-playlist.m3u8"
    },
    {
        "title": "Lần đầu được đút cu vào bím chị dâu Nanami Tina",
        "link": "https://javhdz.video/lan-dau-duoc-dut-cu-vao-bim-chi-dau-nanami-tina-3898.html",
        "image": "https://javhdz.video/data/JUR-754-2026-01.jpg",
        "views": "2,091,209",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/3fc88a98134aa958fb27462f4b513bc5/javhd-3898-playlist.m3u8"
    },
    {
        "title": "Chăm sóc bố chồng đãng trí Tomo Shiraiwa",
        "link": "https://javhdz.video/cham-soc-bo-chong-dang-tri-tomo-shiraiwa-3873.html",
        "image": "https://javhdz.video/data/MIKR-081-2026-01.jpg",
        "views": "835,792",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/c67acd4586dfec767722db659509d766/javhd-3873-playlist.m3u8"
    },
    {
        "title": "Làm tình cùng mẹ vợ trước mặt vợ Natsume Reika",
        "link": "https://javhdz.video/lam-tinh-cung-me-vo-truoc-mat-vo-natsume-reika-3895.html",
        "image": "https://javhdz.video/data/DASS-937-2026-01.jpg",
        "views": "1,436,422",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/f6e645b667da527cab4ea844ba5a73e8/javhd-3895-playlist.m3u8"
    },
    {
        "title": "Dụ dỗ em gái 18 bím siêu múp hồng - Phần 3",
        "link": "https://javhdz.video/du-do-em-gai-18-bim-sieu-mup-hong---phan-3-3896.html",
        "image": "https://javhdz.video/data/FC2PPV-4903657-2026-01.jpg",
        "views": "1,258,139",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/f63bb661f0b4d87e45a8c752ba7714ce/javhd-3896-playlist.m3u8"
    },
    {
        "title": "Bí mật của em đồng nghiệp xinh đẹp Satsuki Nao",
        "link": "https://javhdz.video/bi-mat-cua-em-dong-nghiep-xinh-dep-satsuki-nao-3893.html",
        "image": "https://javhdz.video/data/JUFE-622-2026-02.jpg",
        "views": "896,369",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/c2258161d6769081676dab1a1ca4a4d7/javhd-3893-playlist.m3u8"
    },
    {
        "title": "Bố nhịn lâu lắm rồi đó Aizawa Miyu",
        "link": "https://javhdz.video/bo-nhin-lau-lam-roi-do-aizawa-miyu-3870.html",
        "image": "https://javhdz.video/data/BLK-691-2026-02.jpg",
        "views": "875,825",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/cad925c6085e088956f7931106cc3706/javhd-3870-playlist.m3u8"
    },
    {
        "title": "Đường cong của em thư ký trẻ Waka Natuki",
        "link": "https://javhdz.video/duong-cong-cua-em-thu-ky-tre-waka-natuki-3894.html",
        "image": "https://javhdz.video/data/PRED-876-2026-01.jpg",
        "views": "1,068,709",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/1d1ad6a11dce13d3775cae423415f655/javhd-3894-playlist.m3u8"
    },
    {
        "title": "Rình trộm nàng dâu tương lai và... Ayase Maria",
        "link": "https://javhdz.video/rinh-trom-nang-dau-tuong-lai-va----ayase-maria-3747.html",
        "image": "https://javhdz.video/data/MIDA-644-2026-01.jpg",
        "views": "708,280",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/f3efcc53add4031cac2a80ff358acbf5/javhd-3747-playlist.m3u8"
    },
    {
        "title": "Cặp vú trắng nõn của em y tá thực tập Shiraha Maina",
        "link": "https://javhdz.video/cap-vu-trang-non-cua-em-y-ta-thuc-tap-shiraha-maina-3892.html",
        "image": "https://javhdz.video/data/EBWH-331-2026-02.jpg",
        "views": "762,351",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/20437842ca20c51ea292f1792b7accdc/javhd-3892-playlist.m3u8?v1"
    },
    {
        "title": "Vợ yêu bán thân trả nợ cho chồng Miu Shiramine",
        "link": "https://javhdz.video/vo-yeu-ban-than-tra-no-cho-chong-miu-shiramine-3884.html",
        "image": "https://javhdz.video/data/SAME-234-2026-01.jpg",
        "views": "907,020",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/40175a6d286001d65c8f4078e1412a28/javhd-3884-playlist.m3u8"
    },
    {
        "title": "Tình cờ gặp lại người xưa Satsuki Nao",
        "link": "https://javhdz.video/tinh-co-gap-lai-nguoi-xua-satsuki-nao-3857.html",
        "image": "https://javhdz.video/data/JUR-753-2026-04.jpg",
        "views": "1,873,209",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/603646b8e244e2a4e988b7886a6f5208/javhd-3857-playlist.m3u8"
    },
    {
        "title": "Hai ngày bị dì vắt cạn tinh trùng Meguri",
        "link": "https://javhdz.video/hai-ngay-bi-di-vat-can-tinh-trung-meguri-3891.html",
        "image": "https://javhdz.video/data/JUR-713-2026-01.jpg",
        "views": "526,204",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/4fdbd251e25b457ad5de0d35252107c4/javhd-3891-playlist.m3u8?v5"
    },
    {
        "title": "Cho em đụ đi, em chịu hết nổi rồi Hibiki Ren",
        "link": "https://javhdz.video/cho-em-du-di-em-chiu-het-noi-roi-hibiki-ren-3874.html",
        "image": "https://javhdz.video/data/PRED-861-2026-01.jpg",
        "views": "1,079,280",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/43fcd6594492aef411cd09e0bb50b40c/javhd-3874-playlist.m3u8"
    },
    {
        "title": "Cô bạn gái ngay thơ của tôi đã bị địt tập thể Jun Kasui",
        "link": "https://javhdz.video/co-ban-gai-ngay-tho-cua-toi-da-bi-dit-tap-the-jun-kasui-3887.html",
        "image": "https://javhdz.video/data/HMN-831-2026-01.jpg",
        "views": "1,316,560",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/8d3a76d166bbf8ef473b055ffb36ba05/javhd-3887-playlist.m3u8"
    },
    {
        "title": "Gái 18 ngực đẹp da trắng nõn mặt xinh dâm đảng - Phần 3",
        "link": "https://javhdz.video/gai-18-nguc-dep-da-trang-non-mat-xinh-dam-dang---phan-3-3823.html",
        "image": "https://javhdz.video/data/FC2PPV-4857663-2026-01.jpg",
        "views": "902,220",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/c9c01a13f723d9d9433abc753687104c/javhd-3823-playlist.m3u8"
    },
    {
        "title": "Món quà cưới của gã người yêu cũ Matsumoto Ichika",
        "link": "https://javhdz.video/mon-qua-cuoi-cua-ga-nguoi-yeu-cu-matsumoto-ichika-3885.html",
        "image": "https://javhdz.video/data/PRED-248-2026-01.jpg",
        "views": "902,544",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/e9b1ebd972e664bb93bd80886940b6b6/javhd-3885-playlist.m3u8"
    },
    {
        "title": "Đổi vợ 2026 Miyu Aizawa",
        "link": "https://javhdz.video/doi-vo-2026-miyu-aizawa-3886.html",
        "image": "https://javhdz.video/data/ADN-778-2026-01.jpg",
        "views": "767,966",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/b67f13b1249933a308b66a0aca3eaf22/javhd-3886-playlist.m3u8"
    },
    {
        "title": "Cô bạn gái năm ấy Mio Ishikawa",
        "link": "https://javhdz.video/co-ban-gai-nam-ay-mio-ishikawa-3883.html",
        "image": "https://javhdz.video/data/MIMK-267-2026-03.jpg",
        "views": "855,704",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/d5739c5419834770a25c9c2afd7d3ee6/javhd-3883-playlist.m3u8"
    },
    {
        "title": "Trú mưa tại nhà thầy Rin Amasawa",
        "link": "https://javhdz.video/tru-mua-tai-nha-thay-rin-amasawa-3827.html",
        "image": "https://javhdz.video/data/JUFE-567-2026-01.jpg",
        "views": "518,252",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/1ed5dc645895332fc34fcde62bf506dd/javhd-3827-playlist.m3u8"
    },
    {
        "title": "Tôi đã ngoại tình với cô giáo mần mon Megami Jun",
        "link": "https://javhdz.video/toi-da-ngoai-tinh-voi-co-giao-man-mon-megami-jun-3881.html",
        "image": "https://javhdz.video/data/FNS-197-2026-05.jpg",
        "views": "1,450,836",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/0cb515646ace115c75d7e1be54a32e38/javhd-3881-playlist.m3u8"
    },
    {
        "title": "Nàng dâu đỏng đảnh Kuraki Hana",
        "link": "https://javhdz.video/nang-dau-dong-danh-kuraki-hana-3859.html",
        "image": "https://javhdz.video/data/SNOS-070-2026-03.jpg",
        "views": "688,740",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/4aad85e5b9eaf47cbe9a75f22ed0e03f/javhd-3859-playlist.m3u8"
    },
    {
        "title": "Rình mẹ vợ và bố mình đụ nhau Akari Niimura",
        "link": "https://javhdz.video/rinh-me-vo-va-bo-minh-du-nhau-akari-niimura-3880.html",
        "image": "https://javhdz.video/data/ALDN-270-2026-01.jpg",
        "views": "747,820",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/703ee2a8992d07854ffc5bcd1450488d/javhd-3880-playlist.m3u8"
    },
    {
        "title": "Cô gia sư dễ thương Minami Aizawa",
        "link": "https://javhdz.video/co-gia-su-de-thuong-minami-aizawa-3864.html",
        "image": "https://javhdz.video/data/IPX-857-2026-01.jpg",
        "views": "684,588",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/e590b1c4ba86a574fd64b9a103294600/javhd-3864-playlist.m3u8"
    },
    {
        "title": "Kỳ nghỉ khó quên cùng mẹ kế Misato Toyosaki",
        "link": "https://javhdz.video/ky-nghi-kho-quen-cung-me-ke-misato-toyosaki-3877.html",
        "image": "https://javhdz.video/data/JUL-256-2026-01.jpg",
        "views": "774,749",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/4e012418724246c1b7527f4069217247/javhd-3877-playlist.m3u8"
    },
    {
        "title": "Tuyệt chiêu móc bím của gã biến thái Shiraiba Maina",
        "link": "https://javhdz.video/tuyet-chieu-moc-bim-cua-ga-bien-thai-shiraiba-maina-3868.html",
        "image": "https://javhdz.video/data/EBWH-320-2026-01.jpg",
        "views": "660,277",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/247967a102d3257e867e0b4f9f898204/javhd-3868-playlist.m3u8"
    },
    {
        "title": "Dụ dỗ em gái 18 bím siêu múp hồng - Phần 2",
        "link": "https://javhdz.video/du-do-em-gai-18-bim-sieu-mup-hong---phan-2-3878.html",
        "image": "https://javhdz.video/data/FC2PPV-4885388-2026-01.jpg",
        "views": "1,158,893",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/4d5197262348fa70a81a0b19a2e00c31/javhd-3878-playlist.m3u8"
    },
    {
        "title": "Tôi đã bị vợ bạn thân quyến rũ Meru Ito",
        "link": "https://javhdz.video/toi-da-bi-vo-ban-than-quyen-ru-meru-ito-3867.html",
        "image": "https://javhdz.video/data/JUR-705-2026-01.jpg",
        "views": "831,322",
        "type": "Vietsub",
        "m3u8_url": ""
    },
    {
        "title": "Em hàng xóm tốt bụng Michelle Amane",
        "link": "https://javhdz.video/em-hang-xom-tot-bung-michelle-amane-3876.html",
        "image": "https://javhdz.video/data/ROYD-310-2026-01.jpg",
        "views": "608,105",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/cda5002d5498fcf7530aa63f9726878b/javhd-3876-playlist.m3u8"
    },
    {
        "title": "Dụ dỗ em gái 18 bím siêu múp hồng",
        "link": "https://javhdz.video/du-do-em-gai-18-bim-sieu-mup-hong-3872.html",
        "image": "https://javhdz.video/data/FC2PPV-4875798-2026-01.jpg",
        "views": "1,188,879",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/53df9648eea1d0dc0f0c41a73cf9073e/javhd-3872-playlist.m3u8"
    },
    {
        "title": "Vợ yêu đã mê cặc của gã xã hội đen Nanami Tina",
        "link": "https://javhdz.video/vo-yeu-da-me-cac-cua-ga-xa-hoi-den-nanami-tina-3875.html",
        "image": "https://javhdz.video/data/JUR-707-2026-01.jpg",
        "views": "1,118,021",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/80ea91e751d7e8f4d8b67d74579975b5/javhd-3875-playlist.m3u8"
    },
    {
        "title": "Bác hàng xóm may mắn Noa Eikawa",
        "link": "https://javhdz.video/bac-hang-xom-may-man-noa-eikawa-3871.html",
        "image": "https://javhdz.video/data/MFYD-127-2026-01.jpg",
        "views": "776,512",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/4738faddf9d71609e29fe910f9db662f/javhd-3871-playlist.m3u8"
    },
    {
        "title": "Cơn khoái lạc của bố dượng Mashiro Sana",
        "link": "https://javhdz.video/con-khoai-lac-cua-bo-duong-mashiro-sana-3854.html",
        "image": "https://javhdz.video/data/MIDA-571-2026-01.jpg",
        "views": "722,297",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/5f69f0a73e382bcea9f77a94a6e63c88/javhd-3854-playlist.m3u8"
    },
    {
        "title": "Khe lồn múp hồng của chị đồng nghiệp Aki Sasaki",
        "link": "https://javhdz.video/khe-lon-mup-hong-cua-chi-dong-nghiep-aki-sasaki-3866.html",
        "image": "https://javhdz.video/data/MIKR-084-2026-01.jpg",
        "views": "725,999",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/a00ce4dd4831301fe98c57fedbe74b11/javhd-3866-playlist.m3u8"
    },
    {
        "title": "Bàn tay hư hỏng của ông chú cô đơn Hono Watanabe",
        "link": "https://javhdz.video/ban-tay-hu-hong-cua-ong-chu-co-don-hono-watanabe-3840.html",
        "image": "https://javhdz.video/data/SNOS-146-2026-01.jpg",
        "views": "546,065",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/1d4fd25f7f60eb6eca1a8aa44146899f/javhd-3840-playlist.m3u8"
    },
    {
        "title": "Tôi đã bị chị dâu vú to ngồi lên cặc Aoi Tsukasa",
        "link": "https://javhdz.video/toi-da-bi-chi-dau-vu-to-ngoi-len-cac-aoi-tsukasa-3804.html",
        "image": "https://javhdz.video/data/SSIS-903-2026-01.jpg",
        "views": "846,769",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/12e4478befdf50b1f9ba8b875f9df88a/javhd-3804-playlist.m3u8"
    },
    {
        "title": "Ham muốn mãnh liệt của vợ dâm Hayama Sayuri",
        "link": "https://javhdz.video/ham-muon-manh-liet-cua-vo-dam-hayama-sayuri-3869.html",
        "image": "https://javhdz.video/data/ALDN-575-2026-01.jpg",
        "views": "1,189,904",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/cb0f48907417638c955086d61b6150d2/javhd-3869-playlist.m3u8"
    },
    {
        "title": "Nghịch bím chị trưởng phòng vú to Nitou Sayaka",
        "link": "https://javhdz.video/nghich-bim-chi-truong-phong-vu-to-nitou-sayaka-3846.html",
        "image": "https://javhdz.video/data/SONE-146-2026-01.jpg",
        "views": "780,606",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/8b746b264dd405b585bc59f0974b130c/javhd-3846-playlist.m3u8"
    },
    {
        "title": "Vụng trộm cùng nàng dâu xinh đẹp Kimitsuka Hinata",
        "link": "https://javhdz.video/vung-trom-cung-nang-dau-xinh-dep-kimitsuka-hinata-3828.html",
        "image": "https://javhdz.video/data/JUQ-094-2026-01.jpg",
        "views": "679,359",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/0eb74db3dac78af5b4d85a86ecf97fc0/javhd-3828-playlist.m3u8"
    },
    {
        "title": "Úp mặt vào cặp vú trắng nõn của chị trưởng phòng Rei Kamiki",
        "link": "https://javhdz.video/up-mat-vao-cap-vu-trang-non-cua-chi-truong-phong-rei-kamiki-3865.html",
        "image": "https://javhdz.video/data/START-542-2026-01.jpg",
        "views": "1,128,254",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/6b1fbdc33d4724520edaa96d8388e401/javhd-3865-playlist.m3u8"
    },
    {
        "title": "Bí mật showbiz Rui Shido",
        "link": "https://javhdz.video/bi-mat-showbiz-rui-shido-3862.html",
        "image": "https://javhdz.video/data/SNOS-167-2026-01.jpg",
        "views": "582,789",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/980b7da70e365bf7b3000e20905b7f51/javhd-3862-playlist.m3u8"
    },
    {
        "title": "Chơi em tiếp viên tập sự Miru Sakamichi",
        "link": "https://javhdz.video/choi-em-tiep-vien-tap-su-miru-sakamichi-3861.html",
        "image": "https://javhdz.video/data/SNOS-177-2026-01.jpg",
        "views": "801,724",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/fc9f49810f977f4d3d97ce21dc448cb3/javhd-3861-playlist.m3u8"
    },
    {
        "title": "Bướm xinh ẩm ướt Suzu Kiyomiya",
        "link": "https://javhdz.video/buom-xinh-am-uot-suzu-kiyomiya-3852.html",
        "image": "https://javhdz.video/data/FC2PPV-4873237-2026-01.jpg",
        "views": "1,185,160",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/28d6be70a982a060e10edd17fdf36e12/javhd-3852-playlist.m3u8"
    },
    {
        "title": "Nắc em hàng xóm chảnh choẹ Rin Hachimitsu",
        "link": "https://javhdz.video/nac-em-hang-xom-chanh-choe-rin-hachimitsu-3786.html",
        "image": "https://javhdz.video/data/FNS-112-2026-01.jpg",
        "views": "1,288,162",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/93cdbc199726285409ec73dff026f4fc/javhd-3786-playlist.m3u8"
    },
    {
        "title": "Đắm chìm trong khoái cảm cùng Misumi Nene",
        "link": "https://javhdz.video/dam-chim-trong-khoai-cam-cung-misumi-nene-3860.html",
        "image": "https://javhdz.video/data/IPZZ-708-2026-01.jpg",
        "views": "921,478",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/cdbabbb3a85d4f67e104517d17fcddf5/javhd-3860-playlist.m3u8"
    },
    {
        "title": "Nàng dâu và chuyện thầm kín cùng bố chồng Chiharu Mitsuha",
        "link": "https://javhdz.video/nang-dau-va-chuyen-tham-kin-cung-bo-chong-chiharu-mitsuha-3858.html",
        "image": "https://javhdz.video/data/DLDSS-486-2026-01.jpg",
        "views": "773,555",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/2f6fd5f2a5aa81bdf25eadf2b270f5a0/javhd-3858-playlist.m3u8"
    },
    {
        "title": "Bố thấy vú em đẹp không Sakura Mana",
        "link": "https://javhdz.video/bo-thay-vu-em-dep-khong-sakura-mana-3856.html",
        "image": "https://javhdz.video/data/START-541-2026-01.jpg",
        "views": "691,101",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/8e998ae28de323b2088c345ce54a091b/javhd-3856-playlist.m3u8"
    },
    {
        "title": "Hiếp cô vợ non tơ của đối tác Hikaru Miyanishi",
        "link": "https://javhdz.video/hiep-co-vo-non-to-cua-doi-tac-hikaru-miyanishi-3855.html",
        "image": "https://javhdz.video/data/ADN-721-2026-02.jpg",
        "views": "915,334",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/22c98bc109c5758cc814ffb27842f401/javhd-3855-playlist.m3u8"
    },
    {
        "title": "Những ngày ta đôi mươi Ishikawa Mio",
        "link": "https://javhdz.video/nhung-ngay-ta-doi-muoi-ishikawa-mio-3853.html",
        "image": "https://javhdz.video/data/MIDA-574-2026-01.jpg",
        "views": "1,119,108",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/c5ab8787bea1129cc92c0dd46e47806f/javhd-3853-playlist.m3u8"
    },
    {
        "title": "[Decen] Mối quan hệ sai trái cùng mẹ kế Hayama Sayuri",
        "link": "https://javhdz.video/decen-moi-quan-he-sai-trai-cung-me-ke-hayama-sayuri-3851.html",
        "image": "https://javhdz.video/data/GVH-832-2026-01.jpg",
        "views": "1,659,904",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/a3fb9f9509db38ab19f7dd58ca3b4af0/javhd-3851-playlist.m3u8?v1"
    },
    {
        "title": "Cô con gái riêng dễ thương của vợ Aosaka Aoi",
        "link": "https://javhdz.video/co-con-gai-rieng-de-thuong-cua-vo-aosaka-aoi-3848.html",
        "image": "https://javhdz.video/data/CAWD-955-2026-01.jpg",
        "views": "715,626",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/84e05ab4abe6b503ae551b950bc72b7b/javhd-3848-playlist.m3u8"
    },
    {
        "title": "Lần đầu nếm trải chất kích thích Shido Rui",
        "link": "https://javhdz.video/lan-dau-nem-trai-chat-kich-thich-shido-rui-3850.html",
        "image": "https://javhdz.video/data/SNOS-122-2026-02.jpg",
        "views": "1,002,716",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/b21fd30d421970c64aa62404c28371c6/javhd-3850-playlist.m3u8"
    },
    {
        "title": "Cở quần ra để anh mát xa cho nhé Miu Shiramine",
        "link": "https://javhdz.video/co-quan-ra-de-anh-mat-xa-cho-nhe-miu-shiramine-3849.html",
        "image": "https://javhdz.video/data/ADN-687-2026-01.jpg",
        "views": "1,182,898",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/03f5cbf7c295bfbd0358f5f928956bc9/javhd-3849-playlist.m3u8"
    },
    {
        "title": "Chăm sóc con trai riêng của chồng Miyu Imai",
        "link": "https://javhdz.video/cham-soc-con-trai-rieng-cua-chong-miyu-imai-3838.html",
        "image": "https://javhdz.video/data/JUR-669-2026-01.jpg",
        "views": "1,252,476",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/7d20375c05c385d18adb4a8c6c948876/javhd-3838-playlist.m3u8"
    },
    {
        "title": "Giúp chồng vực dậy công ty Mihama Miki",
        "link": "https://javhdz.video/giup-chong-vuc-day-cong-ty-mihama-miki-3842.html",
        "image": "https://javhdz.video/data/JUQ-665-2026-02.jpg",
        "views": "847,245",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/a1e14fcc90835ba45960032d40dd5aaa/javhd-3842-playlist.m3u8"
    },
    {
        "title": "Đụ em sinh viên phòng bên Yukimura Itsuki",
        "link": "https://javhdz.video/du-em-sinh-vien-phong-ben-yukimura-itsuki-3845.html",
        "image": "https://javhdz.video/data/PFES-122-2026-01.jpg",
        "views": "548,154",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/da7d1ec32357b9406a1c114ee4185514/javhd-3845-playlist.m3u8"
    },
    {
        "title": "Khe bím của mẹ thằng bạn Azuma Suzu",
        "link": "https://javhdz.video/khe-bim-cua-me-thang-ban-azuma-suzu-3836.html",
        "image": "https://javhdz.video/data/NSFS-436-2026-01.jpg",
        "views": "707,707",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/d8387046e22a68338dda31206f4db8b9/javhd-3836-playlist.m3u8"
    },
    {
        "title": "Cô vợ múp và những đàn ông đê tiện Koharu Suzuki",
        "link": "https://javhdz.video/co-vo-mup-va-nhung-dan-ong-de-tien-koharu-suzuki-3801.html",
        "image": "https://javhdz.video/data/DCOL-017-2026-01.jpg",
        "views": "652,181",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/b648e46381954a5ee6abed9d311c7398/javhd-3801-playlist.m3u8"
    },
    {
        "title": "Chị dâu là crush cũ của tôi Aizawa Miyu",
        "link": "https://javhdz.video/chi-dau-la-crush-cu-cua-toi-aizawa-miyu-3843.html",
        "image": "https://javhdz.video/data/PRED-859-2026-01.jpg",
        "views": "1,256,106",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/5575a016ecfe3ef7a1027564306bb23d/javhd-3843-playlist.m3u8"
    },
    {
        "title": "Bú và húp em gái body trắng nõn",
        "link": "https://javhdz.video/bu-va-hup-em-gai-body-trang-non-3844.html",
        "image": "https://javhdz.video/data/FC2PPV-4867711-2026-01.jpg",
        "views": "910,790",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/5781877f34ed9263c8f74aca8a71f6b6/javhd-3844-playlist.m3u8"
    },
    {
        "title": "Húp em dược sĩ thực tập Maina Shiraiba",
        "link": "https://javhdz.video/hup-em-duoc-si-thuc-tap-maina-shiraiba-3831.html",
        "image": "https://javhdz.video/data/EBWH-319-2026-01.jpg",
        "views": "963,840",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/60ffb1ffa3332327101caea820db9be0/javhd-3831-playlist.m3u8"
    },
    {
        "title": "Địt em dâu tương lai Chisaki China",
        "link": "https://javhdz.video/dit-em-dau-tuong-lai-chisaki-china-3841.html",
        "image": "https://javhdz.video/data/ROYD-301-2026-02-01.jpg",
        "views": "998,012",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/6b558edd24e4ca9841d570bf8ddb662d/javhd-3841-playlist.m3u8"
    },
    {
        "title": "Lạc trong mơ Mina Kitano",
        "link": "https://javhdz.video/lac-trong-mo-mina-kitano-3839.html",
        "image": "https://javhdz.video/data/DASS-903-2026-01.jpg",
        "views": "734,170",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/43e5a2069d4d5cf2524a4633839483a9/javhd-3839-playlist.m3u8"
    },
    {
        "title": "Bộ đồ ngủ quyến rũ của con gái vợ Jun Kasui",
        "link": "https://javhdz.video/bo-do-ngu-quyen-ru-cua-con-gai-vo-jun-kasui-3837.html",
        "image": "https://javhdz.video/data/HMN-817-2026-01.jpg",
        "views": "1,631,847",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/f3f620ac55c84350c030133eda0e1ed6/javhd-3837-playlist.m3u8"
    },
    {
        "title": "Thuốc kích dục của cháu trai biến thái Oshima Yuka",
        "link": "https://javhdz.video/thuoc-kich-duc-cua-chau-trai-bien-thai-oshima-yuka-3822.html",
        "image": "https://javhdz.video/data/ROE-354-2026-01.jpg",
        "views": "758,791",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/65f0cda7719dea177ec28f906f9c88da/javhd-3822-playlist.m3u8"
    },
    {
        "title": "Ông bố già hư hỏng của Miyanishi Hikaru",
        "link": "https://javhdz.video/ong-bo-gia-hu-hong-cua-miyanishi-hikaru-3832.html",
        "image": "https://javhdz.video/data/GVH-829-2026-01.jpg",
        "views": "916,136",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/e0edd9e50454235de5dc8109ec462b5b/javhd-3832-playlist.m3u8"
    },
    {
        "title": "Chàng trai năm ấy Kominato Yotsuha",
        "link": "https://javhdz.video/chang-trai-nam-ay-kominato-yotsuha-3835.html",
        "image": "https://javhdz.video/data/START-483-2026-01.jpg",
        "views": "562,588",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/35031fc94246fd0e94f3477fd94beaa4/javhd-3835-playlist.m3u8"
    },
    {
        "title": "Ngủ nhờ nhà em đồng nghiệp và... Suzumori Remu",
        "link": "https://javhdz.video/ngu-nho-nha-em-dong-nghiep-va----suzumori-remu-3830.html",
        "image": "https://javhdz.video/data/ABF-328-2026-01.jpg",
        "views": "825,389",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/16e2ee35cd2a531c24c59eb0e25cf739/javhd-3830-playlist.m3u8"
    },
    {
        "title": "Đây là lần đầu của anh Nanasawa Mia",
        "link": "https://javhdz.video/day-la-lan-dau-cua-anh-nanasawa-mia-3833.html",
        "image": "https://javhdz.video/data/MIDV-236-2026-01.jpg",
        "views": "511,219",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/f9b8be848b52a8ce48432dc9e04bcfef/javhd-3833-playlist.m3u8"
    },
    {
        "title": "Dụ dỗ bố dượng Hinori Uragami",
        "link": "https://javhdz.video/du-do-bo-duong-hinori-uragami-3825.html",
        "image": "https://javhdz.video/data/NACT-092-2026-01.jpg",
        "views": "773,244",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/b600302c8b9feb1b0249e3dda6b5da76/javhd-3825-playlist.m3u8"
    },
    {
        "title": "Mê con cặc của ông già biến thái Kashiwagi Fumika",
        "link": "https://javhdz.video/me-con-cac-cua-ong-gia-bien-thai-kashiwagi-fumika-3829.html",
        "image": "https://javhdz.video/data/EBWH-309-2026-01.jpg",
        "views": "860,779",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/9a2b832aba571e16401c3e746fb09092/javhd-3829-playlist.m3u8"
    },
    {
        "title": "Khoe chiến tích đụ vợ với bạn thân và cái kết Niizuma Yuka",
        "link": "https://javhdz.video/khoe-chien-tich-du-vo-voi-ban-than-va-cai-ket-niizuma-yuka-3820.html",
        "image": "https://javhdz.video/data/JUR-648-2026-01.jpg",
        "views": "1,619,969",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/3c7b5dc588c9d23487e5b699ad7e4075/javhd-3820-playlist.m3u8"
    },
    {
        "title": "Gái 18 ngực đẹp da trắng nõn mặt xinh dâm đảng - Phần 2",
        "link": "https://javhdz.video/gai-18-nguc-dep-da-trang-non-mat-xinh-dam-dang---phan-2-3817.html",
        "image": "https://javhdz.video/data/FC2PPV-4855098-2025-01.jpg",
        "views": "921,718",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/bd85cb06f285e493fadbb8d735beaf6b/javhd-3817-playlist.m3u8"
    },
    {
        "title": "Sự cám dỗ của em gái người yêu Seto Kanna",
        "link": "https://javhdz.video/su-cam-do-cua-em-gai-nguoi-yeu-seto-kanna-3826.html",
        "image": "https://javhdz.video/data/SNOS-093-2026-01.jpg",
        "views": "933,152",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/0a78e00b5ba8b526780860fa4f49ea6d/javhd-3826-playlist.m3u8"
    },
    {
        "title": "Mút cu ông đồng nghiệp già Aoi Ichino",
        "link": "https://javhdz.video/mut-cu-ong-dong-nghiep-gia-aoi-ichino-3824.html",
        "image": "https://javhdz.video/data/JUR-630-2026-01-02.jpg",
        "views": "608,328",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/91c609a745b4456bd29ec819994f0be0/javhd-3824-playlist.m3u8"
    },
    {
        "title": "Ngoại tình Sasahara Yuri - Phần 2",
        "link": "https://javhdz.video/ngoai-tinh-sasahara-yuri---phan-2-3819.html",
        "image": "https://javhdz.video/data/NSFS-453-2026-01.jpg",
        "views": "796,320",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/a918e026f78763cf23aadf08cbe3b49a/javhd-3819-playlist.m3u8"
    },
    {
        "title": "Bí mật vụng trộm cùng mẹ bạn thân Meguri",
        "link": "https://javhdz.video/bi-mat-vung-trom-cung-me-ban-than-meguri-3821.html",
        "image": "https://javhdz.video/data/JUR-633-2026-01.jpg",
        "views": "900,731",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/c92f1cbf267b9c47bb2f865063061183/javhd-3821-playlist.m3u8"
    },
    {
        "title": "Ngoại tình Sasahara Yuri - Phần 1",
        "link": "https://javhdz.video/ngoai-tinh-sasahara-yuri---phan-1-3818.html",
        "image": "https://javhdz.video/data/NSFS-445-2026-01.jpg",
        "views": "857,474",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/6bbf077d750a980e725db6b78642f02f/javhd-3818-playlist.m3u8"
    },
    {
        "title": "Dễ thương, ngây thơ và body cực quyến rũ",
        "link": "https://javhdz.video/de-thuong-ngay-tho-va-body-cuc-quyen-ru-3813.html",
        "image": "https://javhdz.video/data/FC2PPV-4847465-2026-01.jpg",
        "views": "1,588,734",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/0ebcd72097877ea3ca5f0cbe1b393b28/javhd-3813-playlist.m3u8"
    },
    {
        "title": "Cô cháu gái đáng yêu Yamada Suzuna",
        "link": "https://javhdz.video/co-chau-gai-dang-yeu-yamada-suzuna-3802.html",
        "image": "https://javhdz.video/data/IPZZ-796-2026-01.jpg",
        "views": "690,730",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/50071c6d22ff7a4cea9f4e3d6dd5a282/javhd-3802-playlist.m3u8"
    },
    {
        "title": "Yêu em từ cái nhìn đầu tiên Nao Iinari",
        "link": "https://javhdz.video/yeu-em-tu-cai-nhin-dau-tien-nao-iinari-3816.html",
        "image": "https://javhdz.video/data/SAME-229-2026-01.jpg",
        "views": "719,584",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/58a06e6f3d52e80c3db22c434545ee06/javhd-3816-playlist.m3u8"
    },
    {
        "title": "Gã bác sĩ đê tiện đã đụ crush của tôi Otori Miyu",
        "link": "https://javhdz.video/ga-bac-si-de-tien-da-du-crush-cua-toi-otori-miyu-3815.html",
        "image": "https://javhdz.video/data/ADN-768-2026-01.jpg",
        "views": "786,641",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/84e27b2a6f622be2c7f771b5c2e8fbb1/javhd-3815-playlist.m3u8"
    },
    {
        "title": "Cặp vú săn chắc căng tròn cực ngon",
        "link": "https://javhdz.video/cap-vu-san-chac-cang-tron-cuc-ngon-3787.html",
        "image": "https://javhdz.video/data/FC2PPV-4837636-2026-01.jpg",
        "views": "809,143",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/819fc9e67662baaaa60998d70cbecd42/javhd-3787-playlist.m3u8"
    },
    {
        "title": "Cô ấy đã đè tôi ra và đụ Shiromine Miu",
        "link": "https://javhdz.video/co-ay-da-de-toi-ra-va-du-shiromine-miu-3814.html",
        "image": "https://javhdz.video/data/ADN-764-2026-01.jpg",
        "views": "681,816",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/a4460f0151498db27c17df31369bc186/javhd-3814-playlist.m3u8"
    },
    {
        "title": "Bí mật của mẹ nuôi mặt dâm Tomomi Okanishi",
        "link": "https://javhdz.video/bi-mat-cua-me-nuoi-mat-dam-tomomi-okanishi-3805.html",
        "image": "https://javhdz.video/data/NSFS-312-2026-01.jpg",
        "views": "705,818",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/086836b8de5aec2a4a28b11e2d943868/javhd-3805-playlist.m3u8"
    },
    {
        "title": "Cô bạn thời thơ ấu đã khiến tôi ngoại tình Nanatsumori Riri",
        "link": "https://javhdz.video/co-ban-thoi-tho-au-da-khien-toi-ngoai-tinh-nanatsumori-riri-3809.html",
        "image": "https://javhdz.video/data/SNOS-084-2026-03.jpg",
        "views": "710,334",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/a131ec22af7a072e0247972ddd397b2a/javhd-3809-playlist.m3u8"
    },
    {
        "title": "Tương tư con cặc của em trai chồng Satsuki Mei",
        "link": "https://javhdz.video/tuong-tu-con-cac-cua-em-trai-chong-satsuki-mei-3812.html",
        "image": "https://javhdz.video/data/JUR-629-2026-02.jpg",
        "views": "989,250",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/3e4cdc7b097be225b686ed4fab6c8a16/javhd-3812-playlist.m3u8"
    },
    {
        "title": "Thần dược của những ông già bí ẩn Emika Shirakami",
        "link": "https://javhdz.video/than-duoc-cua-nhung-ong-gia-bi-an-emika-shirakami-3811.html",
        "image": "https://javhdz.video/data/SNOS-079-2026-01.jpg",
        "views": "933,957",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/1fbc3231c929d98e905ae490d8c56f70/javhd-3811-playlist.m3u8"
    },
    {
        "title": "Cô giáo và thuốc kích dục của cậu học trò Azuma Mika",
        "link": "https://javhdz.video/co-giao-va-thuoc-kich-duc-cua-cau-hoc-tro-azuma-mika-3810.html",
        "image": "https://javhdz.video/data/SNOS-087-2026-05.jpg",
        "views": "1,081,547",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/be99f8004799bad6330998c6a6ff473f/javhd-3810-playlist.m3u8"
    },
    {
        "title": "Mối quan hệ lén lút cùng bố chồng Aika Yumeno",
        "link": "https://javhdz.video/moi-quan-he-len-lut-cung-bo-chong-aika-yumeno-3807.html",
        "image": "https://javhdz.video/data/SNOS-120-2026-01.jpg",
        "views": "1,207,265",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/9a2fc7de78e8104464151e9c19b64c3f/javhd-3807-playlist.m3u8"
    },
    {
        "title": "Để dì kiểm tra cặc của con nào Tina Nanami",
        "link": "https://javhdz.video/de-di-kiem-tra-cac-cua-con-nao-tina-nanami-3808.html",
        "image": "https://javhdz.video/data/JUR-659-2026-02.jpg",
        "views": "992,910",
        "type": "Vietsub",
        "m3u8_url": ""
    },
    {
        "title": "Húp em học viên mu cao cực dâm Tadai Mahiro",
        "link": "https://javhdz.video/hup-em-hoc-vien-mu-cao-cuc-dam-tadai-mahiro-3806.html",
        "image": "https://javhdz.video/data/START-512-2026-01.jpg",
        "views": "673,575",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/564be6e1b9b1d23eec910d692408a113/javhd-3806-playlist.m3u8"
    },
    {
        "title": "Gái 18 ngực đẹp da trắng nõn mặt xinh dâm đảng",
        "link": "https://javhdz.video/gai-18-nguc-dep-da-trang-non-mat-xinh-dam-dang-3798.html",
        "image": "https://javhdz.video/data/FC2PPV-4845771-2026-01.jpg",
        "views": "1,525,745",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/e517ec3a9aec07c352e7bdb5294ce56d/javhd-3798-playlist.m3u8"
    },
    {
        "title": "Em vợ và mối tình vụng trộm cùng anh rể Egami Shiho",
        "link": "https://javhdz.video/em-vo-va-moi-tinh-vung-trom-cung-anh-re-egami-shiho-3765.html",
        "image": "https://javhdz.video/data/NSPS-582-2026-01.jpg",
        "views": "626,634",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/9a7d046d7c991055d5636255b3151cf7/javhd-3765-playlist.m3u8"
    },
    {
        "title": "Chị gái của thằng bạn thân đã dụ dỗ tôi đụ cô ấy Kuno Hinano",
        "link": "https://javhdz.video/chi-gai-cua-thang-ban-than-da-du-do-toi-du-co-ay-kuno-hinano-3803.html",
        "image": "https://javhdz.video/data/MIDA-523-2026-01.jpg",
        "views": "787,251",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/faa4539ee4f6c1586dc145ab021e1c94/javhd-3803-playlist.m3u8"
    },
    {
        "title": "Chịch bạn gái của thằng bạn thân Hikaru Harukaze",
        "link": "https://javhdz.video/chich-ban-gai-cua-thang-ban-than-hikaru-harukaze-3797.html",
        "image": "https://javhdz.video/data/MIMK-075-2026-01.jpg",
        "views": "756,655",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/9df996cd2dfc4a265c4334f743107c34/javhd-3797-playlist.m3u8?v1.1"
    },
    {
        "title": "Nụ cười e thẹn và vẻ đẹp trong veo của Rin-chan",
        "link": "https://javhdz.video/nu-cuoi-e-then-va-ve-dep-trong-veo-cua-rin-chan-3794.html",
        "image": "https://javhdz.video/data/FC2-PPV-4836468-2026-01.jpg",
        "views": "674,683",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/2b0c2cd90941f5530975bcbeb9d2f8cf/javhd-3794-playlist.m3u8"
    },
    {
        "title": "Anh quản lý may mắn và em idol xinh đẹp Yamada Suzuna",
        "link": "https://javhdz.video/anh-quan-ly-may-man-va-em-idol-xinh-dep-yamada-suzuna-3800.html",
        "image": "https://javhdz.video/data/IPZZ-725-2026-01.jpg",
        "views": "953,447",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/35b146f35173588f9b1e018bf4e9acf8/javhd-3800-playlist.m3u8"
    },
    {
        "title": "Sự trưởng thành của cô con gái cưng Hinori Uragami",
        "link": "https://javhdz.video/su-truong-thanh-cua-co-con-gai-cung-hinori-uragami-3777.html",
        "image": "https://javhdz.video/data/NACT-072-2026-02.jpg",
        "views": "1,067,496",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/c3526b224003f87c70de10f42410beca/javhd-3777-playlist.m3u8"
    },
    {
        "title": "Em y tá vú to dâm đảng Fumika Kashiwagi",
        "link": "https://javhdz.video/em-y-ta-vu-to-dam-dang-fumika-kashiwagi-3799.html",
        "image": "https://javhdz.video/data/EBWH-301-2026-01-02-01.jpg",
        "views": "837,583",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/e3fbd69165fdd2e013a92f19cea4c385/javhd-3799-playlist.m3u8"
    },
    {
        "title": "Bé nữ sinh mới lớn vú hồng lồn múp",
        "link": "https://javhdz.video/be-nu-sinh-moi-lon-vu-hong-lon-mup-3771.html",
        "image": "https://javhdz.video/data/FC2PPV-4740612-2026-01.jpg",
        "views": "871,870",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/d0f4a160b612bae395bcc0465814c237/javhd-3771-playlist.m3u8"
    },
    {
        "title": "Chơi em học viên ướt hết cả nệm Miru",
        "link": "https://javhdz.video/choi-em-hoc-vien-uot-het-ca-nem-miru-3796.html",
        "image": "https://javhdz.video/data/NOS-078-2026-01.jpg",
        "views": "1,295,944",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/3a2ded272bfde3657af01d5085227493/javhd-3796-playlist.m3u8"
    },
    {
        "title": "Gã chồng biến thái lừa vợ cho thằng khác địt Tomoe Hikari",
        "link": "https://javhdz.video/ga-chong-bien-thai-lua-vo-cho-thang-khac-dit-tomoe-hikari-3790.html",
        "image": "https://javhdz.video/data/NSFS-449-2026-01.jpg",
        "views": "985,023",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/8b98c91bca6f8b5dfcb998103e523d7c/javhd-3790-playlist.m3u8"
    },
    {
        "title": "Cô giáo dạy kèm và cậu học trò may mắn Karen Kaede",
        "link": "https://javhdz.video/co-giao-day-kem-va-cau-hoc-tro-may-man-karen-kaede-3793.html",
        "image": "https://javhdz.video/data/IPZZ-778-2026-01.jpg",
        "views": "723,827",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/889c83d153fd96c01d7b45d26ba78134/javhd-3793-playlist.m3u8"
    },
    {
        "title": "Tôi đã nhìn trộm chị ấy tắm Ashitaba Mitsuha",
        "link": "https://javhdz.video/toi-da-nhin-trom-chi-ay-tam-ashitaba-mitsuha-3795.html",
        "image": "https://javhdz.video/data/SNOS-074-2026-01.jpg",
        "views": "734,922",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/8913dcbf8ed17aca49618f382122ef49/javhd-3795-playlist.m3u8"
    },
    {
        "title": "Chơi cô giáo dạy bơi Yuuka Miyoshi",
        "link": "https://javhdz.video/choi-co-giao-day-boi-yuuka-miyoshi-3791.html",
        "image": "https://javhdz.video/data/PRED-833-2026-01.jpg",
        "views": "491,380",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/e44eeffac83d84da1c2a1289e143e307/javhd-3791-playlist.m3u8"
    },
    {
        "title": "Dục vọng kìm nén của em siêu mẫu Rui Shido",
        "link": "https://javhdz.video/duc-vong-kim-nen-cua-em-sieu-mau-rui-shido-3792.html",
        "image": "https://javhdz.video/data/SNOS-112-2026-01.jpg",
        "views": "960,101",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/e4af836e8d6d0b6f06d4a8cd16034fc4/javhd-3792-playlist.m3u8"
    },
    {
        "title": "Em gái dễ thương trắng xinh vú đẹp",
        "link": "https://javhdz.video/em-gai-de-thuong-trang-xinh-vu-dep-3789.html",
        "image": "https://javhdz.video/data/FC2-PPV-2763672-2026-01.jpg",
        "views": "666,576",
        "type": "Vietsub",
        "m3u8_url": "https://sf16-sg.tiktokcdn.top/stream/42df5f9c5a975b8361145a3044723ff8/javhd-3789-playlist.m3u8"
    }
]
```

### `player.html`

```html
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Trình phát phim</title>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/plyr/3.6.8/plyr.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/plyr/3.6.8/plyr.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.3/hls.min.js"></script>
    
    <style>
        body { margin: 0; background: #000; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; font-family: system-ui, sans-serif; }
        video { width: 100%; height: 100%; outline: none; object-fit: contain; }
        
        /* Cấu hình màu Plyr và phụ đề (chữ vàng, nền đen mờ) */
        :root { --plyr-color-main: #fe628e; --plyr-captions-background: rgba(0, 0, 0, 0.8); --plyr-captions-text-color: #facc15; }
        .plyr { width: 100%; height: 100%; }

        #error-msg { position: absolute; color: #f87171; display: none; text-align: center; padding: 20px; z-index: 30; max-width: 90%; background: rgba(0,0,0,0.8); border-radius: 8px; }
    </style>
</head>
<body>
    <video id="video" playsinline crossorigin="anonymous"></video>
    <div id="error-msg"></div>

    <script>
        // Cấu hình thanh Header của Telegram Mini App sang màu đen
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.ready();
            window.Telegram.WebApp.expand();
            window.Telegram.WebApp.setHeaderColor('#000000');
        }

        const video = document.getElementById('video');
        const errorDiv = document.getElementById('error-msg');
        let hlsInstance = null;
        let plyrInstance = null;

        // Lấy link phim và link phụ đề được truyền từ Bot Telegram
        const urlParams = new URLSearchParams(window.location.search);
        const streamUrl = urlParams.get('vid');
        const subtitleUrl = urlParams.get('sub');

        if (streamUrl) {
            playStream(streamUrl, subtitleUrl);
        } else {
            showError("❌ Không tìm thấy đường dẫn video.");
        }

        function playStream(streamUrl, subtitleUrl) {
            errorDiv.style.display = 'none';
            video.innerHTML = ''; // Xóa sạch các track cũ
            
            // Bơm phụ đề tiếng Việt vào thẻ video nếu có dữ liệu hợp lệ
            if (subtitleUrl && subtitleUrl !== "chưa có phụ đề") {
                const proxyUrl = '/api/subtitle?url=' + encodeURIComponent(subtitleUrl);
                const track = document.createElement('track');
                track.kind = 'captions';
                track.label = 'Tiếng Việt';
                track.srclang = 'vi';
                track.src = proxyUrl;
                track.default = true;
                video.appendChild(track);
            }

            // Cấu hình Plyr (tự động hiện phụ đề tiếng Việt)
            const playerSettings = {
                controls: ['play-large', 'rewind', 'play', 'fast-forward', 'progress', 'current-time', 'duration', 'mute', 'captions', 'settings', 'fullscreen', 'volume'],
                speed: { selected: 1, options: [0.5, 1, 1.25, 1.5, 2] },
                captions: { active: true, update: true, language: 'vi' },
                autoplay: true
            };

            if (Hls.isSupported()) {
                hlsInstance = new Hls({
                    autoStartLoad: true,
                    maxBufferLength: 20,         // Chỉ đệm tối đa 30 giây để tránh tải quá nhiều
                    maxMaxBufferLength: 40,
                    maxBufferSize: 15 * 1000 * 1000,
    
                // TỐI ƯU CHO MẠNG CHẬM / TELEGRAM MINI APP:
                    fragLoadingTimeOut: 20000,   // Tăng thời gian chờ mỗi phân mảnh lên 20 giây (tránh bị Abort vì timeout)
                    fragLoadingMaxRetry: 2,      // Cho phép thử lại 4 lần nếu lỗi
                    fragLoadingRetryDelay: 1000,  // Đợi 0.5s rồi mới thử lại
                    manifestLoadingTimeOut: 20000,
                    levelLoadingTimeOut: 20000,
    
                // Ngăn hls.js mở quá nhiều kết nối song song gây nghẽn
                    enableWorker: true
            });
                
                let parsedManifest = false;
                hlsInstance.on(Hls.Events.ERROR, (event, data) => {
                    if (!parsedManifest && data.networkDetails && data.networkDetails.status === 429) {
                        hlsInstance.loadSource(streamUrl);
                    }
                });

                hlsInstance.loadSource(streamUrl);
                hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                    plyrInstance = new Plyr(video, playerSettings);
                    video.play();
                });
                hlsInstance.attachMedia(video);
                
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = streamUrl;
                plyrInstance = new Plyr(video, playerSettings);
                video.play();
            } else {
                showError("❌ Trình duyệt hiện tại không hỗ trợ luồng HLS.");
            }
        }

        function showError(msg) {
            errorDiv.innerHTML = `<b>${msg}</b>`;
            errorDiv.style.display = 'block';
        }
    </script>
</body>
</html>

```

### `player1.html`

```html
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Trình phát phim & Danh mục</title>
    
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/plyr/3.6.8/plyr.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/plyr/3.6.8/plyr.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.3/hls.min.js"></script>
    
    <style>
        body { margin: 0; background: #0b0f19; font-family: system-ui, sans-serif; overflow-y: auto; color: white; padding-bottom: 60px; }
        :root { --plyr-color-main: #fe628e; --plyr-captions-background: rgba(0, 0, 0, 0.8); --plyr-captions-text-color: #facc15; }
        
        .player-wrapper { position: relative; width: 100%; height: 100vh; display: flex; justify-content: center; align-items: center; background: #000; }
        .plyr { width: 100%; height: 100%; z-index: 10; }
        
        #error-msg { position: absolute; color: #f87171; display: none; text-align: center; padding: 20px; z-index: 30; background: rgba(0,0,0,0.8); border-radius: 8px; }
        #welcome-screen { position: absolute; color: #475569; text-align: center; font-size: 18px; font-weight: 500; z-index: 1; user-select: none; }
        #welcome-screen span { font-size: 40px; display: block; margin-bottom: 10px; }

        #search-box {
            position: absolute; top: 20px; left: 50%; transform: translateX(-50%); z-index: 20;
            display: flex; gap: 8px; background: rgba(30, 41, 59, 0.9); padding: 10px; border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(4px); transition: opacity 0.3s; flex-wrap: wrap; justify-content: center; opacity: 1; pointer-events: auto;
        }
        
        body.video-active.hide-ui #search-box { opacity: 0; pointer-events: none; }
        
        #search-box input { padding: 10px 14px; border: none; border-radius: 6px; outline: none; background: #0f172a; color: #e2e8f0; font-size: 14px; }
        #search-box #accessToken { width: 140px; border: 1px solid rgba(255,255,255,0.1); }
        #search-box #movieCode { width: 180px; text-transform: uppercase; }
        #search-box button { padding: 10px 18px; border: none; border-radius: 6px; background: #3b82f6; color: white; font-weight: 600; cursor: pointer; transition: 0.2s;}
        #search-box button:hover { background: #2563eb; }
        #search-box button:disabled { background: #64748b; cursor: not-allowed; }

        #subtitle-box { flex-basis: 100%; text-align: center; margin-top: 5px; font-size: 13px; color: #e2e8f0; background: rgba(0,0,0,0.4); padding: 6px 10px; border-radius: 4px; display: none; }
        #subtitle-box a { color: #34d399; text-decoration: underline; font-weight: bold; margin-left: 5px; }
        #subtitle-box a:hover { color: #6ee7b7; }
        #subtitle-box.error { color: #fca5a5; }

        #home-sections { max-width: 1200px; margin: 40px auto; padding: 0 20px; }
        .category-row { margin-bottom: 40px; }
        .category-title { font-size: 22px; font-weight: 700; margin-bottom: 15px; padding-left: 12px; border-left: 5px solid #fe628e; }
        .movie-list { display: flex; overflow-x: auto; gap: 16px; padding-bottom: 12px; scrollbar-width: thin; scroll-behavior: smooth; }
        .movie-list::-webkit-scrollbar { height: 8px; }
        .movie-list::-webkit-scrollbar-track { background: #1e293b; border-radius: 4px; }
        .movie-list::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; }
        
        .movie-card { flex: 0 0 calc(20% - 13px); background: #1e293b; border-radius: 8px; overflow: hidden; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; }
        @media (max-width: 1024px) { .movie-card { flex: 0 0 calc(25% - 12px); } }
        @media (max-width: 768px) { .movie-card { flex: 0 0 calc(40% - 10px); } }
        @media (max-width: 480px) { .movie-card { flex: 0 0 calc(60% - 10px); } }
        .movie-card:hover { transform: translateY(-5px); box-shadow: 0 10px 20px rgba(0,0,0,0.5); }
        .movie-thumb { width: 100%; aspect-ratio: 16/9; background: #0f172a; object-fit: cover; border-bottom: 2px solid #fe628e; }
        .movie-info { padding: 12px; }
        .movie-code { color: #fe628e; font-weight: 700; font-size: 14px; margin-bottom: 6px; }
        .movie-title { color: #e2e8f0; font-size: 13px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    </style>
</head>
<body>
    <div class="player-wrapper">
        <div id="welcome-screen">
            <span>🍿</span>
            Nhập mã phim hoặc chọn từ danh sách bên dưới để bắt đầu
        </div>

        <div id="search-box">
            <input type="password" id="accessToken" placeholder="Mật khẩu truy cập" />
            <input type="text" id="movieCode" placeholder="Mã phim (VD: SNOS-056)" onkeydown="if(event.key==='Enter') fetchAndPlay()">
            <button id="playBtn" onclick="fetchAndPlay()">Phát Video</button>
            <div id="subtitle-box"></div>
        </div>

        <video id="player" playsinline crossorigin="anonymous"></video>
        <div id="error-msg"></div>
    </div>

    <div id="home-sections"></div>

    <script>
        const categories = [
            { slug: 'vi/today-hot', title: '🔥 Hot Hôm Nay' },
            { slug: 'vi/weekly-hot', title: '📅 Hot Trong Tuần' },
            { slug: 'vi/monthly-hot', title: '📆 Hot Trong Tháng' },
            { slug: 'vi/uncensored-leak', title: '🔞 Không Che (Rò Rỉ)' },
            { slug: 'vi/release', title: '🆕 Mới Cập Nhật' }
        ];

        let categoriesLoaded = false;
        const video = document.getElementById('player');
        const errorDiv = document.getElementById('error-msg');
        const welcomeScreen = document.getElementById('welcome-screen');
        const searchBox = document.getElementById('search-box');
        const subBox = document.getElementById('subtitle-box');
        let hlsInstance = null; let plyrInstance = null; let uiTimeout;

        function wakeUpUI() {
            document.body.classList.remove('hide-ui');
            clearTimeout(uiTimeout);
            if (document.body.classList.contains('video-active')) {
                uiTimeout = setTimeout(() => {
                    if (document.activeElement.tagName !== 'INPUT') { 
                        document.body.classList.add('hide-ui'); 
                    }
                }, 3000);
            }
        }
        document.addEventListener('mousemove', wakeUpUI);
        document.addEventListener('touchstart', wakeUpUI);
        document.addEventListener('keydown', wakeUpUI);
        searchBox.addEventListener('mouseenter', () => clearTimeout(uiTimeout));
        searchBox.addEventListener('mouseleave', wakeUpUI);

        document.addEventListener("DOMContentLoaded", () => {
            const savedToken = localStorage.getItem("sepay_access_token") || "";
            document.getElementById("accessToken").value = savedToken;
            
            const container = document.getElementById('home-sections');
            for (const cat of categories) {
                const section = document.createElement('div');
                section.className = 'category-row';
                section.innerHTML = `
                    <div class="category-title">${cat.title}</div>
                    <div class="movie-list" id="list-${cat.slug.replace('/', '-')}">
                        <div style="color: #64748b; padding-left: 12px; font-style: italic;">Nhập mật khẩu truy cập phía trên để tải danh sách...</div>
                    </div>
                `;
                container.appendChild(section);
            }

            if (savedToken) { loadCategories(savedToken); }
            const urlParams = new URLSearchParams(window.location.search);
            const rawVidUrl = urlParams.get('vid');
            if (rawVidUrl) { playStream(rawVidUrl, null); }
        });

        async function loadCategories(token) {
            categoriesLoaded = true;
            for (const cat of categories) {
                const listEl = document.getElementById(`list-${cat.slug.replace('/', '-')}`);
                listEl.innerHTML = '<div style="color: #cbd5e1; padding-left: 12px;">Đang tải danh sách...</div>';
                
                try {
                    const res = await fetch('/api/index', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'category', slug: cat.slug, access_token: token })
                    });
                    const data = await res.json();
                    listEl.innerHTML = ''; 

                    if (data.movies && data.movies.length > 0) {
                        data.movies.forEach(movie => {
                            const card = document.createElement('div');
                            card.className = 'movie-card';
                            card.onclick = () => {
                                document.getElementById('movieCode').value = movie.code;
                                fetchAndPlay();
                                window.scrollTo({ top: 0, behavior: 'smooth' }); 
                            };
                            
                            const thumbUrl = `https://fourhoi.mrstcdn.store/${movie.code.toLowerCase()}/cover-n.jpg`;
                            const thumbFallback = `https://fourhoi.mrstcdn.store/${movie.code.toLowerCase()}/cover-t.jpg`;
                            
                            card.innerHTML = `
                                <img class="movie-thumb" src="${thumbUrl}" onerror="this.src='${thumbFallback}'" loading="lazy" />
                                <div class="movie-info">
                                    <div class="movie-code">${movie.code}</div>
                                    <div class="movie-title" title="${movie.title}">${movie.title}</div>
                                </div>
                            `;
                            listEl.appendChild(card);
                        });
                    } else {
                        listEl.innerHTML = '<div style="color: #f87171; padding-left: 12px;">Không có dữ liệu hoặc sai mật khẩu.</div>';
                    }
                } catch(e) {
                    listEl.innerHTML = '<div style="color: #f87171; padding-left: 12px;">Lỗi mạng kết nối.</div>';
                }
            }
        }

        async function fetchAndPlay() {
            const codeInput = document.getElementById('movieCode').value.trim();
            const tokenInput = document.getElementById('accessToken').value.trim();
            
            localStorage.setItem("sepay_access_token", tokenInput);
            if (!categoriesLoaded) { loadCategories(tokenInput); }
            if (!codeInput) return;
            
            const btn = document.getElementById('playBtn');
            btn.disabled = true; btn.innerText = "Đang tìm..."; 
            errorDiv.style.display = 'none';
            subBox.style.display = 'none';

            try {
                const res = await fetch('/api/index', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'movie', code: codeInput, access_token: tokenInput })
                });
                const data = await res.json();
                
                if (!res.ok) {
                    showError("❌ " + (data.error || "Lỗi API")); 
                } else if (!data.stream_url) {
                    showError("❌ Không tìm thấy luồng m3u8."); 
                } else {
                    subBox.style.display = 'block';
                    subBox.classList.remove('error');
                    if (data.subtitle_url && data.subtitle_url !== "chưa có phụ đề") {
                        subBox.innerHTML = `✅ Phụ đề tiếng Việt đã được tự động áp dụng! <a href="${data.subtitle_url}" target="_blank">Tải file thủ công</a>`;
                    } else {
                        subBox.classList.add('error');
                        subBox.innerHTML = `⚠️ Phim này hiện chưa có phụ đề tiếng Việt trên hệ thống.`;
                    }

                    // Gửi thêm thông tin phụ đề vào hàm phát video
                    playStream(data.stream_url, data.subtitle_url); 
                }
            } catch (err) { 
                showError("❌ Lỗi mạng"); 
            } finally { 
                btn.disabled = false; btn.innerText = "Phát Video"; 
            }
        }

        function playStream(streamUrl, subtitleUrl) {
            errorDiv.style.display = 'none'; welcomeScreen.style.display = 'none';
            document.body.classList.add('video-active'); wakeUpUI(); 
            
            // Xóa rác của phiên cũ để nhúng phụ đề mới
            if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
            if (plyrInstance) { plyrInstance.destroy(); plyrInstance = null; }
            
            // Xóa tất cả các Track phụ đề cũ
            video.innerHTML = '';
            
            // Nếu có phụ đề, tạo đường dẫn gọi lên trạm trung chuyển (Proxy API)
            if (subtitleUrl && subtitleUrl !== "chưa có phụ đề") {
                const proxyUrl = '/api/subtitle?url=' + encodeURIComponent(subtitleUrl);
                const track = document.createElement('track');
                track.kind = 'captions';
                track.label = 'Tiếng Việt';
                track.srclang = 'vi';
                track.src = proxyUrl;
                track.default = true;
                video.appendChild(track);
            }

            // Bật sẵn cấu hình Captions (Phụ đề) cho Plyr
            const playerSettings = { 
                controls: ['play-large', 'rewind', 'play', 'fast-forward', 'progress', 'current-time', 'duration', 'mute', 'captions', 'settings', 'fullscreen', 'volume'], 
                speed: { selected: 1, options: [0.5, 1, 1.25, 1.5, 2] }, 
                autoplay: true, 
                captions: { active: true, update: true, language: 'vi' }, // Tự động hiển thị tiếng Việt
                i18n: { speed: 'Tốc độ', normal: 'Bình thường', quality: 'Chất lượng', qualityLabel: { 0: 'Tự động' } } 
            };

            if (Hls.isSupported()) {
                hlsInstance = new Hls({ autoStartLoad: true});
                let parsedManifest = false;
                hlsInstance.on(Hls.Events.ERROR, (event, data) => { if (!parsedManifest && data.networkDetails && data.networkDetails.status === 429) hlsInstance.loadSource(streamUrl); });
                hlsInstance.loadSource(streamUrl);
                
                hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => { 
                    plyrInstance = new Plyr(video, playerSettings); 
                    video.play(); 
                });
                hlsInstance.attachMedia(video);
                
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = streamUrl; 
                plyrInstance = new Plyr(video, playerSettings); 
                video.play();
            } else { 
                showError("Trình duyệt không hỗ trợ luồng HLS."); 
            }
        }

        function showError(msg) { errorDiv.innerHTML = `<b>${msg}</b>`; errorDiv.style.display = 'block'; }
    </script>
</body>
</html>

```

### `player2.html`

```html
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Trình phát phim & Danh mục</title>
    
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/plyr/3.6.8/plyr.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/plyr/3.6.8/plyr.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.3/hls.min.js"></script>
    
    <style>
        body { margin: 0; background: #0b0f19; font-family: system-ui, sans-serif; overflow-y: auto; color: white; padding-bottom: 60px; }
        :root { --plyr-color-main: #fe628e; --plyr-captions-background: rgba(0, 0, 0, 0.8); --plyr-captions-text-color: #facc15; }
        
        .player-wrapper { position: relative; width: 100%; height: 100vh; display: flex; justify-content: center; align-items: center; background: #000; }
        .plyr { width: 100%; height: 100%; z-index: 10; }
        
        #error-msg { position: absolute; color: #f87171; display: none; text-align: center; padding: 20px; z-index: 30; background: rgba(0,0,0,0.8); border-radius: 8px; }
        #welcome-screen { position: absolute; color: #475569; text-align: center; font-size: 18px; font-weight: 500; z-index: 1; user-select: none; }
        #welcome-screen span { font-size: 40px; display: block; margin-bottom: 10px; }

        #search-box {
            position: absolute; top: 20px; left: 50%; transform: translateX(-50%); z-index: 20;
            display: flex; gap: 8px; background: rgba(30, 41, 59, 0.9); padding: 10px; border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(4px); transition: opacity 0.3s; flex-wrap: wrap; justify-content: center; opacity: 1; pointer-events: auto;
        }
        
        body.video-active.hide-ui #search-box { opacity: 0; pointer-events: none; }
        
        #search-box input { padding: 10px 14px; border: none; border-radius: 6px; outline: none; background: #0f172a; color: #e2e8f0; font-size: 14px; width: 250px; }
        #search-box button { padding: 10px 18px; border: none; border-radius: 6px; background: #3b82f6; color: white; font-weight: 600; cursor: pointer; transition: 0.2s;}
        #search-box button:hover { background: #2563eb; }

        #home-sections { max-width: 1200px; margin: 40px auto; padding: 0 20px; }
        .category-row { margin-bottom: 40px; }
        .category-title { font-size: 22px; font-weight: 700; margin-bottom: 15px; padding-left: 12px; border-left: 5px solid #fe628e; }
        .movie-list { display: flex; overflow-x: auto; gap: 16px; padding-bottom: 12px; scrollbar-width: thin; scroll-behavior: smooth; flex-wrap: wrap;}
        .movie-list::-webkit-scrollbar { height: 8px; }
        .movie-list::-webkit-scrollbar-track { background: #1e293b; border-radius: 4px; }
        .movie-list::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; }
        
        .movie-card { flex: 0 0 calc(20% - 13px); background: #1e293b; border-radius: 8px; overflow: hidden; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; margin-bottom: 16px;}
        @media (max-width: 1024px) { .movie-card { flex: 0 0 calc(25% - 12px); } }
        @media (max-width: 768px) { .movie-card { flex: 0 0 calc(40% - 10px); } }
        @media (max-width: 480px) { .movie-card { flex: 0 0 calc(60% - 10px); } }
        .movie-card:hover { transform: translateY(-5px); box-shadow: 0 10px 20px rgba(0,0,0,0.5); }
        .movie-thumb { width: 100%; aspect-ratio: 16/9; background: #0f172a; object-fit: cover; border-bottom: 2px solid #fe628e; }
        .movie-info { padding: 12px; }
        .movie-title { color: #e2e8f0; font-size: 13px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 5px;}
        .movie-views { color: #94a3b8; font-size: 11px; }
        .movie-type { display: inline-block; background: #fe628e; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; margin-bottom: 5px; }
    </style>
</head>
<body>
    <div class="player-wrapper">
        <div id="welcome-screen">
            <span>🍿</span>
            Chọn phim từ danh sách bên dưới để bắt đầu
        </div>

        <div id="search-box">
            <input type="text" id="searchInput" placeholder="Tìm kiếm tên phim..." oninput="filterMovies()">
            <button onclick="filterMovies()">Tìm kiếm</button>
        </div>

        <video id="player" playsinline crossorigin="anonymous"></video>
        <div id="error-msg"></div>
    </div>

    <div id="home-sections">
        <div class="category-row">
            <div class="category-title">🎬 Danh Sách Phim</div>
            <div class="movie-list" id="movie-container">
                <div style="color: #cbd5e1; padding-left: 12px;">Đang tải dữ liệu JSON...</div>
            </div>
        </div>
    </div>

    <script>
        const video = document.getElementById('player');
        const errorDiv = document.getElementById('error-msg');
        const welcomeScreen = document.getElementById('welcome-screen');
        const movieContainer = document.getElementById('movie-container');
        const searchInput = document.getElementById('searchInput');
        let hlsInstance = null; 
        let plyrInstance = null; 
        let uiTimeout;
        let allMovies = []; // Lưu trữ toàn bộ dữ liệu phim

        // Ẩn/Hiện UI khi có tương tác
        function wakeUpUI() {
            document.body.classList.remove('hide-ui');
            clearTimeout(uiTimeout);
            if (document.body.classList.contains('video-active')) {
                uiTimeout = setTimeout(() => {
                    if (document.activeElement.tagName !== 'INPUT') { 
                        document.body.classList.add('hide-ui'); 
                    }
                }, 3000);
            }
        }
        document.addEventListener('mousemove', wakeUpUI);
        document.addEventListener('touchstart', wakeUpUI);
        document.addEventListener('keydown', wakeUpUI);

        // Chạy ngay khi web load xong
        document.addEventListener("DOMContentLoaded", () => {
            loadMoviesFromJson();
        });

        // Đọc dữ liệu từ file JSON cục bộ
        async function loadMoviesFromJson() {
            try {
                const response = await fetch('movies_data.json');
                if (!response.ok) throw new Error("Không thể tải file JSON");
                
                allMovies = await response.json();
                renderMovies(allMovies);
            } catch (error) {
                movieContainer.innerHTML = `<div style="color: #f87171; padding-left: 12px;">Lỗi: Vui lòng chạy trang web qua Local Server. ${error.message}</div>`;
                console.error(error);
            }
        }

        // Render thẻ phim ra giao diện
        function renderMovies(movies) {
            movieContainer.innerHTML = '';
            
            if (movies.length === 0) {
                movieContainer.innerHTML = '<div style="color: #cbd5e1; padding-left: 12px;">Không tìm thấy phim nào.</div>';
                return;
            }

            movies.forEach(movie => {
                // Bỏ qua các phim không cào được link m3u8
                if(!movie.m3u8_url) return; 

                const card = document.createElement('div');
                card.className = 'movie-card';
                card.onclick = () => {
                    playStream(movie.m3u8_url);
                    window.scrollTo({ top: 0, behavior: 'smooth' }); 
                };
                
                // Hiển thị loại Vietsub/Không che nếu có
                const typeHtml = movie.type ? `<div class="movie-type">${movie.type}</div>` : '';

                card.innerHTML = `
                    <img class="movie-thumb" src="${movie.image}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x169?text=No+Image'"/>
                    <div class="movie-info">
                        ${typeHtml}
                        <div class="movie-title" title="${movie.title}">${movie.title}</div>
                        <div class="movie-views">👁️ ${movie.views} lượt xem</div>
                    </div>
                `;
                movieContainer.appendChild(card);
            });
        }

        // Tìm kiếm phim nội bộ
        function filterMovies() {
            const keyword = searchInput.value.toLowerCase();
            const filtered = allMovies.filter(movie => 
                movie.title.toLowerCase().includes(keyword)
            );
            renderMovies(filtered);
        }

        // Phát video qua HLS.js và Plyr
        function playStream(streamUrl) {
            if (!streamUrl) {
                showError("Video này chưa có link m3u8 khả dụng.");
                return;
            }

            errorDiv.style.display = 'none'; 
            welcomeScreen.style.display = 'none';
            document.body.classList.add('video-active'); 
            wakeUpUI(); 
            
            if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
            if (plyrInstance) { plyrInstance.destroy(); plyrInstance = null; }
            
            video.innerHTML = '';

            const playerSettings = { 
                controls: ['play-large', 'rewind', 'play', 'fast-forward', 'progress', 'current-time', 'duration', 'mute', 'settings', 'fullscreen', 'volume'], 
                speed: { selected: 1, options: [0.5, 1, 1.25, 1.5, 2] }, 
                autoplay: true, 
                i18n: { speed: 'Tốc độ', normal: 'Bình thường', quality: 'Chất lượng', qualityLabel: { 0: 'Tự động' } } 
            };

            if (Hls.isSupported()) {
                hlsInstance = new Hls({ autoStartLoad: true});
                hlsInstance.loadSource(streamUrl);
                
                hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => { 
                    plyrInstance = new Plyr(video, playerSettings); 
                    video.play(); 
                });
                
                // Bắt lỗi HLS
                hlsInstance.on(Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        showError("Trình duyệt chặn CORS hoặc link HLS đã hết hạn. Vui lòng cài tiện ích mở rộng Allow CORS.");
                    }
                });

                hlsInstance.attachMedia(video);
                
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                // Cho Safari trên iOS/macOS
                video.src = streamUrl; 
                plyrInstance = new Plyr(video, playerSettings); 
                video.play();
            } else { 
                showError("Trình duyệt không hỗ trợ luồng HLS."); 
            }
        }

        function showError(msg) { errorDiv.innerHTML = `<b>${msg}</b>`; errorDiv.style.display = 'block'; }
    </script>
</body>
</html>

```

### `README.md`

```markdown
# Công cụ tra cứu đơn hàng (10X + SOLOBIZ) — Web app trên Vercel

Web app tra cứu đơn hàng: nhập từng mã (DH… / BIZ…) hoặc upload Excel xử lý hàng loạt.
Backend là serverless function Python trên Vercel.

## Cấu trúc

```
api/_core.py     Logic tra cứu dùng chung (đăng nhập, gọi API, cache token in-memory)
api/_invoice.py  Logic tra cứu hóa đơn điện tử (đăng nhập ASP.NET WebForms, cache cookie in-memory)
api/index.py     Serverless function duy nhất; phân nhánh theo body.action ("lookup"/"excel"/"invoice"/...)
index.html       Giao diện web (các tab: tra cứu / Excel / sao kê / SePay / hóa đơn), gọi POST /api/index
vercel.json      Legacy builds: build api/index.py (@vercel/python) + index.html (static),
                 route /api/* -> api/index.py, còn lại -> index.html
requirements.txt requests, openpyxl
```

> Ghi chú: gộp thành 1 function `api/index.py` và dùng `@vercel/python@4.8.0` (mô hình
> multi-file cũ) vì runtime Python mới (6.x) đổi sang bắt buộc 1 entrypoint và làm hỏng
> việc phục vụ trang tĩnh khi ghim runtime kiểu zero-config.

## Deploy lên Vercel

1. Đẩy repo này lên GitHub.
2. Vào https://vercel.com → **Add New… → Project** → chọn repo.
3. Framework Preset để **Other** (đã có `vercel.json` cấu hình build + route).
4. Mở **Settings → Environment Variables**, thêm:
   - `LOGIN_EMAIL` — email đăng nhập hệ thống (10X/SOLOBIZ)
   - `LOGIN_PASSWORD` — mật khẩu đăng nhập hệ thống (10X/SOLOBIZ)
   - `APP_ACCESS_TOKEN` — mật khẩu bảo vệ truy cập web app (khuyến nghị)
   - `EINVOICE_BASE_URL`, `EINVOICE_USERNAME`, `EINVOICE_PASSWORD` — dùng cho tab
     "Tra cứu hóa đơn" (đăng nhập vào hệ thống hóa đơn điện tử ASP.NET WebForms).
     Tùy chọn thêm `EINVOICE_SERIAL` nếu ký hiệu mẫu hóa đơn khác `C26MSL`.
5. **Deploy**. Xong sẽ có URL dạng `https://<project>.vercel.app`.

> Sau khi thêm/đổi Environment Variables phải **Redeploy** để có hiệu lực.

## Bot Telegram (@sepaycheckbot)

Endpoint webhook: `POST /api/telegram` (`api/telegram.py`), dùng chung logic tra cứu.
Gửi mã đơn (DH… / BIZ…) cho bot → nhận kết quả. Gửi nhiều mã, mỗi mã một dòng.

Env vars cần thêm trên Vercel:
- `TELEGRAM_BOT_TOKEN` — token bot (BotFather)
- `TELEGRAM_WEBHOOK_SECRET` — chuỗi bí mật, phải khớp `secret_token` khi set webhook
- `TELEGRAM_ALLOWED_IDS` — (tùy chọn) danh sách user id được phép, ngăn bằng dấu phẩy;
  để trống = ai cũng dùng được. Gõ `/id` cho bot để lấy ID Telegram của mình.

Set webhook (chạy 1 lần, thay TOKEN và SECRET):

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://sepay-order-lookup.vercel.app/api/telegram","secret_token":"<SECRET>","allowed_updates":["message","edited_message"]}'
```

## Bảo mật

- App có URL công khai → **bắt buộc** nên đặt `APP_ACCESS_TOKEN` để tránh lộ dữ liệu
  đơn hàng/khách hàng. Nếu để trống, ai có link cũng tra cứu được.
- Không hardcode email/mật khẩu trong code — luôn dùng Environment Variables.
- Khuyến nghị đổi mật khẩu hệ thống vì mật khẩu cũ đã từng lộ trong chat/script.
- Mật khẩu tài khoản hóa đơn điện tử (`EINVOICE_PASSWORD`) từng bị dán thẳng dạng
  plaintext trong 1 đoạn script cũ khi trao đổi — coi như đã lộ và **đổi lại ngay**
  trên hệ thống hóa đơn điện tử trước khi đưa app này lên production.

## Chạy thử local

```bash
npm i -g vercel
vercel dev          # tạo file .env từ .env.example trước
```

Hoặc chỉ test logic:

```bash
pip install -r requirements.txt
LOGIN_EMAIL=... LOGIN_PASSWORD=... python -c "from api._core import lookup_order; print(lookup_order('DH18700'))"
```

```

### `requirements.txt`

```text
requests==2.32.3
openpyxl==3.1.5

```

### `vercel.json`

```json
{
  "builds": [
    { "src": "api/index.py", "use": "@vercel/python@4.8.0" },
    { "src": "api/telegram.py", "use": "@vercel/python@4.8.0" },
    { "src": "index.html", "use": "@vercel/static" },
    { "src": "player.html", "use": "@vercel/static" },
    { "src": "ebook.html", "use": "@vercel/static" },
    { "src": "player2.html", "use": "@vercel/static" }
  ],
  "routes": [
    { "src": "/api/telegram", "dest": "/api/telegram.py" },
    { "src": "/api/(.*)", "dest": "/api/index.py" },
    { "src": "/player.html", "dest": "/player.html" },
    { "src": "/jav", "dest": "/player2.html" },
    { "src": "/ebook", "dest": "/ebook.html" },
    { "src": "/(.*)", "dest": "/index.html" }
  ],
  "regions": ["sin1"]
}

```

