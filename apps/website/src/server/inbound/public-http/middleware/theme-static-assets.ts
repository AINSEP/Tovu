import { readFileSync } from "node:fs";
import path from "node:path";
import express from "express";
import type { Express, NextFunction, Response } from "express";

import { resolvePathWithin } from "#src/contracts/core/index";

import { resolveThemeDirs } from "./theme-asset-dirs.js";
import { themeAssetSecurityHeaders } from "./theme-content-security-headers.js";

/** Whether an authenticated admin previewed `revision` (supplied by `theme-preview-refresh.ts`). */
type IsAuthenticatedPreviewRevision = (required: { revision: string }, optional: {}) => boolean;

/**
 * @file Serves a theme's own files at `/theme-assets/{themeId}/...` — originally `static`-tier only
 * (`css/`/`js/`, for `server/http/site/render.ts`'s static-tier branch, which rewrites a page's
 * `../css/`/`../js/` references to this prefix), EXTENDED 2026-08-12 to also cover `templated`-tier
 * theme folders (`content/themes/templated/`) so a Liquid theme's own images/screenshots — previously
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
 * `SOURCE_DIR_WRITABLE_EXTENSIONS`) — an `.svg` asset with embedded `<script>` was, and remains,
 * writable into ANY theme's (any tier's) plain asset folder (`fileGroup` classifies `.svg` "asset", "a
 * group that has never been read-only"). UPDATE 2026-08-13 (security pass Finding 1): the SERVE-side
 * risk that write-time gap used to carry — a direct GET on such a file executing its script,
 * same-origin with `/api/admin/*` — is now closed here, not in `explore.ts`: every response below
 * carries `themeAssetSecurityHeaders`' `Content-Security-Policy: sandbox` + `X-Content-Type-Options:
 * nosniff` (see that module's own header for the full reasoning and the options rejected). Write access
 * still means "the bytes land in the theme's folder," but no longer means "a direct request to them
 * executes as a document" — see `theme-content-security-headers.ts`.
 *
 * Anyone reasoning about what write access to a theme's files can expose over HTTP must start from
 * "every root passed to `themeRoots` is fully public, whole-folder," not from a narrower claim.
 *
 * `declarative`-tier themes (`content/themes/declarative/`) and the not-yet-built `handlebars` tier are
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
export function registerThemeStaticAssets(
  app: Express,
  required: { themeRoots: readonly string[]; serveStatic?: typeof express.static; isAuthenticatedPreviewRevision?: IsAuthenticatedPreviewRevision },
): void {
  const serveStatic = required.serveStatic ?? express.static;
  const roots = required.themeRoots.map((dir) => path.resolve(dir));

  app.use(["/theme-assets/:themeId", "/theme-preview-assets/:revision/:themeId"], themeAssetSecurityHeaders, (req, res, next) => {
    const themeDirs = resolveThemeDirs({ roots, themeId: req.params.themeId }, {});
    const requestedRevision = req.params.revision;
    const preview = typeof requestedRevision === "string";
    const serveFrom = (index: number): void => {
      const themeDir = themeDirs[index];
      if (themeDir === undefined) {
        next();
        return;
      }
      if (preview) res.set("Cache-Control", "no-store");
      const nextDir = (): void => serveFrom(index + 1);
      const revision = preview
        ? trustedPreviewRevision(
          { requestedRevision, localsRevision: res.locals?.themePreviewRevision },
          { isAuthenticatedPreviewRevision: required.isAuthenticatedPreviewRevision },
        )
        : undefined;
      if (revision !== undefined && (req.method === "GET" || req.method === "HEAD") && sendPreviewCss({ res, themeDir, url: req.url, revision, next, nextDir })) return;

      // Explicit dotfiles policy makes send check every segment; its legacy default allows hidden directories.
      serveStatic(themeDir, { dotfiles: "deny", ...(preview ? { cacheControl: false, etag: false, lastModified: false } : {}) })(req, res, (err?: unknown) => (err ? next(err) : nextDir()));
    };
    serveFrom(0);
  });
}

/**
 * The preview revision a `/theme-preview-assets/:revision/...` request's CSS may be rewritten for:
 * the one an upstream middleware already authenticated (`res.locals.themePreviewRevision`) when set,
 * otherwise the URL's own revision if it is well-formed and the predicate trusts it.
 *
 * A set but non-string `localsRevision` still wins over the URL's revision and yields `undefined`,
 * so nothing is rewritten.
 * @returns The revision string, or `undefined` when no CSS rewrite is allowed.
 */
function trustedPreviewRevision(
  required: { requestedRevision: string; localsRevision: unknown },
  optional: { isAuthenticatedPreviewRevision?: IsAuthenticatedPreviewRevision },
): string | undefined {
  const { requestedRevision } = required;
  const revision = required.localsRevision ?? (
    /^[\w-]{1,100}$/.test(requestedRevision) && optional.isAuthenticatedPreviewRevision?.({ revision: requestedRevision }, {})
      ? requestedRevision : undefined
  );
  return typeof revision === "string" ? revision : undefined;
}

/**
 * Serves one theme folder's CSS file with its root-relative `/theme-assets/` references pointed at
 * `revision`'s preview prefix, when the request names such a file.
 *
 * Only authenticated preview CSS changes bytes; public static responses retain their cache policy.
 * @returns `false` when the request is not rewritable CSS (the caller serves it statically);
 * `true` once the request is answered, handed to `next` (undecodable path) or handed to `nextDir`
 * (the file cannot be read in this folder).
 * @complexity O(file size) for the read and rewrite.
 */
function sendPreviewCss(required: { res: Response; themeDir: string; url: string; revision: string; next: NextFunction; nextDir: () => void }): boolean {
  let relativePath: string;
  try { relativePath = decodeURIComponent(required.url.replace(/\?[\s\S]*/, "")).replace(/^\/+/, ""); }
  catch { required.next(); return true; }
  const cssPath = resolvePathWithin({ root: required.themeDir, segment: relativePath }, {});
  if (!cssPath || !isRewritableCssPath(relativePath)) return false;
  try {
    const css = readFileSync(cssPath, "utf8");
    required.res.type("css").send(previewCss({ css, revision: required.revision }));
  } catch { required.nextDir(); }
  return true;
}

/** A `.css` file (any case) with no dot-prefixed segment anywhere in its theme-relative path. */
function isRewritableCssPath(relativePath: string): boolean {
  return relativePath.toLowerCase().endsWith(".css") && !relativePath.split(/[\\/]/).some((segment) => segment.startsWith("."));
}

/** `css` with every `url(...)`/`@import` reference to `/theme-assets/` moved under `revision`'s preview prefix. */
function previewCss(required: { css: string; revision: string }): string {
  // Match root-relative references, preserving external hosts and existing query/fragment tails.
  return required.css.replace(/((?:url\(\s*["']?|@import\s+["']))\/theme-assets\//gi,
    `$1/theme-preview-assets/${encodeURIComponent(required.revision)}/`);
}
