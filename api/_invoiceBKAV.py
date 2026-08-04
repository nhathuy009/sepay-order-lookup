"""
_invoiceBKAV.py — Tự động hóa tạo hóa đơn trên van.ehoadon.vn (BKAV eHoadon).

Module này chỉ chứa LOGIC NGHIỆP VỤ thuần (gọi HTTP tới eHoadon, parse HTML,
build payload...) và trả về dict thuần ({"error": "..."} khi lỗi, hoặc dict
kết quả khi thành công) — giống các module _core.py / _payment.py /
_invoice.py / _gdt_invoice.py khác. Việc đọc/validate request body và quyết
định HTTP status code (200/400) là việc của index.py (nơi điều hướng API),
không nằm ở đây.

Vercel Functions không có state giữa các lần gọi, nên cookie/VIEWSTATE của
phiên đăng nhập eHoadon được trả về cho caller giữ (dict "cookies"), và phải
truyền lại y nguyên ở lần gọi kế tiếp (login -> tìm KH -> tạo hóa đơn ->
lấy danh sách).
"""
import json
import re
from datetime import datetime

import requests
from bs4 import BeautifulSoup

_EHOADON_LOGIN_URL = "https://van.ehoadon.vn/"
_EHOADON_CREATE_URL = (
    "https://van.ehoadon.vn/InvoiceNewEdit?InvoiceGUID=00000000-0000-0000-0000-000000000000"
    "&IsMTT=false&InvoiceTypeID=1&SourceId=1&TypeCreateInvoice=0"
)
_EHOADON_SUGGEST_URL = "https://van.ehoadon.vn/WebServices/wsInvoice.asmx/GetSuggestion"
_EHOADON_POPUP_URL = "https://van.ehoadon.vn/InvoiceDetailsNewEdit"
_EHOADON_SAVE_URL = "https://van.ehoadon.vn/WebServices/wsInvoice.asmx/SaveInvoice"
_EHOADON_LIST_URL = "https://van.ehoadon.vn/WebServices/wsInvoice.asmx/GG_GetListInvoice"


# ==========================================
# HÀM HỖ TRỢ NỘI BỘ
# ==========================================
def _parse_vn_number(val):
    try:
        return float(str(val).replace('.', '').replace(',', '.'))
    except ValueError:
        return 0.0


def _format_vn_number(val):
    if float(val).is_integer():
        return f"{int(val):,}".replace(',', '.')
    return f"{val:,}".replace(',', 'X').replace('.', ',').replace('X', '.')


def _map_pay_method(raw_method):
    methods = {"CK": "Chuyển khoản", "TM": "Tiền mặt", "TM/CK": "Tiền mặt/Chuyển khoản"}
    return methods.get(raw_method, raw_method)


def _build_session(cookies_dict):
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi,en-US;q=0.9,en;q=0.8",
    })
    if cookies_dict:
        for k, v in cookies_dict.items():
            session.cookies.set(k, v, domain="van.ehoadon.vn")
    return session


def _dump_cookies(session):
    return session.cookies.get_dict()


def _get_hidden(soup, id_name, default=""):
    el = soup.find("input", {"id": id_name})
    return el["value"] if el else default


# ==========================================
# API CÔNG KHAI CỦA MODULE (được index.py gọi)
# ==========================================
def ehoadon_login(username, password):
    """Đăng nhập vào van.ehoadon.vn. Trả về {"cookies": {...}} hoặc {"error": ...}."""
    session = _build_session(None)
    resp_get = session.get(_EHOADON_LOGIN_URL)
    if resp_get.status_code != 200:
        return {"error": f"Không tải được trang đăng nhập eHoadon (HTTP {resp_get.status_code})"}

    soup = BeautifulSoup(resp_get.text, "html.parser")
    try:
        viewstate = soup.find("input", {"id": "__VIEWSTATE"})["value"]
        viewstate_generator = soup.find("input", {"id": "__VIEWSTATEGENERATOR"})["value"]
        event_target_tag = soup.find("input", {"id": "__EVENTTARGET"})
        event_argument_tag = soup.find("input", {"id": "__EVENTARGUMENT"})
        event_target = event_target_tag["value"] if event_target_tag else ""
        event_argument = event_argument_tag["value"] if event_argument_tag else ""
    except TypeError:
        return {"error": "Lỗi cấu trúc trang đăng nhập eHoadon (không tìm thấy VIEWSTATE)."}

    payload = {
        "__VIEWSTATE": viewstate,
        "__VIEWSTATEGENERATOR": viewstate_generator,
        "__EVENTTARGET": event_target,
        "__EVENTARGUMENT": event_argument,
        "__VIEWSTATEENCRYPTED": "",
        "txtUserName": username,
        "txtPassword": password,
        "hdfToken": "",
        "btnLogin": "Đăng nhập",
    }
    post_headers = {"Content-Type": "application/x-www-form-urlencoded", "Referer": _EHOADON_LOGIN_URL}
    resp_post = session.post(_EHOADON_LOGIN_URL, data=payload, headers=post_headers, allow_redirects=True)

    logged_in = (
        "/QLHD" in resp_post.url
        or "Đăng xuất" in resp_post.text
        or username in resp_post.text
    )
    if not logged_in:
        return {"error": "Đăng nhập eHoadon không thành công. Kiểm tra lại tài khoản/mật khẩu."}

    return {"cookies": _dump_cookies(session)}


def ehoadon_buyer_search(cookies, keyword):
    """Tìm khách hàng theo từ khóa. Trả về {"suggestions": [...], "cookies": {...}} hoặc {"error": ...}."""
    session = _build_session(cookies)
    session.get(_EHOADON_CREATE_URL)

    ajax_headers = {
        "Content-Type": "application/json; charset=utf-8",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": _EHOADON_CREATE_URL,
    }
    res = session.post(_EHOADON_SUGGEST_URL, json={"TextSearch": keyword}, headers=ajax_headers)
    if res.status_code != 200:
        return {"error": f"Lỗi HTTP {res.status_code} khi tìm khách hàng"}

    try:
        raw_suggestions = json.loads(res.json()["d"]["Object"])
    except (KeyError, ValueError, TypeError):
        return {"error": "Không đọc được kết quả tìm kiếm khách hàng (có thể phiên đăng nhập đã hết hạn)."}

    valid = []
    for b in raw_suggestions:
        name = (b.get("BuyerName") or "").strip()
        unit_name = (b.get("UnitName") or "").strip()
        if name or unit_name:
            valid.append({
                "BuyerCode": b.get("BuyerCode", ""),
                "BuyerName": b.get("BuyerName", ""),
                "UnitName": b.get("UnitName", ""),
                "TaxCode": b.get("TaxCode", ""),
                "FullAddress": b.get("FullAddress", ""),
                "PayMethodID": b.get("PayMethodID", ""),
                "PayMethodName": _map_pay_method((b.get("PayMethodName") or "").strip()),
                "CCCD": b.get("CCCD", ""),
                "QHNS": b.get("QHNS", ""),
            })

    return {"suggestions": valid, "cookies": _dump_cookies(session)}


def ehoadon_invoice_create(cookies, buyer_info, note_input, items):
    """Tạo và lưu 1 hóa đơn mới với danh sách hàng hóa `items`.
    Trả về {"invoice_guid": ..., "cookies": {...}} hoặc {"error": ...}."""
    buyer_info = buyer_info or {}
    session = _build_session(cookies)
    ajax_headers = {
        "Content-Type": "application/json; charset=utf-8",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": _EHOADON_CREATE_URL,
    }
    session.get(_EHOADON_CREATE_URL)

    current_invoice_guid = "00000000-0000-0000-0000-000000000000"
    current_date = datetime.now().strftime("%Y-%m-%d")

    invoice_header = {
        "InvoiceStatusID": 1,
        "InvoiceTypeID": "1",
        "SourceID": "1",
        "InvoiceTemplateID": "31754",
        "InvoiceForm": "1-C23TYY",
        "InvoiceSerial": "C26TYY",
        "InvoiceDate": current_date,
        "InvoiceNo": 0,
        "BuyerCode": buyer_info.get("BuyerCode", ""),
        "BuyerName": buyer_info.get("BuyerName", ""),
        "BuyerTaxcode": buyer_info.get("TaxCode", ""),
        "BuyerUnitName": buyer_info.get("UnitName", ""),
        "BuyerAddress": buyer_info.get("FullAddress", ""),
        "PayMethodID": str(buyer_info.get("PayMethodID", "3")),
        "BuyerBankAccount": "",
        "ReceiveTypeID": "1",
        "ReceiverEmail": "",
        "ReceiverMobile": "",
        "ReceiverName": "",
        "ReceiverAddress": "",
        "Note": note_input,
        "CurrencyID": "VND",
        "CurrencyCode": "VND",
        "ExchangeRate": 1,
        "TaxRateHeaderID": "1",
        "TaxRateHeader": 0,
        "IsCheckMST": False,
        "IsBTH": False,
        "CCCD": buyer_info.get("CCCD", ""),
        "PassportNumber": "",
        "FiscalCodes": buyer_info.get("QHNS", ""),
        "UIDefine": "\"\"",
        "Reason": None,
        "IsFinanceLease": False,
        "BusinessLocationCode": None,
    }

    for index, item in enumerate(items):
        item_unit = item.get("unit") or "Bộ"
        item_qty = item.get("qty") or "100"
        item_price = item.get("price") or "237.150"
        try:
            calc_amt = _parse_vn_number(item_qty) * _parse_vn_number(item_price)
            default_amount = _format_vn_number(calc_amt)
        except Exception:
            default_amount = "0"
        item_amount = item.get("amount") or default_amount

        invoice_header["InvoiceGUID"] = current_invoice_guid
        invoice_header["OriginalInvoiceGUID"] = current_invoice_guid

        popup_payload = {
            "Invoice": invoice_header,
            "InvoiceDetailID": 0,
            "ItemTypeID": 0,
            "TypeCreateInvoice": 0,
            "InvoiceOrgWithOutSystem": None,
        }
        res_popup = session.post(_EHOADON_POPUP_URL, json=popup_payload, headers=ajax_headers)
        if res_popup.status_code != 200:
            return {"error": f"Lỗi tải popup chi tiết (mặt hàng {index + 1})"}

        popup_soup = BeautifulSoup(res_popup.text, "html.parser")
        item_form_data = {
            "__EVENTTARGET": _get_hidden(popup_soup, "__EVENTTARGET"),
            "__EVENTARGUMENT": _get_hidden(popup_soup, "__EVENTARGUMENT"),
            "__VIEWSTATE": _get_hidden(popup_soup, "__VIEWSTATE"),
            "__VIEWSTATEGENERATOR": _get_hidden(popup_soup, "__VIEWSTATEGENERATOR"),
            "__VIEWSTATEENCRYPTED": _get_hidden(popup_soup, "__VIEWSTATEENCRYPTED"),
            "ctl00$MasterPlaceHolderBlank$hfItemCode": "",
            "ctl00$MasterPlaceHolderBlank$hfPreItemCode": "",
            "ctl00$MasterPlaceHolderBlank$hfPreItemName": "",
            "ctl00$MasterPlaceHolderBlank$txtItemName": item.get("name", ""),
            "ctl00$MasterPlaceHolderBlank$txtUnitName": item_unit,
            "ctl00$MasterPlaceHolderBlank$txtQty": item_qty,
            "ctl00$MasterPlaceHolderBlank$txtPrice": item_price,
            "ctl00$MasterPlaceHolderBlank$txtAmount": item_amount,
            "ctl00$MasterPlaceHolderBlank$ddlTaxRate": "1",
            "ctl00$MasterPlaceHolderBlank$txtTaxRate": "0",
            "ctl00$MasterPlaceHolderBlank$txtTaxAmount": "0",
            "ctl00$MasterPlaceHolderBlank$btnAdd": "Ghi lại",
            "ctl00$MasterPlaceHolderBlank$hdfInvoiceDetailID": "0",
            "ctl00$MasterPlaceHolderBlank$hdfIsChange": "False",
            "ctl00$MasterPlaceHolderBlank$hdfOriginalInvoiceGUID": current_invoice_guid,
            "ctl00$MasterPlaceHolderBlank$hdfItemTypeID": "0",
            "ctl00$MasterPlaceHolderBlank$hdfCurrencyID": "VND",
            "ctl00$MasterPlaceHolderBlank$hdfInvoiceTypeID": "1",
            "ctl00$MasterPlaceHolderBlank$hdfInvoiceStatusID": "1",
            "ctl00$MasterPlaceHolderBlank$hdfHasAfterTax": "false",
            "ctl00$MasterPlaceHolderBlank$hdfQuyetDinhSo": _get_hidden(popup_soup, "hdfQuyetDinhSo", "204/2025/QH15"),
        }
        form_headers = {"Content-Type": "application/x-www-form-urlencoded", "Referer": _EHOADON_CREATE_URL}
        res_save_item = session.post(_EHOADON_POPUP_URL, data=item_form_data, headers=form_headers)

        if index == 0:
            match = re.search(r"ClosePopDetail\('([a-fA-F0-9\-]{36})'", res_save_item.text)
            if match:
                current_invoice_guid = match.group(1)
            else:
                return {"error": "Không trích xuất được InvoiceGUID ở mặt hàng đầu tiên (có thể phiên đăng nhập đã hết hạn)."}

    invoice_header["InvoiceGUID"] = current_invoice_guid
    res_final = session.post(
        _EHOADON_SAVE_URL,
        json={"invoice": invoice_header, "typeCreateInvoice": "0", "listBillID": ""},
        headers=ajax_headers,
    )
    if res_final.status_code != 200:
        return {"error": f"Mã lỗi HTTP: {res_final.status_code}"}

    result_data = res_final.json()
    if not result_data.get("d", {}).get("isOk", False):
        return {"error": f"Hệ thống eHoadon từ chối lưu: {result_data.get('d', {}).get('Code')}"}

    return {
        "invoice_guid": current_invoice_guid,
        "cookies": _dump_cookies(session),
    }


def ehoadon_invoice_list(cookies, from_date, to_date):
    """Lấy danh sách hóa đơn trong khoảng ngày [from_date, to_date] (định dạng YYYY-MM-DD).
    Trả về {"invoices": [...], "cookies": {...}} hoặc {"error": ...}."""
    session = _build_session(cookies)
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": "https://van.ehoadon.vn/QLHD",
    }
    payload = {
        "invoiceSearch": {
            "InvoiceTypeID": "1",
            "InvoiceTemplateID": "0",
            "InvoiceForm": "Tất cả",
            "InvoiceNo": "",
            "BuyerName": "",
            "UserIDSearch": "0",
            "InvoiceStatusID": 0,
            "InvoiceSerial": "0",
            "FromDate": from_date,
            "ToDate": to_date,
            "BuyerTaxcode": "",
            "FromCreateDate": "2017-01-01",
            "ToCreateDate": "2027-09-03",
            "Note": "",
            "TextSearch": "",
            "CateID": "0",
            "SearchOption": "2",
            "PageGUID": "36d21371-4752-4d02-84fc-999647f62966",
            "SortType": "-1",
            "IsMTT": False,
        },
        "PageSize": 100,
        "CurrentPage": 1,
        "SortCol": "",
    }
    res = session.post(_EHOADON_LIST_URL, json=payload, headers=headers)
    if res.status_code != 200:
        return {"error": f"Lỗi truy vấn danh sách hóa đơn. Mã HTTP: {res.status_code}"}

    data = res.json()
    html_content = data.get("d", {}).get("Object", {}).get("Html", "")
    soup = BeautifulSoup(html_content, "html.parser")
    tbody = soup.find("tbody")
    rows = tbody.find_all("tr") if tbody else []

    invoices = []
    for row in rows:
        cols = row.find_all("td")
        if len(cols) > 6:
            inv_no_elem = cols[2].find("span", class_="InvoiceNo")
            inv_no = inv_no_elem.text.strip() if inv_no_elem else "[Chưa có]"
            buyer_elem = cols[3].find("span", class_="BuyerName")
            buyer = buyer_elem.text.strip() if buyer_elem else "Khách lẻ"
            amount_elem = cols[6].find("span", class_="SumPaymentAmount")
            amount = amount_elem.text.strip() if amount_elem else "0"
            invoices.append({"invoice_no": inv_no, "buyer": buyer, "amount": amount})

    return {"invoices": invoices, "cookies": _dump_cookies(session)}
