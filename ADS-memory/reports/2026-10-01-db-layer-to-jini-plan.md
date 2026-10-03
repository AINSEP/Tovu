# Plan: move Tovu's database layer (SQLite + PGlite + Postgres kernel) into Jini (2026-10-01)

Author: Software Architect subagent. Read-only investigation: no code edits, no git writes, no test runs.
Owner ask: "move the PGlite and SQLite stuff and just encapsulate it in Jini and then import it, because
other projects are going to need the same thing."

Paths are under `apps/website/src/platform/db/` unless they say otherwise. Line counts are from `wc -l`
on 2026-10-01.

---

## 0. Summary

- **New package `@jini-ai/db`** with subpath exports `./kernel`, `./sqlite`, `./pglite`, `./postgres`,
  `./migrate`. Do not extend `@jini-ai/sqlite` or `@jini-ai/infra` (reasons in §2.1).
- **What moves: about 2,470 LOC of source and about 1,690 LOC of tests.** That is the kernel, the three
  drivers, the PGlite owner and socket server, and the migration runner. It is already written to be
  generic. It has a Kysely port, no Drizzle, and no `#src/` imports. It carries only 6 Tovu literals,
  which become parameters.
- **What stays in Tovu: everything that names a Tovu table.** That covers the Drizzle schema files and
  the `drizzle/` chain, the generated `ContentDatabase` types, the repos, the `sqlite/*.sqlite.ts` repo
  shims, the migration steps and their checksums, the legacy Drizzle adoption, `manifest.ts`, and the
  sealed-credential code.
- **Tovu keeps every import path working.** Each moved file becomes a one-line re-export shim, so no
  importer is edited and no other agent's file is touched until the optional cleanup slice.
- **7 slices**, plus 1 deferred slice for the transfer engine. The first slice is `@jini-ai/db/kernel`
  (port, kernel core, turn lock, dialect helpers). It is pure TypeScript, no driver is involved, and it
  does not touch the live database. It proves the two hard parts cheaply: Kysely type identity across
  the package boundary, and publishing/linking.

---

## 1. Inventory

### 1.1 GENERIC: moves to Jini (source 2,469 LOC)

| File | LOC | Notes / Tovu coupling to remove |
|---|---:|---|
| `kernel/port.ts` | 93 | `StorageKernel<DB>`, capabilities, `UnsupportedCapabilityError`. Clean. |
| `kernel/kernel-core.ts` | 150 | `buildKernel`, `KernelDriver`. AsyncLocalStorage scope plus process-wide `heldLocks`, so there must be exactly ONE module instance. Clean. |
| `kernel/turn-lock.ts` | 49 | FIFO shared/exclusive lock. Clean. |
| `kernel/dialect.ts` | 237 | JSON helpers, `nowIso`, `toBool`, `isUniqueViolation`, `toBytes`, introspection (`listTables/Columns/Indexes`, `tableExists`), portable DDL (`columnTypeSql`, `autoIdColumnSql`), `checkpointWal`. Imports only kysely. Clean. |
| `kernel/schema-scope.ts` | 20 | `scopeToSchema` via `withSchema`. Clean. |
| `kernel/schema-shape.ts` | 120 | `readSchemaShape`, `databaseFile`. Clean. |
| `kernel/typegen.ts` | 104 | `renderDatabaseTypes` (Kysely types from a reference PG db). Clean. |
| `kernel/index.ts` | 39 | Barrel. It becomes the Tovu facade (§3, slice 7). |
| `kernel/drivers/sqlite.ts` | 167 | better-sqlite3 driver. **Value-imports `better-sqlite3`** (`new Database` in `openSqliteFileKernel`). Must become type-only plus an injected opener (risk R2). |
| `kernel/drivers/pglite.ts` | 66 | In-process PGlite driver. |
| `kernel/drivers/pglite-dialect.ts` | 108 | Kysely dialect over PGlite. |
| `kernel/drivers/pg-types.ts` | 29 | Shared PG parsers (json stays text, int8 rule). |
| `kernel/drivers/pglite-owner.ts` | 347 | Owner process, pid lock, socket dir, low-memory params. **Tovu literals:** `OWNER_LOCK_FILE = "tovu-owner.pid"`, `~/.tovu/run/<key>`, `/tmp/tovu-<uid>`. |
| `kernel/pglite-server/socket-server.ts` (+ `LICENSE`, `NOTICE.md`) | 391 | Vendored and patched pglite-socket (RFQ filter, no wedge, idle-in-tx timeout, `runExclusive`). Apache-2.0: LICENSE and NOTICE must travel with it. |
| `kernel/drivers/pglite-socket.ts` | 58 | Socket CLIENT kernel (node-postgres, one connection, turn lock). |
| `kernel/drivers/postgres.ts` | 44 | node-postgres pool driver. |
| `kernel/drivers/postgres-lock.ts` | 10 | `pg_advisory_xact_lock`. |
| `kernel/ops.ts` | 190 | `StorageOps` (copy/compact per transport). **Mixes all drivers** (value-imports `PGlite` and `sqliteConnectionOf`) and **hardcodes `tovu_migrations`** in the compact read-back (lines 182-187). It must be split per driver and take the ledger name as a parameter. |
| `migrations/runner.ts` | 192 | `runMigrations`, `assertValidSteps`. **`LEDGER_TABLE = "tovu_migrations"`** default. |
| `migrations/step.ts` | 55 | `MigrationStep`, errors. **Error text says "upgraded by a newer Tovu"** (line 44). |
| `migration/pg-fixture.ts` | 75 | `psql` test fixture (test infra only). Moves to a `testing` folder inside the package; it is not exported. |

**Generic tests that move WITH the code (about 1,690 LOC):**

| Test | LOC | Edit needed before it can move |
|---|---:|---|
| `kernel/__tests__/kernel.test.ts` | 260 | It imports `drizzle-orm/better-sqlite3` to get a handle. Pass the raw client instead (`sqliteKernel` already accepts it). |
| `kernel/__tests__/dialect-json.test.ts` | 122 | Same Drizzle swap. |
| `kernel/__tests__/sqlite-same-file.test.ts` | 65 | none |
| `kernel/__tests__/backup.test.ts` | 43 | none |
| `kernel/__tests__/ops.test.ts` | 178 | Follows the `ops.ts` split. |
| `kernel/__tests__/pglite-owner.test.ts` (+ `fixtures/owner-lock-race-child.ts` 25, `fixtures/pglite-owner-child.ts` 13) | 434 | It imports Tovu's `pglite/content-schema.js`. Replace that with a 2-table local fixture. |
| `kernel/__tests__/pglite-socket-server.test.ts` | 274 | none (keeps the PGlite version-pin assertion) |
| `kernel/__tests__/kernel.postgres.test.ts` | 121 | Uses Tovu's `__tests__/postgres-database.ts` (25 LOC). Move that helper too. |
| `kernel/__tests__/postgres-pool-error.postgres.test.ts` | 42 | same |
| `kernel/__tests__/ops.postgres.test.ts` | 49 | same, plus `pg-fixture` |
| `migrations/__tests__/runner.test.ts` | 123 | none (kernel + runner + step only) |

**Runner change for every moved test:** Jini runs vitest and has no `node:test` anywhere; Tovu runs
`node --test`. The only edit is the import line: `node:test` becomes `vitest`, `before` becomes
`beforeAll`, and `after` becomes `afterAll`. `node:assert/strict` works unchanged under vitest. That
counts as moving a test, not rewriting it, but each moved file gets its own commit that shows only
that diff.

### 1.2 TOVU-SPECIFIC: stays (about 17,200 LOC plus the Drizzle chain)

| Group | Files | LOC |
|---|---|---:|
| Drizzle schemas (MySQL/PG generated from SQLite) | `schema.sqlite.ts`, `schema.postgres.ts`, `schema.mysql.ts` | 6,283 |
| Generated Kysely types | `content-database.generated.ts` | 1,295 |
| Frozen Drizzle chain | `drizzle/0000-0077*.sql` + `meta/`, `drizzle-database-journal/` | (data) |
| Repos (one Kysely body each) | `repos/*.ts` (24 files) | 4,150 |
| SQLite openers, repo shims, journal, introspection | `sqlite/*.ts` (33 files: `content-db.ts`, `chat-db.ts`, `database-journal-*`, `database-introspection-adapter.sqlite.ts`, `chat-orphan-check.ts`, `hydrate-content-db-from-seed.ts`, `reset-legacy-site-title-pin.ts`, 24 thin `*.sqlite.ts`) | 1,977 |
| Migration history | `migrations/0000_legacy_baseline{,.postgres}.ts`, `0001-0003`, `chat/0000-0001`, `legacy-sqlite.ts` (Drizzle adoption), `index.ts`, `checksums.ts` | 852 |
| Manifest / semantic verify | `migration/manifest.ts` (imports `schema.sqlite` and `#src/features/plugins`), `migration/verify.ts` | 1,261 |
| Typed kernels for Tovu databases | `content-kernel.ts`, `chat-kernel.ts`, `journal-kernel.ts`, `watermark-kernel.ts` | 293 |
| Tovu feature/ops glue | `sealed-credential-{discard,inventory}.ts`, `key-dependent-data.ts`, `drift.ts`, `prepare-content-store.ts`, `pglite/content-schema.ts`, `postgres/db-ops{,-adapter}.ts` | 1,147 |
| Tovu guards and test harness | `kernel/__tests__/no-raw-sqlite.boundary.test.ts`, `raw-sqlite-scan.ts`, `raw-sqlite-baseline.json`, `dialect-matrix.ts` (bound to `ContentDatabase` + content migrations; 71 importers), `database-types.test.ts`, `content-seeds.ts`, all `migrations/__tests__/*` except `runner.test.ts`, all `__tests__/`, `repos/__tests__/`, `sqlite/__tests__/` | — |

`migration/verify.ts` is pure and has no imports. It still stays, because every check is keyed to
`manifest.ts`'s classification of Tovu's columns.

### 1.3 Generic but deferred: the transfer engine (`features/database-transfer/`)

| File | LOC | Coupling |
|---|---:|---|
| `copy-engine.ts` | 310 | Vendor-blind. Consumes `table-catalog` and `exclusions`. |
| `postgres-ddl.ts` | 141 | Typed against `TransferTable` from `table-catalog`. |
| `sqlite-source.ts` | 149 | better-sqlite3 only |
| `postgres-target.ts` | 131 | `psql` shell-out |
| `pg-store-copy.ts` | 320 | Kernel only. Hardcodes the `public` and `ai_chat` schemas. |
| `table-catalog.ts` | 280 | **Drizzle `schema.postgres` and `manifest`, so it stays in Tovu** |
| `exclusions.ts` | 59 | Tovu policy (logins and sealed credentials), so it stays |

About 1,050 LOC could become `@jini-ai/db/transfer` with an injected `TableCatalog` and exclusion list.
Defer it until a second consumer actually needs a SQLite-to-Postgres copy (package-extensibility rule:
extract on a named second consumer).

### 1.4 Already in Jini (overlap, no action)

- `@jini-ai/sqlite` 0.3.0: better-sqlite3 chat history, tool catalog, event log, `db-inspect`. It has
  its own idempotent `migrate()`, and it depends on `@jini-ai/chat`. Different job; leave it.
- `@jini-ai/infra` 0.3.3: `./db/core` (`DbOpsPort`, restore-point naming) and `./db/sqlite`
  (`SqliteDbOpsAdapter`, used by Tovu's `sqlite/db-ops.ts`). ORM-free and query-free by settled
  decision (memory `jini_infra_package`, 2026-08-12). It has the R12 driver-isolation guard
  (`scripts/check-driver-isolation.ts`) and a `loads-without-driver` test. **Reuse that pattern for
  `@jini-ai/db`.**

---

## 2. Target package design

### 2.1 Where it lives (options considered)

| Option | Verdict | Why |
|---|---|---|
| Extend `@jini-ai/sqlite` | No | Its name says SQLite; it depends on `@jini-ai/chat`; its job is chat persistence. Adding PGlite and pg there forces both onto every chat consumer. |
| Extend `@jini-ai/infra` (`./db/kernel`, `./db/pglite`, …) | No | Its owner-settled contract is "exports connection lifecycle and database operations, **never query building**", with no query library in any signature. `StorageKernel.run(fn: (db: Kysely<DB>) => …)` IS query building, so moving it there would break that contract. |
| **New `@jini-ai/db`** | **Yes** | One package for the query kernel, its drivers and its migrator. Kysely is a required peer. Each driver is an optional peer behind its own subpath, with the same R12 isolation as infra. |

`@jini-ai/infra` stays as is. Later, its `DbOpsPort` for SQLite and PGlite could be implemented on top of
`@jini-ai/db`'s `StorageOps`. That is not part of this plan.

### 2.2 Package shape

```
@jini-ai/db  (ESM, "type": "module"; no "." export — same reason as infra: Node does not tree-shake)
├─ ./kernel    port, buildKernel/KernelDriver, TurnLock, dialect helpers + introspection,
│              scopeToSchema, readSchemaShape, renderDatabaseTypes, StorageOps port + errors
│              peers: kysely (REQUIRED). No driver import, enforced by R12 (jini.neutralEntries).
├─ ./sqlite    sqliteKernel(client), openSqliteFileKernel(path, {open}), closeSqliteConnection,
│              sqliteConnectionOf, sqliteOps
│              peer: better-sqlite3 (optional) — TYPE-ONLY import; the consumer supplies the client
│              or an `open(path, opts)` factory (see R2)
├─ ./pglite    openPgliteKernel, PgliteDialect, PG_PARSERS, startPgliteOwner, PgliteSocketServer,
│              defaultPgliteSocketDir, pgliteOps, PGLITE_LOW_MEMORY_START_PARAMS
│              peer: @electric-sql/pglite (optional, EXACT "0.5.8": the RFQ filter is version-specific)
├─ ./postgres  openPostgresKernel(pool), openPgliteSocketKernel(socketPath), postgresLockKey,
│              postgresOps
│              peer: pg (optional)
└─ ./migrate   runMigrations, assertValidSteps, MigrationStep/Context/Options/Report,
               MigrationChecksumError, UnknownAppliedMigrationError, sourceChecksum (helper for
               consumers' pin tests)
               peers: kysely
```

### 2.3 Public API contract (the parts that change from today)

- `runMigrations(kernel, steps, { ledgerTable, schema?, backupPath?, appName? })`. **`ledgerTable` is
  REQUIRED with no default**, so no `tovu_`/`jini_` default can ever leak into a consumer's database.
  Tovu passes `"tovu_migrations"` and `"tovu_chat_migrations"`, exactly as today.
- `UnknownAppliedMigrationError` text: `"…it was upgraded by a newer ${appName ?? "version"} — run
  that version"`. Tovu passes `appName: "Tovu"`, so the message stays byte-identical (owner rule
  `assert_exact_error_text`).
- `storageOps(kernel, { ledgerTable, pgliteOwner? })`: the compact read-back uses the ledger the
  consumer names, not `tovu_migrations`.
- `startPgliteOwner(dataDir, { lockFileName, runDirName })`. Tovu passes `"tovu-owner.pid"` and
  `"tovu"`, so the lock file and the socket paths stay identical. This matters: an old process and a new
  process must agree on the lock during rollout (R4).
- `openSqliteFileKernel(path, { open, readOnly? })`. Tovu's shim keeps today's signature and passes
  `open = (p, o) => new Database(p, o)` using **Tovu's own** better-sqlite3.

### 2.4 How a consumer supplies its schema and migrations

Jini ships **no tables, ever** (settled rule). The consumer owns four things:

1. **Its `DB` interface**, generated with `renderDatabaseTypes` from a migrated reference PGlite
   (Tovu: `content-database.generated.ts` through `database-types.test.ts`, `UPDATE_DATABASE_TYPES=1`).
2. **Its ordered `MigrationStep[]`**: `{ id: "NNNN_name", checksum, up(kernel, ctx) }`, written with
   Kysely's schema builder plus `@jini-ai/db/kernel` dialect helpers.
3. **Its pinned checksum map and pin test**, using `sourceChecksum(stepSource)` from `./migrate`.
4. **Its typed kernel**: `const k: StorageKernel<MyDB> = sqliteKernel<MyDB>(client)` or
   `openPgliteKernel<MyDB>({ dataDir })`.

Drizzle stays entirely on the consumer side (Tovu's `schema.*.ts`, `content-db.ts`, `legacy-sqlite.ts`,
`manifest.ts`). `@jini-ai/db` has no Drizzle dependency, peer or type.

### 2.5 Type identity across packages (the known trap)

- **The original trap is gone.** Memory `drizzle_type_identity_across_packages`: the 604-error wall
  was an ESM-vs-CJS resolution-mode split. **Tovu's root `package.json` is now `"type": "module"`**
  with `nodenext`, and Jini is ESM, so there is no dual resolution mode. Do NOT add a CJS build
  unless a CJS consumer appears; if one does, follow infra's dual-build `tsconfig.cjs.json`.
- **The remaining trap is two physical copies.** `Kysely` carries ES-private `#props`, so TypeScript
  compares it nominally. In dev, Tovu's `node_modules/@jini-ai/*` are symlinks into Jini (verified),
  and Node and TS resolve from the realpath. So Jini's pnpm devDependency copy of `kysely` gets used
  for the Jini side. TypeScript dedupes two copies only when name AND version match exactly.
  Mitigation:
  - kysely is a **peerDependency**.
  - Jini's devDependency is pinned to the **exact** version Tovu installs (`0.29.6` today).
  - Slice 1 adds a Tovu compile-time contract test: a Tovu `sql` fragment and a Tovu-generated
    `ContentDatabase` passed through a Jini `StorageKernel`.
  - `check-jini-registry-drift` plus the published typecheck gate catch a mismatch at release.

---

## 3. Migration slices

Every slice follows the same rules.

- **Shims keep imports working.** Each moved Tovu file becomes `export * from "@jini-ai/db/<sub>";`
  (or named re-exports) at its old path. No importer changes; 23-34 importers per hub stay untouched.
- **Order of operations:** build Jini dist (`cd /Users/la/Programming/Jini && pnpm --filter
  @jini-ai/db build`; Tovu resolves Jini through `dist/`, trap 2 in `jini_cross_package_test_traps`),
  then Jini tests, then Tovu scoped tests, then Tovu typecheck, then commit both repos with explicit
  pathspecs (`git commit -F msg -- <paths>`).
- **Test commands.**
  - Jini: `cd /Users/la/Programming/Jini/packages/db && npx vitest run <path>`
  - Tovu: `node --import tsx --test --experimental-test-module-mocks "<file>"` from the Tovu root.
    Scoped files only; never a bare runner.
- **Linking.** Add `"@jini-ai/db": "^0.1.0"` to Tovu's root `dependencies`, then `npm run link:jini`.
  `jini-links.mjs` derives the package set from `dependencies`, so it picks up the new package.
- **Release gating.** No Tovu push to `main` until the matching `@jini-ai/db` version is **published**
  (Fly gates on `jini-published-typecheck`, which installs from npm). Publishing a new public package
  name is outward-facing: **the owner approves the first publish.**

| # | Slice | What moves | Tests that move | Scoped verification | Est. |
|---|---|---|---|---|---|
| **1** | **Package skeleton + `./kernel`** (FIRST, prototype) | New `Jini/packages/db` (package.json with peers, `jini.neutralEntries: ["src/kernel"]`, tsconfig, vitest config, README). Moves `port.ts`, `kernel-core.ts`, `turn-lock.ts`, `dialect.ts`, `schema-scope.ts`, `schema-shape.ts`, `typegen.ts`. Tovu shims at all 7 paths. The drivers stay in Tovu and import the kernel core through the shims. | None of the existing ones: every kernel test also opens a driver, so they move in slices 3-5. New in Jini: `loads-without-driver.test.ts` (copied from infra's pattern, with its positive control) and an index-exports test. New in Tovu: the type-identity contract test (§2.5). | Jini: `pnpm guard` (R12), the 2 new tests. Tovu: `kernel/__tests__/kernel.test.ts`, `dialect-json.test.ts`, `database-types.test.ts`, `backup.test.ts`, `migrations/__tests__/runner.test.ts`, `legacy-adoption.test.ts`, `repos/__tests__/entry-refs-repo.dialects.test.ts`, the new contract test. Tovu tsc. | 3-4 agent-hours |
| 2 | **De-Tovu prep, in place in Tovu** (no Jini change) | Parameterize the 6 literals (§2.3) with Tovu values passed at every call site. Split `kernel/ops.ts` into `ops.ts` (port + dispatch), `drivers/sqlite-ops.ts`, `drivers/pglite-ops.ts`, `drivers/postgres-ops.ts`. Change `openSqliteFileKernel` and `openMemorySqliteKernel` to an injected `open`, with a Tovu wrapper that keeps the signature. Remove Drizzle from `kernel.test.ts` and `dialect-json.test.ts`. Swap `pglite-owner.test.ts` off `pglite/content-schema.js`. | (stay; edited in place) | `kernel/__tests__/*.test.ts` (all 12 non-`.postgres`), `migrations/__tests__/runner.test.ts`, `legacy-adoption.test.ts`, `checksums.test.ts`, `sqlite/__tests__/database-journal-kernel.test.ts`, `sqlite/__tests__/content-db-readonly.unit.test.ts`. The raw-SQLite guard (`no-raw-sqlite.boundary.test.ts`): the new `drivers/*-ops.ts` files must be inside its driver allowance. | 4-6 h |
| 3 | **`./sqlite`** | `drivers/sqlite.ts`, `drivers/sqlite-ops.ts`. better-sqlite3 becomes type-only plus injected `open`. | `kernel.test.ts`, `dialect-json.test.ts`, `sqlite-same-file.test.ts`, the SQLite half of `backup.test.ts`, the SQLite half of `ops.test.ts` | Jini: the moved tests. Tovu: `sqlite/__tests__/content-db-readonly.unit.test.ts`, `content-db-seed.unit.test.ts`, `repo-transactions.sqlite.test.ts`, `database-journal.integration.test.ts`, `migrations/__tests__/legacy-adoption.test.ts`, `kernel/__tests__/no-raw-sqlite.boundary.test.ts` (lower the baseline with `UPDATE_RAW_SQLITE_BASELINE=1` only if it shrinks). | 3-4 h |
| 4 | **`./pglite`** | `drivers/pglite.ts`, `pglite-dialect.ts`, `pg-types.ts`, `pglite-owner.ts`, `pglite-server/socket-server.ts` with **`LICENSE` + `NOTICE.md`**, `drivers/pglite-ops.ts` | `pglite-owner.test.ts` + 2 child fixtures (the child-process fixtures need their spawn path rewritten to the Jini test dir), `pglite-socket-server.test.ts`, the PGlite halves of `backup.test.ts` and `ops.test.ts` | Jini: the moved tests. Tovu: `migrations/__tests__/postgres-baseline.test.ts`, `post-search-step.test.ts`, `kernel/__tests__/database-types.test.ts`, `__tests__/prepare-content-store.dialects.test.ts` (Codex has it dirty: coordinate, §4 R5), one `describeEachDialect` suite (`repos/__tests__/publish-trust-revocations.dialects.test.ts`) | 5-7 h |
| 5 | **`./postgres`** | `drivers/postgres.ts`, `postgres-lock.ts`, `pglite-socket.ts` (socket client), `drivers/postgres-ops.ts` | `kernel.postgres.test.ts`, `postgres-pool-error.postgres.test.ts`, `ops.postgres.test.ts`, plus helpers `__tests__/postgres-database.ts` and `migration/pg-fixture.ts` (into the Jini package's `src/testing/`, not exported). Tovu's other `.postgres` tests re-import those helpers through a Tovu shim. | Needs local PG (`pg_ctl -D /usr/local/var/postgresql@14 start`; ask the owner first if it is not running). Jini: the 3 moved tests. Tovu: `migrations/__tests__/runner.postgres.test.ts`, `__tests__/migration-manifest-postgres.test.ts`, and the socket path through `pglite-owner.test.ts` (now in Jini) | 3-4 h |
| 6 | **`./migrate`** (live-DB slice) | `migrations/runner.ts`, `migrations/step.ts`, plus a new `sourceChecksum` helper. Tovu's `migrations/index.ts` passes the ledger names explicitly. Steps, `checksums.ts`, `legacy-sqlite.ts` and `0000_legacy_baseline*` stay in Tovu. | `runner.test.ts` | **Before landing:** a restore-point copy of `sites/tovu-dev/content.db` and `chat.db`, made with the product's restore-point tool, not by hand. Jini: `runner.test.ts`. Tovu: `migrations/__tests__/checksums.test.ts` (it must stay green, which proves no step checksum changed), `legacy-adoption.test.ts`, `runner.postgres.test.ts`, `postgres-baseline.test.ts`, `coercion-json-as-json-step.test.ts`, `drop-empty-legacy-chat-tables-step.test.ts`, `__tests__/schema-migration-drift.test.ts`. Then one real open of a COPY of the dev db via `openContentDb`, checking that the ledger row count is unchanged and nothing re-ran. | 4-5 h |
| 7 | **Shim collapse** (optional, when the tree is quiet) | Rewrite deep imports (`kernel/dialect.js` ×34, `kernel/port.js` ×27, `kernel/drivers/sqlite.js` ×31, `drivers/pglite.js` ×15, `pglite-owner.js` ×11, `migrations/runner.js` ×2, …) to `@jini-ai/db/<sub>`, or to one Tovu facade (`kernel/index.ts`), then delete the shims. A mechanical codemod, one commit per subtree. | — | Tovu tsc, plus the same scoped sets as slices 1-6 | 2-3 h, plus coordination |
| D | **`./transfer`** (deferred) | §1.3 engine with an injected `TableCatalog` and exclusion list. Only when a second consumer needs it. | `features/database-transfer/__tests__/*` engine tests | — | 1-1.5 days |

**Parallelism.** Slices 1 and 2 can run together: different repos, and slice 2 does not touch slice 1's
seven files. Slices 3, 4 and 5 follow slice 2 and can run in parallel, at most 3 at once (they touch
different driver files, but all three edit the Jini package.json and the Tovu shims, so serialize the
commits). Slice 6 goes after slice 3, because the runner's SQLite path uses the moved driver. Then
slice 7.

**Total:** about 22-33 agent-hours across the 7 slices. Each slice fits one Opus-high agent well under
the 250k context ceiling.

**After each slice that changes Jini, before any Tovu push:** bump the version with a changeset, publish
(`scripts/publish-pending.ts`, owner-approved), set Tovu's `^` range to it, and run
`npm run check:jini-registry-drift`.

---

## 4. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| **R1** | **Live-DB auto-migration.** `openContentDb` runs the runner on every open, and the dev server holds `sites/tovu-dev` open and restarts on file change. The moment slice 6's shim points at the Jini runner, the live db runs Jini code. A changed ledger name, checksum rule or backup behaviour would hit live data at once. | High | Ledger name required and passed explicitly; step sources unchanged, so `checksums.test.ts` proves the pins; a restore point before landing; verify on a COPY first; no edits to step files in this project. Tell the owner before slice 6 lands, because a `tsx watch` restart picks it up. |
| **R2** | **Two physical copies in dev.** Verified that `Jini/packages/infra/node_modules/better-sqlite3` links to its own pnpm copy; a new package would get the same for kysely, better-sqlite3 and pglite. Types: Kysely's `#private` fields, so tsc errors unless the versions match exactly. Runtime: if Jini's driver ran `new Database()` on a file Tovu's copy also has open, **two SQLite libraries in one process would share POSIX locks**, a documented way to corrupt SQLite (sqlite.org "How to corrupt" §2.2.1). Desktop staging (drops Jini's node_modules) and Fly (installs from the registry) both end up with a single copy, so **only dev diverges**. | High | Every driver is a peer and imported **type-only**; the consumer injects the client or opener; exact pins equal to Tovu's; the slice-1 contract test; a Jini guard that bans value imports of `better-sqlite3`, `pg` and `@electric-sql/pglite` outside one `open` seam in tests. |
| **R3** | **Three dialects.** SQLite, PGlite and Postgres must behave the same: transactions, `lockKey` (a no-op on SQLite; on PGlite transactions are serialized anyway, so lock tests prove nothing there), JSON text, booleans. MySQL exists only as a Drizzle schema with no kernel driver, and that stays out of scope. | Med | The moved tests keep every dialect assertion. Tovu's `describeEachDialect` suites (71 importers) run through the shims after every slice and are the cross-dialect proof. Real-Postgres suites in slice 5. |
| **R4** | **PGlite owner/socket rollout.** An owner started by the old build and a client from the new build must agree on the lock file name, the socket dir and the low-memory params. The RFQ filter is pinned to PGlite 0.5.8. | Med | Tovu passes `"tovu-owner.pid"` and `"tovu"`, so paths are byte-identical. The PGlite peer stays exact `0.5.8`, and the version-pin test moves along. Do not land slice 4 while a PGlite site is being served. PGlite is hidden until Q1, so exposure is low. |
| **R5** | **Collisions with Codex agents editing tests under `platform/db`.** Dirty right now: `__tests__/key-dependent-data.test.ts`, `__tests__/prepare-content-store.dialects.test.ts`, `prepare-content-store.ts`, 4 `repos/__tests__/*credential*`, `sqlite/__tests__/chat-orphan-check.integration.test.ts`. None are in `kernel/` or `migrations/`. | Med | Slices 1-6 touch only `kernel/**` and `migrations/{runner,step,index}.ts` plus their tests, and shims mean zero importer edits. Each slice starts with `git status --short -- <slice paths>`, which must be empty (stop and ask otherwise). Commit with explicit pathspecs and no `git add -A`. Slice 7 (the codemod over about 140 importers) runs only when the coordinator confirms no Codex shard is live. Slice 4 may only *run* `prepare-content-store.dialects.test.ts`, never edit it. |
| **R6** | **Version linking (local symlink vs registry).** Tovu dev uses Jini `dist/` through symlinks; Fly installs from npm. An unpublished or stale `@jini-ai/db` passes locally and fails the Fly typecheck. A stale `dist/` gives Tovu tests old code. | Med | Build dist before Tovu tests in every slice; publish before push; `check:jini-registry-drift`; `check-no-linked-jini` already blocks `npm run build` with links. |
| **R7** | **Desktop packaging.** `stage-payload.ts` stages **every** `Jini/packages/*` flat and drops their `node_modules`, so `@jini-ai/db` comes along automatically and the peers resolve to Tovu's root `dependencies`. All four are listed there (`kysely`, `better-sqlite3`, `@electric-sql/pglite`, `pg`). asar: only `*.node` is unpacked; better-sqlite3 13.0.3 is N-API prebuilt (`npmRebuild: false`); PGlite is WASM and is already a Tovu dependency, so nothing new there. | Low-Med | After slice 4, one quiet-tree `npm run desktop` smoke, never a pack while agents edit (asar corruption memory, `tree-quiet` gate). Confirm `dist-import-check` accepts `@jini-ai/db/*` subpaths. |
| R8 | **One module instance of the kernel core.** `heldLocks` (AsyncLocalStorage) and the sqlite `kernels`/`fileTurnLocks` WeakMaps are process-wide by design. A half-moved state, where one Tovu file keeps a private copy of `kernel-core` or `turn-lock`, would split them silently, and same-file turn-taking would stop protecting. | Med | Slice 1 moves `kernel-core` and `turn-lock` together. Shims re-export and never copy. `sqlite-same-file.test.ts` is the canary and is run in slices 1-3. |
| R9 | **License.** `socket-server.ts` is Apache-2.0 derived. | Low | Move `LICENSE` + `NOTICE.md`, add the NOTICE to the package `files`, and keep the header. |

---

## 5. Estimates and recommendation

| Slice | Est. (agent-hours) | Ships alone? |
|---|---|---|
| 1 `./kernel` + skeleton | 3-4 | yes |
| 2 de-Tovu prep (Tovu only) | 4-6 | yes |
| 3 `./sqlite` | 3-4 | yes (after 2) |
| 4 `./pglite` | 5-7 | yes (after 2) |
| 5 `./postgres` | 3-4 | yes (after 2) |
| 6 `./migrate` | 4-5 | yes (after 3) |
| 7 shim collapse | 2-3 | optional |
| D `./transfer` | 8-12 | deferred |

**Recommended first slice to prototype: slice 1** (`@jini-ai/db` skeleton plus `./kernel`).

- It is the cheapest, about 770 LOC of pure TypeScript with no driver.
- It cannot touch the live database.
- It does not overlap any file a Codex agent has dirty.
- It immediately exercises the two things most likely to sink the whole move: Kysely type identity
  across the symlinked boundary, and the link → build → publish → Fly-typecheck loop.
- If the contract test from §2.5 goes red, stop and fix the peer/pin set before any driver moves.

## 6. Open questions for the owner

1. Package name `@jini-ai/db`: OK? (The alternative is `@jini-ai/storage`, which matches the
   `Storage*` type names in the code.)
2. Approve the first public npm publish of the new package (needed before any Tovu push that imports it).
3. The transfer engine stays in Tovu until a second project needs it: OK?
