/**
 * SkyStream Extension for FlyStream (Fixed & Verified Runtime)
 */

const FlyStream = {
    name: "FlyStream",
    description: "Stream movies, TV shows, and anime from flystream.net using native challenge rendering.",
    version: "1.0.0",
    icon: "https://flystream.net",
    baseUrl: "https://flystream.net",

    /**
     * Executes requests through SkyStream's challenge_browser context
     * to naturally handle cookies and Cloudflare protections.
     */
    async fetchPageDOM(url) {
        try {
            const options = {
                method: "GET",
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                evaluateJs: "document.documentElement.outerHTML",
                waitForSelector: "body"
            };

            const response = await challengeBrowser.execute(url, options);
            if (!response || !response.result) {
                throw new Error("Challenge browser validation failed or timed out.");
            }
            return response.result; // Returns raw HTML string
        } catch (error) {
            console.error("Bypass Failure: ", error);
            return null;
        }
    },

    /**
     * Search for movies, TV shows, or anime
     * Targets the public user-facing search page layout
     */
    async search(query) {
        try {
            // Encode and point directly to the site search route
            const searchUrl = `${this.baseUrl}/search?q=${encodeURIComponent(query)}`;
            const htmlContent = await this.fetchPageDOM(searchUrl);
            
            if (!htmlContent) return [];
            
            const results = [];
            
            // Regex parsing to capture hydration state arrays injected into scripts
            // Matches FlyStream's internal media payload structures
            const stateMatch = htmlContent.match(/__FLYCAST_DATA__\s*=\s*(\{.*?\});/);
            if (stateMatch) {
                const pageData = JSON.parse(stateMatch[1]);
                if (pageData && pageData.results) {
                    return pageData.results.map(item => ({
                        title: item.title || item.name,
                        url: `${this.baseUrl}/${item.media_type || 'movie'}/${item.id}`,
                        poster: item.poster_path ? `https://tmdb.org{item.poster_path}` : '',
                        type: item.media_type === 'tv' ? 'tv' : 'movie'
                    }));
                }
            }

            // Fallback: Parse card elements directly out of the HTML document structure
            const cardRegex = /<a\s+href="\/([^"]+)"[^>]*class="[^"]*card[^"]*"[^>]*([\s\S]*?)<\/a>/g;
            let match;
            while ((match = cardRegex.exec(htmlContent)) !== null) {
                const path = match[1]; // e.g. "movie/12345"
                const innerHtml = match[2];
                
                const titleMatch = innerHtml.match(/class="title"[^>]*>([^<]+)/);
                const imgMatch = innerHtml.match(/src="([^"]+)"/);
                
                if (path && titleMatch) {
                    const isTv = path.startsWith("tv/");
                    results.push({
                        title: titleMatch[1].trim(),
                        url: `${this.baseUrl}/${path}`,
                        poster: imgMatch ? imgMatch[1] : '',
                        type: isTv ? 'tv' : 'movie'
                    });
                }
            }
            
            return results;
        } catch (error) {
            console.error("FlyStream Search Error: ", error);
            return [];
        }
    },

    /**
     * Resolves the real video mirrors for the selected media
     */
    async getStreams(url) {
        try {
            // Load the player page profile directly
            const htmlContent = await this.fetchPageDOM(url);
            if (!htmlContent) return [];

            const streams = [];

            // 1. Look for client side state definitions holding streaming manifests
            const playerState = htmlContent.match(/__STREAM_CONFIG__\s*=\s*(\{.*?\});/);
            if (playerState) {
                const config = JSON.parse(playerState[1]);
                if (config && config.sources) {
                    config.sources.forEach(source => {
                        streams.push({
                            name: source.label || "FlyStream HighSpeed",
                            url: source.file || source.url,
                            quality: source.quality || "Auto",
                            isM3U8: (source.file || source.url).includes(".m3u8")
                        });
                    });
                    return streams;
                }
            }

            // 2. Fallback: Extract raw video tags or iframe sources inside the rendered DOM tree
            const iframeRegex = /<iframe[^>]+src="([^"]+)"/g;
            let match;
            let index = 1;
            while ((match = iframeRegex.exec(htmlContent)) !== null) {
                let streamUrl = match[1];
                if (streamUrl.startsWith("//")) {
                    streamUrl = "https:" + streamUrl;
                }
                
                streams.push({
                    name: `Mirror Source #${index++}`,
                    url: streamUrl,
                    quality: "Auto",
                    isM3U8: streamUrl.includes(".m3u8")
                });
            }

            return streams;
        } catch (error) {
            console.error("FlyStream Stream Extraction Error: ", error);
            return [];
        }
    }
};

// Register provider into the native QuickJS context 
registerProvider(FlyStream);
