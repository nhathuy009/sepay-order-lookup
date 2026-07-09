import re
import requests
import urllib.parse

def search_subtitle(code_str):
    """
    Tìm kiếm phụ đề trên SubtitleCat theo mã phim.
    Chỉ trả về đường dẫn nếu có duy nhất 1 kết quả, các trường hợp khác trả về 'chưa có phụ đề'.
    """
    # Mã hóa chuỗi tìm kiếm (VD: chứa khoảng trắng)
    encoded_code = urllib.parse.quote(code_str)
    url = f"https://www.subtitlecat.com/index.php?search={encoded_code}"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    
    try:
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code != 200:
            return "chưa có phụ đề"
            
        html = resp.text
        
        # Bước 1: Trích xuất phần thân bảng (<tbody>...</tbody>) chứa danh sách kết quả
        tbody_match = re.search(r'<tbody>(.*?)</tbody>', html, re.DOTALL | re.IGNORECASE)
        if not tbody_match:
            return "chưa có phụ đề"
            
        tbody_html = tbody_match.group(1)
        
        # Bước 2: Quét toàn bộ các đường link <a href="..."> nằm bên trong <td>
        # Dựa trên HTML mẫu: <td><a href="subs/1536/PRED-874...">
        links = re.findall(r'<td[^>]*>\s*<a[^>]+href="([^"]+)"', tbody_html, re.IGNORECASE)
        
        # Bước 3: Kiểm tra điều kiện "chỉ lấy nếu là kết quả duy nhất"
        if len(links) == 1:
            sub_link = links[0]
            
            # Xử lý ghép thành link tuyệt đối nếu SubtitleCat trả về link tương đối
            if not sub_link.startswith("http"):
                if sub_link.startswith("/"):
                    sub_link = "https://www.subtitlecat.com" + sub_link
                else:
                    sub_link = "https://www.subtitlecat.com/" + sub_link
                    
            return sub_link
        else:
            # Nếu có 0 kết quả hoặc nhiều hơn 1 kết quả
            return "chưa có phụ đề"
            
    except Exception as e:
        # Bắt mọi lỗi mạng, timeout...
        return "chưa có phụ đề"

# Bạn có thể test nhanh bằng cách chạy trực tiếp file này
if __name__ == "__main__":
    # Test case 1 kết quả
    print(search_subtitle("PRED-874"))
