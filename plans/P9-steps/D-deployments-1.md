# D-deployments-1 — deployments → @jini-ai/devops (Jini step J then Tovu step T)

Lane D. Batch J:6 T:13. Depends on: C-contracts-core-3. Est: J 52 min, T 27 min.

## J — move verbatim into Jini (6 files, 576 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/deployments/agent-tools.ts` | `packages/devops/src/deploy/site/agent-tools.ts` | 143 |  |
| `apps/website/src/features/deployments/dockerfile.ts` | `packages/devops/src/deploy/site/dockerfile.ts` | 168 | W2 |
| `apps/website/src/features/deployments/publish-credentials/execution-mode.ts` | `packages/devops/src/deploy/site/publish-credentials/execution-mode.ts` | 43 | W5 |
| `apps/website/src/features/deployments/types.ts` | `packages/devops/src/deploy/site/types.ts` | 52 | W1 |
| `apps/website/src/contracts/core/tool-metadata/deploy-ops.ts` | `packages/devops/src/deploy/site/tool-metadata.ts` | 86 | W2 |
| `apps/website/src/contracts/core/tool-metadata/deployments.ts` | `packages/devops/src/deploy/site/tool-metadata.ts` | 84 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/devops" exports["./deploy/site/agent-tools"]
- "@jini-ai/devops" exports["./deploy/site/dockerfile"]
- "@jini-ai/devops" exports["./deploy/site/publish-credentials/execution-mode"]
- "@jini-ai/devops" exports["./deploy/site/tool-metadata"]
- "@jini-ai/devops" exports["./deploy/site/types"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (3, 364 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/deployments/__tests__/dockerfile.unit.test.ts`
- `apps/website/src/features/deployments/publish-credentials/__tests__/execution-mode.unit.test.ts`
- `apps/website/src/features/deployments/deploy-targets/__tests__/no-vendor-in-core.boundary.test.ts`


## T — Tovu repoint: delete the 6 sources, rewrite every importer (15 lines)

```
apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts:69  '../../features/deployments/agent-tools.js' -> '@jini-ai/devops/deploy/site/agent-tools'
apps/website/src/features/deployments/tool-registrations.ts:13  './agent-tools.js' -> '@jini-ai/devops/deploy/site/agent-tools'
apps/website/src/features/deployments/__tests__/integration/tool-registrations.integration.test.ts:12  '../../dockerfile.js' -> '@jini-ai/devops/deploy/site/dockerfile'
apps/website/src/features/deployments/index.ts:52  './dockerfile.js' -> '@jini-ai/devops/deploy/site/dockerfile'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/deployments/tool-registrations.ts:14  './dockerfile.js' -> '@jini-ai/devops/deploy/site/dockerfile'
apps/website/src/features/deployments/publish-credentials/index.ts:34  './execution-mode.js' -> '@jini-ai/devops/deploy/site/publish-credentials/execution-mode'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/deployments/static-publish/credentials.ts:8  '../publish-credentials/execution-mode.js' -> '@jini-ai/devops/deploy/site/publish-credentials/execution-mode'
apps/website/src/features/deployments/index.ts:10  './types.js' -> '@jini-ai/devops/deploy/site/types'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/deployments/ports.ts:3  './types.js' -> '@jini-ai/devops/deploy/site/types'
apps/website/src/contracts/core/tool-metadata/index.ts:16  './deploy-ops.js' -> '@jini-ai/devops/deploy/site/tool-metadata'
apps/website/src/features/deployments/deploy-ops/tool-registrations.ts:2  '../../../contracts/core/tool-metadata/deploy-ops.js' -> '@jini-ai/devops/deploy/site/tool-metadata'
apps/website/src/assistant/__tests__/tool-approval-policy.test.ts:207  '../../contracts/core/tool-metadata/deployments.js' -> '@jini-ai/devops/deploy/site/tool-metadata'
apps/website/src/contracts/core/tool-metadata/index.ts:17  './deployments.js' -> '@jini-ai/devops/deploy/site/tool-metadata'
apps/website/src/features/deployments/publish-agent-tools.ts:10  '../../contracts/core/tool-metadata/deployments.js' -> '@jini-ai/devops/deploy/site/tool-metadata'
apps/website/src/features/deployments/tool-registrations.ts:2  '../../contracts/core/tool-metadata/deployments.js' -> '@jini-ai/devops/deploy/site/tool-metadata'
```

## Tovu tests that must stay green (3; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/tool-approval-policy.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`
- `apps/website/src/features/deployments/__tests__/integration/tool-registrations.integration.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/deployments/dockerfile.ts` (2)
- `apps/website/src/features/deployments/publish-credentials/execution-mode.ts` (5)
- `apps/website/src/features/deployments/types.ts` (1)
- `apps/website/src/contracts/core/tool-metadata/deploy-ops.ts` (2)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/features/deployments/publish-credentials/execution-mode.ts:25: const ENV_VAR = "TOVU_EXECUTION_MODE";
apps/website/src/contracts/core/tool-metadata/deploy-ops.ts:21: "Which secrets are set on my hosted app?", "List the environment variables on the server.", "Is TOVU_SITE_KEY set in production?", "Show my 
apps/website/src/contracts/core/tool-metadata/deploy-ops.ts:50: "Set TOVU_SITE_KEY on my host from my site key.", "Copy the site key to the production server.", "Add a secret to my hosted app.", "Copy one
```

## Named mutation
in the Jini copy of `dockerfile.ts`, negate the first `if (` condition of its first exported function; `dockerfile.unit.test.ts` must go red, then revert
