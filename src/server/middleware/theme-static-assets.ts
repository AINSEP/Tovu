import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import express from "express";
import type { Express } from "express";

/**
 * @file Serves each `static`-tier theme's own `css/` and `js/` folders at
 * `/theme-assets/{themeId}/{css,js}/...`, straight from the theme's source directory — not a
 * prebuilt copy. `server/http/site/render.ts`'s static-tier branch rewrites a page's `../css/`
 * and `../js/` references (correct only from inside the theme's own `pages/` folder) to this
 * prefix before serving it as the live site's response.
 *
 * Deliberately mounts every discovered static theme's assets, not just the currently active one:
 * switching the active theme is a DB write with no server restart, and pre-mounting means that
 * switch takes effect immediately rather than 404ing until the next boot.
 *
 * `pages/*.html` inside each theme dir end up reachable too (`express.static` serves whatever's
 * under the mounted root) — harmless: the same non-secret files `render.ts` already serves through
 * the real route, just also directly, so there's no meaningful new exposure to guard against.
 */
export function registerThemeStaticAssets(app: Express, required: { themesStaticDir: string }): void {
  const { themesStaticDir } = required;
  if (!existsSync(themesStaticDir)) return;

  for (const themeId of readdirSync(themesStaticDir)) {
    const themeDir = path.join(themesStaticDir, themeId);
    if (statSync(themeDir).isDirectory()) {
      app.use(`/theme-assets/${themeId}`, express.static(themeDir));
    }
  }
}
