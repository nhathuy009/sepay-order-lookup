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
