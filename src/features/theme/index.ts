export {
  discoverThemes,
  discoverAllBuiltInThemes,
  loadTheme,
  findTheme,
  validThemeIds,
  rescanThemes,
  duplicateThemeIds,
  nextAvailableThemeId,
  resolveTemplateId,
  resolveLiquidTemplateId,
  resolveHandlebarsTemplateId,
  ENGINE_SUBFOLDERS,
  THEME_CATALOG_DIR,
  MARKETPLACE_CATALOG_DIR,
  type ThemeManifest,
  type ThemeBuildInfo,
  type ThemeTier,
  type ThemeTokens,
  type TemplateNode,
  type DiscoveredTheme,
} from "./theme";

// ADR-020 §5 (2026-08-12) — the install-time conformance gate a `build.source: "compiled"` theme must
// pass. Re-exported so a consumer checking `theme.manifest.build` can also reach the exact gate
// `loadTheme()` itself runs, without a second import path into `build-conformance.ts` directly.
export { checkBuiltThemeConformance, type ConformanceIssue } from "./build-conformance";

export {
  listMarketplaceThemes,
  downloadMarketplaceTheme,
  MarketplaceThemeError,
  type MarketplaceListItem,
  type ThemeLineage,
  type DownloadMarketplaceThemeResult,
} from "./marketplace";

export {
  renderStaticPage,
  renderStaticPartial,
  injectCurrentEntityContentId,
  injectPageTitle,
  resolveTemplate,
  isEligibleForTemplateBranch,
  scanMenuEmbedIds,
  type StaticMenuItem,
  type PostTemplateResolution,
} from "./static-render";

// 2026-08-16 (export<->server decoupling follow-up) — "given discovered themes + a candidate id,
// which theme renders" query, moved here from `server/routes/site/pages.ts` so `export/
// route-manifest.ts` (and `server/routes/site/products.ts`, which used to keep its own private
// duplicate) can reuse it without a runtime edge into the composition-root module. Its sibling
// query, `resolveActiveThemeId`, deliberately lives in `#src/features/presentation/index` instead,
// NOT here — see `active-theme.ts`'s own file header for why splitting them avoids a real SCC
// regression a combined home would have caused.
export { resolveActiveTheme, type ActiveThemeResolutionDeps } from "./active-theme";

// ADR-020 §3 (C6) Tier-2 guardrail: re-exported so `server/http/site/liquid-worker.ts`
// can run the same lint defensively at render time that `loadTheme()` runs at publish time.
export { lintLiquidTemplate, ALLOWED_LIQUID_TAGS, ALLOWED_LIQUID_FILTERS } from "./liquid-allowlist";

// Same ADR-020 §3 (C6) pairing for the Handlebars tier: re-exported so
// `server/http/site/handlebars-worker.ts` can run the same lint defensively at render time that
// `loadTheme()` runs at publish time.
export {
  lintHandlebarsTemplate,
  ALLOWED_HANDLEBARS_BLOCK_HELPERS,
  ALLOWED_HANDLEBARS_HELPERS,
  ALLOWED_HANDLEBARS_RAW_PATHS,
  ALLOWED_HANDLEBARS_DATA_VARS,
} from "./handlebars-allowlist";
