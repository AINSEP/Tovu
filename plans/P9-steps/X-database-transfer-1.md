# X-database-transfer-1 — database-transfer → @jini-ai/db (Jini step J then Tovu step T)

Lane X. Batch J:21 T:22. Depends on: none (only already-Jini code). Est: J 51 min, T 43 min.

## J — move verbatim into Jini (6 files, 331 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/database-transfer/exclusions.ts` | `packages/db/src/transfer/exclusions.ts` | 85 |  |
| `apps/website/src/features/database-transfer/plan-store.ts` | `packages/db/src/transfer/plan-store.ts` | 6 |  |
| `apps/website/src/features/database-transfer/postgres-target.ts` | `packages/db/src/transfer/postgres-target.ts` | 11 | W1 |
| `apps/website/src/features/database-transfer/transfer-messages.ts` | `packages/db/src/transfer/transfer-messages.ts` | 22 | W5 |
| `apps/website/src/features/database-transfer/table-catalog.ts` | `packages/db/src/transfer/table-catalog.ts` | 185 | W2 |
| `apps/website/src/features/database-transfer/copy-engine.ts` | `packages/db/src/transfer/copy-engine.ts` | 22 | W5 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/db" exports["./transfer/copy-engine"]
- "@jini-ai/db" exports["./transfer/exclusions"]
- "@jini-ai/db" exports["./transfer/plan-store"]
- "@jini-ai/db" exports["./transfer/postgres-target"]
- "@jini-ai/db" exports["./transfer/table-catalog"]
- "@jini-ai/db" exports["./transfer/transfer-messages"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (3, 111 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/database-transfer/__tests__/pg-test-db.ts`
- `apps/website/src/features/database-transfer/__tests__/transfer-messages.unit.test.ts`
- `apps/website/src/features/database-transfer/__tests__/postgres-ddl.unit.test.ts`


## T — Tovu repoint: delete the 6 sources, rewrite every importer (25 lines)

```
apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts:22  '../exclusions.js' -> '@jini-ai/db/transfer/exclusions'
apps/website/src/features/database-transfer/__tests__/exclusions.unit.test.ts:14  '../exclusions.js' -> '@jini-ai/db/transfer/exclusions'
apps/website/src/features/database-transfer/__tests__/confirmation-policy.unit.test.ts:9  '../plan-store.js' -> '@jini-ai/db/transfer/plan-store'
apps/website/src/features/database-transfer/__tests__/confirmation-ui.unit.test.ts:7  '../plan-store.js' -> '@jini-ai/db/transfer/plan-store'
apps/website/src/features/database-transfer/__tests__/tool-registrations.faults.unit.test.ts:13  '../plan-store.js' -> '@jini-ai/db/transfer/plan-store'
apps/website/src/features/database-transfer/__tests__/tool-registrations.postgres.test.ts:17  '../plan-store.js' -> '@jini-ai/db/transfer/plan-store'
apps/website/src/features/database-transfer/__tests__/transfer-snapshots.unit.test.ts:13  '../plan-store.js' -> '@jini-ai/db/transfer/plan-store'
apps/website/src/features/database-transfer/confirmation-ui.ts:3  './plan-store.js' -> '@jini-ai/db/transfer/plan-store'
apps/website/src/features/database-transfer/tool-registrations.ts:23  './plan-store.js' -> '@jini-ai/db/transfer/plan-store'
apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts:23  '../postgres-target.js' -> '@jini-ai/db/transfer/postgres-target'
apps/website/src/features/database-transfer/destination-store.ts:8  './postgres-target.js' -> '@jini-ai/db/transfer/postgres-target'
apps/website/src/features/database-transfer/tool-registrations.ts:24  './postgres-target.js' -> '@jini-ai/db/transfer/postgres-target'
apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts:21  '../transfer-messages.js' -> '@jini-ai/db/transfer/transfer-messages'
apps/website/src/features/database-transfer/tool-registrations.ts:30  './transfer-messages.js' -> '@jini-ai/db/transfer/transfer-messages'
apps/website/src/features/database-transfer/__tests__/table-catalog.unit.test.ts:10  '../table-catalog.js' -> '@jini-ai/db/transfer/table-catalog'
apps/website/src/features/database-transfer/__tests__/transfer-completeness.unit.test.ts:11  '../table-catalog.js' -> '@jini-ai/db/transfer/table-catalog'
apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts:26  '#src/features/database-transfer/table-catalog' -> '@jini-ai/db/transfer/table-catalog'
apps/website/src/platform/db/__tests__/pg-content-schema.ts:4  '../../../features/database-transfer/table-catalog.js' -> '@jini-ai/db/transfer/table-catalog'
apps/website/src/platform/db/migrations/__tests__/secrets-vault-step.test.ts:8  '#src/features/database-transfer/table-catalog' -> '@jini-ai/db/transfer/table-catalog'
apps/website/src/server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts:18  '#src/features/database-transfer/table-catalog' -> '@jini-ai/db/transfer/table-catalog'
apps/website/src/server/runtime/composition/database-transfer-adapters.ts:10  '#src/features/database-transfer/table-catalog' -> '@jini-ai/db/transfer/table-catalog'
apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts:20  '../copy-engine.js' -> '@jini-ai/db/transfer/copy-engine'
apps/website/src/features/database-transfer/__tests__/exclusions.unit.test.ts:12  '../copy-engine.js' -> '@jini-ai/db/transfer/copy-engine'
apps/website/src/features/database-transfer/tool-registrations.ts:20  './copy-engine.js' -> '@jini-ai/db/transfer/copy-engine'
apps/website/src/features/database-transfer/tool-registrations.ts:29  './copy-engine.js' -> '@jini-ai/db/transfer/copy-engine'
```

## Tovu tests that must stay green (13; import lines are repointed above, assertions untouched)
- `apps/website/src/features/database-transfer/__tests__/confirmation-policy.unit.test.ts`
- `apps/website/src/features/database-transfer/__tests__/confirmation-ui.unit.test.ts`
- `apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts`
- `apps/website/src/features/database-transfer/__tests__/exclusions.unit.test.ts`
- `apps/website/src/features/database-transfer/__tests__/table-catalog.unit.test.ts`
- `apps/website/src/features/database-transfer/__tests__/tool-registrations.faults.unit.test.ts`
- `apps/website/src/features/database-transfer/__tests__/tool-registrations.postgres.test.ts`
- `apps/website/src/features/database-transfer/__tests__/transfer-completeness.unit.test.ts`
- `apps/website/src/features/database-transfer/__tests__/transfer-snapshots.unit.test.ts`
- `apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts`
- `apps/website/src/platform/db/__tests__/pg-content-schema.ts`
- `apps/website/src/platform/db/migrations/__tests__/secrets-vault-step.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/database-transfer/postgres-target.ts` (1)
- `apps/website/src/features/database-transfer/transfer-messages.ts` (5)
- `apps/website/src/features/database-transfer/table-catalog.ts` (2)
- `apps/website/src/features/database-transfer/copy-engine.ts` (5)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/features/database-transfer/postgres-target.ts:9: return createTarget({ connectionString }, { parentEnv, applicationName: "tovu-database-transfer" });
apps/website/src/features/database-transfer/transfer-messages.ts:9: export const TOVU_TRANSFER_MESSAGES: DbTransferMessages & Pick<DbMessages, "privateAreasTaken" | "noDestination" | "uncheckedLinks" | "desti
apps/website/src/features/database-transfer/table-catalog.ts:150: const MIGRATION_LEDGERS = new Set(["__drizzle_migrations", "tovu_migrations", "tovu_chat_migrations"]);
apps/website/src/features/database-transfer/copy-engine.ts:8: export const DEFAULT_TRANSFER_SCHEMA = "tovu";
apps/website/src/features/database-transfer/copy-engine.ts:9: export const TRANSFER_MARKER_TABLE = "_tovu_transfer";
apps/website/src/features/database-transfer/copy-engine.ts:10: export const TRANSFER_NAMING: TransferNaming = { defaultSchema: DEFAULT_TRANSFER_SCHEMA, markerTable: TRANSFER_MARKER_TABLE, unvalidatedTabl
```

## Named mutation
in the Jini copy of `table-catalog.ts`, negate the first `if (` condition of its first exported function; `postgres-ddl.unit.test.ts` must go red, then revert
