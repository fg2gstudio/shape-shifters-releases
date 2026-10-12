/**
 * Cloudflare Worker for Shape Shifters Release Downloads
 * FG2G Studio
 * 
 * Dynamically queries the GitHub Releases API for the latest published release.
 * Whenever a new release is published on GitHub, this Worker automatically
 * detects it and redirects players to the latest download asset.
 */

const REPO_OWNER = "fg2gstudio";
const REPO_NAME = "shape-shifters-releases";
const GITHUB_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

// Fallback in case GitHub API is unreachable or rate-limited
const FALLBACK_DOWNLOAD_URL = "https://github.com/fg2gstudio/shape-shifters-releases/releases/download/v1.0.0/ShapeShifters-v1.0.0.zip";

async function fetchLatestRelease(forceFresh = false) {
  const fetchOptions = {
    headers: {
      "User-Agent": "FG2G-ShapeShifters-Worker/1.0",
      "Accept": "application/vnd.github+json",
    },
    // Cloudflare edge caching: cache GitHub API response for 60 seconds
    // to protect against GitHub rate-limits while keeping releases fresh.
    cf: forceFresh ? { cacheTtl: 0 } : { cacheTtl: 60, cacheEverything: true },
  };

  const response = await fetch(GITHUB_API_URL, fetchOptions);
  if (!response.ok) {
    throw new Error(`GitHub API returned status ${response.status}`);
  }
  return await response.json();
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.toLowerCase();
    const isFresh = url.searchParams.has("fresh") || url.searchParams.has("bust");

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    let releaseData = null;
    let downloadUrl = FALLBACK_DOWNLOAD_URL;
    let assetInfo = null;

    try {
      releaseData = await fetchLatestRelease(isFresh);
      // Find the primary zip asset
      const assets = releaseData.assets || [];
      const zipAsset = assets.find((a) => a.name.toLowerCase().endsWith(".zip")) || assets[0];
      if (zipAsset && zipAsset.browser_download_url) {
        downloadUrl = zipAsset.browser_download_url;
        assetInfo = zipAsset;
      }
    } catch (err) {
      console.error("Failed to fetch latest GitHub release:", err);
      // Falls back safely to FALLBACK_DOWNLOAD_URL
    }

    // 1. JSON Version API: /version, /api/version, /info
    // Useful for website frontend, game launcher, or auto-updater
    if (path === "/version" || path === "/api/version" || path === "/info") {
      return new Response(
        JSON.stringify(
          {
            game: "Shape Shifters",
            studio: "FG2G Studio",
            version: releaseData ? releaseData.tag_name : "v1.0.0",
            name: releaseData ? releaseData.name : "Shape Shifters",
            download_url: downloadUrl,
            asset_filename: assetInfo ? assetInfo.name : "ShapeShifters-v1.0.0.zip",
            size_bytes: assetInfo ? assetInfo.size : null,
            release_page: releaseData ? releaseData.html_url : `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`,
            published_at: releaseData ? releaseData.published_at : null,
            notes: releaseData ? releaseData.body : null,
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

    // 2. Direct Download Redirect: /, /download, /latest, /get
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

    // 3. Fallback 404
    return new Response(
      `Shape Shifters Release Worker - FG2G Studio\n\nEndpoints:\n- /download : Redirects dynamically to the latest game release\n- /version  : Returns JSON with latest version & download info\n\nOfficial releases: https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`,
      {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }
    );
  },
};
