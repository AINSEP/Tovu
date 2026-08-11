import { existsSync } from "node:fs";
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
 * ONE dynamic route, not one `express.static` mount per theme.
 *
 * The per-theme version read the themes directory once at registration and mounted what it found,
 * which meant a theme created afterwards — downloaded, copied from the originals catalog, dropped in
 * by hand — served 404 for every asset until the process restarted. Re-running that loop is not a fix
 * either: Express mounts cannot be removed, so each rescan would stack another handler for the same
 * prefix, forever. Resolving the theme id per request has neither problem, and is less code.
 *
 * Assets are deliberately served for EVERY theme rather than only the active one: switching the
 * active theme is a DB write with no restart, and the admin previews inactive themes, so a request
 * for a non-active theme's CSS is normal traffic rather than something to defend against.
 */
export function registerThemeStaticAssets(app: Express, required: { themesStaticDir: string }): void {
  const { themesStaticDir } = required;
  const root = path.resolve(themesStaticDir);

  app.use("/theme-assets/:themeId", (req, res, next) => {
    const themeId = String(req.params.themeId ?? "");
    const themeDir = resolveThemeDir(root, themeId);
    if (themeDir === null) {
      next();
      return;
    }
    express.static(themeDir)(req, res, next);
  });
}

/**
 * Resolve `<root>/<themeId>` to a real directory, or `null` for anything that is not one.
 *
 * Three separate refusals, because a path segment now arrives from the request rather than from a
 * `readdirSync` of trusted names:
 * - `..`/separators/absolute paths, rejected by re-resolving and requiring the result stay under
 *   `root` — the standard containment check, kept even though Express decodes `:themeId` as a single
 *   segment, because that is a property of the routing layer rather than of this function.
 * - the `__original-themes__` catalog, whose whole purpose is to be a pristine copy nothing serves
 *   or runs; it is not a theme and must not be reachable as one.
 * - anything that simply is not there, which falls through to the normal 404 rather than throwing.
 */
function resolveThemeDir(root: string, themeId: string): string | null {
  if (themeId === "" || themeId.startsWith("__")) return null;
  const candidate = path.resolve(root, themeId);
  if (candidate !== path.join(root, themeId)) return null;
  if (!candidate.startsWith(`${root}${path.sep}`)) return null;
  if (!existsSync(candidate)) return null;
  return candidate;
}
