ACK_PACKET_RECEIVED CTX-jini-infra-db-R2-2026-08-12 -- I received the packet and will work on it.

### 1. Architectural Summary

The architecture maintains a strict boundary: **Tovu owns product meaning, while Jini owns database mechanics.** To support both SQLite and PostgreSQL as first-class backends without destroying type safety or triggering the 604 nominal TypeScript errors, **all Drizzle ORM schema definitions and migrations remain exclusively inside Tovu.** Jini will provide driver-agnostic connection lifecycle management, abstract transaction wrappers, and an ETL engine, but it will never import `drizzle-orm`. For the dual-dialect problem, Tovu will hand-maintain parallel schema declarations (`schema.sqlite.ts` and `schema.postgres.ts`), relying on a deterministic CI structural diff to prevent drift. The WordPress migration is a read-only ETL process: the agent is granted tools to introspect the foreign database and author a declarative JSON mapping document. A human approves this document in the Tovu UI, and a deterministic first-party plugin executes it, writing to Tovu’s standard domain ports. The agent never generates or executes raw SQL against the target database.

---

### D1. The Dual-Dialect Problem

Tovu must run on both SQLite and PostgreSQL, but Drizzle lacks a native dialect-agnostic schema abstraction. The 604 TypeScript errors prove that extracting generic Drizzle helpers across package boundaries triggers catastrophic nominal typing failures due to dual-package resolution.

**Recommendation:** (a) Hand-maintain 63 `pgTable` twins in Tovu (`src/db/postgres/schema.ts` alongside `src/db/sqlite/schema.ts`). 

Attempting to build a schema DSL in Tovu (Option b) that emits both dialects destroys Drizzle’s complex mapped-type inference. Drizzle’s column builders (`text`, `integer`, `jsonb`) are strictly tied to their dialect implementations. Wrapping them requires impossible-to-maintain TypeScript gymnastics that will break on every ORM update. 

**Type Mappings that will bite:**
- **Primary Keys:** SQLite `integer('id').primaryKey({ autoIncrement: true })` $\rightarrow$ Postgres `serial('id').primaryKey()` (or `integer('id').generatedAlwaysAsIdentity()`).
- **Booleans:** SQLite `integer('b', { mode: 'boolean' })` $\rightarrow$ Postgres `boolean('b')`.
- **JSON:** SQLite `text('j', { mode: 'json' })` $\rightarrow$ Postgres `jsonb('j')`.
- **Timestamps:** SQLite `integer('t', { mode: 'timestamp' })` $\rightarrow$ Postgres `timestamp('t', { withTimezone: true })`.
- **Search:** SQLite `sqliteTable('search', ...)` (FTS5 virtual tables) $\rightarrow$ Postgres `index('search_idx').using('gin', sql`to_tsvector(...)`)`.

**How they are kept from drifting (The CI Check):**
Drift is prevented structurally, not syntactically. A CI job provisions a blank SQLite file and a blank Postgres database. It runs `drizzle-kit push` for both dialects. It then executes an introspection script (e.g., using `drizzle-kit introspect` or raw information schema queries) to extract a normalized JSON AST from both running databases (capturing tables, column names, nullability, unique constraints). The test asserts `assert.deepStrictEqual(sqliteSchemaAST, pgSchemaAST)`. If a developer adds a column to SQLite but forgets Postgres, CI fails. 

```typescript
// D1 CI Check pseudocode
const sqliteAst = await extractNormalizedSchema(sqliteDb);
const pgAst = await extractNormalizedSchema(pgDb);

// Throws if the 63 tables have drifted in structure
assert.deepStrictEqual(sqliteAst, pgAst, "Schemas have drifted between dialects");
```

---

### D2. SQLite $\rightarrow$ PostgreSQL Migration for a Live Site

This is a live application-layer ETL process, not a SQL dump, because the data types (e.g., SQLite `INTEGER` booleans to Postgres `BOOLEAN`) must be translated.

1. **Target Provisioning:** The Supabase Postgres database is provisioned and Tovu's Postgres Drizzle migrations are run to establish a clean schema. 
2. **The `__drizzle_migrations` table:** Ignored. The Postgres target is already at the latest schema via its own migration chain.
3. **FTS5 Search Indexes:** Ignored during data copy. The application layer inserts into Postgres, which natively updates its `tsvector` columns via Postgres triggers or Drizzle-managed application hooks.
4. **`workspaceId` Scoping:** Preserved exactly as-is. The migration worker simply copies the UUID strings across.
5. **Blob/Asset Columns:** The database values (storage keys, paths, SHA256 hashes) are copied directly as strings. The physical media files on disk or S3 remain untouched.
6. **Plugin-Declared Tables:** The migration worker queries SQLite's `sqlite_master` for tables matching `plgn_%`. It extracts their column definitions and feeds them to Tovu's Postgres `data-module` engine (see D3) to create the tables in Postgres, then streams the rows across dynamically.
7. **Resumability:** The worker maintains a local `migration_state.json` file tracking the maximum migrated `id` or `updatedAt` for each table. If the process dies, it resumes from the last known checkpoint.

```typescript
// D2 Execution Signature
async function migrateSqliteToPostgres(sqliteDb: Database, pgDb: PostgresJsDatabase) {
  const tables = await getTablesToMigrate(sqliteDb);
  for (const table of tables) {
    let lastId = await getCheckpoint(table.name);
    while (true) {
      const batch = await fetchBatch(sqliteDb, table.name, lastId);
      if (batch.length === 0) break;
      const translatedBatch = translateTypes(batch, table.schema);
      await pgDb.insert(table).values(translatedBatch);
      lastId = batch[batch.length - 1].id;
      await saveCheckpoint(table.name, lastId);
    }
  }
}
```

---

### D3. Plugin-Declared Tables on PostgreSQL

ADR-023’s `data-module.ts` engine currently generates SQLite DDL and relies on whole-file snapshots for recovery. This apparatus must change for Postgres because Postgres lacks whole-file atomic snapshots.

**What changes:** 
We extract a `DialectAdapter` within Tovu core that dictates how `ColumnDecl` translates to SQL (e.g., translating `BLOB` to `BYTEA` for Postgres). 

**Snapshot and Recovery:** 
Postgres supports **Transactional DDL**. Steps 5 (snapshotting the whole DB) and 6 (opening a durable phase journal) from ADR-023 are **skipped** for Postgres—exactly as they are already skipped for `:memory:` SQLite databases in the current code. We rely entirely on Postgres's native `BEGIN; CREATE TABLE ...; COMMIT;`. If the DDL fails, Postgres automatically rolls back the schema changes. The `recoveryPoint` becomes null, and no file manipulation is required. 

---

### D4. The Migration Plugin(s)

The migration layer is split into a **first-party transfer plugin** (the deterministic executor) and an **agent plugin** (the planner).

**1. Tools exposed by the Agent Plugin:**
```typescript
interface AgentMigrationTools {
  // Read-only. Connects to foreign DB and returns schema AST (tables, columns, types).
  introspectSource(connectionUrl: string): Promise<SourceSchemaProfile>;
  
  // Read-only. Fetches a small sample of rows to help the agent understand the data shape.
  sampleSourceData(connectionUrl: string, tableName: string, limit: number): Promise<unknown[]>;
  
  // Dry run. Evaluates the mapping against 100 rows, returning counts and validation errors.
  previewMapping(mappingDocument: MappingDoc): Promise<MappingDiffReport>;
  
  // Submits the mapping for human review.
  proposeMapping(mappingDocument: MappingDoc): Promise<string /* proposalId */>;
}
```

**2. The Human Approval Gate:**
When the agent calls `proposeMapping`, the workflow pauses. The human administrator is presented with a UI in Tovu showing the declarative `MappingDoc`. The UI displays a visual diff: "WordPress `wp_posts` will map to Tovu `MediaRecord`. Here is a preview of 5 translated records. 200 records failed validation." The human clicks "Approve & Execute".

**3. Mechanical Execution:**
Once approved, the agent is removed from the loop. Tovu's first-party transfer plugin reads the `MappingDoc`, establishes a cursor on the source database, and executes a batch-processing loop. Mapped records are passed directly to Tovu's existing domain ports (e.g., `contentRepo.save(record)`). 

**4. What the agent receives and returns:**
The agent receives the foreign schema and data samples as JSON. The agent returns a declarative JSON `MappingDoc` detailing field correspondence, fallback values, and basic transformations (e.g., "strip HTML tags"). It never returns raw SQL.

---

### D5. MySQL Scope

**MySQL is scoped strictly as a read-only WordPress source.** Tovu will never run on MySQL as a backend target. 

The minimum viable version to support is **MySQL 5.7+ and MariaDB 10.2+**, as these cover the vast majority of legacy WordPress hosting environments. The MySQL connector belongs entirely in the introspection and read-extraction layer of `@jini-ai/infra/migrate`. It does not need connection pooling configured for high-concurrency writes, nor does it require DDL generation logic.

---

### D6. Placement

- **`@jini-ai/infra/db/core`**: Driver-agnostic interfaces, connection lifecycle management, and base error classes (e.g., `UniqueConstraintViolation`). Zero ORM dependencies.
- **`@jini-ai/infra/db/sqlite`**: The `better-sqlite3` driver wrapper, WAL sidecar cleanup, and SQLite-specific `db-ops.ts` (online backup).
- **`@jini-ai/infra/db/postgres`**: The `pg` driver wrapper, providing connection pooling and transaction primitives.
- **`@jini-ai/infra/migrate`**: The abstract ETL engine. Contains generic source cursors, stateful ID-mapping tables, and the deterministic executor for `MappingDoc`s.
- **`Tovu/src/db/`**: **All 63 table definitions (both SQLite and Postgres twins), all Drizzle migrations, and all domain repository adapters (`*-repo.sqlite.ts` and `*-repo.pg.ts`).**
- **`Tovu/src/features/plugins/wp-import`**: The first-party plugin containing WordPress-to-Tovu semantic knowledge (e.g., translating `wp_postmeta` shortcodes).
- **`Tovu/src/features/plugins/agent-migrate`**: The plugin that exposes the LLM tools for mapping proposal.

**Why:** Keeping all Drizzle schemas and domain adapters inside Tovu resolves the 604 nominal TypeScript errors permanently. Jini remains a pure engine for moving bytes and managing driver lifecycles, unaware of what a "post" or a "newsletter" is. 

---

### D7. Bugs in this Design

**Bug 1: Postgres Transactional DDL Deadlocks with Live Traffic**
- **The Trigger:** An administrator installs a new plugin that attempts to declare a `plgn_store__orders` table on the live Postgres instance via `data-module.ts`. Simultaneously, a long-running analytical query or background job is running against the database, holding a shared schema lock. 
- **The Symptom:** Postgres transactional DDL (`CREATE TABLE`) requires an `ACCESS EXCLUSIVE` lock. It queues behind the long-running query, blocking all subsequent queries on the database. The connection pool exhausts, and the live Tovu site goes down until the DDL transaction times out.

**Bug 2: Nominal Type Poisoning on Interface Boundaries**
- **The Trigger:** A developer attempts to add a generic transaction wrapper to `@jini-ai/infra/db/core` and types it using `import type { PgTransaction } from "drizzle-orm/pg-core"`. 
- **The Symptom:** Because Tovu and Jini resolve their local `node_modules` separately, Tovu passing its Drizzle transaction object into Jini's function causes the 604 `shouldInlineParams` TypeScript errors to instantly return. Jini *must* use `unknown` or strictly structural POJO types at the boundary.

**Bug 3: OOM during SQLite $\rightarrow$ Postgres Memory-Buffered Sync**
- **The Trigger:** A workspace has 500,000 analytics events or comments. The migration worker queries `SELECT * FROM comments` without strict cursor pagination.
- **The Symptom:** The Node.js V8 heap exceeds its limit (OOM), crashing the migration mid-flight. The fix requires the migration to enforce strict keyset pagination (`WHERE id > last_id LIMIT 1000`) for all table copies.

---

### Ranked Slate of Options

#### Option A: Hand-Maintained Twin Schemas (Recommended)
Maintain separate `schema.sqlite.ts` and `schema.postgres.ts` files in Tovu, verified by a strict CI structural diff.
- **Trade-offs:** Requires duplicating 63 table definitions and maintaining two separate Drizzle-kit migration chains. However, it preserves 100% of Drizzle's native type inference and avoids writing a custom DSL over complex mapped types. 
- **De-risking Test:** The cheapest test is to write the CI introspection script first. Provision an empty SQLite and PG database, create one table with a JSON column in both, and assert that the script correctly normalizes and compares them.

#### Option B: A Custom Tovu Schema DSL
Write a `defineTable` function that returns an object containing both the `sqliteTable` and `pgTable` definitions, allowing a single source of truth.
- **Trade-offs:** Eliminates duplication, but essentially requires forking or heavily wrapping Drizzle's core types. Typescript inference for advanced Drizzle features (like chained `.default().notNull()`) breaks easily.
- **De-risking Test:** Attempt to write the TypeScript definition for `defineTable` that accurately infers the return type of a `.notNull()` column builder for both dialects simultaneously. (This will likely fail and prove why Option A is better).

**Ranking Criteria:** Type safety, long-term maintainability by a solo developer, and resilience against ORM library updates. Option A wins because duplication verified by CI is vastly superior to brittle, custom TypeScript generic wrappers that break on minor version bumps.

---

### What Would Change My Mind

I would abandon the twin-schema approach (Option A) and advocate for a custom DSL (Option B) if Drizzle ORM released a native, officially supported dialect-agnostic builder API. 

I would advocate against building the PostgreSQL backend entirely if Supabase hosting was removed as a hard requirement. If the product was purely self-hosted, the operational cost of maintaining dual migration chains far outweighs the hypothetical performance benefits of Postgres, given SQLite WAL's proven capacity to handle CMS-scale traffic.

<<SWARM_END>>
