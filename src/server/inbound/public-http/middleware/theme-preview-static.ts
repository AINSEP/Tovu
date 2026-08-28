import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import express from "express";
import type { Express } from "express";

import { themeAssetSecurityHeaders } from "./theme-content-security-headers.js";

/**
 * @file SPIKE — serves each `static`-tier theme's own preview build (under its `preview` folder in
 * `content/themes/static`) at `/theme-preview/{themeId}/{dark or light}/...`, so a `static` theme can be
 * opened in a real browser against the running Tovu server instead of only a standalone
 * `python3 -m http.server`.
 *
 * This is NOT the real theme loader. The `static` tier is not wired into
 * `src/features/theme/theme.ts` or `server/http/site/render.ts` — there is no active-theme
 * selection here, no `data-tovu-slot` resolution happening server-side, nothing DB-backed. Each
 * theme's own `build-preview.mjs` already does the slot/token stitching ahead of time; this
 * middleware only serves the resulting static files. Mirrors `site-chat-static.ts`'s
 * existence-gated, no-SPA-fallback convention: if a theme's `preview/` directory hasn't been built
 * yet, nothing is mounted for it and the request falls through to a normal 404 — same failure mode
 * as any other missing static asset, not a 503.
 *
 * SECURITY (2026-08-13, security pass Finding 1): a SEPARATE `express.static` mount from
 * `theme-static-assets.ts`, found while enumerating every path that serves a theme's raw files — this
 * one was independently exposed to the identical `.svg`/`.html` script-execution risk (an admin can PUT
 * into `preview/…` via Explore's PUT route today; `isGeneratedThemePath` only filters that folder out
 * of the Explore file LISTING, not out of what PUT will accept — see `explore.ts`'s own note on this).
 * Carries the same `themeAssetSecurityHeaders` fix as that mount, for the same reasoning — see that
 * module's header. Two independent mounts serving the same class of content is exactly why that fix
 * lives in one shared function both call, rather than being reimplemented here.
 */
export function registerThemePreviewStatic(app: Express, required: { themesStaticDir: string }): void {
  const { themesStaticDir } = required;
  if (!existsSync(themesStaticDir)) return;

  for (const themeId of readdirSync(themesStaticDir)) {
    const previewDir = path.join(themesStaticDir, themeId, "preview");
    if (existsSync(previewDir)) {
      app.use(`/theme-preview/${themeId}`, themeAssetSecurityHeaders, express.static(previewDir));
    }
  }
}
