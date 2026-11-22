# X-custom-credentials-1 — custom-credentials → @jini-ai/integrations (Jini step J then Tovu step T)

Lane X. Batch J:15 T:16. Depends on: C-contracts-core-1. Est: J 33 min, T 37 min.

## J — move verbatim into Jini (2 files, 93 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/custom-credentials/publish-compatibility-port.ts` | `packages/integrations/src/custom-credentials/publish-compatibility-port.ts` | 8 |  |
| `apps/website/src/features/custom-credentials/types.ts` | `packages/integrations/src/custom-credentials/types.ts` | 85 | W1 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/integrations" exports["./custom-credentials/publish-compatibility-port"]
- "@jini-ai/integrations" exports["./custom-credentials/types"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (1, 102 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/custom-credentials/__tests__/extract-s8-c1-old-shape.types.test.ts`


## T — Tovu repoint: delete the 2 sources, rewrite every importer (19 lines)

```
apps/website/src/features/custom-credentials/__tests__/extract-s8-c2p1-ports.type-pin.ts:30  '../publish-compatibility-port.js' -> '@jini-ai/integrations/custom-credentials/publish-compatibility-port'
apps/website/src/features/custom-credentials/index.ts:31  './publish-compatibility-port.js' -> '@jini-ai/integrations/custom-credentials/publish-compatibility-port'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/custom-credentials/tool-registrations.ts:8  './publish-compatibility-port.js' -> '@jini-ai/integrations/custom-credentials/publish-compatibility-port'
apps/website/src/features/agent-plugins/__tests__/unit/bundled-github-backup-push.unit.test.ts:7  '#src/features/custom-credentials/types' -> '@jini-ai/integrations/custom-credentials/types'
apps/website/src/features/agent-plugins/__tests__/unit/bundled-github-write-files.unit.test.ts:6  '#src/features/custom-credentials/types' -> '@jini-ai/integrations/custom-credentials/types'
apps/website/src/features/custom-credentials/__tests__/extract-s8-g-cred.integration.test.ts:35  '../types.js' -> '@jini-ai/integrations/custom-credentials/types'
apps/website/src/features/custom-credentials/__tests__/form-save-errors.model-facing.test.ts:42  '../types.js' -> '@jini-ai/integrations/custom-credentials/types'
apps/website/src/features/custom-credentials/__tests__/project-scope.unit.test.ts:26  '../types.js' -> '@jini-ai/integrations/custom-credentials/types'
apps/website/src/features/custom-credentials/__tests__/resolve-by-label.unit.test.ts:28  '../types.js' -> '@jini-ai/integrations/custom-credentials/types'
apps/website/src/features/custom-credentials/__tests__/vault-repo.tw4.unit.test.ts:5  '../types.js' -> '@jini-ai/integrations/custom-credentials/types'
apps/website/src/features/custom-credentials/credentialed-request.ts:603  './types.js' -> '@jini-ai/integrations/custom-credentials/types'
apps/website/src/features/custom-credentials/custom-credential-repo.ts:4  '#src/features/custom-credentials/types' -> '@jini-ai/integrations/custom-credentials/types'
apps/website/src/features/custom-credentials/index.ts:5  './types.js' -> '@jini-ai/integrations/custom-credentials/types'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/custom-credentials/store.ts:6  './types.js' -> '@jini-ai/integrations/custom-credentials/types'
apps/website/src/features/custom-credentials/tool-registrations.ts:53  './types.js' -> '@jini-ai/integrations/custom-credentials/types'
apps/website/src/features/custom-credentials/vault-repo.ts:6  './types.js' -> '@jini-ai/integrations/custom-credentials/types'
apps/website/src/features/source-control/__tests__/gates.characterization.unit.test.ts:20  '#src/features/custom-credentials/types' -> '@jini-ai/integrations/custom-credentials/types'
apps/website/src/features/source-control/__tests__/tool-registrations.unit.test.ts:22  '../../custom-credentials/types.js' -> '@jini-ai/integrations/custom-credentials/types'
apps/website/src/platform/db/repos/__tests__/custom-credential-repo.test.ts:10  '#src/features/custom-credentials/types' -> '@jini-ai/integrations/custom-credentials/types'
```

## Tovu tests that must stay green (11; import lines are repointed above, assertions untouched)
- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-github-backup-push.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-github-write-files.unit.test.ts`
- `apps/website/src/features/custom-credentials/__tests__/extract-s8-c2p1-ports.type-pin.ts`
- `apps/website/src/features/custom-credentials/__tests__/extract-s8-g-cred.integration.test.ts`
- `apps/website/src/features/custom-credentials/__tests__/form-save-errors.model-facing.test.ts`
- `apps/website/src/features/custom-credentials/__tests__/project-scope.unit.test.ts`
- `apps/website/src/features/custom-credentials/__tests__/resolve-by-label.unit.test.ts`
- `apps/website/src/features/custom-credentials/__tests__/vault-repo.tw4.unit.test.ts`
- `apps/website/src/features/source-control/__tests__/gates.characterization.unit.test.ts`
- `apps/website/src/features/source-control/__tests__/tool-registrations.unit.test.ts`
- `apps/website/src/platform/db/repos/__tests__/custom-credential-repo.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/custom-credentials/types.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Named mutation
in the Jini copy of `types.ts`, negate the first `if (` condition of its first exported function; `extract-s8-c1-old-shape.types.test.ts` must go red, then revert
