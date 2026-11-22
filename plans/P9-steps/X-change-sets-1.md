# X-change-sets-1 — change-sets → @jini-ai/cms (Jini step J then Tovu step T)

Lane X. Batch J:16 T:18. Depends on: none (only already-Jini code). Est: J 29 min, T 19 min.

## J — move verbatim into Jini (1 files, 108 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/change-sets/agent-tools.ts` | `packages/cms/src/change-sets/agent-tools.ts` | 108 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./change-sets/agent-tools"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 1 sources, rewrite every importer (3 lines)

```
apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts:100  '../../features/change-sets/agent-tools.js' -> '@jini-ai/cms/change-sets/agent-tools'
apps/website/src/features/change-sets/__tests__/tool-registrations.test.ts:22  '#src/features/change-sets/agent-tools' -> '@jini-ai/cms/change-sets/agent-tools'
apps/website/src/features/change-sets/tool-registrations.ts:30  './agent-tools.js' -> '@jini-ai/cms/change-sets/agent-tools'
```

## Tovu tests that must stay green (2; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`
- `apps/website/src/features/change-sets/__tests__/tool-registrations.test.ts`

## Named mutation
in the Jini copy of `agent-tools.ts`, negate the first `if (` condition of its first exported function; `tool-registrations.contracts.test.ts` must go red, then revert
