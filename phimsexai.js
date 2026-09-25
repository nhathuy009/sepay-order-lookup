// =============================================================================
// PHIMSEXAI PLUGIN FOR VAAPP
// Version: 6.5.1 - FIX 302 REDIRECT + IFRAME HEADERS
// Base: https://phimsexai.xyz
//
// CHANGELOG v6.5.1:
//   [FIX] fetchUrl(url, sourceUrl): nhận sourceUrl làm Referer đúng path,
//         giúp bypass kiểm tra Referer của server /player/<id>.
//   [FIX] Thêm header giả lập iframe khi fetch /player/<id>:
//         Accept, Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site,
//         Upgrade-Insecure-Requests.
//   [FIX] parseDetailResponse(): truyền apiUrl (URL trang chi tiết) vào
//         fetchUrl thay vì dùng getBase() + "/".
//   [ADD] fetchUrl(): fallback thử /?p=<id> nếu /player/<id> trả 302.
//   [ADD] debugLog chi tiết header gửi đi khi debug=true.
//
// CHANGELOG v6.5.0:
//   [FIX] Domain: phimsexai.site -> phimsexai.xyz (DEFAULT_BASE + LEGACY_HOSTS)
//   [FIX] findEmbedUrl(): XÓA Strategy 4 (/player/<id>) vì server trả 302.
//   [FIX] parseEpisodeDetail(): fallback data-poster + <title> khi thiếu og:*.
//   [FIX] parseMovieDetail(): nhận diện PLAYER, trích stream trực tiếp.
//   [FIX] fetchUrl(): không theo redirect, kiểm tra HTML hợp lệ trước khi cache.
//   [FIX] tabRegex: không phụ thuộc thứ tự attribute.
//   [FIX] extractStreamFromPlayer(): trả về MẢNG servers để App fallback.
//   [FIX] mimeType: ưu tiên URL gốc thay vì URL resolve.
// =============================================================================

// =============================================================================
// CONFIGURATION & METADATA
// =============================================================================

var DEFAULT_BASE = "https://phimsexai.xyz";
var LEGACY_HOSTS = ["phimsexai.site", "phimsexai.com", "phimsexai.net"];

var DEFAULT_UA = "Mozilla/5.0 (Linux; Android 14; PGT-AN00) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36";

function getManifest() {
    return JSON.stringify({
        "id": "phimsexai",
        "name": "Phim Sex AI",
        "version": "6.5.1",
        "baseUrl": DEFAULT_BASE,
        "fallbackUrls": [],
        "referrer": DEFAULT_BASE + "/",
        "imageReferer": DEFAULT_BASE + "/",
        "iconUrl": DEFAULT_BASE + "/wp-content/uploads/cropped-icon-192x192.jpg",
        "isEnabled": true,
        "isAdult": true,
        "type": "MOVIE",
        "layoutType": "HORIZONTAL",
        "playerType": "exoplayer",
        "subtitleCat": false,
        "debug": true,
        "adblock": false
    });
}

function getHomeSections() {
    return JSON.stringify([
        { slug: 'home', title: 'Trang Chủ', type: 'Horizontal', path: '' },
        { slug: 'phim-sex-ai-vietsub', title: 'Sex AI Vietsub', type: 'Horizontal', path: '' },
        { slug: 'phim-sex-ai-thuyet-minh', title: 'Sex AI Thuyết Minh', type: 'Horizontal', path: '' },
        { slug: 'phim-bo-sex-ai-nhieu-tap', title: 'Phim Bộ', type: 'Horizontal', path: '' },
        { slug: 'phim-le-sex-ai-hay', title: 'Phim Lẻ', type: 'Horizontal', path: '' }
    ]);
}

function getPrimaryCategories() {
    return JSON.stringify([
        { name: 'Trang chủ', slug: 'home' },
        { name: 'Phim Sex', slug: 'phim-sex' },
        { name: 'Sex AI Vietsub', slug: 'phim-sex-ai-vietsub' },
        { name: 'Sex AI Thuyết Minh', slug: 'phim-sex-ai-thuyet-minh' },
        { name: 'Phim Bộ', slug: 'phim-bo-sex-ai-nhieu-tap' },
        { name: 'Phim Lẻ', slug: 'phim-le-sex-ai-hay' }
    ]);
}

function getFilterConfig() {
    return JSON.stringify({
        sort: [{ name: 'Mới nhất', value: 'new' }],
        category: [
            { name: "Trang chủ", value: "home" },
            { name: "Phim Sex", value: "phim-sex" },
            { name: "Sex AI Vietsub", value: "phim-sex-ai-vietsub" },
            { name: "Sex AI Thuyết Minh", value: "phim-sex-ai-thuyet-minh" },
            { name: "Phim Bộ", value: "phim-bo-sex-ai-nhieu-tap" },
            { name: "Phim Lẻ", value: "phim-le-sex-ai-hay" }
        ]
    });
}

// =============================================================================
// ACTIVE BASE URL
// =============================================================================

var _cachedBase = null;
var _activeBase = null;

function setActiveBase(url) {
    if (!url) return;
    var m = String(url).match(/^https?:\/\/[^\/]+/i);
    if (m && m[0]) _activeBase = m[0];
}

function getBase() {
    if (_activeBase) return _activeBase;

    if (!_cachedBase) {
        try {
            var m = JSON.parse(getManifest());
            _cachedBase = (m.baseUrl || DEFAULT_BASE);
        } catch (e) {
            _cachedBase = DEFAULT_BASE;
        }
        if (_cachedBase.charAt(_cachedBase.length - 1) === "/") {
            _cachedBase = _cachedBase.substring(0, _cachedBase.length - 1);
        }
    }
    return _cachedBase;
}

// =============================================================================
// DEBUG LOG
// =============================================================================

function debugLog() {
    try {
        var m = JSON.parse(getManifest());
        if (!m.debug) return;
        var args = Array.prototype.slice.call(arguments);
        args.unshift("[phimsexai]");
        if (typeof console !== "undefined" && console.log) {
            console.log.apply(console, args);
        }
    } catch (e) {}
}

// =============================================================================
// URL NORMALIZATION
// =============================================================================

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeUrl(url) {
    if (!url) return url;

    var s = String(url);
    var activeHost = _activeBase
        ? _activeBase.replace(/^https?:\/\//, "")
        : DEFAULT_BASE.replace(/^https?:\/\//, "");

    var defaultHost = DEFAULT_BASE.replace(/^https?:\/\//, "");
    if (defaultHost !== activeHost) {
        var re = new RegExp("\\/\\/" + escapeRegex(defaultHost) + "(?=[\\/\\:?#]|$)", "gi");
        s = s.replace(re, "//" + activeHost);
    }

    for (var i = 0; i < LEGACY_HOSTS.length; i++) {
        var legacyHost = LEGACY_HOSTS[i];
        if (legacyHost === activeHost) continue;
        var reLegacy = new RegExp("\\/\\/" + escapeRegex(legacyHost) + "(?=[\\/\\:?#]|$)", "gi");
        s = s.replace(reLegacy, "//" + activeHost);
    }

    return s;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

var U = {
    clean: function(text) {
        if (!text) return "";
        return text.replace(/<[^>]*>/g, "")
            .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'").replace(/&#8211;/g, "-")
            .replace(/&#8217;/g, "'").replace(/&hellip;/g, "...")
            .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
            .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    },

    meta: function(html, prop) {
        var r1 = new RegExp('(?:property|name)=["\']' + prop + '["\'][^>]*content=(["\'])(.*?)\\1', 'i');
        var r2 = new RegExp('content=(["\'])(.*?)\\1[^>]*(?:property|name)=["\']' + prop + '["\']', 'i');
        var m = html.match(r1) || html.match(r2);
        return m ? m[2] : "";
    },

    pageTitle: function(html) {
        var m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (!m) return "";
        return U.clean(m[1])
            .replace(/\s*-\s*Player\s*$/i, "")
            .replace(/\s*-\s*Phim Sex AI\s*$/i, "")
            .trim();
    },

    dataPoster: function(html) {
        var m = html.match(/data-poster=["']([^"']+)["']/i);
        return m ? m[1] : "";
    },

    url: function(u) {
        if (!u) return "";
        var s = String(u);
        if (s.indexOf('//') === 0) return "https:" + normalizeUrl(s);
        if (s.indexOf('/') === 0) return getBase() + s;
        return normalizeUrl(s);
    },

    slug: function(u) {
        if (!u) return "";
        var s = u.replace(/^https?:\/\/[^\/]+/, "");
        if (s.indexOf("/") === 0) s = s.substring(1);
        if (s.lastIndexOf("/") === s.length - 1) s = s.substring(0, s.length - 1);
        return s;
    },

    duration: function(iso) {
        if (!iso) return "";
        var m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!m) return "";
        var h = parseInt(m[1] || 0), min = parseInt(m[2] || 0), s = parseInt(m[3] || 0);
        if (h > 0) return h + ":" + String(min).padStart(2, "0") + ":" + String(s).padStart(2, "0");
        return min + ":" + String(s).padStart(2, "0");
    },

    btoa: function(str) {
        try {
            if (typeof BASE64 !== 'undefined' && BASE64 && typeof BASE64.encode === 'function') {
                return BASE64.encode(str)
                    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            }
            return btoa(unescape(encodeURIComponent(str)))
                .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        } catch (e) { return ""; }
    },

    isStream: function(u) {
        if (!u) return false;
        return u.indexOf(".m3u8") !== -1 || u.indexOf(".mp4") !== -1 || u.indexOf(".webm") !== -1;
    },

    mime: function(u) {
        if (!u) return "video/mp4";
        if (u.indexOf(".m3u8") !== -1) return "application/x-mpegURL";
        if (u.indexOf(".mp4") !== -1) return "video/mp4";
        if (u.indexOf(".webm") !== -1) return "video/webm";
        return "video/mp4";
    },

    type: function(u) {
        if (!u) return "unknown";
        if (u.indexOf(".m3u8") !== -1) return "HLS";
        if (u.indexOf(".mp4") !== -1) return "MP4";
        if (u.indexOf(".webm") !== -1) return "WebM";
        return "Embed";
    },

    // ⭐ [v6.5.1] Chuẩn hóa URL để làm Referer (bỏ trailing slash nếu cần)
    referer: function(u) {
        if (!u) return getBase() + "/";
        var s = String(u);
        // Nếu là URL trang chi tiết → dùng nguyên
        if (s.indexOf("/player/") === -1 && s.indexOf("/?p=") === -1) return s;
        // Nếu là /player/<id> hoặc /?p=<id> → dùng base
        return getBase() + "/";
    }
};

// =============================================================================
// HTTP CACHE + FETCH
// ⭐ [v6.5.1] fetchUrl nhận sourceUrl để làm Referer + giả lập iframe header
// =============================================================================

var __httpCache = {};

var ALLOWED_HOST_REGEX = /(abyss\.to|abysscdn\.com|ok\.ru|streamtape\.com|dood\.|doodstream|ds2play|streamsb|streamhide|voe\.sx|mixdrop|filemoon|mp4upload|player\.|embed\.|cdn\.|video\.|stream\.|hls\.|\.m3u8|googlevideo\.com|blogspot\.com|googleusercontent\.com)/i;

function isAllowedFetchUrl(url) {
    if (!url) return false;

    if (_activeBase) {
        var activeHost = _activeBase.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        if (activeHost && url.indexOf(activeHost) !== -1) return true;
    }

    try {
        var baseHost = getBase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        if (baseHost && url.indexOf(baseHost) !== -1) return true;
    } catch (e) {}

    return ALLOWED_HOST_REGEX.test(url);
}

// ⭐ [v6.5.1] Xây dựng header thông minh dựa trên loại URL
function buildHeaders(url, sourceUrl) {
    var isPlayerUrl = url.indexOf("/player/") !== -1;
    var referer = sourceUrl ? U.referer(sourceUrl) : (getBase() + "/");

    var headers = {
        "Referer": referer,
        "User-Agent": DEFAULT_UA,
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
    };

    if (isPlayerUrl) {
        // ⭐ [v6.5.1] Giả lập request iframe từ browser
        headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";
        headers["Sec-Fetch-Dest"] = "iframe";
        headers["Sec-Fetch-Mode"] = "navigate";
        headers["Sec-Fetch-Site"] = "same-origin";
        headers["Upgrade-Insecure-Requests"] = "1";
    } else {
        headers["Accept"] = "*/*";
    }

    return headers;
}

// ⭐ [v6.5.1] Fetch với fallback /?p=<id> khi /player/<id> bị 302
function fetchUrl(url, sourceUrl) {
    if (!url || typeof httpRequest === "undefined") return null;

    url = normalizeUrl(url);

    if (!isAllowedFetchUrl(url)) {
        debugLog("fetchUrl: blocked by whitelist", url);
        return null;
    }

    // Cache check
    if (__httpCache[url]) {
        if ((Date.now() - __httpCache[url].time) < 300000) {
            return __httpCache[url].data;
        }
        delete __httpCache[url];
    }

    var headers = buildHeaders(url, sourceUrl);
    debugLog("fetchUrl:", url);
    debugLog("  referer:", headers["Referer"]);
    debugLog("  sec-fetch-dest:", headers["Sec-Fetch-Dest"] || "(none)");

    try {
        var resp = httpRequest(url, {
            method: "GET",
            headers: headers
        });

        // ⭐ Nếu vẫn 302 → thử fallback /?p=<id> (nếu URL là /player/<id>)
        if (resp && (resp.status === 301 || resp.status === 302 || resp.status === 303 || resp.status === 307 || resp.status === 308)) {
            debugLog("fetchUrl: redirect", resp.status, "from", url);

            var playerMatch = url.match(/\/player\/(\d+)/);
            if (playerMatch) {
                var postId = playerMatch[1];
                var fallbackUrl = getBase() + "/?p=" + postId;
                debugLog("fetchUrl: fallback →", fallbackUrl);

                try {
                    var resp2 = httpRequest(fallbackUrl, {
                        method: "GET",
                        headers: buildHeaders(fallbackUrl, sourceUrl)
                    });
                    if (resp2 && resp2.status === 200 && resp2.body) {
                        // Trang /?p=<id> là trang chi tiết — cần tìm iframe trong đó
                        if (resp2.body.indexOf("okplayer-frame") !== -1 ||
                            resp2.body.indexOf("cvp-tab-pane") !== -1) {
                            __httpCache[fallbackUrl] = { data: resp2.body, time: Date.now() };
                            return resp2.body;
                        }
                    }
                } catch (e) {
                    debugLog("fetchUrl fallback error:", e.message || e);
                }
            }

            return null;
        }

        if (resp && resp.status === 200 && resp.body) {
            var isPlayer = resp.body.indexOf("cvp-tab-pane") !== -1;
            var isDetail = resp.body.indexOf("okplayer-frame") !== -1 ||
                           resp.body.indexOf("single-post-container") !== -1;
            if (!isPlayer && !isDetail) {
                debugLog("fetchUrl: HTML không phải player/detail, bỏ qua", url);
                return null;
            }
            __httpCache[url] = { data: resp.body, time: Date.now() };
            return resp.body;
        }
    } catch (e) {
        debugLog("fetchUrl error:", e.message || e);
    }

    return null;
}

// =============================================================================
// URL GENERATION
// =============================================================================

function getUrlList(slug, filtersJson) {
    var filters = JSON.parse(filtersJson || "{}");
    var page = filters.page || 1;
    var path = slug || "";
    var base = getBase();

    if ((path === "home" || path === "") && page === 1) return base + "/";
    if (path === "home" || path === "") return base + "/page/" + page + "/";
    if (path.indexOf("/") === 0) path = path.substring(1);
    return page === 1 ? base + "/" + path + "/" : base + "/" + path + "/page/" + page + "/";
}

function getUrlSearch(keyword, filtersJson) {
    var filters = JSON.parse(filtersJson || "{}");
    var page = filters.page || 1;
    var base = getBase();
    return page === 1
        ? base + "/?s=" + encodeURIComponent(keyword)
        : base + "/page/" + page + "/?s=" + encodeURIComponent(keyword);
}

function getUrlDetail(slug, datasend) {
    if (!slug) return "";
    if (slug.indexOf("http") === 0) return normalizeUrl(slug);
    if (slug.indexOf("/") === 0) return getBase() + slug;
    return getBase() + "/" + slug + "/";
}

function getUrlCategories() { return getBase() + "/"; }
function getUrlCountries() { return ""; }
function getUrlYears() { return ""; }

// =============================================================================
// PAGE TYPE DETECTION
// =============================================================================

function detectPageType(html) {
    if (!html) return "UNKNOWN";

    if (html.indexOf("cvp-tab-pane") !== -1 && html.indexOf("data-link") !== -1) {
        return "PLAYER";
    }

    if (html.indexOf("archive-header") !== -1 &&
        html.indexOf("organic-masonry-grid video-list") !== -1 &&
        html.indexOf("episode-label") !== -1) {
        return "SERIES_ARCHIVE";
    }

    if (html.indexOf("okplayer-frame") !== -1 ||
        html.indexOf("single-post-container") !== -1) {
        return "EPISODE_DETAIL";
    }

    return "UNKNOWN";
}

// =============================================================================
// HELPER: Find embed URL
// ⭐ [v6.5.1] Strategy 1 giữ nguyên, nhưng parseDetailResponse sẽ fallback
// =============================================================================

function findEmbedUrl(html) {
    if (!html) return "";
    var embedUrl = "";

    // Strategy 1: Schema VideoObject
    var schemaMatch = html.match(/"embedUrl"\s*:\s*"([^"]+)"/i);
    if (schemaMatch) embedUrl = schemaMatch[1].replace(/\\\//g, "/");

    // Strategy 2: iframe okplayer-frame
    if (!embedUrl) {
        var iframeMatch = html.match(/<iframe[^>]*id=["']okplayer-frame["'][^>]*>/i);
        if (iframeMatch) {
            var srcMatch = iframeMatch[0].match(/src=["']([^"']+)["']/i);
            if (srcMatch) embedUrl = srcMatch[1].replace(/\\\//g, "/");
        }
    }

    // Strategy 3: Bất kỳ iframe /player/ hoặc /embed/
    if (!embedUrl) {
        var playerIframeMatch = html.match(/<iframe[^>]+src=["']([^"']*(?:\/player\/|\/embed\/)[^"']+)["']/i);
        if (playerIframeMatch) embedUrl = playerIframeMatch[1].replace(/\\\//g, "/");
    }

    if (embedUrl && embedUrl.indexOf("//") === 0) embedUrl = "https:" + embedUrl;

    return normalizeUrl(embedUrl);
}

// =============================================================================
// HELPER: Extract streams from Player HTML
// =============================================================================

function extractAllStreamsFromPlayer(playerHtml) {
    if (!playerHtml) return [];

    var allLinks = [];
    var match;

    var tabRegex = /<div[^>]+id="(cvp-tab-\d+)"[^>]*?data-link="([^"]+)"/gi;
    while ((match = tabRegex.exec(playerHtml)) !== null) {
        var num = parseInt(match[1].replace("cvp-tab-", ""));
        allLinks.push({ num: num, url: normalizeUrl(match[2].replace(/\\\//g, "/")) });
    }

    if (allLinks.length === 0) {
        var idx = 0;
        var regex2 = /data-link="([^"]+)"/gi;
        while ((match = regex2.exec(playerHtml)) !== null) {
            idx++;
            allLinks.push({ num: idx, url: normalizeUrl(match[1].replace(/\\\//g, "/")) });
        }
    }

    if (allLinks.length === 0) {
        var m3u8Match = playerHtml.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/i);
        if (m3u8Match) {
            allLinks.push({ num: 1, url: normalizeUrl(m3u8Match[0].replace(/\\\//g, "/")) });
        }
    }

    var streamLinks = [];
    for (var i = 0; i < allLinks.length; i++) {
        if (U.isStream(allLinks[i].url)) {
            streamLinks.push(allLinks[i]);
        }
    }

    if (streamLinks.length === 0) return [];

    streamLinks.sort(function(a, b) {
        var aM3u8 = a.url.indexOf(".m3u8") !== -1 ? 0 : 1;
        var bM3u8 = b.url.indexOf(".m3u8") !== -1 ? 0 : 1;
        if (aM3u8 !== bM3u8) return aM3u8 - bM3u8;
        return a.num - b.num;
    });

    var servers = [];
    for (var j = 0; j < streamLinks.length; j++) {
        var link = streamLinks[j];
        var resolvedUrl = link.url;

        try {
            var encodedUrl = U.btoa(link.url);
            if (encodedUrl) {
                var apiUrl = getBase() + "/get-video?url=" + encodedUrl;
                var resp = httpRequest(apiUrl, {
                    method: "GET",
                    headers: {
                        "Referer": getBase() + "/",
                        "User-Agent": DEFAULT_UA
                    }
                });
                if (resp && resp.status === 200 && resp.body) {
                    try {
                        var data = JSON.parse(resp.body);
                        if (data && data.status === "success" && data.video_url) {
                            if (U.isStream(data.video_url)) {
                                resolvedUrl = normalizeUrl(data.video_url);
                            }
                        }
                    } catch (e) {
                        debugLog("get-video parse error:", e.message || e);
                    }
                }
            }
        } catch (e) {
            debugLog("get-video call error:", e.message || e);
        }

        servers.push({
            url: resolvedUrl,
            originalUrl: link.url,
            mimeType: U.mime(link.url) || U.mime(resolvedUrl),
            serverNum: link.num,
            serverLabel: "SV " + link.num + " (" + U.type(link.url) + ")"
        });
    }

    return servers;
}

function extractStreamFromPlayer(playerHtml) {
    var servers = extractAllStreamsFromPlayer(playerHtml);
    if (servers.length === 0) return null;
    return servers[0];
}

// =============================================================================
// HELPER: Build stream response
// =============================================================================

function buildStreamResponse(servers) {
    if (!servers || servers.length === 0) {
        return JSON.stringify({
            url: "",
            isEmbed: false,
            error: true,
            message: "Không tìm thấy stream URL"
        });
    }

    var best = servers[0];
    var response = {
        url: best.url,
        isEmbed: false,
        mimeType: best.mimeType,
        headers: {
            "Referer": getBase() + "/",
            "User-Agent": DEFAULT_UA
        },
        subtitles: []
    };

    if (servers.length > 1) {
        response.servers = servers.map(function(s) {
            return {
                url: s.url,
                mimeType: s.mimeType,
                label: s.serverLabel,
                headers: {
                    "Referer": getBase() + "/",
                    "User-Agent": DEFAULT_UA
                }
            };
        });
    }

    return JSON.stringify(response);
}

// =============================================================================
// HELPER: Parse Series Archive
// =============================================================================

function parseSeriesArchive(html) {
    var result = {
        id: "",
        title: "",
        posterUrl: "",
        backdropUrl: "",
        description: "",
        year: 0,
        rating: 0,
        quality: "SERIES",
        servers: [],
        episode_current: "",
        lang: "Vietsub",
        category: "",
        country: "",
        director: "",
        casts: "",
        previewUrl: ""
    };

    var title = U.meta(html, "og:title") || U.pageTitle(html);
    var poster = U.meta(html, "og:image") || U.dataPoster(html);
    var desc = U.meta(html, "og:description");

    if (title) title = title.replace(/\s*-\s*Phim Sex AI\s*$/i, "").trim();

    var slug = "";
    var canonicalMatch = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
    if (canonicalMatch) slug = U.slug(canonicalMatch[1]);

    result.id = slug;
    result.title = title;
    result.posterUrl = U.url(poster);
    result.backdropUrl = U.url(poster);
    result.description = U.clean(desc);

    var episodes = [];
    var epRegex = /<article[^>]+id="(post-\d+)"[^>]*class="[^"]*organic-post-card[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
    var match;

    while ((match = epRegex.exec(html)) !== null) {
        var epHtml = match[2];

        var urlMatch = epHtml.match(/<a[^>]+href="([^"]+)"[^>]*class="[^"]*organic-thumb-link[^"]*"/i);
        if (!urlMatch) continue;

        var epUrl = urlMatch[1];
        if (epUrl.indexOf("http") !== 0) {
            epUrl = getBase() + (epUrl.indexOf("/") === 0 ? epUrl : "/" + epUrl);
        } else {
            epUrl = normalizeUrl(epUrl);
        }

        var epNum = 0;
        var epName = "";
        var epSlug = U.slug(epUrl);

        var labelMatch = epHtml.match(/<span[^>]+class="[^"]*episode-label[^"]*">([\s\S]*?)<\/span>([\s\S]*?)<\/a>/i);
        if (labelMatch) {
            var labelText = U.clean(labelMatch[1]);
            var titleText = U.clean(labelMatch[2]);

            var numMatch = labelText.match(/(\d+)/);
            if (numMatch) epNum = parseInt(numMatch[1]);

            epName = labelText + " " + titleText;
        }

        if (!epName) {
            var titleMatch = epHtml.match(/<h2[^>]+class="[^"]*post-title[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
            if (titleMatch) epName = U.clean(titleMatch[1]);
        }

        if (epNum > 0 && epSlug) {
            episodes.push({
                id: epUrl,
                name: epName || ("Tập " + epNum),
                slug: epSlug
            });
        }
    }

    result.servers.push({
        name: "PhimSexAI",
        episodes: episodes
    });

    result.episode_current = episodes.length + " tập";

    var tags = [];
    var tagsSection = html.match(/<div[^>]+class="[^"]*tag-cloud[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (tagsSection) {
        var tagRegex = /<a[^>]+href="[^"]*\/tag\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
        var tagMatch;
        while ((tagMatch = tagRegex.exec(tagsSection[1])) !== null) {
            var tagName = U.clean(tagMatch[1]);
            if (tagName) tags.push(tagName);
        }
    }
    result.category = tags.join(", ");

    return JSON.stringify(result);
}

// =============================================================================
// HELPER: Parse Episode Detail
// =============================================================================

function parseEpisodeDetail(html) {
    var result = {
        id: "",
        title: "",
        posterUrl: "",
        backdropUrl: "",
        description: "",
        year: 0,
        rating: 0,
        quality: "HD",
        servers: [],
        episode_current: "Full",
        lang: "Vietsub",
        category: "",
        country: "",
        director: "",
        casts: "",
        previewUrl: ""
    };

    var title = U.meta(html, "og:title") || U.pageTitle(html);
    var poster = U.meta(html, "og:image") || U.dataPoster(html);
    var desc = U.meta(html, "og:description");

    if (title) title = title.replace(/\s*-\s*Phim Sex AI\s*$/i, "").trim();

    var slug = "";
    var canonicalMatch = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
    if (canonicalMatch) slug = U.slug(canonicalMatch[1]);

    result.id = slug;
    result.title = title;
    result.posterUrl = U.url(poster);
    result.backdropUrl = U.url(poster);
    result.description = U.clean(desc);

    var duration = "";
    var durMatch = html.match(/"duration"\s*:\s*"([^"]+)"/i);
    if (durMatch) duration = U.duration(durMatch[1]);

    var embedUrl = findEmbedUrl(html);

    var episodesList = [];
    var episodeListMatch = html.match(/<div[^>]+class="[^"]*episode-list[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (episodeListMatch) {
        var buttons = episodeListMatch[1].match(/<a[^>]+class="[^"]*episode-btn[^"]*"[^>]*>[\s\S]*?<\/a>/gi);
        if (buttons) {
            for (var e = 0; e < buttons.length; e++) {
                var btnHtml = buttons[e];
                var hrefMatch = btnHtml.match(/href=["']([^"']+)["']/i);
                var numMatch = btnHtml.match(/>([\s\S]*?)<\/a>/i);

                if (hrefMatch && numMatch) {
                    var epNum = parseInt(U.clean(numMatch[1]));
                    var epSlug = U.slug(hrefMatch[1]);
                    if (epNum > 0 && epSlug) {
                        episodesList.push({
                            num: epNum,
                            slug: epSlug,
                            url: normalizeUrl(hrefMatch[1]),
                            isActive: btnHtml.indexOf("active") !== -1
                        });
                    }
                }
            }
        }
    }

    if (embedUrl) {
        result.servers.push({
            name: "PhimSexAI",
            episodes: [{
                id: embedUrl,
                name: duration ? "Full (" + duration + ")" : "Full",
                slug: "full"
            }]
        });
        result.episode_current = duration ? "Full (" + duration + ")" : "Full";
    } else {
        result.episode_current = "No Source";
    }

    var tags = [];
    var tagsSection = html.match(/<div[^>]+class="[^"]*post-tags[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (tagsSection) {
        var tagRegex = /<a[^>]+href="[^"]*\/tag\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
        var tagMatch;
        while ((tagMatch = tagRegex.exec(tagsSection[1])) !== null) {
            var tagName = U.clean(tagMatch[1]);
            if (tagName) tags.push(tagName);
        }
    }
    result.category = tags.join(", ");

    return JSON.stringify(result);
}

// =============================================================================
// LIST PARSER
// =============================================================================

function parseListResponse(html, apiUrl, datasend) {
    setActiveBase(apiUrl);

    var movies = [];
    var match;

    var standardRegex = /<article[^>]+class="[^"]*standard-post-card[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
    while ((match = standardRegex.exec(html)) !== null) {
        var m = parseStandardPost(match[1]);
        if (m) movies.push(m);
    }

    var seriesRegex = /<article[^>]+class="[^"]*series-post-card[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
    while ((match = seriesRegex.exec(html)) !== null) {
        var m2 = parseSeriesPost(match[1]);
        if (m2) movies.push(m2);
    }

    var currentPage = 1, totalPages = 1;
    var currentMatch = html.match(/<span[^>]+class=['"]current['"][^>]*>(\d+)<\/span>/i);
    if (currentMatch) currentPage = parseInt(currentMatch[1]);

    var pageLinks = html.match(/\/page\/(\d+)\//g);
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

function parseStandardPost(itemHtml) {
    try {
        var linkMatch = itemHtml.match(/<a[^>]+href="([^"]+)"[^>]*class="[^"]*organic-thumb-link[^"]*"/i) ||
                        itemHtml.match(/<a[^>]+class="[^"]*organic-thumb-link[^"]*"[^>]+href="([^"]+)"/i);
        if (!linkMatch) return null;

        var url = linkMatch[1];
        var slug = U.slug(url);
        if (!slug) return null;

        var title = "";
        var titleMatch = itemHtml.match(/<h[24][^>]+class="[^"]*post-title[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
        if (titleMatch) title = U.clean(titleMatch[1]);
        if (!title) {
            var altMatch = itemHtml.match(/<img[^>]+alt="([^"]+)"/i);
            if (altMatch) title = U.clean(altMatch[1]);
        }
        if (!title) title = slug.replace(/-/g, " ");

        var poster = "";
        var imgMatch = itemHtml.match(/<img[^>]+class="[^"]*organic-img[^"]*"[^>]+src="([^"]+)"/i) ||
                       itemHtml.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*organic-img[^"]*"/i);
        if (imgMatch) poster = U.url(imgMatch[1]);

        var badges = [];
        if (itemHtml.indexOf("Phim mới") !== -1) badges.push("Mới");
        if (itemHtml.indexOf("Vietsub") !== -1) badges.push("Vietsub");
        if (itemHtml.indexOf("Thuyết Minh") !== -1) badges.push("Thuyết Minh");

        return {
            id: slug,
            title: title,
            posterUrl: poster,
            backdropUrl: poster,
            description: badges.join(" • "),
            year: 0,
            quality: "HD",
            episode_current: "",
            lang: "Vietsub",
            previewUrl: ""
        };
    } catch (e) { return null; }
}

function parseSeriesPost(itemHtml) {
    try {
        var linkMatch = itemHtml.match(/<a[^>]+href="([^"]+)"[^>]*class="[^"]*organic-thumb-link[^"]*"/i);
        if (!linkMatch) return null;

        var url = linkMatch[1];
        var slug = U.slug(url);
        if (!slug) return null;

        var title = "";
        var titleMatch = itemHtml.match(/<h[24][^>]+class="[^"]*series-title[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
        if (titleMatch) title = U.clean(titleMatch[1]);
        if (!title) {
            var altMatch = itemHtml.match(/<img[^>]+alt="([^"]+)"/i);
            if (altMatch) title = U.clean(altMatch[1]);
        }
        if (!title) title = slug.replace(/-/g, " ");

        var poster = "";
        var imgMatch = itemHtml.match(/<img[^>]+class="[^"]*series-slide-img[^"]*"[^>]+src="([^"]+)"/i) ||
                       itemHtml.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*series-slide-img[^"]*"/i);
        if (imgMatch) poster = U.url(imgMatch[1]);

        var episodeCount = 0;
        var epMatches = itemHtml.match(/<li>\s*<a[^>]+href="[^"]+"[^>]*>\s*<span[^>]+class="[^"]*ep-badge[^"]*"/g);
        if (epMatches) episodeCount = epMatches.length;

        var badges = [];
        if (itemHtml.indexOf("Phim mới") !== -1) badges.push("Mới");
        if (itemHtml.indexOf("Vietsub") !== -1) badges.push("Vietsub");
        if (itemHtml.indexOf("Thuyết Minh") !== -1) badges.push("Thuyết Minh");

        var description = badges.join(" • ");
        if (episodeCount > 0) description += (description ? " • " : "") + "📺 " + episodeCount + " tập";

        return {
            id: slug,
            title: title,
            posterUrl: poster,
            backdropUrl: poster,
            description: description,
            year: 0,
            quality: "SERIES",
            episode_current: episodeCount > 0 ? episodeCount + " tập" : "",
            lang: "Vietsub",
            previewUrl: ""
        };
    } catch (e) { return null; }
}

function parseSearchResponse(html, apiUrl, datasend) {
    return parseListResponse(html, apiUrl, datasend);
}

// =============================================================================
// MOVIE DETAIL PARSER
// =============================================================================

function parseMovieDetail(htmlContent, apiUrl, datasend) {
    try {
        setActiveBase(apiUrl);

        var pageType = detectPageType(htmlContent);
        debugLog("parseMovieDetail pageType:", pageType);

        switch (pageType) {
            case "PLAYER": {
                var servers = extractAllStreamsFromPlayer(htmlContent);
                var title = U.meta(htmlContent, "og:title") || U.pageTitle(htmlContent);
                var poster = U.meta(htmlContent, "og:image") || U.dataPoster(htmlContent);

                if (title) title = title.replace(/\s*-\s*Phim Sex AI\s*$/i, "").trim();

                var slug = "";
                var canonicalMatch = htmlContent.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
                if (canonicalMatch) slug = U.slug(canonicalMatch[1]);

                var result = {
                    id: slug,
                    title: title,
                    posterUrl: U.url(poster),
                    backdropUrl: U.url(poster),
                    description: U.clean(U.meta(htmlContent, "og:description")),
                    year: 0,
                    rating: 0,
                    quality: "HD",
                    servers: [],
                    episode_current: servers.length > 0 ? "Full" : "No Source",
                    lang: "Vietsub",
                    category: "",
                    country: "",
                    director: "",
                    casts: "",
                    previewUrl: ""
                };

                if (servers.length > 0) {
                    result.servers.push({
                        name: "PhimSexAI",
                        episodes: [{
                            id: servers[0].url,
                            name: "Full",
                            slug: "full"
                        }]
                    });
                }

                return JSON.stringify(result);
            }

            case "SERIES_ARCHIVE":
                return parseSeriesArchive(htmlContent);

            case "EPISODE_DETAIL":
            default:
                return parseEpisodeDetail(htmlContent);
        }

    } catch (e) {
        debugLog("parseMovieDetail error:", e.message || e);
        return JSON.stringify({
            error: true,
            message: "parseMovieDetail error: " + (e.message || e)
        });
    }
}

// =============================================================================
// DETAIL RESPONSE PARSER
// ⭐ [v6.5.1] Truyền apiUrl (URL trang chi tiết) làm sourceUrl cho fetchUrl
// =============================================================================

function parseDetailResponse(htmlContent, apiUrl, datasend) {
    try {
        setActiveBase(apiUrl);

        // CASE 1: Player HTML → extract streams
        if (htmlContent && htmlContent.indexOf("cvp-tab-pane") !== -1) {
            var servers = extractAllStreamsFromPlayer(htmlContent);
            if (servers.length > 0) {
                debugLog("parseDetailResponse: found", servers.length, "servers in HTML");
                return buildStreamResponse(servers);
            }
        }

        // CASE 2: Episode Detail HTML → fetch player iframe
        if (htmlContent) {
            var embedUrl = findEmbedUrl(htmlContent);
            if (embedUrl) {
                debugLog("parseDetailResponse: fetch embed", embedUrl);
                // ⭐ [v6.5.1] Truyền apiUrl (URL trang chi tiết) làm Referer
                var playerHtml = fetchUrl(embedUrl, apiUrl || htmlContent);
                if (playerHtml) {
                    // Trường hợp A: fetch /player/<id> thành công → có cvp-tab-pane
                    var servers2 = extractAllStreamsFromPlayer(playerHtml);
                    if (servers2.length > 0) {
                        debugLog("parseDetailResponse: found", servers2.length, "servers from player");
                        return buildStreamResponse(servers2);
                    }

                    // Trường hợp B: fetch fallback /?p=<id> → có okplayer-frame
                    // → cần findEmbedUrl lần nữa rồi fetch tiếp
                    if (playerHtml.indexOf("okplayer-frame") !== -1 &&
                        playerHtml.indexOf("cvp-tab-pane") === -1) {
                        var embedUrl2 = findEmbedUrl(playerHtml);
                        if (embedUrl2 && embedUrl2 !== embedUrl) {
                            debugLog("parseDetailResponse: nested embed", embedUrl2);
                            var playerHtml2 = fetchUrl(embedUrl2, apiUrl || htmlContent);
                            if (playerHtml2) {
                                var servers3 = extractAllStreamsFromPlayer(playerHtml2);
                                if (servers3.length > 0) {
                                    return buildStreamResponse(servers3);
                                }
                            }
                        }
                    }
                }
            }
        }

        // CASE 3: datasend là stream URL
        if (datasend && U.isStream(datasend)) {
            var dsUrl = normalizeUrl(datasend);
            return buildStreamResponse([{
                url: dsUrl,
                originalUrl: dsUrl,
                mimeType: U.mime(dsUrl),
                serverNum: 1,
                serverLabel: "Direct"
            }]);
        }

        // CASE 4: datasend là player URL
        if (datasend && (datasend.indexOf("/player/") !== -1 || datasend.indexOf("okplayer") !== -1)) {
            var dsPlayerUrl = normalizeUrl(datasend);
            debugLog("parseDetailResponse: fetch datasend player", dsPlayerUrl);
            var playerHtml4 = fetchUrl(dsPlayerUrl, apiUrl || htmlContent);
            if (playerHtml4) {
                var servers4 = extractAllStreamsFromPlayer(playerHtml4);
                if (servers4.length > 0) {
                    return buildStreamResponse(servers4);
                }
            }
        }

        return JSON.stringify({
            url: "",
            isEmbed: false,
            error: true,
            message: "Không tìm thấy stream URL"
        });

    } catch (e) {
        debugLog("parseDetailResponse error:", e.message || e);
        return JSON.stringify({ url: "", isEmbed: false, error: true, message: e.message || e });
    }
}

// =============================================================================
// EMBED RESPONSE PARSER
// =============================================================================

function parseEmbedResponse(html, sourceUrl) {
    try {
        setActiveBase(sourceUrl);

        var servers = extractAllStreamsFromPlayer(html);
        if (servers.length > 0) {
            return buildStreamResponse(servers);
        }

        var embedUrl = findEmbedUrl(html);
        if (embedUrl) {
            var playerHtml = fetchUrl(embedUrl, sourceUrl);
            if (playerHtml) {
                var servers2 = extractAllStreamsFromPlayer(playerHtml);
                if (servers2.length > 0) {
                    return buildStreamResponse(servers2);
                }
            }
        }

        return JSON.stringify({
            url: "",
            isEmbed: false,
            error: true,
            message: "Không tìm thấy stream URL"
        });

    } catch (e) {
        return JSON.stringify({ url: "", isEmbed: false, error: true, message: e.message || e });
    }
}

// =============================================================================
// CATEGORIES PARSER
// =============================================================================

function parseCategoriesResponse(html, apiUrl) {
    setActiveBase(apiUrl);

    var categories = [];
    var tagCloudMatch = html.match(/<div[^>]+class="[^"]*tag-cloud[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (tagCloudMatch) {
        var tagRegex = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
        var match;
        var seen = {};
        while ((match = tagRegex.exec(tagCloudMatch[1])) !== null) {
            var url = match[1];
            var name = U.clean(match[2]);
            if (url.indexOf("/tag/") !== -1) continue;
            if (name.length < 2) continue;
            var slug = U.slug(url);
            if (!slug || seen[slug]) continue;
            seen[slug] = true;
            categories.push({ name: name, slug: slug });
        }
    }
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
