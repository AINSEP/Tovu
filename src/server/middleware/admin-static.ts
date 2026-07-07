import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import type { Express, Response } from "express";

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

interface SeaApi {
  isSea(): boolean;
  getAsset(key: string): ArrayBuffer;
}

/** Loads node:sea when running inside a single-executable build. */
function seaApi(): SeaApi | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sea = require("node:sea") as SeaApi;
    return sea.isSea() ? sea : null;
  } catch {
    return null;
  }
}

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
 */
export function registerAdminStatic(app: Express, required: { distDir: string }): void {
  const { distDir } = required;
  const indexHtml = path.join(distDir, "index.html");

  // Single-binary mode: the admin build is embedded as SEA assets.
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
        "<h1>Admin shell not built</h1><p>Run <code>npm run build</code> in <code>apps/admin</code>, or use the Vite dev server (<a href='http://localhost:5173'>localhost:5173</a>).</p>"
      );
  });
}
