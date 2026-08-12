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
 * The exact literal `<link>` tag {@link import("./static-render").renderStaticPage} string-matches to
 * splice design tokens in front of. A build that reorders attributes, changes quoting, or hashes the
 * stylesheet filename makes token injection silently no-op — the page renders with no error and no
 * design tokens. See `static-render.ts`'s own `renderStaticPage` for the runtime (warn-and-continue)
 * use of this constant, and `build-conformance.ts` for the install-time (hard-fail) use of it.
 */
export const TOKEN_STYLESHEET_SENTINEL = '<link rel="stylesheet" href="../css/styles.css" />';

/**
 * A static page's `<link>`/`<script>` tags use `../css/`, `../js/` — correct only from inside the
 * theme's own `pages/` folder on disk. Rewritten generically (not per-filename, unlike the
 * per-theme build script) so the engine never needs updating when a theme adds a new script.
 *
 * Matches both double- and single-quoted attribute values (`href="../css/x.css"` and
 * `href='../css/x.css'`) — HTML permits either, and nothing upstream of this function normalizes a
 * theme author's (or their formatter's) quote-style choice before it reaches here. The captured quote
 * character is echoed back verbatim so `'` is never silently normalized to `"`.
 *
 * Deliberately does NOT match an unquoted value (`href=../css/x.css`) or whitespace around `=`
 * (`href = "../css/x.css"`) — both are valid HTML5, but neither is emitted by any formatter or
 * template engine in this codebase's toolchain, and none of the 7 shipped static themes use them
 * (verified by grep across every `pages/*.html` file in each of the 7 themes under `src/themes/static`).
 * Handling every HTML attribute-syntax
 * variant here would trade a real, observed bug (quote style) for defense against a hypothetical one.
 * Any `../css/`/`../js/` reference this function still can't rewrite — for that reason or any other —
 * is caught by {@link findUnrewrittenAssetPaths} and reported the same way `renderStaticPage`'s
 * missing-token-sentinel case already is: loudly, not silently. A silently-unrewritten asset path is
 * exactly the bug class this whole function exists to close, so leaving a residual case undetectable
 * would just relocate it rather than fix it.
 */
export function rewriteAssetPaths(html: string, themeId: string): string {
  return html
    .replace(/href=(["'])\.\.\/css\//g, (_match, quote: string) => `href=${quote}/theme-assets/${themeId}/css/`)
    .replace(/src=(["'])\.\.\/js\//g, (_match, quote: string) => `src=${quote}/theme-assets/${themeId}/js/`);
}

/**
 * Any `href`/`src` reference into `../css/` or `../js/` still present after
 * {@link rewriteAssetPaths} has run — an unquoted attribute, whitespace around `=`, or any other
 * syntax that rewrite doesn't recognize. Run AFTER the rewrite, so a match here can only be a
 * genuine miss: every quoted occurrence the rewrite is supposed to handle is already gone by this
 * point. Scoped to `href=`/`src=` specifically (not a bare `../css/` substring search) to avoid
 * false positives from incidental text elsewhere in the page (a comment, authored copy).
 *
 * @complexity O(n) over `html`'s length — one regex scan.
 */
export function findUnrewrittenAssetPaths(html: string): string[] {
  return Array.from(html.matchAll(/(?:href|src)\s*=\s*(['"]?)\.\.\/(?:css|js)\//g), (m) => m[0]);
}
