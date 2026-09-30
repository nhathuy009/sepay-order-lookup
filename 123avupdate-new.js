// =============================================================================
// 123AV PLUGIN FOR VAAPP - PHƯƠNG ÁN 3 (VAX.LOCAL)
// Version: 5.3.2
// Cập nhật so với 5.3.0:
//   - FIX bug getUrlDetail: App đã tách |data: khỏi slug trước khi gọi,
//     nên chỉ cần check prefix "server-" + có datasend → return "".
//   - Bọc stream + vtt qua vax.local với Referer/Origin cứng
//     = "https://jav-master-52.site/" → mọi segment .ts đều có Referer đúng.
//   - Không phụ thuộc App có propagate headers cho HLS hay không.
//   - 100% fix 403 cho cả master.m3u8, sub-playlist, từng segment .ts, VTT.
// =============================================================================

// =============================================================================
// CONFIGURATION & METADATA
// =============================================================================

function getManifest() {
    return JSON.stringify({
        "id": "123av",
        "name": "123AV",
        "version": "5.3.2",
        "baseUrl": "https://123av.com",
        // ⚠️ BỎ "referrer" — tránh App ghi đè Referer = 123av.com cho media
        "imageReferer": "https://123av.com/",   // Chỉ cho ảnh poster
        "iconUrl": "https://123av.com/assets/123av/favicon.png",
        "isEnabled": true,
        "isAdult": true,
        "type": "VIDEO",
        "layoutType": "HORIZONTAL",
        "playerType": "exoplayer",
        "subtitleCat": true,
        "debug": true,            // Bật để xem log headers thực tế khi test
        "adblock": true
    });
}

function getHomeSections() {
    return JSON.stringify([
        { slug: 'vi/new', title: 'Mới Cập Nhật', type: 'Horizontal', path: '' },
        { slug: 'vi/hot', title: 'Hot & Thịnh Hành', type: 'Horizontal', path: '' },
        { slug: 'vi/recent', title: 'Mới thêm gần đây', type: 'Horizontal', path: '' },
        { slug: 'vi/all?sort=today&type=uncensored-leaked', title: 'Xu hướng (Hôm Nay)', type: 'Horizontal', path: '' },
        { slug: 'vi/all?sort=week&type=uncensored-leaked', title: 'Xu hướng (Tuần Này)', type: 'Horizontal', path: '' }
    ]);
}

function getPrimaryCategories() {
    return JSON.stringify([
        { name: 'Mới cập nhật', slug: 'vi/new' },
        { name: 'Thịnh hành', slug: 'vi/hot' },
        { name: 'Mới thêm gần đây', slug: 'vi/recent' },
        { name: 'Xu hướng (Hôm Nay)', slug: 'vi/all?sort=today&type=uncensored-leaked' },
        { name: 'Xu hướng (Tuần Này)', slug: 'vi/all?sort=week&type=uncensored-leaked' },
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

    getMeta: function(html, property) {
        var regex1 = new RegExp('(?:property|name)=["\']' + property + '["\'][^>]*content=(["\'])(.*?)\\1', 'i');
        var regex2 = new RegExp('content=(["\'])(.*?)\\1[^>]*(?:property|name)=["\']' + property + '["\']', 'i');
        var match = html.match(regex1) || html.match(regex2);
        return match ? match[2] : "";
    },

    normalizeUrl: function(url) {
        if (!url) return "";
        if (url.indexOf('//') === 0) return "https:" + url;
        if (url.indexOf('/') === 0) return "https://123av.com" + url;
        return url;
    },

    extractPreviewUrl: function(itemHtml, $element) {
        var url = "";
        var previewMatch = itemHtml.match(/data-preview="([^"]+)"/);
        if (previewMatch) url = previewMatch[1];
        if (!url && $element) {
            var posterDiv = $element.find(".card__poster, .featured__poster").first();
            if (posterDiv && posterDiv.length > 0) {
                url = posterDiv.attr("data-preview") || "";
            }
        }
        if (!url) {
            var videoMatch = itemHtml.match(/<video[^>]+data-src="([^"]+)"/);
            if (videoMatch) url = videoMatch[1];
        }
        return PluginUtils.normalizeUrl(url);
    },

    detectLanguage: function($element, href, title, cardHtml) {
        if (href && href.indexOf('uncensored') !== -1) return 'Uncensored';
        if (title && title.toLowerCase().indexOf('uncensored') !== -1) return 'Uncensored';
        if ($element && $element.length > 0) {
            var cardClass = $element.attr("class") || "";
            if (cardClass.toLowerCase().indexOf('uncensored') !== -1) return 'Uncensored';
        }
        if (cardHtml && cardHtml.toLowerCase().indexOf('uncensored') !== -1) return 'Uncensored';
        return 'Censored';
    }
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getPipeData(raw) {
    if (!raw) return "";
    var i = raw.indexOf("|");
    if (i < 0) return "";
    var s = raw.substring(i + 1).replace(/^\s+/, "");
    if (s.toLowerCase().indexOf("data:") === 0) s = s.substring(5);
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
            if (/^[a-z0-9_]{6,}$/i.test(pathSegments[i])) return pathSegments[i];
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

function cleanText(text) { return PluginUtils.cleanText(text); }
function getMeta(html, property) { return PluginUtils.getMeta(html, property); }

function getOrigin(url) {
    try {
        var urlObj = new URL(url);
        return urlObj.origin;
    } catch (e) {
        return null;
    }
}

/**
 * Tạo headers tĩnh cho CDN stream (dùng làm fallback + VTT).
 * Referer/Origin = player cha (jav-master-52.site)
 */
function getStreamHeaders(streamUrl, iframeUrl) {
    var headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0",
        "Accept": "*/*",
        "Accept-Language": "vi"
    };
    var playOrigin = iframeUrl ? getOrigin(iframeUrl) : null;
    if (!playOrigin) playOrigin = "https://jav-master-52.site";
    headers["Origin"] = playOrigin;
    headers["Referer"] = playOrigin + "/";
    return headers;
}

/**
 * ⭐ PHƯƠNG ÁN 3: Bọc URL qua vax.local để gắn cứng Referer/Origin.
 * Proxy nội bộ sẽ:
 *   - Gắn Referer/Origin/UA cho request gốc.
 *   - Nếu là M3U8 → tự rewrite mọi segment .ts, sub-playlist, key URI
 *     thành URL vax.local để tất cả đều có Referer đúng.
 *   - Nếu là VTT/SRT → gắn Referer đúng.
 *
 * @param {string} targetUrl - URL gốc cần fetch
 * @param {string} iframeUrl - URL iframe player (để lấy origin)
 * @returns {string} URL đã bọc qua vax.local
 */
function wrapThroughVax(targetUrl, iframeUrl) {
    if (!targetUrl) return "";
    
    var playOrigin = "https://jav-master-52.site";
    if (iframeUrl) {
        var o = getOrigin(iframeUrl);
        if (o) playOrigin = o;
    }
    
    return "https://vax.local/fetch"
        + "?url=" + encodeURIComponent(targetUrl)
        + "&referer=" + encodeURIComponent(playOrigin + "/")
        + "&origin=" + encodeURIComponent(playOrigin)
        + "&ua=" + encodeURIComponent("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0");
}

// =============================================================================
// X-DATA PARSER
// =============================================================================

function extractPlayerDataFromXData(html) {
    try {
        var divPattern = /<div\s+class="watch__main"\s+x-data="([^"]+)"/;
        var divMatch = html.match(divPattern);
        if (!divMatch) return null;

        var xDataContent = divMatch[1];

        var playerPattern = /player\(\s*JSON\.parse\s*\(\s*'([^']*)'\s*\)\s*,\s*(\d+)\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/;
        var playerMatch = xDataContent.match(playerPattern);
        if (!playerMatch) return null;

        var jsonStr = playerMatch[1]
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\\\/g, '\\')
            .replace(/\\\//g, '/');

        jsonStr = jsonStr.replace(/\\u([0-9a-fA-F]{4})/g, function(match, hex) {
            return String.fromCharCode(parseInt(hex, 16));
        });

        var episodeData = JSON.parse(jsonStr);
        if (!Array.isArray(episodeData) || episodeData.length === 0) return null;

        var firstEpisode = episodeData[0];
        var iframeUrl = firstEpisode && firstEpisode.url ? firstEpisode.url : null;
        if (!iframeUrl) return null;

        return {
            episodes: episodeData,
            videoId: parseInt(playerMatch[2]),
            code: playerMatch[3],
            apiBase: playerMatch[4],
            recKey: playerMatch[5],
            iframeUrl: iframeUrl,
            iframeOrigin: getOrigin(iframeUrl),
            hashId: extractHashId(iframeUrl),
            poster: extractPosterFromUrl(iframeUrl)
        };
    } catch (e) {
        return null;
    }
}

// =============================================================================
// STREAM DATA FETCHER
// =============================================================================

function fetchStreamDataAdvanced(hashId, poster, iframeUrl) {
    var result = { stream: null, vtt: null, poster: null, iframeUrl: iframeUrl || null };
    if (!hashId) return result;

    var apiEndpoints = [];

    if (iframeUrl) {
        var iframeOrigin = getOrigin(iframeUrl);
        if (iframeOrigin) apiEndpoints.push(iframeOrigin + '/stream');
    }

    apiEndpoints.push('https://jav-master-52.site/stream');
    apiEndpoints.push('https://javplayer.cc/stream');
    apiEndpoints.push('https://stream.javplayer.cc/stream');

    var uniqueEndpoints = [];
    for (var i = 0; i < apiEndpoints.length; i++) {
        if (uniqueEndpoints.indexOf(apiEndpoints[i]) === -1) {
            uniqueEndpoints.push(apiEndpoints[i]);
        }
    }

    for (var j = 0; j < uniqueEndpoints.length; j++) {
        try {
            var endpoint = uniqueEndpoints[j];
            var url = endpoint + '?id=' + encodeURIComponent(hashId);
            if (poster) url += '&poster=' + encodeURIComponent(poster);

            var apiOrigin = getOrigin(endpoint) || endpoint;

            var response = httpRequest(url, {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "Referer": apiOrigin + "/",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0"
                }
            });

            if (response && response.isSuccessful && response.status === 200) {
                var data = JSON.parse(response.body);
                if (data.status === 'ok' && data.media && data.media.stream) {
                    result.stream = data.media.stream;
                    result.vtt = data.media.vtt || null;
                    result.poster = data.media.poster || poster || null;
                    result.iframeUrl = iframeUrl || (apiOrigin + '/e/' + hashId);
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
// URL GENERATION
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
    var params = ["page=" + page];

    if (filters.type) params.push("type=" + encodeURIComponent(filters.type));
    if (filters.year) params.push("year=" + encodeURIComponent(filters.year));
    if (filters.actress) params.push("actress=" + encodeURIComponent(filters.actress));

    if (filters.sort) {
        var sortMap = {
            'new': 'release_date', 'today': 'today_views',
            'week': 'weekly_views', 'month': 'monthly_views',
            'views': 'total_views', 'rating': 'rating'
        };
        params.push("sort=" + encodeURIComponent(sortMap[filters.sort] || filters.sort));
    }

    if (filters.keyword) params.push("keyword=" + encodeURIComponent(filters.keyword));
    if (filters.genre) params.push("genre=" + encodeURIComponent(filters.genre));
    if (filters.maker) params.push("maker=" + encodeURIComponent(filters.maker));
    if (filters.series) params.push("series=" + encodeURIComponent(filters.series));

    return url + "?" + params.join("&");
}

function getUrlSearch(keyword, filtersJson) {
    var filters = JSON.parse(filtersJson || "{}");
    var page = filters.page || 1;
    var url = "https://123av.com/vi/search?keyword=" + encodeURIComponent(keyword) + "&page=" + page;

    if (filters.sort) {
        var sortMap = {
            'new': 'release_date', 'today': 'today_views',
            'week': 'weekly_views', 'month': 'monthly_views',
            'views': 'total_views'
        };
        url += "&sort=" + (sortMap[filters.sort] || filters.sort);
    }
    if (filters.type) url += "&type=" + encodeURIComponent(filters.type);

    return url;
}

// =============================================================================
// getUrlDetail — FIX BUG: App đã tách |data: khỏi slug
// =============================================================================

function getUrlDetail(slug, datasend) {
    // ⭐ FIX: App đã tách phần |data: ra khỏi slug trước khi gọi getUrlDetail.
    // Vì vậy slug chỉ còn "server-1" (không có |data:), nhưng datasend vẫn có.
    // → Chỉ cần check prefix "server-" + có datasend → return "" để bỏ qua fetch HTTP.

    if (slug && slug.indexOf("server-") === 0) {
        // Có datasend → chắc chắn là marker do parseMovieDetail sinh ra
        if (datasend) return "";

        // Fallback: một số version App có thể truyền nguyên slug có |data:
        if (slug.indexOf("|data:") !== -1) return "";
    }

    // Fallback: nếu slug vẫn còn nguyên |data:
    if (slug && slug.indexOf("|data:") !== -1) {
        var prefix = slug.substring(0, slug.indexOf("|"));
        if (prefix.indexOf("server-") === 0) return "";
    }

    if (datasend) {
        try {
            var data = JSON.parse(datasend);
            if (data && data.id) return datasend;
        } catch (e) {}
    }

    if (slug.indexOf("http") === 0) return slug;
    if (slug.indexOf("vi/v/") === 0) return "https://123av.com/" + slug;
    if (slug.indexOf("/vi/v/") === 0) return "https://123av.com" + slug;
    if (slug.indexOf("v/") === 0) return "https://123av.com/vi/" + slug;
    if (slug.indexOf("/v/") === 0) return "https://123av.com/en" + slug;

    return "https://123av.com/vi/v/" + slug;
}

function getUrlCategories() { return "https://123av.com/vi/genres"; }
function getUrlCountries() { return ""; }
function getUrlYears() { return ""; }

// =============================================================================
// LIST PARSER
// =============================================================================

function parseListResponse(html, apiUrl, datasend) {
    var movies = [];
    var $doc = _$(html);

    var isActressesPage = $doc.find("a[href*='/actresses/']").length > 10 &&
                          html.indexOf('Actresses') !== -1;

    var isAllGenresPage = html.indexOf('/vi/genres/') !== -1 &&
                          html.indexOf('Genres') !== -1 &&
                          html.indexOf('title="Genres"') === -1;

    // === PARSE TRANG DIỄN VIÊN ===
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
                if (movies[i].id === slug) { exists = true; break; }
            }
            if (!exists) {
                movies.push({
                    id: slug, title: name, posterUrl: "", backdropUrl: "",
                    description: "Nữ diễn viên", year: 0, quality: "ACTRESS",
                    episode_current: "", lang: "", previewUrl: ""
                });
            }
        });
        return JSON.stringify({
            items: movies,
            pagination: { currentPage: 1, totalPages: 1, totalItems: movies.length, itemsPerPage: 20 }
        });
    }

    // === PARSE TRANG THỂ LOẠI ===
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
                if (movies[i].id === slug) { exists = true; break; }
            }
            if (!exists) {
                movies.push({
                    id: slug, title: name, posterUrl: "", backdropUrl: "",
                    description: "Thể loại", year: 0, quality: "CAT",
                    episode_current: "", lang: "", previewUrl: ""
                });
            }
        });
        return JSON.stringify({
            items: movies,
            pagination: { currentPage: 1, totalPages: 1, totalItems: movies.length, itemsPerPage: 20 }
        });
    }

    // === PARSE DANH SÁCH PHIM ===
    $doc.find(".card, .featured").each(function() {
        var href = "";
        var slug = "";
        var bodyLink = this.find(".card__body .card__link, .featured__body .card__link").first();
        if (bodyLink && bodyLink.length > 0) {
            href = bodyLink.attr("href") || "";
            var slugMatch = href.match(/\/v\/([^"\/]+)/);
            if (slugMatch) slug = "vi/v/" + slugMatch[1];
        }
        if (!slug) {
            var posterLink = this.find(".card__poster .card__cover, .featured__poster .card__cover").first();
            if (posterLink && posterLink.length > 0) {
                href = posterLink.attr("href") || "";
                var slugMatch2 = href.match(/\/v\/([^"\/]+)/);
                if (slugMatch2) slug = "vi/v/" + slugMatch2[1];
            }
        }
        if (!slug) return;

        var title = "";
        var cardHtml = this.html() || "";

        if (bodyLink && bodyLink.length > 0) title = bodyLink.text().trim();
        if (!title || title === "0" || title.match(/^\d+$/)) {
            var titleEl = this.find(".card__title, .featured__title, h3").first();
            if (titleEl && titleEl.length > 0) title = titleEl.text().trim();
        }
        if (!title || title === "0" || title.match(/^\d+$/)) {
            var bodyEl = this.find(".card__body, .featured__body").first();
            if (bodyEl && bodyEl.length > 0) {
                var bodyText = bodyEl.text().trim();
                var metaIndex = bodyText.lastIndexOf("\n") || bodyText.length;
                title = metaIndex > 0 ? bodyText.substring(0, metaIndex).trim() : bodyText;
            }
        }
        if (!title || title === "0" || title.match(/^\d+$/)) {
            var img = this.find(".card__poster img, .featured__poster img").first();
            if (img && img.length > 0) title = img.attr("alt") || "";
        }
        if (!title || title === "0" || title.match(/^\d+$/)) {
            title = slug.replace("vi/v/", "").replace(/-/g, " ");
        }
        title = cleanText(title);

        var poster = "";
        var posterImg = this.find(".card__poster img, .featured__poster img").first();
        if (posterImg && posterImg.length > 0) {
            poster = posterImg.attr("data-src") || posterImg.attr("src") || "";
            poster = PluginUtils.normalizeUrl(poster);
        }

        var previewUrl = PluginUtils.extractPreviewUrl(cardHtml, this);

        var duration = "";
        var durEl = this.find(".card__dur, .featured__dur").first();
        if (durEl && durEl.length > 0) duration = durEl.text().trim();

        var views = "";
        var viewsEl = this.find(".card__views, .featured__views").first();
        if (viewsEl && viewsEl.length > 0) views = viewsEl.text().trim();

        var lang = PluginUtils.detectLanguage(this, href, title, cardHtml);
        var quality = lang === 'Uncensored' ? "K.K.Duyệt" : "HD";

        var description = "";
        if (duration) description += "⏱ " + duration;
        if (views) description += (description ? " | " : "") + "👁 " + views;

        movies.push({
            id: slug, title: title, posterUrl: poster, backdropUrl: poster,
            description: description, year: 0, quality: quality,
            episode_current: duration || "Full", lang: lang, previewUrl: previewUrl
        });
    });

    // === PAGINATION ===
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
// MOVIE DETAIL PARSER — Đóng gói stream + vtt + iframeUrl vào marker
// =============================================================================

function parseMovieDetail(htmlContent, apiUrl, datasend) {
    try {
        // === 1. ƯU TIÊN DATASEND ===
        if (datasend) {
            try {
                var detailData = JSON.parse(datasend);
                if (detailData && detailData.servers) return JSON.stringify(detailData);
            } catch (e) {}
        }

        // === 2. THỬ X-DATA ===
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
            title = getMeta(htmlContent, "og:title") || xDataResult.code || '';
            thumb = getMeta(htmlContent, "og:image") || xDataResult.poster || '';
            desc = getMeta(htmlContent, "og:description") || '';

            var previewMatch = htmlContent.match(/<video[^>]+data-src="([^"]+)"/);
            if (previewMatch) previewUrl = previewMatch[1];
            if (!previewUrl) {
                var previewDivMatch = htmlContent.match(/<div[^>]+data-preview="([^"]+)"/);
                if (previewDivMatch) previewUrl = previewDivMatch[1];
            }
            if (!previewUrl && thumb) previewUrl = thumb.replace('/cover.jpg', '/preview.png');
            previewUrl = PluginUtils.normalizeUrl(previewUrl);

            // Lấy stream từ API
            var streamData = fetchStreamDataAdvanced(
                xDataResult.hashId,
                xDataResult.poster,
                xDataResult.iframeUrl
            );

            if (streamData.stream) {
                // Đóng gói ĐẦY ĐỦ: stream + vtt + iframeUrl
                var episodePayload = JSON.stringify({
                    stream: streamData.stream,
                    vtt: streamData.vtt || "",
                    iframeUrl: xDataResult.iframeUrl
                });

                servers.push({
                    name: "123AV Play",
                    episodes: [{
                        id: "server-1|data:" + encodeURIComponent(episodePayload),
                        name: "Server HD #1",
                        slug: "server-1"
                    }]
                });
            }

            var $doc = _$(htmlContent);

            $doc.find("a[href*='/actresses/']").each(function() {
                var name = cleanText(this.text());
                if (name && actors.indexOf(name) === -1) actors.push(name);
            });
            $doc.find("a[href*='/genres/']").each(function() {
                var name = cleanText(this.text());
                if (name && genres.indexOf(name) === -1) genres.push(name);
            });

            var yearMatch = htmlContent.match(/<dt>Release date<\/dt>\s*<dd>([^<]+)<\/dd>/i);
            if (yearMatch) {
                var yr = parseInt(yearMatch[1].substring(0, 4));
                if (yr) year = yr;
            }
            var dirMatch = htmlContent.match(/<dt>Maker<\/dt>\s*<dd>[\s\S]*?href="[^"]*">([^<]+)<\/a>/i);
            if (dirMatch) director = cleanText(dirMatch[1]);

            var canonicalMatch = htmlContent.match(/<link\s+rel="canonical"\s+href="https:\/\/123av\.com\/[^"\/]+\/v\/([^"]+)"/i);
            if (canonicalMatch) slug = canonicalMatch[1];

            return JSON.stringify({
                id: slug,
                title: cleanText(title),
                posterUrl: thumb,
                backdropUrl: thumb,
                description: cleanText(desc),
                year: year, rating: 0, quality: "HD",
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

        // === 3. FALLBACK ===
        var title = getMeta(htmlContent, "og:title") || "";
        var thumb = getMeta(htmlContent, "og:image") || "";
        var desc = getMeta(htmlContent, "og:description") || "";

        var coverMatch = htmlContent.match(/style="background-image:url\(['"]?([^'")]+cover\.jpg[^'")]+)['"]?\)"/i) ||
                         htmlContent.match(/background-image:url\(['"]?([^'")]+cover\.jpg[^'")]+)['"]?\)/i) ||
                         htmlContent.match(/src="([^"]+cover\.jpg[^"]*)"/i);
        if (coverMatch) {
            thumb = coverMatch[1];
        } else if (thumb.indexOf("logo-square.png") !== -1 || thumb.indexOf("logo") !== -1) {
            var coverGenericMatch = htmlContent.match(/https?:\/\/[^\s"'><]+?\/cover\.jpg[^\s"'><]*/i);
            if (coverGenericMatch) thumb = coverGenericMatch[0];
        }

        var previewUrl = "";
        var previewMatch = htmlContent.match(/<video[^>]+data-src="([^"]+)"/);
        if (previewMatch) previewUrl = previewMatch[1];
        if (!previewUrl) {
            var previewDivMatch = htmlContent.match(/<div[^>]+data-preview="([^"]+)"/);
            if (previewDivMatch) previewUrl = previewDivMatch[1];
        }
        if (!previewUrl && thumb) previewUrl = thumb.replace('/cover.jpg', '/preview.png');
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
                    var streamData = fetchStreamDataAdvanced(hashId, poster, rawUrl);
                    if (streamData.stream) {
                        m3u8Url = streamData.stream;
                        vttUrl = streamData.vtt || "";
                    }
                }

                var epPayload = JSON.stringify({
                    stream: m3u8Url,
                    vtt: vttUrl,
                    iframeUrl: rawUrl
                });

                episodes.push({
                    id: "server-" + (i + 1) + "|data:" + encodeURIComponent(epPayload),
                    name: "Server HD #" + (item.name || (i + 1)),
                    slug: "server-" + (i + 1)
                });
            }

            if (episodes.length > 0) {
                servers.push({ name: "123AV Play", episodes: episodes });
            }
        }

        var slug = "";
        var canonicalMatch = htmlContent.match(/<link\s+rel="canonical"\s+href="https:\/\/123av\.com\/[^"\/]+\/v\/([^"]+)"/i);
        if (canonicalMatch) slug = canonicalMatch[1];

        return JSON.stringify({
            id: slug, title: cleanText(title), posterUrl: thumb, backdropUrl: thumb,
            description: cleanText(desc), year: year, rating: 0, quality: "HD",
            servers: servers,
            episode_current: servers.length > 0 ? "Full" : "No Source",
            lang: htmlContent.indexOf('uncensored') !== -1 ? 'Uncensored' : 'Censored',
            category: genres.join(", "), country: "Japan",
            director: director, casts: actors.join(", "), previewUrl: previewUrl
        });

    } catch (e) {
        toast("Lỗi parseMovieDetail: " + e.message);
        return JSON.stringify({ error: true, message: e.message });
    }
}

// =============================================================================
// DETAIL RESPONSE PARSER — PHƯƠNG ÁN 3: Bọc stream + vtt qua vax.local
// =============================================================================

function parseDetailResponse(htmlContent, apiUrl, datasend) {
    try {
        // ⭐ ƯU TIÊN: Đọc từ datasend hoặc |data: trong apiUrl
        var raw = datasend || getPipeData(apiUrl);
        if (raw) {
            try {
                // Decode an toàn (datasend có thể đã bị encodeURIComponent)
                var decoded = raw;
                try { decoded = decodeURIComponent(raw); } catch (e) { decoded = raw; }

                var data = JSON.parse(decoded);
                if (data && data.stream) {
                    // ⭐ PHƯƠNG ÁN 3: Bọc stream + vtt qua vax.local
                    // → Referer/Origin gắn cứng = player cha
                    // → Mọi segment .ts tự động có Referer đúng (proxy rewrite M3U8)
                    var proxyStream = wrapThroughVax(data.stream, data.iframeUrl);
                    var proxyVtt = data.vtt ? wrapThroughVax(data.vtt, data.iframeUrl) : "";

                    console.log("[123AV] Stream gốc:", data.stream);
                    console.log("[123AV] iframeUrl:", data.iframeUrl);
                    console.log("[123AV] Stream qua proxy:", proxyStream);
                    if (proxyVtt) console.log("[123AV] VTT qua proxy:", proxyVtt);

                    var subs = [];
                    if (proxyVtt) {
                        subs.push({ lang: "Preview", url: proxyVtt });
                    }

                    return JSON.stringify({
                        url: proxyStream,
                        isEmbed: false,
                        mimeType: "application/x-mpegURL",
                        subtitles: subs
                        // Không cần headers nữa — vax.local đã gắn cứng
                    });
                }
            } catch (e) {
                console.log("[123AV] Lỗi parse datasend: " + e.message);
            }
        }

        // ⭐ FALLBACK: datasend chứa URL trực tiếp (không phải marker)
        if (datasend) {
            try {
                var data2 = JSON.parse(datasend);
                if (data2 && data2.url) {
                    var proxyUrl = wrapThroughVax(data2.url, data2.iframeUrl);
                    return JSON.stringify({
                        url: proxyUrl,
                        isEmbed: false,
                        mimeType: data2.mimeType || "application/x-mpegURL"
                    });
                }
            } catch (e) {}
        }

        // ⭐ FALLBACK: Parse HTML (nếu App vẫn fetch HTTP vì lý do nào đó)
        var hasXData = htmlContent.indexOf('x-data="') !== -1 &&
                       htmlContent.indexOf('player(JSON.parse') !== -1;
        var hasVideo = htmlContent.indexOf('<video') !== -1 ||
                       htmlContent.indexOf('.m3u8') !== -1 ||
                       htmlContent.indexOf('player(') !== -1;
        var isEmbed = htmlContent.indexOf('iframe') !== -1 && !hasVideo && !hasXData;

        if (isEmbed) {
            var iframeMatch = htmlContent.match(/<iframe[^>]+src=["']([^"']+)["']/i);
            if (iframeMatch) {
                return JSON.stringify({
                    url: iframeMatch[1],
                    isEmbed: true,
                    headers: getStreamHeaders(iframeMatch[1], iframeMatch[1])
                });
            }
        }

        if (hasXData) {
            var xDataResult = extractPlayerDataFromXData(htmlContent);
            if (xDataResult && xDataResult.iframeUrl) {
                var streamData = fetchStreamDataAdvanced(
                    xDataResult.hashId, xDataResult.poster, xDataResult.iframeUrl
                );
                if (streamData.stream) {
                    var proxyStream2 = wrapThroughVax(streamData.stream, xDataResult.iframeUrl);
                    var proxyVtt2 = streamData.vtt ? wrapThroughVax(streamData.vtt, xDataResult.iframeUrl) : "";
                    var subs2 = proxyVtt2 ? [{ lang: "Preview", url: proxyVtt2 }] : [];
                    return JSON.stringify({
                        url: proxyStream2,
                        isEmbed: false,
                        mimeType: "application/x-mpegURL",
                        subtitles: subs2
                    });
                }
            }
        }

        var m3u8Match = htmlContent.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/i);
        if (m3u8Match) {
            return JSON.stringify({
                url: wrapThroughVax(m3u8Match[0], null),
                isEmbed: false,
                mimeType: "application/x-mpegURL"
            });
        }

        return JSON.stringify({ url: "", isEmbed: false });

    } catch (e) {
        toast("Lỗi parseDetailResponse: " + e.message);
        return JSON.stringify({ url: "", isEmbed: false, error: true, message: e.message });
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
                headers: getStreamHeaders(iframeMatch[1], sourceUrl)
            });
        }

        var m3u8Match = html.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/i);
        if (m3u8Match) {
            return JSON.stringify({
                url: wrapThroughVax(m3u8Match[0], sourceUrl),
                isEmbed: false,
                mimeType: "application/x-mpegURL"
            });
        }

        var videoMatch = html.match(/["'](?:file|src|url)["']\s*:\s*["']([^"']+\.(?:mp4|mkv|m3u8)[^"']*)["']/i);
        if (videoMatch) {
            return JSON.stringify({
                url: wrapThroughVax(videoMatch[1], sourceUrl),
                isEmbed: false
            });
        }

        return JSON.stringify({ url: "", isEmbed: false });
    } catch (e) {
        return JSON.stringify({ url: "", isEmbed: false, error: true, message: e.message });
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
            if (categories[i].slug === slug) { exists = true; break; }
        }
        if (!exists) categories.push({ name: name, slug: slug });
    });

    return JSON.stringify(categories);
}

function parseCountriesResponse(html) { return "[]"; }
function parseYearsResponse(html) { return "[]"; }

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
