// =============================================================================
// VAAPP PLUGIN — Huangguo Short Drama
// =============================================================================
// Website : https://huangguoai.com
// Type    : SHORTFILM (phim ngắn dọc — vuốt TikTok chuyển tập)
// Version : 1.8.0 VI (Fix search-suggest leak — loại trừ card ngoài section)
// Author  : VAAPP Community
// =============================================================================

var BASE = "https://huangguoai.com";
var UA_MOBILE = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
var REFERER = BASE + "/";
var REFERER_ENCODED = encodeURIComponent(REFERER);

// ⭐ Server trung gian cho ảnh (Cloudflare Worker)
var IMG_PROXY = "https://huangguoai.alokillgtv02.workers.dev/?url=";
var USE_IMG_PROXY = true; // đổi thành false để tắt proxy ảnh


// =============================================================================
// HELPER: Bọc ảnh qua server trung gian
// =============================================================================

function proxyImageUrl(url) {
    if (!url || typeof url !== "string") return url || "";
    if (!USE_IMG_PROXY) return url;
    if (url.indexOf("http") !== 0) return url;
    if (url.indexOf("workers.dev/?url=") !== -1) return url;
    if (url.indexOf("cover-placeholder") !== -1) return "";
    return IMG_PROXY + encodeURIComponent(url);
}

function fixImageUrl(url) {
    if (!url || typeof url !== "string") return url || "";
    var proxied = proxyImageUrl(url);
    if (!proxied) return "";
    if (proxied.indexOf("workers.dev/?url=") !== -1) return proxied;
    if (proxied.indexOf("http") !== 0) return proxied;
    if (proxied.indexOf("|") !== -1) return proxied;
    return proxied + "|Referer=" + REFERER_ENCODED;
}


// =============================================================================
// HELPER: HTML utilities
// =============================================================================

function stripTags(s) {
    return String(s || "").replace(/<[^>]*>/g, "").trim();
}

function decodeHtml(s) {
    return String(s || "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/\\u0026/g, "&");
}

// ⭐ Trích videoId (số) từ một URL bất kỳ dạng /video/{id}/...
function extractVideoId(url) {
    if (!url) return "";
    var m = String(url).match(/\/video\/(\d+)/);
    return m ? m[1] : "";
}

// ⭐ Build URL chuẩn cho 1 tập — LUÔN dạng /video/{vid}/ep-{n}/
// Tập 1 cũng dùng /ep-1/ thay vì /video/{vid}/ để tránh CDN cache trang gốc.
function buildEpisodeUrl(videoId, epNum) {
    var n = parseInt(epNum, 10) || 1;
    return BASE + "/video/" + videoId + "/ep-" + n + "/";
}


// =============================================================================
// ⭐ v1.8.0 — HELPER: Lọc card không thuộc section chính
// Loại trừ card nằm trong search-suggest (dropdown tìm kiếm ở header) và
// trong SSP slot (quảng cáo). Tránh parse nhầm phim từ "猜你喜欢" của header.
// =============================================================================

function isValidCard($el) {
    if (!$el) return false;
    try {
        // Loại trừ search-suggest (khối "猜你喜欢" trong dropdown tìm kiếm)
        if ($el.closest(".hg-search-suggest").length > 0) return false;
        if ($el.closest(".hg-search-suggest__guess").length > 0) return false;
        if ($el.closest("#hg-search-suggest").length > 0) return false;
        // Loại trừ SSP slot (quảng cáo)
        if ($el.closest("[data-ssp-slot-key]").length > 0) return false;
        if ($el.closest(".hg-ssp-slot").length > 0) return false;
        // Loại trừ hero carousel (banner trang chủ)
        if ($el.closest("[data-hero-carousel]").length > 0) return false;
        return true;
    } catch (e) {
        // Nếu MiniJQ không hỗ trợ closest → mặc định cho qua
        return true;
    }
}

// ⭐ v1.8.0 — Cắt vùng HTML không cần thiết trước khi parse regex
// (dùng cho các hàm fallback regex để tránh lấy nhầm card từ search-suggest)
function stripNonContentBlocks(html) {
    if (!html) return "";
    var s = html;
    // Cắt search-suggest dropdown (thường nằm trong <form ... data-search-form>)
    s = s.replace(/<div[^>]*class="[^"]*hg-search-suggest[^"]*"[\s\S]*?<\/form>/gi, "");
    // Cắt SSP slot quảng cáo
    s = s.replace(/<aside[^>]*class="[^"]*hg-ssp-slot[^"]*"[\s\S]*?<\/aside>/gi, "");
    return s;
}


// =============================================================================
// 1. MANIFEST
// =============================================================================

function getManifest() {
    return JSON.stringify({
        "id": "huangguo_ai",
        "name": "Huangguo Short Drama",
        "version": "1.8.0",
        "description": "Phim ngắn AI, phim hoạt hình người lớn, AI hoán đổi khuôn mặt, AI chỉnh sửa — xem miễn phí",
        "author": "VAAPP Community",
        "baseUrl": BASE,
        "iconUrl": IMG_PROXY + encodeURIComponent(BASE + "/static/web/images/logo-huangguo.png"),
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


// =============================================================================
// 3. PRIMARY CATEGORIES
// =============================================================================

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
// 4. URL BUILDERS
// =============================================================================

function getUrlList(slug, filtersJson) {
    var filters = {};
    try { filters = JSON.parse(filtersJson || "{}"); } catch (e) {}
    var page = parseInt(filters.page || 1, 10);
    if (page < 1) page = 1;
    var B = BASE;

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
        if (page === 1) return B + basePath;
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

function getUrlDetail(slug, datasend) {
    if (!slug) return "";
    if (slug.indexOf("http") === 0) return slug;

    if (/^\/video\/\d+\/ep-\d+\/?$/.test(slug)) {
        return BASE + slug.replace(/\/+$/, "") + "/";
    }
    if (/^\/video\/\d+\/?$/.test(slug)) {
        return BASE + slug.replace(/\/+$/, "") + "/";
    }
    if (/^\/author\/\d+\/?$/.test(slug)) {
        var cleanA = slug.replace(/\/+$/, "");
        return BASE + cleanA + "/video/";
    }
    if (slug.indexOf("/video/") === 0) {
        var cleanV = slug.replace(/\/+$/, "");
        return BASE + cleanV + "/";
    }
    if (/^\d+$/.test(slug)) return BASE + "/video/" + slug + "/";
    return BASE + slug;
}


// =============================================================================
// 5. PARSER — LIST / CATEGORY / SEARCH / RANK / TOPIC / TAG / AUTHOR
// =============================================================================

function parseListResponse(html, apiUrl) {
    console.log("[HG] parseListResponse url=" + apiUrl);
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
    if (/\/search\/video\/[^\/]+\//.test(cleanUrl)) {
        return parseSearchResults(html, apiUrl);
    }
    return parseListResponse(html, apiUrl);
}


// ---- 5.1. Parse lưới phim ----
// ⭐ v1.8.0: áp dụng isValidCard() để loại trừ search-suggest / SSP / hero

function parseDramaGrid(html, apiUrl) {
    var items = [];
    var seen = {};

    try {
        var $doc = _$(html);
        $doc.find(".hg-drama-card").each(function () {
            // ⭐ v1.8.0 — loại trừ card ngoài section chính
            if (!isValidCard(this)) return;
            var item = extractDramaCard(this, seen);
            if (item) items.push(item);
        });
    } catch (e) {
        console.error("[HG] MiniJQ parse fail: " + e.message);
    }

    if (items.length === 0) {
        items = parseDramaGridByRegex(html, seen);
    }

    var currentPage = 1;
    var cleanUrl = apiUrl.split("|")[0].split("?")[0];
    var m = apiUrl.match(/[?&]page=(\d+)/);
    if (m) {
        currentPage = parseInt(m[1], 10);
    } else {
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

    console.log("[HG] parseDramaGrid → " + items.length + " items, page "
        + currentPage + "/" + totalPages);

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

function extractDramaCard(cardEl, seen) {
    var $link = cardEl.find(".hg-drama-card__cover-link");
    var href = $link.attr("href") || "";
    if (!href) return null;

    var id = href;
    if (seen[id]) return null;
    seen[id] = true;

    var $img = $link.find("img");
    var poster = $img.attr("data-src") || $img.attr("src") || "";
    if (poster.indexOf("cover-placeholder") !== -1) {
        poster = $img.attr("data-src") || "";
    }
    if (poster.indexOf("cover-placeholder") !== -1) poster = "";

    poster = fixImageUrl(poster);

    var title = cardEl.find(".hg-drama-card__title").text().trim();
    if (!title) {
        title = cardEl.find("h3.hg-drama-card__title a").text().trim();
    }
    title = title.replace(/全集在线观看\s*$/, "").trim();

    var desc = cardEl.find(".hg-drama-card__desc").text().trim();

    var episodeRaw = "";
    var $ep = cardEl.find(".hg-drama-card__episode");
    if ($ep.length > 0) {
        var $clone = $ep.clone();
        $clone.find("i").remove();
        episodeRaw = $clone.text().trim();
    }

    // ⭐ v1.8.1 — Trích nhãn thời gian cập nhật từ <i class="hg-ep-time__at">
    // Ví dụ: "14小时前", "1天前", "3小时前"
    var langValue = "Vietsub";
    var $timeAt = cardEl.find("i.hg-ep-time__at");
    if ($timeAt.length > 0) {
        var timeText = $timeAt.text().trim();
        if (timeText) {
            langValue = timeText;
        }
    }

    var score = cardEl.find(".hg-drama-card__score").text().trim()
                       .replace("分", "").trim();

    return {
        id: id,
        title: title,
        posterUrl: poster,
        description: desc,
        episode_current: episodeRaw,
        quality: score ? (score + "分") : "",
        year: 0,
        lang: langValue,          // ⭐ "14小时前" hoặc "Vietsub"
        isCategory: false
    };
}

// ⭐ v1.8.0 — Regex fallback: strip search-suggest trước khi split
function parseDramaGridByRegex(html, seen) {
    var items = [];

    var cleaned = stripNonContentBlocks(html);

    var parts = cleaned.split(/<div\s+class="hg-drama-card"/);
    for (var i = 1; i < parts.length; i++) {
        var block = parts[i];

        var nextCard = block.indexOf('<div class="hg-drama-card"');
        if (nextCard > 0) block = block.substring(0, nextCard);

        var mHref = block.match(
            /<a[^>]*class="hg-drama-card__cover-link"[^>]*href="(\/video\/\d+\/)"/
        );
        if (!mHref) continue;
        var id = mHref[1];
        if (seen[id]) continue;
        seen[id] = true;

        var mImg = block.match(/<img[^>]+data-src="([^"]+)"/) ||
                   block.match(/<img[^>]+src="([^"]+)"/);
        var poster = mImg ? mImg[1] : "";
        if (poster.indexOf("cover-placeholder") !== -1) {
            var mDs = block.match(/data-src="([^"]+)"/);
            poster = mDs ? mDs[1] : "";
        }
        if (poster.indexOf("cover-placeholder") !== -1) poster = "";

        poster = fixImageUrl(poster);

        var title = "";
        var mTitle = block.match(
            /<h3[^>]*class="[^"]*hg-drama-card__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/
        );
        if (!mTitle) {
            mTitle = block.match(
                /<div[^>]*class="[^"]*hg-drama-card__title[^"]*"[^>]*>([\s\S]*?)<\/div>/
            );
        }
        if (mTitle) {
            title = mTitle[1]
                .replace(/<span[^>]*class="sr-only"[^>]*>[\s\S]*?<\/span>/g, "")
                .replace(/<[^>]*>/g, "")
                .trim();
        }

        if (!title) {
            var mAlt = block.match(/<img[^>]+alt="([^"]+)"/);
            if (mAlt) title = decodeHtml(mAlt[1]).trim();
        }

        title = title.replace(/全集在线观看\s*$/, "").trim();
        title = title.replace(/Xem toàn bộ trực tuyến\.?\s*$/i, "").trim();

        if (!title) continue;

        // ⭐ v1.8.1 — Trích nhãn thời gian cập nhật từ <i class="hg-ep-time__at">
        var langValue = "Vietsub";
        var mTimeAt = block.match(/<i[^>]*class="[^"]*hg-ep-time__at[^"]*"[^>]*>([^<]*)<\/i>/);
        if (mTimeAt) {
            var timeText = decodeHtml(mTimeAt[1]).trim();
            if (timeText) langValue = timeText;
        }

        items.push({
            id: id,
            title: title,
            posterUrl: poster,
            lang: langValue,       // ⭐ "14小时前" hoặc "Vietsub"
            isCategory: false
        });
    }
    return items;
}


// ---- 5.2. Parse danh sách chủ đề ----
// ⭐ v1.8.0: loại trừ topic card trong search-suggest (nếu có)

function parseTopicsList(html, apiUrl) {
    var items = [];
    var seen = {};

    try {
        var $doc = _$(html);
        $doc.find(".hg-topic-card").each(function () {
            // ⭐ loại trừ topic card nằm trong search-suggest / SSP
            if (!isValidCard(this)) return;

            var $card = this;
            var href = $card.attr("href") || "";
            if (!href) return;
            if (seen[href]) return;
            seen[href] = true;

            var $img = $card.find("img");
            var poster = $img.attr("data-src") || $img.attr("src") || "";
            if (poster.indexOf("cover-placeholder") !== -1) poster = "";

            poster = fixImageUrl(poster);

            var title = $card.find(".hg-topic-card__title").text().trim();
            var meta  = $card.find(".hg-topic-card__meta").text().trim();

            items.push({
                id: href,
                title: title,
                posterUrl: poster,
                description: "",
                episode_current: meta,
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

    if (items.length === 0) {
        var cleaned = stripNonContentBlocks(html);
        var re = /<a[^>]*class="hg-topic-card"[^>]*href="([^"]+)"[^>]*>[\s\S]*?<img[^>]+(?:data-src|src)="([^"]+)"[\s\S]*?<h3[^>]*class="hg-topic-card__title"[^>]*>([^<]+)<\/h3>/g;
        var m;
        while ((m = re.exec(cleaned)) !== null) {
            var href = m[1];
            if (seen[href]) continue;
            seen[href] = true;
            var poster = m[2];
            if (poster.indexOf("cover-placeholder") !== -1) poster = "";
            poster = fixImageUrl(poster);
            items.push({
                id: href,
                title: m[3].trim(),
                posterUrl: poster,
                isCategory: true,
                type: "folder"
            });
        }
    }

    console.log("[HG] parseTopicsList → " + items.length + " folders");

    return JSON.stringify({
        items: items,
        pagination: { currentPage: 1, totalPages: 1 }
    });
}


// ---- 5.3. Parse chi tiết chủ đề ----
// ⭐ v1.8.0: áp dụng isValidCard

function parseTopicDetail(html, apiUrl) {
    console.log("[HG] parseTopicDetail url=" + apiUrl);

    var items = [];
    var seen = {};

    try {
        var $doc = _$(html);
        $doc.find(".hg-card-grid .hg-drama-card").each(function () {
            if (!isValidCard(this)) return;
            var item = extractDramaCard(this, seen);
            if (item) items.push(item);
        });
        if (items.length === 0) {
            $doc.find(".hg-drama-card").each(function () {
                if (!isValidCard(this)) return;
                var item = extractDramaCard(this, seen);
                if (item) items.push(item);
            });
        }
    } catch (e) {
        console.error("[HG] parseTopicDetail fail: " + e.message);
    }

    if (items.length === 0) {
        items = parseDramaGridByRegex(html, seen);
    }

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

    console.log("[HG] parseTopicDetail → " + items.length
        + " items, page " + currentPage + "/" + totalPages);

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


// ---- 5.4. Parse kết quả tìm kiếm ----
// ⭐ v1.8.0: áp dụng isValidCard

function parseSearchResults(html, apiUrl) {
    console.log("[HG] parseSearchResults url=" + apiUrl);

    var items = [];
    var seen = {};

    try {
        var $doc = _$(html);
        $doc.find(".hg-search-results .hg-card-grid .hg-drama-card").each(function () {
            if (!isValidCard(this)) return;
            var item = extractDramaCard(this, seen);
            if (item) items.push(item);
        });
        if (items.length === 0) {
            $doc.find(".hg-drama-card").each(function () {
                if (!isValidCard(this)) return;
                var item = extractDramaCard(this, seen);
                if (item) items.push(item);
            });
        }
    } catch (e) {
        console.error("[HG] parseSearchResults fail: " + e.message);
    }

    if (items.length === 0) {
        items = parseDramaGridByRegex(html, seen);
    }

    var totalItems = items.length;
    try {
        var $page = _$(html).find(".hg-search-page");
        if ($page.length > 0) {
            var t = $page.attr("data-track-search-total");
            if (t) totalItems = parseInt(t, 10) || items.length;
        }
    } catch (e) {}
    if (totalItems === items.length) {
        var mTotal = html.match(/共\s*<strong>(\d+)<\/strong>\s*个结果/);
        if (mTotal) totalItems = parseInt(mTotal[1], 10) || items.length;
    }

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
    if (totalPages === 1 && totalItems > items.length) {
        totalPages = Math.ceil(totalItems / Math.max(items.length, 1));
        if (totalPages < 1) totalPages = 1;
    }

    console.log("[HG] parseSearchResults → " + items.length + " items (total "
        + totalItems + "), page " + currentPage + "/" + totalPages);

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


// ---- 5.5. Parse bảng xếp hạng ----
// ⭐ v1.8.0: áp dụng isValidCard

function parseRankList(html, apiUrl) {
    console.log("[HG] parseRankList url=" + apiUrl);

    var items = [];
    var seen = {};

    try {
        var $doc = _$(html);
        $doc.find(".hg-rank-item").each(function () {
            if (!isValidCard(this)) return;
            var $item = this;

            var $link = $item.find(".hg-rank-item__title a").first();
            var href = $link.attr("href") || "";
            if (!href) {
                $link = $item.find(".hg-rank-item__cover");
                href = $link.attr("href") || "";
            }
            if (!href) return;
            if (seen[href]) return;
            seen[href] = true;

            var rankNum = $item.find(".hg-rank-num").text().trim();
            var rank = parseInt(rankNum, 10) || (items.length + 1);

            var $img = $item.find(".hg-rank-item__cover img, .hg-rank-item__main img");
            var poster = $img.attr("data-src") || $img.attr("src") || "";
            if (poster.indexOf("cover-placeholder") !== -1) poster = "";

            poster = fixImageUrl(poster);

            var title = $item.find(".hg-rank-item__title").text().trim();
            var desc = $item.find(".hg-rank-item__desc").text().trim();

            var tagsText = $item.find(".hg-rank-item__tags").text();
            var mScore = tagsText.match(/(\d+\.\d+)分/);
            var score = mScore ? mScore[1] : "";

            var heat = $item.find(".hg-rank-item__heat-value").text().trim()
                    || $item.find(".hg-rank-metric-value").text().trim();

            items.push({
                id: href,
                title: title,
                posterUrl: poster,
                description: desc,
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

    if (items.length === 0) items = parseRankFromJsonLd(html, seen);
    if (items.length === 0) items = parseRankByRegex(html, seen);

    console.log("[HG] parseRankList → " + items.length + " items");

    return JSON.stringify({
        items: items,
        pagination: {
            currentPage: 1,
            totalPages: 1,
            totalItems: items.length,
            itemsPerPage: 20
        }
    });
}

function parseRankFromJsonLd(html, seen) {
    var items = [];
    var reScript = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
    var mScript;

    while ((mScript = reScript.exec(html)) !== null) {
        var data;
        try { data = JSON.parse(mScript[1]); } catch (e) { continue; }

        var graph = data["@graph"] || [data];
        for (var g = 0; g < graph.length; g++) {
            var node = graph[g];
            if (node["@type"] !== "ItemList") continue;
            if (!node.itemListElement) continue;

            var list = node.itemListElement;
            for (var i = 0; i < list.length; i++) {
                var el = list[i];
                if (el["@type"] !== "ListItem") continue;

                var url = el.url || "";
                if (!url) continue;
                if (seen[url]) continue;
                seen[url] = true;

                items.push({
                    id: url.replace(BASE, ""),
                    title: el.name || "",
                    posterUrl: "",
                    description: "",
                    episode_current: "",
                    quality: "",
                    year: 0,
                    lang: "Vietsub",
                    isCategory: false,
                    rank: parseInt(el.position, 10) || (items.length + 1)
                });
            }
        }
    }

    if (items.length > 0) {
        try {
            var $doc = _$(html);
            for (var k = 0; k < items.length; k++) {
                var item = items[k];
                if (item.posterUrl) continue;
                var $img = $doc.find("a[href='" + item.id + "'] img").first();
                if ($img.length > 0) {
                    if (!isValidCard($img)) continue;
                    var poster = $img.attr("data-src") || $img.attr("src") || "";
                    if (poster.indexOf("cover-placeholder") === -1) {
                        item.posterUrl = fixImageUrl(poster);
                    }
                }
            }
        } catch (e) {}
    }

    return items;
}

function parseRankByRegex(html, seen) {
    var items = [];
    var cleaned = stripNonContentBlocks(html);
    var parts = cleaned.split('data-rank-item');
    for (var i = 1; i < parts.length; i++) {
        var chunk = parts[i].substring(0, 3000);

        var mHref = chunk.match(/href="(\/video\/\d+\/)"/);
        if (!mHref) continue;
        var href = mHref[1];
        if (seen[href]) continue;
        seen[href] = true;

        var mPoster = chunk.match(/data-src="([^"]+)"/);
        var poster = mPoster ? mPoster[1] : "";
        poster = fixImageUrl(poster);

        var mTitle = chunk.match(/class="hg-rank-item__title"[^>]*>\s*<a[^>]*>([^<]+)/);
        var title = mTitle ? mTitle[1].trim() : "";

        var mRank = chunk.match(/class="hg-rank-num[^"]*">(\d+)</);
        var rank = mRank ? parseInt(mRank[1], 10) : (items.length + 1);

        items.push({
            id: href,
            title: title,
            posterUrl: poster,
            description: "",
            episode_current: "",
            quality: "",
            year: 0,
            lang: "Vietsub",
            isCategory: false,
            rank: rank
        });
    }
    return items;
}


// ---- 5.6. Parse trang thể loại (tag) ----
// ⭐ v1.8.0: áp dụng isValidCard

function parseTagPage(html, apiUrl) {
    console.log("[HG] parseTagPage url=" + apiUrl);

    var items = [];
    var seen = {};

    try {
        var $doc = _$(html);
        $doc.find(".hg-channel-page .hg-card-grid .hg-drama-card").each(function () {
            if (!isValidCard(this)) return;
            var item = extractDramaCard(this, seen);
            if (item) items.push(item);
        });
        if (items.length === 0) {
            $doc.find(".hg-drama-card").each(function () {
                if (!isValidCard(this)) return;
                var item = extractDramaCard(this, seen);
                if (item) items.push(item);
            });
        }
    } catch (e) {
        console.error("[HG] parseTagPage fail: " + e.message);
    }

    if (items.length === 0) {
        items = parseDramaGridByRegex(html, seen);
    }

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

    console.log("[HG] parseTagPage → " + items.length + " items, page "
        + currentPage + "/" + totalPages);

    return JSON.stringify({
        items: items,
        pagination: {
            currentPage: currentPage,
            totalPages: totalPages,
            totalItems: items.length,
            itemsPerPage: 16
        }
    });
}


// ---- 5.7. Parse trang tác giả ----
// ⭐ v1.8.0: áp dụng isValidCard

function parseAuthorPage(html, apiUrl) {
    console.log("[HG] parseAuthorPage url=" + apiUrl);

    var items = [];
    var seen = {};

    try {
        var $doc = _$(html);
        $doc.find(".hg-creator-page .hg-card-grid .hg-drama-card").each(function () {
            if (!isValidCard(this)) return;
            var item = extractDramaCard(this, seen);
            if (item) items.push(item);
        });
        if (items.length === 0) {
            $doc.find(".hg-drama-card").each(function () {
                if (!isValidCard(this)) return;
                var item = extractDramaCard(this, seen);
                if (item) items.push(item);
            });
        }
    } catch (e) {
        console.error("[HG] parseAuthorPage fail: " + e.message);
    }

    if (items.length === 0) {
        items = parseDramaGridByRegex(html, seen);
    }

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

    console.log("[HG] parseAuthorPage → " + items.length + " items, page "
        + currentPage + "/" + totalPages);

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


// =============================================================================
// 5.8. HELPER — PARSE videoInitialData JSON
// =============================================================================

function parseVideoInitialData(html) {
    if (!html) return null;
    var m = html.match(/<script[^>]+id="videoInitialData"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return null;
    try {
        return JSON.parse(m[1]);
    } catch (e) {
        console.error("[HG] videoInitialData parse fail: " + e.message);
        return null;
    }
}


// =============================================================================
// 5.9. PARSER — DANH SÁCH TẬP TỪ DOM BẰNG REGEX (fallback khi MiniJQ fail)
//     ⭐ v1.7.0: chuẩn hóa href → luôn /video/{vid}/ep-{n}/
// =============================================================================

function parseEpisodesByRegex(html, seenSlug, videoId) {
    var episodes = [];
    var seen = seenSlug || {};
    var vid = videoId || "";

    var re = /<a\b[^>]*class="[^"]*\bhg-web-play__ep\b[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
    var m;

    while ((m = re.exec(html)) !== null) {
        var tag = m[0];
        var inner = m[1];

        var mHref = tag.match(/\bhref="([^"]+)"/);
        var href = mHref ? mHref[1] : "";
        if (!href) continue;

        var mEpId = tag.match(/\bdata-ep-id="(\d+)"/);
        var epId = mEpId ? mEpId[1] : "";

        var epName = inner.replace(/<[^>]*>/g, "").trim();

        var slug = epId ? ("ep-" + epId) : ("ep-" + (episodes.length + 1));
        if (seen[slug]) continue;
        seen[slug] = true;

        var finalHref = href;
        if (vid && epId) {
            finalHref = buildEpisodeUrl(vid, epId);
        } else if (vid && !epId) {
            finalHref = buildEpisodeUrl(vid, episodes.length + 1);
        }

        var finalEpNum = epId || String(episodes.length + 1);

        episodes.push({
            id: finalHref,
            name: epName || ("Tập " + finalEpNum),
            slug: slug,
            datasend: "epId=" + finalEpNum
        });
    }

    if (episodes.length === 0) {
        var re2 = /data-ep-id="(\d+)"[^>]*\bhref="([^"]+)"/g;
        var m2;
        while ((m2 = re2.exec(html)) !== null) {
            var epId2 = m2[1];
            var href2 = m2[2];
            var slug2 = "ep-" + epId2;
            if (seen[slug2]) continue;
            seen[slug2] = true;

            var finalHref2 = vid ? buildEpisodeUrl(vid, epId2) : href2;

            episodes.push({
                id: finalHref2,
                name: "Tập " + epId2,
                slug: slug2,
                datasend: "epId=" + epId2
            });
        }
    }

    if (episodes.length === 0) {
        var re3 = /href="(\/video\/\d+(?:\/ep-\d+)?\/)"[^>]*data-ep-id="(\d+)"/g;
        var m3;
        while ((m3 = re3.exec(html)) !== null) {
            var href3 = m3[1];
            var epId3 = m3[2];
            var slug3 = "ep-" + epId3;
            if (seen[slug3]) continue;
            seen[slug3] = true;

            var finalHref3 = vid ? buildEpisodeUrl(vid, epId3) : href3;

            episodes.push({
                id: finalHref3,
                name: "Tập " + epId3,
                slug: slug3,
                datasend: "epId=" + epId3
            });
        }
    }

    if (episodes.length > 0) {
        console.log("[HG] parseEpisodesByRegex → " + episodes.length + " episodes");
    }

    return episodes;
}


// =============================================================================
// 6. PARSER — CHI TIẾT PHIM
//    ⭐ v1.7.0: MỌI episode luôn có URL /video/{vid}/ep-{n}/ — kể cả tập 1
// =============================================================================

function parseMovieDetail(html, apiUrl, datasend) {
    console.log("[HG] parseMovieDetail url=" + apiUrl);
    var cleanUrl = apiUrl.split("|")[0];

    var videoId = extractVideoId(cleanUrl);
    console.log("[HG] videoId=" + videoId);

    var vdata = parseVideoInitialData(html);

    var title = "";
    var poster = "";
    var description = "";
    var tags = [];
    var author = "";
    var views = "";

    if (vdata) {
        title = vdata.title || "";
        poster = vdata.coverSrc || vdata.posterSrc || "";
        description = vdata.description || "";
        tags = vdata.tags || [];
        author = vdata.author || "";
        views = vdata.views || "";
        if (!videoId && vdata.id) videoId = String(vdata.id);
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
    if (poster.indexOf("cover-placeholder") !== -1) poster = "";

    poster = fixImageUrl(poster);

    var episodes = [];
    var seenSlug = {};

    // ── Tầng 1: MiniJQ DOM parse ──
    try {
        var $doc = _$(html);
        $doc.find("a.hg-web-play__ep").each(function () {
            var $a = this;
            var href = $a.attr("href") || "";
            var epId = $a.attr("data-ep-id") || "";
            var epName = $a.text().trim();
            if (!href && !epId) return;

            var slug = epId ? ("ep-" + epId) : ("ep-" + (episodes.length + 1));
            if (seenSlug[slug]) return;
            seenSlug[slug] = true;

            var finalEpNum = epId || String(episodes.length + 1);
            var finalHref = videoId ? buildEpisodeUrl(videoId, finalEpNum) : href;

            episodes.push({
                id: finalHref,
                name: epName || ("Tập " + finalEpNum),
                slug: slug,
                datasend: "epId=" + finalEpNum
            });
        });
    } catch (e) {
        console.error("[HG] parse episodes fail: " + e.message);
    }

    if (episodes.length === 0) {
        console.log("[HG] DOM parse empty → trying regex fallback");
        episodes = parseEpisodesByRegex(html, seenSlug, videoId);
    }

    if (episodes.length === 0 && vdata && vdata.epPlaySrcs) {
        var keys = Object.keys(vdata.epPlaySrcs).sort(function (a, b) {
            return parseInt(a, 10) - parseInt(b, 10);
        });
        for (var i = 0; i < keys.length; i++) {
            var epNum = keys[i];
            var finalHref3 = videoId ? buildEpisodeUrl(videoId, epNum) : cleanUrl;
            episodes.push({
                id: finalHref3,
                name: "Tập " + epNum,
                slug: "ep-" + epNum,
                datasend: "epId=" + epNum
            });
        }
    }

    if (episodes.length === 0) {
        var total = 0;
        if (vdata) {
            if (vdata.total) total = parseInt(vdata.total, 10) || 0;
            else if (vdata.episode) {
                var mTotal = String(vdata.episode).match(/(\d+)/);
                if (mTotal) total = parseInt(mTotal[1], 10) || 0;
            }
        }
        if (total > 0 && videoId) {
            for (var t = 1; t <= total; t++) {
                episodes.push({
                    id: buildEpisodeUrl(videoId, t),
                    name: "Tập " + t,
                    slug: "ep-" + t,
                    datasend: "epId=" + t
                });
            }
        } else {
            episodes.push({
                id: videoId ? buildEpisodeUrl(videoId, 1) : cleanUrl,
                name: "Tập 1",
                slug: "ep-1",
                datasend: "epId=1"
            });
        }
    }

    episodes.sort(function (a, b) {
        var na = parseInt((a.slug.match(/\d+/) || ["0"])[0], 10);
        var nb = parseInt((b.slug.match(/\d+/) || ["0"])[0], 10);
        return na - nb;
    });

    console.log("[HG] parseMovieDetail → " + episodes.length + " episodes"
        + " (ep1 url=" + (episodes[0] ? episodes[0].id : "?") + ")");

    return JSON.stringify({
        id: cleanUrl,
        title: title,
        posterUrl: poster,
        description: description,
        category: tags.join(", "),
        casts: author,
        director: author,
        quality: "",
        year: 0,
        status: views ? ("Lượt xem: " + views) : "",
        servers: [
            {
                name: "Vietsub",
                episodes: episodes
            }
        ]
    });
}


// =============================================================================
// 7. PARSER — LINK STREAM
//    ⭐ v1.7.0: LUÔN fetch tươi URL /video/{vid}/ep-{epId}/ khi apiUrl
//    không có /ep-N/ — tránh dùng epPlaySrcs từ trang gốc bị cache.
// =============================================================================

function parseDetailResponse(html, apiUrl, datasend) {
    console.log("[HG] parseDetailResponse url=" + apiUrl + " datasend=" + (datasend || ""));

    var cleanApiUrl = (apiUrl || "").split("|")[0].split("?")[0];

    var epId = "";
    if (datasend) {
        var mEp = datasend.match(/epId=(\d+)/);
        if (mEp) epId = mEp[1];
    }
    if (!epId) {
        var mUrl = cleanApiUrl.match(/\/ep-(\d+)\//);
        if (mUrl) epId = mUrl[1];
        else epId = "1";
    }

    var videoId = extractVideoId(cleanApiUrl);
    if (!videoId && html) {
        var vdataTemp = parseVideoInitialData(html);
        if (vdataTemp && vdataTemp.id) videoId = String(vdataTemp.id);
    }
    console.log("[HG] resolved videoId=" + videoId + " epId=" + epId);

    var needFresh = false;
    var hasEpInUrl = /\/ep-\d+\//.test(cleanApiUrl);
    if (!hasEpInUrl) {
        needFresh = true;
    } else {
        var mEpUrl = cleanApiUrl.match(/\/ep-(\d+)\//);
        if (mEpUrl && mEpUrl[1] !== epId) {
            needFresh = true;
        }
    }

    var workingHtml = html;
    var workingVdata = null;

    if (needFresh && videoId) {
        var epUrl = buildEpisodeUrl(videoId, epId);
        console.log("[HG] needFresh=true → fetch " + epUrl);
        try {
            var res = httpRequest(epUrl, {
                headers: {
                    "Referer": REFERER,
                    "User-Agent": UA_MOBILE
                }
            });
            if (res && res.isSuccessful && res.body) {
                workingHtml = res.body;
                workingVdata = parseVideoInitialData(res.body);
                console.log("[HG] fresh fetch OK, vdata=" + (workingVdata ? "yes" : "no"));
            } else {
                console.warn("[HG] fresh fetch failed, fallback to original html");
            }
        } catch (e) {
            console.error("[HG] fresh fetch error: " + e.message);
        }
    }

    var vdata = workingVdata || parseVideoInitialData(workingHtml);
    var vid = vdata ? String(vdata.id || "") : "";
    if (!vid && videoId) vid = videoId;

    var streamUrl = "";
    if (vdata && vdata.epPlaySrcs && vdata.epPlaySrcs[epId]) {
        streamUrl = vdata.epPlaySrcs[epId];
        console.log("[HG] stream from epPlaySrcs[" + epId + "]"
            + (needFresh ? " (fresh)" : " (cached)"));
    }

    if (!streamUrl && vdata && epId === "1") {
        if (vdata.videoSrc) {
            streamUrl = vdata.videoSrc;
            console.log("[HG] stream from videoSrc");
        } else if (vdata.previewSrc) {
            streamUrl = vdata.previewSrc;
            console.log("[HG] stream from previewSrc");
        }
    }

    if (!streamUrl && workingHtml) {
        var mM3u8 = workingHtml.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/i);
        if (mM3u8) {
            streamUrl = mM3u8[0].replace(/\\\//g, "/");
            console.log("[HG] stream from html regex m3u8");
        }
    }

    if (!streamUrl && !needFresh && videoId) {
        var epUrl2 = buildEpisodeUrl(videoId, epId);
        console.log("[HG] no stream yet → last-resort fetch " + epUrl2);
        try {
            var res2 = httpRequest(epUrl2, {
                headers: {
                    "Referer": REFERER,
                    "User-Agent": UA_MOBILE
                }
            });
            if (res2 && res2.isSuccessful && res2.body) {
                var vdata2 = parseVideoInitialData(res2.body);
                if (vdata2 && vdata2.epPlaySrcs && vdata2.epPlaySrcs[epId]) {
                    streamUrl = vdata2.epPlaySrcs[epId];
                    console.log("[HG] stream from last-resort fetch");
                }
                if (!streamUrl) {
                    var mM3u8b = res2.body.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/i);
                    if (mM3u8b) {
                        streamUrl = mM3u8b[0].replace(/\\\//g, "/");
                        console.log("[HG] stream from last-resort regex");
                    }
                }
            }
        } catch (e) {
            console.error("[HG] last-resort fetch fail: " + e.message);
        }
    }

    if (!streamUrl) {
        console.warn("[HG] No stream found for ep=" + epId);
        return JSON.stringify({ url: "", isEmbed: false });
    }

    console.log("[HG] ep=" + epId + " stream=" + streamUrl.substring(0, 90) + "...");

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
// 8. PARSER — EMBED (fallback)
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
// 9. PARSER PHỤ
// =============================================================================

function parseCategoriesResponse(html, apiUrl) {
    var items = [];
    var seen = {};
    try {
        var $doc = _$(html);
        $doc.find("a[href^='/tag/']").each(function () {
            // ⭐ v1.8.0 — loại trừ tag trong search-suggest / SSP
            if (!isValidCard(this)) return;

            var $a = _$(this);
            var href = $a.attr("href") || "";
            var name = $a.text().trim();
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


// =============================================================================
// 10. FILTER CONFIG
// =============================================================================

function getFilterConfig() {
    return JSON.stringify({ filters: [] });
}


// =============================================================================
// 11. HELPER
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
// 12. LOG KHỞI TẠO
// =============================================================================

console.log("[HG] huangguo_plugin.js v1.8.0 VI loaded. BaseUrl=" + BASE
    + " | ImgProxy=" + (USE_IMG_PROXY ? "ON" : "OFF")
    + " | CardFilter=ON (exclude search-suggest/SSP/hero)");
