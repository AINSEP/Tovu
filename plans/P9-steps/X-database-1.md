# X-database-1 — database → @jini-ai/db (Jini step J then Tovu step T)

Lane X. Batch J:21 T:23. Depends on: C-contracts-core-7. Est: J 38 min, T 23 min.

## J — move verbatim into Jini (3 files, 44 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/database/db-messages.ts` | `packages/db/src/site/db-messages.ts` | 23 | W3 |
| `apps/website/src/features/database/agent-tools.ts` | `packages/db/src/site/agent-tools.ts` | 10 | W3 |
| `apps/website/src/features/database/gated-hooks.ts` | `packages/db/src/site/gated-hooks.ts` | 11 | W1 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/db" exports["./site/agent-tools"]
- "@jini-ai/db" exports["./site/db-messages"]
- "@jini-ai/db" exports["./site/gated-hooks"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (2, 200 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/database/__tests__/unit/agent-tools.unit.test.ts`
- `apps/website/src/features/database/__tests__/unit/migrate-forward-hooks.unit.test.ts`


## T — Tovu repoint: delete the 3 sources, rewrite every importer (9 lines)

```
apps/website/src/features/database/tool-registrations.ts:45  './db-messages.js' -> '@jini-ai/db/site/db-messages'
apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts:63  '../../features/database/agent-tools.js' -> '@jini-ai/db/site/agent-tools'
apps/website/src/assistant/__tests__/tool-registrations.database-recovery.test.ts:12  '../../features/database/agent-tools.js' -> '@jini-ai/db/site/agent-tools'
apps/website/src/features/database/__tests__/db-tool-descriptors.snapshot.unit.test.ts:3  '../agent-tools.js' -> '@jini-ai/db/site/agent-tools'
apps/website/src/features/database/tool-registrations.ts:44  './agent-tools.js' -> '@jini-ai/db/site/agent-tools'
apps/website/src/features/database/tool-registrations.ts:43  './gated-hooks.js' -> '@jini-ai/db/site/gated-hooks'
apps/website/src/features/recovery/tool-registrations.ts:44  '../database/gated-hooks.js' -> '@jini-ai/db/site/gated-hooks'
apps/website/src/server/inbound/admin-http/routes/database/migrate-forward.ts:13  '#src/features/database/gated-hooks' -> '@jini-ai/db/site/gated-hooks'
apps/website/src/server/routes/types.ts:116  '../../features/database/gated-hooks.js' -> '@jini-ai/db/site/gated-hooks'
```

## Tovu tests that must stay green (3; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.database-recovery.test.ts`
- `apps/website/src/features/database/__tests__/db-tool-descriptors.snapshot.unit.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/database/db-messages.ts` (3)
- `apps/website/src/features/database/agent-tools.ts` (3)
- `apps/website/src/features/database/gated-hooks.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/features/database/db-messages.ts:9: export const TOVU_DATABASE_MESSAGES: DbMessages = {
apps/website/src/features/database/agent-tools.ts:7: return getJiniDatabaseAgentToolCatalog({}, { messages: TOVU_DATABASE_MESSAGES });
```

## Named mutation
in the Jini copy of `db-messages.ts`, negate the first `if (` condition of its first exported function; `agent-tools.unit.test.ts` must go red, then revert
