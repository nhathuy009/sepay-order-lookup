// =============================================================================
// VAAPP PLUGIN — Huangguo Short Drama (v3.0 - AES-IMG-DECODE FULL)
// =============================================================================
// Website : https://huangguoai.com
// Type    : SHORTFILM (phim ngắn dọc)
// Version : 3.0.0
//
// ĐẶC ĐIỂM v3.0:
//   ✅ AES-128-CBC decrypt ảnh thuần JS (không cần CryptoJS)
//   ✅ Key/IV trích từ crypto-worker.js: f5d965df75336270 / 97b60394abc2fbe1
//   ✅ Auto-detect MIME (jpg/png/gif/webp/bmp)
//   ✅ Auto-detect plaintext: raw bytes (Case A) hoặc base64 string (Case B)
//   ✅ Batch fetch song song qua fetchAll() (Native OkHttp Pool)
//   ✅ Cache localStorage tránh decode lại (lần 2 instant)
//   ✅ Fallback placeholder khi decode fail
// =============================================================================

var BASE = "https://huangguoai.com";
var UA_MOBILE = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
var REFERER = BASE + "/";
var ORIGIN  = BASE;

// AES key/IV đã decode từ worker (ASCII 16 bytes)
var HG_AES_KEY = "f5d965df75336270";
var HG_AES_IV  = "97b60394abc2fbe1";

var HG_IMG_CACHE_PREFIX = "hgi_";
var HG_IMG_CACHE_MAX = 300; // giới hạn số ảnh cache để tránh tràn localStorage


// =============================================================================
// 1. MANIFEST
// =============================================================================

function getManifest() {
    return JSON.stringify({
        "id": "huangguo_ai",
        "name": "Huangguo Short Drama",
        "version": "3.0.0",
        "description": "Phim ngắn AI, hoạt hình người lớn, AI hoán đổi khuôn mặt — xem miễn phí",
        "author": "VAAPP Community",
        "baseUrl": BASE,
        "iconUrl": BASE + "/static/web/images/logo-huangguo.png",
        "referrer": REFERER,
        "imageReferer": REFERER,
        "info": "Plugin cho web Huangguo Short Drama. Nội dung người lớn 18+.",
        "isEnabled": true,
        "isAdult": true,
        "type": "SHORTFILM",
        "layoutType": "VERTICAL",
        "playerType": "exoplayer",
        "subtitleCat": false,
        "adblock": true,
        "debug": true
    });
}


// =============================================================================
// 2. HOME SECTIONS
// =============================================================================

function getHomeSections() {
    return JSON.stringify([
        { slug: "recommend",  title: "Tuyển Chọn",     type: "Horizontal", path: "" },
        { slug: "newest",     title: "Mới Cập Nhật",   type: "Horizontal", path: "" },
        { slug: "ai-duanju",  title: "Phim Ngắn AI",   type: "Horizontal", path: "" },
        { slug: "ai-manju",   title: "Hoạt Hình AI",   type: "Horizontal", path: "" }
    ]);
}

function getPrimaryCategories() {
    return JSON.stringify([
        { name: "Phim Ngắn AI",       slug: "ai-duanju" },
        { name: "Hoạt Hình AI",       slug: "ai-manju" },
        { name: "AI Hoán Đổi Mặt",    slug: "ai-huanlian" },
        { name: "AI Chỉnh Sửa",       slug: "ai-mogai" },
        { name: "🔥 BXH Thịnh Hành",  slug: "ranks/hot" },
        { name: "⭐ BXH Đề Xuất",     slug: "ranks/recommend" },
        { name: "🚀 BXH Tiềm Năng",   slug: "ranks/potential" },
        { name: "Chủ Đề Đặc Biệt",    slug: "topics" },
        { name: "Mới Cập Nhật",       slug: "newest" },
        { name: "Tuyển Chọn",         slug: "recommend" }
    ]);
}


// =============================================================================
// 3. URL BUILDERS
// =============================================================================

function getUrlList(slug, filtersJson) {
    var filters = {};
    try { filters = JSON.parse(filtersJson || "{}"); } catch (e) {}
    var page = parseInt(filters.page || 1, 10);
    if (page < 1) page = 1;
    var B = BASE;

    // Author page: /author/{id}/video/{N}/
    if (slug && (slug.indexOf("/author/") === 0 || slug.indexOf("author/") === 0)) {
        var cleanAuthorSlug = slug.replace(/^\/+/, "").replace(/\/+$/, "");
        cleanAuthorSlug = cleanAuthorSlug.replace(/\/(video|post)\/\d+$/, "");
        cleanAuthorSlug = cleanAuthorSlug.replace(/\/(video|post)$/, "");
        var authorMatch = cleanAuthorSlug.match(/^(author\/\d+)/);
        if (authorMatch) {
            var baseAuthorPath = authorMatch[1];
            if (page === 1) return B + "/" + baseAuthorPath + "/video/";
            return B + "/" + baseAuthorPath + "/video/" + page + "/";
        }
    }

    // Tag page: /tag/{slug}/page/{N}/
    if (slug && (slug.indexOf("/tag/") === 0 || slug.indexOf("tag/") === 0)) {
        var cleanTagSlug = slug.replace(/^\/+/, "").replace(/\/+$/, "");
        cleanTagSlug = cleanTagSlug.replace(/\/page\/\d+$/, "");
        var tagMatch = cleanTagSlug.match(/^(tag\/[^\/]+)/);
        if (tagMatch) {
            var baseTagPath = tagMatch[1];
            if (page === 1) return B + "/" + baseTagPath + "/";
            return B + "/" + baseTagPath + "/page/" + page + "/";
        }
    }

    // Topic page: /topics/{slug}/{N}/
    if (slug && (slug.indexOf("/topics/") === 0 || slug.indexOf("topics/") === 0)) {
        var cleanSlug = slug.replace(/^\/+/, "").replace(/\/+$/, "");
        var topicMatch = cleanSlug.match(/^(topics\/[^\/]+)/);
        if (topicMatch) {
            var baseTopicPath = topicMatch[1];
            if (page === 1) return B + "/" + baseTopicPath + "/";
            return B + "/" + baseTopicPath + "/" + page + "/";
        }
    }

    var pathStyleSlugs = {
        "newest":      "/newest",
        "recommend":   "/recommend",
        "ai-duanju":   "/ai-duanju",
        "ai-manju":    "/ai-manju",
        "ai-huanlian": "/ai-huanlian",
        "ai-mogai":    "/ai-mogai"
    };

    if (pathStyleSlugs[slug]) {
        var basePath = pathStyleSlugs[slug];
        if (page === 1) return B + basePath + "/";
        return B + basePath + "/" + page + "/";
    }

    switch (slug) {
        case "ranks/hot":       return B + "/ranks/hot/";
        case "ranks/recommend": return B + "/ranks/recommend/";
        case "ranks/potential": return B + "/ranks/potential/";
        case "topics":          return B + "/topics/";
        default:
            if (slug && slug.charAt(0) === "/") return B + slug;
            return B + "/" + slug + "/";
    }
}

function getUrlSearch(keyword, filtersJson) {
    var filters = {};
    try { filters = JSON.parse(filtersJson || "{}"); } catch (e) {}
    var page = parseInt(filters.page || 1, 10);
    if (page < 1) page = 1;
    var kw = encodeURIComponent(keyword);
    if (page === 1) return BASE + "/search/video/" + kw + "/";
    return BASE + "/search/video/" + kw + "/" + page + "/";
}

function getUrlDetail(slug) {
    if (!slug) return "";
    if (slug.indexOf("http") === 0) return slug;
    if (/^\/author\/\d+\/?$/.test(slug)) {
        return BASE + slug.replace(/\/+$/, "") + "/video/";
    }
    if (slug.indexOf("/video/") === 0) {
        return BASE + slug.replace(/\/+$/, "") + "/";
    }
    if (/^\d+$/.test(slug)) return BASE + "/video/" + slug + "/";
    return BASE + slug;
}


// =============================================================================
// ==================== AES-128-CBC DECRYPT PURE JS ============================
// Port từ crypto-worker.js của huangguoai.com
// Key : "f5d965df75336270" (ASCII → 16 bytes)
// IV  : "97b60394abc2fbe1" (ASCII → 16 bytes)
// Mode: CBC, Padding: NoPadding
// =============================================================================

var AES_SBOX = new Array(256);
var AES_INV_SBOX = new Array(256);

(function buildAesSBox() {
    function xtime(x) { return ((x << 1) ^ (x & 0x80 ? 0x1B : 0)) & 0xFF; }
    function mul(a, b) {
        var r = 0;
        while (b) { if (b & 1) r ^= a; a = xtime(a); b >>>= 1; }
        return r & 0xFF;
    }
    function inv(a) {
        if (a === 0) return 0;
        for (var i = 1; i < 256; i++) if (mul(a, i) === 1) return i;
        return 0;
    }
    function rotl8(x, n) { return ((x << n) | (x >>> (8 - n))) & 0xFF; }
    for (var i = 0; i < 256; i++) {
        var x = inv(i);
        var s = (x ^ rotl8(x, 1) ^ rotl8(x, 2) ^ rotl8(x, 3) ^ rotl8(x, 4) ^ 0x63) & 0xFF;
        AES_SBOX[i] = s;
    }
    AES_SBOX[0] = 0x63;
    for (var j = 0; j < 256; j++) AES_INV_SBOX[AES_SBOX[j]] = j;
})();

function aesXt(y) { return ((y << 1) ^ (y & 0x80 ? 0x1B : 0)) & 0xFF; }
function aesMul(a, b) {
    var r = 0;
    while (b) { if (b & 1) r ^= a; a = aesXt(a); b >>>= 1; }
    return r & 0xFF;
}

function aes128ExpandKey(keyBytes) {
    var RCON = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1B, 0x36];
    var w = new Uint8Array(176);
    for (var i = 0; i < 16; i++) w[i] = keyBytes[i];
    for (var i = 16; i < 176; i += 4) {
        var t0 = w[i - 4], t1 = w[i - 3], t2 = w[i - 2], t3 = w[i - 1];
        if (i % 16 === 0) {
            var tmp = t0;
            t0 = AES_SBOX[t1] ^ RCON[i / 16];
            t1 = AES_SBOX[t2];
            t2 = AES_SBOX[t3];
            t3 = AES_SBOX[tmp];
        }
        w[i]     = w[i - 16]     ^ t0;
        w[i + 1] = w[i - 16 + 1] ^ t1;
        w[i + 2] = w[i - 16 + 2] ^ t2;
        w[i + 3] = w[i - 16 + 3] ^ t3;
    }
    return w;
}

function aes128DecryptBlock(inBuf, inOff, outBuf, outOff, rk) {
    var s0 = inBuf[inOff]      ^ rk[160];
    var s1 = inBuf[inOff + 1]  ^ rk[161];
    var s2 = inBuf[inOff + 2]  ^ rk[162];
    var s3 = inBuf[inOff + 3]  ^ rk[163];
    var s4 = inBuf[inOff + 4]  ^ rk[164];
    var s5 = inBuf[inOff + 5]  ^ rk[165];
    var s6 = inBuf[inOff + 6]  ^ rk[166];
    var s7 = inBuf[inOff + 7]  ^ rk[167];
    var s8 = inBuf[inOff + 8]  ^ rk[168];
    var s9 = inBuf[inOff + 9]  ^ rk[169];
    var s10 = inBuf[inOff + 10] ^ rk[170];
    var s11 = inBuf[inOff + 11] ^ rk[171];
    var s12 = inBuf[inOff + 12] ^ rk[172];
    var s13 = inBuf[inOff + 13] ^ rk[173];
    var s14 = inBuf[inOff + 14] ^ rk[174];
    var s15 = inBuf[inOff + 15] ^ rk[175];

    for (var round = 9; round >= 1; round--) {
        var ri = round * 16;
        var t0  = AES_INV_SBOX[s0]  ^ rk[ri];
        var t1  = AES_INV_SBOX[s13] ^ rk[ri + 1];
        var t2  = AES_INV_SBOX[s10] ^ rk[ri + 2];
        var t3  = AES_INV_SBOX[s7]  ^ rk[ri + 3];
        var t4  = AES_INV_SBOX[s4]  ^ rk[ri + 4];
        var t5  = AES_INV_SBOX[s1]  ^ rk[ri + 5];
        var t6  = AES_INV_SBOX[s14] ^ rk[ri + 6];
        var t7  = AES_INV_SBOX[s11] ^ rk[ri + 7];
        var t8  = AES_INV_SBOX[s8]  ^ rk[ri + 8];
        var t9  = AES_INV_SBOX[s5]  ^ rk[ri + 9];
        var t10 = AES_INV_SBOX[s2]  ^ rk[ri + 10];
        var t11 = AES_INV_SBOX[s15] ^ rk[ri + 11];
        var t12 = AES_INV_SBOX[s12] ^ rk[ri + 12];
        var t13 = AES_INV_SBOX[s9]  ^ rk[ri + 13];
        var t14 = AES_INV_SBOX[s6]  ^ rk[ri + 14];
        var t15 = AES_INV_SBOX[s3]  ^ rk[ri + 15];

        s0 = aesMul(t0, 14) ^ aesMul(t1, 11) ^ aesMul(t2, 13) ^ aesMul(t3, 9);
        s1 = aesMul(t0, 9)  ^ aesMul(t1, 14) ^ aesMul(t2, 11) ^ aesMul(t3, 13);
        s2 = aesMul(t0, 13) ^ aesMul(t1, 9)  ^ aesMul(t2, 14) ^ aesMul(t3, 11);
        s3 = aesMul(t0, 11) ^ aesMul(t1, 13) ^ aesMul(t2, 9)  ^ aesMul(t3, 14);

        s4 = aesMul(t4, 14) ^ aesMul(t5, 11) ^ aesMul(t6, 13) ^ aesMul(t7, 9);
        s5 = aesMul(t4, 9)  ^ aesMul(t5, 14) ^ aesMul(t6, 11) ^ aesMul(t7, 13);
        s6 = aesMul(t4, 13) ^ aesMul(t5, 9)  ^ aesMul(t6, 14) ^ aesMul(t7, 11);
        s7 = aesMul(t4, 11) ^ aesMul(t5, 13) ^ aesMul(t6, 9)  ^ aesMul(t7, 14);

        s8  = aesMul(t8, 14)  ^ aesMul(t9, 11)  ^ aesMul(t10, 13) ^ aesMul(t11, 9);
        s9  = aesMul(t8, 9)   ^ aesMul(t9, 14)  ^ aesMul(t10, 11) ^ aesMul(t11, 13);
        s10 = aesMul(t8, 13)  ^ aesMul(t9, 9)   ^ aesMul(t10, 14) ^ aesMul(t11, 11);
        s11 = aesMul(t8, 11)  ^ aesMul(t9, 13)  ^ aesMul(t10, 9)  ^ aesMul(t11, 14);

        s12 = aesMul(t12, 14) ^ aesMul(t13, 11) ^ aesMul(t14, 13) ^ aesMul(t15, 9);
        s13 = aesMul(t12, 9)  ^ aesMul(t13, 14) ^ aesMul(t14, 11) ^ aesMul(t15, 13);
        s14 = aesMul(t12, 13) ^ aesMul(t13, 9)  ^ aesMul(t14, 14) ^ aesMul(t15, 11);
        s15 = aesMul(t12, 11) ^ aesMul(t13, 13) ^ aesMul(t14, 9)  ^ aesMul(t15, 14);
    }

    outBuf[outOff]      = AES_INV_SBOX[s0]  ^ rk[0];
    outBuf[outOff + 1]  = AES_INV_SBOX[s13] ^ rk[1];
    outBuf[outOff + 2]  = AES_INV_SBOX[s10] ^ rk[2];
    outBuf[outOff + 3]  = AES_INV_SBOX[s7]  ^ rk[3];
    outBuf[outOff + 4]  = AES_INV_SBOX[s4]  ^ rk[4];
    outBuf[outOff + 5]  = AES_INV_SBOX[s1]  ^ rk[5];
    outBuf[outOff + 6]  = AES_INV_SBOX[s14] ^ rk[6];
    outBuf[outOff + 7]  = AES_INV_SBOX[s11] ^ rk[7];
    outBuf[outOff + 8]  = AES_INV_SBOX[s8]  ^ rk[8];
    outBuf[outOff + 9]  = AES_INV_SBOX[s5]  ^ rk[9];
    outBuf[outOff + 10] = AES_INV_SBOX[s2]  ^ rk[10];
    outBuf[outOff + 11] = AES_INV_SBOX[s15] ^ rk[11];
    outBuf[outOff + 12] = AES_INV_SBOX[s12] ^ rk[12];
    outBuf[outOff + 13] = AES_INV_SBOX[s9]  ^ rk[13];
    outBuf[outOff + 14] = AES_INV_SBOX[s6]  ^ rk[14];
    outBuf[outOff + 15] = AES_INV_SBOX[s3]  ^ rk[15];
}

function aes128CbcDecrypt(cipherBytes, keyStr, ivStr) {
    var keyBytes = new Uint8Array(16);
    var ivBytes  = new Uint8Array(16);
    for (var i = 0; i < 16; i++) {
        keyBytes[i] = keyStr.charCodeAt(i) & 0xFF;
        ivBytes[i]  = ivStr.charCodeAt(i)  & 0xFF;
    }
    var rk = aes128ExpandKey(keyBytes);

    var blockCount = Math.floor(cipherBytes.length / 16);
    var plainBytes = new Uint8Array(blockCount * 16);
    var prev = ivBytes;
    var blockIn  = new Uint8Array(16);
    var blockOut = new Uint8Array(16);

    for (var b = 0; b < blockCount; b++) {
        var off = b * 16;
        for (var j = 0; j < 16; j++) blockIn[j] = cipherBytes[off + j];
        aes128DecryptBlock(blockIn, 0, blockOut, 0, rk);
        for (var k = 0; k < 16; k++) plainBytes[off + k] = blockOut[k] ^ prev[k];
        prev = blockIn;
    }
    return plainBytes;
}

// =============================================================================
// Base64 encoder thuần JS
// =============================================================================

function hgBytesToBase64(bytes) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var out = "";
    var i = 0, len = bytes.length;
    while (i < len) {
        var b1 = bytes[i++] & 0xFF;
        var b2 = i < len ? bytes[i++] & 0xFF : NaN;
        var b3 = i < len ? bytes[i++] & 0xFF : NaN;
        out += chars.charAt(b1 >> 2);
        out += chars.charAt(((b1 & 3) << 4) | (isNaN(b2) ? 0 : b2 >> 4));
        out += isNaN(b2) ? "=" : chars.charAt(((b2 & 15) << 2) | (isNaN(b3) ? 0 : b3 >> 6));
        out += isNaN(b3) ? "=" : chars.charAt(b3 & 63);
    }
    return out;
}


// =============================================================================
// detectMimeType — phát hiện MIME từ extension URL
// =============================================================================

function detectMimeType(url) {
    if (!url) return "image/jpeg";
    var cleanUrl = url.split("?")[0].split("|")[0].toLowerCase();
    if (cleanUrl.lastIndexOf(".png") !== -1 && cleanUrl.lastIndexOf(".png") >= cleanUrl.length - 5) return "image/png";
    if (cleanUrl.lastIndexOf(".gif") !== -1 && cleanUrl.lastIndexOf(".gif") >= cleanUrl.length - 5) return "image/gif";
    if (cleanUrl.lastIndexOf(".webp") !== -1 && cleanUrl.lastIndexOf(".webp") >= cleanUrl.length - 6) return "image/webp";
    if (cleanUrl.lastIndexOf(".bmp") !== -1 && cleanUrl.lastIndexOf(".bmp") >= cleanUrl.length - 5) return "image/bmp";
    if (cleanUrl.lastIndexOf(".svg") !== -1 && cleanUrl.lastIndexOf(".svg") >= cleanUrl.length - 5) return "image/svg+xml";
    return "image/jpeg";
}


// =============================================================================
// decodeHuangguoImage — Giải mã 1 ảnh → data URI
// =============================================================================

function decodeHuangguoImage(imgUrl, referer, ua) {
    try {
        // 1. Fetch ciphertext (raw binary string)
        var res = httpRequest(imgUrl, {
            method: "GET",
            headers: {
                "Referer": referer || REFERER,
                "Origin":  referer || ORIGIN,
                "User-Agent": ua || UA_MOBILE
            }
        });
        if (!res || !res.isSuccessful) {
            console.warn("[HG-AES] fetch fail: " + imgUrl.substring(0, 80));
            return "";
        }

        // 2. Convert binary string → bytes
        var len = res.body.length;
        var cipherBytes = new Uint8Array(len);
        for (var i = 0; i < len; i++) cipherBytes[i] = res.body.charCodeAt(i) & 0xFF;

        // 3. AES-128-CBC decrypt (NoPadding)
        var plainBytes = aes128CbcDecrypt(cipherBytes, HG_AES_KEY, HG_AES_IV);

        // 4. Strip trailing 0x00 padding
        var end = plainBytes.length;
        while (end > 0 && plainBytes[end - 1] === 0) end--;
        var clean = plainBytes.subarray(0, end);

        var mimeType = detectMimeType(imgUrl);

        // 5. Auto-detect: raw bytes vs base64 string
        // Case B (worker): plaintext là base64 string, magic "/9j/" (JPEG)
        if (clean[0] === 0x2F && clean[1] === 0x39 && clean[2] === 0x6A) {
            console.log("[HG-AES] Case B (base64 string) len=" + clean.length + " mime=" + mimeType);
            var str = "";
            for (var j = 0; j < clean.length; j++) str += String.fromCharCode(clean[j]);
            return "data:" + mimeType + ";base64," + str;
        }

        // Case B-mở rộng: base64 string của PNG (iVBORw0KGgo) / GIF (R0lGOD)
        if ((clean[0] === 0x69 && clean[1] === 0x56 && clean[2] === 0x42) || // iVB
            (clean[0] === 0x52 && clean[1] === 0x30 && clean[2] === 0x6C)) { // R0l
            console.log("[HG-AES] Case B-ext (base64 PNG/GIF) len=" + clean.length + " mime=" + mimeType);
            var strExt = "";
            for (var k = 0; k < clean.length; k++) strExt += String.fromCharCode(clean[k]);
            return "data:" + mimeType + ";base64," + strExt;
        }

        // Case A: raw JPEG bytes (FF D8 FF)
        if (clean[0] === 0xFF && clean[1] === 0xD8) {
            console.log("[HG-AES] Case A (raw bytes) len=" + clean.length + " mime=" + mimeType);
            return "data:" + mimeType + ";base64," + hgBytesToBase64(clean);
        }

        // Case A-mở rộng: raw PNG (89 50 4E 47) / GIF (47 49 46)
        if ((clean[0] === 0x89 && clean[1] === 0x50) ||
            (clean[0] === 0x47 && clean[1] === 0x49)) {
            console.log("[HG-AES] Case A-ext (raw PNG/GIF) len=" + clean.length + " mime=" + mimeType);
            return "data:" + mimeType + ";base64," + hgBytesToBase64(clean);
        }

        // Fallback: thử base64 trước, không được thì raw
        console.warn("[HG-AES] Unknown magic: " + clean[0] + " " + clean[1] + " " + clean[2]);
        var fallbackStr = "";
        for (var m = 0; m < clean.length; m++) fallbackStr += String.fromCharCode(clean[m]);
        // Nếu chuỗi toàn ký tự ASCII in được → coi là base64
        if (/^[A-Za-z0-9+/=\s]+$/.test(fallbackStr.substring(0, 200))) {
            return "data:" + mimeType + ";base64," + fallbackStr;
        }
        return "data:" + mimeType + ";base64," + hgBytesToBase64(clean);
    } catch (e) {
        console.error("[HG-AES] decode error: " + e.message);
        return "";
    }
}


// =============================================================================
// Cache helpers
// =============================================================================

function hgCacheKey(url) {
    var fname = url.substring(url.lastIndexOf("/") + 1).split("?")[0];
    return HG_IMG_CACHE_PREFIX + fname;
}

function hgCacheGet(url) {
    try {
        var k = hgCacheKey(url);
        var v = localStorage.getItem(k);
        if (v && v.length > 100) return v;
    } catch (e) {}
    return null;
}

function hgCacheSet(url, dataUri) {
    try {
        localStorage.setItem(hgCacheKey(url), dataUri);
    } catch (e) {
        // localStorage đầy → xóa cache cũ
        try {
            var keys = [];
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (k && k.indexOf(HG_IMG_CACHE_PREFIX) === 0) keys.push(k);
            }
            // Xóa 50 cache cũ nhất (xấp xỉ bằng cách xóa nửa đầu)
            var toDelete = Math.floor(keys.length / 2);
            for (var j = 0; j < toDelete; j++) localStorage.removeItem(keys[j]);
            // Thử lưu lại
            localStorage.setItem(hgCacheKey(url), dataUri);
        } catch (e2) {
            console.warn("[HG-AES] cache set fail after cleanup: " + e2.message);
        }
    }
}


// =============================================================================
// decodeImagesBatch — Batch decode song song + cache
// =============================================================================

function decodeImagesBatch(urls, referer, ua) {
    var results = new Array(urls.length);
    var toFetch = [];
    var toFetchIdx = [];

    // 1. Check cache trước
    var cachedCount = 0;
    for (var i = 0; i < urls.length; i++) {
        if (!urls[i]) { results[i] = ""; continue; }
        var cached = hgCacheGet(urls[i]);
        if (cached) {
            results[i] = cached;
            cachedCount++;
            continue;
        }
        toFetch.push(urls[i]);
        toFetchIdx.push(i);
    }

    if (toFetch.length === 0) {
        console.log("[HG-AES] All " + urls.length + " images from cache (0 fetch)");
        return results;
    }

    console.log("[HG-AES] Fetching " + toFetch.length + "/" + urls.length + " images (cached " + cachedCount + ")...");

    // 2. Batch fetch song song qua fetchAll
    var responses;
    try {
        responses = fetchAll(toFetch, {
            headers: {
                "Referer": referer || REFERER,
                "Origin":  referer || ORIGIN,
                "User-Agent": ua || UA_MOBILE
            }
        });
    } catch (e) {
        console.error("[HG-AES] fetchAll fail: " + e.message);
        responses = [];
    }

    // 3. Decode tuần tự (AES không parallel được trong QuickJS)
    var okCount = 0;
    for (var j = 0; j < responses.length; j++) {
        var r = responses[j];
        var idx = toFetchIdx[j];
        if (!r || !r.isSuccessful) { results[idx] = ""; continue; }

        try {
            var len = r.body.length;
            var cipherBytes = new Uint8Array(len);
            for (var k = 0; k < len; k++) cipherBytes[k] = r.body.charCodeAt(k) & 0xFF;

            var plainBytes = aes128CbcDecrypt(cipherBytes, HG_AES_KEY, HG_AES_IV);

            var end = plainBytes.length;
            while (end > 0 && plainBytes[end - 1] === 0) end--;
            var clean = plainBytes.subarray(0, end);

            var mimeType = detectMimeType(toFetch[j]);
            var dataUri = "";

            // Case B: base64 string (JPEG/PNG/GIF)
            if ((clean[0] === 0x2F && clean[1] === 0x39 && clean[2] === 0x6A) ||  // /9j/
                (clean[0] === 0x69 && clean[1] === 0x56 && clean[2] === 0x42) ||  // iVB
                (clean[0] === 0x52 && clean[1] === 0x30 && clean[2] === 0x6C)) {  // R0l
                var str = "";
                for (var s = 0; s < clean.length; s++) str += String.fromCharCode(clean[s]);
                dataUri = "data:" + mimeType + ";base64," + str;
            } else {
                // Case A: raw bytes
                dataUri = "data:" + mimeType + ";base64," + hgBytesToBase64(clean);
            }

            results[idx] = dataUri;
            okCount++;

            // Lưu cache
            hgCacheSet(toFetch[j], dataUri);
        } catch (e) {
            console.error("[HG-AES] decode[" + j + "] fail: " + e.message);
            results[idx] = "";
        }
    }

    console.log("[HG-AES] Decoded " + okCount + "/" + toFetch.length + " images");
    return results;
}


// =============================================================================
// 4. PARSER — LIST / CATEGORY / SEARCH / RANK / TOPIC
// =============================================================================

function parseListResponse(html, apiUrl) {
    console.log("[HG] parseListResponse url=" + apiUrl.substring(0, 80));
    var cleanUrl = apiUrl.split("|")[0].split("?")[0];

    if (/\/ranks\//.test(cleanUrl)) return parseRankList(html, apiUrl);
    if (/\/search\/video\/[^\/]+\//.test(cleanUrl)) return parseSearchResults(html, apiUrl);
    if (/\/author\/\d+\//.test(cleanUrl)) return parseAuthorPage(html, apiUrl);
    if (/\/tag\/[^\/]+\//.test(cleanUrl)) return parseTagPage(html, apiUrl);
    if (/\/topics\/?$/.test(cleanUrl)) return parseTopicsList(html, apiUrl);
    if (/\/topics\/[^\/]+\/?/.test(cleanUrl)) return parseTopicDetail(html, apiUrl);
    return parseDramaGrid(html, apiUrl);
}

function parseSearchResponse(html, apiUrl) {
    var cleanUrl = apiUrl.split("|")[0].split("?")[0];
    if (/\/search\/video\/[^\/]+\//.test(cleanUrl)) return parseSearchResults(html, apiUrl);
    return parseListResponse(html, apiUrl);
}


// ---- 4.1. Extract drama card (metadata only, chưa decode ảnh) ----

function normalizePosterUrl(poster) {
    if (!poster || typeof poster !== "string") return "";
    if (poster.indexOf("cover-placeholder") !== -1) return "";
    if (poster.indexOf("//") === 0) return "https:" + poster;
    if (poster.indexOf("http") !== 0) {
        return BASE + (poster.charAt(0) === "/" ? poster : "/" + poster);
    }
    return poster;
}

function extractDramaCard(cardEl, seen) {
    var $link = cardEl.find(".hg-drama-card__cover-link");
    var href = $link.attr("href") || "";
    if (!href) return null;
    if (seen[href]) return null;
    seen[href] = true;

    var $img = $link.find("img");
    var poster = $img.attr("data-src") || $img.attr("src") || "";
    poster = normalizePosterUrl(poster);

    var title = cardEl.find(".hg-drama-card__title").text().trim();
    if (!title) title = cardEl.find("h3.hg-drama-card__title a").text().trim();
    title = title.replace(/全集在线观看\s*$/, "").trim();

    var desc = cardEl.find(".hg-drama-card__desc").text().trim();

    var episodeRaw = "";
    var $ep = cardEl.find(".hg-drama-card__episode");
    if ($ep.length > 0) {
        var $clone = $ep.clone();
        $clone.find("i").remove();
        episodeRaw = $clone.text().trim();
    }

    var score = cardEl.find(".hg-drama-card__score").text().trim().replace("分", "").trim();

    return {
        id: href,
        title: title,
        posterUrl: "",             // sẽ set sau khi decode
        _rawPoster: poster,        // giữ URL ciphertext để batch decode
        description: desc,
        episode_current: episodeRaw,
        quality: score ? (score + "分") : "",
        year: 0,
        lang: "Vietsub",
        isCategory: false
    };
}

function parseDramaGridByRegex(html, seen) {
    var items = [];
    var reLink = /<a[^>]*class="hg-drama-card__cover-link"[^>]*href="(\/video\/\d+\/)"[^>]*>([\s\S]*?)<\/a>/g;
    var m;
    while ((m = reLink.exec(html)) !== null) {
        var id = m[1];
        if (seen[id]) continue;
        seen[id] = true;

        var inner = m[2];
        var imgMatch = inner.match(/<img[^>]+(?:data-src|src)="([^"]+)"/);
        var poster = imgMatch ? imgMatch[1] : "";
        if (poster.indexOf("cover-placeholder") !== -1) {
            var dsMatch = inner.match(/data-src="([^"]+)"/);
            poster = dsMatch ? dsMatch[1] : "";
        }
        poster = normalizePosterUrl(poster);

        var titleRe = new RegExp('<h3[^>]+class="hg-drama-card__title"[^>]*>\\s*<a[^>]+href="' + id.replace(/\//g, "\\/") + '"[^>]*>([^<]+)', "i");
        var tm = html.match(titleRe);
        var title = tm ? tm[1].trim() : "";

        items.push({
            id: id,
            title: title,
            posterUrl: "",
            _rawPoster: poster,
            isCategory: false
        });
    }
    return items;
}

// ---- Batch decode và gán posterUrl cho items ----

function assignDecodedPosters(rawItems) {
    var rawPosters = [];
    for (var i = 0; i < rawItems.length; i++) {
        rawPosters.push(rawItems[i]._rawPoster || "");
    }
    var decoded = decodeImagesBatch(rawPosters, REFERER, UA_MOBILE);
    var items = [];
    for (var j = 0; j < rawItems.length; j++) {
        var it = rawItems[j];
        delete it._rawPoster;
        it.posterUrl = decoded[j] || it.posterUrl || "";
        items.push(it);
    }
    return items;
}

// ---- 4.2. Parse lưới phim ----

function parseDramaGrid(html, apiUrl) {
    var rawItems = [];
    var seen = {};

    try {
        var $doc = _$(html);
        $doc.find(".hg-drama-card").each(function () {
            var item = extractDramaCard(this, seen);
            if (item) rawItems.push(item);
        });
    } catch (e) {
        console.error("[HG] MiniJQ parse fail: " + e.message);
    }

    if (rawItems.length === 0) rawItems = parseDramaGridByRegex(html, seen);

    var items = assignDecodedPosters(rawItems);

    var currentPage = 1;
    var cleanUrl = apiUrl.split("|")[0].split("?")[0];
    var m = apiUrl.match(/[?&]page=(\d+)/);
    if (m) currentPage = parseInt(m[1], 10);
    else {
        var mPath = cleanUrl.match(/\/(\d+)\/?$/);
        if (mPath) currentPage = parseInt(mPath[1], 10);
    }

    var totalPages = 1;
    try {
        var $p = _$(html).find("[data-hg-pager-jump]");
        if ($p.length > 0) {
            var dp = $p.attr("data-pages");
            if (dp) totalPages = parseInt(dp, 10) || 1;
        }
    } catch (e) {}
    if (totalPages === 1 && items.length >= 20) totalPages = currentPage + 1;

    console.log("[HG] parseDramaGrid → " + items.length + " items, page " + currentPage + "/" + totalPages);
    return JSON.stringify({
        items: items,
        pagination: {
            currentPage: currentPage,
            totalPages: totalPages,
            totalItems: items.length,
            itemsPerPage: 20
        }
    });
}


// ---- 4.3. Parse danh sách chủ đề ----

function parseTopicsList(html, apiUrl) {
    var rawItems = [];
    var seen = {};

    try {
        var $doc = _$(html);
        $doc.find(".hg-topic-card").each(function () {
            var $card = this;
            var href = $card.attr("href") || "";
            if (!href || seen[href]) return;
            seen[href] = true;

            var $img = $card.find("img");
            var poster = $img.attr("data-src") || $img.attr("src") || "";
            poster = normalizePosterUrl(poster);

            rawItems.push({
                id: href,
                title: $card.find(".hg-topic-card__title").text().trim(),
                posterUrl: "",
                _rawPoster: poster,
                description: "",
                episode_current: $card.find(".hg-topic-card__meta").text().trim(),
                quality: "",
                year: 0,
                lang: "",
                isCategory: true,
                type: "folder"
            });
        });
    } catch (e) {
        console.error("[HG] parseTopicsList fail: " + e.message);
    }

    if (rawItems.length === 0) {
        var re = /<a[^>]*class="hg-topic-card"[^>]*href="([^"]+)"[^>]*>[\s\S]*?<img[^>]+(?:data-src|src)="([^"]+)"[\s\S]*?<h3[^>]*class="hg-topic-card__title"[^>]*>([^<]+)<\/h3>/g;
        var m;
        while ((m = re.exec(html)) !== null) {
            var href = m[1];
            if (seen[href]) continue;
            seen[href] = true;
            var poster = normalizePosterUrl(m[2]);
            rawItems.push({
                id: href,
                title: m[3].trim(),
                posterUrl: "",
                _rawPoster: poster,
                isCategory: true,
                type: "folder"
            });
        }
    }

    var items = assignDecodedPosters(rawItems);

    console.log("[HG] parseTopicsList → " + items.length + " folders");
    return JSON.stringify({
        items: items,
        pagination: { currentPage: 1, totalPages: 1 }
    });
}


// ---- 4.4. Parse chi tiết chủ đề ----

function parseTopicDetail(html, apiUrl) {
    var rawItems = [];
    var seen = {};
    try {
        var $doc = _$(html);
        $doc.find(".hg-card-grid .hg-drama-card").each(function () {
            var item = extractDramaCard(this, seen);
            if (item) rawItems.push(item);
        });
        if (rawItems.length === 0) {
            $doc.find(".hg-drama-card").each(function () {
                var item = extractDramaCard(this, seen);
                if (item) rawItems.push(item);
            });
        }
    } catch (e) {
        console.error("[HG] parseTopicDetail fail: " + e.message);
    }
    if (rawItems.length === 0) rawItems = parseDramaGridByRegex(html, seen);

    var items = assignDecodedPosters(rawItems);

    var currentPage = 1;
    var cleanUrl = apiUrl.split("|")[0].split("?")[0];
    var mPage = cleanUrl.match(/\/topics\/[^\/]+\/(\d+)\/?$/);
    if (mPage) currentPage = parseInt(mPage[1], 10);

    var totalPages = 1;
    try {
        var $pager = _$(html).find("[data-hg-pager-jump]");
        if ($pager.length > 0) {
            var dp = $pager.attr("data-pages");
            if (dp) totalPages = parseInt(dp, 10) || 1;
        }
        if (totalPages === 1) {
            var pageCount = _$(html).find(".hg-pager__page").length;
            if (pageCount > 0) totalPages = pageCount;
        }
    } catch (e) {}
    if (totalPages === 1 && items.length >= 20) totalPages = currentPage + 1;

    console.log("[HG] parseTopicDetail → " + items.length + " items, page " + currentPage + "/" + totalPages);
    return JSON.stringify({
        items: items,
        pagination: {
            currentPage: currentPage,
            totalPages: totalPages,
            totalItems: items.length,
            itemsPerPage: 24
        }
    });
}


// ---- 4.5. Parse kết quả tìm kiếm ----

function parseSearchResults(html, apiUrl) {
    var rawItems = [];
    var seen = {};
    try {
        var $doc = _$(html);
        $doc.find(".hg-search-results .hg-card-grid .hg-drama-card").each(function () {
            var item = extractDramaCard(this, seen);
            if (item) rawItems.push(item);
        });
        if (rawItems.length === 0) {
            $doc.find(".hg-drama-card").each(function () {
                var item = extractDramaCard(this, seen);
                if (item) rawItems.push(item);
            });
        }
    } catch (e) {
        console.error("[HG] parseSearchResults fail: " + e.message);
    }
    if (rawItems.length === 0) rawItems = parseDramaGridByRegex(html, seen);

    var items = assignDecodedPosters(rawItems);

    var totalItems = items.length;
    try {
        var $page = _$(html).find(".hg-search-page");
        if ($page.length > 0) {
            var t = $page.attr("data-track-search-total");
            if (t) totalItems = parseInt(t, 10) || items.length;
        }
    } catch (e) {}

    var currentPage = 1;
    var cleanUrl = apiUrl.split("|")[0].split("?")[0];
    var mPage = cleanUrl.match(/\/search\/video\/[^\/]+\/(\d+)\/?$/);
    if (mPage) currentPage = parseInt(mPage[1], 10);

    var totalPages = 1;
    try {
        var $pager = _$(html).find("[data-hg-pager-jump]");
        if ($pager.length > 0) {
            var dp = $pager.attr("data-pages");
            if (dp) totalPages = parseInt(dp, 10) || 1;
        }
    } catch (e) {}

    console.log("[HG] parseSearchResults → " + items.length + " items (total " + totalItems + ")");
    return JSON.stringify({
        items: items,
        pagination: {
            currentPage: currentPage,
            totalPages: totalPages,
            totalItems: totalItems,
            itemsPerPage: items.length || 20
        }
    });
}


// ---- 4.6. Parse bảng xếp hạng ----

function parseRankList(html, apiUrl) {
    var rawItems = [];
    var seen = {};
    try {
        var $doc = _$(html);
        $doc.find(".hg-rank-item").each(function () {
            var $item = this;
            var $link = $item.find(".hg-rank-item__title a").first();
            var href = $link.attr("href") || "";
            if (!href) {
                $link = $item.find(".hg-rank-item__cover");
                href = $link.attr("href") || "";
            }
            if (!href || seen[href]) return;
            seen[href] = true;

            var rankNum = $item.find(".hg-rank-num").text().trim();
            var rank = parseInt(rankNum, 10) || (rawItems.length + 1);

            var $img = $item.find(".hg-rank-item__cover img, .hg-rank-item__main img");
            var poster = normalizePosterUrl($img.attr("data-src") || $img.attr("src") || "");

            var tagsText = $item.find(".hg-rank-item__tags").text();
            var mScore = tagsText.match(/(\d+\.\d+)分/);
            var score = mScore ? mScore[1] : "";

            var heat = $item.find(".hg-rank-item__heat-value").text().trim()
                    || $item.find(".hg-rank-metric-value").text().trim();

            rawItems.push({
                id: href,
                title: $item.find(".hg-rank-item__title").text().trim(),
                posterUrl: "",
                _rawPoster: poster,
                description: $item.find(".hg-rank-item__desc").text().trim(),
                episode_current: heat ? ("Nhiệt " + heat) : "",
                quality: score ? (score + "分") : "",
                year: 0,
                lang: "Vietsub",
                isCategory: false,
                rank: rank
            });
        });
    } catch (e) {
        console.error("[HG] parseRankList fail: " + e.message);
    }

    var items = assignDecodedPosters(rawItems);

    console.log("[HG] parseRankList → " + items.length + " items");
    return JSON.stringify({
        items: items,
        pagination: { currentPage: 1, totalPages: 1, totalItems: items.length, itemsPerPage: 20 }
    });
}


// ---- 4.7. Tag & Author (dùng chung DramaGrid) ----

function parseTagPage(html, apiUrl) {
    var rawItems = [];
    var seen = {};
    try {
        var $doc = _$(html);
        $doc.find(".hg-channel-page .hg-card-grid .hg-drama-card").each(function () {
            var item = extractDramaCard(this, seen);
            if (item) rawItems.push(item);
        });
        if (rawItems.length === 0) {
            $doc.find(".hg-drama-card").each(function () {
                var item = extractDramaCard(this, seen);
                if (item) rawItems.push(item);
            });
        }
    } catch (e) {}
    if (rawItems.length === 0) rawItems = parseDramaGridByRegex(html, seen);

    var items = assignDecodedPosters(rawItems);

    var currentPage = 1;
    var cleanUrl = apiUrl.split("|")[0].split("?")[0];
    var mPage = cleanUrl.match(/\/tag\/[^\/]+\/page\/(\d+)\/?$/);
    if (mPage) currentPage = parseInt(mPage[1], 10);

    var totalPages = 1;
    try {
        var $pager = _$(html).find("[data-hg-pager-jump]");
        if ($pager.length > 0) {
            var dp = $pager.attr("data-pages");
            if (dp) totalPages = parseInt(dp, 10) || 1;
        }
    } catch (e) {}
    if (totalPages === 1) {
        var mLast = html.match(/\/tag\/[^\/]+\/page\/(\d+)\/"[^>]*>\s*末页/);
        if (mLast) totalPages = parseInt(mLast[1], 10) || 1;
    }
    if (totalPages === 1 && items.length >= 20) totalPages = currentPage + 1;

    return JSON.stringify({
        items: items,
        pagination: { currentPage: currentPage, totalPages: totalPages, totalItems: items.length, itemsPerPage: 16 }
    });
}

function parseAuthorPage(html, apiUrl) {
    var rawItems = [];
    var seen = {};
    try {
        var $doc = _$(html);
        $doc.find(".hg-creator-page .hg-card-grid .hg-drama-card").each(function () {
            var item = extractDramaCard(this, seen);
            if (item) rawItems.push(item);
        });
        if (rawItems.length === 0) {
            $doc.find(".hg-drama-card").each(function () {
                var item = extractDramaCard(this, seen);
                if (item) rawItems.push(item);
            });
        }
    } catch (e) {}
    if (rawItems.length === 0) rawItems = parseDramaGridByRegex(html, seen);

    var items = assignDecodedPosters(rawItems);

    var currentPage = 1;
    var cleanUrl = apiUrl.split("|")[0].split("?")[0];
    var mPage = cleanUrl.match(/\/author\/\d+\/video\/(\d+)\/?$/);
    if (mPage) currentPage = parseInt(mPage[1], 10);

    var totalPages = 1;
    try {
        var $pager = _$(html).find("[data-hg-pager-jump]");
        if ($pager.length > 0) {
            var dp = $pager.attr("data-pages");
            if (dp) totalPages = parseInt(dp, 10) || 1;
        }
    } catch (e) {}
    if (totalPages === 1) {
        var mLast = html.match(/\/author\/\d+\/video\/(\d+)\/"[^>]*>\s*末页/);
        if (mLast) totalPages = parseInt(mLast[1], 10) || 1;
    }
    if (totalPages === 1 && items.length >= 20) totalPages = currentPage + 1;

    return JSON.stringify({
        items: items,
        pagination: { currentPage: currentPage, totalPages: totalPages, totalItems: items.length, itemsPerPage: 20 }
    });
}


// =============================================================================
// 5. PARSER — MOVIE DETAIL
// =============================================================================

function parseMovieDetail(html, apiUrl, datasend) {
    console.log("[HG] parseMovieDetail url=" + apiUrl.substring(0, 80));
    var cleanUrl = apiUrl.split("|")[0];

    var vdata = null;
    var mData = html.match(/<script[^>]+id="videoInitialData"[^>]*>([\s\S]*?)<\/script>/);
    if (mData) {
        try { vdata = JSON.parse(mData[1]); } catch (e) {
            console.error("[HG] videoInitialData parse fail: " + e.message);
        }
    }

    var title = "", poster = "", description = "", tags = [], author = "", views = "";
    if (vdata) {
        title = vdata.title || "";
        poster = vdata.coverSrc || vdata.posterSrc || "";
        description = vdata.description || "";
        tags = vdata.tags || [];
        author = vdata.author || "";
        views = vdata.views || "";
    }
    if (!title) {
        var mT = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
        if (mT) title = mT[1].replace(/\s*[-|]\s*黄果短剧.*$/, "").trim();
    }
    if (!poster) {
        var mI = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
        if (mI) poster = mI[1];
    }
    if (!description) {
        var mD = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);
        if (mD) description = mD[1];
    }
    poster = normalizePosterUrl(poster);

    // Decode 1 ảnh poster (dùng batch helper để tận dụng cache)
    var decodedPoster = "";
    if (poster) {
        decodedPoster = hgCacheGet(poster) || decodeHuangguoImage(poster, REFERER, UA_MOBILE) || "";
        if (decodedPoster) hgCacheSet(poster, decodedPoster);
    }

    // Episodes
    var episodes = [];
    var seenSlug = {};
    try {
        var $doc = _$(html);
        $doc.find("a.hg-web-play__ep").each(function () {
            var $a = this;
            var href = $a.attr("href") || "";
            var epId = $a.attr("data-ep-id") || "";
            var epName = $a.text().trim();
            if (!href) return;
            var slug = epId ? ("ep-" + epId) : ("ep-" + (episodes.length + 1));
            if (seenSlug[slug]) return;
            seenSlug[slug] = true;
            episodes.push({
                id: href,
                name: epName || ("Tập " + epId),
                slug: slug,
                datasend: "epId=" + epId
            });
        });
    } catch (e) {
        console.error("[HG] parse episodes fail: " + e.message);
    }

    if (episodes.length === 0 && vdata && vdata.epPlaySrcs) {
        var keys = Object.keys(vdata.epPlaySrcs).sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10); });
        for (var i = 0; i < keys.length; i++) {
            var epNum = keys[i];
            episodes.push({
                id: cleanUrl + (parseInt(epNum, 10) > 1 ? "ep-" + epNum + "/" : ""),
                name: "Tập " + epNum,
                slug: "ep-" + epNum,
                datasend: "epId=" + epNum
            });
        }
    }
    if (episodes.length === 0) {
        episodes.push({ id: cleanUrl, name: "Full", slug: "full", datasend: "epId=1" });
    }

    episodes.sort(function (a, b) {
        var na = parseInt((a.slug.match(/\d+/) || ["0"])[0], 10);
        var nb = parseInt((b.slug.match(/\d+/) || ["0"])[0], 10);
        return na - nb;
    });

    console.log("[HG] parseMovieDetail → " + episodes.length + " episodes");

    return JSON.stringify({
        id: cleanUrl,
        title: title,
        posterUrl: decodedPoster || poster,
        description: description,
        category: tags.join(", "),
        casts: author,
        director: author,
        quality: "",
        year: 0,
        status: views ? ("Lượt xem: " + views) : "",
        servers: [{
            name: "Vietsub",
            episodes: episodes
        }]
    });
}


// =============================================================================
// 6. PARSER — STREAM LINK
// =============================================================================

function parseDetailResponse(html, apiUrl, datasend) {
    console.log("[HG] parseDetailResponse url=" + apiUrl.substring(0, 80) + " datasend=" + (datasend || ""));

    var epId = "";
    if (datasend) {
        var mEp = datasend.match(/epId=(\d+)/);
        if (mEp) epId = mEp[1];
    }
    if (!epId) {
        var mUrl = apiUrl.match(/\/ep-(\d+)\//);
        epId = mUrl ? mUrl[1] : "1";
    }

    var vdata = null;
    var mData = html.match(/<script[^>]+id="videoInitialData"[^>]*>([\s\S]*?)<\/script>/);
    if (mData) {
        try { vdata = JSON.parse(mData[1]); } catch (e) {}
    }

    var streamUrl = "";
    if (vdata) {
        if (vdata.epPlaySrcs && vdata.epPlaySrcs[epId]) streamUrl = vdata.epPlaySrcs[epId];
        if (!streamUrl && vdata.videoSrc) streamUrl = vdata.videoSrc;
        if (!streamUrl && vdata.previewSrc) streamUrl = vdata.previewSrc;
    }
    if (!streamUrl) {
        var mM3u8 = html.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/i);
        if (mM3u8) streamUrl = mM3u8[0];
    }
    if (!streamUrl) {
        console.warn("[HG] No stream for ep=" + epId);
        return JSON.stringify({ url: "", isEmbed: false });
    }

    console.log("[HG] ep=" + epId + " stream=" + streamUrl.substring(0, 80));
    return JSON.stringify({
        url: streamUrl,
        isEmbed: false,
        mimeType: "application/x-mpegURL",
        headers: {
            "Referer": REFERER,
            "User-Agent": UA_MOBILE,
            "Origin": BASE
        }
    });
}


// =============================================================================
// 7. PARSER — EMBED FALLBACK
// =============================================================================

function parseEmbedResponse(html, sourceUrl) {
    var m3u8 = html.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/i);
    if (m3u8) {
        return JSON.stringify({
            url: m3u8[0],
            isEmbed: false,
            mimeType: "application/x-mpegURL",
            headers: { "Referer": REFERER, "User-Agent": UA_MOBILE }
        });
    }
    var mp4 = html.match(/https?:\/\/[^\s"'<>\\]+\.mp4[^\s"'<>\\]*/i);
    if (mp4) {
        return JSON.stringify({
            url: mp4[0],
            isEmbed: false,
            mimeType: "video/mp4",
            headers: { "Referer": REFERER, "User-Agent": UA_MOBILE }
        });
    }
    return JSON.stringify({ url: "", isEmbed: false });
}


// =============================================================================
// 8. PARSER PHỤ
// =============================================================================

function parseCategoriesResponse(html, apiUrl) {
    var items = [];
    var seen = {};
    try {
        var $doc = _$(html);
        $doc.find("a[href^='/tag/']").each(function () {
            var href = this.attr("href") || "";
            var name = this.text().trim();
            if (!href || !name) return;
            if (/\/page\/\d+\/?$/.test(href)) return;
            if (seen[href]) return;
            seen[href] = true;
            items.push({
                slug: href.replace(/^\/+/, "").replace(/\/+$/, ""),
                name: name,
                value: href,
                isCategory: true
            });
        });
    } catch (e) {}
    return JSON.stringify(items);
}

function parseCountriesResponse(html) { return JSON.stringify([]); }
function parseYearsResponse(html) { return JSON.stringify([]); }
function getFilterConfig() { return JSON.stringify({ filters: [] }); }


// =============================================================================
// 9. HELPER
// =============================================================================

function getPipeData(apiUrl) {
    if (!apiUrl) return "";
    var i = apiUrl.indexOf("|");
    if (i < 0) return "";
    var s = apiUrl.substring(i + 1).replace(/^\s+/, "");
    if (s.toLowerCase().indexOf("data:") === 0) s = s.substring(5);
    return s;
}


// =============================================================================
// 10. LOG KHỞI TẠO
// =============================================================================

console.log("[HG] huangguo_plugin v3.0.0 loaded");
console.log("[HG] AES key=" + HG_AES_KEY + " IV=" + HG_AES_IV);
console.log("[HG] BaseUrl=" + BASE);
