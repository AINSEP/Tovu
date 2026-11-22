# X-content-types-1 — content-types → @jini-ai/cms (Jini step J then Tovu step T)

Lane X. Batch J:10 T:12. Depends on: C-platform-routing-1, C-contracts-core-4. Est: J 35 min, T 113 min.

## J — move verbatim into Jini (3 files, 234 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/content-types/write-service.ts` | `packages/cms/src/content-types/site/write-service.ts` | 43 | W2 |
| `apps/website/src/features/content-types/index.ts` | `packages/cms/src/content-types/site/index.ts` | 120 |  |
| `apps/website/src/features/content-types/tool-registrations.ts` | `packages/cms/src/content-types/site/tool-registrations.ts` | 71 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./content-types/site"]
- "@jini-ai/cms" exports["./content-types/site/tool-registrations"]
- "@jini-ai/cms" exports["./content-types/site/write-service"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 3 sources, rewrite every importer (81 lines)

```
apps/website/src/assistant/__tests__/tool-registrations.widgets-authorization.test.ts:135  '../../features/content-types/write-service.js' -> '@jini-ai/cms/content-types/site/write-service'
apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.delete-confirmation-family.integration.test.ts:26  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/assistant/__tests__/merged-readers-batch.test.ts:14  '../../features/content-types/index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/assistant/__tests__/tool-registrations.authorization.test.ts:11  '../../features/content-types/index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/assistant/__tests__/tool-registrations.authorization.test.ts:12  '../../features/content-types/index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/assistant/__tests__/tool-registrations.authorization.test.ts:13  '../../features/content-types/index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts:56  '../../features/content-types/index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts:123  '../../features/content-types/index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/assistant/__tests__/tool-registrations.entries.test.ts:9  '../../features/content-types/index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/assistant/__tests__/tool-registrations.entries.test.ts:10  '../../features/content-types/index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/assistant/__tests__/tool-registrations.taxonomy.test.ts:10  '../../features/content-types/index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/assistant/__tests__/tool-registrations.widgets-authorization.test.ts:27  '../../features/content-types/index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/assistant/__tests__/tool-registrations.widgets-contracts.test.ts:26  '../../features/content-types/index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/assistant/__tests__/tool-registrations.widgets-contracts.test.ts:27  '../../features/content-types/index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/content-types/__tests__/integration/repo.sqlite.integration.test.ts:9  '../../index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/content-types/__tests__/publish-content.test.ts:6  '../index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/content-types/__tests__/repo.characterization.test.ts:6  '../index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/content-types/__tests__/repo.dialects.test.ts:6  '../index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/content-types/__tests__/reserved-keys.test.ts:8  '../index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/content-types/publish-content.ts:21  './index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/entries/__tests__/integration/repo.dialects.test.ts:7  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/entries/__tests__/integration/repo.sqlite.integration.test.ts:7  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/entries/__tests__/unit/public-list.unit.test.ts:4  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/entries/__tests__/unit/publish-content.test.ts:7  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/entries/__tests__/unit/trash-aware-memory-repo.display.unit.test.ts:5  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/entries/public-list.ts:1  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/plugin-runtime/__tests__/fixtures/extract-s6-g-plug-observe.ts:18  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/plugin-runtime/__tests__/integration/declarative-runtime.integration.test.ts:11  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/plugin-runtime/__tests__/unit/declarative-enable.unit.test.ts:6  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/publish-content/__tests__/new-types-sqlite-round-trip.test.ts:6  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/publish-content/__tests__/round-trip-harness.ts:4  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/taxonomy/__tests__/tool-contract.characterization.test.ts:24  '../../content-types/index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/widgets/__tests__/agent-tools.trash-confirmation.test.ts:8  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/widgets/__tests__/integration/embed-service.integration.test.ts:12  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/widgets/__tests__/integration/embed-service.post-host.integration.test.ts:7  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/widgets/__tests__/integration/region-area-service.integration.test.ts:6  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/widgets/__tests__/integration/tool-registrations.delegated-error-status.test.ts:10  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/widgets/__tests__/integration/tool-registrations.handler-gaps.test.ts:8  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/widgets/__tests__/integration/tool-registrations.input-validation-status.test.ts:8  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/widgets/__tests__/integration/tool-registrations.plugin-hook-failed.test.ts:11  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/widgets/__tests__/integration/tool-registrations.region-gaps.test.ts:8  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/widgets/__tests__/integration/tool-registrations.shape-rejection.test.ts:8  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/widgets/__tests__/integration/write-service.integration.test.ts:6  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/widgets/__tests__/tool-contract.characterization.test.ts:26  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/widgets/__tests__/unit/publish-content.test.ts:7  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/widgets/__tests__/unit/resolvers-recent-entries.unit.test.ts:6  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/features/widgets/deps.ts:43  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/__tests__/admin-widgets-routes.test.ts:334  '../../features/content-types/index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/__tests__/admin-widgets-routes.test.ts:1031  '../../features/content-types/index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/__tests__/admin-widgets-routes.test.ts:1331  '../../features/content-types/index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/__tests__/admin-widgets-routes.test.ts:1445  '../../features/content-types/index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/__tests__/content-type-write-provenance.test.ts:7  '../../features/content-types/index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/__tests__/content-type-write-provenance.test.ts:8  '../../features/content-types/index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/__tests__/widgets-error-code-parity.test.ts:9  '../../features/content-types/index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/inbound/admin-http/routes/content-types/__tests__/register-update-fields.conflict.test.ts:6  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/inbound/admin-http/routes/content-types/__tests__/update-fields.test.ts:6  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/inbound/admin-http/routes/content-types/lifecycle.ts:6  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/inbound/admin-http/routes/content-types/lifecycle.ts:7  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/inbound/admin-http/routes/content-types/list.ts:5  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/inbound/admin-http/routes/content-types/register.ts:6  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/inbound/admin-http/routes/content-types/register.ts:7  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/inbound/admin-http/routes/content-types/register.ts:8  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/inbound/admin-http/routes/content-types/update-fields.ts:6  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/inbound/admin-http/routes/content-types/update-fields.ts:7  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/inbound/admin-http/routes/content-types/update-fields.ts:8  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/library.unit.test.ts:6  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/region-bind.unit.test.ts:6  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/route-guards.unit.test.ts:7  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/update.unit.test.ts:6  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/inbound/public-http/routes/site/__tests__/embeds-everywhere.route.test.ts:14  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/inbound/public-http/routes/site/__tests__/embeds-everywhere.route.test.ts:15  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.edge-paths.route.test.ts:12  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.edge-paths.route.test.ts:13  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/inbound/public-http/routes/site/pages/render-context/collection-lists.ts:11  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/routes/types.ts:101  '../../features/content-types/index.js' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/runtime/composition/declared-content-types.ts:7  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/runtime/composition/memory-deps/slices/nav-form-content-repos.ts:6  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/server/runtime/composition/site-deps/content-resolvers-comments.ts:3  '#src/features/content-types/index' -> '@jini-ai/cms/content-types/site'
apps/website/src/assistant/__tests__/tool-registrations.authorization.test.ts:17  '../../features/content-types/tool-registrations.js' -> '@jini-ai/cms/content-types/site/tool-registrations'
apps/website/src/assistant/tool-registrations.ts:46  '../features/content-types/tool-registrations.js' -> '@jini-ai/cms/content-types/site/tool-registrations'
apps/website/src/server/runtime/composition/tool-catalog-manifest.ts:60  '#src/features/content-types/tool-registrations' -> '@jini-ai/cms/content-types/site/tool-registrations'
```

## Tovu tests that must stay green (49; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.delete-confirmation-family.integration.test.ts`
- `apps/website/src/assistant/__tests__/merged-readers-batch.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.authorization.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.entries.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.taxonomy.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.widgets-authorization.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.widgets-contracts.test.ts`
- `apps/website/src/features/content-types/__tests__/integration/repo.sqlite.integration.test.ts`
- `apps/website/src/features/content-types/__tests__/publish-content.test.ts`
- `apps/website/src/features/content-types/__tests__/repo.characterization.test.ts`
- `apps/website/src/features/content-types/__tests__/repo.dialects.test.ts`
- `apps/website/src/features/content-types/__tests__/reserved-keys.test.ts`
- `apps/website/src/features/entries/__tests__/integration/repo.dialects.test.ts`
- `apps/website/src/features/entries/__tests__/integration/repo.sqlite.integration.test.ts`
- `apps/website/src/features/entries/__tests__/unit/public-list.unit.test.ts`
- `apps/website/src/features/entries/__tests__/unit/publish-content.test.ts`
- `apps/website/src/features/entries/__tests__/unit/trash-aware-memory-repo.display.unit.test.ts`
- `apps/website/src/features/plugin-runtime/__tests__/fixtures/extract-s6-g-plug-observe.ts`
- `apps/website/src/features/plugin-runtime/__tests__/integration/declarative-runtime.integration.test.ts`
- `apps/website/src/features/plugin-runtime/__tests__/unit/declarative-enable.unit.test.ts`
- `apps/website/src/features/publish-content/__tests__/new-types-sqlite-round-trip.test.ts`
- `apps/website/src/features/publish-content/__tests__/round-trip-harness.ts`
- `apps/website/src/features/taxonomy/__tests__/tool-contract.characterization.test.ts`
- `apps/website/src/features/widgets/__tests__/agent-tools.trash-confirmation.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/embed-service.integration.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/embed-service.post-host.integration.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/region-area-service.integration.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/tool-registrations.delegated-error-status.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/tool-registrations.handler-gaps.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/tool-registrations.input-validation-status.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/tool-registrations.plugin-hook-failed.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/tool-registrations.region-gaps.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/tool-registrations.shape-rejection.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/write-service.integration.test.ts`
- `apps/website/src/features/widgets/__tests__/tool-contract.characterization.test.ts`
- `apps/website/src/features/widgets/__tests__/unit/publish-content.test.ts`
- `apps/website/src/features/widgets/__tests__/unit/resolvers-recent-entries.unit.test.ts`
- `apps/website/src/server/__tests__/admin-widgets-routes.test.ts`
- `apps/website/src/server/__tests__/content-type-write-provenance.test.ts`
- `apps/website/src/server/__tests__/widgets-error-code-parity.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/content-types/__tests__/register-update-fields.conflict.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/content-types/__tests__/update-fields.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/library.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/region-bind.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/route-guards.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/update.unit.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/embeds-everywhere.route.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.edge-paths.route.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/content-types/write-service.ts` (2)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/features/content-types/tool-registrations.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Named mutation
in the Jini copy of `index.ts`, negate the first `if (` condition of its first exported function; `tool-registrations.widgets-authorization.test.ts` must go red, then revert
