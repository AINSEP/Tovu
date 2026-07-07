# ADR-015: Drizzle ORM is the SQL Data Layer, Behind the Repo Ports

- Status: ACCEPTED
- Date: 2026-07-06
- Author: Claude Opus 4.8 / Leon Aburime (adopted 2026-07-06; recorded 2026-07-07 at owner request)
- Relates to: ADR-006 (ports / rule-of-two), ADR-003 (`ext.{pluginId}` JSON, no plugin DDL), ADR-012 (install-dir `content.db`)

## Context

Tovu needs a durable SQL data layer for the per-site `content.db` and, later, a hosted Postgres/Supabase option. The candidates the competitor corpus surfaced (`docs/research/competitor-analysis.md`):

- **Bookshelf/ActiveRecord (Ghost)** — legacy, no TypeScript-native queries, no Postgres. Rejected.
- **Knex query builder (Strapi, Directus)** — broad multi-DB support but **untyped at the query layer**; correctness bugs surface at runtime, not compile time.
- **Drizzle ORM (Payload's SQL adapters)** — code-first TypeScript schema → generated SQL migrations; typed query building; one schema shape maps across SQLite and Postgres (`jsonb`).

Before 2026-07-06 the repo used hand-written `better-sqlite3` calls with raw `ALTER TABLE` migrations. That is untyped and forces per-dialect SQL by hand — the same weakness as Knex, minus the multi-DB payoff.

The risk with adopting any ORM is lock-in: if a better tool appears, how expensive is the swap?

## Decision

1. **Drizzle ORM is the SQL data layer**, adopted 2026-07-06. The schema is code-first in `src/infra/db/schema.ts`; `drizzle-kit generate` emits SQL migrations under `drizzle/`; `src/infra/sqlite/content-db.ts` opens the db and applies them via Drizzle's `migrate()`.
2. **Drizzle lives strictly behind the repo ports (ADR-006).** Only three surfaces may import Drizzle: `src/infra/db/schema.ts`, `src/infra/sqlite/content-db.ts`, and the per-feature `src/features/*/repo.sqlite.ts` adapters (plus the composition root that injects the handle). Domain, feature, slice, route, and headless-contract code stays provider-agnostic. Drizzle types (`ContentDb`, row types) must not appear in port or feature-function signatures.
3. **Migrations are generated, never hand-written**, and the generated `drizzle/` SQL is committed to git. Schema changes are made by editing `schema.ts` + running `drizzle-kit generate` (never by editing files under `drizzle/` or writing raw `ALTER TABLE`). This is the mechanism SPEC-002 (`kind` column) and SPEC-003 (`schemaVersion` guard) were revised onto (revision R1, 2026-07-07).
4. **Rule-of-two is satisfied by one shared schema** (ADR-006): the SQLite adapter is built now; the Postgres/Supabase adapter is the plausible second, and it reuses the same `schema.ts` (SQLite text/JSON → Postgres `jsonb`), not a hand-ported per-dialect copy. This is Payload's shared-schema shape and the ADR-003 portability requirement (`ext` JSON → `jsonb` + expression indexes).
5. **The install-dir schema-version stamp is distinct from Drizzle's journal.** `.site-meta.json.schemaVersion` (SPEC-003) = the count of migrations the runtime bundles under `drizzle/` (the "is this site newer than the runtime?" portability guard); Drizzle's per-db `__drizzle_migrations` table tracks which migrations a given `content.db` has applied. They are complementary.

## Exit strategy (why this is reversible)

Swapping Drizzle out later is bounded to the three infra surfaces in decision (2) plus the migration wiring — feature logic, routes, and the behavioral contracts in every spec (acceptance criteria, invariants) never name it. Evidence: the raw-`better-sqlite3` → Drizzle move in SPEC-002/003 was a contained edit to the persistence sections only (R1); a future Drizzle → X move is the same shape and blast radius. Additional hedges:

- The generated `drizzle/` SQL is plain, portable SQLite/SQL — leaving Drizzle loses the *generator*, not the data or the schema.
- Query building stays inside `repo.*.ts`; the `ContentDb` type is contained there.

## Consequences

- Compile-time safety at the data layer (the Knex/Directus/Strapi weakness the analysis calls out) — types flow from one schema.
- The future Postgres adapter is a same-schema reuse, not a rewrite — the primary payoff.
- Known costs, all bounded and past-v1-scale: drizzle-kit is the most opinionated piece (mitigated by committing the SQL), and Drizzle's TS inference can be heavy on very large schemas (a scale far beyond v1).
- A dependency-cruiser rule should enforce decision (2) — Drizzle imports outside the three infra surfaces are a boundary violation (pairs with the plugin-boundary enforcement in competitor-analysis "avoid Strapi's porous boundaries").
