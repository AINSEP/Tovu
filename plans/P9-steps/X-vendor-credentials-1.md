# X-vendor-credentials-1 — vendor-credentials → @jini-ai/integrations (Jini step J then Tovu step T)

Lane X. Batch J:16 T:17. Depends on: none (only already-Jini code). Est: J 31 min, T 29 min.

## J — move verbatim into Jini (2 files, 99 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/vendor-credentials/abort-guarded-repo.ts` | `packages/integrations/src/vendor-credentials/abort-guarded-repo.ts` | 38 |  |
| `apps/website/src/features/vendor-credentials/project-scope.ts` | `packages/integrations/src/vendor-credentials/project-scope.ts` | 61 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/integrations" exports["./vendor-credentials/abort-guarded-repo"]
- "@jini-ai/integrations" exports["./vendor-credentials/project-scope"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 2 sources, rewrite every importer (15 lines)

```
apps/website/src/features/custom-credentials/__tests__/project-scope.unit.test.ts:11  '../../vendor-credentials/abort-guarded-repo.js' -> '@jini-ai/integrations/vendor-credentials/abort-guarded-repo'
apps/website/src/features/custom-credentials/tool-registrations.ts:6  '../vendor-credentials/abort-guarded-repo.js' -> '@jini-ai/integrations/vendor-credentials/abort-guarded-repo'
apps/website/src/features/deployments/publish-agent-tools.ts:6  '../vendor-credentials/abort-guarded-repo.js' -> '@jini-ai/integrations/vendor-credentials/abort-guarded-repo'
apps/website/src/features/deployments/publish-agent-tools.ts:7  '../vendor-credentials/abort-guarded-repo.js' -> '@jini-ai/integrations/vendor-credentials/abort-guarded-repo'
apps/website/src/features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts:18  '#src/features/vendor-credentials/abort-guarded-repo' -> '@jini-ai/integrations/vendor-credentials/abort-guarded-repo'
apps/website/src/features/project-keys/__tests__/create-abort.unit.test.ts:3  '../../vendor-credentials/abort-guarded-repo.js' -> '@jini-ai/integrations/vendor-credentials/abort-guarded-repo'
apps/website/src/features/source-control/credential-setup.ts:3  '../vendor-credentials/abort-guarded-repo.js' -> '@jini-ai/integrations/vendor-credentials/abort-guarded-repo'
apps/website/src/server/runtime/composition/source-control-key-binding.ts:1  '#src/features/vendor-credentials/abort-guarded-repo' -> '@jini-ai/integrations/vendor-credentials/abort-guarded-repo'
apps/website/src/features/source-control/__tests__/project-scope.unit.test.ts:15  '../../vendor-credentials/project-scope.js' -> '@jini-ai/integrations/vendor-credentials/project-scope'
apps/website/src/features/source-control/repo.memory.ts:5  '../vendor-credentials/project-scope.js' -> '@jini-ai/integrations/vendor-credentials/project-scope'
apps/website/src/features/source-control/source-control-credential-repo.ts:5  '#src/features/vendor-credentials/project-scope' -> '@jini-ai/integrations/vendor-credentials/project-scope'
apps/website/src/features/source-control/types.ts:6  '../vendor-credentials/project-scope.js' -> '@jini-ai/integrations/vendor-credentials/project-scope'
apps/website/src/features/vendor-credentials/__tests__/index.unit.test.ts:8  '../project-scope.js' -> '@jini-ai/integrations/vendor-credentials/project-scope'
apps/website/src/features/vendor-credentials/index.ts:11  './project-scope.js' -> '@jini-ai/integrations/vendor-credentials/project-scope'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/vendor-credentials/index.ts:12  './project-scope.js' -> '@jini-ai/integrations/vendor-credentials/project-scope'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
```

## Tovu tests that must stay green (5; import lines are repointed above, assertions untouched)
- `apps/website/src/features/custom-credentials/__tests__/project-scope.unit.test.ts`
- `apps/website/src/features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts`
- `apps/website/src/features/project-keys/__tests__/create-abort.unit.test.ts`
- `apps/website/src/features/source-control/__tests__/project-scope.unit.test.ts`
- `apps/website/src/features/vendor-credentials/__tests__/index.unit.test.ts`

## Named mutation
in the Jini copy of `project-scope.ts`, negate the first `if (` condition of its first exported function; `project-scope.unit.test.ts` must go red, then revert
