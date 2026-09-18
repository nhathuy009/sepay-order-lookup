// =============================================================================
// PHIMSEXAI PLUGIN FOR VAAPP
// Version: 5.4.0 - FIX: Cấu trúc chuẩn VAAPP
// =============================================================================

function getManifest() {
    return JSON.stringify({
        "id": "phimsexai",
        "name": "Phim Sex AI",
        "version": "5.4.0",
        "baseUrl": "https://phimsexai.site",
        "referrer": "https://phimsexai.site/",
        "imageReferer": "https://phimsexai.site/",
        "iconUrl": "https://phimsexai.site/wp-content/uploads/cropped-icon-192x192.jpg",
        "isEnabled": true,
        "isAdult": true,
        "type": "VIDEO",
        "layoutType": "HORIZONTAL",
        "playerType": "exoplayer",
        "subtitleCat": false,
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
// UTILS
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
// HELPER: Tìm embed URL từ trang chi tiết
// =============================================================================

function findEmbedUrl(html) {
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
// HELPER: Tìm danh sách tập từ trang chi tiết
// =============================================================================

function findEpisodes(html) {
    var episodes = [];
    
    var listMatch = html.match(/<div[^>]+class="[^"]*episode-list[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (!listMatch) return episodes;
    
    var buttons = listMatch[1].match(/<a[^>]+class="[^"]*episode-btn[^"]*"[^>]*>[\s\S]*?<\/a>/gi);
    if (!buttons) return episodes;
    
    for (var i = 0; i < buttons.length; i++) {
        var btn = buttons[i];
        var hrefMatch = btn.match(/href=["']([^"']+)["']/i);
        var numMatch = btn.match(/>([\s\S]*?)<\/a>/i);
        
        if (hrefMatch && numMatch) {
            var num = parseInt(U.clean(numMatch[1]));
            var slug = U.slug(hrefMatch[1]);
            if (num > 0 && slug) {
                episodes.push({ num: num, slug: slug, url: hrefMatch[1] });
            }
        }
    }
    
    return episodes;
}

// =============================================================================
// HELPER: Extract stream URL trực tiếp từ player HTML
// =============================================================================

function extractStreamFromPlayer(playerHtml) {
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
    
    // ⚠️ CHỈ giữ m3u8/mp4 (BỎ embed để tránh overlay)
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
// HELPER: Fetch player URL và extract stream
// =============================================================================

function fetchStream(embedUrl) {
    if (!embedUrl || typeof httpRequest === "undefined") return null;
    
    try {
        var resp = httpRequest(embedUrl, {
            method: "GET",
            headers: {
                "Referer": "https://phimsexai.site/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        });
        
        if (resp && resp.status === 200 && resp.body) {
            return extractStreamFromPlayer(resp.body);
        }
    } catch (e) {}
    
    return null;
}

// =============================================================================
// LIST PARSER
// =============================================================================

function parseListResponse(html, apiUrl, datasend) {
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
// MOVIE DETAIL PARSER - CHUẨN VAAPP
// =============================================================================

function parseMovieDetail(htmlContent, apiUrl, datasend) {
    try {
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
        
        // METADATA
        var title = U.meta(htmlContent, "og:title");
        var thumb = U.meta(htmlContent, "og:image");
        var desc = U.meta(htmlContent, "og:description");
        
        if (title) title = title.replace(/\s*-\s*Phim Sex AI\s*$/i, "").trim();
        
        var slug = "";
        var canonicalMatch = htmlContent.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
        if (canonicalMatch) slug = U.slug(canonicalMatch[1]);
        
        result.id = slug;
        result.title = title;
        result.posterUrl = thumb;
        result.backdropUrl = thumb;
        result.description = U.clean(desc);
        
        var duration = "";
        var durationMatch = htmlContent.match(/"duration"\s*:\s*"([^"]+)"/i);
        if (durationMatch) duration = U.duration(durationMatch[1]);
        
        // FIND EMBED URL + EPISODES
        var embedUrl = findEmbedUrl(htmlContent);
        var episodesList = findEpisodes(htmlContent);
        
        // ============================================================
        // BUILD SERVERS
        // ============================================================
        
        if (episodesList.length > 0) {
            // ═══════════════════════════════════════════════════
            // PHIM BỘ: Trả về URL trang chi tiết tập
            // VAAPP sẽ gọi parseMovieDetail cho từng tập
            // ═══════════════════════════════════════════════════
            var seriesEpisodes = [];
            for (var i = 0; i < episodesList.length; i++) {
                var ep = episodesList[i];
                seriesEpisodes.push({
                    id: "https://phimsexai.site/" + ep.slug + "/",
                    name: "Tập " + ep.num,
                    slug: ep.slug
                });
            }
            
            result.servers.push({
                name: "PhimSexAI",
                episodes: seriesEpisodes
            });
            
            result.quality = "SERIES";
            result.episode_current = episodesList.length + " tập";
            
        } else if (embedUrl) {
            // ═══════════════════════════════════════════════════
            // PHIM LẺ: Fetch player → extract stream URL trực tiếp
            // ═══════════════════════════════════════════════════
            var stream = fetchStream(embedUrl);
            
            if (stream) {
                // ✅ Có stream URL trực tiếp
                result.servers.push({
                    name: "PhimSexAI - " + stream.serverLabel,
                    episodes: [{
                        id: stream.url,
                        name: duration ? "Full (" + duration + ")" : "Full",
                        slug: "full"
                    }]
                });
                result.episode_current = duration ? "Full (" + duration + ")" : "Full";
            } else {
                // ❌ Không extract được
                result.servers.push({
                    name: "PhimSexAI (Không khả dụng)",
                    episodes: [{
                        id: "",
                        name: "Không thể lấy stream",
                        slug: "unavailable"
                    }]
                });
                result.episode_current = "No Stream";
                result.description = (result.description || "") + "\n\n⚠️ Không thể lấy stream trực tiếp.";
            }
        } else {
            result.episode_current = "No Source";
        }
        
        // TAGS
        var tags = [];
        var tagsSection = htmlContent.match(/<div[^>]+class="[^"]*post-tags[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
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
        
    } catch (e) {
        return JSON.stringify({ error: true, message: e.message });
    }
}

// =============================================================================
// DETAIL RESPONSE PARSER - CHUẨN VAAPP
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
        
        // CASE 2: Trang chi tiết → fetch player
        if (htmlContent) {
            var embedUrl = findEmbedUrl(htmlContent);
            if (embedUrl) {
                var stream2 = fetchStream(embedUrl);
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
// EMBED RESPONSE PARSER - CHUẨN VAAPP
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
        
        // Fallback: fetch player từ embed URL
        var embedUrl = findEmbedUrl(html);
        if (embedUrl) {
            var stream2 = fetchStream(embedUrl);
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
