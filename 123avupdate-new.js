// =============================================================================
// 123AV PLUGIN FOR VAAPP - TUÂN THỦ ĐÚNG QUY ĐỊNH
// Version: 2.0.1
// =============================================================================

// =============================================================================
// CONFIGURATION & METADATA
// =============================================================================

function getManifest() {
    return JSON.stringify({
        "id": "123av",
        "name": "123AV",
        "version": "2.0.0",
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
        "subtitleCat": true,
        "debug": false,
        "adblock": true
    });
}

function getHomeSections() {
    return JSON.stringify([
        { slug: 'vi/new', title: 'Mới Cập Nhật', type: 'Horizontal', path: '' },
        { slug: 'vi/hot', title: 'Hot & Thịnh Hành', type: 'Horizontal', path: '' },
        { slug: 'vi/recent', title: 'Mới thêm gần đây', type: 'Horizontal', path: '' },
        { slug: 'vi/all?sort=today', title: 'Xu hướng hôm nay', type: 'Horizontal', path: '' },
        { slug: 'vi/all?sort=week', title: 'Xu hướng tuần này', type: 'Horizontal', path: '' }
    ]);
}

function getPrimaryCategories() {
    return JSON.stringify([
        { name: 'Mới cập nhật', slug: 'vi/new' },
        { name: 'Thịnh hành', slug: 'vi/hot' },
        { name: 'Có che (Censored)', slug: 'vi/censored' },
        { name: 'Không che (Uncensored)', slug: 'vi/uncensored' },
        { name: 'Không che rò rỉ', slug: 'vi/uncensored-leaked' },
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
// HELPER FUNCTIONS
// =============================================================================

// Helper: Lấy dữ liệu từ pipe |data:
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

// Helper: Làm sạch URL (bỏ phần |data:)
function cleanUrl(raw) {
    if (!raw) return "";
    var i = raw.indexOf("|");
    if (i < 0) return raw;
    return raw.substring(0, i);
}

// Helper: Trích xuất hash ID từ URL
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

// Helper: Trích xuất poster từ URL
function extractPosterFromUrl(url) {
    try {
        var urlObj = new URL(url);
        return urlObj.searchParams.get('poster');
    } catch (e) {
        return null;
    }
}

// Helper: Giải mã player JSON (xử lý Unicode escapes)
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

// Helper: Làm sạch text
function cleanText(text) {
    if (!text) return "";
    return text.replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
}

// Helper: Lấy meta tag từ HTML
function getMeta(html, property) {
    var regex1 = new RegExp('(?:property|name)=["\']' + property + '["\'][^>]*content=(["\'])(.*?)\\1', 'i');
    var regex2 = new RegExp('content=(["\'])(.*?)\\1[^>]*(?:property|name)=["\']' + property + '["\']', 'i');
    var match = html.match(regex1) || html.match(regex2);
    return match ? match[2] : "";
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
// STREAM DATA FETCHER (SỬ DỤNG httpRequest NATIVE)
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
    
    if (url.indexOf("?") !== -1) {
        url += "&page=" + page;
    } else {
        url += "?page=" + page;
    }
    
    if (filters.sort && filters.sort !== 'new') {
        url += "&sort=" + filters.sort;
    }
    
    return url;
}

function getUrlSearch(keyword, filtersJson) {
    var filters = JSON.parse(filtersJson || "{}");
    var page = filters.page || 1;
    return "https://123av.com/vi/search?keyword=" + encodeURIComponent(keyword) + "&page=" + page;
}

function getUrlDetail(slug, datasend) {
    // Nếu có datasend và là JSON hợp lệ, trả về thẳng (bỏ qua fetch HTTP)
    if (datasend) {
        try {
            var data = JSON.parse(datasend);
            if (data && data.id) {
                return datasend;
            }
        } catch (e) {
            // Không phải JSON, tiếp tục xử lý bình thường
        }
    }
    
    // Xử lý URL
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
// LIST PARSERS
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
    
    if (isActressesPage) {
        $doc.find("a[href*='/actresses/']").each(function() {
            var href = this.attr("href");
            if (!href) return;
            
            var slugMatch = href.match(/\/actresses\/([^"\/]+)/);
            if (!slugMatch) return;
            
            var name = this.text().trim();
            if (!name || name.length < 2 || name.match(/^\d+/) || name.indexOf('.') !== -1) return;
            
            var slug = "vi/actresses/" + slugMatch[1];
            
            // Kiểm tra trùng lặp
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
                    lang: ""
                });
            }
        });
        
    } else if (isAllGenresPage) {
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
                    lang: ""
                });
            }
        });
        
    } else {
        // Parse danh sách phim
        $doc.find(".card, .featured").each(function() {
            var link = this.find(".card__body .card__link, .featured__body .card__link").first();
            if (!link) return;
            
            var href = link.attr("href");
            if (!href) return;
            
            var slugMatch = href.match(/\/v\/([^"\/]+)/);
            if (!slugMatch) return;
            
            var slug = "vi/v/" + slugMatch[1];
            var title = link.text().trim();
            
            if (!title) {
                var img = this.find("img").first();
                if (img) {
                    title = img.attr("alt") || slugMatch[1];
                }
            }
            
            var poster = "";
            var img = this.find("img").first();
            if (img) {
                poster = img.attr("data-src") || img.attr("src") || "";
                if (poster && poster.indexOf("//") === 0) poster = "https:" + poster;
            }
            
            var duration = "";
            var durEl = this.find(".card__dur, .featured__dur").first();
            if (durEl) {
                duration = durEl.text().trim();
            }
            
            movies.push({
                id: slug,
                title: cleanText(title),
                posterUrl: poster,
                backdropUrl: poster,
                description: duration ? "Thời lượng: " + duration : "",
                year: 0,
                quality: "HD",
                episode_current: duration,
                lang: "Censored"
            });
        });
    }
    
    // Pagination
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
// MOVIE DETAIL PARSER
// =============================================================================

function parseMovieDetail(htmlContent, apiUrl, datasend) {
    try {
        // === 1. ƯU TIÊN ĐỌC TỪ DATASEND ===
        var detailData = null;
        if (datasend) {
            try {
                detailData = JSON.parse(datasend);
                if (detailData && detailData.servers) {
                    // Đã có đầy đủ dữ liệu, trả về ngay
                    return JSON.stringify(detailData);
                }
            } catch (e) {
                // Không phải JSON, tiếp tục parse từ HTML
            }
        }
        
        // === 2. THỬ PARSE X-DATA (PHƯƠNG PHÁP MỚI) ===
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
        
        if (xDataResult && xDataResult.iframeUrl) {
            // Lấy metadata
            title = getMeta(htmlContent, "og:title") || xDataResult.code || '';
            thumb = getMeta(htmlContent, "og:image") || xDataResult.poster || '';
            desc = getMeta(htmlContent, "og:description") || '';
            
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
                casts: actors.join(", ")
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
            lang: "Censored",
            category: genres.join(", "),
            country: "Japan",
            director: director,
            casts: actors.join(", ")
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
        // Nếu có datasend và là JSON hợp lệ, trả về thẳng
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
            } catch (e) {
                // Không phải JSON, tiếp tục parse từ HTML
            }
        }
        
        // Kiểm tra xem có x-data không
        var hasXData = htmlContent.indexOf('x-data="') !== -1 && 
                       htmlContent.indexOf('player(JSON.parse') !== -1;
        
        // Kiểm tra xem có video trực tiếp không
        var hasVideo = htmlContent.indexOf('<video') !== -1 || 
                       htmlContent.indexOf('.m3u8') !== -1 ||
                       htmlContent.indexOf('player(') !== -1;
        
        // Kiểm tra embed
        var isEmbed = htmlContent.indexOf('iframe') !== -1 && 
                      !hasVideo &&
                      !hasXData;
        
        // Nếu là embed, trả về URL embed
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
        
        // Nếu có x-data, parse để lấy stream
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
        
        // Fallback: tìm link M3U8 trực tiếp
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
        
        // Không tìm thấy gì
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
// EMBED RESPONSE PARSER (HỖ TRỢ RECURSIVE EMBED)
// =============================================================================

function parseEmbedResponse(html, sourceUrl) {
    try {
        // Tìm iframe trong embed
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
        
        // Tìm M3U8 trực tiếp
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
        
        // Tìm video file
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
        
        // Không tìm thấy
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
// EXPOSE FUNCTIONS (TƯƠNG THÍCH VỚI VAAPP)
// =============================================================================

// Các hàm được expose để VAAPP có thể gọi
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
// AUTO-REGISTER CHO MÔI TRƯỜNG VAAPP
// =============================================================================

// Nếu chạy trong môi trường VAAPP (có _vaapp_register)
if (typeof _vaapp_register !== 'undefined') {
    _vaapp_register(pluginExports);
}

// Nếu chạy trong môi trường browser (debug)
if (typeof window !== 'undefined') {
    for (var key in pluginExports) {
        if (pluginExports.hasOwnProperty(key)) {
            window[key] = pluginExports[key];
        }
    }
}

// Nếu chạy trong môi trường Node.js (test)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = pluginExports;
}
