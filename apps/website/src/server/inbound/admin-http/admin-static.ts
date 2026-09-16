import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import type { Express, Response } from "express";

import { createAdminDevProxyRequestHandler } from "./admin-dev-proxy.js";
import { seaApi } from "./sea-runtime.js";
import type { SeaApi } from "./sea-runtime.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

function sendSeaAsset(sea: SeaApi, key: string, res: Response): boolean {
  try {
    const asset = sea.getAsset(key);
    res.setHeader("Content-Type", MIME[path.extname(key)] ?? "application/octet-stream");
    res.end(Buffer.from(asset));
    return true;
  } catch {
    return false;
  }
}

/**
 * @file Serves the built admin SPA at /admin.
 *
 * Purpose:
 * In a packaged deployment (single binary or plain `node dist`), the admin
 * shell is static files built by Vite (`apps/admin/dist`). During SPA
 * navigation any /admin/* path must fall back to index.html.
 *
 * Behavior when no build exists (pure dev — Vite serves the shell itself):
 * /admin responds with a pointer to the Vite dev URL instead of 404ing.
 *
 * Dev-proxy mode (`TOVU_ADMIN_DEV_PROXY_URL`, e.g. `https://localhost:5173`):
 * proxies /admin/* to Vite's dev server instead of serving `distDir`, so a
 * stale build is never shown while iterating and the browser never leaves
 * this server's own origin (`https://localhost:3000/admin/`, not Vite's
 * `:5173`). Vite's HMR WebSocket is the one thing an ordinary request proxy
 * cannot carry — `admin-dev-proxy.ts`'s `registerAdminDevProxyUpgrade` (wired
 * from `index.ts` against the raw server, not this Express app) forwards the
 * `upgrade` event that carries it; see that module's doc for how a same-origin
 * proxy still gets a working HMR socket. Opt-in only — unset in
 * production/packaged builds, where this env var must never be set.
 *
 * Before this proxy, dev-proxy mode redirected the browser to Vite's own
 * origin instead — simpler (Vite's own WS client needs no help when the
 * browser is already on its origin), but it meant `:3000/admin/` never
 * actually worked, only redirected away from itself.
 */
export function registerAdminStatic(app: Express, required: { distDir: string }): void {
  const { distDir } = required;
  const indexHtml = path.join(distDir, "index.html");

  // Single-binary mode: the admin build is embedded as SEA assets. Always
  // wins over dev-proxy mode — a packaged binary has no "dev" concept.
  const sea = seaApi();
  if (sea) {
    app.get(["/admin", "/admin/"], (_req, res) => {
      sendSeaAsset(sea, "admin/index.html", res);
    });
    app.get("/admin/*", (req, res) => {
      const rel = req.path.replace(/^\/admin\//, "");
      if (sendSeaAsset(sea, `admin/${rel}`, res)) return;
      sendSeaAsset(sea, "admin/index.html", res);
    });
    return;
  }

  const devProxyUrl = process.env.TOVU_ADMIN_DEV_PROXY_URL;
  if (devProxyUrl) {
    app.get(["/admin", "/admin/*"], createAdminDevProxyRequestHandler(devProxyUrl));
    return;
  }

  if (existsSync(indexHtml)) {
    app.use("/admin", express.static(distDir));
    app.get("/admin/*", (_req, res) => {
      res.sendFile(indexHtml);
    });
    return;
  }

  app.get(["/admin", "/admin/*"], (_req, res) => {
    res
      .status(503)
      .type("html")
      .send(
        // Vite's dev server has been HTTPS-only (mkcert) since HTTP/2 landed there (51c59f5c) —
        // a plain http:// link here would fail to connect, same class of bug this whole change
        // fixes for `apps/admin/src/lib/site-url.ts`'s dev fallback.
        "<h1>Admin shell not built</h1><p>Run <code>npm run build</code> in <code>apps/admin</code>, or use the Vite dev server (<a href='https://localhost:5173'>localhost:5173</a>).</p>"
      );
  });
}
