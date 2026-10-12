# Shape Shifters — Production Releases

Welcome to the official production release repository for **Shape Shifters**, developed by **FG2G Studio**.

---

## 🎮 Downloads

Official production builds are published as [GitHub Releases](https://github.com/fg2gstudio/shape-shifters-releases/releases).

| Version | Platform | Asset | Status | Direct Download |
| :--- | :--- | :--- | :--- | :--- |
| **v1.0.0** | Windows PC (64-bit) | `ShapeShifters-v1.0.0.zip` | Latest Production | [Direct Download](https://github.com/fg2gstudio/shape-shifters-releases/releases/download/v1.0.0/ShapeShifters-v1.0.0.zip) |

---

## ⚡ Cloudflare Worker (Dynamic Release Redirect)

This repository includes a dynamic Cloudflare Worker (`worker.js` + `wrangler.toml`) that automatically fetches the latest release from the GitHub API and redirects downloads without requiring manual updates.

### Endpoints:
- `GET /download` or `GET /` — Dynamically redirects (HTTP 302) to the latest `.zip` release asset.
- `GET /version` — Returns JSON metadata about the latest release (version tag, download URL, size, notes).

### Deployment:
```bash
# 1. Login to Cloudflare (one-time setup)
npx wrangler login

# 2. Deploy the Worker
npx wrangler deploy
```

---

## 🚀 Installation & Play Instructions (Windows PC)

1. Download `ShapeShifters-v1.0.0.zip` from the release link or Cloudflare redirect.
2. Extract the archive to your preferred directory.
3. Run `ShapeShifters.exe` (or the game launcher) to play.

---

## 📄 License & Intellectual Property

Copyright © 2026 FG2G Studio. All rights reserved.
Game assets and binaries are provided under the [FG2G Studio Proprietary End User License Agreement (EULA)](./LICENSE).
