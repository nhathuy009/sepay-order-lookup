// =============================================================================
// PHIMSEXAI PLUGIN FOR VAAPP
// Version: 5.0.0
// Base: https://phimsexai.site
// Platform: WordPress + Custom Player (cvp-player)
// 
// Features:
//   - Parse phim lẻ + phim bộ (episodes)
//   - Ưu tiên Schema VideoObject (không bị adblock strip)
//   - 7 servers với auto-fallback
//   - Preview poster HD
// =============================================================================

// =============================================================================
// CONFIGURATION & METADATA
// =============================================================================

function getManifest() {
    return JSON.stringify({
        "id": "phimsexai",
        "name": "Phim Sex AI",
        "version": "5.0.0",
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
        sort: [
            { name: 'Mới nhất', value: 'new' }
        ],
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
        
        if (hours > 0) {
            return hours + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
        }
        return minutes + ":" + String(seconds).padStart(2, "0");
    },

    safeBtoa: function(str) {
        try {
            return btoa(unescape(encodeURIComponent(str)))
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');
        } catch (e) {
            return "";
        }
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
        var typeNames = {
            "m3u8": "HLS",
            "mp4": "MP4",
            "youjizz": "YouJizz",
            "usersporn": "UsersPorn",
            "abyss": "Abyss",
            "embed": "Embed",
            "unknown": "SV"
        };
        return "SV " + num + " (" + (typeNames[type] || "Server") + ")";
    },

    scoreServer: function(url, num) {
        var score = 0;
        var type = PluginUtils.detectServerType(url);
        
        switch (type) {
            case "m3u8": score += 100; break;
            case "mp4": score += 80; break;
            case "abyss": score += 60; break;
            case "youjizz": score += 50; break;
            case "usersporn": score += 40; break;
            case "embed": score += 30; break;
            default: score += 10;
        }
        
        score += (10 - num) * 5;
        return score;
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
    
    if ((path === "home" || path === "") && page === 1) {
        return baseUrl + "/";
    }
    
    if (path === "home" || path === "") {
        return baseUrl + "/page/" + page + "/";
    }
    
    if (path.indexOf("/") === 0) path = path.substring(1);
    
    if (page === 1) {
        return baseUrl + "/" + path + "/";
    } else {
        return baseUrl + "/" + path + "/page/" + page + "/";
    }
}

function getUrlSearch(keyword, filtersJson) {
    var filters = JSON.parse(filtersJson || "{}");
    var page = filters.page || 1;
    var baseUrl = "https://phimsexai.site";
    
    if (page === 1) {
        return baseUrl + "/?s=" + encodeURIComponent(keyword);
    } else {
        return baseUrl + "/page/" + page + "/?s=" + encodeURIComponent(keyword);
    }
}

function getUrlDetail(slug, datasend) {
    if (!slug) return "";
    
    if (slug.indexOf("http") === 0) return slug;
    if (slug.indexOf("/") === 0) return "https://phimsexai.site" + slug;
    
    return "https://phimsexai.site/" + slug + "/";
}

function getUrlCategories() { 
    return "https://phimsexai.site/"; 
}

function getUrlCountries() { 
    return ""; 
}

function getUrlYears() { 
    return ""; 
}

// =============================================================================
// LIST PARSER
// =============================================================================

function parseListResponse(html, apiUrl, datasend) {
    var movies = [];
    
    // Parse standard posts (phim lẻ)
    var standardRegex = /<article[^>]+class="[^"]*standard-post-card[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
    var match;
    while ((match = standardRegex.exec(html)) !== null) {
        var movie = parseStandardPost(match[1]);
        if (movie) movies.push(movie);
    }
    
    // Parse series posts (phim bộ)
    var seriesRegex = /<article[^>]+class="[^"]*series-post-card[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
    while ((match = seriesRegex.exec(html)) !== null) {
        var movie = parseSeriesPost(match[1]);
        if (movie) movies.push(movie);
    }
    
    // Pagination
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
        if (itemHtml.indexOf("Phim mới") !== -1 || itemHtml.indexOf("new-badge") !== -1) badges.push("Mới");
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
    } catch (e) {
        return null;
    }
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
        
        // Đếm số tập từ series-episodes-list
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
    } catch (e) {
        return null;
    }
}

function parseSearchResponse(html, apiUrl, datasend) {
    return parseListResponse(html, apiUrl, datasend);
}

// =============================================================================
// MOVIE DETAIL PARSER - VERSION 5.0.0
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
        
        // ============================================================
        // 1. METADATA
        // ============================================================
        var title = PluginUtils.getMeta(htmlContent, "og:title");
        var thumb = PluginUtils.getMeta(htmlContent, "og:image");
        var desc = PluginUtils.getMeta(htmlContent, "og:description");
        
        if (title) {
            title = title.replace(/\s*-\s*Phim Sex AI\s*$/i, "").trim();
        }
        
        if (!title) {
            var h1Match = htmlContent.match(/<h1[^>]+class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
            if (h1Match) title = PluginUtils.cleanText(h1Match[1]);
        }
        
        var slug = "";
        var canonicalMatch = htmlContent.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
        if (canonicalMatch) slug = PluginUtils.extractSlugFromUrl(canonicalMatch[1]);
        
        result.id = slug;
        result.title = title;
        result.posterUrl = thumb;
        result.backdropUrl = thumb;
        result.description = PluginUtils.cleanText(desc);
        
        // Duration từ Schema
        var duration = "";
        var durationMatch = htmlContent.match(/"duration"\s*:\s*"([^"]+)"/i);
        if (durationMatch) duration = PluginUtils.parseDuration(durationMatch[1]);
        
        // ============================================================
        // 2. TÌM PLAYER URL - 5 STRATEGIES
        // ============================================================
        var embedUrl = "";
        
        // ⭐ Strategy 1: TỪ SCHEMA VIDEOOBJECT (an toàn nhất)
        var schemaEmbedMatch = htmlContent.match(/"embedUrl"\s*:\s*"([^"]+)"/i);
        if (schemaEmbedMatch) {
            embedUrl = schemaEmbedMatch[1].replace(/\\\//g, "/");
        }
        
        // Strategy 2: Từ iframe okplayer-frame (linh hoạt với xuống dòng)
        if (!embedUrl) {
            var iframeOkMatch = htmlContent.match(/<iframe[^>]*id=["']okplayer-frame["'][^>]*>/i);
            if (iframeOkMatch) {
                var srcMatch = iframeOkMatch[0].match(/src=["']([^"']+)["']/i);
                if (srcMatch) embedUrl = srcMatch[1].replace(/\\\//g, "/");
            }
        }
        
        // Strategy 3: Bất kỳ iframe có /player/
        if (!embedUrl) {
            var playerIframeMatch = htmlContent.match(/<iframe[^>]+src=["']([^"']*\/player\/[^"']+)["']/i);
            if (playerIframeMatch) {
                embedUrl = playerIframeMatch[1].replace(/\\\//g, "/");
            }
        }
        
        // Strategy 4: Tìm trong script/json
        if (!embedUrl) {
            var scriptPlayerMatch = htmlContent.match(/["'](https?:\/\/[^"']*\/player\/\d+[^"']*)["']/i);
            if (scriptPlayerMatch) {
                embedUrl = scriptPlayerMatch[1].replace(/\\\//g, "/");
            }
        }
        
        // Strategy 5: Xây dựng từ post ID
        if (!embedUrl) {
            var postIdMatch = htmlContent.match(/postid-(\d+)/i) || 
                             htmlContent.match(/"postid"\s*:\s*(\d+)/i) ||
                             htmlContent.match(/wp-json\/wp\/v2\/posts\/(\d+)/i) ||
                             htmlContent.match(/shortlink["']\s*href=["']https?:\/\/[^"']+\?p=(\d+)/i);
            if (postIdMatch) {
                embedUrl = "https://phimsexai.site/player/" + postIdMatch[1];
            }
        }
        
        // Chuẩn hóa
        if (embedUrl && embedUrl.indexOf("//") === 0) {
            embedUrl = "https:" + embedUrl;
        }
        
        // ============================================================
        // 3. PARSE EPISODES - ĐÚNG VỚI HTML THỰC TẾ
        // ============================================================
        var episodes = [];
        
        // Cách 1: Parse từ .episode-buttons
        var episodeListMatch = htmlContent.match(/<div[^>]+class="[^"]*episode-list[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        if (episodeListMatch) {
            var episodeButtons = episodeListMatch[1].match(/<a[^>]+class="[^"]*episode-btn[^"]*"[^>]*>([\s\S]*?)<\/a>/gi);
            
            if (episodeButtons) {
                for (var e = 0; e < episodeButtons.length; e++) {
                    var btnHtml = episodeButtons[e];
                    
                    var hrefMatch = btnHtml.match(/href=["']([^"']+)["']/i);
                    var numMatch = btnHtml.match(/>([\s\S]*?)<\/a>/i);
                    
                    if (hrefMatch && numMatch) {
                        var epUrl = hrefMatch[1];
                        var epNum = parseInt(PluginUtils.cleanText(numMatch[1]));
                        var epSlug = PluginUtils.extractSlugFromUrl(epUrl);
                        
                        var labelMatch = btnHtml.match(/aria-label=["']([^"']+)["']/i);
                        var epTitle = labelMatch ? PluginUtils.cleanText(labelMatch[1]) : ("Tập " + epNum);
                        
                        if (epNum > 0 && epSlug) {
                            episodes.push({
                                num: epNum,
                                title: epTitle,
                                slug: epSlug,
                                url: epUrl,
                                isActive: btnHtml.indexOf("active") !== -1
                            });
                        }
                    }
                }
            }
        }
        
        // Cách 2: Fallback - Parse tất cả link có class episode-btn
        if (episodes.length === 0) {
            var allBtnRegex = /<a[^>]+class="[^"]*episode-btn[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
            var btnMatch;
            var idx = 0;
            
            while ((btnMatch = allBtnRegex.exec(htmlContent)) !== null) {
                idx++;
                var fullBtn = btnMatch[0];
                var hrefMatch2 = fullBtn.match(/href=["']([^"']+)["']/i);
                var numText = PluginUtils.cleanText(btnMatch[1]);
                var num = parseInt(numText) || idx;
                
                if (hrefMatch2) {
                    var epUrl2 = hrefMatch2[1];
                    var epSlug2 = PluginUtils.extractSlugFromUrl(epUrl2);
                    
                    var labelMatch2 = fullBtn.match(/aria-label=["']([^"']+)["']/i);
                    var epTitle2 = labelMatch2 ? PluginUtils.cleanText(labelMatch2[1]) : ("Tập " + num);
                    
                    episodes.push({
                        num: num,
                        title: epTitle2,
                        slug: epSlug2,
                        url: epUrl2,
                        isActive: fullBtn.indexOf("active") !== -1
                    });
                }
            }
        }
        
        // ============================================================
        // 4. BUILD SERVERS - PHÂN BIỆT PHIM LẺ / PHIM BỘ
        // ============================================================
        
        if (episodes.length > 0) {
            // ═══════════════════════════════════════════
            // PHIM BỘ: Mỗi tập là 1 episode, id = URL trang chi tiết tập
            // ═══════════════════════════════════════════
            var seriesEpisodes = [];
            
            for (var i = 0; i < episodes.length; i++) {
                var ep = episodes[i];
                var epUrl = "https://phimsexai.site/" + ep.slug + "/";
                
                seriesEpisodes.push({
                    id: epUrl,
                    name: ep.title || ("Tập " + ep.num),
                    slug: ep.slug
                });
            }
            
            result.servers.push({
                name: "PhimSexAI",
                episodes: seriesEpisodes
            });
            
            result.episode_current = episodes.length + " tập";
            result.quality = "SERIES";
            
        } else if (embedUrl) {
            // ═══════════════════════════════════════════
            // PHIM LẺ: 1 player URL duy nhất
            // ═══════════════════════════════════════════
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
            result.description = (result.description || "") + "\n\n⚠️ Không tìm thấy player URL";
        }
        
        // ============================================================
        // 5. TAGS
        // ============================================================
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
// DETAIL RESPONSE PARSER
// =============================================================================

function parseDetailResponse(htmlContent, apiUrl, datasend) {
    try {
        // Nếu datasend là embed URL player
        if (datasend && datasend.indexOf("/player/") !== -1) {
            return JSON.stringify({
                url: datasend,
                isEmbed: true,
                headers: {
                    "Referer": "https://phimsexai.site/",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            });
        }
        
        // Strategy 1: Schema
        var schemaEmbedMatch = htmlContent.match(/"embedUrl"\s*:\s*"([^"]+)"/i);
        if (schemaEmbedMatch) {
            var url1 = schemaEmbedMatch[1].replace(/\\\//g, "/");
            if (url1.indexOf("//") === 0) url1 = "https:" + url1;
            return JSON.stringify({
                url: url1,
                isEmbed: true,
                headers: {
                    "Referer": "https://phimsexai.site/",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            });
        }
        
        // Strategy 2: iframe okplayer-frame
        var iframeOkMatch = htmlContent.match(/<iframe[^>]*id=["']okplayer-frame["'][^>]*>/i);
        if (iframeOkMatch) {
            var srcMatch = iframeOkMatch[0].match(/src=["']([^"']+)["']/i);
            if (srcMatch) {
                var url2 = srcMatch[1].replace(/\\\//g, "/");
                if (url2.indexOf("//") === 0) url2 = "https:" + url2;
                return JSON.stringify({
                    url: url2,
                    isEmbed: true,
                    headers: {
                        "Referer": "https://phimsexai.site/",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                    }
                });
            }
        }
        
        // Strategy 3: Bất kỳ iframe có /player/
        var playerIframeMatch = htmlContent.match(/<iframe[^>]+src=["']([^"']*\/player\/[^"']+)["']/i);
        if (playerIframeMatch) {
            var url3 = playerIframeMatch[1].replace(/\\\//g, "/");
            if (url3.indexOf("//") === 0) url3 = "https:" + url3;
            return JSON.stringify({
                url: url3,
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
// EMBED RESPONSE PARSER - OPTION C: 7 SERVERS + AUTO-FALLBACK
// =============================================================================

function parseEmbedResponse(html, sourceUrl) {
    try {
        // ============================================================
        // 1. PARSE TẤT CẢ SERVERS
        // ============================================================
        var serverList = [];
        var tabRegex = /<div[^>]+id="(cvp-tab-\d+)"[^>]+class="[^"]*cvp-tab-pane[^"]*"[^>]+data-link="([^"]+)"/gi;
        var match;
        
        while ((match = tabRegex.exec(html)) !== null) {
            var tabId = match[1];
            var link = match[2];
            var num = parseInt(tabId.replace("cvp-tab-", ""));
            
            serverList.push({
                num: num,
                tabId: tabId,
                link: link,
                type: PluginUtils.detectServerType(link),
                label: PluginUtils.getServerLabel(num, link),
                score: PluginUtils.scoreServer(link, num)
            });
        }
        
        // Fallback: data-link bất kỳ
        if (serverList.length === 0) {
            var idx = 0;
            var regex2 = /data-link="([^"]+)"/gi;
            while ((match = regex2.exec(html)) !== null) {
                idx++;
                var link2 = match[1];
                serverList.push({
                    num: idx,
                    tabId: "cvp-tab-" + idx,
                    link: link2,
                    type: PluginUtils.detectServerType(link2),
                    label: PluginUtils.getServerLabel(idx, link2),
                    score: PluginUtils.scoreServer(link2, idx)
                });
            }
        }
        
        // Fallback cuối: tìm m3u8/mp4 trực tiếp
        if (serverList.length === 0) {
            var m3u8Match = html.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/i);
            if (m3u8Match) {
                return JSON.stringify({
                    url: m3u8Match[0].replace(/\\\//g, "/"),
                    isEmbed: false,
                    mimeType: "application/x-mpegURL",
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
                message: "Không tìm thấy server nào"
            });
        }
        
        // ============================================================
        // 2. SẮP XẾP THEO ĐIỂM
        // ============================================================
        serverList.sort(function(a, b) {
            return b.score - a.score;
        });
        
        // ============================================================
        // 3. RESOLVE URL QUA API /get-video CHO SERVER TỐT NHẤT
        // ============================================================
        var headers = {
            "Referer": "https://phimsexai.site/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        };
        
        var bestServer = serverList[0];
        var resolvedUrl = bestServer.link;
        var isEmbed = false;
        var mimeType = "application/x-mpegURL";
        
        try {
            var encodedUrl = PluginUtils.safeBtoa(bestServer.link);
            
            if (encodedUrl) {
                var apiUrl = "https://phimsexai.site/get-video?url=" + encodedUrl;
                var response = httpRequest(apiUrl, {
                    method: "GET",
                    headers: headers
                });
                
                if (response && response.status === 200 && response.body) {
                    try {
                        var data = JSON.parse(response.body);
                        if (data && data.status === "success" && data.video_url) {
                            resolvedUrl = data.video_url;
                        }
                    } catch (e) {}
                }
            }
        } catch (e) {}
        
        // Xác định loại URL
        if (resolvedUrl.indexOf(".m3u8") !== -1) {
            mimeType = "application/x-mpegURL";
        } else if (resolvedUrl.indexOf(".mp4") !== -1) {
            mimeType = "video/mp4";
        } else {
            isEmbed = true;
        }
        
        // ============================================================
        // 4. TRẢ VỀ KẾT QUẢ VỚI NHIỀU SERVERS
        // ============================================================
        var servers = [];
        
        // Server chính (đã resolve URL)
        servers.push({
            name: "PhimSexAI - " + bestServer.label + " ★",
            episodes: [{
                id: resolvedUrl,
                name: "Full",
                slug: "server-" + bestServer.num
            }]
        });
        
        // Các server phụ (dùng URL gốc)
        for (var s = 1; s < serverList.length; s++) {
            var srv = serverList[s];
            servers.push({
                name: "PhimSexAI - " + srv.label,
                episodes: [{
                    id: srv.link,
                    name: "Full",
                    slug: "server-" + srv.num
                }]
            });
        }
        
        return JSON.stringify({
            url: resolvedUrl,
            isEmbed: isEmbed,
            mimeType: mimeType,
            headers: headers,
            subtitles: [],
            servers: servers,
            bestServer: bestServer.num,
            totalServers: serverList.length
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
