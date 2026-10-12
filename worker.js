const REPO_OWNER = "fg2gstudio";
const REPO_NAME = "shape-shifters-releases";
const GITHUB_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const FALLBACK_DOWNLOAD_URL = "https://github.com/fg2gstudio/shape-shifters-releases/releases/download/v1.0.0/ShapeShifters-v1.0.0.zip";

const rateLimits = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 20;

function isRateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const entry = rateLimits.get(ip);

  if (!entry || now - entry.startTime > WINDOW_MS) {
    rateLimits.set(ip, { startTime: now, count: 1 });
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

function isKnownScanner(ua = "") {
  const lower = ua.toLowerCase();
  const blocked = ["masscan", "zgrab", "nikto", "sqlmap", "semrushbot", "mj12bot", "ahrefsbot"];
  return blocked.some((b) => lower.includes(b));
}

async function getLatestRelease(skipCache = false) {
  const res = await fetch(GITHUB_API_URL, {
    headers: {
      "User-Agent": "FG2G-ShapeShifters-Worker",
      "Accept": "application/vnd.github+json",
    },
    cf: skipCache ? { cacheTtl: 0 } : { cacheTtl: 60, cacheEverything: true },
  });

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status}`);
  }
  return await res.json();
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.toLowerCase();
    const clientIp = request.headers.get("CF-Connecting-IP") || "";
    const userAgent = request.headers.get("User-Agent") || "";

    if (isKnownScanner(userAgent)) {
      return new Response("Forbidden", { status: 403 });
    }

    if (isRateLimited(clientIp)) {
      return new Response("Too many requests, please try again shortly.", {
        status: 429,
        headers: { "Retry-After": "60" },
      });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    let release = null;
    let downloadUrl = FALLBACK_DOWNLOAD_URL;
    let asset = null;

    try {
      const skipCache = url.searchParams.has("fresh") || url.searchParams.has("bust");
      release = await getLatestRelease(skipCache);
      const assets = release.assets || [];
      const zipAsset = assets.find((a) => a.name.toLowerCase().endsWith(".zip")) || assets[0];
      if (zipAsset?.browser_download_url) {
        downloadUrl = zipAsset.browser_download_url;
        asset = zipAsset;
      }
    } catch (err) {
      console.warn("Could not fetch latest release, using fallback:", err.message);
    }

    if (path === "/version" || path === "/api/version") {
      return new Response(
        JSON.stringify(
          {
            game: "Shape Shifters",
            version: release?.tag_name || "v1.0.0",
            download_url: downloadUrl,
            asset: asset?.name || "ShapeShifters-v1.0.0.zip",
            size: asset?.size || null,
            published_at: release?.published_at || null,
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

    if (
      path === "/" ||
      path === "/download" ||
      path === "/download/" ||
      path === "/latest" ||
      path.endsWith(".zip")
    ) {
      return Response.redirect(downloadUrl, 302);
    }

    return new Response("Not found", { status: 404 });
  },
};
