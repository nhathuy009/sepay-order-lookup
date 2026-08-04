"""
_customsdeclaration.py — Đọc & phân tích file Excel Tờ khai Hải quan (mẫu
HQ7X_QDTQ) thành cấu trúc JSON có tổ chức. Dùng "xlrd" THUẦN (không qua
pandas) để đọc dữ liệu — nhẹ hơn nhiều so với việc kéo theo cả pandas chỉ
để đọc 1 sheet duy nhất.

Module này chỉ chứa LOGIC PHÂN TÍCH thuần (không đọc/ghi file trên đĩa,
không quyết định HTTP status) — nhận vào bytes của file Excel do người
dùng tải lên (được index.py giải mã từ base64), trả về dict thuần
({"error": "..."} khi lỗi, hoặc dict kết quả đã phân tích khi thành công),
giống các module _invoice.py / _gdt_invoice.py / _invoiceBKAV.py khác.

Logic trích xuất bên dưới bám sát 1:1 theo script phân tích gốc do người
dùng cung cấp (dò dữ liệu theo vị trí cột/nhãn cố định của mẫu tờ khai
HQ7X trên sheet cố định tên "TKX") — chỉ khác ở cách LẤY GIÁ TRỊ 1 Ô
(_cell_value) là gọi thẳng xlrd thay vì qua DataFrame của pandas.

Ghi chú kỹ thuật quan trọng:
- xlrd (từ bản 2.0 trở đi) CHỈ đọc được file .xls (Excel 97-2003, định
  dạng OLE2) - KHÔNG đọc được .xlsx (định dạng zip mới của Excel hiện
  đại). File tờ khai hải quan do hệ thống hải quan xuất ra vốn luôn ở
  định dạng .xls nên không cần hỗ trợ .xlsx ở đây; nếu người dùng lỡ tải
  nhầm file .xlsx, hàm sẽ trả về lỗi rõ ràng thay vì đọc sai dữ liệu.
- Các cột số tiền/số lượng trong file mẫu này thường được LƯU DƯỚI DẠNG
  Ô VĂN BẢN (text) theo định dạng VN (chấm phân cách hàng ngàn, phẩy phân
  cách thập phân) chứ không phải ô số thực sự — _parse_number() xử lý
  đúng theo giả định này, giữ nguyên hành vi của script gốc.
- Cần đảm bảo "xlrd" đã có trong requirements.txt của dự án (khuyến nghị
  ghim phiên bản, ví dụ xlrd==2.0.2).
"""
import math
import re

import xlrd
from xlrd import xldate_as_datetime


def _cell_value(sheet, row_idx, col_idx, datemode):
    """Lấy giá trị 1 ô theo (row, col), 0-based — trả về None nếu ô rỗng
    hoặc nằm ngoài phạm vi cột thực tế của dòng, giữ nguyên kiểu dữ liệu
    gốc (str/int/float/datetime/bool), tương đương cách pandas trả về khi
    đọc qua engine xlrd."""
    if col_idx >= sheet.ncols:
        return None
    cell = sheet.cell(row_idx, col_idx)
    ctype = cell.ctype
    value = cell.value

    if ctype in (xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK):
        return None
    if ctype == xlrd.XL_CELL_TEXT:
        return value if value != "" else None
    if ctype == xlrd.XL_CELL_NUMBER:
        # Số nguyên hiển thị gọn (không có ".0" thừa), giống hành vi
        # mặc định khi pandas đọc 1 ô số nguyên từ Excel.
        return int(value) if value == int(value) else value
    if ctype == xlrd.XL_CELL_DATE:
        try:
            return xldate_as_datetime(value, datemode)
        except Exception:
            return value
    if ctype == xlrd.XL_CELL_BOOLEAN:
        return bool(value)
    if ctype == xlrd.XL_CELL_ERROR:
        return None
    return value


def _parse_number(val):
    """Chuyển đổi chuỗi số định dạng VN (chấm phân cách ngàn, phẩy thập
    phân) thành float/int. Giữ nguyên giá trị gốc nếu không parse được."""
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    s = str(val).strip()
    if not s or s == "-":
        return None
    s = s.replace(".", "").replace(",", ".")
    try:
        if "." in s:
            return float(s)
        return int(s)
    except ValueError:
        return str(val).strip()


def parse_customs_declaration_from_bytes(file_bytes, filename=""):
    """Đọc + phân tích 1 file Excel tờ khai hải quan (.xls, bytes trong bộ
    nhớ) thành dict JSON có cấu trúc, dùng xlrd thuần. Trả về
    {"error": "..."} nếu đọc/phân tích thất bại (sai định dạng, thiếu
    sheet "TKX", v.v.)."""
    try:
        book = xlrd.open_workbook(file_contents=file_bytes)
    except Exception as e:
        return {"error": f"Không đọc được file Excel (chỉ hỗ trợ định dạng .xls): {e}"}

    try:
        sheet = book.sheet_by_name("TKX")
    except Exception:
        return {"error": "Không tìm thấy sheet 'TKX' trong file tờ khai hải quan."}

    datemode = book.datemode

    data = {
        "thong_tin_chung": {},
        "nguoi_xuat_khau": {},
        "nguoi_nhap_khau": {},
        "thong_tin_van_chuyen_luu_kho": {},
        "thong_tin_hoa_don_va_thanh_toan": {},
        "thong_bao_cua_hai_quan": {},
        "danh_sach_hang_hoa": [],
    }

    current_section = None
    current_item = None

    try:
        for row_idx in range(sheet.nrows):
            def val(col_idx, _row=row_idx):
                return _cell_value(sheet, _row, col_idx, datemode)

            col2 = str(val(2)).strip() if val(2) else ""
            col3 = str(val(3)).strip() if val(3) else ""
            col11 = str(val(11)).strip() if val(11) else ""
            col14 = str(val(14)).strip() if val(14) else ""

            # --- 1. NHẬN DIỆN CHUYỂN ĐỔI SECTION CHÍNH ---
            if col2 == "Người xuất khẩu":
                current_section = "NXK"
            elif col2 == "Người nhập khẩu":
                current_section = "NNK"

            # --- 2. TRÍCH XUẤT THÔNG TIN HÀNG HÓA (Động 1-N dòng) ---
            if re.match(r"^<\d{2}>$", col2):
                current_item = {"so_thu_tu": int(col2.strip("<>"))}
                data["danh_sach_hang_hoa"].append(current_item)
                continue

            if current_item is not None:
                if col2 == "Mã số hàng hóa":
                    current_item["ma_so_hang_hoa"] = str(val(5)).strip()
                elif col2 == "Mô tả hàng hóa":
                    current_item["mo_ta_hang_hoa"] = str(val(5)).strip()
                elif col14 == "Số lượng (1)":
                    current_item["so_luong"] = {
                        "gia_tri": _parse_number(val(16)),
                        "don_vi": str(val(24)).strip() if val(24) else None,
                    }
                elif col2 == "Trị giá hóa đơn":
                    current_item["tri_gia_hoa_don"] = {
                        "so_tien": _parse_number(val(5)),
                        "dong_tien": str(val(22)).strip() if val(22) else "USD",
                    }
                    current_item["don_gia_hoa_don"] = {
                        "so_tien": _parse_number(val(17)),
                        "dong_tien": str(val(22)).strip() if val(22) else "USD",
                    }
                elif col3 == "Trị giá tính thuế (S)":
                    current_item["tri_gia_tinh_thue_vnd"] = _parse_number(val(6))
                elif col14 == "Đơn giá tính thuế":
                    current_item["don_gia_tinh_thue_vnd"] = _parse_number(val(17))

            # --- 3. TRÍCH XUẤT THÔNG TIN CHUNG & CÁC SECTION KHÁC ---
            if col2 == "Số tờ khai" and not data["thong_tin_chung"].get("so_to_khai"):
                data["thong_tin_chung"]["so_to_khai"] = str(val(4)).strip()

            elif col2 == "Mã phân loại kiểm tra" and not data["thong_tin_chung"].get("ma_phan_loai_kiem_tra"):
                luong_map = {"1": "1 (Luồng xanh)", "2": "2 (Luồng vàng)", "3": "3 (Luồng đỏ)"}
                data["thong_tin_chung"]["ma_phan_loai_kiem_tra"] = luong_map.get(str(val(5)).strip(), str(val(5)).strip())
                data["thong_tin_chung"]["ma_loai_hinh"] = (
                    str(val(11)).strip() + " (Xuất sản phẩm sản xuất xuất khẩu)"
                    if "E62" in str(val(11))
                    else str(val(11)).strip()
                )
                data["thong_tin_chung"]["ma_so_thue_dai_dien"] = str(val(24)).strip()

            elif col2 == "Tên cơ quan Hải quan tiếp nhận tờ khai" and not data["thong_tin_chung"].get("ten_co_quan_hai_quan_tiep_nhan"):
                data["thong_tin_chung"]["ten_co_quan_hai_quan_tiep_nhan"] = str(val(9)).strip()
                data["thong_tin_chung"]["ma_bo_phan_xu_ly_to_khai"] = str(val(24)).strip()

            elif col2 == "Ngày đăng ký" and not data["thong_tin_chung"].get("ngay_dang_ky"):
                data["thong_tin_chung"]["ngay_dang_ky"] = str(val(5)).strip()

            elif col2 == "Số vận đơn" and not data["thong_tin_van_chuyen_luu_kho"].get("so_van_don"):
                data["thong_tin_van_chuyen_luu_kho"]["so_van_don"] = str(val(7)).strip()
            elif col2 == "Số lượng" and not data["thong_tin_van_chuyen_luu_kho"].get("so_luong_kien"):
                data["thong_tin_van_chuyen_luu_kho"]["so_luong_kien"] = f"{val(7)} {val(12)}".strip()
            elif col2 == "Tổng trọng lượng hàng (Gross)" and not data["thong_tin_van_chuyen_luu_kho"].get("tong_trong_luong_gross"):
                data["thong_tin_van_chuyen_luu_kho"]["tong_trong_luong_gross"] = f"{val(7)} {val(12)}".strip()
            elif col2 == "Địa điểm lưu kho":
                data["thong_tin_van_chuyen_luu_kho"]["dia_diem_luu_kho"] = f"{val(8)} - {val(12)}".strip()
            elif col2 == "Địa điểm nhận hàng cuối cùng":
                data["thong_tin_van_chuyen_luu_kho"]["dia_diem_nhan_hang_cuoi_cung"] = f"{val(8)} - {val(12)}".strip()
            elif col2 == "Địa điểm xếp hàng":
                data["thong_tin_van_chuyen_luu_kho"]["dia_diem_xep_hang"] = f"{val(8)} - {val(12)}".strip()
            elif col2 == "Phương tiện vận chuyển dự kiến":
                data["thong_tin_van_chuyen_luu_kho"]["phuong_tien_van_chuyen_du_kien"] = str(val(12)).strip()
            elif col2 == "Ngày hàng đi dự kiến":
                data["thong_tin_van_chuyen_luu_kho"]["ngay_hang_di_du_kien"] = str(val(8)).strip()

            elif col11 == "Số hóa đơn":
                data["thong_tin_hoa_don_va_thanh_toan"]["so_hoa_don"] = str(val(17)).strip()
            elif col11 == "Ngày phát hành":
                data["thong_tin_hoa_don_va_thanh_toan"]["ngay_phat_hanh"] = str(val(18)).strip()
            elif col11 == "Phương thức thanh toán":
                pt = str(val(18)).strip()
                data["thong_tin_hoa_don_va_thanh_toan"]["phuong_thuc_thanh_toan"] = "KC (Chuyển tiền TT)" if pt == "KC" else pt
            elif col11 == "Tổng trị giá hóa đơn":
                dieu_kien = str(val(16)).split("-")[0].strip() if val(16) else "FOB"
                dong_tien = str(val(16)).split("-")[1].strip() if val(16) and "-" in str(val(16)) else "USD"
                data["thong_tin_hoa_don_va_thanh_toan"]["tong_tri_gia_hoa_don"] = {
                    "dieu_kien_giao_hang": dieu_kien,
                    "dong_tien": dong_tien,
                    "so_tien": _parse_number(val(20)),
                }
            elif col11 == "Tổng trị giá tính thuế":
                data["thong_tin_hoa_don_va_thanh_toan"]["tong_tri_gia_tinh_thue"] = {
                    "dong_tien": str(val(18)).strip(),
                    "so_tien": _parse_number(val(20)),
                }
            elif col11 == "Tỷ giá tính thuế":
                data["thong_tin_hoa_don_va_thanh_toan"]["ty_gia_tinh_thue"] = _parse_number(str(val(18)).replace("-", "").strip())
            elif col2 == "Phần ghi chú":
                data["thong_tin_hoa_don_va_thanh_toan"]["ghi_chu"] = str(val(5)).strip()
            elif col2 == "Số quản lý của nội bộ doanh nghiệp":
                data["thong_tin_hoa_don_va_thanh_toan"]["so_quan_ly_nguoi_su_dung"] = str(val(23)).strip()

            elif col3 == "Tên trưởng đơn vị Hải quan":
                data["thong_bao_cua_hai_quan"]["ten_truong_don_vi_hai_quan"] = str(val(8)).strip()
            elif col3 == "Ngày hoàn thành kiểm tra":
                data["thong_bao_cua_hai_quan"]["ngay_hoan_thanh_kiem_tra"] = str(val(8)).strip()
            elif col3 == "Ngày cấp phép xuất nhập":
                data["thong_bao_cua_hai_quan"]["ngay_cap_phep_xuat_nhap"] = str(val(8)).strip()
            elif col3 == "Thời hạn cho phép vận chuyển bảo thuế (khởi hành)":
                data["thong_bao_cua_hai_quan"]["thoi_han_cho_phep_van_chuyen_bao_thue"] = str(val(12)).strip()
            elif col3 == "Địa điểm đích cho vận chuyển bảo thuế":
                data["thong_bao_cua_hai_quan"]["dia_diem_dich_cho_van_chuyen_bao_thue"] = str(val(10)).strip()

            # Xử lý block Người Xuất/Nhập khẩu
            if current_section == "NXK":
                if col3 == "Mã" and not data["nguoi_xuat_khau"].get("ma_so_thue"):
                    data["nguoi_xuat_khau"]["ma_so_thue"] = str(val(5)).strip()
                elif col3 == "Tên" and not data["nguoi_xuat_khau"].get("ten_cong_ty"):
                    data["nguoi_xuat_khau"]["ten_cong_ty"] = str(val(5)).strip()
                elif col3 == "Địa chỉ" and not data["nguoi_xuat_khau"].get("dia_chi"):
                    data["nguoi_xuat_khau"]["dia_chi"] = str(val(5)).strip()
                elif col3 == "Số điện thoại" and not data["nguoi_xuat_khau"].get("so_dien_thoai"):
                    data["nguoi_xuat_khau"]["so_dien_thoai"] = str(val(5)).strip()
                    current_section = None

            elif current_section == "NNK":
                if col3 == "Tên" and not data["nguoi_nhap_khau"].get("ten_cong_ty"):
                    data["nguoi_nhap_khau"]["ten_cong_ty"] = str(val(5)).strip()
                elif col3 == "Địa chỉ" and not data["nguoi_nhap_khau"].get("dia_chi"):
                    addr = str(val(5)).strip()
                    if val(17):
                        addr += ", " + str(val(17)).strip()
                    data["nguoi_nhap_khau"]["dia_chi"] = addr
                elif col3 == "Mã nước" and not data["nguoi_nhap_khau"].get("ma_nuoc"):
                    nuoc = str(val(5)).strip()
                    data["nguoi_nhap_khau"]["ma_nuoc"] = f"{nuoc} (Malaysia)" if nuoc == "MY" else nuoc
                    current_section = None
                elif isinstance(val(5), str) and "PIC" in val(5):
                    data["nguoi_nhap_khau"]["so_dien_thoai"] = str(val(5)).strip()
    except Exception as e:
        return {"error": f"Lỗi khi phân tích nội dung tờ khai hải quan: {e}"}

    return data
