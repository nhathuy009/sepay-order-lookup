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
        
def list_sepay_transactions(date_from, date_to):
    """
    Lấy danh sách giao dịch nạp tiền (in) trong khoảng thời gian.
    Giới hạn tối đa 100 giao dịch mới nhất (theo API v2).
    """
    api_token = os.environ.get("SEPAY_API_TOKEN")
    if not api_token:
        return {"error": "Chưa cấu hình biến môi trường SEPAY_API_TOKEN trên Vercel."}
    
    url = "https://userapi.sepay.vn/v2/transactions"
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json"
    }
    
    # Tham số bám sát tài liệu API
    params = {
        "transaction_date_from": date_from,
        "transaction_date_to": date_to,
        "transfer_type": "in",      # Chỉ lấy tiền vào
        "page": 1,
        "per_page": 100,            # Lấy tối đa 100 dòng
        "transaction_date_sort": "desc" # Mới nhất xếp trên
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
            
        # Trả về danh sách giao dịch
        return {"transactions": data.get("data", [])}
