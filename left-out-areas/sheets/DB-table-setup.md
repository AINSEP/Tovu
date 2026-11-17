# DB: per-domain table setup and migrations

Measured on Tovu merge-b dd70b057, Jini merge-b 674a19ea. Inventory `../inventory/db-setup.tsv` (`platform/db` + website and admin `features/database`: 146 source files, 18,587 lines; tests 182 files, 26,462).

## What exists (verified)
- Tovu `platform/db/migrations/`: 54 TypeScript files, 2,737 lines (ADR-066 steps `0000`..`0029`+, `index.ts` 178, `legacy-sqlite.ts` 206, `checksums.ts`, `source-digests.ts`), plus `platform/db/migration/manifest.ts` 843. `platform/db/drizzle/`: 79 files, frozen. `schema.sqlite.ts` 2,410, `schema.postgres.ts` 1,246, `content-database.generated.ts` 1,112.
- Tovu already runs several histories in one database, each with its own ledger table (`migrations/index.ts:69-156`: content, chat `tovu_chat_migrations`, commerce `tovu_commerce_migrations`, project `tovu_project_migrations`).
- Jini: runner `@jini-ai/db/migrate` (`runner.ts`, `step.ts`, `checksum.ts`, `ddl.ts`, `legacy-ledger.ts`); step contract `@jini-ai/core/contracts/storage` `MigrationStep` (29 lines: `id`, `checksum`, `prepare?`, `up`); two domain histories exist as precedent: `commerce/src/payments/ledger/migrations/` (4 steps, own ledger table, pinned checksums) and `db/src/owner-store/migrations/`.
- Jini SQL adapters that take table NAMES from the host and ship no DDL: `@jini-ai/cms/{redirects,comments,forms,widgets}/sql`. Tovu binds them (`features/redirects/repo.sqlite.ts`: tables `redirects`, `redirect_revisions`, `redirect_hits`). A second app today must hand-write that DDL: this is the gap.
- Lanes S, U, K (SQL repo moves) state in their template that they never touch migrations, drizzle or the generated types. No plan covers DDL ownership. audit2 B28 (`drift.ts`, `site-dir/schema-guard.ts`, 90 lines) is a different slice (schema identity); no sheet for it exists.
- Rule conflict found: the commerce precedent imports `@jini-ai/db/migrate` and `@jini-ai/db/kernel` from inside `@jini-ai/commerce`. Under "a package imports only itself + core + protocol" that is not allowed for new code (xpkg lanes R6-R9 own the existing sites). The design below does not copy it.

## Design (smallest that closes the gap)
1. Each domain `/sql` entry additionally exports its fresh-install history: `export const <DOMAIN>_SCHEMA_STEPS: readonly MigrationStep[]` (typed only against `@jini-ai/core/contracts/storage`), `export const <DOMAIN>_SCHEMA_LEDGER_DEFAULT = "<domain>_schema_migrations"`, and pinned checksums. Step bodies take the same `tables` name object the repo takes (no table name is hard-coded) and a dialect switch from the kernel.
2. The domain package does NOT import a runner. The host runs `runMigrations(kernel, steps, { ledgerTable })` from `@jini-ai/db/migrate`, in an order it writes down explicitly. No registry, no dependency resolver, no package above the domains.
3. **Tovu databases are never touched by these histories.** Tovu keeps its 79-file drizzle chain, its TS steps, ids, checksums and ledgers. Tovu does not call any domain history. A guard test in Tovu fails if `apps/website/src` references a `*_SCHEMA_STEPS` export outside tests. No "adopt existing tables" step is written: silently adopting is forbidden.
4. Schema changes after the baseline: a new numbered step in the domain history AND a matching ADR-066 step in Tovu's own chain, in the same change, proven equal by the parity test. Applied steps are never edited (checksum pin makes an edit fail).
5. Existing installs of other hosts: every released baseline gets an N-1 fixture (a database file or dump built by running the released steps, stored as a builder script, not a binary) and a test that upgrades it with the next version automatically.

## DB-1 (Tovu + Jini, tests and harness only; READY): parity harness
- Jini `packages/db/src/testing/schema-shape.ts` (NEW, exported from the existing `./testing/*` area; check the export map first): `describeSchema(kernel, tableNames)` -> columns (name, declared type, not-null, default, pk order), indexes (columns, unique, partial predicate), foreign keys (target, on delete/update), for SQLite and Postgres. Reuse Tovu's `platform/db/sqlite/database-introspection-adapter.sqlite.ts` (288, labelled DEDUPE-AFTER-HARDENING) only after diffing it against `@jini-ai/db` introspection: if a Jini owner exists, call it.
- Tovu test `platform/db/__tests__/domain-schema-parity.test.ts`: for each registered domain: database A = Tovu chain to head; database B = empty + the domain's `*_SCHEMA_STEPS` with Tovu's table names; assert `describeSchema` equal for that domain's tables on SQLite, PGlite and Postgres (the dialect matrix Tovu already runs). Starts with zero domains and a self-test: a deliberately wrong fixture step (one missing index) must make it RED.
- Guard test for rule 3 above. N-1 harness: `buildFixture(steps.slice(0, n-1))` then run all steps; assert data written at N-1 survives.
Estimate: 200k tokens.

## DB-2 (READY after DB-1): first domain, redirects
Why redirects: adapter already in Jini, three tables, no cross-domain foreign key except the principal reference (`schema.sqlite.ts:170`: the foreign key to the principals table is the host's; the Jini baseline takes the referenced table name as an OPTIONAL input and omits the constraint when absent; parity runs with it present).
Steps: (1) print the three tables from Tovu head with DB-1's `describeSchema` (never transcribe from `schema.sqlite.ts` by eye); (2) write `packages/cms/src/redirects/sql/schema/0001_redirects_baseline.ts` (+ `checksums.ts`, `index.ts` leaf exports), `<= 50` lines per function, both dialects; (3) register redirects in the parity test: GREEN on three dialects; (4) N-1 fixture builder (baseline only, so N-1 = empty database: the test asserts idempotent rerun applies nothing and the ledger has one row); (5) `examples/minimal-host` or the planned second app runs the history and does a create/read through `redirectRepoFor` (real adapter, no handwritten DDL).
STOP: parity differs in any column default, index or collation -> report the difference, do not "fix" Tovu's schema; `git diff --stat origin/<base> -- apps/website/src/platform/db/drizzle apps/website/src/platform/db/migrations` is not empty at the end; any `*.sql` file changed.
Estimate: 180k tokens.

## DB-3..n (template, one run per domain, after that domain's SQL adapter is in Jini)
Order by readiness: comments, widgets, forms (adapters exist) -> taxonomy (K-06), trash (K-08), media (S7), entries/content-types (S2), settings/tokens/origin (S5), identity (S3), members (U1), newsletter (T-NL-02), mail (ML-2). Each: same five steps as DB-2; cross-domain foreign keys are host-supplied names; a domain whose tables were reshaped by a Tovu step after `0000` needs the Opus to read those steps first (`rg -l "<table>" apps/website/src/platform/db/migrations`). Estimate: 150k-200k each, about 2.0M for twelve domains.

## Owner decisions
- D-DB1: approve "domain exports steps, host runs them, Tovu never runs them" (above), or choose that Tovu migrates to the domain histories later (that needs a separate adoption design with ledger back-fill; not planned here).
- D-DB2: ledger table naming for other hosts: one ledger per domain (default above) or one shared ledger passed by the host.
- D-DB3: is the planned second app (survey lane 1) the proof host for DB-2 step 5, or `examples/minimal-host`?

## Could not verify
- Postgres/PGlite introspection parity of `describeSchema` (no database was started). Whether `@jini-ai/db` already exports an introspection helper equal to Tovu's adapter. The exact step count in Tovu's content chain (54 files include helpers; the survey's "78-step" figure refers to the drizzle chain, now 79 files).
