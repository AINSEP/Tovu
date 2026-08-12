ACK_PACKET_RECEIVED CTX-jini-infra-db-R2-2026-08-12 -- I received the packet and will work on it.

### PART E1 — Summary of Recommended Architecture

The target architecture establishes **SQLite as the local/bundled engine** and **PostgreSQL as the first-class managed engine** (e.g., Supabase hosting), while maintaining strict boundary separation. Tovu core maintains its 63 tables using a bi-dialect table builder DSL (`defineTovuTable`) in `src/db/schema-builder.ts` that instantiates both `drizzle-orm/sqlite-core` and `drizzle-orm/pg-core` objects from a single source of truth, completely eliminating schema drift and keeping all ORM types inside Tovu to bypass Part C's nominal typing issue. Database mechanics, driver pooling (`better-sqlite3` and `pg`), raw DDL emission for plugin data-modules, and read-only source introspection (MySQL 5.7+/8.0+) are placed in `@jini-ai/infra`, which remains 100% Drizzle-ignorant. Live SQLite-to-PostgreSQL migration and WordPress ingestion are executed deterministically by a first-party plugin (`@tovu/plugin-db-migration`), while an agent plugin (`@tovu/plugin-agent-migration`) exposes read-only introspection, mapping plan proposal, and dry-run tools to the LLM—enforcing a hard human-approval gate before deterministic execution.

---

### PART E2 — Detailed Design (D1–D7)

#### Resolution of Part C (The Drizzle Nominal Typing Constraint)
My design **does not depend on resolving Drizzle's cross-package nominal typing conflict**. We solve it by architectural decoupling: `@jini-ai/infra` will **never** import, export, or reference Drizzle ORM classes (`Column`, `SQL`, `PgTable`, `SQLiteTable`). `@jini-ai/infra` operates strictly on native database drivers (`better-sqlite3`, `pg`), generic DDL string emitters, and pure JSON/TypeScript interfaces (`TableDecl`, `SourceSchemaMetadata`). All Drizzle schema declarations (`sqliteTable`, `pgTable`) and Drizzle-kit migration manifests remain localized within `Tovu` core.

---

#### D1. The Dual-Dialect Problem (Core Strategy & Signatures)

**Recommendation:** **Bi-Dialect Table Builder DSL (`defineTovuTable`) in Tovu Core**.
Instead of hand-maintaining 63 twin files or writing fragile AST code generators, Tovu defines a lightweight builder DSL in `src/db/schema-builder.ts`. It accepts a dialect-agnostic column specification and generates both `sqliteTable` and `pgTable` objects simultaneously.

##### Code Signatures for Dual-Dialect Definition:

```typescript
// Tovu: src/db/schema-builder.ts
import { sqliteTable, text as sqliteText, integer as sqliteInteger } from "drizzle-orm/sqlite-core";
import { pgTable, text as pgText, integer as pgInteger, boolean as pgBoolean, timestamp as pgTimestamp, jsonb } from "drizzle-orm/pg-core";

export type ColumnKind = 
  | { type: "id" }
  | { type: "text"; nullable?: boolean }
  | { type: "boolean"; default?: boolean }
  | { type: "json"; nullable?: boolean }
  | { type: "timestamp"; nullable?: boolean }
  | { type: "foreignKey"; references: () => any };

export interface TableSpec {
  name: string;
  columns: Record<string, ColumnKind>;
  indexes?: Array<{ name: string; columns: string[]; unique?: boolean }>;
}

export interface DualTableOutput<TSqlite, TPg> {
  sqlite: TSqlite;
  pg: TPg;
}

export function defineTovuTable(spec: TableSpec): DualTableOutput<any, any> {
  // Generates Drizzle SQLite table and Drizzle Postgres table from single spec
  // Ensures 100% structural alignment by construction
  return {
    sqlite: buildSqliteTable(spec),
    pg: buildPgTable(spec)
  };
}
```

##### Migration Strategy for Both Dialects
- **SQLite Migrations:** Generated via `drizzle-kit generate --dialect=sqlite` into `src/db/drizzle/sqlite/`. Executed via Drizzle's SQLite migrator tracking `__drizzle_migrations`. Limited `ALTER TABLE` operations use SQLite table-rebuild copy patterns.
- **PostgreSQL Migrations:** Generated via `drizzle-kit generate --dialect=postgresql` into `src/db/drizzle/postgres/`. Executed inside transactional DDL blocks (`BEGIN; ... COMMIT;`), allowing safe, atomic migrations on live Supabase databases.

##### Drift Prevention & CI Verification
- **Drift Prevention:** Single-source definition via `defineTovuTable` guarantees that adding a column to a table definition automatically updates both SQLite and PostgreSQL schemas.
- **CI Verification Check (`pnpm check:schema-drift`):** CI runs a script that calls `drizzle-kit generate` for both SQLite and Postgres targets into temporary directories and asserts that `drizzle-kit check` succeeds without uncommitted schema changes, and compares the JSON AST outputs of both generated schema sets.

##### High-Risk Type Mappings & Solutions:
1. **Integer PKs / Autoincrement:** SQLite `integer("id").primaryKey({ autoIncrement: true })` $\rightarrow$ Postgres `integer("id").primaryKey().generatedAlwaysAsIdentity()`.
2. **Boolean:** SQLite `integer("is_active", { mode: "boolean" })` (stored as `0`/`1`) $\rightarrow$ Postgres `boolean("is_active")` (stored as `true`/`false`).
3. **JSON vs. JSONB:** SQLite `text("data", { mode: "json" })` $\rightarrow$ Postgres `jsonb("data")`.
4. **Timestamps / Timezones:** SQLite `text("created_at")` (ISO-8601 strings) $\rightarrow$ Postgres `timestamp("created_at", { withTimezone: true, mode: "date" })`.
5. **Full-Text Search (FTS5 vs. tsvector):** SQLite `virtualTable` with `fts5` $\rightarrow$ Postgres `tsvector` column + GIN index + `to_tsvector()` generated column. Domain search is abstracted behind `SearchPort.search(query, workspaceId)` with backend-specific repository implementations (`SearchRepoSqlite` vs. `SearchRepoPostgres`).
6. **Collation:** SQLite `NOCASE` $\rightarrow$ Postgres `citext` column type or `LOWER()` functional index.

---

#### D2. SQLite $\rightarrow$ PostgreSQL Live Migration Engine

The migration flow moves data from a live local SQLite instance to a remote PostgreSQL instance without data loss.

##### End-to-End Execution Flow:
1. **Target Preflight:** Connect to remote Postgres, apply pending Postgres Drizzle migrations up to current version tag.
2. **Source Snapshot / Read Lock:** Trigger `DbOpsPort.captureRestorePoint()` to freeze a WAL snapshot of SQLite.
3. **Table Topological Streaming:** Sort 63 core tables and active `plgn_*` tables by foreign key dependency order. Stream rows in 1,000-row chunks using cursor pagination.
4. **Type Transformations during Stream:**
   - Convert numeric booleans (`0`/`1`) to native boolean (`false`/`true`).
   - Parse ISO text strings into Postgres `Date` objects.
   - Convert raw JSON strings to structured Postgres JSONB payloads.
   - Preserve `workspaceId` and relative asset blob paths verbatim.
5. **Plugin Table Hydration:** Introspect active plugin `TableDecl` declarations, generate Postgres tables via `PostgresDdlEmitter`, and stream plugin rows.
6. **Post-Transfer Verification & Sequence Fixup:**
   - Execute row-count and primary-key checksum reconciliation.
   - **Critical Fix:** Reset Postgres identity sequences (`SELECT setval(pg_get_serial_sequence('table', 'id'), MAX(id)) FROM table`).
   - Populate Postgres `__drizzle_migrations` table with current SQLite migration markers.
7. **Cutover:** Update active `DATABASE_URL` to Postgres and resume traffic.

##### Resumable & Safe Migration Signatures:

```typescript
// @tovu/plugin-db-migration: src/engine/types.ts

export interface MigrationConfig {
  sourceSqlitePath: string;
  targetPostgresUrl: string;
  batchSize?: number;
  onProgress?: (progress: MigrationProgress) => void;
}

export interface MigrationProgress {
  currentTable: string;
  completedTables: string[];
  processedRows: number;
  totalRowsEstimate: number;
  status: "in_progress" | "verifying" | "completed" | "failed";
}

export interface MigrationEnginePort {
  preflight(config: MigrationConfig): Promise<{ ready: boolean; errors: string[] }>;
  execute(config: MigrationConfig): Promise<{ jobId: string; status: "completed" | "failed" }>;
  resume(jobId: string): Promise<{ status: "completed" | "failed" }>;
  verify(config: MigrationConfig): Promise<{ verified: boolean; tableDiffs: Record<string, number> }>;
}
```

---

#### D3. Plugin-Declared Tables on PostgreSQL (ADR-023 Adaptation)

ADR-023 allows plugins to declare desired tables via `TableDecl`.

1. **Dialect-Specific DDL Emitter (`@jini-ai/infra/db/ddl`):**
   DDL generation is extracted into dialect-specific emitters:
   - SQLite: `TEXT` $\rightarrow$ `TEXT`, `INTEGER` $\rightarrow$ `INTEGER`, `REAL` $\rightarrow$ `REAL`, `BLOB` $\rightarrow$ `BLOB`.
   - Postgres: `TEXT` $\rightarrow$ `TEXT`, `INTEGER` $\rightarrow$ `BIGINT`, `REAL` $\rightarrow$ `DOUBLE PRECISION`, `BLOB` $\rightarrow$ `BYTEA`.
   - Prefix: Namespace renamed to `plgn_{pluginId}__*` and `idx_plgn_{pluginId}__{name}`.

2. **Transactional DDL Adaptation (Replacing SQLite File Snapshots):**
   SQLite requires file-level snapshots (`VACUUM INTO`) and atomic rename because file-level rollback is its crash-recovery model. PostgreSQL **supports native transactional DDL** (`CREATE TABLE` and `CREATE INDEX` can be run inside `BEGIN ... COMMIT`).
   - On Postgres, the data-module engine skips file snapshots.
   - It opens an explicit transaction (`BEGIN;`), emits all `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` statements, updates the phase journal table (`_plgn_migration_journal`), and issues `COMMIT;`. If any statement fails, Postgres rolls back the entire DDL transaction cleanly.

---

#### D4. The Migration Plugin(s) Design & Tool Signatures

The owner requires a first-party transfer plugin (`@tovu/plugin-db-migration`) and an agent plugin (`@tovu/plugin-agent-migration`).

##### Agent Tools Surface & Signatures:

```typescript
// @tovu/plugin-agent-migration: src/tools.ts

export interface AgentMigrationTools {
  /** Inspects foreign source schema (MySQL/WordPress or SQLite) without modifying data */
  inspect_source_schema(args: { connectionUri: string }): Promise<SourceSchemaReport>;

  /** Samples up to N rows from a source table for field mapping inspection */
  sample_source_table(args: { connectionUri: string; table: string; limit?: number }): Promise<TableSampleReport>;

  /** Submits an agent-proposed mapping plan; returns a dry-run analysis and approval token requirement */
  propose_migration_plan(args: { planSpec: MigrationPlanSpec }): Promise<MigrationPlanProposal>;

  /** Executes a dry run of the proposed plan against a temp database */
  dry_run_migration(args: { planId: string }): Promise<DryRunResult>;

  /** Executes an approved migration plan using a human-generated approval token */
  execute_approved_plan(args: { planId: string; approvalToken: string }): Promise<MigrationExecutionResult>;

  /** Gets real-time status of an ongoing migration job */
  get_migration_status(args: { jobId: string }): Promise<JobStatusReport>;
}
```

##### Human Approval Gate & Deterministic Flow:
1. **Agent Proposals:** The agent analyzes the source schema (e.g., WordPress `wp_posts`) and calls `propose_migration_plan` with a `MigrationPlanSpec` mapping source fields to Tovu domain ports (`createPost`, `createUser`).
2. **Proposal Artifact Generation:** The system stores the plan, runs validation rules, generates a cryptographic hash of the plan, and creates a `MigrationPlanProposal` object containing:
   - Complete table and field mapping diff.
   - Sample row transformations.
   - Required workspace assignment (`workspaceId`).
   - A unique `approvalToken` prompt for the human UI/CLI.
3. **Human Approval:** The human operator reviews the proposal diff in the Tovu dashboard or CLI and clicks "Approve". This generates a signed `approvalToken`.
4. **Execution:** The agent calls `execute_approved_plan(planId, approvalToken)`. The deterministic execution engine in `@tovu/plugin-db-migration` executes the migration via domain ports. **The agent never executes raw SQL.**

##### What the Agent Receives & Returns:
- **Receives:** JSON schema reports, row samples, validation error lists, and execution status objects.
- **Returns:** Structured `MigrationPlanSpec` JSON objects to the engine tool, and markdown summaries explaining the plan to the human user.

---

#### D5. MySQL Scope

1. **MySQL as Read-Only Source (WordPress Migration):**
   - **In Scope (Mandatory).** Handled via a read-only client in `@jini-ai/infra/introspect` using `mysql2`. Supports schema introspection (`INFORMATION_SCHEMA`) and row extraction from WordPress tables (`wp_posts`, `wp_postmeta`, `wp_terms`, `wp_users`). Minimum viable version: **MySQL 5.7 / 8.0+**.
2. **MySQL as Tovu Database Target:**
   - **Out of Scope (Excluded).** Tovu will NOT support MySQL as a target database engine. Target engines are strictly limited to SQLite (bundled/local) and PostgreSQL (Supabase/managed scale). Adding MySQL as a 3rd target engine would triple schema maintenance and CI testing overhead for zero product benefit.

---

#### D6. Component Placement Matrix

| Component | Target Location | Rationale |
| :--- | :--- | :--- |
| Driver Lifecycle (`better-sqlite3`, `pg`), Connection Pooling, Basic `DbOpsPort` | `@jini-ai/infra` | Pure database mechanics. Zero knowledge of Tovu domain or Drizzle schemas. Reusable across Jini products. |
| Foreign Source Introspector (MySQL / SQLite) | `@jini-ai/infra` | Generic read-only schema and row inspection primitives. Zero domain logic. |
| Plugin Data-Module DDL Emitters (`SQLiteDdlEmitter`, `PostgresDdlEmitter`) | `@jini-ai/infra` | Dialect DDL string generators for raw `TableDecl` objects. |
| Core CMS Entity Ports (`MediaPort`, `ContentPort`) | `@jini-ai/cms` | Reusable domain shapes shared across Jini CMS apps. |
| 63 Table Definitions (`defineTovuTable`), Drizzle Migrations (`src/db/drizzle/`) | `Tovu Core` (`src/db/`) | Product-specific schema. Kept in Tovu to prevent Jini bloat and bypass Drizzle nominal typing bugs. |
| Repository Implementations (`*-repo.sqlite.ts`, `*-repo.pg.ts`) | `Tovu Core` (`src/db/`) | Product-specific query adapters binding domain ports to SQLite/Postgres schemas. |
| Live SQLite $\rightarrow$ Postgres Transfer Engine | `@tovu/plugin-db-migration` | First-party Tovu plugin owning deterministic batch transfer, type coercions, and sequence fixups. |
| Agent Introspection & Mapping Tools | `@tovu/plugin-agent-migration` | Agent-facing plugin exposing inspection, plan proposal, and dry-run execution interfaces. |

---

#### D7. Concrete Bugs in This Design (Self-Audit)

##### Bug 1: Postgres Identity Sequence Desynchronization Post-Migration
- **Trigger:** Bulk inserting SQLite rows with explicit primary keys (`id: 1..5000`) into Postgres tables with `IDENTITY` columns.
- **Failure:** Postgres does not auto-advance its underlying sequence generator when explicit `id` values are passed in `INSERT` statements.
- **Symptom:** Migration completes cleanly, but the very first runtime `INSERT` on Postgres crashes with `duplicate key value violates unique constraint "users_pkey" (Key (id)=(1) already exists)`.
- **Fix:** Step 6 of `MigrationEnginePort` must explicitly run `SELECT setval(pg_get_serial_sequence('table_name', 'id'), coalesce(max(id), 1))` for every transferred identity table before declaring success.

##### Bug 2: Un-rollbackable Mid-Migration DDL Failure in Plugin Data-Modules on SQLite vs. Postgres
- **Trigger:** A plugin declares a `TableDecl` containing 1 table and 3 indexes, where index #3 has a syntax error, executed against Postgres without a transaction block.
- **Failure:** On Postgres, if DDL is run un-transactionally, the table and first 2 indexes persist on disk while index #3 fails. Subsequent idempotent retries fail with `relation "plgn_foo__bar" already exists`.
- **Symptom:** Plugin installation enters a stuck, semi-installed state.
- **Fix:** Postgres DDL execution in `PostgresDdlEmitter` MUST wrap all DDL statements for a data-module inside a single explicit `BEGIN; ... COMMIT;` transaction block.

##### Bug 3: FTS5 Search Syntax Crash on Postgres Backend
- **Trigger:** Domain code calls search repository with SQLite FTS syntax (e.g., `title MATCH 'hello*'`) when running on Postgres.
- **Failure:** Postgres `tsvector` rejects SQLite `MATCH` syntax with a SQL syntax error (`syntax error in tsquery`).
- **Symptom:** Search endpoints return HTTP 500 error on Postgres deployments.
- **Fix:** Search MUST be fully decoupled behind a domain `SearchPort`. `SearchRepoSqlite` constructs `MATCH` queries, while `SearchRepoPostgres` constructs `plainto_tsquery()` / `to_tsquery()` calls.

##### Bug 4: Part C Drizzle Type Pollution across Package Linkage
- **Trigger:** Accidental import of `@jini-ai/infra` code that imports or re-exports Drizzle ORM `Column` or `Table` classes into Tovu.
- **Failure:** TypeScript nominal type checking fails due to dual `node_modules/drizzle-orm` packages.
- **Symptom:** 600+ `tsc` build errors: `Property 'config' is protected but type 'Column' is not a class derived from 'Column'`.
- **Fix:** Enforce an ESLint rule in `@jini-ai/infra` forbidding any import from `drizzle-orm`. `@jini-ai/infra` APIs must only accept plain JavaScript objects or primitive types.

---

### PART E3 — Ranked Slate of Architectural Options

#### Option A: Bi-Dialect Builder DSL (`defineTovuTable`) + Decoupled Infra Engine (RECOMMENDED)
- **Description:** Single-source builder DSL in Tovu generating `drizzle-orm/sqlite-core` and `drizzle-orm/pg-core` objects. `@jini-ai/infra` handles raw database pooling, DDL generators, and read-only source introspection. Live migration and agent tools live in dedicated Tovu plugins.
- **Trade-offs:** Minimal initial overhead to write `defineTovuTable`; 100% type-safe; zero schema drift; immune to Part C Drizzle nominal typing errors.

#### Option B: Dual Schema Files (`schema.sqlite.ts` & `schema.pg.ts`) + Automated Diff Suite
- **Description:** Hand-maintain 63 SQLite table files and 63 Postgres table files side-by-side in Tovu. Write extensive CI unit tests to diff column definitions.
- **Trade-offs:** Simple to understand, but high ongoing maintenance burden. High risk of human error causing subtle column type drift during rapid feature development.

#### Option C: Build-Time TypeScript AST Transpiler
- **Description:** Maintain only `schema.sqlite.ts`. Build a custom Babel/TypeScript AST transpiler script that reads the file at build time and outputs `schema.pg.ts`.
- **Trade-offs:** Keeps single source file, but introduces complex, fragile build tooling. AST parsing breaks whenever developers use unsupported TS expressions or helpers in `schema.ts`.

#### Option Ranking & Decision Criteria
1. **Type Safety & Drift Elimination:** Option A > Option C > Option B.
2. **Developer Velocity & Maintenance:** Option A > Option B > Option C.
3. **Robustness & Predictability:** Option A > Option B > Option C.

**Recommendation:** **Option A**.

##### The Single Cheapest Test to De-risk Option A:
Build a minimal 2-table prototype using `defineTovuTable` in `Tovu/src/db/schema-builder.ts` with 1 integer PK, 1 boolean, 1 timestamp, and 1 JSON column. Run `drizzle-kit generate` for both `--dialect=sqlite` and `--dialect=postgresql` into temporary folders and verify that both generated SQL files execute cleanly against local SQLite and Postgres containers.

---

### PART E4 — What Would Change My Mind

1. **Native Drizzle Multi-Dialect Schema Support:** If `drizzle-orm` releases native multi-dialect support (a single `pgTable`/`sqliteTable` unified syntax) in a near-future release, I would eliminate `defineTovuTable` and adopt Drizzle's official unified schema layer directly.
2. **Managed Cloud Migration Utilities:** If Supabase or another managed partner provides a zero-downtime, automated SQLite-to-Postgres logical migration sidecar that handles SQLite WAL streaming and sequence fixups out of the box, I would shrink the custom `MigrationEnginePort` to a simple API trigger wrapping that managed service.

<<SWARM_END>>
