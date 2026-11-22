# X-database-transfer-1 — database-transfer → @jini-ai/db (Jini step J then Tovu step T)

Lane X. Batch J:21 T:22. Depends on: none (only already-Jini code). Est: J 39 min, T 31 min.

## J — move verbatim into Jini (3 files, 292 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/database-transfer/exclusions.ts` | `packages/db/src/transfer/exclusions.ts` | 85 |  |
| `apps/website/src/features/database-transfer/transfer-messages.ts` | `packages/db/src/transfer/transfer-messages.ts` | 22 | W5 |
| `apps/website/src/features/database-transfer/table-catalog.ts` | `packages/db/src/transfer/table-catalog.ts` | 185 | W2 COLLISION |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/db" exports["./transfer/exclusions"]
- "@jini-ai/db" exports["./transfer/table-catalog"]
- "@jini-ai/db" exports["./transfer/transfer-messages"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (2, 76 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/database-transfer/__tests__/transfer-messages.unit.test.ts`
- `apps/website/src/features/database-transfer/__tests__/postgres-ddl.unit.test.ts`


## T — Tovu repoint: delete the 3 sources, rewrite every importer (13 lines)

```
apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts:22  '../exclusions.js' -> '@jini-ai/db/transfer/exclusions'
apps/website/src/features/database-transfer/__tests__/exclusions.unit.test.ts:14  '../exclusions.js' -> '@jini-ai/db/transfer/exclusions'
apps/website/src/features/database-transfer/copy-engine.ts:3  './exclusions.js' -> '@jini-ai/db/transfer/exclusions'
apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts:21  '../transfer-messages.js' -> '@jini-ai/db/transfer/transfer-messages'
apps/website/src/features/database-transfer/tool-registrations.ts:30  './transfer-messages.js' -> '@jini-ai/db/transfer/transfer-messages'
apps/website/src/features/database-transfer/__tests__/table-catalog.unit.test.ts:10  '../table-catalog.js' -> '@jini-ai/db/transfer/table-catalog'
apps/website/src/features/database-transfer/__tests__/transfer-completeness.unit.test.ts:11  '../table-catalog.js' -> '@jini-ai/db/transfer/table-catalog'
apps/website/src/features/database-transfer/copy-engine.ts:6  './table-catalog.js' -> '@jini-ai/db/transfer/table-catalog'
apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts:26  '#src/features/database-transfer/table-catalog' -> '@jini-ai/db/transfer/table-catalog'
apps/website/src/platform/db/__tests__/pg-content-schema.ts:4  '../../../features/database-transfer/table-catalog.js' -> '@jini-ai/db/transfer/table-catalog'
apps/website/src/platform/db/migrations/__tests__/secrets-vault-step.test.ts:8  '#src/features/database-transfer/table-catalog' -> '@jini-ai/db/transfer/table-catalog'
apps/website/src/server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts:18  '#src/features/database-transfer/table-catalog' -> '@jini-ai/db/transfer/table-catalog'
apps/website/src/server/runtime/composition/database-transfer-adapters.ts:10  '#src/features/database-transfer/table-catalog' -> '@jini-ai/db/transfer/table-catalog'
```

## Tovu tests that must stay green (8; import lines are repointed above, assertions untouched)
- `apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts`
- `apps/website/src/features/database-transfer/__tests__/exclusions.unit.test.ts`
- `apps/website/src/features/database-transfer/__tests__/table-catalog.unit.test.ts`
- `apps/website/src/features/database-transfer/__tests__/transfer-completeness.unit.test.ts`
- `apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts`
- `apps/website/src/platform/db/__tests__/pg-content-schema.ts`
- `apps/website/src/platform/db/migrations/__tests__/secrets-vault-step.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/database-transfer/transfer-messages.ts` (5)
- `apps/website/src/features/database-transfer/table-catalog.ts` (2)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## COLLISION — Jini already has a file at the destination
- `apps/website/src/features/database-transfer/table-catalog.ts` → `packages/db/src/transfer/table-catalog.ts`: diff the two first. Same behaviour → this is a leftover duplicate: delete the Tovu copy and repoint its importers to the existing Jini export (no move). Different → STOP and report the diff (do not merge behaviours).

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/features/database-transfer/transfer-messages.ts:9: export const TOVU_TRANSFER_MESSAGES: DbTransferMessages & Pick<DbMessages, "privateAreasTaken" | "noDestination" | "uncheckedLinks" | "desti
apps/website/src/features/database-transfer/table-catalog.ts:150: const MIGRATION_LEDGERS = new Set(["__drizzle_migrations", "tovu_migrations", "tovu_chat_migrations"]);
```

## Named mutation
in the Jini copy of `table-catalog.ts`, negate the first `if (` condition of its first exported function; `postgres-ddl.unit.test.ts` must go red, then revert
