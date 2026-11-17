# DB: per-domain table setup and migrations — revision 2

Verified on Tovu `integ/merge-a-2026-11-16` e801e9ae (merge-b 450ac748 has no difference under `platform/db/migrations`) and Jini `integ/merge-final-2026-11-16` af33fcdb. Inventory `../inventory/db-setup.tsv` (`platform/db` 127 source files, 15,449 lines; website `features/database` 7 files, 601; admin `features/database` 17 files, 2,788; tests 184 files, 26,570). Run contract: `../COMMON-LO.md`.

## What exists (verified)
- Tovu `platform/db/migrations/`: 50 top-level `.ts` files, 2,737 lines (ADR-066 steps, `index.ts` 178, `legacy-sqlite.ts`, `checksums.ts`, `source-digests.ts`), plus `platform/db/migration/manifest.ts` 843. `platform/db/drizzle/` is frozen. Tovu already runs several histories in one database, each with its own ledger table (`migrations/index.ts`: content, chat, commerce, project).
- Jini: runner `@jini-ai/db/migrate` `runMigrations(kernel, steps, options)` (`db/src/migrate/runner.ts:217`; the ledger table name is required, no default); step contract `@jini-ai/core/contracts/storage` `MigrationStep<Kernel>` = `{ id, checksum, prepare?(kernel, context), up(kernel, context) }` (`core/src/contracts/storage/migration.ts:21-29`): a step receives ONLY the kernel and the context. Its file header says a package "ships steps as data from its storage-adapter subpath; it never runs them".
- Jini SQL adapters that take table names from the host and ship no DDL: `@jini-ai/cms/{redirects,comments,forms,widgets}/sql`. `cms/src/redirects/sql/repo.ts` types its kernel as `StorageKernel<Kysely<unknown>, unknown>` from core and imports `kysely` directly (declared by `cms` as an optional peer); `RedirectTables = { redirects; revisions }`. Tovu binds it in `features/redirects/repo.sqlite.ts` (which also names a third table, `redirect_hits`, used by Tovu code outside the Jini adapter).
- `@jini-ai/db` exports `./testing/pg-fixture` only (no `./testing/*` wildcard): a new testing leaf needs its own export entry.
- Precedent that is NOT copied: `commerce/src/payments/ledger/migrations/` imports `@jini-ai/db/migrate` and `@jini-ai/db/kernel` from inside `commerce` (not allowed for new code under "itself + core + protocol"; the xpkg lanes own the existing sites).

## Facts round 1 got wrong (judge finding 10: ACCEPTED)
The redirect tables have NO foreign key to the principals table. `platform/db/schema.sqlite.ts:167-176` says the opposite of what round 1 claimed: every "created by" column, including `redirects.created_by_principal` (`:667`, plain `text`, not null), is deliberately an UNENFORCED reference "because a 'created by' fact must survive the referenced principal being deleted". The round-1 "optional principal-table input" and its constraint are removed. The baseline is derived from the executed migration head (`describeSchema` output), never from reading `schema.sqlite.ts`.

## Design (smallest that closes the gap)
1. Each domain `/sql` entry exports a typed history FACTORY (judge finding 12): step bodies cannot receive table names through `(kernel, context)`, so the names are closed over.
```ts
// packages/cms/src/redirects/sql/schema/index.ts
export interface RedirectSchemaTables { readonly redirects: string; readonly revisions: string }   // the two tables the Jini adapter uses
export interface DomainSchemaHistory<K> { readonly steps: readonly MigrationStep<K>[]; readonly defaultLedgerTable: string }
export function createRedirectSchemaHistory(
  required: { tables: RedirectSchemaTables },
  optional: { indexPrefix?: string } = {},
): DomainSchemaHistory<StorageKernel<Kysely<unknown>, unknown>>
```
   - Table names are validated in the factory (`/^[a-z][a-z0-9_]{0,62}$/`; a name that fails throws a plain-words error before any step exists) and then interpolated only through Kysely identifier APIs (`sql.table`, schema builder), never string concatenation.
   - Step ids are fixed strings independent of table names: `0001_redirects_baseline`, then `0002_…`. Ids never change after release.
   - Checksum rule: `checksum` is a pinned constant in `schema/checksums.ts`, equal to the sha256 hex of the step's source file text (the same rule `@jini-ai/db/migrate` `sourceChecksum` implements, `db/src/migrate/checksum.ts:12`: read it first and reproduce its exact input normalization; a mismatch between the two = STOP). The checksum does NOT depend on the host's table names (the names are data, the step text is the contract), so two hosts with different names share one checksum per step.
   - Ledger: `defaultLedgerTable` is `"redirect_schema_migrations"`; the host passes the ledger name it wants to `runMigrations` (one ledger per domain is the default; a host that wants one shared ledger passes the same name to every domain run: step ids are domain-prefixed, so they do not collide). This closes D-DB2 without an owner decision.
2. The domain package does NOT import a runner. The host calls `runMigrations(kernel, history.steps, { ledgerTable })` in an order it writes down.
3. **Tovu databases are never touched by these histories.** Tovu keeps its frozen Drizzle chain, its TS steps, ids, checksums and ledgers. A guard test fails if `apps/website/src` references a `create*SchemaHistory` export outside tests. No "adopt existing tables" step exists.
4. A schema change after the baseline = a new numbered step in the domain history AND a matching ADR-066 step in Tovu's own chain, in the same change, proven equal by the parity test. Applied steps are never edited (the checksum pin fails).
5. Other hosts' existing installs: every released step set gets an N-1 fixture BUILDER (a script that runs the released steps; never a stored binary) and a test that upgrades it with the next version automatically.

## DB-1a (JINI-ADD): schema description that can see what parity must protect (judge finding 11: ACCEPTED)
Files: NEW `packages/db/src/testing/schema-shape.ts` + tests; NEW export entry `./testing/schema-shape` (exports + `jini.entries: node` + README line + changeset `minor`) in the same commit. precondition: none. THIRD_PARTY_ALLOWED: `kysely`. (`db` is not a frozen package; frozen = `sqlite`, `infra`.)
`describeSchema(required: { kernel: KyselyKernel<unknown>; tables: readonly string[] }, optional = {}): Promise<SchemaShape>` (two-object signature). Per table, for SQLite and Postgres/PGlite:
- columns: name, declared type (normalized per dialect by a table in the file), not-null, default expression text, primary-key position, **collation**, **generated / identity semantics** (SQLite `AUTOINCREMENT` and rowid-alias integer keys; Postgres identity / serial / sequence default), generated-column expression;
- indexes: columns in order, unique, partial predicate, per-column collation and order;
- foreign keys: columns, target table and columns, on delete / on update, deferrable;
- **CHECK constraints**: normalized expression text (whitespace and quoting normalized; the normalizer is tested);
- table options that change behaviour: `WITHOUT ROWID`, `STRICT`.
Sources: SQLite `pragma_table_xinfo`, `pragma_index_list` / `index_xinfo`, `pragma_foreign_key_list`, and the `sqlite_schema.sql` text for CHECK, collation and `AUTOINCREMENT`; Postgres `information_schema` + `pg_catalog` (`pg_constraint` with `pg_get_constraintdef`, `pg_index`, `pg_collation`, `pg_attribute.attidentity` / `attgenerated`). Before writing, check for an existing owner: `rg -n "pragma_table_xinfo|pg_get_constraintdef" packages/db/src`; if one exists, extend it instead (report which).
Mutation self-tests (each builds two small schemas that differ in ONE property and asserts `describeSchema` output differs, on SQLite and on PGlite): missing index; removed CHECK; changed CHECK expression; changed column collation; `AUTOINCREMENT` removed from an integer primary key (SQLite) / identity removed (Postgres); changed default; changed foreign-key action; changed partial-index predicate; column order.
Each exported function <= 50 lines (one reader per property per dialect). Estimate: 170k.

## DB-1b (TESTS, Tovu): parity harness and guard
precondition: `rg -n '"./testing/schema-shape"' node_modules/@jini-ai/db/package.json`.
- `platform/db/__tests__/domain-schema-parity.test.ts`: for each registered domain: database A = Tovu chain to head; database B = empty + the domain history built with Tovu's table names, run by `runMigrations`; assert `describeSchema` equal for the domain's tables on every dialect of Tovu's existing dialect matrix (reuse the matrix helper the neighbouring tests use: name it in the report). Zero domains registered at first, plus a self-test with a deliberately wrong fixture history (one missing index, one missing CHECK) that must be detected.
- Applicability is asserted, not assumed: the harness test also runs `describeSchema` over three existing Tovu tables that carry the properties in question (a table with a CHECK: `schema.sqlite.ts:231`; an `AUTOINCREMENT` key: `redirect_revisions.id`, `:687`; a collated or unique-indexed column) and asserts the property is present in the output on each dialect (so a blind spot cannot hide behind "equal empties").
- Guard test for design rule 3. N-1 harness helper: `buildFixture(steps.slice(0, n-1))`, then run all steps; rows written at N-1 survive.
Estimate: 130k.

## DB-2 (JINI-ADD + Tovu TESTS): first domain history, redirects
precondition: DB-1b landed (`ls apps/website/src/platform/db/__tests__/domain-schema-parity.test.ts`). THIRD_PARTY_ALLOWED: `kysely`.
1. Print the two adapter tables (`redirects`, `redirect_revisions`) from Tovu head with `describeSchema`; `redirect_hits` is used only by Tovu code today (no Jini adapter reads it: `rg -n hits packages/cms/src/redirects/sql` prints nothing), so it stays in Tovu's chain and is NOT in the Jini history until a hits adapter exists (paste the output in the report; never transcribe `schema.sqlite.ts` by eye).
2. Jini commit: `packages/cms/src/redirects/sql/schema/{0001_redirects_baseline.ts,checksums.ts,index.ts}` with the factory above; both dialects from one Kysely body where possible, a dialect switch on `kernel.dialect` otherwise; leaf exports from `@jini-ai/cms/redirects/sql`; vitest: name validation refusals, fixed ids, pinned checksum equals the file's sha256, the same checksum for two different table-name sets; changeset `minor`.
3. Tovu commit (tests only): register redirects in the parity test with Tovu's names from `features/redirects/repo.sqlite.ts` (`redirects`, `redirect_revisions`): GREEN on every dialect. Add: (a) NO foreign key exists on any redirect table (assert the described foreign-key list is empty), and deleting a principal row leaves a redirect row with that `created_by_principal` in place, in database A and in database B; (b) idempotent rerun applies nothing and the ledger has one row; (c) proof host: in database B, a create and a read through `redirectRepoFor` with the real adapter (no handwritten DDL). This replaces round 1's "minimal-host or the second app" alternative: the proof host is the Tovu parity test (D-DB3 closed); adding the history to `examples/minimal-host` is optional follow-up.
STOP: parity differs in any property -> report the difference, do not "fix" Tovu's schema; S-SCHEMA prints a line. Estimate: 170k.

## DB-3..n (template, one run per domain, after that domain's SQL adapter is in Jini)
Order by readiness: comments, widgets, forms (adapters exist) -> taxonomy, trash, media, entries/content-types, settings/tokens/origin, identity, members, newsletter, mail (each after its SQL lane; lanes S/U are on HOLD at e20e2955, so only the first three can be scheduled). Each run = DB-2's steps 1-3 for one domain. Cross-domain references follow the host schema as executed (unenforced where Tovu's are). A domain whose tables were reshaped by a Tovu step after `0000` needs an Opus read of those steps first (`rg -l "<table>" apps/website/src/platform/db/migrations`). Estimate: 150k-200k each; 3 schedulable now (0.5M), 9 more later (1.5M).

## Owner decisions
- D-DB1: approve "domain exports a history factory, the host runs it, Tovu never runs it". DB-1a and DB-1b do not depend on it; DB-2's Jini commit does.
- D-DB2, D-DB3: closed by the design above (defaults stated; no decision needed).

## Could not verify
- Postgres/PGlite catalog parity of `describeSchema` (no database was started). Whether `@jini-ai/db` already has an introspection helper (command given in DB-1a).
- The dialect-matrix helper name in Tovu's tests (DB-1b names it in its report).
