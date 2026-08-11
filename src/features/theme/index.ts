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
  type ThemeTier,
  type ThemeTokens,
  type TemplateNode,
  type DiscoveredTheme,
} from "./theme";

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
  injectPostEmbedId,
  injectPageContent,
  resolvePostTemplate,
  isEligibleForPostTemplateBranch,
  scanMenuEmbedIds,
  type StaticMenuItem,
  type PostTemplateResolution,
} from "./static-render";

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
