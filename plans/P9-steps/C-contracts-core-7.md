# C-contracts-core-7 — contracts-core → @jini-ai/core (Jini step J then Tovu step T)

Lane C. Batch J:4 T:5. Depends on: C-contracts-core-3, C-contracts-core-1. Est: J 31 min, T 34 min.

## J — move verbatim into Jini (1 files, 164 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/contracts/core/gated-mutations/composition.ts` | `packages/core/src/contracts/site/gated-mutations/composition.ts` | 164 | W1 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/core" exports["./contracts/site/gated-mutations/composition"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (1, 217 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/contracts/core/gated-mutations/__tests__/unit/composition.unit.test.ts`


## T — Tovu repoint: delete the 1 sources, rewrite every importer (20 lines)

```
apps/website/src/assistant/__tests__/tool-registrations.database-recovery.test.ts:27  '../../contracts/core/gated-mutations/composition.js' -> '@jini-ai/core/contracts/site/gated-mutations/composition'
apps/website/src/features/database/gated-hooks.ts:3  '../../contracts/core/gated-mutations/composition.js' -> '@jini-ai/core/contracts/site/gated-mutations/composition'
apps/website/src/features/deployments/static-publish/__tests__/domain-publish-tool.unit.test.ts:20  '#src/contracts/core/gated-mutations/composition' -> '@jini-ai/core/contracts/site/gated-mutations/composition'
apps/website/src/features/deployments/static-publish/domain-publish-tool.ts:8  '#src/contracts/core/gated-mutations/composition' -> '@jini-ai/core/contracts/site/gated-mutations/composition'
apps/website/src/features/publish-content/__tests__/execute-pull-tool.test.ts:7  '../../../contracts/core/gated-mutations/composition.js' -> '@jini-ai/core/contracts/site/gated-mutations/composition'
apps/website/src/features/publish-content/gated-hooks.ts:6  '../../contracts/core/gated-mutations/composition.js' -> '@jini-ai/core/contracts/site/gated-mutations/composition'
apps/website/src/features/recovery/gated-hooks.ts:3  '../../contracts/core/gated-mutations/composition.js' -> '@jini-ai/core/contracts/site/gated-mutations/composition'
apps/website/src/features/taxonomy/gated-hooks.ts:3  '../../contracts/core/gated-mutations/composition.js' -> '@jini-ai/core/contracts/site/gated-mutations/composition'
apps/website/src/server/__tests__/routes/publish-content-import-routes.test.ts:10  '#src/contracts/core/gated-mutations/composition' -> '@jini-ai/core/contracts/site/gated-mutations/composition'
apps/website/src/server/inbound/admin-http/__tests__/credential-provenance.unit.test.ts:7  '#src/contracts/core/gated-mutations/composition' -> '@jini-ai/core/contracts/site/gated-mutations/composition'
apps/website/src/server/inbound/admin-http/routes/database/migrate-forward.ts:12  '#src/contracts/core/gated-mutations/composition' -> '@jini-ai/core/contracts/site/gated-mutations/composition'
apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/backstop-import-ui.routes.test.ts:10  '#src/contracts/core/gated-mutations/composition' -> '@jini-ai/core/contracts/site/gated-mutations/composition'
apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/import.routes.pins.test.ts:7  '#src/contracts/core/gated-mutations/composition' -> '@jini-ai/core/contracts/site/gated-mutations/composition'
apps/website/src/server/inbound/admin-http/routes/publish-content/import.ts:10  '#src/contracts/core/gated-mutations/composition' -> '@jini-ai/core/contracts/site/gated-mutations/composition'
apps/website/src/server/inbound/admin-http/routes/recovery/restore.ts:7  '#src/contracts/core/gated-mutations/composition' -> '@jini-ai/core/contracts/site/gated-mutations/composition'
apps/website/src/server/inbound/admin-http/routes/taxonomy/merge-term.ts:7  '#src/contracts/core/gated-mutations/composition' -> '@jini-ai/core/contracts/site/gated-mutations/composition'
apps/website/src/server/runtime/composition/memory-deps/route-deps/model-comments-plugins.ts:5  '#src/contracts/core/gated-mutations/composition' -> '@jini-ai/core/contracts/site/gated-mutations/composition'
apps/website/src/server/runtime/composition/peer-site-reads.ts:55  '#src/contracts/core/gated-mutations/composition' -> '@jini-ai/core/contracts/site/gated-mutations/composition'
apps/website/src/server/runtime/composition/site-deps/route-deps-comments-plugins.ts:27  '#src/contracts/core/gated-mutations/composition' -> '@jini-ai/core/contracts/site/gated-mutations/composition'
apps/website/src/server/runtime/composition/site-deps/route-deps-comments-plugins.ts:28  '#src/contracts/core/gated-mutations/composition' -> '@jini-ai/core/contracts/site/gated-mutations/composition'
```

## Tovu tests that must stay green (7; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/tool-registrations.database-recovery.test.ts`
- `apps/website/src/features/deployments/static-publish/__tests__/domain-publish-tool.unit.test.ts`
- `apps/website/src/features/publish-content/__tests__/execute-pull-tool.test.ts`
- `apps/website/src/server/__tests__/routes/publish-content-import-routes.test.ts`
- `apps/website/src/server/inbound/admin-http/__tests__/credential-provenance.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/backstop-import-ui.routes.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/import.routes.pins.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/contracts/core/gated-mutations/composition.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Named mutation
in the Jini copy of `composition.ts`, negate the first `if (` condition of its first exported function; `composition.unit.test.ts` must go red, then revert
