# ADR-066: Kysely Query Layer and One Ordered TypeScript Migration History

- Status: ACCEPTED
- Date: 2026-09-28
- Author: Claude Opus 5.5 / Leona Burime (owner decision: move the storage layer to Kysely)
- Supersedes: ADR-015 §Decision 1 (Drizzle as the query layer) and §Decision 3 ("migrations are
  generated, never hand-written") for everything after the legacy freeze. ADR-015's port boundary
  (repos behind ports, swap cost bounded to the infra adapter layer) stays in force.
- Relates: ADR-006 (rule-of-two), ADR-015, ADR-022 (content model), ADR-023 (plugin data modules),
  ADR-046 (production readiness). Plan: `ADS-memory/.local-artifacts/plans/2026-09-28-storage-adapter-plan.md`.
  Review: Codex Astra, `codex-runs/2026-09-28-astra-db-layer-2/answer.md` (#1–#3, #6).

## Context

Tovu must run the same content model on SQLite (every existing site), PGlite (embedded Postgres) and
Postgres/Supabase. With Drizzle the tables are dialect-typed (`sqliteTable` vs `pgTable`), so one
query body cannot serve both dialects type-safely; the K0 slice needed two bodies per repo
(`repo.sqlite.ts` + `repo.pg.ts`), and the Postgres body had already drifted (no search projection).
ADR-015 compared Bookshelf, Knex and Drizzle only; Kysely was never evaluated.

Drizzle's migrator applies an entry only when its journal `when` is above the last applied stamp.
Entries 0068–0077 carry fake 2027 stamps (`1799841600001`…`…010`), so any entry generated with a real
timestamp after them is silently skipped on every site that has applied 0068+. Drizzle-kit's
generated Postgres baseline also fails as is (error 42830: the composite FK
`commerce_products → member_tiers(workspace_id, id)` is added before the unique index it needs).

## Decision

1. **Kysely is the query layer.** Every repo is ONE Kysely query body for every dialect, reached
   through the storage kernel (`platform/db/kernel/port.ts`): `run`, `transaction`, `lockKey`,
   `query`/`execute`, dialect helpers in `kernel/dialect.ts`. No `*.pg.ts` twins. Row types come from
   `platform/db/content-database.generated.ts`, generated from a migrated reference database
   (`UPDATE_DATABASE_TYPES=1` + `kernel/__tests__/database-types.test.ts`), drift-tested against both
   dialects. Dialect, transport and capabilities are separate facts of a kernel; a missing capability
   is an explicit error, never a silent downgrade.
2. **One ordered history of TypeScript migrations is the schema authority.** A step is
   `{ id, up(kernel) }` in `platform/db/migrations/`. Common DDL is written with Kysely's schema
   builder; types, indexes and table rebuilds that the dialects spell differently go through dialect
   helpers or an explicit per-dialect branch. Data changes are written once against the kernel.
   Nothing is generated per dialect by drizzle-kit any more.
3. **Ledger `tovu_migrations(id, checksum, applied_at)`, same on every dialect.** Ids are immutable
   and ordered; each step records a checksum, and a changed checksum for an applied id, or an applied
   id this runtime does not know, stops the run with an error naming the id. Checksums are pinned in
   a committed manifest that a test re-derives from the step sources, so dev (tsx) and production
   (tsc output) record the same value.
4. **Runs are serialized.** Each step runs in one kernel transaction that first takes
   `lockKey("tovu_migrations")` (Postgres: transaction-scoped advisory lock; SQLite: the
   `BEGIN IMMEDIATE` write lock) and re-reads the ledger, so two processes starting together apply a
   step once. A kernel without interactive transactions (D1-style) is refused, not downgraded.
5. **Existing SQLite sites adopt in place, no data copied or rewritten.** The legacy drizzle chain
   (`platform/db/drizzle/`, 0000–0077) is FROZEN as step `0000_legacy_baseline`. On SQLite it:
   takes a consistent backup of the file (first adoption only), reconciles `__drizzle_migrations`
   against the frozen journal by content hash (never by `when`), applies any missing TAIL of the
   chain with drizzle's statement semantics (and keeps `__drizzle_migrations` in step, so older
   runtimes still see a migrated database), verifies the resulting schema (tables, columns, types,
   defaults, keys, indexes, foreign keys) against the chain's own head built fresh, and only then
   records the baseline. An unknown hash or a gap in the middle of the chain stops adoption for a
   human. Drizzle's migrator is never called on the frozen chain again. Adoption is proven on copies
   of real site databases before any live wiring.
6. **Postgres/PGlite start from a frozen baseline SQL** captured at the freeze from the
   database-transfer DDL (tables, then indexes, then constraints — the order that avoids 42830), and
   tested to apply on PGlite and real Postgres and to match `schema.postgres.ts` structurally.
7. **Drizzle stays temporarily** as the source of the Postgres reference DDL (`pglite/content-schema.ts`
   via `features/database-transfer`) and for repos not converted yet. A test fails if a file is added
   to the frozen `drizzle/` folder. Drizzle is removed when the last repo is converted.

## Consequences

- One body per repo: business predicates, concurrency guards and bug fixes are written once.
- Schema changes are hand-written TS steps, not diff-generated. The structural parity tests (fresh
  SQLite at head vs `schema.sqlite.ts`, fresh Postgres at head vs `schema.postgres.ts`) are what keep
  the Drizzle schema files and the migration history honest while both exist.
- Conversion cost is real (~100 files). Measured on posts: ~20–30 agent-minutes per repo of that size.
- MySQL is deferred until SQLite and the Postgres family are at parity.
