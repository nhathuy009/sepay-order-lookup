import re
import requests

BASE_URL = "https://missav.media"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://missav123.com/",
}

def clean_text(text):
    if not text:
        return ""
    # Xóa các thẻ HTML
    text = re.sub(r'<[^>]*>', '', text)
    # Giải mã thực thể HTML cơ bản
    replacements = {"&amp;": "&", "&quot;": '"', "&#039;": "'", "&lt;": "<", "&gt;": ">"}
    for k, v in replacements.items():
        text = text.replace(k, v)
    return " ".join(text.split()).strip()

def search_missav(keyword):
    """Tìm kiếm danh sách phim theo từ khóa"""
    url = f"{BASE_URL}/vi/search/{requests.utils.quote(keyword)}"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return []
        html = resp.text
        
        # Cắt chuỗi theo cụm class tương tự như mã nguồn JS plugin
        parts = html.split('thumbnail group')
        if len(parts) <= 1:
            parts = html.split('class="thumbnail')
            
        results = []
        for part in parts[1:]:
            link_match = re.search(r'<a[^>]+href="[^"]*/vi/([^"/\ ?]+)"', part)
            if not link_match:
                continue
            code_str = link_match.group(1)
            
            code_match = re.search(r'class="[^"]*text-nord13[^"]*"[^>]*>([\s\S]*?)<\/a>', part)
            code = clean_text(code_match.group(1)) if code_match else code_str
            
            title_match = re.search(r'<img[^>]+(?:alt|title)="([^"]+)"', part, re.IGNORECASE)
            title = clean_text(title_match.group(1)) if title_match else code
            
            results.append({
                "slug": f"vi/{code_str}",
                "code": code.upper(),
                "title": title
            })
        return results
    except Exception:
        return []

def get_movie_detail(slug_or_code):
    """Lấy chi tiết phim và bóc tách UUID Stream URL bằng Deep Scan"""
    code_clean = slug_or_code.replace("vi/", "").strip().lower()
    url = f"{BASE_URL}/vi/{code_clean}"
    
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return None
        html = resp.text
        
        # Chiến lược 1: Quét trực tiếp domain chứa UUID
        uuid = None
        domain_match = re.search(r'(?:surrit|sixyik|nineyu|fourhoi)\.com/([0-9a-f-]{36})', html, re.IGNORECASE)
        if domain_match:
            uuid = domain_match.group(1)
            
        # Chiến lược 2: Deep Scan UUID (Fallback nếu không khớp domain)
        if not uuid:
            uuid_matches = re.findall(r'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', html, re.IGNORECASE)
            blacklist = ["snaptrckr", "user_uuid", "popunder", "banner", "monitoring", "crypto", "randomuuid", "generateuuid"]
            for u in uuid_matches:
                idx = html.find(u)
                if idx != -1:
                    context = html[max(0, idx - 80):min(len(html), idx + 80)].lower()
                    if any(b in context for b in blacklist):
                        continue
                uuid = u
                break
                
        if not uuid:
            return None
            
        # Trích xuất tiêu đề og:title
        title_match = re.search(r'property="og:title"\s+content="([^"]+)"', html, re.IGNORECASE)
        title = clean_text(title_match.group(1)) if title_match else code_clean.upper()
        
        return {
            "title": title,
            "stream_url": f"https://surrit.mrstcdn.store/{uuid}/playlist.m3u8",
            "code": code_clean.upper()
        }
    except Exception:
        return None
