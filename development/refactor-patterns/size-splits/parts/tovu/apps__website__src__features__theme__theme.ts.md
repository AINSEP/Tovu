### tovu:apps/website/src/features/theme/theme.ts
- **Over:** file 624 lines (no function over)
- **Phase:** now (STAY-PRODUCT, theme package format) · **Batch:** size-14
- **Tests:** `apps/website/src/features/theme/__tests__/declared-scripts.unit.test.ts`, `apps/website/src/features/theme/__tests__/theme-files.test.ts`, `apps/website/src/assistant/__tests__/tool-registrations.themes.test.ts`, `apps/website/src/server/runtime/composition/__tests__/publish-content-manifest.test.ts`, `apps/website/src/server/inbound/public-http/http/site/__tests__/render-font-links.test.ts`; plus `rg -l "theme/theme(\.js)?['\"]|\.\./theme\.js" apps/website/src/features/theme/__tests__` (run each). No test mocks this module.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A manifest | `THEME_TIERS`, `isObject`, `readJson`, `parseTier`, `parseOptionalString`, `parseOptionalStringArray`, `pickTruthy`, `parseBuildFramework`, `parseBuildSourceDir`, `parseBuildArtifactHashes`, `parseThemeBuildInfo`, `parseSlotHonorsCurrentPage`, `parseSlotVariants`, `parseSlots`, `parseRawManifestFields`, `validateCompiledBuildManifest`, `validateManifestCrossFields`, `emptyThemeManifest`, `parseThemeManifest`, `resolveThemeScripts` | read + validate `theme.json` |
| B templates | `TEMPLATE_SLOT_MARKER_TYPE`, `validateTemplateDeclarations`, `classifyTemplateFile`, `loadJsonTemplateFile`, `loadLiquidTemplateFile`, `loadHandlebarsTemplateFile`, `loadTemplateSources`, `requiredTemplatesForTier`, `validateRequiredTemplates` | load + validate a theme's template sources |
| C (stays) | re-exports, `ThemeTokens`, `DiscoveredTheme`, static-tier assets (`StaticTierAssets` … `loadStaticTierAssets`), page-publish predicates, bundled-template inheritance, `loadThemeTokens`, `checkCompiledBuildConformance`, `loadThemeCss`, `loadTheme`, discovery (`discoverThemes` … `findStoredTheme`), dir constants | load one theme + discover all themes |

- **Splits:**
  1. NEW `theme-manifest.ts` (same folder) — job: parse/validate `theme.json` into a `ThemeManifest`. Moves unit A word for word (every parser's doc comment). Exports `isObject`, `readJson` (theme.ts still uses them for tokens/light tokens/JSON templates), `parseThemeManifest`, `resolveThemeScripts`. Imports types from `./render-contract.js`, nothing from `theme.ts`.
  2. NEW `theme-templates.ts` — job: template source loading + required/declared template checks. Moves unit B word for word. Exports `validateTemplateDeclarations`, `loadTemplateSources`, `validateRequiredTemplates`. Imports `readJson` from `./theme-manifest.js`; nothing from `theme.ts`. All three take only `ThemeManifest`/plain records (checked), so no theme.ts type is needed.
  3. `theme.ts` imports from both; `export type { … }` / `export { ENGINE_SUBFOLDERS, THEME_CATALOG_DIR }` re-exports stay as they are.
- **Importers to update:** `resolveThemeScripts` → `../theme-manifest.js` in `apps/website/src/features/theme/__tests__/declared-scripts.unit.test.ts` (keep `loadTheme` from `../theme.js`). `features/theme/index.ts` re-exports from `./theme.js` — check its list (`sed -n 1,24p index.ts`): if it names a moved symbol, point that name at `./theme-manifest.js`/`./theme-templates.js` (index.ts IS the feature entry, so it keeps exporting it). Re-run `rg -n "\b(resolveThemeScripts|parseThemeManifest|loadTemplateSources)\b" apps --glob '!node_modules'`.
- **After:** `theme.ts` ~370; `theme-manifest.ts` ~150; `theme-templates.ts` ~115.
- **Risks / notes:** `parseRawManifestFields` calls `resolveThemeScripts` — both move together. `TEMPLATE_SLOT_MARKER_TYPE` is only used by `validateTemplateDeclarations` (moves with it).
