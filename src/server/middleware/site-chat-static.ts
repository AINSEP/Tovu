import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import type { Express } from "express";

/**
 * @file Serves the built public site-chat bundle at `/site-chat` (ADR-054 Task 2/3).
 *
 * Purpose:
 * `apps/site-chat` is the SECOND browser build target in this repo (`apps/admin` is the first,
 * served by `admin-static.ts`, which this file deliberately does not reuse — the two bundles have
 * different shapes: an SPA with client-side routing vs. one self-mounting script). `vite build`
 * there emits `dist/site-assistant.js` (+ `.css`) in library/IIFE mode — a single file meant to be
 * loaded with a plain `<script defer src="/site-chat/site-assistant.js">`, not navigated to as a
 * page. `src/server/http/site/render.ts` injects that tag on every themed page.
 *
 * No SPA fallback (unlike `admin-static.ts`'s `index.html` catch-all): there is no client-side
 * routing here to fall back for, and `express.static` 404ing a request for an unbuilt asset is the
 * correct, harmless outcome — a themed page's `<script defer>` failing to load just means the chat
 * widget does not appear; nothing else on the page depends on this bundle.
 *
 * Dev-proxy mode (`TOVU_SITE_CHAT_DEV_PROXY_URL`, e.g. `http://localhost:5174`): mirrors
 * `admin-static.ts`'s identical convention for the same reason — redirects instead of serving
 * `distDir`, so iterating on the widget never shows a stale build.
 */
export function registerSiteChatStatic(app: Express, required: { distDir: string }): void {
  const { distDir } = required;

  const devProxyUrl = process.env.TOVU_SITE_CHAT_DEV_PROXY_URL;
  if (devProxyUrl) {
    app.get("/site-chat/*", (req, res) => {
      res.redirect(302, `${devProxyUrl}${req.originalUrl.replace(/^\/site-chat/, "")}`);
    });
    return;
  }

  if (existsSync(path.join(distDir, "site-assistant.js"))) {
    app.use("/site-chat", express.static(distDir));
  }
  // Unbuilt and no dev proxy configured: register nothing. `express.static` never mounted means a
  // request for `/site-chat/site-assistant.js` falls through to whatever the site's own `/:slug`
  // catch-all does with it (a normal 404), same failure mode as any other missing static asset —
  // deliberately not a 503 page like `admin-static.ts`'s, since nothing here is a page a visitor
  // navigates to directly.
}
