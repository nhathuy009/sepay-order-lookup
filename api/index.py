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
    check_access,
    detect_system,
    APP_ACCESS_TOKEN,
    EXCEL_HEADERS,
    EXCEL_FIELDS,
)
from _missav import get_movie_detail, get_category_list
from _subtitle import search_subtitle
from collections import defaultdict
# Thêm dòng này vào cụm import từ file nội bộ
from _payment import search_sepay_transaction
from _payment import search_sepay_transaction, list_sepay_transactions

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
    tat_ca_gia_tri = sorted(list(tat_ca_gia_tri), reverse=True) 

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
        elif action == "search_transaction": # <--- THÊM NHÁNH NÀY
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
        else:
            status, payload = 400, {"error": f"action không hợp lệ: {action}"}       
        self._send(status, payload)
