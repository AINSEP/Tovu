# T-theme-2 — theme → @jini-ai/cms (Jini step J then Tovu step T)

Lane T. Batch J:4 T:9. Depends on: C-contracts-core-3, T-theme-1, C-contracts-core-1, C-platform-html-1. Est: J 70 min, T 81 min.

## J — move verbatim into Jini (8 files, 1450 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/theme/validation/webmcp-markup.ts` | `packages/cms/src/themes/site/validation/webmcp-markup.ts` | 211 | W5 |
| `apps/website/src/contracts/core/tool-metadata/theme.ts` | `packages/cms/src/themes/site/tool-metadata.ts` | 238 | W2 |
| `apps/website/src/features/theme/agent-tools.ts` | `packages/cms/src/themes/site/agent-tools.ts` | 474 |  |
| `apps/website/src/features/theme/static-render-content.ts` | `packages/cms/src/themes/site/static-render-content.ts` | 179 |  |
| `apps/website/src/features/theme/theme-file-listing.ts` | `packages/cms/src/themes/site/theme-file-listing.ts` | 78 |  |
| `apps/website/src/features/theme/validation/markup.ts` | `packages/cms/src/themes/site/validation/markup.ts` | 130 | W1 |
| `apps/website/src/features/theme/static-render-previews.ts` | `packages/cms/src/themes/site/static-render-previews.ts` | 133 |  |
| `apps/website/src/features/theme/theme-tool-catalog.ts` | `packages/cms/src/themes/site/theme-tool-catalog.ts` | 7 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./themes/site/agent-tools"]
- "@jini-ai/cms" exports["./themes/site/static-render-content"]
- "@jini-ai/cms" exports["./themes/site/static-render-previews"]
- "@jini-ai/cms" exports["./themes/site/theme-file-listing"]
- "@jini-ai/cms" exports["./themes/site/theme-tool-catalog"]
- "@jini-ai/cms" exports["./themes/site/tool-metadata"]
- "@jini-ai/cms" exports["./themes/site/validation/markup"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (7, 487 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/theme/validation/__tests__/webmcp-markup.unit.test.ts`
- `apps/website/src/features/theme/__tests__/inject-current-entity-content-id.test.ts`
- `apps/website/src/features/theme/__tests__/inject-page-title.test.ts`
- `apps/website/src/features/theme/__tests__/static-render-featured-image.test.ts`
- `apps/website/src/features/theme/validation/__tests__/markup.test.ts`
- `apps/website/src/features/theme/validation/__tests__/webmcp-markup.test.ts`
- `apps/website/src/features/theme/validation/__tests__/webmcp-scaffolds.test.ts`


## T — Tovu repoint: delete the 8 sources, rewrite every importer (70 lines)

```
apps/website/src/assistant/__tests__/automatic-agent-plugins.integration.test.ts:20  '../../contracts/core/tool-metadata/theme.js' -> '@jini-ai/cms/themes/site/tool-metadata'
apps/website/src/assistant/__tests__/batch-tool-inputs.test.ts:38  '../../contracts/core/tool-metadata/theme.js' -> '@jini-ai/cms/themes/site/tool-metadata'
apps/website/src/assistant/__tests__/fixtures/confirmed-registrations.ts:12  '../../../contracts/core/tool-metadata/theme.js' -> '@jini-ai/cms/themes/site/tool-metadata'
apps/website/src/assistant/batch-tool-inputs.ts:2  '../contracts/core/tool-metadata/theme.js' -> '@jini-ai/cms/themes/site/tool-metadata'
apps/website/src/contracts/core/tool-metadata/index.ts:56  './theme.js' -> '@jini-ai/cms/themes/site/tool-metadata'
apps/website/src/features/theme/__tests__/theme-file-safety.test.ts:19  '../../../contracts/core/tool-metadata/theme.js' -> '@jini-ai/cms/themes/site/tool-metadata'
apps/website/src/features/theme/duplicate-theme-tool.ts:2  '../../contracts/core/tool-metadata/theme.js' -> '@jini-ai/cms/themes/site/tool-metadata'
apps/website/src/features/theme/file-mutation-tools.ts:13  '../../contracts/core/tool-metadata/theme.js' -> '@jini-ai/cms/themes/site/tool-metadata'
apps/website/src/features/theme/import-theme-file-tool.ts:1  '../../contracts/core/tool-metadata/theme.js' -> '@jini-ai/cms/themes/site/tool-metadata'
apps/website/src/features/theme/page-publish-tool.ts:1  '../../contracts/core/tool-metadata/theme.js' -> '@jini-ai/cms/themes/site/tool-metadata'
apps/website/src/features/theme/preview-switcher-tools.ts:10  '../../contracts/core/tool-metadata/theme.js' -> '@jini-ai/cms/themes/site/tool-metadata'
apps/website/src/features/theme/set-active-theme-tool.ts:3  '../../contracts/core/tool-metadata/theme.js' -> '@jini-ai/cms/themes/site/tool-metadata'
apps/website/src/features/theme/tool-registrations.ts:32  '../../contracts/core/tool-metadata/theme.js' -> '@jini-ai/cms/themes/site/tool-metadata'
apps/website/src/features/theme/trash-theme-tool.ts:1  '../../contracts/core/tool-metadata/theme.js' -> '@jini-ai/cms/themes/site/tool-metadata'
apps/website/src/assistant/__tests__/owner-chat-tool-inputs.unit.test.ts:5  '../../features/theme/agent-tools.js' -> '@jini-ai/cms/themes/site/agent-tools'
apps/website/src/assistant/__tests__/tool-input-chat-regressions.test.ts:7  '../../features/theme/agent-tools.js' -> '@jini-ai/cms/themes/site/agent-tools'
apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts:93  '../../features/theme/agent-tools.js' -> '@jini-ai/cms/themes/site/agent-tools'
apps/website/src/assistant/__tests__/tool-registrations.themes-reset-copy.test.ts:15  '../../features/theme/agent-tools.js' -> '@jini-ai/cms/themes/site/agent-tools'
apps/website/src/assistant/__tests__/tool-registrations.themes.test.ts:14  '../../features/theme/agent-tools.js' -> '@jini-ai/cms/themes/site/agent-tools'
apps/website/src/features/theme/__tests__/theme-read-file-window.test.ts:11  '../agent-tools.js' -> '@jini-ai/cms/themes/site/agent-tools'
apps/website/src/features/theme/asset-operations.ts:13  './agent-tools.js' -> '@jini-ai/cms/themes/site/agent-tools'
apps/website/src/features/theme/duplicate-theme-tool.ts:7  './agent-tools.js' -> '@jini-ai/cms/themes/site/agent-tools'
apps/website/src/features/theme/file-mutation-tools.ts:10  './agent-tools.js' -> '@jini-ai/cms/themes/site/agent-tools'
apps/website/src/features/theme/import-theme-file-tool.ts:13  './agent-tools.js' -> '@jini-ai/cms/themes/site/agent-tools'
apps/website/src/features/theme/theme-file-identity-tools.ts:5  './agent-tools.js' -> '@jini-ai/cms/themes/site/agent-tools'
apps/website/src/features/theme/theme-file-trash-tools.ts:8  './agent-tools.js' -> '@jini-ai/cms/themes/site/agent-tools'
apps/website/src/features/theme/theme-read-tools.ts:12  './agent-tools.js' -> '@jini-ai/cms/themes/site/agent-tools'
apps/website/src/features/theme/theme-reset-file-tool.ts:5  './agent-tools.js' -> '@jini-ai/cms/themes/site/agent-tools'
apps/website/src/features/theme/theme-write-tools.ts:6  './agent-tools.js' -> '@jini-ai/cms/themes/site/agent-tools'
apps/website/src/features/theme/trash-theme-tool.ts:10  './agent-tools.js' -> '@jini-ai/cms/themes/site/agent-tools'
apps/website/src/features/theme/__tests__/pages-blank-template.canary.test.ts:8  '../static-render-content.js' -> '@jini-ai/cms/themes/site/static-render-content'
apps/website/src/features/theme/__tests__/static-render-author.test.ts:6  '../static-render-content.js' -> '@jini-ai/cms/themes/site/static-render-content'
apps/website/src/features/theme/__tests__/template-render.canary.test.ts:12  '../static-render-content.js' -> '@jini-ai/cms/themes/site/static-render-content'
apps/website/src/features/theme/__tests__/theme-pages-render.canary.test.ts:9  '../static-render-content.js' -> '@jini-ai/cms/themes/site/static-render-content'
apps/website/src/features/theme/index.ts:66  './static-render-content.js' -> '@jini-ai/cms/themes/site/static-render-content'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/theme/rendering.ts:2  './static-render-content.js' -> '@jini-ai/cms/themes/site/static-render-content'
apps/website/src/features/theme/static-render.ts:13  './static-render-content.js' -> '@jini-ai/cms/themes/site/static-render-content'
apps/website/src/server/inbound/public-http/http/site/render/components/entry-lists.ts:5  '#src/features/theme/static-render-content' -> '@jini-ai/cms/themes/site/static-render-content'
apps/website/src/server/inbound/public-http/http/site/render/page-body.ts:4  '#src/features/theme/static-render-content' -> '@jini-ai/cms/themes/site/static-render-content'
apps/website/src/server/inbound/public-http/routes/site/pages/render-context/post-previews.ts:6  '#src/features/theme/static-render-content' -> '@jini-ai/cms/themes/site/static-render-content'
apps/website/src/server/inbound/public-http/routes/site/pages/template-render.ts:10  '#src/features/theme/static-render-content' -> '@jini-ai/cms/themes/site/static-render-content'
apps/website/src/features/theme/__tests__/duplicate-theme.test.ts:13  '../theme-file-listing.js' -> '@jini-ai/cms/themes/site/theme-file-listing'
apps/website/src/features/theme/__tests__/theme-file-safety.test.ts:14  '../theme-file-listing.js' -> '@jini-ai/cms/themes/site/theme-file-listing'
apps/website/src/features/theme/__tests__/theme-files.edge-cases.test.ts:9  '../theme-file-listing.js' -> '@jini-ai/cms/themes/site/theme-file-listing'
apps/website/src/features/theme/__tests__/theme-files.test.ts:12  '../theme-file-listing.js' -> '@jini-ai/cms/themes/site/theme-file-listing'
apps/website/src/features/theme/__tests__/theme-preview-image.test.ts:8  '../theme-file-listing.js' -> '@jini-ai/cms/themes/site/theme-file-listing'
apps/website/src/features/theme/__tests__/theme-write-preflight.unit.test.ts:9  '../theme-file-listing.js' -> '@jini-ai/cms/themes/site/theme-file-listing'
apps/website/src/features/theme/asset-operations.ts:5  './theme-file-listing.js' -> '@jini-ai/cms/themes/site/theme-file-listing'
apps/website/src/features/theme/duplicate-theme.ts:9  './theme-file-listing.js' -> '@jini-ai/cms/themes/site/theme-file-listing'
apps/website/src/features/theme/index.ts:112  './theme-file-listing.js' -> '@jini-ai/cms/themes/site/theme-file-listing'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/theme/theme-file-identity-tools.ts:8  './theme-file-listing.js' -> '@jini-ai/cms/themes/site/theme-file-listing'
apps/website/src/features/theme/theme-file-trash-tools.ts:9  './theme-file-listing.js' -> '@jini-ai/cms/themes/site/theme-file-listing'
apps/website/src/features/theme/theme-generated-restore.ts:7  './theme-file-listing.js' -> '@jini-ai/cms/themes/site/theme-file-listing'
apps/website/src/features/theme/theme-preview-image.ts:5  './theme-file-listing.js' -> '@jini-ai/cms/themes/site/theme-file-listing'
apps/website/src/features/theme/theme-read-tools.ts:13  './theme-file-listing.js' -> '@jini-ai/cms/themes/site/theme-file-listing'
apps/website/src/features/theme/validation/validate-theme-package.ts:8  './markup.js' -> '@jini-ai/cms/themes/site/validation/markup'
apps/website/src/features/widgets/__tests__/integration/html-form-embeds.integration.test.ts:12  '#src/features/theme/validation/markup' -> '@jini-ai/cms/themes/site/validation/markup'
apps/website/src/features/widgets/__tests__/integration/html-taxonomy-embeds.integration.test.ts:8  '#src/features/theme/validation/markup' -> '@jini-ai/cms/themes/site/validation/markup'
apps/website/src/features/theme/__tests__/static-render-listings.test.ts:6  '../static-render-previews.js' -> '@jini-ai/cms/themes/site/static-render-previews'
apps/website/src/features/theme/__tests__/static-render-paging.test.ts:5  '../static-render-previews.js' -> '@jini-ai/cms/themes/site/static-render-previews'
apps/website/src/features/theme/__tests__/static-render-post-previews.test.ts:5  '../static-render-previews.js' -> '@jini-ai/cms/themes/site/static-render-previews'
apps/website/src/features/theme/index.ts:71  './static-render-previews.js' -> '@jini-ai/cms/themes/site/static-render-previews'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/theme/static-render.ts:12  './static-render-previews.js' -> '@jini-ai/cms/themes/site/static-render-previews'
apps/website/src/server/inbound/public-http/routes/site/pages/render-context/post-previews.ts:5  '#src/features/theme/static-render-previews' -> '@jini-ai/cms/themes/site/static-render-previews'
apps/website/src/features/theme/theme-file-identity-tools.ts:18  './theme-tool-catalog.js' -> '@jini-ai/cms/themes/site/theme-tool-catalog'
apps/website/src/features/theme/theme-file-trash-tools.ts:20  './theme-tool-catalog.js' -> '@jini-ai/cms/themes/site/theme-tool-catalog'
apps/website/src/features/theme/theme-read-tools.ts:25  './theme-tool-catalog.js' -> '@jini-ai/cms/themes/site/theme-tool-catalog'
apps/website/src/features/theme/theme-reset-file-tool.ts:12  './theme-tool-catalog.js' -> '@jini-ai/cms/themes/site/theme-tool-catalog'
apps/website/src/features/theme/theme-write-tools.ts:9  './theme-tool-catalog.js' -> '@jini-ai/cms/themes/site/theme-tool-catalog'
apps/website/src/features/theme/tool-registrations.ts:47  './theme-tool-catalog.js' -> '@jini-ai/cms/themes/site/theme-tool-catalog'
```

## Tovu tests that must stay green (24; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/automatic-agent-plugins.integration.test.ts`
- `apps/website/src/assistant/__tests__/batch-tool-inputs.test.ts`
- `apps/website/src/assistant/__tests__/fixtures/confirmed-registrations.ts`
- `apps/website/src/assistant/__tests__/owner-chat-tool-inputs.unit.test.ts`
- `apps/website/src/assistant/__tests__/tool-input-chat-regressions.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.themes-reset-copy.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.themes.test.ts`
- `apps/website/src/features/theme/__tests__/duplicate-theme.test.ts`
- `apps/website/src/features/theme/__tests__/pages-blank-template.canary.test.ts`
- `apps/website/src/features/theme/__tests__/static-render-author.test.ts`
- `apps/website/src/features/theme/__tests__/static-render-listings.test.ts`
- `apps/website/src/features/theme/__tests__/static-render-paging.test.ts`
- `apps/website/src/features/theme/__tests__/static-render-post-previews.test.ts`
- `apps/website/src/features/theme/__tests__/template-render.canary.test.ts`
- `apps/website/src/features/theme/__tests__/theme-file-safety.test.ts`
- `apps/website/src/features/theme/__tests__/theme-files.edge-cases.test.ts`
- `apps/website/src/features/theme/__tests__/theme-files.test.ts`
- `apps/website/src/features/theme/__tests__/theme-pages-render.canary.test.ts`
- `apps/website/src/features/theme/__tests__/theme-preview-image.test.ts`
- `apps/website/src/features/theme/__tests__/theme-read-file-window.test.ts`
- `apps/website/src/features/theme/__tests__/theme-write-preflight.unit.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/html-form-embeds.integration.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/html-taxonomy-embeds.integration.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/theme/validation/webmcp-markup.ts` (5)
- `apps/website/src/contracts/core/tool-metadata/theme.ts` (2)
- `apps/website/src/features/theme/validation/markup.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/features/theme/agent-tools.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/features/theme/validation/webmcp-markup.ts:182: if (attr({ element, name: 'data-tovu-agent' }) !== undefined) issue({ ruleId: 'markup-tovu-agent-retired', message: 'data-tovu-agent is reti
apps/website/src/contracts/core/tool-metadata/theme.ts:44: "Create a new theme based on tovu-theme called Roastery.",
apps/website/src/contracts/core/tool-metadata/theme.ts:75: keywords: "theme import local file folder drop tovuize font woff woff2 ttf otf image logo icon favicon binary asset copy",
```

## Named mutation
in the Jini copy of `agent-tools.ts`, negate the first `if (` condition of its first exported function; `webmcp-markup.unit.test.ts` must go red, then revert
