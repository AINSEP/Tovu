import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import type { Express } from "express";

/**
 * @file Serves a theme's own files at `/theme-assets/{themeId}/...` — originally `static`-tier only
 * (`css/`/`js/`, for `server/http/site/render.ts`'s static-tier branch, which rewrites a page's
 * `../css/`/`../js/` references to this prefix), EXTENDED 2026-08-12 to also cover `templated`-tier
 * theme folders (`src/themes/templated/`) so a Liquid theme's own images/screenshots — previously
 * unreachable at any URL, the reason `storefront` ships zero images and `fashion-modern`'s hero photo
 * and admin-card screenshot both 404'd — can be requested the same way.
 *
 * `express.static(themeDir)` below is unscoped to any subpath — it serves a theme's ENTIRE folder,
 * every file, not just `css/`/`js/`/`assets/`. That was found while reviewing whether `build.sourceDir`
 * (a compiled theme's own framework source) is reachable over HTTP: it is, identically to every other
 * file in the theme, at `/theme-assets/{themeId}/{sourceDir}/...`. Extending this to `templated/`
 * folders makes a theme's own `templates/*.liquid` SOURCE fetchable too, e.g.
 * `/theme-assets/fashion-modern/templates/product.liquid` — a DELIBERATE, not overlooked, choice:
 * (a) it is already exactly as reachable for every static theme's `pages/*.html`, so this is
 * extending an existing "a theme's own folder is public" model to a second tier, not creating a new
 * exposure class; (b) `.liquid` carries no browser-executable MIME type (`express.static`'s
 * `send`/`mime-types` dependency has no entry for it, so it serves as `application/octet-stream`, not
 * `text/html` — verified by request in this change's own test), so unlike the `.svg`/`.html`/`.js`
 * XSS angle closed in `d822d87` for a compiled theme's `sourceDir`, there is no script-execution risk
 * from a bare GET on liquid source; and (c) theme markup is author content the theme's own installer
 * already accepted, not a secret. What this extension does NOT do: it does not touch, narrow, or
 * widen `explore.ts`'s WRITE-time file-extension gate (`isThemeFileWritable`/
 * `SOURCE_DIR_WRITABLE_EXTENSIONS`) — an `.svg` asset with embedded `<script>` was already writable
 * into ANY theme's (any tier's) plain asset folder before this change (per `d822d87`'s own commit
 * message: `fileGroup` classifies `.svg` "asset", "a group that has never been read-only") and is
 * still writable after it; this file only decides what's *servable* once written, and that risk
 * already existed, unwidened, for the `static` tier this mount has served since it existed. Closing
 * the underlying write-time gap is `explore.ts`'s call, not this file's.
 *
 * Anyone reasoning about what write access to a theme's files can expose over HTTP must start from
 * "every root passed to `themeRoots` is fully public, whole-folder," not from a narrower claim.
 *
 * `declarative`-tier themes (`src/themes/declarative/`) and the not-yet-built `handlebars` tier are
 * deliberately NOT in `themeRoots` here — no theme in either currently ships any asset a template
 * references by URL (declarative themes are pure JSON block trees; `handlebars/` has no theme folders
 * on disk at all yet), so adding either root would be speculative, untestable dead code. Add a root
 * here the day a theme in that tier actually needs one.
 *
 * ONE dynamic route per root passed, not one `express.static` mount per theme.
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
export function registerThemeStaticAssets(app: Express, required: { themeRoots: readonly string[] }): void {
  const roots = required.themeRoots.map((dir) => path.resolve(dir));

  app.use("/theme-assets/:themeId", (req, res, next) => {
    const themeId = String(req.params.themeId ?? "");
    const themeDir = resolveThemeDir(roots, themeId);
    if (themeDir === null) {
      next();
      return;
    }
    express.static(themeDir)(req, res, next);
  });
}

/**
 * Resolve `<root>/<themeId>` to a real directory for the first `root` (checked in order) where it
 * exists, or `null` if no root has it — the multi-root generalization of the original single-root
 * function (unchanged validation per root, just tried across a list). Tie-break for a `themeId` that
 * happens to exist under more than one root: first root in `roots` wins — today's caller
 * (`app.ts`) always lists `themes/static` before `themes/templated`, so an accidental same-named
 * folder in both resolves to the static one, matching this mount's original (pre-extension) behavior
 * for every theme id that already existed under `themes/static`. No such collision exists on disk
 * today (verified: `ls themes/static themes/templated` share no folder name).
 *
 * Three separate refusals per root, because a path segment now arrives from the request rather than
 * from a `readdirSync` of trusted names:
 * - `..`/separators/absolute paths, rejected by re-resolving and requiring the result stay under
 *   that root — the standard containment check, kept even though Express decodes `:themeId` as a
 *   single segment, because that is a property of the routing layer rather than of this function.
 * - the `__original-themes__`/`__marketplace__` catalogs, whose whole purpose is to be a pristine
 *   copy nothing serves or runs; neither is a theme and must not be reachable as one.
 * - anything that simply is not there, which falls through to the next root, then to the normal 404.
 */
function resolveThemeDir(roots: readonly string[], themeId: string): string | null {
  if (themeId === "" || themeId.startsWith("__")) return null;
  for (const root of roots) {
    const candidate = path.resolve(root, themeId);
    if (candidate !== path.join(root, themeId)) continue;
    if (!candidate.startsWith(`${root}${path.sep}`)) continue;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}
