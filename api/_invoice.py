"""Tra cứu hóa đơn điện tử SePay eInvoice (API v1) - bản serverless cho Vercel.

SePay đã chuyển sang API REST:
  POST /api/v1/auth/login          → JWT Bearer token
  GET  /api/v1/invoices?...        → danh sách / tra cứu theo số HĐ

Token được cache in-memory (module-global) vì filesystem Vercel read-only
và mỗi lần gọi function là stateless.

Thông tin đăng nhập lấy từ Environment Variables — KHÔNG hardcode trong code:
  EINVOICE_BASE_URL  vd: https://0319353578.sepay-einvoice.com
  EINVOICE_USERNAME
  EINVOICE_PASSWORD  (plain text; code sẽ MD5 nếu cần, giống UI web)
  EINVOICE_SERIAL    (tùy chọn) ký hiệu mẫu HĐ, mặc định "C26MSL"
  EINVOICE_ID_PUB    (tùy chọn) idPub trên API list, có thể để trống
"""
import hashlib
import os
import re
import threading
from datetime import datetime
from urllib.parse import urlparse

import requests

REQUEST_TIMEOUT = 15

EINVOICE_BASE_URL = os.environ.get("EINVOICE_BASE_URL", "").rstrip("/")
EINVOICE_USERNAME = os.environ.get("EINVOICE_USERNAME", "")
EINVOICE_PASSWORD = os.environ.get("EINVOICE_PASSWORD", "")
EINVOICE_SERIAL = os.environ.get("EINVOICE_SERIAL", "C26MSL")
EINVOICE_ID_PUB = os.environ.get("EINVOICE_ID_PUB", "").strip()

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


def _host_from_base_url():
    """Lấy hostname từ EINVOICE_BASE_URL (vd: 0319353578.sepay-einvoice.com)."""
    if not EINVOICE_BASE_URL:
        return ""
    parsed = urlparse(EINVOICE_BASE_URL if "://" in EINVOICE_BASE_URL else f"https://{EINVOICE_BASE_URL}")
    return parsed.hostname or ""


def _password_for_login(raw_password):
    """UI web gửi password dạng MD5 hex 32 ký tự.
    Nếu env đã là MD5 (32 hex) thì giữ nguyên; ngược lại hash MD5 plain text.
    """
    pw = (raw_password or "").strip()
    if re.fullmatch(r"[0-9a-fA-F]{32}", pw):
        return pw.lower()
    return hashlib.md5(pw.encode("utf-8")).hexdigest()


def _extract_adjusted_invoice_no(process_note):
    """Trích số hóa đơn GỐC bị điều chỉnh/thay thế từ ghi chú, dạng:
    "Điều chỉnh cho hóa đơn điện tử  Mẫu số 1, ký hiệu C26MSL, số 1071, ngày..."
    "Thay thế cho hóa đơn điện tử  Mẫu số 1, ký hiệu C26MSL, số 1071, ngày..."
    """
    if not process_note:
        return ""
    match = re.search(r"ký hiệu\s+[^,]+,\s*số\s+(\d+)", process_note, re.IGNORECASE)
    return match.group(1) if match else ""


def _extract_adjusted_invoice_date(process_note):
    """Trích ngày phát hành HĐ gốc từ ghi chú.
    Hỗ trợ cả:
      - "ngày 05/06/2026"
      - "ngày 16 tháng 08 năm 2026"
    Trả về "dd/mm/yyyy" hoặc "".
    """
    if not process_note:
        return ""
    match = re.search(r"ngày\s+(\d{1,2}/\d{1,2}/\d{4})", process_note, re.IGNORECASE)
    if match:
        return match.group(1)
    match = re.search(
        r"ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})",
        process_note,
        re.IGNORECASE,
    )
    if match:
        dd, mm, yyyy = match.group(1), match.group(2), match.group(3)
        return f"{int(dd):02d}/{int(mm):02d}/{yyyy}"
    return ""


def _detect_adjustment_type(process_note):
    """Phân loại hóa đơn số tiền âm dựa vào tiền tố ghi chú."""
    if not process_note:
        return ""
    note = process_note.strip()
    if note.lower().startswith("điều chỉnh cho hóa đơn điện tử".lower()):
        return "dieu_chinh"
    if note.lower().startswith("thay thế cho hóa đơn điện tử".lower()):
        return "thay_the"
    return ""


def _dmy_to_api_from(dmy_or_iso):
    """Chuẩn hoá ngày bắt đầu → 'YYYY-MM-DD' cho query API v1."""
    s = (dmy_or_iso or "").strip()
    if not s:
        return "2020-01-01"
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return s
    parts = s.split("/")
    if len(parts) == 3:
        dd, mm, yyyy = parts
        return f"{yyyy}-{mm.zfill(2)}-{dd.zfill(2)}"
    return s


def _dmy_to_api_to(dmy_or_iso):
    """Chuẩn hoá ngày kết thúc → 'YYYY-MM-DDTHH:MM:SS' cho query API v1."""
    s = (dmy_or_iso or "").strip()
    if not s:
        return datetime.now().strftime("%Y-%m-%dT23:59:59")
    if "T" in s:
        return s
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return f"{s}T23:59:59"
    parts = s.split("/")
    if len(parts) == 3:
        dd, mm, yyyy = parts
        return f"{yyyy}-{mm.zfill(2)}-{dd.zfill(2)}T23:59:59"
    return s


class InvoiceClient:
    """Client API v1: login lấy JWT, cache token, gọi /api/v1/invoices."""

    def __init__(self):
        self.token = None
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

        host = _host_from_base_url()
        login_url = EINVOICE_BASE_URL + "/api/v1/auth/login"
        payload = {
            "username": EINVOICE_USERNAME,
            "password": _password_for_login(EINVOICE_PASSWORD),
            "host": host,
        }
        headers = {
            "Content-Type": "application/json",
            "Accept": "*/*",
            "Origin": EINVOICE_BASE_URL,
            "Referer": EINVOICE_BASE_URL + "/login",
        }
        try:
            resp = self.session.post(
                login_url, json=payload, headers=headers, timeout=REQUEST_TIMEOUT
            )
            print(f"[einvoice] POST {login_url} -> {resp.status_code}")
            if resp.status_code != 200:
                self.last_error = (
                    f"Đăng nhập thất bại HTTP {resp.status_code}: {resp.text[:200]}"
                )
                print(f"[einvoice] {self.last_error}")
                return False
            data = resp.json()
            token = data.get("token") or ""
            if not token:
                self.last_error = "Đăng nhập thất bại: response không có token"
                print(f"[einvoice] {self.last_error}. body={data!r}")
                return False
            self.token = token
            self.last_error = ""
            print(f"[einvoice] login OK, userId={data.get('userId')}, comId={data.get('comId')}")
            return True
        except requests.exceptions.RequestException as e:
            self.last_error = f"Lỗi mạng khi đăng nhập: {type(e).__name__}: {e}"
            print(f"[einvoice] {self.last_error}")
            return False
        except ValueError as e:
            self.last_error = f"Lỗi parse JSON login: {e}"
            print(f"[einvoice] {self.last_error}")
            return False

    def _auth_headers(self):
        return {
            "Accept": "*/*",
            "Accept-Language": "vi",
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.token}",
            "Referer": EINVOICE_BASE_URL + "/invoices",
        }

    def _fetch(self, invoice_no, from_date=None, to_date=None):
        """Gọi GET /api/v1/invoices, lọc theo invNo (và khoảng ngày nếu có).

        Trả về: list[dict] | [] | None (lỗi mạng) | UNAUTHORIZED
        """
        url = EINVOICE_BASE_URL + "/api/v1/invoices"
        params = {
            "fromDate": _dmy_to_api_from(from_date) if from_date else "2020-01-01",
            "toDate": _dmy_to_api_to(to_date) if to_date else datetime.now().strftime("%Y-%m-%dT23:59:59"),
            "pattern": "1",
            "serial": EINVOICE_SERIAL,
            "status": "-1",
            "paymentMethod": "-1",
            "pageSizeSelect": "50",
        }
        if EINVOICE_ID_PUB:
            params["idPub"] = EINVOICE_ID_PUB
        if invoice_no:
            params["invNo"] = str(invoice_no).strip()

        try:
            resp = self.session.get(
                url, params=params, headers=self._auth_headers(), timeout=REQUEST_TIMEOUT
            )
        except requests.exceptions.RequestException as e:
            print(f"[einvoice] GET invoices network error: {e}")
            return None

        if resp.status_code in (401, 403):
            return UNAUTHORIZED
        if resp.status_code != 200:
            print(f"[einvoice] GET invoices HTTP {resp.status_code}: {resp.text[:200]}")
            return None

        raw_text = (resp.text or "").strip()
        if not raw_text:
            return []
        try:
            data = resp.json()
        except ValueError:
            print(f"[einvoice] invoices response not JSON: {raw_text[:200]!r}")
            return None

        if isinstance(data, list):
            return data
        # Một số bản API bọc trong object
        if isinstance(data, dict):
            for key in ("data", "items", "invoices", "result"):
                if isinstance(data.get(key), list):
                    return data[key]
        return []

    def _fetch_batch(self, from_date, to_date, invoice_kind="-1"):
        """Lấy danh sách HĐ theo khoảng ngày (không lọc invNo).

        invoice_kind map sang paymentMethod trên API UI:
          "-1" = tất cả
          "2"  = chỉ HĐ gốc (nếu API còn hỗ trợ; UI mới dùng -1)
        """
        url = EINVOICE_BASE_URL + "/api/v1/invoices"
        params = {
            "fromDate": _dmy_to_api_from(from_date),
            "toDate": _dmy_to_api_to(to_date),
            "pattern": "1",
            "serial": EINVOICE_SERIAL,
            "status": "-1",
            "paymentMethod": invoice_kind if invoice_kind else "-1",
            "pageSizeSelect": "0",
        }
        if EINVOICE_ID_PUB:
            params["idPub"] = EINVOICE_ID_PUB

        try:
            resp = self.session.get(
                url, params=params, headers=self._auth_headers(), timeout=REQUEST_TIMEOUT
            )
        except requests.exceptions.RequestException as e:
            print(f"[einvoice] GET invoices batch network error: {e}")
            return None

        if resp.status_code in (401, 403):
            return UNAUTHORIZED
        if resp.status_code != 200:
            print(f"[einvoice] GET invoices batch HTTP {resp.status_code}: {resp.text[:200]}")
            return None

        raw_text = (resp.text or "").strip()
        if not raw_text:
            return []
        try:
            data = resp.json()
        except ValueError:
            return None

        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            for key in ("data", "items", "invoices", "result"):
                if isinstance(data.get(key), list):
                    return data[key]
        return []

    def _parse_invoice(self, inv):
        """Chuẩn hoá 1 bản ghi API v1 (camelCase) → dict FIELD_ORDER."""
        details = empty_details()
        arising = inv.get("arisingDate") or inv.get("ArisingDate") or ""
        # API trả "25/08/2026" — giữ nguyên cho hiển thị
        details["arising_date"] = str(arising)[:10] if arising else ""
        details["pattern_serial"] = (
            inv.get("patternSerial")
            or inv.get("PatternSerial")
            or ""
        )
        details["customer_name"] = inv.get("cusName") or inv.get("CusName") or ""
        details["customer_id"] = (
            inv.get("canCuocCD")
            or inv.get("CMND")
            or inv.get("cusTaxCode")
            or ""
        )
        details["customer_address"] = inv.get("cusAddress") or inv.get("CusAddress") or ""
        # total = tiền hàng (trước thuế), vatAmount = thuế, amount = tổng tiền
        total_val = inv.get("total", inv.get("Total", ""))
        vat_val = inv.get("vatAmount", inv.get("VATAmount", ""))
        amount_val = inv.get("amount", inv.get("Amount", ""))
        details["amount_before_tax"] = total_val if total_val is not None else ""
        details["vat_amount"] = vat_val if vat_val is not None else ""
        details["total_amount"] = amount_val if amount_val is not None else ""
        details["payment_method"] = inv.get("paymentMethod") or inv.get("PaymentMethod") or ""
        details["invoice_type"] = (
            inv.get("loaiHoaDon")
            or inv.get("LoaiHoaDon")
            or "Hóa đơn thông thường"
        )
        details["status_msg"] = "Thành công"
        no_raw = inv.get("no", inv.get("No", ""))
        details["invoice_no"] = str(no_raw).split(".")[0] if no_raw is not None else ""

        # API v1 đưa ghi chú điều chỉnh vào invLinkID (thay ProcessInvNote cũ)
        process_note = (
            inv.get("invLinkID")
            or inv.get("ProcessInvNote")
            or inv.get("extra")
            or ""
        )
        if not isinstance(process_note, str):
            process_note = str(process_note or "")
        details["process_note"] = process_note
        details["adjusts_invoice_no"] = _extract_adjusted_invoice_no(process_note)
        details["adjusts_invoice_date"] = _extract_adjusted_invoice_date(process_note)
        details["adjustment_type"] = _detect_adjustment_type(process_note)
        details["note"] = ""
        return details

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
        inv_no_str = str(invoice_no).strip()
        for inv in data:
            no_str = str(inv.get("no") or inv.get("No") or "").split(".")[0]
            if no_str == inv_no_str:
                target = inv
                break
        if target is None:
            target = data[0]

        return self._parse_invoice(target)

    def fetch_all_invoices(self, from_date, to_date, invoice_kind="2"):
        """Lấy toàn bộ hóa đơn trong khoảng ngày, tự re-login khi session hết hạn.

        from_date, to_date: "dd/MM/yyyy" hoặc "YYYY-MM-DD"
        invoice_kind: "-1" tất cả | "2" chỉ HĐ gốc (map paymentMethod)
        Trả về list[dict] đã chuẩn hoá, [] nếu không có dữ liệu, None nếu lỗi.
        """
        with self._lock:
            if not self.token and not self.login():
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
            if not self.token and not self.login():
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
                d["status_msg"] = self.last_error or "Không thể đăng nhập lại (token hết hạn)"
                return d
        if result == UNAUTHORIZED:
            d = empty_details()
            d["status_msg"] = "Token hết hạn"
            return d
        return result


# Cache client giữa các lần gọi warm invocation.
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
    """Điểm vào chính cho tra cứu hàng loạt theo khoảng ngày.

    from_date, to_date: "dd/MM/yyyy" hoặc "YYYY-MM-DD"
    invoice_kind: "-1" tất cả | "2" chỉ hóa đơn gốc (mặc định)
    Trả về: list[dict] hoặc [] ; None = lỗi kết nối/đăng nhập
    """
    return get_client().fetch_all_invoices(from_date, to_date, invoice_kind)
