import re
import requests
from _subtitle import search_subtitle

BASE_URL = "https://missav.media"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://missav.media/",
}

def normalize_html(html):
    """
    Chuẩn hóa HTML giống cơ chế của plugin JS (PluginUtils.normalizeHtml).
    Gỡ bỏ các prefix (như missav_media-) mà MissAV chèn vào class CSS để chống bóc tách.
    """
    if not html:
        return ""
    
    def repl(match):
        class_val = match.group(1)
        # Xóa prefix missav_media- y hệt JS Plugin
        class_val = class_val.replace('missav_media-', '')
        
        # Mở rộng an toàn: Quét xóa mọi prefix ngẫu nhiên dính với các class key của trang
        class_val = re.sub(r'[a-zA-Z0-9_]+-(thumbnail)', r'\1', class_val)
        class_val = re.sub(r'[a-zA-Z0-9_]+-(group)', r'\1', class_val)
        class_val = re.sub(r'[a-zA-Z0-9_]+-(text-nord13)', r'\1', class_val)
        
        return f'class="{class_val}"'
        
    # Tìm và xử lý tất cả các nội dung nằm trong class="..."
    return re.sub(r'class="([^"]*)"', repl, html)

def clean_text(text):
    if not text:
        return ""
    text = re.sub(r'<[^>]*>', '', text)
    replacements = {"&amp;": "&", "&quot;": '"', "&#039;": "'", "&lt;": "<", "&gt;": ">"}
    for k, v in replacements.items():
        text = text.replace(k, v)
    return " ".join(text.split()).strip()

def get_category_list(slug):
    """Lấy danh sách phim theo slug danh mục"""
    url = f"{BASE_URL}/{slug}"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200: return []
        
        # BƯỚC QUAN TRỌNG: Làm sạch HTML trước khi cắt chuỗi
        html = normalize_html(resp.text)
        
        parts = html.split('thumbnail group')
        if len(parts) <= 1:
            parts = html.split('class="thumbnail')
            
        results = []
        for part in parts[1:]:
            link_match = re.search(r'<a[^>]+href="[^"]*/vi/([^"/\ ?]+)"', part)
            if not link_match: continue
            code_str = link_match.group(1)
            
            # Ưu tiên lấy tiêu đề phim nằm trong thuộc tính alt của ảnh
            title_match = re.search(r'<img[^>]+(?:alt|title)="([^"]+)"', part, re.IGNORECASE)
            title = clean_text(title_match.group(1)) if title_match else code_str.upper()
            
            results.append({
                "code": code_str.upper(),
                "title": title
            })
            
            # Lấy 15 phim mỗi dòng để đủ hiển thị cuộn trên web
            if len(results) >= 15: break 
        return results
    except Exception as e:
        return []

def search_missav(keyword):
    """Tìm kiếm danh sách phim theo từ khóa"""
    url = f"{BASE_URL}/vi/search/{requests.utils.quote(keyword)}"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return []
            
        # BƯỚC QUAN TRỌNG: Làm sạch HTML trước khi cắt chuỗi
        html = normalize_html(resp.text)
        
        parts = html.split('thumbnail group')
        if len(parts) <= 1:
            parts = html.split('class="thumbnail')
            
        results = []
        for part in parts[1:]:
            link_match = re.search(r'<a[^>]+href="[^"]*/vi/([^"/\ ?]+)"', part)
            if not link_match: continue
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
        
        uuid = None
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
            
        title_match = re.search(r'property="og:title"\s+content="([^"]+)"', html, re.IGNORECASE)
        title = clean_text(title_match.group(1)) if title_match else code_clean.upper()
        detail["subtitle_url"] = search_subtitle(code_clean.upper())       
        return {
            "title": title,
            "stream_url": f"https://surrit.mrstcdn.store/{uuid}/playlist.m3u8",
            "code": code_clean.upper()
        }
    except Exception:
        return None
