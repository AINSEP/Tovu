/**
 * @file The one `apiVersion`-aware map from a `static`-tier theme's logical parts (pages, partials,
 * scripts, stylesheet, canonical index page, the files a theme cannot load without) to their
 * on-disk, theme-RELATIVE paths — v1's flat layout (`pages/`, root `*.html` partials, `css/styles.css`,
 * `js/`) vs v2's nested one (`render/pages/`, `render/partials/`, `css/theme.css`, `scripts/`,
 * `development/docs/themes/theme-authoring-guide-v2.md` §3).
 *
 * 2026-08-19 architecture audit (`ADS-memory/reports/2026-08-19-codex-sol-bug-architecture-audit.md`,
 * findings 1 & 2): the v2 migration (`theme.ts`'s `loadStaticTierAssets`, this module's own origin)
 * updated the RENDER path correctly, but six other call sites each re-derived the same v1-vs-v2 path
 * facts independently (the admin "View Template" fetch, the Explore file classifier on both the server
 * route and the admin SPA, the missing-template diagnostic's stylesheet link, the static portability
 * generator) and drifted — some never updated at all. This module is the fix: every one of those
 * call sites now imports its `pagesDir`/`partialsDir`/`stylesheetPath`/`requiredFiles` from here
 * instead of re-spelling `apiVersion === 2 ? "render/pages" : "pages"` in its own file.
 *
 * Deliberately PURE — no `node:fs`/`node:path` import, only string operations on already-relative
 * theme paths (never a real filesystem path; joining against a theme's actual on-disk root stays each
 * caller's own job, exactly as it was before this module existed). That purity is what lets the admin
 * SPA (a browser bundle with no Node built-ins) import this module too, via the `@tovu/theme-layout`
 * alias (`apps/admin/vite.config.ts`/`vitest.config.ts`/`tsconfig.json`) — the same cross-runtime
 * precedent `src/contracts/headless` already established for wire-contract types, extended here to a pure
 * resolver function. Without this, the Explore screen's client-side rename-lock check and the server's
 * own classifier would need to independently agree on the same v1/v2 path facts forever — the exact
 * failure mode the audit found.
 */

/** One schema version's resolved layout. Every path here is theme-RELATIVE (no leading `/`, no
 *  `themeDir` prefix) — callers that need a real filesystem path still `join()` it themselves. */
export interface ThemeLayout {
  /** Folder holding this theme's page HTML files (`pagesDir/index.html`, `pagesDir/about.html`, …). */
  readonly pagesDir: string;
  /**
   * Folder holding this theme's partial HTML files (nav, footer, …) — `""` for v1, whose partials sit
   * AT the theme's own root rather than in a subfolder (`loadStaticTierAssets`'s own `partialsDir`
   * ternary, `theme.ts`). Every other layout field is a real folder name; this one is the one case a
   * caller must branch on before treating it as a normal path segment — see {@link isPartialFilePath}.
   */
  readonly partialsDir: string;
  /** Folder holding this theme's client-side scripts (`js` in v1, `scripts` in v2 — the folder itself
   *  renamed, not just its contents; theme-authoring-guide-v2.md §3). */
  readonly scriptsDir: string;
  /** Folder holding CSS — identical name in both schema versions; only the stylesheet's own filename
   *  differs (see {@link stylesheetFilename}). */
  readonly cssDir: string;
  /** This theme's one required stylesheet's bare filename (`styles.css` v1, `theme.css` v2). */
  readonly stylesheetFilename: string;
  /** `${cssDir}/${stylesheetFilename}`, theme-relative — what a page's own `<link>` resolves to from
   *  the theme's root (a render-relative `../` prefix, if needed, is the caller's own concern — see
   *  `static-asset-contract.ts`'s `tokenStylesheetSentinel`, the one caller that adds it). */
  readonly stylesheetPath: string;
  /** `${pagesDir}/index.html` — the one page every static theme must ship (`loadStaticTierAssets`'s
   *  own `pages.index` requirement). */
  readonly indexPagePath: string;
  /** Every file `loadTheme` cannot start without — its absence flips a theme's `status` to `"invalid"`
   *  (`theme.ts`: the `pages.index` check, plus `theme.json`/`tokens.json`'s own `readJson` failures).
   *  Renaming any of these away reproduces that same breakage — the set the Explore rename route
   *  hard-blocks (`explore.ts`'s `REQUIRED_THEME_FILES`, now derived from here instead of hand-copied).
   */
  readonly requiredFiles: readonly string[];
}

const V1_LAYOUT: ThemeLayout = {
  pagesDir: "pages",
  partialsDir: "",
  scriptsDir: "js",
  cssDir: "css",
  stylesheetFilename: "styles.css",
  stylesheetPath: "css/styles.css",
  indexPagePath: "pages/index.html",
  requiredFiles: ["pages/index.html", "theme.json", "tokens.json"],
};

const V2_LAYOUT: ThemeLayout = {
  pagesDir: "render/pages",
  partialsDir: "render/partials",
  scriptsDir: "scripts",
  cssDir: "css",
  stylesheetFilename: "theme.css",
  stylesheetPath: "css/theme.css",
  indexPagePath: "render/pages/index.html",
  requiredFiles: ["render/pages/index.html", "theme.json", "tokens.json"],
};

/**
 * Resolve a theme's layout from its manifest's `apiVersion`. `2` gets the v2 nested layout;
 * anything else (`undefined`, or any value other than `2` — every real theme on disk before the
 * Milestone 3 migration) gets v1's flat layout, matching `ThemeManifest.apiVersion`'s own documented
 * default (`theme.ts`).
 *
 * @complexity O(1) — returns one of two frozen constants, no allocation.
 */
export function resolveThemeLayout(apiVersion?: 2): ThemeLayout {
  return apiVersion === 2 ? V2_LAYOUT : V1_LAYOUT;
}

/**
 * Whether a theme-relative path is one of this layout's own page files — a prefix check only (no
 * extension requirement), matching the exact rule the pre-resolver `explore.ts` classifier used for
 * v1 (`relativePath.startsWith("pages/")`) so this is behavior-preserving for every already-shipped
 * v1 theme, not just a v2 addition.
 *
 * @complexity O(k) in `relativePath`'s length (one `startsWith` check).
 */
export function isPageFilePath(relativePath: string, apiVersion?: 2): boolean {
  return relativePath.startsWith(`${resolveThemeLayout(apiVersion).pagesDir}/`);
}

/**
 * Whether a theme-relative path is one of this layout's own partial files. v1's `partialsDir` is `""`
 * (the theme's own root — see {@link ThemeLayout.partialsDir}'s own doc), so a v1 partial is "a `.html`
 * file with no `/` in its path at all" (the pre-resolver `explore.ts` rule, preserved verbatim); a v2
 * partial is a `.html` file under `render/partials/`.
 *
 * @complexity O(k) in `relativePath`'s length.
 */
export function isPartialFilePath(relativePath: string, apiVersion?: 2): boolean {
  if (!relativePath.endsWith(".html")) return false;
  const { partialsDir } = resolveThemeLayout(apiVersion);
  return partialsDir === "" ? !relativePath.includes("/") : relativePath.startsWith(`${partialsDir}/`);
}

/**
 * Named engine-specific subfolders under a themes root, one per {@link ThemeTier} except `code`
 * (not built yet) — every tier's themes live under its own subfolder so `themes/` doesn't mix
 * formats in one flat listing (2026-08-10: `declarative` moved off the bare top level, and the
 * LiquidJS-tier folder renamed from `liquidjs/` to `templated/` to match its `ThemeTier` value —
 * `templated` names the tier, not the engine, so more templating engines can land under this same
 * folder later without another rename). Scanning a missing subfolder is a no-op (`discoverThemes`'s
 * own missing-dir ⇒ empty-list behavior), so adding an engine here ahead of its first theme costs
 * nothing.
 *
 * Exported because it is also the containment boundary the `themes` agent-tool domain enforces
 * (`agent-tools.ts`/`tool-registrations.ts`): a theme folder that is not a direct child of the
 * themes root or of one of THESE subfolders is not a recognized theme root, and no agent-driven file
 * write may resolve into it.
 */
// Before extraction, theme-files imported these names from theme discovery, which imported
// GENERATED_THEME_DIRS/isSourceDirGeneratedConflict back. That cycle was safe only because those
// values were consumed inside loadTheme, never at module evaluation; the layout leaf removes it.
export const ENGINE_SUBFOLDERS = ["declarative", "templated", "handlebars", "static"] as const;

/**
 * The pristine-originals catalog under a themes root: shipped themes kept untouched so a copy can
 * always be compared against, reset to, or re-forked from what it started as.
 *
 * It is NOT a tier and NOT a theme — it holds its own `<tier>/<theme>/` tree — so discovery skips it
 * outright. A catalog theme is never runnable, never listed, and never the active theme; it becomes
 * either of those only by being COPIED into a real tier folder, which is the whole point: editing
 * your copy can never damage the thing you'd want to compare it against.
 *
 * The `__` prefix is load-bearing rather than decorative. It makes "this is not an installed theme"
 * a property of the name that any code path can check, instead of a list every new write path has to
 * remember to consult — see the containment note on {@link ENGINE_SUBFOLDERS}, which already refuses
 * agent-driven writes to anything that isn't a direct child of the root or of an engine subfolder.
 */
export const THEME_CATALOG_DIR = "__original-themes__";
