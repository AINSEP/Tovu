/**
 * @file Declarative theme package format + discovery (SPEC-004, spike slice).
 *
 * Purpose:
 * A theme is a folder of validated *data* — no executable code. This module
 * defines the on-disk shape, discovers theme folders, and resolves a route to a
 * template id. The template-tree renderer (`apps/website/src/server/inbound/public-http/http/site/render-site.ts`) turns
 * the resolved block tree into HTML.
 *
 * Spike scope (VibeCoder): discovery + a shallow validity check (required files
 * parse). The full SPEC-004 validation pipeline (CSS sanitization allowlist,
 * component-reference checks, size caps, id-collision rules) is deferred to the
 * proper SPEC-004 build. Treat this as exploratory, not test-certified.
 */
import { type TemplateNode, type ThemeManifest } from "./render-contract.js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { checkBuiltThemeConformance } from "./build-conformance.js";
import { resolveThemeLayout, THEME_CATALOG_DIR } from "./theme-layout.js";
import { stockThemesDir } from "../../platform/site-dir/product-root.js";
import { readJson, isObject } from "./theme-manifest-fields.js";
import { loadStaticTierAssets, inheritBundledTemplates, validateTemplateDeclarations } from "./theme-static-assets.js";
import { parseThemeManifest } from "./theme-manifest.js";
import { loadTemplateSources, validateRequiredTemplates } from "./theme-template-sources.js";




/** Design tokens: CSS custom-property name → value (emitted into `:root`). */
export type ThemeTokens = Record<string, string>;

/** A fully-loaded, discovered theme. */
export interface DiscoveredTheme {
  manifest: ThemeManifest;
  /**
   * Absolute path of the folder this theme was loaded from. Recorded at load time because it is the
   * one fact about a theme that discovery knows and no consumer can re-derive: a theme id alone does
   * not say whether the folder sits at the top level of `themes/` or under one of
   * {@link ENGINE_SUBFOLDERS}. The `themes` agent-tool domain (`agent-tools.ts`) resolves every
   * read/write against THIS value rather than re-deriving a path from the id, so an id can never be
   * used to steer a file operation at a folder discovery did not itself produce.
   */
  dir: string;
  tokens: ThemeTokens;
  /**
   * Light-mode token overrides (static tier only), from an optional `tokens.light.json` sibling to
   * `tokens.json`. Empty object when the theme ships no light variant — a static theme is not
   * required to support both modes, and an empty `:root[data-theme="light"] {}` override block is
   * harmless (it overrides nothing, so the page just stays on its dark values).
   */
  tokensLight: ThemeTokens;
  /** Template id (`home`, `post`, …) → block tree (declarative tier). */
  templates: Record<string, TemplateNode>;
  /** Template id → raw LiquidJS source (templated tier, ADR-020). */
  liquidTemplates: Record<string, string>;
  /** Template id → raw Handlebars source (handlebars tier, ADR-020). */
  handlebarsTemplates: Record<string, string>;
  /**
   * Page id → raw HTML document source (static tier only). Keyed by filename
   * minus `.html`, from `pages/*.html` — unlike `templates`/`liquidTemplates`/
   * `handlebarsTemplates`, these are already-complete `<!doctype html>` documents,
   * not route-driven block trees/fragments, because a static theme has no
   * templating language for a renderer to fill in.
   */
  pages: Record<string, string>;
  /** Theme-relative source paths inherited by the loader, for read-only source views.
   * Only declared, compatible bundled templates enter this map; physical site files win. */
  inheritedTemplateSources?: Readonly<Record<string, string>>;
  /**
   * Partial id → raw HTML source (static tier only): `nav`, `footer`, and any
   * `footer-*` variant (e.g. `footer-minimal`) found at the theme root. A static
   * page embeds these via `data-tovu-slot="nav"` / `data-tovu-slot="footer"`
   * markers rather than a template-include directive — resolving them is the
   * renderer's job, not something baked into the page HTML at author time.
   */
  partials: Record<string, string>;
  /** Raw theme stylesheet (unsanitized in the spike). */
  css: string;
  source: "built-in" | "site";
  status: "valid" | "invalid";
  /** Human-readable validation errors; empty when valid. */
  errors: string[];
}

/**
 * Read only the matching package original, never the site's potentially old reset copy.
 * Layout changes and compiled output require an explicit upgrade, not template inheritance.
 * @returns A validated static original, or undefined without a compatible package source.
 * @complexity O(b) bytes of one package theme; inheritance is disabled for the nested load.
 */
function readBundledTemplateFallback(
  { manifest, packageThemesDir }: { manifest: ThemeManifest; packageThemesDir: string | null },
  _options: Record<string, never> = {}
): DiscoveredTheme | undefined {
  if (packageThemesDir === null || manifest.tier !== "static" || manifest.build?.source === "compiled") return undefined;
  // Manifest ids are authored data: never let one select a path outside the package catalog.
  if (!/^[a-zA-Z0-9_-]+$/.test(manifest.id)) return undefined;
  const themeDir = join(packageThemesDir, THEME_CATALOG_DIR, manifest.tier, manifest.id);
  if (!existsSync(join(themeDir, "theme.json"))) return undefined;
  const bundled = loadTheme({ themeDir, id: manifest.id, source: "built-in" }, { packageThemesDir: null });
  return matchesSiteTheme({ bundled, manifest }) ? bundled : undefined;
}

/** A package original stands in only when it is valid and has the site theme's tier and API version. */
function matchesSiteTheme({ bundled, manifest }: { bundled: DiscoveredTheme; manifest: ThemeManifest }, _options: Record<string, never> = {}): boolean {
  return bundled.status === "valid" && bundled.manifest.tier === manifest.tier && bundled.manifest.apiVersion === manifest.apiVersion;
}

/** Read `tokens.json`. Never throws — a read/parse failure degrades to an empty token map plus
 * one error, the same REQ-10 contract {@link parseThemeManifest} follows for `theme.json`. */
function loadThemeTokens({ themeDir }: { themeDir: string }, _optional = {}): { tokens: ThemeTokens; errors: string[] } {
  try {
    const raw = readJson({ path: join(themeDir, "tokens.json") });
    if (!isObject(raw)) throw new Error("tokens.json is not an object");
    return { tokens: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v)])), errors: [] };
  } catch (err) {
    return { tokens: {}, errors: [`tokens.json: ${(err as Error).message}`] };
  }
}

/**
 * The install-time gate for a built release (ADR-020 §5) — only runs for `build.source:
 * "compiled"` (a no-op otherwise, so every theme on disk today is unaffected). Needs
 * `pages`/`partials`, so {@link loadTheme} cannot call this any earlier than after
 * {@link loadStaticTierAssets} — see `build-conformance.ts`'s own header for what it checks and
 * why a hard failure here, not a runtime warning, is the point.
 */
function checkCompiledBuildConformance({ manifest, themeDir, pages, partials }: { manifest: ThemeManifest; themeDir: string; pages: Readonly<Record<string, string>>; partials: Readonly<Record<string, string>> }, _optional = {}): string[] {
  if (manifest.build?.source !== "compiled") return [];
  return checkBuiltThemeConformance({
    themeId: manifest.id,
    themeDir,
    sourceDir: manifest.build.sourceDir,
    pages,
    partials,
    artifactHashes: manifest.build.artifactHashes ?? {},
    apiVersion: manifest.apiVersion,
  }).map((issue) => `build conformance (${issue.rule}) '${issue.page}': ${issue.message}`);
}

/**
 * v1: static keeps CSS under `css/styles.css` (alongside sibling `js/` and `pages/` folders);
 * every other tier keeps a lone `styles.css` at the theme root, the flat single-stylesheet shape
 * that fits a route-map-only theme. v2 unifies every tier onto `css/theme.css`
 * (theme-authoring-guide-v2.md §3) — same folder name static already used, new filename, and now
 * every tier gets the `css/` folder rather than just static.
 */
function loadThemeCss({ themeDir, manifest }: { themeDir: string; manifest: ThemeManifest }, _optional = {}): string {
  let cssFile = "css/theme.css";
  if (manifest.apiVersion !== 2) cssFile = manifest.tier === "static" ? "css/styles.css" : "styles.css";
  const cssPath = join(themeDir, cssFile);
  return existsSync(cssPath) ? readFileSync(cssPath, "utf8") : "";
}

/**
 * The pages/partials half of loading: the static tier's on-disk layout, bundled-template inheritance,
 * and the declaration and compiled-build conformance checks over them, errors in discovery order.
 */
function loadThemeAssets(required: { themeDir: string; siteManifest: ThemeManifest; packageThemesDir: string | null }, _optional = {}) {
  const { themeDir, siteManifest, packageThemesDir } = required;
  const errors: string[] = [];
  // The static tier's whole on-disk layout — light tokens, pages/, root partials — loaded in one
  // call rather than as branches threaded through the tier-agnostic loading below. Empty for every
  // other tier, so nothing here needs to re-test which tier this is.
  const { tokensLight, pages: sitePages, partials, errors: staticErrors } = loadStaticTierAssets({
    themeDir,
    tier: siteManifest.tier,
    slots: siteManifest.slots,
    apiVersion: siteManifest.apiVersion,
  });
  errors.push(...staticErrors);
  const { manifest, pages, inheritedTemplateSources } = inheritBundledTemplates({
    manifest: siteManifest,
    pages: sitePages,
    bundled: readBundledTemplateFallback({ manifest: siteManifest, packageThemesDir }),
  });
  if (manifest.tier === "static") {
    errors.push(...validateTemplateDeclarations({ templates: manifest.templates, pages, pagesDirName: resolveThemeLayout({}, { apiVersion: manifest.apiVersion }).pagesDir }));
  }

  errors.push(...checkCompiledBuildConformance({ manifest, themeDir, pages, partials }));
  return { manifest, tokensLight, pages, partials, inheritedTemplateSources, errors };
}

/**
 * Load one theme folder. Returns a DiscoveredTheme with `status: "invalid"` and
 * a populated `errors` list instead of throwing, so one bad theme never breaks
 * discovery (SPEC-004 REQ-10 spirit).
 * @param optional.packageThemesDir - Stock root; defaults to the product stock tree. Null disables
 *   template inheritance (used when validating the package original itself).
 */
export function loadTheme(
  required: { themeDir: string; id: string; source: "built-in" | "site" },
  optional: { packageThemesDir?: string | null } = {}
): DiscoveredTheme {
  const { themeDir, id, source } = required;
  const errors: string[] = [];

  const { manifest: siteManifest, errors: manifestErrors } = parseThemeManifest({ themeDir, id });
  errors.push(...manifestErrors);

  const { tokens, errors: tokenErrors } = loadThemeTokens({ themeDir });
  errors.push(...tokenErrors);

  const { manifest, tokensLight, pages, partials, inheritedTemplateSources, errors: assetErrors } = loadThemeAssets({
    themeDir,
    siteManifest,
    packageThemesDir: optional.packageThemesDir === undefined ? stockThemesDir() : optional.packageThemesDir,
  });
  errors.push(...assetErrors);

  const { templatesDirName, templates, liquidTemplates, handlebarsTemplates, errors: templateErrors } =
    loadTemplateSources({ themeDir, manifest });
  errors.push(...templateErrors);
  errors.push(
    ...validateRequiredTemplates({ manifest, templatesDirName, templates, liquidTemplates, handlebarsTemplates })
  );

  const css = loadThemeCss({ themeDir, manifest });

  return {
    manifest,
    dir: themeDir,
    tokens,
    tokensLight,
    templates,
    liquidTemplates,
    handlebarsTemplates,
    pages,
    inheritedTemplateSources,
    partials,
    css,
    source,
    status: errors.length === 0 ? "valid" : "invalid",
    errors,
  };
}
