// =============================================================================
// 123AV PLUGIN FOR VAAPP - TUÂN THỦ ĐÚNG QUY ĐỊNH
// Version: 4.0.1
// Cập nhật: 
//   - Thêm previewUrl với 3 strategy
//   - Sửa lỗi title bị "0"
//   - Parse chính xác từ card__body
//   - Hỗ trợ filter nâng cao (type, year, actress, sort)
//   - Tối ưu parseListResponse
// =============================================================================

// =============================================================================
// CONFIGURATION & METADATA
// =============================================================================

function getManifest() {
    return JSON.stringify({
        "id": "123av",
        "name": "123AV",
        "version": "4.0.0",
        "baseUrl": "https://123av.com",
        "fallbackUrls": [
            "https://123av.net",
            "https://123av.org"
        ],
        "referrer": "https://123av.com/",
        "imageReferer": "https://123av.com/",
        "iconUrl": "https://123av.com/assets/123av/favicon.png",
        "isEnabled": true,
        "isAdult": true,
        "type": "VIDEO",
        "layoutType": "HORIZONTAL",
        "playerType": "exoplayer",
        "subtitleCat": false,
        "debug": false,
        "adblock": true
    });
}

function getHomeSections() {
    return JSON.stringify([
        { slug: 'vi/new', title: 'Mới Cập Nhật', type: 'Horizontal', path: '' },
        { slug: 'vi/hot', title: 'Hot & Thịnh Hành', type: 'Horizontal', path: '' },
        { slug: 'vi/recent', title: 'Mới thêm gần đây', type: 'Horizontal', path: '' },
        { slug: 'vi/all?sort=today', title: 'Xu hướng (Hôm Nay)', type: 'Horizontal', path: '' },
        { slug: 'vi/all?sort=week', title: 'Xu hướng (Tuần Này)', type: 'Horizontal', path: '' }
    ]);
}

function getPrimaryCategories() {
    return JSON.stringify([
        { name: 'Mới cập nhật', slug: 'vi/new' },
        { name: 'Thịnh hành', slug: 'vi/hot' },
        { name: 'Mới thêm gần đây', slug: 'vi/recent' },
        { name: 'Xu hướng (Hôm Nay)', slug: 'vi/all?sort=today' },
        { name: 'Xu hướng (Tuần Này)', slug: 'vi/all?sort=week' },
        { name: 'Thể loại', slug: 'vi/genres' },
        { name: 'Diễn viên', slug: 'vi/actresses' },
        { name: 'Nhà sản xuất', slug: 'vi/makers' },
        { name: 'Loạt phim (Series)', slug: 'vi/series' }
    ]);
}

function getFilterConfig() {
    return JSON.stringify({
        sort: [
            { name: 'Mới nhất', value: 'new' },
            { name: 'Hôm nay', value: 'today' },
            { name: 'Tuần này', value: 'week' },
            { name: 'Tháng này', value: 'month' }
        ],
        category: [
            { name: "Tất cả thể loại", value: "vi/genres" },
            { name: "Có che (Censored)", value: "vi/censored" },
            { name: "Không che (Uncensored)", value: "vi/uncensored" },
            { name: "Không che rò rỉ", value: "vi/uncensored-leaked" },
            { name: "Nữ diễn viên", value: "vi/actresses" },
            { name: "Nhà sản xuất", value: "vi/makers" },
            { name: "Loạt phim (Series)", value: "vi/series" }
        ]
    });
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

var PluginUtils = {
    /**
     * Làm sạch text: loại bỏ HTML tags, entities, khoảng trắng thừa
     */
    cleanText: function(text) {
        if (!text) return "";
        return text.replace(/<[^>]*>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/\s+/g, " ")
            .trim();
    },

    /**
     * Lấy meta tag từ HTML
     */
    getMeta: function(html, property) {
        var regex1 = new RegExp('(?:property|name)=["\']' + property + '["\'][^>]*content=(["\'])(.*?)\\1', 'i');
        var regex2 = new RegExp('content=(["\'])(.*?)\\1[^>]*(?:property|name)=["\']' + property + '["\']', 'i');
        var match = html.match(regex1) || html.match(regex2);
        return match ? match[2] : "";
    },

    /**
     * Chuẩn hóa URL: thêm https: nếu thiếu
     */
    normalizeUrl: function(url) {
        if (!url) return "";
        if (url.indexOf('//') === 0) return "https:" + url;
        if (url.indexOf('/') === 0) return "https://123av.com" + url;
        return url;
    },

    /**
     * Trích xuất preview URL từ card với 3 strategy
     */
    extractPreviewUrl: function(itemHtml, $element) {
        var url = "";

        // Strategy 1: Lấy từ data-preview attribute (PNG)
        var previewMatch = itemHtml.match(/data-preview="([^"]+)"/);
        if (previewMatch) {
            url = previewMatch[1];
        }

        // Nếu dùng jQuery
        if (!url && $element) {
            var posterDiv = $element.find(".card__poster, .featured__poster").first();
            if (posterDiv && posterDiv.length > 0) {
                url = posterDiv.attr("data-preview") || "";
            }
        }

        // Strategy 2: Lấy từ video data-src (MP4)
        if (!url) {
            var videoMatch = itemHtml.match(/<video[^>]+data-src="([^"]+)"/);
            if (videoMatch) {
                url = videoMatch[1];
            }
        }

        // Strategy 3: Thử chuyển PNG sang MP4
        if (url && url.indexOf('.png') !== -1) {
            var mp4Url = url.replace('.png', '.mp4');
            // Có thể dùng MP4 nếu muốn
            // url = mp4Url;
        }

        // Chuẩn hóa URL
        return PluginUtils.normalizeUrl(url);
    },

    /**
     * Xác định loại phim (Censored/Uncensored) từ nhiều nguồn
     */
    detectLanguage: function($element, href, title, cardHtml) {
        // 1. Kiểm tra trong URL
        if (href && href.indexOf('uncensored') !== -1) {
            return 'Uncensored';
        }

        // 2. Kiểm tra trong title
        if (title && title.toLowerCase().indexOf('uncensored') !== -1) {
            return 'Uncensored';
        }

        // 3. Kiểm tra class của card
        if ($element && $element.length > 0) {
            var cardClass = $element.attr("class") || "";
            if (cardClass.toLowerCase().indexOf('uncensored') !== -1) {
                return 'Uncensored';
            }
        }

        // 4. Kiểm tra HTML của card
        if (cardHtml && cardHtml.toLowerCase().indexOf('uncensored') !== -1) {
            return 'Uncensored';
        }

        return 'Censored';
    }
};

// =============================================================================
// HELPER FUNCTIONS (Giữ nguyên từ plugin cũ)
// =============================================================================

function getPipeData(raw) {
    if (!raw) return "";
    var i = raw.indexOf("|");
    if (i < 0) return "";
    var s = raw.substring(i + 1).replace(/^\s+/, "");
    if (s.toLowerCase().indexOf("data:") === 0) {
        s = s.substring(5);
    }
    return s;
}

function cleanUrl(raw) {
    if (!raw) return "";
    var i = raw.indexOf("|");
    if (i < 0) return raw;
    return raw.substring(0, i);
}

function extractHashId(url) {
    if (!url) return null;
    
    var hashMatch = url.match(/\/e\/([a-z0-9_]+)/i);
    if (hashMatch) return hashMatch[1];
    
    try {
        var urlObj = new URL(url);
        var hashParam = urlObj.searchParams.get('hash') || urlObj.searchParams.get('id');
        if (hashParam) return hashParam;
        
        var pathSegments = urlObj.pathname.split('/').filter(function(s) { return s; });
        for (var i = 0; i < pathSegments.length; i++) {
            if (/^[a-z0-9_]{6,}$/i.test(pathSegments[i])) {
                return pathSegments[i];
            }
        }
    } catch (e) {
        var fallbackMatch = url.match(/([a-z0-9_]{6,})/i);
        if (fallbackMatch) return fallbackMatch[1];
    }
    
    return null;
}

function extractPosterFromUrl(url) {
    try {
        var urlObj = new URL(url);
        return urlObj.searchParams.get('poster');
    } catch (e) {
        return null;
    }
}

function decodePlayerJson(escapedStr) {
    try {
        var cleanStr = escapedStr.replace(/\\u([0-9a-fA-F]{4})/g, function(match, grp) {
            return String.fromCharCode(parseInt(grp, 16));
        }).replace(/\\/g, '');
        return JSON.parse(cleanStr);
    } catch (e) {
        return [];
    }
}

function cleanText(text) {
    return PluginUtils.cleanText(text);
}

function getMeta(html, property) {
    return PluginUtils.getMeta(html, property);
}

// =============================================================================
// X-DATA PARSER (PHƯƠNG PHÁP MỚI)
// =============================================================================

function extractPlayerDataFromXData(html) {
    try {
        var divPattern = /<div\s+class="watch__main"\s+x-data="([^"]+)"/;
        var divMatch = html.match(divPattern);
        
        if (!divMatch) {
            return null;
        }

        var xDataContent = divMatch[1];
        
        var playerPattern = /player\(\s*JSON\.parse\s*\(\s*'([^']*)'\s*\)\s*,\s*(\d+)\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/;
        var playerMatch = xDataContent.match(playerPattern);
        
        if (!playerMatch) {
            return null;
        }

        var jsonStr = playerMatch[1]
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\\\/g, '\\')
            .replace(/\\\//g, '/');

        jsonStr = jsonStr.replace(/\\u([0-9a-fA-F]{4})/g, function(match, hex) {
            return String.fromCharCode(parseInt(hex, 16));
        });

        var episodeData = JSON.parse(jsonStr);
        
        if (!Array.isArray(episodeData) || episodeData.length === 0) {
            return null;
        }

        var firstEpisode = episodeData[0];
        var iframeUrl = firstEpisode?.url || null;

        if (!iframeUrl) {
            return null;
        }

        var hashId = extractHashId(iframeUrl);
        var poster = extractPosterFromUrl(iframeUrl);

        return {
            episodes: episodeData,
            videoId: parseInt(playerMatch[2]),
            code: playerMatch[3],
            apiBase: playerMatch[4],
            recKey: playerMatch[5],
            iframeUrl: iframeUrl,
            hashId: hashId,
            poster: poster
        };
    } catch (e) {
        return null;
    }
}

// =============================================================================
// STREAM DATA FETCHER
// =============================================================================

function fetchStreamDataAdvanced(hashId, poster) {
    var result = { stream: null, vtt: null, poster: null };
    
    var endpoints = [
        'https://javplayer.cc/stream',
        'https://stream.javplayer.cc/stream'
    ];
    
    for (var i = 0; i < endpoints.length; i++) {
        try {
            var url = endpoints[i] + '?id=' + encodeURIComponent(hashId);
            if (poster) url += '&poster=' + encodeURIComponent(poster);
            
            var response = httpRequest(url, {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            });
            
            if (response && response.isSuccessful && response.status === 200) {
                var data = JSON.parse(response.body);
                if (data.status === 'ok' && data.media && data.media.stream) {
                    result.stream = data.media.stream;
                    result.vtt = data.media.vtt || null;
                    result.poster = data.media.poster || poster || null;
                    return result;
                }
            }
        } catch (e) {
            continue;
        }
    }
    
    return result;
}

// =============================================================================
// URL GENERATION (CẢI TIẾN - HỖ TRỢ FILTER NÂNG CAO)
// =============================================================================

function getUrlList(slug, filtersJson) {
    var filters = JSON.parse(filtersJson || "{}");
    var page = filters.page || 1;
    var baseUrl = "https://123av.com";
    
    var path = slug || "vi/new";
    
    if (path.indexOf("vi/") !== 0 && path.indexOf("/vi/") !== 0) {
        if (path.indexOf("/") === 0) path = "en" + path;
        else path = "vi/" + path;
    }
    
    if (path.indexOf("/") !== 0) path = "/" + path;
    
    var url = baseUrl + path;
    var params = [];
    
    // Page (luôn có)
    params.push("page=" + page);
    
    // Type (filter theo loại nội dung)
    if (filters.type) {
        params.push("type=" + encodeURIComponent(filters.type));
    }
    
    // Year (filter theo năm)
    if (filters.year) {
        params.push("year=" + encodeURIComponent(filters.year));
    }
    
    // Actress (filter theo diễn viên)
    if (filters.actress) {
        params.push("actress=" + encodeURIComponent(filters.actress));
    }
    
    // Sort (sắp xếp)
    if (filters.sort) {
        var sortMap = {
            'new': 'release_date',
            'today': 'today_views',
            'week': 'weekly_views',
            'month': 'monthly_views',
            'views': 'total_views',
            'rating': 'rating'
        };
        var sortValue = sortMap[filters.sort] || filters.sort;
        params.push("sort=" + encodeURIComponent(sortValue));
    }
    
    // Keyword (từ khóa tìm kiếm)
    if (filters.keyword) {
        params.push("keyword=" + encodeURIComponent(filters.keyword));
    }
    
    // Genre (thể loại)
    if (filters.genre) {
        params.push("genre=" + encodeURIComponent(filters.genre));
    }
    
    // Maker (nhà sản xuất)
    if (filters.maker) {
        params.push("maker=" + encodeURIComponent(filters.maker));
    }
    
    // Series (loạt phim)
    if (filters.series) {
        params.push("series=" + encodeURIComponent(filters.series));
    }
    
    return url + "?" + params.join("&");
}

function getUrlSearch(keyword, filtersJson) {
    var filters = JSON.parse(filtersJson || "{}");
    var page = filters.page || 1;
    var url = "https://123av.com/vi/search?keyword=" + encodeURIComponent(keyword) + "&page=" + page;
    
    if (filters.sort) {
        var sortMap = {
            'new': 'release_date',
            'today': 'today_views',
            'week': 'weekly_views',
            'month': 'monthly_views',
            'views': 'total_views'
        };
        url += "&sort=" + (sortMap[filters.sort] || filters.sort);
    }
    
    if (filters.type) {
        url += "&type=" + encodeURIComponent(filters.type);
    }
    
    return url;
}

function getUrlDetail(slug, datasend) {
    if (datasend) {
        try {
            var data = JSON.parse(datasend);
            if (data && data.id) {
                return datasend;
            }
        } catch (e) {}
    }
    
    if (slug.indexOf("http") === 0) return slug;
    if (slug.indexOf("vi/v/") === 0) return "https://123av.com/" + slug;
    if (slug.indexOf("/vi/v/") === 0) return "https://123av.com" + slug;
    if (slug.indexOf("v/") === 0) return "https://123av.com/vi/" + slug;
    if (slug.indexOf("/v/") === 0) return "https://123av.com/en" + slug;
    
    return "https://123av.com/vi/v/" + slug;
}

function getUrlCategories() { 
    return "https://123av.com/vi/genres"; 
}

function getUrlCountries() { 
    return ""; 
}

function getUrlYears() { 
    return ""; 
}

// =============================================================================
// LIST PARSER (CẢI TIẾN HOÀN TOÀN)
// =============================================================================

function parseListResponse(html, apiUrl, datasend) {
    var movies = [];
    var $doc = _$(html);
    
    // Kiểm tra nếu là trang diễn viên
    var isActressesPage = $doc.find("a[href*='/actresses/']").length > 10 && 
                          html.indexOf('Actresses') !== -1;
    
    // Kiểm tra nếu là trang thể loại
    var isAllGenresPage = html.indexOf('/vi/genres/') !== -1 && 
                          html.indexOf('Genres') !== -1 && 
                          html.indexOf('title="Genres"') === -1;
    
    // ============================================================
    // PARSE TRANG DIỄN VIÊN
    // ============================================================
    if (isActressesPage) {
        $doc.find("a[href*='/actresses/']").each(function() {
            var href = this.attr("href");
            if (!href) return;
            
            var slugMatch = href.match(/\/actresses\/([^"\/]+)/);
            if (!slugMatch) return;
            
            var name = this.text().trim();
            if (!name || name.length < 2 || name.match(/^\d+/) || name.indexOf('.') !== -1) return;
            
            var slug = "vi/actresses/" + slugMatch[1];
            
            var exists = false;
            for (var i = 0; i < movies.length; i++) {
                if (movies[i].id === slug) {
                    exists = true;
                    break;
                }
            }
            
            if (!exists) {
                movies.push({
                    id: slug,
                    title: name,
                    posterUrl: "",
                    backdropUrl: "",
                    description: "Nữ diễn viên",
                    year: 0,
                    quality: "ACTRESS",
                    episode_current: "",
                    lang: "",
                    previewUrl: ""
                });
            }
        });
        return JSON.stringify({
            items: movies,
            pagination: { currentPage: 1, totalPages: 1, totalItems: movies.length, itemsPerPage: 20 }
        });
    }
    
    // ============================================================
    // PARSE TRANG THỂ LOẠI
    // ============================================================
    if (isAllGenresPage) {
        $doc.find("a[href*='/genres/']").each(function() {
            var href = this.attr("href");
            if (!href) return;
            
            var slugMatch = href.match(/\/genres\/([^"\/]+)/);
            if (!slugMatch) return;
            
            var name = cleanText(this.text()).replace(/\d+,\d+|\d+/g, '').trim();
            if (!name || name.length < 2) return;
            
            var slug = "vi/genres/" + slugMatch[1];
            
            var exists = false;
            for (var i = 0; i < movies.length; i++) {
                if (movies[i].id === slug) {
                    exists = true;
                    break;
                }
            }
            
            if (!exists) {
                movies.push({
                    id: slug,
                    title: name,
                    posterUrl: "",
                    backdropUrl: "",
                    description: "Thể loại",
                    year: 0,
                    quality: "CAT",
                    episode_current: "",
                    lang: "",
                    previewUrl: ""
                });
            }
        });
        return JSON.stringify({
            items: movies,
            pagination: { currentPage: 1, totalPages: 1, totalItems: movies.length, itemsPerPage: 20 }
        });
    }
    
    // ============================================================
    // PARSE DANH SÁCH PHIM (CẢI TIẾN)
    // ============================================================
    $doc.find(".card, .featured").each(function() {
        // --- BƯỚC 1: LẤY SLUG VÀ URL ---
        var href = "";
        var slug = "";
        var link = null;
        
        // Ưu tiên lấy từ card__body
        var bodyLink = this.find(".card__body .card__link, .featured__body .card__link").first();
        if (bodyLink && bodyLink.length > 0) {
            link = bodyLink;
            href = bodyLink.attr("href") || "";
            var slugMatch = href.match(/\/v\/([^"\/]+)/);
            if (slugMatch) slug = "vi/v/" + slugMatch[1];
        }
        
        // Nếu không có, lấy từ card__poster (chỉ để lấy slug)
        if (!slug) {
            var posterLink = this.find(".card__poster .card__cover, .featured__poster .card__cover").first();
            if (posterLink && posterLink.length > 0) {
                href = posterLink.attr("href") || "";
                var slugMatch2 = href.match(/\/v\/([^"\/]+)/);
                if (slugMatch2) slug = "vi/v/" + slugMatch2[1];
            }
        }
        
        if (!slug) return;
        
        // --- BƯỚC 2: LẤY TITLE ---
        var title = "";
        var cardHtml = this.html() || "";
        
        // Nguồn 1: Từ link trong card__body
        if (bodyLink && bodyLink.length > 0) {
            title = bodyLink.text().trim();
        }
        
        // Nguồn 2: Từ thẻ h3.card__title
        if (!title || title === "0" || title.match(/^\d+$/)) {
            var titleEl = this.find(".card__title, .featured__title, h3").first();
            if (titleEl && titleEl.length > 0) {
                title = titleEl.text().trim();
            }
        }
        
        // Nguồn 3: Từ toàn bộ card__body
        if (!title || title === "0" || title.match(/^\d+$/)) {
            var bodyEl = this.find(".card__body, .featured__body").first();
            if (bodyEl && bodyEl.length > 0) {
                var bodyText = bodyEl.text().trim();
                var metaIndex = bodyText.lastIndexOf("\n") || bodyText.length;
                if (metaIndex > 0) {
                    title = bodyText.substring(0, metaIndex).trim();
                } else {
                    title = bodyText;
                }
            }
        }
        
        // Nguồn 4: Từ img alt
        if (!title || title === "0" || title.match(/^\d+$/)) {
            var img = this.find(".card__poster img, .featured__poster img").first();
            if (img && img.length > 0) {
                title = img.attr("alt") || "";
            }
        }
        
        // Nguồn 5: Từ slug (fallback cuối cùng)
        if (!title || title === "0" || title.match(/^\d+$/)) {
            title = slug.replace("vi/v/", "").replace(/-/g, " ");
        }
        
        title = cleanText(title);
        
        // --- BƯỚC 3: LẤY POSTER ---
        var poster = "";
        var posterImg = this.find(".card__poster img, .featured__poster img").first();
        if (posterImg && posterImg.length > 0) {
            poster = posterImg.attr("data-src") || posterImg.attr("src") || "";
            poster = PluginUtils.normalizeUrl(poster);
        }
        
        // --- BƯỚC 4: LẤY PREVIEW URL ---
        var previewUrl = PluginUtils.extractPreviewUrl(cardHtml, this);
        
        // --- BƯỚC 5: LẤY DURATION ---
        var duration = "";
        var durEl = this.find(".card__dur, .featured__dur").first();
        if (durEl && durEl.length > 0) {
            duration = durEl.text().trim();
        }
        
        // --- BƯỚC 6: LẤY VIEWS ---
        var views = "";
        var viewsEl = this.find(".card__views, .featured__views").first();
        if (viewsEl && viewsEl.length > 0) {
            views = viewsEl.text().trim();
        }
        
        // --- BƯỚC 7: XÁC ĐỊNH LANG ---
        var lang = PluginUtils.detectLanguage(this, href, title, cardHtml);
        
        // --- BƯỚC 8: XÁC ĐỊNH QUALITY ---
        var quality = lang === 'Uncensored' ? "K.K.Duyệt" : "HD";
        
        // --- BƯỚC 9: TẠO MÔ TẢ ---
        var description = "";
        if (duration) description += "⏱ " + duration;
        if (views) description += (description ? " | " : "") + "👁 " + views;
        
        // --- BƯỚC 10: THÊM VÀO DANH SÁCH ---
        movies.push({
            id: slug,
            title: title,
            posterUrl: poster,
            backdropUrl: poster,
            description: description,
            year: 0,
            quality: quality,
            episode_current: duration || "Full",
            lang: lang,
            previewUrl: previewUrl
        });
    });
    
    // ============================================================
    // PAGINATION
    // ============================================================
    var currentPage = 1;
    var totalPages = 1;
    
    var activePageMatch = html.match(/class="[^"]*active[^"]*"[^>]*>(\d+)<\/span>/i) || 
                          html.match(/class="[^"]*active[^"]*"[^>]*>(\d+)<\/a>/i);
    if (activePageMatch) currentPage = parseInt(activePageMatch[1]);
    
    var pageLinks = html.match(/page=(\d+)/g);
    if (pageLinks) {
        for (var p = 0; p < pageLinks.length; p++) {
            var num = parseInt(pageLinks[p].match(/\d+/)[0]);
            if (num > totalPages) totalPages = num;
        }
    }
    
    return JSON.stringify({
        items: movies,
        pagination: {
            currentPage: currentPage,
            totalPages: Math.max(totalPages, currentPage),
            totalItems: movies.length,
            itemsPerPage: 20
        }
    });
}

function parseSearchResponse(html, apiUrl, datasend) {
    return parseListResponse(html, apiUrl, datasend);
}

// =============================================================================
// MOVIE DETAIL PARSER (CẢI TIẾN - CÓ PREVIEW URL)
// =============================================================================

function parseMovieDetail(htmlContent, apiUrl, datasend) {
    try {
        // === 1. ƯU TIÊN ĐỌC TỪ DATASEND ===
        var detailData = null;
        if (datasend) {
            try {
                detailData = JSON.parse(datasend);
                if (detailData && detailData.servers) {
                    return JSON.stringify(detailData);
                }
            } catch (e) {}
        }
        
        // === 2. THỬ PARSE X-DATA ===
        var xDataResult = extractPlayerDataFromXData(htmlContent);
        var servers = [];
        var title = '';
        var thumb = '';
        var desc = '';
        var year = 0;
        var actors = [];
        var genres = [];
        var director = '';
        var slug = '';
        var previewUrl = '';
        
        if (xDataResult && xDataResult.iframeUrl) {
            // Lấy metadata
            title = getMeta(htmlContent, "og:title") || xDataResult.code || '';
            thumb = getMeta(htmlContent, "og:image") || xDataResult.poster || '';
            desc = getMeta(htmlContent, "og:description") || '';
            
            // Lấy preview URL
            var previewMatch = htmlContent.match(/<video[^>]+data-src="([^"]+)"/);
            if (previewMatch) {
                previewUrl = previewMatch[1];
            }
            if (!previewUrl) {
                var previewDivMatch = htmlContent.match(/<div[^>]+data-preview="([^"]+)"/);
                if (previewDivMatch) {
                    previewUrl = previewDivMatch[1];
                }
            }
            if (!previewUrl && thumb) {
                previewUrl = thumb.replace('/cover.jpg', '/preview.png');
            }
            previewUrl = PluginUtils.normalizeUrl(previewUrl);
            
            // Lấy stream từ API
            var streamData = fetchStreamDataAdvanced(xDataResult.hashId, xDataResult.poster);
            
            if (streamData.stream) {
                var episodes = [];
                episodes.push({
                    id: streamData.stream,
                    name: "Server HD #1",
                    slug: "server-1",
                    vtt: streamData.vtt || ''
                });
                
                servers.push({
                    name: "123AV Play",
                    episodes: episodes
                });
            }
            
            // Parse metadata từ HTML
            var $doc = _$(htmlContent);
            
            // Actors
            $doc.find("a[href*='/actresses/']").each(function() {
                var name = cleanText(this.text());
                if (name && actors.indexOf(name) === -1) actors.push(name);
            });
            
            // Genres
            $doc.find("a[href*='/genres/']").each(function() {
                var name = cleanText(this.text());
                if (name && genres.indexOf(name) === -1) genres.push(name);
            });
            
            // Year
            var yearMatch = htmlContent.match(/<dt>Release date<\/dt>\s*<dd>([^<]+)<\/dd>/i);
            if (yearMatch) {
                var yr = parseInt(yearMatch[1].substring(0, 4));
                if (yr) year = yr;
            }
            
            // Director
            var dirMatch = htmlContent.match(/<dt>Maker<\/dt>\s*<dd>[\s\S]*?href="[^"]*">([^<]+)<\/a>/i);
            if (dirMatch) director = cleanText(dirMatch[1]);
            
            // Slug
            var canonicalMatch = htmlContent.match(/<link\s+rel="canonical"\s+href="https:\/\/123av\.com\/[^"\/]+\/v\/([^"]+)"/i);
            if (canonicalMatch) slug = canonicalMatch[1];
            
            return JSON.stringify({
                id: slug,
                title: cleanText(title),
                posterUrl: thumb,
                backdropUrl: thumb,
                description: cleanText(desc),
                year: year,
                rating: 0,
                quality: "HD",
                servers: servers,
                episode_current: servers.length > 0 ? "Full" : "No Source",
                lang: htmlContent.indexOf('uncensored') !== -1 ? 'Uncensored' : 'Censored',
                category: genres.join(", "),
                country: "Japan",
                director: director,
                casts: actors.join(", "),
                previewUrl: previewUrl
            });
        }
        
        // === 3. FALLBACK: PHƯƠNG PHÁP CŨ ===
        var title = getMeta(htmlContent, "og:title") || "";
        var thumb = getMeta(htmlContent, "og:image") || "";
        var desc = getMeta(htmlContent, "og:description") || "";
        
        // Trích xuất ảnh bìa phim thật
        var coverMatch = htmlContent.match(/style="background-image:url\(['"]?([^'")]+cover\.jpg[^'")]+)['"]?\)"/i) ||
                         htmlContent.match(/background-image:url\(['"]?([^'")]+cover\.jpg[^'")]+)['"]?\)/i) ||
                         htmlContent.match(/src="([^"]+cover\.jpg[^"]*)"/i);
        if (coverMatch) {
            thumb = coverMatch[1];
        } else if (thumb.indexOf("logo-square.png") !== -1 || thumb.indexOf("logo") !== -1) {
            var coverGenericMatch = htmlContent.match(/https?:\/\/[^\s"'><]+?\/cover\.jpg[^\s"'><]*/i);
            if (coverGenericMatch) {
                thumb = coverGenericMatch[0];
            }
        }
        
        // Lấy preview URL (fallback)
        var previewUrl = "";
        var previewMatch = htmlContent.match(/<video[^>]+data-src="([^"]+)"/);
        if (previewMatch) {
            previewUrl = previewMatch[1];
        }
        if (!previewUrl) {
            var previewDivMatch = htmlContent.match(/<div[^>]+data-preview="([^"]+)"/);
            if (previewDivMatch) {
                previewUrl = previewDivMatch[1];
            }
        }
        if (!previewUrl && thumb) {
            previewUrl = thumb.replace('/cover.jpg', '/preview.png');
        }
        previewUrl = PluginUtils.normalizeUrl(previewUrl);
        
        var releaseMatch = htmlContent.match(/<dt>Release date<\/dt>\s*<dd>([^<]+)<\/dd>/i);
        var year = 0;
        if (releaseMatch) {
            var yr = parseInt(releaseMatch[1].substring(0, 4));
            if (yr) year = yr;
        }
        
        var actors = [];
        var actorPattern = /href="[^"]*\/actresses\/[^"]+">([^<]+)<\/a>/gi;
        var match;
        while ((match = actorPattern.exec(htmlContent)) !== null) {
            var aName = cleanText(match[1]);
            if (aName && actors.indexOf(aName) === -1) actors.push(aName);
        }
        
        var genres = [];
        var genrePattern = /href="[^"]*\/genres\/[^"]+">([^<]+)<\/a>/gi;
        while ((match = genrePattern.exec(htmlContent)) !== null) {
            var gName = cleanText(match[1]);
            if (gName && genres.indexOf(gName) === -1) genres.push(gName);
        }
        
        var director = "";
        var dirMatch = htmlContent.match(/<dt>Maker<\/dt>\s*<dd>[\s\S]*?href="[^"]*">([^<]+)<\/a>/i);
        if (dirMatch) director = cleanText(dirMatch[1]);
        
        // Xử lý video stream cũ
        var servers = [];
        var playerJsonMatch = /player\(\s*JSON\.parse\(\s*['"]([^'"]+)['"]\s*\)/i.exec(htmlContent);
        
        if (playerJsonMatch) {
            var playerItems = decodePlayerJson(playerJsonMatch[1]);
            var episodes = [];
            
            for (var i = 0; i < playerItems.length; i++) {
                var item = playerItems[i];
                var rawUrl = item.url;
                
                var hashId = "";
                var poster = "";
                var hashMatch = rawUrl.match(/\/e\/([a-z0-9_]+)/i);
                if (hashMatch) hashId = hashMatch[1];
                var posterMatch = rawUrl.match(/poster=([^&]+)/i);
                if (posterMatch) poster = decodeURIComponent(posterMatch[1]);
                
                var m3u8Url = rawUrl;
                var vttUrl = "";
                
                if (hashId) {
                    var streamData = fetchStreamDataAdvanced(hashId, poster);
                    if (streamData.stream) {
                        m3u8Url = streamData.stream;
                        vttUrl = streamData.vtt || "";
                    }
                }
                
                episodes.push({
                    id: m3u8Url,
                    name: "Server HD #" + (item.name || (i + 1)),
                    slug: "server-" + (i + 1),
                    vtt: vttUrl
                });
            }
            
            if (episodes.length > 0) {
                servers.push({
                    name: "123AV Play",
                    episodes: episodes
                });
            }
        }
        
        // Slug
        var slug = "";
        var canonicalMatch = htmlContent.match(/<link\s+rel="canonical"\s+href="https:\/\/123av\.com\/[^"\/]+\/v\/([^"]+)"/i);
        if (canonicalMatch) slug = canonicalMatch[1];
        
        return JSON.stringify({
            id: slug,
            title: cleanText(title),
            posterUrl: thumb,
            backdropUrl: thumb,
            description: cleanText(desc),
            year: year,
            rating: 0,
            quality: "HD",
            servers: servers,
            episode_current: servers.length > 0 ? "Full" : "No Source",
            lang: htmlContent.indexOf('uncensored') !== -1 ? 'Uncensored' : 'Censored',
            category: genres.join(", "),
            country: "Japan",
            director: director,
            casts: actors.join(", "),
            previewUrl: previewUrl
        });
        
    } catch (e) {
        toast("Lỗi parseMovieDetail: " + e.message);
        return JSON.stringify({
            error: true,
            message: e.message
        });
    }
}

// =============================================================================
// DETAIL RESPONSE PARSER
// =============================================================================

function parseDetailResponse(htmlContent, apiUrl, datasend) {
    try {
        if (datasend) {
            try {
                var data = JSON.parse(datasend);
                if (data && data.url) {
                    return JSON.stringify({
                        url: data.url,
                        isEmbed: data.isEmbed || false,
                        headers: data.headers || {
                            "Referer": "https://123av.com/",
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                        },
                        mimeType: data.mimeType || "application/x-mpegURL",
                        subtitles: data.subtitles || []
                    });
                }
            } catch (e) {}
        }
        
        var hasXData = htmlContent.indexOf('x-data="') !== -1 && 
                       htmlContent.indexOf('player(JSON.parse') !== -1;
        
        var hasVideo = htmlContent.indexOf('<video') !== -1 || 
                       htmlContent.indexOf('.m3u8') !== -1 ||
                       htmlContent.indexOf('player(') !== -1;
        
        var isEmbed = htmlContent.indexOf('iframe') !== -1 && 
                      !hasVideo &&
                      !hasXData;
        
        if (isEmbed) {
            var iframeMatch = htmlContent.match(/<iframe[^>]+src=["']([^"']+)["']/i);
            if (iframeMatch) {
                return JSON.stringify({
                    url: iframeMatch[1],
                    isEmbed: true,
                    headers: {
                        "Referer": "https://123av.com/",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                    }
                });
            }
        }
        
        if (hasXData) {
            var xDataResult = extractPlayerDataFromXData(htmlContent);
            if (xDataResult && xDataResult.iframeUrl) {
                var streamData = fetchStreamDataAdvanced(xDataResult.hashId, xDataResult.poster);
                if (streamData.stream) {
                    return JSON.stringify({
                        url: streamData.stream,
                        isEmbed: false,
                        headers: {
                            "Referer": "https://123av.com/",
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                        },
                        mimeType: "application/x-mpegURL",
                        subtitles: streamData.vtt ? [
                            { lang: "Preview", url: streamData.vtt }
                        ] : []
                    });
                }
            }
        }
        
        var m3u8Match = htmlContent.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/i);
        if (m3u8Match) {
            return JSON.stringify({
                url: m3u8Match[0],
                isEmbed: false,
                headers: {
                    "Referer": "https://123av.com/",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                },
                mimeType: "application/x-mpegURL"
            });
        }
        
        return JSON.stringify({
            url: "",
            isEmbed: false,
            headers: {
                "Referer": "https://123av.com/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        });
        
    } catch (e) {
        toast("Lỗi parseDetailResponse: " + e.message);
        return JSON.stringify({
            url: "",
            isEmbed: false,
            error: true,
            message: e.message
        });
    }
}

// =============================================================================
// EMBED RESPONSE PARSER
// =============================================================================

function parseEmbedResponse(html, sourceUrl) {
    try {
        var iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (iframeMatch) {
            return JSON.stringify({
                url: iframeMatch[1],
                isEmbed: true,
                headers: {
                    "Referer": sourceUrl || "https://123av.com/",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            });
        }
        
        var m3u8Match = html.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/i);
        if (m3u8Match) {
            return JSON.stringify({
                url: m3u8Match[0],
                isEmbed: false,
                mimeType: "application/x-mpegURL",
                headers: {
                    "Referer": sourceUrl || "https://123av.com/",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            });
        }
        
        var videoMatch = html.match(/["'](?:file|src|url)["']\s*:\s*["']([^"']+\.(?:mp4|mkv|m3u8)[^"']*)["']/i);
        if (videoMatch) {
            return JSON.stringify({
                url: videoMatch[1],
                isEmbed: false,
                headers: {
                    "Referer": sourceUrl || "https://123av.com/",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            });
        }
        
        return JSON.stringify({
            url: "",
            isEmbed: false
        });
        
    } catch (e) {
        return JSON.stringify({
            url: "",
            isEmbed: false,
            error: true,
            message: e.message
        });
    }
}

// =============================================================================
// CATEGORIES PARSER
// =============================================================================

function parseCategoriesResponse(html, apiUrl) {
    var categories = [];
    var $doc = _$(html);
    
    $doc.find("a[href*='/genres/']").each(function() {
        var href = this.attr("href");
        if (!href) return;
        
        var slugMatch = href.match(/\/genres\/([^"\/]+)/);
        if (!slugMatch) return;
        
        var name = cleanText(this.text()).replace(/\d+,\d+|\d+/g, '').trim();
        if (!name || name.length < 2) return;
        
        var slug = "vi/genres/" + slugMatch[1];
        
        var exists = false;
        for (var i = 0; i < categories.length; i++) {
            if (categories[i].slug === slug) {
                exists = true;
                break;
            }
        }
        
        if (!exists) {
            categories.push({ 
                name: name, 
                slug: slug 
            });
        }
    });
    
    return JSON.stringify(categories);
}

function parseCountriesResponse(html) { 
    return "[]"; 
}

function parseYearsResponse(html) { 
    return "[]"; 
}

// =============================================================================
// EXPOSE FUNCTIONS
// =============================================================================

var pluginExports = {
    getManifest: getManifest,
    getHomeSections: getHomeSections,
    getPrimaryCategories: getPrimaryCategories,
    getFilterConfig: getFilterConfig,
    getUrlList: getUrlList,
    getUrlSearch: getUrlSearch,
    getUrlDetail: getUrlDetail,
    getUrlCategories: getUrlCategories,
    getUrlCountries: getUrlCountries,
    getUrlYears: getUrlYears,
    parseListResponse: parseListResponse,
    parseSearchResponse: parseSearchResponse,
    parseMovieDetail: parseMovieDetail,
    parseDetailResponse: parseDetailResponse,
    parseEmbedResponse: parseEmbedResponse,
    parseCategoriesResponse: parseCategoriesResponse,
    parseCountriesResponse: parseCountriesResponse,
    parseYearsResponse: parseYearsResponse
};

// =============================================================================
// AUTO-REGISTER
// =============================================================================

if (typeof _vaapp_register !== 'undefined') {
    _vaapp_register(pluginExports);
}

if (typeof window !== 'undefined') {
    for (var key in pluginExports) {
        if (pluginExports.hasOwnProperty(key)) {
            window[key] = pluginExports[key];
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = pluginExports;
}
