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
