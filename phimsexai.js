// =============================================================================
// PHIMSEXAI PLUGIN FOR VAAPP
// Version: 5.2.0 - FIX PHIM BỘ: Trả URL trang chi tiết tập cho VAAPP fetch
// Base: https://phimsexai.site
// =============================================================================

// =============================================================================
// CONFIGURATION & METADATA
// =============================================================================

function getManifest() {
    return JSON.stringify({
        "id": "phimsexai",
        "name": "Phim Sex AI",
        "version": "5.2.0",
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

var PluginUtils = {
    cleanText: function(text) {
        if (!text) return "";
        return text.replace(/<[^>]*>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&#8211;/g, "-")
            .replace(/&#8217;/g, "'")
            .replace(/&hellip;/g, "...")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&nbsp;/g, " ")
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
        if (url.indexOf('/') === 0) return "https://phimsexai.site" + url;
        return url;
    },

    extractSlugFromUrl: function(url) {
        if (!url) return "";
        var slug = url.replace(/^https?:\/\/[^\/]+/, "");
        if (slug.indexOf("/") === 0) slug = slug.substring(1);
        if (slug.lastIndexOf("/") === slug.length - 1) slug = slug.substring(0, slug.length - 1);
        return slug;
    },

    parseDuration: function(isoDuration) {
        if (!isoDuration) return "";
        var match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!match) return "";
        var hours = parseInt(match[1] || 0);
        var minutes = parseInt(match[2] || 0);
        var seconds = parseInt(match[3] || 0);
        if (hours > 0) return hours + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
        return minutes + ":" + String(seconds).padStart(2, "0");
    },

    safeBtoa: function(str) {
        try {
            return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        } catch (e) { return ""; }
    },

    detectServerType: function(url) {
        if (!url) return "unknown";
        if (url.indexOf(".m3u8") !== -1) return "m3u8";
        if (url.indexOf(".mp4") !== -1) return "mp4";
        if (url.indexOf("youjizz.com") !== -1) return "youjizz";
        if (url.indexOf("usersporn.com") !== -1) return "usersporn";
        if (url.indexOf("abyssplayer.com") !== -1) return "abyss";
        return "embed";
    },

    getServerLabel: function(num, url) {
        var type = PluginUtils.detectServerType(url);
        var names = { "m3u8": "HLS", "mp4": "MP4", "youjizz": "YouJizz", "usersporn": "UsersPorn", "abyss": "Abyss", "embed": "Embed", "unknown": "SV" };
        return "SV " + num + " (" + (names[type] || "Server") + ")";
    },

    scoreServer: function(url, num) {
        var type = PluginUtils.detectServerType(url);
        var score = { "m3u8": 100, "mp4": 80, "abyss": 60, "youjizz": 50, "usersporn": 40, "embed": 30 }[type] || 10;
        return score + (10 - num) * 5;
    },

    isEmbedType: function(url) {
        var type = PluginUtils.detectServerType(url);
        return (type === "embed" || type === "youjizz" || type === "usersporn" || type === "abyss");
    }
};

// =============================================================================
// URL GENERATION
// =============================================================================

function getUrlList(slug, filtersJson) {
    var filters = JSON.parse(filtersJson || "{}");
    var page = filters.page || 1;
    var baseUrl = "https://phimsexai.site";
    var path = slug || "";
    
    if ((path === "home" || path === "") && page === 1) return baseUrl + "/";
    if (path === "home" || path === "") return baseUrl + "/page/" + page + "/";
    if (path.indexOf("/") === 0) path = path.substring(1);
    
    return page === 1 ? baseUrl + "/" + path + "/" : baseUrl + "/" + path + "/page/" + page + "/";
}

function getUrlSearch(keyword, filtersJson) {
    var filters = JSON.parse(filtersJson || "{}");
    var page = filters.page || 1;
    var baseUrl = "https://phimsexai.site";
    return page === 1 ? baseUrl + "/?s=" + encodeURIComponent(keyword) : baseUrl + "/page/" + page + "/?s=" + encodeURIComponent(keyword);
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
// LIST PARSER
// =============================================================================

function parseListResponse(html, apiUrl, datasend) {
    var movies = [];
    var match;
    
    var standardRegex = /<article[^>]+class="[^"]*standard-post-card[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
    while ((match = standardRegex.exec(html)) !== null) {
        var movie = parseStandardPost(match[1]);
        if (movie) movies.push(movie);
    }
    
    var seriesRegex = /<article[^>]+class="[^"]*series-post-card[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
    while ((match = seriesRegex.exec(html)) !== null) {
        var movie = parseSeriesPost(match[1]);
        if (movie) movies.push(movie);
    }
    
    var currentPage = 1;
    var totalPages = 1;
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
        var slug = PluginUtils.extractSlugFromUrl(url);
        if (!slug) return null;
        
        var title = "";
        var titleMatch = itemHtml.match(/<h[24][^>]+class="[^"]*post-title[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
        if (titleMatch) title = PluginUtils.cleanText(titleMatch[1]);
        if (!title) {
            var altMatch = itemHtml.match(/<img[^>]+alt="([^"]+)"/i);
            if (altMatch) title = PluginUtils.cleanText(altMatch[1]);
        }
        if (!title) title = slug.replace(/-/g, " ");
        
        var poster = "";
        var imgMatch = itemHtml.match(/<img[^>]+class="[^"]*organic-img[^"]*"[^>]+src="([^"]+)"/i) ||
                       itemHtml.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*organic-img[^"]*"/i);
        if (imgMatch) poster = PluginUtils.normalizeUrl(imgMatch[1]);
        
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
        var slug = PluginUtils.extractSlugFromUrl(url);
        if (!slug) return null;
        
        var title = "";
        var titleMatch = itemHtml.match(/<h[24][^>]+class="[^"]*series-title[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
        if (titleMatch) title = PluginUtils.cleanText(titleMatch[1]);
        if (!title) {
            var altMatch = itemHtml.match(/<img[^>]+alt="([^"]+)"/i);
            if (altMatch) title = PluginUtils.cleanText(altMatch[1]);
        }
        if (!title) title = slug.replace(/-/g, " ");
        
        var poster = "";
        var imgMatch = itemHtml.match(/<img[^>]+class="[^"]*series-slide-img[^"]*"[^>]+src="([^"]+)"/i) ||
                       itemHtml.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*series-slide-img[^"]*"/i);
        if (imgMatch) poster = PluginUtils.normalizeUrl(imgMatch[1]);
        
        var episodeCount = 0;
        var episodeMatches = itemHtml.match(/<li>\s*<a[^>]+href="[^"]+"[^>]*>\s*<span[^>]+class="[^"]*ep-badge[^"]*"/g);
        if (episodeMatches) episodeCount = episodeMatches.length;
        
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
// PLAYER HELPERS
// =============================================================================

/**
 * Parse 7 servers từ HTML player
 */
function parsePlayerServers(playerHtml) {
    var servers = [];
    var match;
    
    var tabRegex = /<div[^>]+id="(cvp-tab-\d+)"[^>]+class="[^"]*cvp-tab-pane[^"]*"[^>]+data-link="([^"]+)"/gi;
    while ((match = tabRegex.exec(playerHtml)) !== null) {
        var num = parseInt(match[1].replace("cvp-tab-", ""));
        var link = match[2];
        servers.push({
            num: num,
            url: link,
            label: PluginUtils.getServerLabel(num, link),
            score: PluginUtils.scoreServer(link, num),
            isEmbed: PluginUtils.isEmbedType(link)
        });
    }
    
    if (servers.length === 0) {
        var idx = 0;
        var regex2 = /data-link="([^"]+)"/gi;
        while ((match = regex2.exec(playerHtml)) !== null) {
            idx++;
            var link2 = match[1];
            servers.push({
                num: idx,
                url: link2,
                label: PluginUtils.getServerLabel(idx, link2),
                score: PluginUtils.scoreServer(link2, idx),
                isEmbed: PluginUtils.isEmbedType(link2)
            });
        }
    }
    
    if (servers.length === 0) {
        var m3u8Match = playerHtml.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/i);
        if (m3u8Match) {
            servers.push({
                num: 1,
                url: m3u8Match[0].replace(/\\\//g, "/"),
                label: "Direct HLS",
                score: 100,
                isEmbed: false
            });
        }
    }
    
    servers.sort(function(a, b) { return b.score - a.score; });
    return servers;
}

/**
 * Resolve URL qua API /get-video
 */
function resolveStreamUrl(originalUrl) {
    try {
        var encodedUrl = PluginUtils.safeBtoa(originalUrl);
        if (!encodedUrl) return originalUrl;
        
        var apiUrl = "https://phimsexai.site/get-video?url=" + encodedUrl;
        var response = httpRequest(apiUrl, {
            method: "GET",
            headers: {
                "Referer": "https://phimsexai.site/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        });
        
        if (response && response.status === 200 && response.body) {
            try {
                var data = JSON.parse(response.body);
                if (data && data.status === "success" && data.video_url) {
                    return data.video_url;
                }
            } catch (e) {}
        }
    } catch (e) {}
    
    return originalUrl;
}

/**
 * Tìm embed URL (URL player) từ HTML trang chi tiết
 */
function findEmbedUrl(htmlContent) {
    var embedUrl = "";
    
    // Strategy 1: Schema VideoObject
    var schemaMatch = htmlContent.match(/"embedUrl"\s*:\s*"([^"]+)"/i);
    if (schemaMatch) {
        embedUrl = schemaMatch[1].replace(/\\\//g, "/");
    }
    
    // Strategy 2: iframe okplayer-frame
    if (!embedUrl) {
        var iframeMatch = htmlContent.match(/<iframe[^>]*id=["']okplayer-frame["'][^>]*>/i);
        if (iframeMatch) {
            var srcMatch = iframeMatch[0].match(/src=["']([^"']+)["']/i);
            if (srcMatch) embedUrl = srcMatch[1].replace(/\\\//g, "/");
        }
    }
    
    // Strategy 3: Bất kỳ iframe /player/
    if (!embedUrl) {
        var playerIframeMatch = htmlContent.match(/<iframe[^>]+src=["']([^"']*\/player\/[^"']+)["']/i);
        if (playerIframeMatch) embedUrl = playerIframeMatch[1].replace(/\\\//g, "/");
    }
    
    // Strategy 4: Post ID
    if (!embedUrl) {
        var postIdMatch = htmlContent.match(/postid-(\d+)/i) || 
                         htmlContent.match(/wp-json\/wp\/v2\/posts\/(\d+)/i) ||
                         htmlContent.match(/\?p=(\d+)/i);
        if (postIdMatch) embedUrl = "https://phimsexai.site/player/" + postIdMatch[1];
    }
    
    if (embedUrl && embedUrl.indexOf("//") === 0) embedUrl = "https:" + embedUrl;
    return embedUrl;
}

/**
 * Parse danh sách tập từ HTML trang chi tiết
 */
function findEpisodesList(htmlContent) {
    var episodesList = [];
    
    var episodeListMatch = htmlContent.match(/<div[^>]+class="[^"]*episode-list[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (!episodeListMatch) return episodesList;
    
    var buttons = episodeListMatch[1].match(/<a[^>]+class="[^"]*episode-btn[^"]*"[^>]*>[\s\S]*?<\/a>/gi);
    if (!buttons) return episodesList;
    
    for (var e = 0; e < buttons.length; e++) {
        var btnHtml = buttons[e];
        var hrefMatch = btnHtml.match(/href=["']([^"']+)["']/i);
        var numMatch = btnHtml.match(/>([\s\S]*?)<\/a>/i);
        
        if (hrefMatch && numMatch) {
            var epNum = parseInt(PluginUtils.cleanText(numMatch[1]));
            var epSlug = PluginUtils.extractSlugFromUrl(hrefMatch[1]);
            if (epNum > 0 && epSlug) {
                episodesList.push({
                    num: epNum,
                    slug: epSlug,
                    url: hrefMatch[1]
                });
            }
        }
    }
    
    return episodesList;
}

// =============================================================================
// MOVIE DETAIL PARSER - VERSION 5.2.0
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
        
        // ===== METADATA =====
        var title = PluginUtils.getMeta(htmlContent, "og:title");
        var thumb = PluginUtils.getMeta(htmlContent, "og:image");
        var desc = PluginUtils.getMeta(htmlContent, "og:description");
        
        if (title) title = title.replace(/\s*-\s*Phim Sex AI\s*$/i, "").trim();
        
        var slug = "";
        var canonicalMatch = htmlContent.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
        if (canonicalMatch) slug = PluginUtils.extractSlugFromUrl(canonicalMatch[1]);
        
        result.id = slug;
        result.title = title;
        result.posterUrl = thumb;
        result.backdropUrl = thumb;
        result.description = PluginUtils.cleanText(desc);
        
        var duration = "";
        var durationMatch = htmlContent.match(/"duration"\s*:\s*"([^"]+)"/i);
        if (durationMatch) duration = PluginUtils.parseDuration(durationMatch[1]);
        
        // ===== TÌM EMBED URL VÀ DANH SÁCH TẬP =====
        var embedUrl = findEmbedUrl(htmlContent);
        var episodesList = findEpisodesList(htmlContent);
        
        // ===== BUILD SERVERS =====
        
        if (episodesList.length > 0) {
            // ═══════════════════════════════════════════════════════
            // PHIM BỘ: Trả về DANH SÁCH URL TRANG CHI TIẾT TẬP
            // VAAPP sẽ tự fetch từng URL khi user chọn tập
            // ═══════════════════════════════════════════════════════
            var seriesEpisodes = [];
            
            for (var i = 0; i < episodesList.length; i++) {
                var ep = episodesList[i];
                var epUrl = "https://phimsexai.site/" + ep.slug + "/";
                
                seriesEpisodes.push({
                    id: epUrl,           // ← URL trang chi tiết tập
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
            // ═══════════════════════════════════════════════════════
            // PHIM LẺ: Fetch player URL để lấy stream URL ngay
            // ═══════════════════════════════════════════════════════
            var playerServers = [];
            
            if (typeof httpRequest !== "undefined") {
                try {
                    var playerResp = httpRequest(embedUrl, {
                        method: "GET",
                        headers: {
                            "Referer": "https://phimsexai.site/",
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                        }
                    });
                    
                    if (playerResp && playerResp.status === 200 && playerResp.body) {
                        playerServers = parsePlayerServers(playerResp.body);
                    }
                } catch (e) {}
            }
            
            if (playerServers.length > 0) {
                // Fetch thành công → stream URL trực tiếp
                var bestServer = playerServers[0];
                var resolvedUrl = bestServer.isEmbed ? bestServer.url : resolveStreamUrl(bestServer.url);
                
                result.servers.push({
                    name: "PhimSexAI - " + bestServer.label + " ★",
                    episodes: [{
                        id: resolvedUrl,
                        name: duration ? "Full (" + duration + ")" : "Full",
                        slug: "full"
                    }]
                });
                
                // Thêm các server phụ
                for (var s = 1; s < playerServers.length; s++) {
                    var srv = playerServers[s];
                    result.servers.push({
                        name: "PhimSexAI - " + srv.label,
                        episodes: [{
                            id: srv.url,
                            name: "Full",
                            slug: "server-" + srv.num
                        }]
                    });
                }
            } else {
                // Fetch fail → dùng embedUrl (URL player), VAAPP tự fetch
                result.servers.push({
                    name: "PhimSexAI",
                    episodes: [{
                        id: embedUrl,
                        name: duration ? "Full (" + duration + ")" : "Full",
                        slug: "full"
                    }]
                });
            }
            
            result.episode_current = duration ? "Full (" + duration + ")" : "Full";
        } else {
            result.episode_current = "No Source";
        }
        
        // ===== TAGS =====
        var tags = [];
        var tagsSection = htmlContent.match(/<div[^>]+class="[^"]*post-tags[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        if (tagsSection) {
            var tagRegex = /<a[^>]+href="[^"]*\/tag\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
            var tagMatch;
            while ((tagMatch = tagRegex.exec(tagsSection[1])) !== null) {
                var tagName = PluginUtils.cleanText(tagMatch[1]);
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
// DETAIL RESPONSE PARSER - 3 CASES
// =============================================================================

function parseDetailResponse(htmlContent, apiUrl, datasend) {
    try {
        // ═══════════════════════════════════════════════════════
        // CASE 1: htmlContent là HTML player (có cvp-tab-pane)
        // → Parse stream URL trực tiếp
        // ═══════════════════════════════════════════════════════
        if (htmlContent && htmlContent.indexOf("cvp-tab-pane") !== -1) {
            var playerServers = parsePlayerServers(htmlContent);
            
            if (playerServers.length > 0) {
                var best = playerServers[0];
                var streamUrl = best.isEmbed ? best.url : resolveStreamUrl(best.url);
                
                return JSON.stringify({
                    url: streamUrl,
                    isEmbed: best.isEmbed,
                    mimeType: best.url.indexOf(".mp4") !== -1 ? "video/mp4" : "application/x-mpegURL",
                    headers: {
                        "Referer": "https://phimsexai.site/",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                    },
                    subtitles: []
                });
            }
        }
        
        // ═══════════════════════════════════════════════════════
        // CASE 2: htmlContent là HTML trang chi tiết phim
        // → Trả về embed URL (URL player) để VAAPP fetch tiếp
        // ═══════════════════════════════════════════════════════
        if (htmlContent) {
            var embedUrl = findEmbedUrl(htmlContent);
            if (embedUrl) {
                return JSON.stringify({
                    url: embedUrl,
                    isEmbed: true,
                    headers: {
                        "Referer": "https://phimsexai.site/",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                    }
                });
            }
        }
        
        // ═══════════════════════════════════════════════════════
        // CASE 3: datasend là stream URL trực tiếp
        // ═══════════════════════════════════════════════════════
        if (datasend && (datasend.indexOf(".m3u8") !== -1 || datasend.indexOf(".mp4") !== -1)) {
            return JSON.stringify({
                url: datasend,
                isEmbed: false,
                mimeType: datasend.indexOf(".mp4") !== -1 ? "video/mp4" : "application/x-mpegURL",
                headers: {
                    "Referer": "https://phimsexai.site/",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                },
                subtitles: []
            });
        }
        
        // ═══════════════════════════════════════════════════════
        // FALLBACK: Trả về empty
        // ═══════════════════════════════════════════════════════
        return JSON.stringify({
            url: "",
            isEmbed: false,
            headers: {
                "Referer": "https://phimsexai.site/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
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
        var servers = parsePlayerServers(html);
        
        if (servers.length === 0) {
            // Fallback: check if html is actually a detail page with embedUrl
            var embedUrl = findEmbedUrl(html);
            if (embedUrl) {
                return JSON.stringify({
                    url: embedUrl,
                    isEmbed: true,
                    headers: {
                        "Referer": "https://phimsexai.site/",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                    }
                });
            }
            
            return JSON.stringify({
                url: "",
                isEmbed: false,
                error: true,
                message: "Không tìm thấy server"
            });
        }
        
        var best = servers[0];
        var streamUrl = best.isEmbed ? best.url : resolveStreamUrl(best.url);
        
        return JSON.stringify({
            url: streamUrl,
            isEmbed: best.isEmbed,
            mimeType: best.url.indexOf(".mp4") !== -1 ? "video/mp4" : "application/x-mpegURL",
            headers: {
                "Referer": "https://phimsexai.site/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            },
            subtitles: [],
            servers: servers.map(function(s) {
                return {
                    name: "PhimSexAI - " + s.label,
                    episodes: [{
                        id: s.url,
                        name: "Full",
                        slug: "server-" + s.num
                    }]
                };
            })
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
            var name = PluginUtils.cleanText(match[2]);
            if (url.indexOf("/tag/") !== -1) continue;
            if (name.length < 2) continue;
            var slug = PluginUtils.extractSlugFromUrl(url);
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
