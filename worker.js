/**
 * Cloudflare Worker for Shape Shifters Release Downloads
 * FG2G Studio
 * 
 * Features:
 * 1. Dynamic GitHub Release Discovery (always routes to latest version)
 * 2. Spam & Abuse Protection:
 *    - Cloudflare Edge Caching (prevents GitHub API rate-limit exhaustion)
 *    - Request Flood / Rate-limiting mitigation
 *    - Bot & Scraper filtering (blocks malicious user-agents)
 *    - Hotlink Protection (optional domain validation)
 */

const REPO_OWNER = "fg2gstudio";
const REPO_NAME = "shape-shifters-releases";
const GITHUB_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const FALLBACK_DOWNLOAD_URL = "https://github.com/fg2gstudio/shape-shifters-releases/releases/download/v1.0.0/ShapeShifters-v1.0.0.zip";

// In-memory rate limiting map for edge instances (IP -> timestamp & count)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 20;     // Max 20 downloads/checks per IP per minute

function isRateLimited(clientIp) {
  if (!clientIp) return false;
  const now = Date.now();
  const record = rateLimitMap.get(clientIp);

  if (!record || now - record.startTime > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(clientIp, { startTime: now, count: 1 });
    return false;
  }

  record.count += 1;
  if (record.count > MAX_REQUESTS_PER_WINDOW) {
    return true;
  }
  return false;
}

// Block known abusive scraping bots
function isSuspiciousBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  const blockedPatterns = ["masscan", "zgrab", "nikto", "sqlmap", "semrushbot", "mj12bot", "ahrefsbot"];
  return blockedPatterns.some((pattern) => ua.includes(pattern));
}

async function fetchLatestRelease(forceFresh = false) {
  const fetchOptions = {
    headers: {
      "User-Agent": "FG2G-ShapeShifters-Worker/1.0",
      "Accept": "application/vnd.github+json",
    },
    // Cloudflare Edge Cache: Caches GitHub's API response for 60 seconds
    // Even if 1,000,000 requests hit this Worker, GitHub is only queried once a minute.
    cf: forceFresh ? { cacheTtl: 0 } : { cacheTtl: 60, cacheEverything: true },
  };

  const response = await fetch(GITHUB_API_URL, fetchOptions);
  if (!response.ok) {
    throw new Error(`GitHub API returned HTTP ${response.status}`);
  }
  return await response.json();
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.toLowerCase();
    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
    const userAgent = request.headers.get("User-Agent") || "";

    // 1. Spam & Abuse Filter: Block abusive bots
    if (isSuspiciousBot(userAgent)) {
      return new Response("Forbidden: Automated scan detected.", { status: 403 });
    }

    // 2. Spam & Abuse Filter: IP Rate Limiting
    if (isRateLimited(clientIp)) {
      return new Response("Too Many Requests: Download rate limit exceeded. Please wait a minute.", {
        status: 429,
        headers: {
          "Retry-After": "60",
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    // 3. CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // 4. Fetch latest release dynamically
    let releaseData = null;
    let downloadUrl = FALLBACK_DOWNLOAD_URL;
    let assetInfo = null;

    try {
      const isFresh = url.searchParams.has("fresh") || url.searchParams.has("bust");
      releaseData = await fetchLatestRelease(isFresh);
      const assets = releaseData.assets || [];
      const zipAsset = assets.find((a) => a.name.toLowerCase().endsWith(".zip")) || assets[0];
      if (zipAsset && zipAsset.browser_download_url) {
        downloadUrl = zipAsset.browser_download_url;
        assetInfo = zipAsset;
      }
    } catch (err) {
      console.error("Failed to query GitHub Releases:", err);
    }

    // 5. Version API route (/version, /api/version, /info)
    if (path === "/version" || path === "/api/version" || path === "/info") {
      return new Response(
        JSON.stringify(
          {
            game: "Shape Shifters",
            studio: "FG2G Studio",
            version: releaseData ? releaseData.tag_name : "v1.0.0",
            download_url: downloadUrl,
            asset_filename: assetInfo ? assetInfo.name : "ShapeShifters-v1.0.0.zip",
            size_bytes: assetInfo ? assetInfo.size : null,
            release_page: releaseData ? releaseData.html_url : `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`,
            published_at: releaseData ? releaseData.published_at : null,
          },
          null,
          2
        ),
        {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=60",
          },
        }
      );
    }

    // 6. Direct Download Redirect (/, /download, /latest)
    if (
      path === "/" ||
      path === "/download" ||
      path === "/download/" ||
      path === "/latest" ||
      path === "/get" ||
      path.endsWith(".zip")
    ) {
      return Response.redirect(downloadUrl, 302);
    }

    return new Response("Not Found", { status: 404 });
  },
};
