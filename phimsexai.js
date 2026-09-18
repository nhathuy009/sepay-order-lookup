// =============================================================================
// PHIMSEXAI PLUGIN FOR VAAPP
// Version: 6.0.0
// Base: https://phimsexai.site
// 
// FEATURES:
//   - Nhận diện 5 loại page: Homepage, Series Archive, Episode Detail, Single Movie, Player
//   - Parse danh sách tập từ Series Archive
//   - Fetch player → extract stream URL trực tiếp (m3u8/mp4)
//   - Bypass overlay quảng cáo (chỉ dùng stream URL)
//   - Auto-fallback khi server lỗi
// =============================================================================

// =============================================================================
// CONFIGURATION & METADATA
// =============================================================================

function getManifest() {
    return JSON.stringify({
        "id": "phimsexai",
        "name": "Phim Sex AI",
        "version": "6.0.0",
        "baseUrl": "https://phimsexai.site",
        "fallbackUrls": [],
        "referrer": "https://phimsexai.site/",
        "imageReferer": "https://phimsexai.site/",
        "iconUrl": "https://phimsexai.site/wp-content/uploads/cropped-icon-192x192.jpg",
        "isEnabled": true,
        "isAdult": true,
        "type": "VIDEO",
        "layoutType": "HORIZONTAL",
        "playerType": "exoplayer",
        "subtitleCat": false,
        "debug": false,
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

    url: function(u) {
        if (!u) return "";
        if (u.indexOf('//') === 0) return "https:" + u;
        if (u.indexOf('/') === 0) return "https://phimsexai.site" + u;
        return u;
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
    }
};

// =============================================================================
// URL GENERATION
// =============================================================================

function getUrlList(slug, filtersJson) {
    var filters = JSON.parse(filtersJson || "{}");
    var page = filters.page || 1;
    var path = slug || "";
    var base = "https://phimsexai.site";

    if ((path === "home" || path === "") && page === 1) return base + "/";
    if (path === "home" || path === "") return base + "/page/" + page + "/";
    if (path.indexOf("/") === 0) path = path.substring(1);
    return page === 1 ? base + "/" + path + "/" : base + "/" + path + "/page/" + page + "/";
}

function getUrlSearch(keyword, filtersJson) {
    var filters = JSON.parse(filtersJson || "{}");
    var page = filters.page || 1;
    var base = "https://phimsexai.site";
    return page === 1
        ? base + "/?s=" + encodeURIComponent(keyword)
        : base + "/page/" + page + "/?s=" + encodeURIComponent(keyword);
}

function getUrlDetail(slug, datasend) {
    if (!slug) return "";
    if (slug.indexOf("http") === 0) return slug;
    if (slug.indexOf("/") === 0) return "https://phimsexai.site" + slug;
    return "https://phimsexai.site/" + slug + "/";
}

function getUrlCategories() { return "https://phimsexai.site/"; }
function getUrlCountries() { return ""; }
function getUrlYears() { return ""; }

// =============================================================================
// HTTP HELPER
// =============================================================================

function fetchUrl(url) {
    if (!url || typeof httpRequest === "undefined") return null;
    try {
        var resp = httpRequest(url, {
            method: "GET",
            headers: {
                "Referer": "https://phimsexai.site/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        });
        if (resp && resp.status === 200 && resp.body) return resp.body;
    } catch (e) {}
    return null;
}

// =============================================================================
// PAGE TYPE DETECTION
// =============================================================================

function detectPageType(html) {
    if (!html) return "UNKNOWN";
    
    // 1. PLAYER PAGE (có cvp-tab-pane + data-link)
    if (html.indexOf("cvp-tab-pane") !== -1 && html.indexOf("data-link") !== -1) {
        return "PLAYER";
    }
    
    // 2. SERIES ARCHIVE (có archive-header + video-list + episode-label)
    if (html.indexOf("archive-header") !== -1 &&
        html.indexOf("organic-masonry-grid video-list") !== -1 &&
        html.indexOf("episode-label") !== -1) {
        return "SERIES_ARCHIVE";
    }
    
    // 3. EPISODE DETAIL / SINGLE MOVIE (có okplayer-frame hoặc single-post-container)
    if (html.indexOf("okplayer-frame") !== -1 ||
        html.indexOf("single-post-container") !== -1) {
        return "EPISODE_DETAIL";
    }
    
    return "UNKNOWN";
}

// =============================================================================
// HELPER: Find embed URL (player URL) từ Episode Detail
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

    // Strategy 3: Bất kỳ iframe /player/
    if (!embedUrl) {
        var playerIframeMatch = html.match(/<iframe[^>]+src=["']([^"']*\/player\/[^"']+)["']/i);
        if (playerIframeMatch) embedUrl = playerIframeMatch[1].replace(/\\\//g, "/");
    }

    // Strategy 4: Post ID
    if (!embedUrl) {
        var postIdMatch = html.match(/postid-(\d+)/i) ||
                         html.match(/wp-json\/wp\/v2\/posts\/(\d+)/i) ||
                         html.match(/\?p=(\d+)/i);
        if (postIdMatch) embedUrl = "https://phimsexai.site/player/" + postIdMatch[1];
    }

    if (embedUrl && embedUrl.indexOf("//") === 0) embedUrl = "https:" + embedUrl;
    return embedUrl;
}

// =============================================================================
// HELPER: Extract stream URL từ Player HTML
// =============================================================================

function extractStreamFromPlayer(playerHtml) {
    if (!playerHtml) return null;

    var allLinks = [];
    var match;

    // Parse data-link từ cvp-tab-pane
    var tabRegex = /<div[^>]+id="(cvp-tab-\d+)"[^>]+class="[^"]*cvp-tab-pane[^"]*"[^>]+data-link="([^"]+)"/gi;
    while ((match = tabRegex.exec(playerHtml)) !== null) {
        var num = parseInt(match[1].replace("cvp-tab-", ""));
        allLinks.push({ num: num, url: match[2].replace(/\\\//g, "/") });
    }

    // Fallback: data-link bất kỳ
    if (allLinks.length === 0) {
        var idx = 0;
        var regex2 = /data-link="([^"]+)"/gi;
        while ((match = regex2.exec(playerHtml)) !== null) {
            idx++;
            allLinks.push({ num: idx, url: match[1].replace(/\\\//g, "/") });
        }
    }

    // Fallback: m3u8/mp4 trực tiếp
    if (allLinks.length === 0) {
        var m3u8Match = playerHtml.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/i);
        if (m3u8Match) allLinks.push({ num: 1, url: m3u8Match[0].replace(/\\\//g, "/") });
    }

    // CHỈ giữ m3u8/mp4
    var streamLinks = [];
    for (var i = 0; i < allLinks.length; i++) {
        if (U.isStream(allLinks[i].url)) {
            streamLinks.push(allLinks[i]);
        }
    }

    if (streamLinks.length === 0) return null;

    // Ưu tiên m3u8 > mp4
    var best = null;
    for (var j = 0; j < streamLinks.length; j++) {
        if (streamLinks[j].url.indexOf(".m3u8") !== -1) {
            best = streamLinks[j];
            break;
        }
    }
    if (!best) best = streamLinks[0];

    // Resolve qua API /get-video
    var resolvedUrl = best.url;
    try {
        var encodedUrl = U.btoa(best.url);
        if (encodedUrl) {
            var apiUrl = "https://phimsexai.site/get-video?url=" + encodedUrl;
            var resp = httpRequest(apiUrl, {
                method: "GET",
                headers: {
                    "Referer": "https://phimsexai.site/",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            });
            if (resp && resp.status === 200 && resp.body) {
                try {
                    var data = JSON.parse(resp.body);
                    if (data && data.status === "success" && data.video_url) {
                        if (U.isStream(data.video_url)) {
                            resolvedUrl = data.video_url;
                        }
                    }
                } catch (e) {}
            }
        }
    } catch (e) {}

    return {
        url: resolvedUrl,
        mimeType: U.mime(resolvedUrl),
        serverNum: best.num,
        serverLabel: "SV " + best.num + " (" + U.type(resolvedUrl) + ")"
    };
}

// =============================================================================
// HELPER: Fetch Episode Stream (từ URL trang chi tiết tập)
// =============================================================================

function fetchEpisodeStream(epDetailUrl) {
    if (!epDetailUrl) return null;

    // Fetch trang chi tiết tập
    var detailHtml = fetchUrl(epDetailUrl);
    if (!detailHtml) return { url: "", duration: "", success: false };

    // Duration
    var duration = "";
    var durMatch = detailHtml.match(/"duration"\s*:\s*"([^"]+)"/i);
    if (durMatch) duration = U.duration(durMatch[1]);

    // Tìm embed URL
    var embedUrl = findEmbedUrl(detailHtml);
    if (!embedUrl) return { url: "", duration: duration, success: false };

    // Fetch player
    var playerHtml = fetchUrl(embedUrl);
    if (!playerHtml) return { url: "", duration: duration, success: false };

    // Extract stream
    var stream = extractStreamFromPlayer(playerHtml);
    if (!stream) return { url: "", duration: duration, success: false };

    return {
        url: stream.url,
        duration: duration,
        serverLabel: stream.serverLabel,
        success: true
    };
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

    // Metadata
    var title = U.meta(html, "og:title");
    var poster = U.meta(html, "og:image");
    var desc = U.meta(html, "og:description");

    if (title) title = title.replace(/\s*-\s*Phim Sex AI\s*$/i, "").trim();

    var slug = "";
    var canonicalMatch = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
    if (canonicalMatch) slug = U.slug(canonicalMatch[1]);

    result.id = slug;
    result.title = title;
    result.posterUrl = poster;
    result.backdropUrl = poster;
    result.description = U.clean(desc);

    // Parse danh sách tập từ .organic-masonry-grid.video-list
    var episodes = [];
    var epRegex = /<article[^>]+id="(post-\d+)"[^>]*class="[^"]*organic-post-card[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
    var match;

    while ((match = epRegex.exec(html)) !== null) {
        var epHtml = match[2];

        // URL tập
        var urlMatch = epHtml.match(/<a[^>]+href="([^"]+)"[^>]*class="[^"]*organic-thumb-link[^"]*"/i);
        if (!urlMatch) continue;

        var epUrl = urlMatch[1];
        if (epUrl.indexOf("http") !== 0) {
            epUrl = "https://phimsexai.site" + (epUrl.indexOf("/") === 0 ? epUrl : "/" + epUrl);
        }

        // Số tập + tên tập (từ span.episode-label và text sau đó)
        var epNum = 0;
        var epName = "";
        var epSlug = U.slug(epUrl);

        // Tìm span.episode-label
        var labelMatch = epHtml.match(/<span[^>]+class="[^"]*episode-label[^"]*">([\s\S]*?)<\/span>([\s\S]*?)<\/a>/i);
        if (labelMatch) {
            var labelText = U.clean(labelMatch[1]);      // "Tập 1:"
            var titleText = U.clean(labelMatch[2]);      // "Lừa vợ..."
            
            // Parse số tập từ label
            var numMatch = labelText.match(/(\d+)/);
            if (numMatch) epNum = parseInt(numMatch[1]);
            
            epName = labelText + " " + titleText;
        }

        // Fallback: lấy từ post-title
        if (!epName) {
            var titleMatch = epHtml.match(/<h2[^>]+class="[^"]*post-title[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
            if (titleMatch) epName = U.clean(titleMatch[1]);
        }

        if (epNum > 0 && epSlug) {
            episodes.push({
                id: epUrl,
                name: epName || ("Tập " + epNum),
                slug: epSlug,
                num: epNum
            });
        }
    }

    result.servers.push({
        name: "PhimSexAI",
        episodes: episodes
    });

    result.episode_current = episodes.length + " tập";

    // Category từ tags
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
// HELPER: Parse Episode Detail / Single Movie
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

    // Metadata
    var title = U.meta(html, "og:title");
    var poster = U.meta(html, "og:image");
    var desc = U.meta(html, "og:description");

    if (title) title = title.replace(/\s*-\s*Phim Sex AI\s*$/i, "").trim();

    var slug = "";
    var canonicalMatch = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
    if (canonicalMatch) slug = U.slug(canonicalMatch[1]);

    result.id = slug;
    result.title = title;
    result.posterUrl = poster;
    result.backdropUrl = poster;
    result.description = U.clean(desc);

    // Duration
    var duration = "";
    var durMatch = html.match(/"duration"\s*:\s*"([^"]+)"/i);
    if (durMatch) duration = U.duration(durMatch[1]);

    // Tìm embed URL
    var embedUrl = findEmbedUrl(html);

    // Fetch player & extract stream
    if (embedUrl) {
        var stream = fetchEpisodeStream("https://phimsexai.site/" + slug + "/");

        // Fallback: fetch trực tiếp embed URL
        if (!stream || !stream.success) {
            var playerHtml = fetchUrl(embedUrl);
            if (playerHtml) {
                var directStream = extractStreamFromPlayer(playerHtml);
                if (directStream) {
                    stream = {
                        url: directStream.url,
                        duration: duration,
                        serverLabel: directStream.serverLabel,
                        success: true
                    };
                }
            }
        }

        if (stream && stream.success && stream.url) {
            // ✅ Có stream URL trực tiếp
            result.servers.push({
                name: "PhimSexAI - " + (stream.serverLabel || "Stream"),
                episodes: [{
                    id: stream.url,
                    name: duration ? "Full (" + duration + ")" : "Full",
                    slug: "full"
                }]
            });
            result.episode_current = duration ? "Full (" + duration + ")" : "Full";
        } else {
            // Fallback: trả về embed URL để VAAPP tự fetch
            result.servers.push({
                name: "PhimSexAI",
                episodes: [{
                    id: embedUrl,
                    name: duration ? "Full (" + duration + ")" : "Full",
                    slug: "full"
                }]
            });
            result.episode_current = duration ? "Full (" + duration + ")" : "Full";
        }
    } else {
        result.episode_current = "No Source";
        result.description = (result.description || "") + "\n\n⚠️ Không tìm thấy player URL.";
    }

    // Tags
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
    var movies = [];
    var match;

    // Standard posts
    var standardRegex = /<article[^>]+class="[^"]*standard-post-card[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
    while ((match = standardRegex.exec(html)) !== null) {
        var m = parseStandardPost(match[1]);
        if (m) movies.push(m);
    }

    // Series posts
    var seriesRegex = /<article[^>]+class="[^"]*series-post-card[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
    while ((match = seriesRegex.exec(html)) !== null) {
        var m2 = parseSeriesPost(match[1]);
        if (m2) movies.push(m2);
    }

    // Pagination
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

        // Đếm số tập
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
            id: slug,                       // "phim-bo/trao-doi-ban-tinh"
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
// MOVIE DETAIL PARSER - VERSION 6.0.0 (PHÂN LOẠI PAGE TYPE)
// =============================================================================

function parseMovieDetail(htmlContent, apiUrl, datasend) {
    try {
        var pageType = detectPageType(htmlContent);

        switch (pageType) {
            case "SERIES_ARCHIVE":
                return parseSeriesArchive(htmlContent);

            case "EPISODE_DETAIL":
                return parseEpisodeDetail(htmlContent);

            default:
                // Fallback: thử parse episode detail
                return parseEpisodeDetail(htmlContent);
        }

    } catch (e) {
        return JSON.stringify({
            error: true,
            message: "parseMovieDetail error: " + e.message
        });
    }
}

// =============================================================================
// DETAIL RESPONSE PARSER
// =============================================================================

function parseDetailResponse(htmlContent, apiUrl, datasend) {
    try {
        // CASE 1: Player HTML → extract stream
        if (htmlContent && htmlContent.indexOf("cvp-tab-pane") !== -1) {
            var stream = extractStreamFromPlayer(htmlContent);
            if (stream) {
                return JSON.stringify({
                    url: stream.url,
                    isEmbed: false,
                    mimeType: stream.mimeType,
                    headers: {
                        "Referer": "https://phimsexai.site/",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                    },
                    subtitles: []
                });
            }
        }

        // CASE 2: Episode Detail HTML → fetch player
        if (htmlContent) {
            var embedUrl = findEmbedUrl(htmlContent);
            if (embedUrl) {
                var playerHtml = fetchUrl(embedUrl);
                if (playerHtml) {
                    var stream2 = extractStreamFromPlayer(playerHtml);
                    if (stream2) {
                        return JSON.stringify({
                            url: stream2.url,
                            isEmbed: false,
                            mimeType: stream2.mimeType,
                            headers: {
                                "Referer": "https://phimsexai.site/",
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                            },
                            subtitles: []
                        });
                    }
                }
            }
        }

        // CASE 3: datasend là stream URL
        if (datasend && U.isStream(datasend)) {
            return JSON.stringify({
                url: datasend,
                isEmbed: false,
                mimeType: U.mime(datasend),
                headers: {
                    "Referer": "https://phimsexai.site/",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                },
                subtitles: []
            });
        }

        // CASE 4: datasend là embed URL
        if (datasend && datasend.indexOf("/player/") !== -1) {
            var playerHtml4 = fetchUrl(datasend);
            if (playerHtml4) {
                var stream4 = extractStreamFromPlayer(playerHtml4);
                if (stream4) {
                    return JSON.stringify({
                        url: stream4.url,
                        isEmbed: false,
                        mimeType: stream4.mimeType,
                        headers: {
                            "Referer": "https://phimsexai.site/",
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                        },
                        subtitles: []
                    });
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
        return JSON.stringify({ url: "", isEmbed: false, error: true, message: e.message });
    }
}

// =============================================================================
// EMBED RESPONSE PARSER
// =============================================================================

function parseEmbedResponse(html, sourceUrl) {
    try {
        // Extract stream từ player HTML
        var stream = extractStreamFromPlayer(html);
        if (stream) {
            return JSON.stringify({
                url: stream.url,
                isEmbed: false,
                headers: {
                    "Referer": "https://phimsexai.site/",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                },
                subtitles: []
            });
        }

        // Fallback: tìm embed URL và fetch
        var embedUrl = findEmbedUrl(html);
        if (embedUrl) {
            var playerHtml = fetchUrl(embedUrl);
            if (playerHtml) {
                var stream2 = extractStreamFromPlayer(playerHtml);
                if (stream2) {
                    return JSON.stringify({
                        url: stream2.url,
                        isEmbed: false,
                        headers: {
                            "Referer": "https://phimsexai.site/",
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                        },
                        subtitles: []
                    });
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
        return JSON.stringify({ url: "", isEmbed: false, error: true, message: e.message });
    }
}

// =============================================================================
// CATEGORIES PARSER
// =============================================================================

function parseCategoriesResponse(html, apiUrl) {
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
