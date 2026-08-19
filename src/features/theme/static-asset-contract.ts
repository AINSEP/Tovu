/**
 * @file The literal on-disk contract a `static`-tier page's raw HTML must satisfy for
 * `static-render.ts` to inject design tokens and resolve asset paths at request time.
 *
 * Split out of `static-render.ts` (2026-08-12, ADR-020 §5) so the install-time build-conformance gate
 * (`build-conformance.ts`) can depend on the EXACT SAME sentinel string and asset-path detection
 * `static-render.ts` uses at request time, without creating an import cycle: `static-render.ts`
 * already imports `theme.ts` (for `DEFAULT_THEME_SLOTS` and types), and `theme.ts`'s `loadTheme()` is
 * where the install-time gate has to run (see `build-conformance.ts`'s own header) — a module that
 * neither of those needs to import through is what breaks that cycle. Nothing changed behaviorally
 * when this moved; `static-render.ts` re-imports the same three names it always had, verbatim.
 */

/**
 * The exact literal `<link>` tag {@link import("./static-render.js").renderStaticPage} string-matches to
 * splice design tokens in front of, for a v1-shaped theme (absent `theme.json` `apiVersion`, every
 * theme on disk as of this writing). A build that reorders attributes, changes quoting, or hashes the
 * stylesheet filename makes token injection silently no-op — the page renders with no error and no
 * design tokens. See `static-render.ts`'s own `renderStaticPage` for the runtime (warn-and-continue)
 * use of this constant, and `build-conformance.ts` for the install-time (hard-fail) use of it.
 *
 * See {@link TOKEN_STYLESHEET_SENTINEL_V2} for the v2-shaped counterpart and
 * {@link tokenStylesheetSentinel} for the selector both call sites actually use — this constant stays
 * exported under its original name so nothing already depending on the v1 literal has to change.
 */
export const TOKEN_STYLESHEET_SENTINEL = '<link rel="stylesheet" href="../css/styles.css" />';

/**
 * The v2 counterpart of {@link TOKEN_STYLESHEET_SENTINEL} — schema v2
 * (`development/docs/themes/theme-authoring-guide-v2.md` §3) renames a theme's single required
 * stylesheet from `css/styles.css` to `css/theme.css`; the folder name (`css/`) is unchanged, only the
 * filename. Selected by {@link tokenStylesheetSentinel}, never matched directly.
 */
export const TOKEN_STYLESHEET_SENTINEL_V2 = '<link rel="stylesheet" href="../css/theme.css" />';

/**
 * Picks the stylesheet sentinel a theme's declared `apiVersion` expects — `2` gets
 * {@link TOKEN_STYLESHEET_SENTINEL_V2}, anything else (absent, or any value other than `2` — every
 * real theme on disk today) gets the original {@link TOKEN_STYLESHEET_SENTINEL}. Added so migrating a
 * theme's on-disk file shape (`css/styles.css` -> `css/theme.css`) doesn't silently break token
 * injection for that theme while leaving every un-migrated theme's request-time rendering byte-for-
 * byte unchanged — see the Milestone 3 dry-run checkpoint (Blocker A,
 * `ADS-memory/reports/continuity/theme-v2-validator-build/progress-ledger.md`) for why this couldn't
 * be a global rename of the one constant instead.
 */
export function tokenStylesheetSentinel(apiVersion?: 2): string {
  return apiVersion === 2 ? TOKEN_STYLESHEET_SENTINEL_V2 : TOKEN_STYLESHEET_SENTINEL;
}

/**
 * A static page's `<link>`/`<script>` tags use `../css/`, `../js/` (v1) or `../css/`, `../scripts/`
 * (v2, `apiVersion: 2`) — correct only from inside the theme's own `pages/` (v1) or `render/pages/`
 * (v2) folder on disk. Rewritten generically (not per-filename, unlike the per-theme build script) so
 * the engine never needs updating when a theme adds a new script. `css/`'s folder name is identical in
 * both schema versions — only the JS-bearing folder's name changes.
 *
 * Matches both double- and single-quoted attribute values (`href="../css/x.css"` and
 * `href='../css/x.css'`) — HTML permits either, and nothing upstream of this function normalizes a
 * theme author's (or their formatter's) quote-style choice before it reaches here. The captured quote
 * character is echoed back verbatim so `'` is never silently normalized to `"`.
 *
 * Deliberately does NOT match an unquoted value (`href=../css/x.css`) or whitespace around `=`
 * (`href = "../css/x.css"`) — both are valid HTML5, but neither is emitted by any formatter or
 * template engine in this codebase's toolchain, and none of the shipped static themes use them
 * (verified by grep across every `pages/*.html` file in each real theme under `src/themes/static`).
 * Handling every HTML attribute-syntax
 * variant here would trade a real, observed bug (quote style) for defense against a hypothetical one.
 * Any `../css/`/`../js/`/`../scripts/` reference this function still can't rewrite — for that reason or
 * any other — is caught by {@link findUnrewrittenAssetPaths} and reported the same way
 * `renderStaticPage`'s missing-token-sentinel case already is: loudly, not silently. A
 * silently-unrewritten asset path is exactly the bug class this whole function exists to close, so
 * leaving a residual case undetectable would just relocate it rather than fix it.
 */
export function rewriteAssetPaths(html: string, themeId: string, apiVersion?: 2): string {
  const cssRewritten = html.replace(
    /href=(["'])\.\.\/css\//g,
    (_match, quote: string) => `href=${quote}/theme-assets/${themeId}/css/`
  );
  return apiVersion === 2
    ? cssRewritten.replace(
        /src=(["'])\.\.\/scripts\//g,
        (_match, quote: string) => `src=${quote}/theme-assets/${themeId}/scripts/`
      )
    : cssRewritten.replace(
        /src=(["'])\.\.\/js\//g,
        (_match, quote: string) => `src=${quote}/theme-assets/${themeId}/js/`
      );
}

/** Matches an unrewritten `../css/`/`../js/` reference — v1's pair, see {@link findUnrewrittenAssetPaths}. */
const UNREWRITTEN_ASSET_PATTERN_V1 = /(?:href|src)\s*=\s*(['"]?)\.\.\/(?:css|js)\//g;
/**
 * Matches an unrewritten `../css/`/`../scripts/` reference — v2's own pair — PLUS a stray `../js/`
 * reference: {@link rewriteAssetPaths} never rewrites `../js/` for a v2 theme (v2 has no `js/` folder),
 * so a page that still references it (an incomplete migration, a copy-pasted v1 script tag) would
 * otherwise 404 in the browser with no warning at all — the exact silent-failure class this whole
 * detect-after-rewrite pair exists to close. See {@link findUnrewrittenAssetPaths}.
 */
const UNREWRITTEN_ASSET_PATTERN_V2 = /(?:href|src)\s*=\s*(['"]?)\.\.\/(?:css|scripts|js)\//g;

/**
 * Any `href`/`src` reference into the pair {@link rewriteAssetPaths} targets for this `apiVersion`
 * (`../css/`+`../js/` for v1, `../css/`+`../scripts/` for v2) still present after
 * {@link rewriteAssetPaths} has run — an unquoted attribute, whitespace around `=`, or any other
 * syntax that rewrite doesn't recognize. Run AFTER the rewrite, so a match here can only be a
 * genuine miss: every quoted occurrence the rewrite is supposed to handle is already gone by this
 * point. Scoped to `href=`/`src=` specifically (not a bare `../css/` substring search) to avoid
 * false positives from incidental text elsewhere in the page (a comment, authored copy).
 *
 * @complexity O(n) over `html`'s length — one regex scan.
 */
export function findUnrewrittenAssetPaths(html: string, apiVersion?: 2): string[] {
  const pattern = apiVersion === 2 ? UNREWRITTEN_ASSET_PATTERN_V2 : UNREWRITTEN_ASSET_PATTERN_V1;
  return Array.from(html.matchAll(pattern), (m) => m[0]);
}
