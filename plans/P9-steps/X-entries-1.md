# X-entries-1 — entries → @jini-ai/cms (Jini step J then Tovu step T)

Lane X. Batch J:9 T:14. Depends on: C-contracts-core-4. Est: J 38 min, T 96 min.

## J — move verbatim into Jini (4 files, 161 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/entries/contracts.ts` | `packages/cms/src/entries/site/contracts.ts` | 20 |  |
| `apps/website/src/features/entries/index.ts` | `packages/cms/src/entries/site/index.ts` | 69 |  |
| `apps/website/src/features/entries/render-entry.ts` | `packages/cms/src/entries/site/render-entry.ts` | 3 |  |
| `apps/website/src/features/entries/tool-registrations.ts` | `packages/cms/src/entries/site/tool-registrations.ts` | 69 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./entries/site"]
- "@jini-ai/cms" exports["./entries/site/contracts"]
- "@jini-ai/cms" exports["./entries/site/render-entry"]
- "@jini-ai/cms" exports["./entries/site/tool-registrations"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 4 sources, rewrite every importer (67 lines)

```
apps/website/src/features/entries/public-list.ts:5  './contracts.js' -> '@jini-ai/cms/entries/site/contracts'
apps/website/src/features/entries/public-list.ts:6  './contracts.js' -> '@jini-ai/cms/entries/site/contracts'
apps/website/src/features/entries/public-list.ts:7  './contracts.js' -> '@jini-ai/cms/entries/site/contracts'
apps/website/src/features/entries/public-list.ts:8  './contracts.js' -> '@jini-ai/cms/entries/site/contracts'
apps/website/src/assistant/__tests__/merged-readers-batch.test.ts:15  '../../features/entries/index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts:71  '../../features/entries/index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/assistant/__tests__/tool-registrations.entries.test.ts:11  '../../features/entries/index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/assistant/__tests__/tool-registrations.entries.test.ts:12  '../../features/entries/index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/assistant/__tests__/tool-registrations.taxonomy.test.ts:11  '../../features/entries/index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/assistant/__tests__/tool-registrations.widgets-authorization.test.ts:28  '../../features/entries/index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/assistant/__tests__/tool-registrations.widgets-authorization.test.ts:136  '../../features/entries/index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/assistant/__tests__/tool-registrations.widgets-contracts.test.ts:29  '../../features/entries/index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-render.test.ts:6  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-scripts.test.ts:7  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/features/comments/__tests__/index.test.ts:6  '../../entries/index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/features/entries/__tests__/integration/repo.compare-and-set.postgres.test.ts:12  '../../index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/features/entries/__tests__/integration/repo.compare-and-set.postgres.test.ts:13  '../../index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/features/entries/__tests__/integration/repo.compare-and-set.test.ts:7  '../../index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/features/entries/__tests__/integration/repo.compare-and-set.test.ts:8  '../../index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/features/entries/__tests__/integration/repo.dialects.test.ts:10  '../../index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/features/entries/__tests__/integration/repo.dialects.test.ts:11  '../../index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/features/entries/__tests__/integration/repo.sqlite.integration.test.ts:11  '../../index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/features/entries/__tests__/repo.characterization.test.ts:7  '../index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/features/entries/__tests__/repo.characterization.test.ts:8  '../index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/features/entries/__tests__/unit/publish-content.test.ts:14  '../../index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/features/entries/__tests__/unit/trash-aware-memory-repo.characterization.unit.test.ts:6  '../../index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/features/entries/__tests__/unit/trash-aware-memory-repo.characterization.unit.test.ts:7  '../../index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/features/entries/__tests__/unit/trash-aware-memory-repo.display.unit.test.ts:7  '../../index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/features/entries/__tests__/unit/trash-aware-memory-repo.display.unit.test.ts:8  '../../index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/features/entries/publish-content.ts:22  './index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/features/plugin-runtime/__tests__/integration/testimonials-faq-sample.integration.test.ts:18  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/features/publish-content/__tests__/media-video-embed.round-trip.test.ts:19  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/features/taxonomy/__tests__/tool-contract.characterization.test.ts:25  '../../entries/index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/features/widgets/__tests__/integration/embed-service.integration.test.ts:13  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/features/widgets/__tests__/integration/embed-service.post-host.integration.test.ts:8  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/features/widgets/__tests__/integration/gallery-widget.integration.test.ts:6  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/features/widgets/__tests__/integration/gallery.integration.test.ts:5  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/features/widgets/__tests__/integration/header-occurrence-collision.integration.test.ts:5  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/features/widgets/__tests__/integration/html-form-embeds.integration.test.ts:4  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/features/widgets/__tests__/integration/html-taxonomy-embeds.integration.test.ts:5  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/features/widgets/__tests__/integration/mediawidget.integration.test.ts:60  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/features/widgets/__tests__/integration/region-area-service.integration.test.ts:7  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/features/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts:5  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/features/widgets/__tests__/unit/resolvers-recent-entries.unit.test.ts:7  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/features/widgets/publish-content.ts:9  '../entries/index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/server/__tests__/admin-widgets-routes.test.ts:335  '../../features/entries/index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/server/__tests__/admin-widgets-routes.test.ts:1032  '../../features/entries/index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/server/__tests__/admin-widgets-routes.test.ts:1332  '../../features/entries/index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/server/__tests__/admin-widgets-routes.test.ts:1446  '../../features/entries/index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/server/__tests__/widgets-error-code-parity.test.ts:10  '../../features/entries/index.js' -> '@jini-ai/cms/entries/site'
apps/website/src/server/inbound/admin-http/routes/entries/create.ts:4  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/server/inbound/admin-http/routes/entries/lifecycle.ts:5  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/server/inbound/admin-http/routes/entries/list.ts:5  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/server/inbound/admin-http/routes/entries/update.ts:5  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/embed-insert.unit.test.ts:4  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/library.unit.test.ts:5  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/preview.unit.test.ts:6  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/region-bind.unit.test.ts:5  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/route-guards.unit.test.ts:6  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/update.unit.test.ts:5  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/server/inbound/public-http/routes/site/__tests__/embeds-everywhere.route.test.ts:8  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.edge-paths.route.test.ts:14  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/server/inbound/public-http/routes/site/pages/render-context/collection-lists.ts:12  '#src/features/entries/index' -> '@jini-ai/cms/entries/site'
apps/website/src/server/inbound/public-http/http/site/render/widgets/social-entries.ts:9  '#src/features/entries/render-entry' -> '@jini-ai/cms/entries/site/render-entry'
apps/website/src/assistant/__tests__/tool-registrations.entries.test.ts:16  '../../features/entries/tool-registrations.js' -> '@jini-ai/cms/entries/site/tool-registrations'
apps/website/src/assistant/tool-registrations.ts:52  '../features/entries/tool-registrations.js' -> '@jini-ai/cms/entries/site/tool-registrations'
apps/website/src/server/runtime/composition/tool-catalog-manifest.ts:85  '#src/features/entries/tool-registrations' -> '@jini-ai/cms/entries/site/tool-registrations'
```

## Tovu tests that must stay green (41; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/merged-readers-batch.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.entries.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.taxonomy.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.widgets-authorization.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.widgets-contracts.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-render.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-scripts.test.ts`
- `apps/website/src/features/comments/__tests__/index.test.ts`
- `apps/website/src/features/entries/__tests__/integration/repo.compare-and-set.postgres.test.ts`
- `apps/website/src/features/entries/__tests__/integration/repo.compare-and-set.test.ts`
- `apps/website/src/features/entries/__tests__/integration/repo.dialects.test.ts`
- `apps/website/src/features/entries/__tests__/integration/repo.sqlite.integration.test.ts`
- `apps/website/src/features/entries/__tests__/repo.characterization.test.ts`
- `apps/website/src/features/entries/__tests__/unit/publish-content.test.ts`
- `apps/website/src/features/entries/__tests__/unit/trash-aware-memory-repo.characterization.unit.test.ts`
- `apps/website/src/features/entries/__tests__/unit/trash-aware-memory-repo.display.unit.test.ts`
- `apps/website/src/features/plugin-runtime/__tests__/integration/testimonials-faq-sample.integration.test.ts`
- `apps/website/src/features/publish-content/__tests__/media-video-embed.round-trip.test.ts`
- `apps/website/src/features/taxonomy/__tests__/tool-contract.characterization.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/embed-service.integration.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/embed-service.post-host.integration.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/gallery-widget.integration.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/gallery.integration.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/header-occurrence-collision.integration.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/html-form-embeds.integration.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/html-taxonomy-embeds.integration.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/mediawidget.integration.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/region-area-service.integration.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts`
- `apps/website/src/features/widgets/__tests__/unit/resolvers-recent-entries.unit.test.ts`
- `apps/website/src/server/__tests__/admin-widgets-routes.test.ts`
- `apps/website/src/server/__tests__/widgets-error-code-parity.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/embed-insert.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/library.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/preview.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/region-bind.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/route-guards.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/update.unit.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/embeds-everywhere.route.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.edge-paths.route.test.ts`

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/features/entries/tool-registrations.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Named mutation
in the Jini copy of `index.ts`, negate the first `if (` condition of its first exported function; `merged-readers-batch.test.ts` must go red, then revert
