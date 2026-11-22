# X-permanent-delete-1 — permanent-delete → @jini-ai/cms (Jini step J then Tovu step T)

Lane X. Batch J:15 T:17. Depends on: none (only already-Jini code). Est: J 28 min, T 25 min.

## J — move verbatim into Jini (1 files, 35 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/permanent-delete/agent-tools.ts` | `packages/cms/src/trash/permanent/agent-tools.ts` | 35 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./trash/permanent/agent-tools"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 1 sources, rewrite every importer (8 lines)

```
apps/website/src/assistant/__tests__/content-target-inputs.test.ts:15  '../../features/permanent-delete/agent-tools.js' -> '@jini-ai/cms/trash/permanent/agent-tools'
apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.permanent-delete.integration.test.ts:7  '#src/features/permanent-delete/agent-tools' -> '@jini-ai/cms/trash/permanent/agent-tools'
apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts:33  '../../features/permanent-delete/agent-tools.js' -> '@jini-ai/cms/trash/permanent/agent-tools'
apps/website/src/features/permanent-delete/tool-registrations.ts:19  './agent-tools.js' -> '@jini-ai/cms/trash/permanent/agent-tools'
apps/website/src/features/trash/__tests__/tool-registrations.test.ts:12  '../../permanent-delete/agent-tools.js' -> '@jini-ai/cms/trash/permanent/agent-tools'
apps/website/src/server/runtime/composition/__tests__/account-purge-protections.test.ts:5  '#src/features/permanent-delete/agent-tools' -> '@jini-ai/cms/trash/permanent/agent-tools'
apps/website/src/server/runtime/composition/content-target-inputs.ts:13  '#src/features/permanent-delete/agent-tools' -> '@jini-ai/cms/trash/permanent/agent-tools'
apps/website/src/server/runtime/composition/permanent-delete-deps.ts:15  '#src/features/permanent-delete/agent-tools' -> '@jini-ai/cms/trash/permanent/agent-tools'
```

## Tovu tests that must stay green (5; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/content-target-inputs.test.ts`
- `apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.permanent-delete.integration.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`
- `apps/website/src/features/trash/__tests__/tool-registrations.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/account-purge-protections.test.ts`

## Named mutation
in the Jini copy of `agent-tools.ts`, negate the first `if (` condition of its first exported function; `content-target-inputs.test.ts` must go red, then revert
