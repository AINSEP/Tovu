export {
  discoverThemes,
  loadTheme,
  findTheme,
  validThemeIds,
  resolveTemplateId,
  resolveLiquidTemplateId,
  type ThemeManifest,
  type ThemeTier,
  type ThemeTokens,
  type TemplateNode,
  type DiscoveredTheme,
} from "./theme";

// ADR-020 §3 (C6) Tier-2 guardrail: re-exported so `server/http/site/liquid-worker.ts`
// can run the same lint defensively at render time that `loadTheme()` runs at publish time.
export { lintLiquidTemplate, ALLOWED_LIQUID_TAGS, ALLOWED_LIQUID_FILTERS } from "./liquid-allowlist";
