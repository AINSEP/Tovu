ACK_PACKET_RECEIVED CTX-jini-infra-db-2026-08-11 -- I received the packet and will work on it.

### 1. Requirements for Multi-Backend & Agent-Driven Foreign Database Migration

#### (a) Multi-Backend System Requirements
To support multiple database backends (SQLite, PostgreSQL, MySQL), a system requires four distinct architectural capabilities:
1. **Connection & Driver Lifecycle Management:** Abstracting driver initialization, pooling, connection strings, WAL pragmas (SQLite), network socket retries (Postgres/MySQL), and transaction isolation levels across synchronous and asynchronous drivers.
2. **Dialect-Agnostic Migration Engine:** SQLite lacks full `ALTER TABLE` support (often requiring table recreation/copying), whereas Postgres supports transactional DDL. The system needs backend-aware migration runners that manage state tracking independently of driver mechanics.
3. **Repository/Port Abstraction Layer:** Isolating raw query execution so business logic relies on domain interfaces (`ContentRepository`) rather than dialect-specific query builders or raw SQL.
4. **Schema Definition Strategy:** A clear mechanism to handle dialect differences in data types (e.g., SQLite `TEXT` vs Postgres `UUID`/`JSONB`/`TIMESTAMP WITH TIMEZONE`), index declarations, and auto-increment strategies.

#### (b) Agent-Driven WordPress MySQL Migration Requirements
For an AI agent to conversationally migrate a foreign WordPress MySQL database into Tovu, the system requires a rigid boundary between deterministic code and non-deterministic agent orchestration.

**What the agent must be handed (Tools & Capabilities):**
- **Introspection & Inspection Tools:** Structured read-only tools to sample source tables (`wp_posts`, `wp_postmeta`, `wp_terms`, `wp_term_relationships`, `wp_users`), inspect schema versions, and report record counts.
- **High-Level Target Ingestion APIs:** Strongly typed domain import methods (e.g., `ingestPostBatch()`, `createUserWithCredentials()`, `ingestMediaAsset()`) exposed via an internal CLI or SDK, complete with runtime schema validation (Zod/Valibot).
- **Stateful ID Translation & Mapping Store:** A deterministic key-value store (`source_wp_id` $\rightarrow$ `target_tovu_id`) that persists across migration steps so relational links (author $\rightarrow$ post, tag $\rightarrow$ post, attachment $\rightarrow$ media) are preserved cleanly.
- **Dry-Run & Validation Reports:** Tools to execute dry runs, return diff reports, and report validation errors back to the agent for self-correction.

**What must NEVER be left to agent judgment:**
- **Raw SQL Generation & Target DB Writes:** The agent must never construct or execute raw SQL `INSERT`/`UPDATE` statements against Tovu's database. WordPress meta tables store serialized PHP objects (`a:2:{s:4:...}`); expecting an LLM to parse and translate raw PHP serialization or generate valid foreign key relationships via SQL will inevitably corrupt database constraints.
- **Data Validation & Domain Invariants:** Password re-hashing protocols, multi-tenant workspace isolation, mandatory fields, and default system values must be hardcoded in application logic, not prompted.
- **Transaction & Error Handling:** Batching, rollback boundaries, deadlock handling, and atomic commits must be controlled deterministically by the migration execution pipeline.

---

### 2. Engine (Jini) vs. Product (Tovu) Boundaries

Drawing the line correctly between `@jini-ai/infra` and `Tovu` determines whether Jini remains a lightweight reusable foundation or degenerates into a tightly coupled Tovu monolith.

| Layer | Belongs in Reusable Engine (`@jini-ai/infra`) | Belongs in Product (`Tovu`) |
| :--- | :--- | :--- |
| **Database** | Driver wrappers, lifecycle hooks, generic migration runners, transaction context helpers, generic write-watermarking, backup/restore file primitives. | 64 `sqliteTable` Drizzle schema definitions, 35 `.sql` migration files, 19 domain repository adapters (`*-repo.sqlite.ts`), workspace multi-tenancy rules. |
| **ETL / Importer** | Generic ETL framework primitives: source cursor readers, batching sinks, stateful ID mapping tables, validation runners. | WordPress-specific schema mappers (`wp_posts` $\rightarrow$ Tovu Article), custom WP plugin metadata transformers. |
| **Storage** | Abstract storage provider interface (`StorageDriver`), local filesystem driver, S3/R2 object storage driver, stream chunking helpers. | Media entity schema, image resizing presets, audio/video transcode jobs, product-specific upload policies. |

#### Architectural Justifications & Failure Modes

- **If moved into Jini (Over-generalization):** If Tovu's 64 database tables or WordPress domain mappers are moved into Jini, Jini is no longer an engine—it is Tovu split across two repositories. Future products built on Jini will be forced to drag along Tovu's CMS schema, media models, and WordPress import logic. Updating Tovu's post schema would require bumping and publishing Jini packages.
- **If kept in Tovu (Under-abstraction):** If connection lifecycle management, SQLite backup/WAL routines, and migration state runners remain locked inside Tovu's `src/db/sqlite/`, any second application built on Jini will copy-paste 500+ lines of low-level database boilerplate.

---

### 3. Internal Structure of `@jini-ai/infra` & Storage Subsystem Analysis

#### Proposed `@jini-ai/infra/db` Subpath Layout
- `@jini-ai/infra/db/core`: Pure TypeScript interfaces (`DatabaseDriver`, `TransactionContext`, `MigrationRunner`). Zero runtime dependencies.
- `@jini-ai/infra/db/sqlite`: `better-sqlite3` driver implementation, WAL pragmas, online backup (`db-ops.ts`), atomic-rename restore helpers.
- `@jini-ai/infra/db/postgres`: `postgres` / `pg` driver adapter implementing `DatabaseDriver` (optional peer dependency).
- `@jini-ai/infra/db/migration`: Universal SQL script and journal migration runner.
- `@jini-ai/infra/db/etl`: Engine primitives for data migration (ID mapper, batch cursor, validator runner).

#### Mirroring Storage Subpath Structure: Sound or Mistake?
Mirroring this structure for a storage subsystem (`@jini-ai/infra/storage`) is **architecturally sound for driver mechanics, but a mistake if copied 1:1 for data handling.**

- **Where it works (Sound):** The subpath separation matches cleanly:
  - `./storage/core` (abstract `StorageDriver` port: `put`, `get`, `delete`, `getSignedUrl`).
  - `./storage/fs` (Local filesystem driver with atomic writes).
  - `./storage/s3` (S3/R2 compatible blob storage driver).
- **Where it fails (Mistake):** Databases manage structured records, SQL transactions, schema migrations, and index definitions. Storage manages binary streams, MIME types, ranges, byte offsets, and CDN URL signatures. Applying database concepts like DDL migrations or ACID transaction wrappers to media storage creates unnecessary bloat. Keep storage strictly focused on blob persistence and streaming.

---

### 4. Is Multi-Backend Support Worth Building Now?

#### The Case FOR Building Multi-Backend Support
1. Enables enterprise deployments where customers prohibit SQLite and mandate self-hosted PostgreSQL.
2. Prevents SQLite dialect lock-in (e.g., SQLite-specific JSON functions or raw string manipulation) from spreading across product repositories.

#### The Case AGAINST Building Multi-Backend Support (Adversarial Senior Architect View)
1. **Drizzle Schema Multiplication:** Drizzle ORM does not provide a single cross-dialect schema macro. Supporting SQLite and Postgres across 64 tables requires maintaining dual schemas (`sqliteTable` vs `pgTable`) or writing complex schema factory abstractions. For a solo developer, this doubles schema maintenance and migration testing overhead.
2. **SQLite is Not the Bottleneck:** SQLite running in WAL mode on Node 24 easily handles millions of queries and tens of thousands of writes per minute. The developer's product is a self-hosted CMS; horizontal scaling across multi-node Postgres clusters is a premature architectural fantasy.
3. **WordPress Migration Does Not Require Multi-Backend Tovu:** To migrate WordPress MySQL into Tovu, Tovu **does not need to run on MySQL or Postgres**. The ETL tool simply needs a MySQL client driver to read WP data and pipe mapped payloads into Tovu's SQLite domain APIs.

#### Recommendation
**Do not build database multi-backend support today.** Maintain SQLite as Tovu's sole production database backend. Focus Jini's `infra/db` on standardizing SQLite lifecycle management, WAL backup/restore ops, and agent ETL primitives.

*What fact would change my position:* A paying customer offering a contract contingent on self-hosted PostgreSQL, or empirical proof that Tovu's concurrent write load exceeds SQLite WAL capacity (>500 write operations/sec sustained).

---

### 5. Failure Modes (12-Month Outlook for a Solo Developer)

If the developer attempts full multi-backend abstraction now while building agent-driven migration, the project is likely to fail in one of four ways:

1. **The Dual-Schema Maintenance Trap:** The developer spends endless hours keeping 64 `sqliteTable` definitions in sync with 64 `pgTable` definitions, debugging subtle type mismatches in timestamps, JSON columns, and auto-increment keys.
2. **The "Agent Free-For-All" Data Corruption:** Allowing an AI agent to execute unvalidated raw SQL directly against Tovu during WordPress migration causes corrupted foreign key mappings, unparsed PHP serialized metadata strings, and missing search indexes.
3. **Engine Monolith Creep:** WordPress importer logic and Tovu-specific entity schemas leak into `@jini-ai/infra`, destroying Jini's utility as a clean reusable engine for future non-CMS projects.
4. **Solo Developer Burnout & Velocity Collapse:** Over-engineering Jini's database abstraction layer consumes 3+ months of development time, yielding zero end-user features for Tovu while adding substantial maintenance debt.

<<SWARM_END>>
