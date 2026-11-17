# R6 + R9 sheet: commerce, cms and cms-forms (5 sites, one Sonnet run, ~95k)

Revision 2 (judge findings 1, 3, 13). Read `COMMON.md` first. Sites: `sites/R6.sites.tsv` (2), `sites/R9.sites.tsv` (3), all class `work`. Needs: C3 and C4 (landed: `@jini-ai/core/contracts/storage`, `…/events`).

```
id: R6R9-storage-consumers
jini_files:
  - packages/commerce/src/payments/ledger/migrations/index.ts:1,3,47-52   | edit
  - packages/commerce/src/payments/ledger/{sql.ts:8, repo.sql.ts:437}     | edit (re-export list; comment)
  - packages/commerce/src/payments/{ingest,accounting}/__tests__/harness.ts, ledger/__tests__/{sqlite,postgres,quarantine-limit}.vitest.test.ts | edit (callers)
  - packages/cms/src/forms/sql/submission-ip-retention-repo.ts:2,7-21     | edit
  - packages/cms/src/forms/sql/ports.ts                                    | NEW (ColumnCatalogPort, ≤ 20 lines) unless a ports file already exists in that folder: then add to it
  - packages/cms/src/comments/ingress.ts:29                                | edit
  - packages/cms/forms/src/ports.ts:69                                     | edit
  - packages/http-kit/src/rate-limit.ts:37                                 | edit (type moves out)
  - packages/core/src/contracts/server/rate-limit.ts                       | NEW; core/src/contracts/server.ts one line
  - scripts/injection-debt.json                                            | delete this lane's keys in the commit that removes each edge (rows for cms/forms/src/ports.ts, cms/package.json ×2, cms/src/comments/ingress.ts, cms/src/forms/sql/submission-ip-retention-repo.ts, commerce/package.json, commerce/.../migrations/index.ts ×2)
tovu_files (existing owners; no new wiring file):
  - apps/website/src/server/runtime/composition/commerce.ts:20,110        | edit (the one caller of the runner)
  - apps/website/src/features/forms/repo.sqlite.ts:6,28,34                | edit (the caller of the retention repo) + its tests
  - importers of the `RateLimiter` type from `@jini-ai/http-kit/rate-limit` (step 1 lists them)
```

## 1. commerce → db (`runMigrations`, `MigrationOptions`, `MigrationReport`, `KyselyKernel`)
**What the code does today (characterize, never invent):** `migrateCommercePayments(required: { kernel }, optional: Omit<MigrationOptions, "ledgerTable"> = {})` (`migrations/index.ts:47-52`) calls db's **three positional arguments** `runMigrations(kernel, steps, options)` (`db/src/migrate/runner.ts:217`; `options.ledgerTable` is required) and **forces `ledgerTable: COMMERCE_PAYMENTS_LEDGER_TABLE`** after spreading the caller's options. The file header (`:12`, `:20`) explains the dedicated ledger and its migration-lock identity. Callers: Tovu `composition/commerce.ts:110` (`paymentSchema ??= migrateCommercePayments({ kernel })`), commerce's two test harnesses and three SQL tests; `ledger/sql.ts:8` re-exports it; `repo.sql.ts:437` names it in a comment.

**Target: the wrapper stays in commerce (commerce is the producer of the ledger-table invariant); only db's function is injected.**
```ts
// packages/commerce/src/payments/ledger/migrations/index.ts
/** The host's migration runner (db's `runMigrations`). Positional on purpose: it is db's own shape. */
export type PaymentsMigrationRunner<Kernel, Report> =
  (kernel: Kernel, steps: readonly MigrationStep<Kernel>[], options: PaymentsMigrationOptions & { readonly ledgerTable: string }) => Promise<Report>;
export function migrateCommercePayments<Kernel extends StorageKernel<unknown, unknown>, Report>(
  required: { kernel: Kernel; runMigrations: PaymentsMigrationRunner<Kernel, Report> },
  optional: PaymentsMigrationOptions = {},
): Promise<Report> {
  return required.runMigrations(required.kernel, COMMERCE_PAYMENTS_MIGRATIONS, { ...optional, ledgerTable: COMMERCE_PAYMENTS_LEDGER_TABLE });
}
```
- `MigrationStep`, `StorageKernel` come from `@jini-ai/core/contracts/storage` (`migration.ts:21`, `kernel.ts`). Core has **no** options or report type (`rg -n "^export" packages/core/src/contracts/storage/migration.ts` prints `MigrationContext`, `MigrationStep` only), so `PaymentsMigrationOptions` is declared locally: copy every field of db's `MigrationOptions` except `ledgerTable` (`rg -n "interface MigrationOptions" -A14 packages/db/src/migrate`). The Tovu binding line fails typecheck if db's options drift. `COMMERCE_PAYMENTS_MIGRATIONS` is retyped `readonly MigrationStep<…>[]` with the kernel parameter the steps really use; if a step body needs a Kysely-typed handle, keep that as the `StorageKernel<Handle>` type argument, never a `@jini-ai/db` type. If the list cannot be typed without importing db or casting, **STOP** (`pnpm --filter @jini-ai/commerce build` is the command).
- The spread order `{ ...optional, ledgerTable }` is behaviour: a caller cannot override the ledger. Keep it.
- Tests keep importing db's real `runMigrations` and pass it in (those five files already import `@jini-ai/db`; no new test edge; G-TESTS decides their final home).

### Tests to write first (`ledger/migrations/__tests__/migrate.ports.unit.test.ts`, new; recording fake runner, no SQL)
| # | Asserts | Fails when |
|---|---|---|
| T1 | the runner receives `(kernel, steps, options)` as three positional values; `steps` is `COMMERCE_PAYMENTS_MIGRATIONS` by identity; step ids and order equal the checked-in list | object-shaped call; reordered or dropped step |
| T2 | `options.ledgerTable === COMMERCE_PAYMENTS_LEDGER_TABLE` even when the caller passes `{ ledgerTable: 'x' }` through an untyped object | spread order reversed (ledger identity lost) |
| T3 | every other option (`backupPath` and each field copied into `PaymentsMigrationOptions`) is forwarded unchanged | an option dropped |
| T4 | the runner's resolved report is returned by identity; its rejection propagates unchanged | error wrapped or swallowed |
| T5 (existing SQL suites, unchanged assertions) | second run applies nothing (rerun), and the ledger table name on the real database is the commerce one while the host's own ledger is untouched | ledger shared with the host's migrations |
T1–T4 are RED until the signature changes. Run T5 green before and after.

## 2. cms → db (`listColumns`, `KyselyKernel`) in `forms/sql/submission-ip-retention-repo.ts`
- `listColumns` is not in core. New local contract, one consumer:
  `export type ColumnCatalogPort = (required: { table: string }) => Promise<readonly { readonly name: string; readonly notNull: boolean }[]>;`
  The factory becomes `createSubmissionIpRetentionRepo<Handle>({ kernel, tables, columns }: { kernel: StorageKernel<Handle>; tables: FormsTables; columns: ColumnCatalogPort }, _optional = {})`; line 21 becomes `await columns({ table: tables.submissions })`. The comment block at `:17-20` stays (reword only "The kernel's catalog helper" → "The host's catalog port").
- **Preserve the SQL handle type:** the body calls `kernel.run(db => db.updateTable(…))`, so the kernel stays typed with the Kysely handle through `StorageKernel`'s type argument (read `core/src/contracts/storage/kernel.ts` for the parameter order). The existing internal cast at `:11` is kept as it is (not a new cast). If removing `KyselyKernel` needs any **new** cast, **STOP**.
- **Host caller (pair):** Tovu `features/forms/repo.sqlite.ts:6` imports the factory as `createPackageRetentionRepo` and calls it at `:34`; `:28` builds a kernel for a sibling class. Bind `columns: ({ table }) => listColumns(kernel, table)` (positional in db: `db/src/kernel/dialect.ts:129`) at every construction: `rg -n "createPackageRetentionRepo\|createSubmissionIpRetentionRepo" apps/website/src`.
- Tests first: (a) fake `columns` returns `source_ip` nullable → the update statement runs; (b) returns it `notNull: true` → throws the existing "requires the nullable source_ip migration (0006)" error and issues **no** write; (c) the probe is called with `tables.submissions`; (d) after one success the probe is not called again; after a failed probe it is called again on the next pass. (b) fails if the branch is inverted; (d) fails if the memo is dropped.

## 3. cms → http-kit (`RateLimiter` type) in `comments/ingress.ts:29`
`RateLimiter` is a pure interface (`http-kit/src/rate-limit.ts:37`, imports only `Clock`). Move the interface and the types it references to `packages/core/src/contracts/server/rate-limit.ts`, export from `core/src/contracts/server.ts` (same commit: any core manifest/README/API-baseline line the new file needs). The limiter implementation stays in http-kit and imports the type from core. Delete the interface from http-kit and repoint every importer in one commit: `rg -n "RateLimiter\b" packages apps examples -g '!**/dist/**'` in both repos; Tovu importers of the **type from `@jini-ai/http-kit/rate-limit`** are the paired commit (Tovu's own `contracts/core/rate-limit` type is a different declaration: leave it). Security (class: request rate limiting): no behaviour change; the existing http-kit rate-limit tests pass unchanged. R7-Z edits this http-kit file later (wave 4).

## 4. cms-forms → cms (`typeof import("@jini-ai/cms/core").executeCommand`) in `cms/forms/src/ports.ts:69`
Replace with `ExecuteCommandFn` from `@jini-ai/core/contracts/events` (`rg -n "ExecuteCommandFn" packages/core/src/contracts/events`). Add a type-level test in cms (`cms/src/core/__tests__/execute-command.typecheck.ts`: `const _: ExecuteCommandFn = executeCommand;` and the reverse assignment). Not assignable both ways → **STOP** (`pnpm --filter @jini-ai/cms typecheck`). Then delete `@jini-ai/cms` from `packages/cms/forms/package.json` production fields if no production import is left, its debt key, and the `cms-forms→cms` same-layer helper in `scripts/check-package-layers.ts` with its test, all in that commit.

## Tovu edits (in the paired commits)
```ts
// composition/commerce.ts (existing owner of the call at :110)
import { runMigrations } from '@jini-ai/db/migrate';
paymentSchema ??= migrateCommercePayments({ kernel: required.kernel, runMigrations });
```
No wrapper function and no new file: the forced ledger table stays inside commerce. If `runMigrations` is not assignable to `PaymentsMigrationRunner` without a cast, **STOP** (the local options type is wrong).

## Steps (each commit green alone; debt keys and manifests in the same commit as the edge)
1. §3 pair. 2. §4. 3. §2 pair (Jini commit, then Tovu `repo.sqlite.ts` + its tests). 4. §1 pair (T1–T4 first; Jini commit updates the five in-package callers and `sql.ts`; then Tovu `commerce.ts`). 5. Manifests: `@jini-ai/db` and `@jini-ai/http-kit` leave cms's and commerce's `dependencies`/`peerDependencies` (they stay `devDependencies` while SQL tests import them) with their two `manifest-peer` debt keys and `pnpm install`.

## STOP
- §1: the step list cannot be typed from core without a cast (command above). §2: a new cast is needed. §4: not assignable.
- A Tovu caller of the runner or the repo exists that the `rg` lines above did not list in this sheet: report it, then fix it in the same pair (same edge kind) unless it is in a file INDEX §4 gives to another lane.
