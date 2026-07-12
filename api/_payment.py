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
    
    while True:
        params["page"] = current_page
        resp = session.get(url, headers=headers, params=params)
        
        # Xử lý khi bị giới hạn lượt gọi (Rate Limit)
        if resp.status_code == 429:
            retry_after = resp.headers.get("x-sepay-userapi-retry-after", 1)
            time.sleep(float(retry_after))
            continue
            
        if resp.status_code != 200:
            return {"error": f"Lỗi từ SePay (HTTP {resp.status_code}): {resp.text}"}
            
        data = resp.json()
        if data.get("status") != "success":
            return {"error": "Dữ liệu trả về từ SePay không hợp lệ."}
            
        page_data = data.get("data", [])
        
        # Nếu trang hiện tại không có dữ liệu (mảng rỗng) -> Đã lấy hết toàn bộ
        if not page_data:
            break
            
        # Nối dữ liệu của trang này vào mảng tổng
        all_transactions.extend(page_data)
        
        # Tăng số trang lên để chuẩn bị gọi trang tiếp theo
        current_page += 1
        
    return {"transactions": all_transactions}
