"""Serverless function duy nhất cho toàn bộ API."""
import base64
import io
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

import openpyxl

sys.path.append(os.path.dirname(__file__))
from _core import (  # noqa: E402
    lookup_order,
    check_access,
    detect_system,
    APP_ACCESS_TOKEN,
    EXCEL_HEADERS,
    EXCEL_FIELDS,
)
from _missav import get_movie_detail, get_category_list

def handle_movie(body):
    code = (body.get("code") or "").strip()
    if not code:
        return 400, {"error": "Thiếu mã phim"}
    detail = get_movie_detail(code)
    if not detail:
        return 404, {"error": "Không tìm thấy phim hoặc mã không hợp lệ"}
    return 200, detail

def handle_category(body):
    slug = (body.get("slug") or "").strip()
    if not slug:
        return 400, {"error": "Thiếu slug danh mục"}
    movies = get_category_list(slug)
    return 200, {"movies": movies}

def handle_lookup(body):
    code = (body.get("code") or "").strip()
    if not code:
        return 400, {"error": "Thiếu mã đơn hàng"}
    return 200, lookup_order(code)

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

class handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
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
        
        # Đã tích hợp luồng lấy danh sách Category
        if action == "movie":
            status, payload = handle_movie(body)
        elif action == "category":
            status, payload = handle_category(body)
        elif action == "excel":
            status, payload = handle_excel(body)
        elif action == "lookup":
            status, payload = handle_lookup(body)
        else:
            status, payload = 400, {"error": f"action không hợp lệ: {action}"}
            
        self._send(status, payload)
