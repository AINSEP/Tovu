# X-analytics-1 — analytics → @jini-ai/analytics (Jini step J then Tovu step T)

Lane X. Batch J:9 T:10. Depends on: none (only already-Jini code). Est: J 35 min, T 31 min.

## J — move verbatim into Jini (3 files, 277 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/analytics/agent-tools.ts` | `packages/analytics/src/site/agent-tools.ts` | 13 |  |
| `apps/website/src/features/analytics/types.ts` | `packages/analytics/src/site/types.ts` | 54 | W1 |
| `apps/website/src/features/analytics/ports.ts` | `packages/analytics/src/site/ports.ts` | 210 | W2 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/analytics" exports["./site/agent-tools"]
- "@jini-ai/analytics" exports["./site/ports"]
- "@jini-ai/analytics" exports["./site/types"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 3 sources, rewrite every importer (16 lines)

```
apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts:107  '../../features/analytics/agent-tools.js' -> '@jini-ai/analytics/site/agent-tools'
apps/website/src/features/analytics/tool-registrations.ts:12  './agent-tools.js' -> '@jini-ai/analytics/site/agent-tools'
apps/website/src/features/analytics/__tests__/forwarding.test.ts:7  '../types.js' -> '@jini-ai/analytics/site/types'
apps/website/src/features/analytics/__tests__/jini-adapters.test.ts:7  '../types.js' -> '@jini-ai/analytics/site/types'
apps/website/src/features/analytics/__tests__/jini-adapters.unit.test.ts:5  '../types.js' -> '@jini-ai/analytics/site/types'
apps/website/src/features/analytics/__tests__/repo.contract.test.ts:13  '../types.js' -> '@jini-ai/analytics/site/types'
apps/website/src/features/analytics/config.settings.ts:11  './types.js' -> '@jini-ai/analytics/site/types'
apps/website/src/features/analytics/index.ts:37  './types.js' -> '@jini-ai/analytics/site/types'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/analytics/jini-adapters.ts:15  './types.js' -> '@jini-ai/analytics/site/types'
apps/website/src/features/analytics/__tests__/index.test.ts:15  '../ports.js' -> '@jini-ai/analytics/site/ports'
apps/website/src/features/analytics/__tests__/repo.contract.test.ts:12  '../ports.js' -> '@jini-ai/analytics/site/ports'
apps/website/src/features/analytics/config.settings.ts:10  './ports.js' -> '@jini-ai/analytics/site/ports'
apps/website/src/features/analytics/forwarding.ts:10  './ports.js' -> '@jini-ai/analytics/site/ports'
apps/website/src/features/analytics/index.ts:55  './ports.js' -> '@jini-ai/analytics/site/ports'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/analytics/index.ts:62  './ports.js' -> '@jini-ai/analytics/site/ports'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/analytics/jini-adapters.ts:14  './ports.js' -> '@jini-ai/analytics/site/ports'
```

## Tovu tests that must stay green (6; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`
- `apps/website/src/features/analytics/__tests__/forwarding.test.ts`
- `apps/website/src/features/analytics/__tests__/index.test.ts`
- `apps/website/src/features/analytics/__tests__/jini-adapters.test.ts`
- `apps/website/src/features/analytics/__tests__/jini-adapters.unit.test.ts`
- `apps/website/src/features/analytics/__tests__/repo.contract.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/analytics/types.ts` (1)
- `apps/website/src/features/analytics/ports.ts` (2)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Named mutation
in the Jini copy of `ports.ts`, negate the first `if (` condition of its first exported function; `repo.contract.test.ts` must go red, then revert
