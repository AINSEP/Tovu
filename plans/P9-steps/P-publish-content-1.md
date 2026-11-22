# P-publish-content-1 — publish-content → @jini-ai/cms (Jini step J then Tovu step T)

Lane P. Batch J:5 T:11. Depends on: C-contracts-core-3, C-contracts-core-2. Est: J 72 min, T 120 min.

## J — move verbatim into Jini (11 files, 1251 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/publish-content/agent-tools.ts` | `packages/cms/src/publish/content/agent-tools.ts` | 140 |  |
| `apps/website/src/features/publish-content/baseline-repo.ts` | `packages/cms/src/publish/content/baseline-repo.ts` | 83 |  |
| `apps/website/src/features/publish-content/content-hash.ts` | `packages/cms/src/publish/content/content-hash.ts` | 153 |  |
| `apps/website/src/features/publish-content/execute-import.ts` | `packages/cms/src/publish/content/execute-import.ts` | 60 |  |
| `apps/website/src/features/publish-content/media-references.ts` | `packages/cms/src/publish/content/media-references.ts` | 229 |  |
| `apps/website/src/features/publish-content/peer-url.ts` | `packages/cms/src/publish/content/peer-url.ts` | 141 | W5 |
| `apps/website/src/features/publish-content/precheck-reasons.ts` | `packages/cms/src/publish/content/precheck-reasons.ts` | 84 |  |
| `apps/website/src/features/publish-content/publish-readiness.ts` | `packages/cms/src/publish/content/publish-readiness.ts` | 156 |  |
| `apps/website/src/features/publish-content/report-contract.ts` | `packages/cms/src/publish/content/report-contract.ts` | 96 |  |
| `apps/website/src/contracts/core/tool-metadata/publish-content.ts` | `packages/cms/src/publish/content/tool-metadata.ts` | 83 |  |
| `apps/website/src/features/publish-content/live-site-policy.ts` | `packages/cms/src/publish/content/live-site-policy.ts` | 26 | W1 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./publish/content/agent-tools"]
- "@jini-ai/cms" exports["./publish/content/baseline-repo"]
- "@jini-ai/cms" exports["./publish/content/content-hash"]
- "@jini-ai/cms" exports["./publish/content/execute-import"]
- "@jini-ai/cms" exports["./publish/content/live-site-policy"]
- "@jini-ai/cms" exports["./publish/content/media-references"]
- "@jini-ai/cms" exports["./publish/content/peer-url"]
- "@jini-ai/cms" exports["./publish/content/precheck-reasons"]
- "@jini-ai/cms" exports["./publish/content/publish-readiness"]
- "@jini-ai/cms" exports["./publish/content/report-contract"]
- "@jini-ai/cms" exports["./publish/content/tool-metadata"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (4, 476 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/publish-content/__tests__/content-hash.test.ts`
- `apps/website/src/features/publish-content/__tests__/execute-import.test.ts`
- `apps/website/src/features/publish-content/__tests__/media-references.test.ts`
- `apps/website/src/features/publish-content/__tests__/peer-url.test.ts`


## T — Tovu repoint: delete the 11 sources, rewrite every importer (113 lines)

```
apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts:38  '../../features/publish-content/agent-tools.js' -> '@jini-ai/cms/publish/content/agent-tools'
apps/website/src/features/publish-content/__tests__/backstop-gaps-tool.test.ts:5  '../agent-tools.js' -> '@jini-ai/cms/publish/content/agent-tools'
apps/website/src/features/publish-content/__tests__/plan-pull-tool.test.ts:78  '../agent-tools.js' -> '@jini-ai/cms/publish/content/agent-tools'
apps/website/src/features/publish-content/__tests__/publish-agent-tools.test.ts:10  '../agent-tools.js' -> '@jini-ai/cms/publish/content/agent-tools'
apps/website/src/features/publish-content/__tests__/status-tool.test.ts:4  '../agent-tools.js' -> '@jini-ai/cms/publish/content/agent-tools'
apps/website/src/features/publish-content/tool-registrations.ts:44  './agent-tools.js' -> '@jini-ai/cms/publish/content/agent-tools'
apps/website/src/features/publish-content/__tests__/apply-loop.characterization.test.ts:16  '../baseline-repo.js' -> '@jini-ai/cms/publish/content/baseline-repo'
apps/website/src/features/publish-content/__tests__/apply-loop.test.ts:46  '../baseline-repo.js' -> '@jini-ai/cms/publish/content/baseline-repo'
apps/website/src/features/publish-content/__tests__/backstop-batch.apply-loop.test.ts:13  '../baseline-repo.js' -> '@jini-ai/cms/publish/content/baseline-repo'
apps/website/src/features/publish-content/__tests__/gated-hooks.baseline-principal.test.ts:18  '../baseline-repo.js' -> '@jini-ai/cms/publish/content/baseline-repo'
apps/website/src/features/publish-content/__tests__/gated-hooks.confirmed-report.test.ts:26  '../baseline-repo.js' -> '@jini-ai/cms/publish/content/baseline-repo'
apps/website/src/features/publish-content/__tests__/planner-hash-upgrade.test.ts:66  '../baseline-repo.js' -> '@jini-ai/cms/publish/content/baseline-repo'
apps/website/src/features/publish-content/__tests__/pull-tool-fixture.ts:7  '../baseline-repo.js' -> '@jini-ai/cms/publish/content/baseline-repo'
apps/website/src/features/publish-content/apply-row.ts:4  './baseline-repo.js' -> '@jini-ai/cms/publish/content/baseline-repo'
apps/website/src/features/publish-content/apply-run.ts:4  './baseline-repo.js' -> '@jini-ai/cms/publish/content/baseline-repo'
apps/website/src/features/publish-content/gated-hooks.ts:9  './baseline-repo.js' -> '@jini-ai/cms/publish/content/baseline-repo'
apps/website/src/platform/db/repos/publish-content-baseline-repo.ts:3  '#src/features/publish-content/baseline-repo' -> '@jini-ai/cms/publish/content/baseline-repo'
apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/backstop-import-ui.routes.test.ts:12  '#src/features/publish-content/baseline-repo' -> '@jini-ai/cms/publish/content/baseline-repo'
apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/import.routes.pins.test.ts:9  '#src/features/publish-content/baseline-repo' -> '@jini-ai/cms/publish/content/baseline-repo'
apps/website/src/server/routes/types.ts:136  '../../features/publish-content/baseline-repo.js' -> '@jini-ai/cms/publish/content/baseline-repo'
apps/website/src/server/runtime/composition/memory-deps/slices/publish-content-stores.ts:4  '#src/features/publish-content/baseline-repo' -> '@jini-ai/cms/publish/content/baseline-repo'
apps/website/src/features/media/__tests__/library-publish-transport.test.ts:15  '#src/features/publish-content/content-hash' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/media/__tests__/publish-content.apply.test.ts:46  '#src/features/publish-content/content-hash' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/media/__tests__/publish-content.overwrite.test.ts:14  '#src/features/publish-content/content-hash' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/post/__tests__/L156-characterization.test.ts:11  '#src/features/publish-content/content-hash' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/post/__tests__/publish-content.round-trip.test.ts:27  '#src/features/publish-content/content-hash' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/post/__tests__/publish-content.schedule-featured.test.ts:15  '#src/features/publish-content/content-hash' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/post/__tests__/publish-content.test.ts:32  '#src/features/publish-content/content-hash' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/post/publish-content.ts:5  '#src/features/publish-content/content-hash' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/__tests__/apply-loop.characterization.test.ts:18  '../content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/__tests__/apply-loop.test.ts:44  '../content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/__tests__/execute-pull-tool.plugin-hook-refusal.test.ts:35  '../content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/__tests__/export-bundle-selection.test.ts:4  '../content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/__tests__/gated-hooks.baseline-principal.test.ts:20  '../content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/__tests__/gated-hooks.confirmed-report.test.ts:25  '../content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/__tests__/no-dead-apply-stub.boundary.test.ts:16  '../content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/__tests__/planner-hash-upgrade.test.ts:4  '../content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/__tests__/planner.test.ts:24  '../content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/__tests__/publish-tool.test.ts:8  '../content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/__tests__/pull-tool-fixture.ts:10  '../content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/__tests__/push-plan.characterization.test.ts:11  '../content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/__tests__/raw-file-contributor.characterization.test.ts:21  '../content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/__tests__/raw-file-contributor.test.ts:7  '../content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/__tests__/raw-row-contributor.characterization.test.ts:17  '../content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/__tests__/repo-handler.characterization.test.ts:12  '../content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/__tests__/repo-handler.test.ts:12  '../content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/__tests__/report-labels.test.ts:4  '../content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/__tests__/round-trip-harness.ts:16  '../content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/apply-report.ts:17  './content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/apply-row.ts:5  './content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/export-bundle.ts:1  './content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/planner.ts:1  './content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/raw-file-contributor.ts:10  './content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/raw-row-contributor.ts:7  './content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/repo-handler.ts:5  './content-hash.js' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/theme/__tests__/publish-content.apply.test.ts:24  '#src/features/publish-content/content-hash' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/theme/__tests__/publish-content.pack.test.ts:16  '#src/features/publish-content/content-hash' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/theme/publish-content.ts:11  '#src/features/publish-content/content-hash' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/server/__tests__/routes/publish-content-bundle-validation.test.ts:5  '#src/features/publish-content/content-hash' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/server/__tests__/routes/publish-content-bundles.test.ts:9  '#src/features/publish-content/content-hash' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/server/__tests__/routes/publish-content-export.test.ts:15  '#src/features/publish-content/content-hash' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/backstop-import-ui.routes.test.ts:14  '#src/features/publish-content/content-hash' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/bundle-create.routes.pins.test.ts:8  '#src/features/publish-content/content-hash' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/export.routes.pins.test.ts:6  '#src/features/publish-content/content-hash' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/import.routes.pins.test.ts:11  '#src/features/publish-content/content-hash' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/peer-transport-file-blob-index.test.ts:14  '#src/features/publish-content/content-hash' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/peer-transport-scope.test.ts:9  '#src/features/publish-content/content-hash' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/peer-transport.routes.pins.test.ts:5  '#src/features/publish-content/content-hash' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/server/inbound/admin-http/routes/publish-content/backstop.ts:12  '#src/features/publish-content/content-hash' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/server/inbound/admin-http/routes/publish-content/export.ts:6  '#src/features/publish-content/content-hash' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/server/runtime/composition/__tests__/publish-content-manifest.test.ts:51  '#src/features/publish-content/content-hash' -> '@jini-ai/cms/publish/content/content-hash'
apps/website/src/features/publish-content/__tests__/plan-pull-tool.test.ts:160  '../execute-import.js' -> '@jini-ai/cms/publish/content/execute-import'
apps/website/src/features/publish-content/tool-registrations.ts:21  './execute-import.js' -> '@jini-ai/cms/publish/content/execute-import'
apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/import-errors.test.ts:19  '#src/features/publish-content/execute-import' -> '@jini-ai/cms/publish/content/execute-import'
apps/website/src/server/inbound/admin-http/routes/publish-content/import-errors.ts:5  '#src/features/publish-content/execute-import' -> '@jini-ai/cms/publish/content/execute-import'
apps/website/src/server/inbound/admin-http/routes/publish-content/import.ts:12  '#src/features/publish-content/execute-import' -> '@jini-ai/cms/publish/content/execute-import'
apps/website/src/features/media/publish-content.ts:3  '#src/features/publish-content/media-references' -> '@jini-ai/cms/publish/content/media-references'
apps/website/src/features/media/verify-published-media.ts:1  '#src/features/publish-content/media-references' -> '@jini-ai/cms/publish/content/media-references'
apps/website/src/features/media/where-used.ts:6  '#src/features/publish-content/media-references' -> '@jini-ai/cms/publish/content/media-references'
apps/website/src/features/publish-content/content-references.ts:4  './media-references.js' -> '@jini-ai/cms/publish/content/media-references'
apps/website/src/features/widgets/__tests__/integration/gallery.integration.test.ts:10  '#src/features/publish-content/media-references' -> '@jini-ai/cms/publish/content/media-references'
apps/website/src/features/widgets/__tests__/integration/mediawidget.integration.test.ts:7  '#src/features/publish-content/media-references' -> '@jini-ai/cms/publish/content/media-references'
apps/website/src/features/widgets/__tests__/integration/mediawidget.integration.test.ts:134  '#src/features/publish-content/media-references' -> '@jini-ai/cms/publish/content/media-references'
apps/website/src/features/widgets/publish-content.ts:4  '#src/features/publish-content/media-references' -> '@jini-ai/cms/publish/content/media-references'
apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts:2  '#src/features/publish-content/media-references' -> '@jini-ai/cms/publish/content/media-references'
apps/website/src/features/publish-content/peer-transport.ts:4  './peer-url.js' -> '@jini-ai/cms/publish/content/peer-url'
apps/website/src/features/publish-content/peers.ts:7  './peer-url.js' -> '@jini-ai/cms/publish/content/peer-url'
apps/website/src/features/publish-content/tool-registrations.ts:48  './peer-url.js' -> '@jini-ai/cms/publish/content/peer-url'
apps/website/src/features/site-backup/share-hosting.ts:5  '../publish-content/peer-url.js' -> '@jini-ai/cms/publish/content/peer-url'
apps/website/src/server/inbound/admin-http/routes/publish-content/destination.ts:4  '#src/features/publish-content/peer-url' -> '@jini-ai/cms/publish/content/peer-url'
apps/website/src/features/content-types/publish-content.ts:5  '#src/features/publish-content/precheck-reasons' -> '@jini-ai/cms/publish/content/precheck-reasons'
apps/website/src/features/entries/publish-content.ts:5  '#src/features/publish-content/precheck-reasons' -> '@jini-ai/cms/publish/content/precheck-reasons'
apps/website/src/features/forms/publish-content.ts:2  '#src/features/publish-content/precheck-reasons' -> '@jini-ai/cms/publish/content/precheck-reasons'
apps/website/src/features/post/publish-content.ts:8  '#src/features/publish-content/precheck-reasons' -> '@jini-ai/cms/publish/content/precheck-reasons'
apps/website/src/features/publish-content/__tests__/repo-handler.characterization.test.ts:13  '../precheck-reasons.js' -> '@jini-ai/cms/publish/content/precheck-reasons'
apps/website/src/features/publish-content/__tests__/repo-handler.test.ts:19  '../precheck-reasons.js' -> '@jini-ai/cms/publish/content/precheck-reasons'
apps/website/src/features/publish-content/repo-handler.ts:6  './precheck-reasons.js' -> '@jini-ai/cms/publish/content/precheck-reasons'
apps/website/src/features/publish-content/ui/__tests__/report-rows.test.ts:23  '../../precheck-reasons.js' -> '@jini-ai/cms/publish/content/precheck-reasons'
apps/website/src/features/redirects/publish-content.ts:1  '#src/features/publish-content/precheck-reasons' -> '@jini-ai/cms/publish/content/precheck-reasons'
apps/website/src/features/publish-content/__tests__/publish-agent-tools.test.ts:13  '../publish-readiness.js' -> '@jini-ai/cms/publish/content/publish-readiness'
apps/website/src/features/publish-content/connect-destination.ts:4  './publish-readiness.js' -> '@jini-ai/cms/publish/content/publish-readiness'
apps/website/src/features/publish-content/tool-registrations.ts:51  './publish-readiness.js' -> '@jini-ai/cms/publish/content/publish-readiness'
apps/website/src/server/runtime/composition/__tests__/tool-catalog-publish-content-types.test.ts:17  '#src/features/publish-content/publish-readiness' -> '@jini-ai/cms/publish/content/publish-readiness'
apps/website/src/features/publish-content/ui/contract.ts:12  '../report-contract.js' -> '@jini-ai/cms/publish/content/report-contract'
apps/website/src/server/inbound/admin-http/routes/publish-content/apply-report.ts:4  '#src/features/publish-content/report-contract' -> '@jini-ai/cms/publish/content/report-contract'
apps/website/src/server/inbound/admin-http/routes/publish-content/report-dto.ts:2  '#src/features/publish-content/report-contract' -> '@jini-ai/cms/publish/content/report-contract'
apps/website/src/contracts/core/tool-metadata/index.ts:39  './publish-content.js' -> '@jini-ai/cms/publish/content/tool-metadata'
apps/website/src/features/publish-content/disconnect-tool.ts:1  '../../contracts/core/tool-metadata/publish-content.js' -> '@jini-ai/cms/publish/content/tool-metadata'
apps/website/src/features/publish-content/tool-registrations.ts:3  '../../contracts/core/tool-metadata/publish-content.js' -> '@jini-ai/cms/publish/content/tool-metadata'
apps/website/src/features/publish-content/publish-tool.ts:5  './live-site-policy.js' -> '@jini-ai/cms/publish/content/live-site-policy'
apps/website/src/server/inbound/admin-http/dev-auth.ts:39  '#src/features/publish-content/live-site-policy' -> '@jini-ai/cms/publish/content/live-site-policy'
apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/peer-transport-live-site.test.ts:6  '#src/features/publish-content/live-site-policy' -> '@jini-ai/cms/publish/content/live-site-policy'
apps/website/src/server/inbound/admin-http/routes/publish-content/peer-transport.ts:24  '#src/features/publish-content/live-site-policy' -> '@jini-ai/cms/publish/content/live-site-policy'
```

## Tovu tests that must stay green (51; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`
- `apps/website/src/features/media/__tests__/library-publish-transport.test.ts`
- `apps/website/src/features/media/__tests__/publish-content.apply.test.ts`
- `apps/website/src/features/media/__tests__/publish-content.overwrite.test.ts`
- `apps/website/src/features/post/__tests__/L156-characterization.test.ts`
- `apps/website/src/features/post/__tests__/publish-content.round-trip.test.ts`
- `apps/website/src/features/post/__tests__/publish-content.schedule-featured.test.ts`
- `apps/website/src/features/post/__tests__/publish-content.test.ts`
- `apps/website/src/features/publish-content/__tests__/apply-loop.characterization.test.ts`
- `apps/website/src/features/publish-content/__tests__/apply-loop.test.ts`
- `apps/website/src/features/publish-content/__tests__/backstop-batch.apply-loop.test.ts`
- `apps/website/src/features/publish-content/__tests__/backstop-gaps-tool.test.ts`
- `apps/website/src/features/publish-content/__tests__/execute-pull-tool.plugin-hook-refusal.test.ts`
- `apps/website/src/features/publish-content/__tests__/export-bundle-selection.test.ts`
- `apps/website/src/features/publish-content/__tests__/gated-hooks.baseline-principal.test.ts`
- `apps/website/src/features/publish-content/__tests__/gated-hooks.confirmed-report.test.ts`
- `apps/website/src/features/publish-content/__tests__/no-dead-apply-stub.boundary.test.ts`
- `apps/website/src/features/publish-content/__tests__/plan-pull-tool.test.ts`
- `apps/website/src/features/publish-content/__tests__/planner-hash-upgrade.test.ts`
- `apps/website/src/features/publish-content/__tests__/planner.test.ts`
- `apps/website/src/features/publish-content/__tests__/publish-agent-tools.test.ts`
- `apps/website/src/features/publish-content/__tests__/publish-tool.test.ts`
- `apps/website/src/features/publish-content/__tests__/pull-tool-fixture.ts`
- `apps/website/src/features/publish-content/__tests__/push-plan.characterization.test.ts`
- `apps/website/src/features/publish-content/__tests__/raw-file-contributor.characterization.test.ts`
- `apps/website/src/features/publish-content/__tests__/raw-file-contributor.test.ts`
- `apps/website/src/features/publish-content/__tests__/raw-row-contributor.characterization.test.ts`
- `apps/website/src/features/publish-content/__tests__/repo-handler.characterization.test.ts`
- `apps/website/src/features/publish-content/__tests__/repo-handler.test.ts`
- `apps/website/src/features/publish-content/__tests__/report-labels.test.ts`
- `apps/website/src/features/publish-content/__tests__/round-trip-harness.ts`
- `apps/website/src/features/publish-content/__tests__/status-tool.test.ts`
- `apps/website/src/features/publish-content/ui/__tests__/report-rows.test.ts`
- `apps/website/src/features/theme/__tests__/publish-content.apply.test.ts`
- `apps/website/src/features/theme/__tests__/publish-content.pack.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/gallery.integration.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/mediawidget.integration.test.ts`
- `apps/website/src/server/__tests__/routes/publish-content-bundle-validation.test.ts`
- `apps/website/src/server/__tests__/routes/publish-content-bundles.test.ts`
- `apps/website/src/server/__tests__/routes/publish-content-export.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/backstop-import-ui.routes.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/bundle-create.routes.pins.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/export.routes.pins.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/import-errors.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/import.routes.pins.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/peer-transport-file-blob-index.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/peer-transport-live-site.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/peer-transport-scope.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/peer-transport.routes.pins.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/publish-content-manifest.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/tool-catalog-publish-content-types.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/publish-content/peer-url.ts` (5)
- `apps/website/src/features/publish-content/live-site-policy.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/features/publish-content/publish-readiness.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Named mutation
in the Jini copy of `media-references.ts`, negate the first `if (` condition of its first exported function; `media-references.test.ts` must go red, then revert
