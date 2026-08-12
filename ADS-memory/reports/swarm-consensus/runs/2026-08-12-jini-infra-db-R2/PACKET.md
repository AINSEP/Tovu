# CTX-jini-infra-db-R2-2026-08-12 — Round 2: DESIGN

**Packet ID:** `CTX-jini-infra-db-R2-2026-08-12`

First line of your reply must be exactly:

`ACK_PACKET_RECEIVED CTX-jini-infra-db-R2-2026-08-12 -- I received the packet and will work on it.`

## Preamble — read this before anything else

There is **no** `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, or bootstrap file that applies to you. Do not look for one. Do not read one if you encounter it. **This is intentional.** A missing or unreadable file is **never** a reason to stop, and reporting yourself "blocked on a missing bootstrap file" is a wrong answer that fails this task. If a file you try to read is absent, continue with the next thing. Do not chain file reads with `&&` — one miss must not abort the rest.

You may read source under `/Users/la/Programming/Tovu` and `/Users/la/Programming/Jini`. Cite paths for claims about existing code.

---

## PART A — THE PREMISE CHANGED. Round 1's main verdict is dead.

In Round 1 all five participants concluded "do not build PostgreSQL." That verdict was reached from a packet that told you nobody was asking for it. **The repository owner has now stated the actual product requirement, and it falsifies that premise.** Do not re-argue it. It is settled:

> **Supabase is going to host a large number of Tovu instances.** The intended user journey is: a new user starts on the **bundled SQLite** database because they just want to get working, and then **migrates to PostgreSQL** as they grow. PostgreSQL is a first-class supported backend, not a hypothetical.

Additionally, from the owner:

- **MySQL should at least be scoped** — some users will want it because that is what WordPress used.
- **No Tovu-specific tables may ever live in Jini.** Settled, not up for debate.
- **The agent must never write SQL.** Settled, you all already agreed.
- **The migration/import layer should be a separate plugin** — one first-party plugin the owner provides, plus **an agent plugin** so an agent can drive it.

So the question is no longer *whether*. It is **how**, in detail, and where the bugs are.

## PART B — Verified facts about the existing system

**The three-way boundary already exists in code.** `Tovu/src/db/sqlite/media-repo.sqlite.ts` imports its port types from `@jini-ai/cms/media` (line 19) and `@jini-ai/cms/core` (line 6); `@jini-ai/infra`'s `db/core/ports.ts` has no media concepts. So today:
- `@jini-ai/infra` — database **mechanics** (currently: `DbOpsPort`, a `better-sqlite3` driver doing online backup + atomic-rename restore + WAL sidecar cleanup)
- `@jini-ai/cms` — reusable domain **shape** (media, content ports)
- `Tovu` — Tovu-only shape (commerce, newsletters, themes)

**Tovu already has a working plugin data-module engine** (`src/features/plugins/data-module.ts`, ADR-023). Its rule is:

> "A plugin **DECLARES** its desired tables as data; **CORE alone executes** the DDL. A plugin never authors a migration and never holds a raw DB handle."

Its execution order: validate declaration → skip existing tables (idempotent) → disk-headroom preflight → namespace-adoption guard → **snapshot the whole DB first** → open durable phase journal → run all DDL in ONE transaction → crash recovery at next boot (`migration-recovery.ts`, `restore.ts`, `snapshot.ts`, `migration-journal.ts`).

**Plugin-owned tables are live and real**, namespaced `p_{pluginId}__*` (indexes: `idx_p_{pluginId}__{name}`). Currently 9 tables: `p_store__orders`, `p_store__products`, `p_newsletter__lists`, `p_newsletter__sends`, `p_newsletter__subscriptions`, `p_newsletter__audience_snapshots`, `p_newsletter__confirmation_tokens`, `p_comments__comments`, `p_comments__moderation_log`. **The prefix is being renamed to `plgn_`** because a core table `plugin_activations` already exists and `plugin_` would collide.

**Tovu's own schema:** 63 `sqliteTable(...)` declarations in `src/db/schema.ts`, 35 generated drizzle-kit migrations in `src/db/drizzle/`, applied by drizzle's migrator which tracks `__drizzle_migrations`. **Zero `pgTable` anywhere.** `src/db/postgres/db-ops.ts` is a stub: one pure function computing a capability answer from four caller-supplied booleans, no `pg` client.

**A precedent for where vendor-specific things go** — `src/features/plugins/supabase-mcp/supabase-mcp-plugin.ts` states: *"The federation MECHANISM is core… A specific vendor's PRESET is a different kind of thing."*

**Multi-tenancy:** `content.db` is multi-workspace; `workspaceId` columns are pervasive. WordPress has no equivalent concept.

## PART C — A hard technical constraint you must design around

Moving drizzle-generic helpers from Tovu into `@jini-ai/infra` produced **604 TypeScript errors across 34 files.** Tovu resolves `Tovu/node_modules/drizzle-orm`; the symlinked Jini package resolves its own copy. **Both are version 0.44.7.** Drizzle's classes carry `protected config` (`Column`) and `private shouldInlineParams` (`SQL`), so TypeScript compares them **nominally**, not structurally:

```
Property 'config' is protected but type 'Column' is not a class derived from 'Column'
Types have separate declarations of a private property 'shouldInlineParams'
```

A tsconfig `paths` mapping made it worse (629 errors) — it cannot redirect imports inside the linked package's own `.d.ts`. `better-sqlite3` crosses fine because its `Database` is an `interface`.

An earlier adversarial review argued this may condemn only the **local symlink topology**, not published peer dependencies, and that `pnpm pack` into a throwaway consumer fixture is the decisive untested experiment. **Say whether your design depends on resolving this, and how.**

## PART D — What to design. Be concrete. Signatures, not prose.

### D1. The dual-dialect problem — this is the core question
Tovu must run on SQLite **and** PostgreSQL. The 63 table definitions must stay in Tovu (never Jini). Candidate strategies, none endorsed:
(a) hand-maintain 63 `pgTable` twins; (b) a schema DSL in Tovu that emits both dialects; (c) generate one dialect from the other at build time; (d) drop drizzle for the schema layer and use something dialect-neutral; (e) something else.

Design your recommendation concretely. Must cover: how migrations work in **both** dialects (SQLite's limited `ALTER TABLE` vs Postgres transactional DDL), how the two are kept from drifting, and **what CI check proves they have not drifted**. Name the type mappings that will actually bite (integer PKs/autoincrement, boolean, JSON vs JSONB, timestamps/timezones, FTS5 vs tsvector, `AUTOINCREMENT` vs `IDENTITY`, collation).

### D2. SQLite → PostgreSQL migration for a live site
The headline user journey. Same schema, same semantics, different engine. Design the flow end to end. It must be resumable, verifiable, and safe on a live site. State explicitly what happens to: the `__drizzle_migrations` table, FTS5 search indexes, `workspaceId` scoping, blob/asset columns, and **plugin-declared tables that are not in `schema.ts` at all**.

### D3. Plugin-declared tables on PostgreSQL
ADR-023's engine currently generates SQLite DDL from a declaration. What must change for Postgres? Where does dialect-specific DDL generation live given plugins must stay dialect-ignorant, and given the whole snapshot/journal/recovery apparatus is written against SQLite file semantics (whole-file snapshot, atomic rename) that **do not exist** for a remote Postgres?

### D4. The migration plugin(s)
The owner wants a first-party transfer plugin **and** an agent plugin. Design both surfaces:
- What tools does the agent plugin expose? Give the tool list with signatures.
- What is the human-approval gate, and what exactly is approved?
- How does "agent proposes a mapping, deterministic code executes" work mechanically here?
- What does the agent literally receive and return?

### D5. MySQL scope
Distinguish **MySQL as a read-only WordPress source** from **MySQL as a Tovu target**. Recommend a scope, and say what the minimum viable version is.

### D6. Placement
For every component you propose, say whether it belongs in `@jini-ai/infra`, `@jini-ai/cms`, a Jini package that does not exist yet, a Tovu plugin, or Tovu core — and why.

### D7. Bugs in YOUR OWN design
This is the point of the round. Where does your design break? Be specific and concrete — name the failure, the trigger, and the symptom. Generic risk language is worthless here. The owner explicitly wants bugs surfaced now rather than discovered later.

## PART E — Response format

1. A one-paragraph summary of your recommended architecture.
2. D1–D7 answered in order, with code/pseudocode signatures for D1, D2, D4.
3. A ranked slate: at least 2 whole-architecture options, ranking criteria, per-option trade-offs, your recommendation, and the single cheapest test that de-risks it.
4. What would change your mind.

This is Round 2 of 3. Round 3 will challenge your design with the other participants' designs, so make it specific enough to attack. Target 1200–2000 words. End with `<<SWARM_END>>`.

---

## PART F — All five Round 1 responses, verbatim

Read these; they contain the reasoning you are building on. Note that their "do not build PostgreSQL" conclusions are **superseded** by PART A.


### Primary — Claude Opus 5 (coordinator)

<<<BEGIN>>>
# Primary (Claude Opus 5) — Round 1 frozen first-pass

Written BEFORE dispatching peers and before reading any peer response. Withheld from the Round 1 packet.

## Q1 — What the system actually needs

**The load-bearing insight: the agent must produce a reviewable mapping document, not database writes.**

If "an agent migrates WordPress" means the agent issues SQL against the live database, this is unsafe and untestable at any scale. The correct shape is that the agent's *output* is a declarative artifact, and deterministic engine code executes it. That single decision drives the whole capability list:

1. **Source introspection, read-only** — connect to a foreign MySQL/Postgres/SQLite, enumerate tables, columns, types, keys, row counts, sample rows. Must be physically incapable of writing.
2. **A mapping document schema** — source table/column → target *domain entity/field*, plus named transforms. Human-reviewable, diffable, version-controllable. This is the unit the agent authors and a human approves.
3. **A deterministic executor** for that document. The agent never touches rows.
4. **Target writes go through domain ports, never raw SQL** — you migrate into "post"/"term"/"media"/"user" concepts, not into table names. This is what makes the target backend swappable and the importer safe.
5. **External-id correspondence table** (`wp_posts.ID` → Tovu entry id) so runs are idempotent and resumable, and so a second pass can fix up references.
6. **Dry-run against a scratch database** with a count/sample diff, mutating nothing live.
7. **Validation pass** — referential integrity, required fields, unresolved media, orphaned terms.
8. **Restore point before commit + atomic rollback.** Tovu already has exactly this in `db-ops` (online backup + atomic rename restore).

**What must never be left to the agent's judgement:** raw SQL against the live database, any DDL, credential handling, and the commit decision. The agent proposes; a human approves; deterministic code executes.

## Q2 — Where the boundary belongs

**Jini gets the mechanisms:** connection lifecycle, pragma/config application, backup/restore, the migration *runner* (not the migrations), foreign-source introspection, the mapping-document schema + executor, the correspondence table, batch/resume machinery, the validation framework.

**Tovu keeps the meaning:** the 64 table declarations, the 35 migrations, the domain ports, the repo adapters, and what a "post" is.

- *Too little moves* → every future product re-writes backup/restore, the migration runner, and the importer. Those are the subtle, expensive, easy-to-get-wrong parts. That is the whole reason to have an engine.
- *Too much moves* → Jini learns what a "post" is. Then it is not a reusable engine, it is Tovu with extra indirection, and every other product has to pretend to be a CMS.

## Q3 — Internal structure, and whether storage should mirror it

```
infra/db/
  core/        ports, types, pure helpers      (no driver, no ORM)
  sqlite/      driver
  postgres/    driver (only when a real consumer needs it)
  introspect/  foreign-source readers          (READ-ONLY by construction)
  migrate/     mapping schema, planner, executor, resume, validation
```

**Storage should mirror this only partially, and saying otherwise is the trap.** `core/` + `<provider>/` maps cleanly onto storage (local fs, S3, R2, Backblaze). `introspect/` and `migrate/` do **not**: migrating media is copying bytes and rewriting URLs, which is a fundamentally different problem shape from mapping relational rows. Mirror the core+drivers pattern; do not mirror the whole tree. A structure duplicated by symmetry rather than by need is how you get an empty `storage/introspect/` folder that confuses everyone for a year.

## Q4 — Is multi-backend worth building?

**Separate multi-SOURCE from multi-TARGET. They are not the same requirement and only one is justified.**

- **Multi-source is mandatory and already paid for.** The WordPress requirement *is* a foreign-MySQL-reader requirement. You cannot deliver it without introspecting a non-SQLite database. Build it.
- **Multi-target is speculative.** 64 `sqliteTable` declarations, zero `pgTable`, one developer, no user asking. Building a Postgres target now means maintaining two schema definitions and two migration chains forever, to serve nobody.

So: build the multi-source path now because the requirement forces it; keep the *target* side behind ports so Postgres remains possible; do not implement a Postgres target until a real consumer exists.

## Q5 — Failure modes at 12 months

1. **The mapping layer becomes a general-purpose ETL framework.** This is the most likely death. Every new source tempts one more generic feature. A solo developer cannot maintain an ETL framework and a CMS.
2. **The real WordPress pain is not schema mapping.** `wp_postmeta` holds PHP-serialized values; content holds shortcodes and Gutenberg block comments; ACF/theme fields are arbitrary. Schema mapping is maybe 10% of the work; content transformation is the rest. A design that treats this as a table-mapping problem will look done and deliver garbage content.
3. **Abstraction with one implementation is wrong by default.** `db/core` currently has exactly one driver behind it. Interfaces derived from a single case encode that case's accidents. The second real backend will require reshaping it anyway.
4. **Two-repo drift.** Local path-linking and published-package resolution behave differently; the design gets validated under one and shipped under the other.

## Confidence

0.72. Weakest points: I have not verified how much of WordPress's content transformation burden can be deferred to the agent rather than engine code, and I may be underrating multi-target if the developer's actual goal is selling Tovu to users who already run Postgres.
<<<END>>>


### Codex — gpt-5.6-sol (xhigh) [read both repos]

<<<BEGIN>>>
ACK_PACKET_RECEIVED CTX-jini-infra-db-2026-08-11 -- I received the packet and will work on it.

The first requirement needs splitting in two. “Support multiple backends” and “import WordPress through an agent” are largely independent. A WordPress importer can target SQLite only. Conversely, adding PostgreSQL does almost nothing to make WordPress migration safe.

## 1. Capabilities actually required

### Multiple database backends

A credible second backend requires behavioral equivalence, not merely a second connection driver:

- A canonical product data model with documented invariants: nullability, uniqueness, ownership, cascade behavior, ordering, timestamps, identifier formats, and transactional boundaries.
- A schema implementation and migration history for each backend. SQLite migrations cannot safely be translated to PostgreSQL at runtime.
- Repository adapters for every persistence operation whose SQL or semantics differ.
- Explicit capability detection for backend-specific features: online backup, restore, full-text search, JSON operations, advisory locks, transaction isolation, generated IDs, and concurrency behavior.
- A conformance suite that runs every repository contract against every supported backend.
- Backend-specific operational procedures: provisioning, credentials, pooling, migrations, backup, restore, health checks, observability, and disaster recovery.
- A support policy defining which backend/version combinations are actually tested.

“Driver-neutral ports” are useful but insufficient. If PostgreSQL exists only as a driver beneath SQLite-shaped assumptions, it is a checkbox backend that fails under concurrency or recovery.

### Agent-driven foreign migration

The safe unit is not “give an agent SQL access.” It is a constrained import system that an agent can plan and operate.

The agent should be handed:

- A read-only source connector with schema introspection and bounded sampling.
- A machine-readable target import contract: accepted entities, required fields, validation rules, relationships, ownership rules, and allowed transformations.
- A WordPress source model or discovery tools covering posts, pages, revisions, users, taxonomy, comments, metadata, attachments, plugin tables, serialized PHP values, and multisite prefixes.
- Deterministic transformation primitives: field mapping, HTML sanitization, slug normalization, date/time conversion, identity mapping, taxonomy conversion, media copying, URL rewriting, and reference resolution.
- A staging area separate from live target tables.
- A plan representation that records source selection, mappings, exclusions, conflicts, assumptions, and estimated counts.
- Dry-run output: counts, validation failures, unresolved references, unsupported plugin data, duplicate identities, media failures, and representative previews.
- Checkpoints, resumability, idempotency keys, provenance, and an append-only audit log.
- Reconciliation after execution: source-versus-target counts, checksums where meaningful, orphan detection, broken-link checks, and sampled semantic comparisons.
- A promotion mechanism that is atomic where possible and recoverable where it is not.
- A rollback path tested before promotion.

The conversational layer may gather intent—whether revisions should be kept, how authors map, whether comments are imported—but it should invoke typed migration operations rather than invent arbitrary SQL.

Never leave these to model judgment:

- Destructive source operations.
- Writing directly into production tables during discovery.
- Disabling constraints or silently dropping failed records.
- Password or credential transformation.
- User/tenant ownership assignment without explicit rules.
- Conflict policy, such as overwrite versus merge.
- Publication state changes.
- Sanitization and executable-content policy.
- Secret handling.
- Whether an apparently unknown plugin table is safe to ignore.
- Declaring success without deterministic reconciliation.

Human approval should be mandatory for the final plan and promotion unless the operator explicitly configured a narrow, preapproved policy. “Agent-driven” should mean agent-orchestrated, not agent-sovereign.

## 2. Jini–Tovu boundary

Jini should own mechanisms that remain coherent without knowing what a Tovu post, member, order, or workspace is:

- Driver lifecycle and transaction primitives.
- Capability reporting.
- Migration execution mechanics and locking.
- Backup/restore orchestration interfaces.
- Introspection and typed row streaming.
- Staging, checkpoints, provenance, reconciliation primitives, and migration-run state.
- Generic import-plan execution.
- Secret-safe connector interfaces.
- Conformance-test harnesses.
- SQLite and, only when genuinely supported, PostgreSQL/MySQL driver packages.

Tovu should own:

- Its 64-table logical model and backend schemas.
- All repository ports and product adapters.
- Workspace isolation and authorization invariants.
- WordPress-to-Tovu semantic mappings.
- Product validation, conflict policies, and promotion rules.
- Decisions about posts versus pages, users versus members, orders, newsletters, plugin data, and media attachment semantics.

A reusable `@jini-ai/wordpress` source reader could eventually exist, but it should expose WordPress entities and oddities—not decide how WordPress maps into Tovu.

Move too much into Jini and its “generic” APIs acquire parameters such as `workspaceId`, `postStatus`, and `themeAsset`; every future product either impersonates Tovu or forks the package. Leave too much in Tovu and each future product rebuilds dangerous plumbing such as checkpointing, audit trails, streaming, and recovery.

The current `@jini-ai/sqlite` daemon store should remain separate. Merging it with content persistence because both use SQLite would confuse a product database with an internal service database and couple their lifecycle, migrations, and recovery.

## 3. Reusable internal structure

I would expose narrow subpaths rather than a root facade:

- `db/core` — database capabilities, transaction/connection contracts, errors, identifiers, and pure helpers.
- `db/migrate` — migration manifests, locking, checksums, execution, status, and compatibility checks.
- `db/introspect` — portable schema metadata and bounded data profiling.
- `db/import` — plans, staged batches, checkpoints, provenance, validation results, reconciliation, promotion contracts, and run state.
- `db/testing` — backend conformance suites and fault-injection helpers.
- `db/sqlite` — SQLite driver, migrator integration, backup/restore behavior, WAL handling, and SQLite capability implementation.
- Later, `db/postgres` and `db/mysql` — only when backed by schemas, adapters, operations, and CI—not speculative stubs.

Foreign-system semantics should live separately, for example `source/wordpress`, because WordPress is not a database backend. MySQL is transport; WordPress is the source domain.

Storage can mirror the lifecycle concepts—driver, capabilities, import, staging, provenance, verification, promotion—but should not mechanically copy the database API. Media has byte streams, hashes, MIME validation, transcoding, thumbnails, resumable transfer, deduplication, and object-store consistency. Database transactions and schema migrations do not generalize to video processing. Share vocabulary and orchestration patterns, not an inheritance hierarchy.

## 4. Should multiple backends be built now?

The case for PostgreSQL is real: better concurrent writes, managed hosting, operational tooling, larger deployments, and removal of single-file constraints. Supporting it can expose hidden SQLite assumptions early and make Jini more reusable.

The case against is stronger today. One developer would be committing to duplicate schemas, 35 migrations or a new baseline strategy, roughly 19 adapters, operational documentation, and permanent cross-backend testing. The 64 `sqliteTable` declarations are evidence that the product is not currently backend-neutral. Optional peers and abstract ports do not pay that cost.

I would not build PostgreSQL yet. I would:

1. Keep SQLite as the only supported Tovu backend.
2. Extract backend-independent lifecycle and import primitives into Jini.
3. Build one production-quality, agent-orchestrated WordPress-to-Tovu SQLite migration.
4. Add repository contract tests and remove accidental SQLite leakage from domain code.
5. Treat PostgreSQL as a separate product milestone with a real adopter.

Alternatives are:

- SQLite only: lowest maintenance, honest support boundary.
- SQLite plus PostgreSQL: justified by a concrete deployment requiring concurrency or managed infrastructure.
- PostgreSQL only after a cutover: less permanent duplication, but disruptive to self-hosting.
- A lowest-common-denominator SQL abstraction: superficially cheap and usually the worst option, because it sacrifices backend strengths while still retaining semantic differences.

I would change position if there were a paying deployment blocked by SQLite, demonstrated write-contention or scale failures, or a second product ready to use PostgreSQL immediately.

## 5. Likely regrets and failure modes

The most likely unmaintainable outcome is a solo developer creating many elegant interfaces—drivers, dialects, repositories, import DSLs, storage analogues—while only one implementation exercises them. Those interfaces will encode guesses, then every real migration will bypass them with escape hatches.

Other likely failures:

- SQLite and PostgreSQL schemas silently diverge after several releases.
- Tests prove CRUD equivalence but miss locking, restore, and constraint differences.
- Import reruns duplicate media or corrupt cross-record references.
- The agent reports success after importing easy posts while silently omitting plugin metadata and serialized values.
- An “atomic” migration is atomic for rows but not for copied media.
- Generic backup APIs promise guarantees that object stores or remote PostgreSQL cannot provide.
- Package extraction increases release coordination even with local file links; Tovu changes require synchronized edits across two repositories.
- Conversational flexibility becomes nondeterminism, making incidents impossible to reproduce.

In twelve months, I expect the first WordPress migration to reveal that semantic mapping and verification dominate the work—not SQL dialect abstraction. Evidence that would refute this is repeated imports sharing most transformations across multiple target products, or real deployments successfully exercising two backends under the same conformance suite. Until then, optimize for one trustworthy migration path and an honest SQLite product, not theoretical portability.

<<SWARM_END>>
<<<END>>>


### Gemini 3.6 Flash (High) [packet-only]

<<<BEGIN>>>
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
<<<END>>>


### Gemini 3.1 Pro (High) [packet-only]

<<<BEGIN>>>
ACK_PACKET_RECEIVED CTX-jini-infra-db-2026-08-11 -- I received the packet and will work on it.

You are a solo developer trying to build a product (Tovu) while simultaneously extracting a generalized framework (Jini) underneath it, with dreams of multi-database support and AI-driven migrations. This is a classic architectural tightrope. If you get the boundaries right, you get immense leverage. If you get them wrong, you will drown in abstraction layers that serve no actual users. 

Here is the unvarnished reality of what you are proposing, broken down from first principles.

### 1. What a System Needs for Multi-Backend and Agent-Driven Migration

**For Multi-Backend Support:**
To truly support both SQLite and Postgres, you need more than just abstracting the connection string. You need:
1. **Dialect-agnostic schemas or parallel schemas.** Drizzle requires you to declare `sqliteTable` or `pgTable`. You cannot magically use the same declaration for both without severe compromises or writing a custom compilation step.
2. **Abstracted migration pipelines.** SQLite often requires table-rebuilds for DDL changes (since `ALTER TABLE` is limited), while Postgres supports rich, transactional DDL. 
3. **Lowest-common-denominator feature sets, or branching logic.** If you want to use Postgres's `JSONB` or PostGIS, or SQLite's `FTS5`, you have to write divergent code paths at the repository layer.

**For Agent-Driven Migration (WordPress MySQL -> Tovu):**
An agent must **never** be given raw database credentials or the ability to emit raw `INSERT` statements into Tovu's database. If you let an LLM write raw SQL to migrate data, it will inevitably violate subtle business constraints, orphan foreign keys, and subtly corrupt your multi-tenant boundaries.

To do this safely, you need:
1. **A highly constrained Ingestion API (Ports).** The agent must only be allowed to call strict business-layer functions like `createPost(tenantId, payload)` or `importUser(data)`. These functions must enforce all application invariants.
2. **A clear Read/Map/Write pipeline.** 
   - *Read:* A deterministic tool extracts the WordPress schema and data.
   - *Map:* The agent is given the source shape and asked to map it to the Tovu Ingestion API shape.
   - *Write:* The system executes the mapping.
Do not ask the agent to "migrate the database." Ask the agent to "map this WordPress `wp_posts` row to a Tovu `CreatePost` payload."

### 2. The Boundary Between Jini (Reusable) and Tovu (Product)

The boundary is simple: **Jini owns mechanics; Tovu owns meaning.**

**What belongs in Jini (`@jini-ai/infra/db`):**
- Connection lifecycle, pooling, retry logic, and exponential backoffs.
- Driver wrapping (e.g., initializing `better-sqlite3`, setting optimal pragmas like `WAL` mode and synchronous settings).
- Operational utilities (the `db-ops.ts` logic for online backups, atomic restores, and WAL sidecar cleanup).
- A generic migration *runner* interface, but **not** the migrations themselves.

**What belongs in Tovu:**
- The `schema.ts` file. All 64 tables belong strictly in the product.
- The 35 Drizzle migration `.sql` files.
- The `*-repo.sqlite.ts` adapters.

**If you draw the line wrong:**
- *If Tovu's schema leaks into Jini:* Jini becomes a Tovu-specific monolith. The next product you build on Jini will inherit 64 useless CMS tables about "newsletters" and "store orders."
- *If Jini's mechanics leak into Tovu:* When you build your next app, you will copy-paste 20 files of SQLite WAL management and connection bootstrapping, defeating the point of a shared infra layer.

### 3. Internal Structure of the Reusable Database Layer

The internal structure of `@jini-ai/infra` should look like this:

- `@jini-ai/infra/db/core`: Contains driver-neutral interfaces, custom error classes (`UniqueConstraintViolation`, `ConnectionTimeout`), and generic types. **Zero runtime dependencies.**
- `@jini-ai/infra/db/sqlite`: The concrete implementation of the core interfaces using `better-sqlite3`. Owns SQLite-specific pragma tuning and backup ops.
- `@jini-ai/infra/db/postgres`: The concrete implementation using `postgres.js` or `pg`. (If you build it).

**Does this mirror well to Storage (Video/Images)?**
Yes, this mirroring is sound. 
- `storage/core` defines `StorageProvider { put(), get(), delete(), getSignedUrl() }`.
- `storage/local` implements it for the local file system.
- `storage/s3` implements it for AWS/Cloudflare R2.
*However, the mistake to avoid:* Do not let product-specific logic leak into the storage layer. Image resizing, EXIF extraction, or video transcoding belongs in Tovu's domain logic (or a dedicated `@jini-ai/media` package), not in the base storage infrastructure. The infra layer just moves bytes.

### 4. Is Multi-Backend Support Worth Building?

**No. Not right now.**

You are a solo developer. You currently have 64 `sqliteTable` declarations, 35 SQLite-specific migrations, and an ~11MB live database. You have *zero* Postgres tables. 

**The argument against it (and my recommendation):**
Building multi-backend support right now is the definition of premature generalization. To support Postgres, you will have to rewrite or duplicate your entire 64-table schema. You will lose the ability to use SQLite's powerful full-text search (`FTS5`) without writing completely separate Postgres `tsvector` logic. You will spend weeks building a pristine, dialect-agnostic ORM abstraction, and in that time, you will ship zero features for your actual CMS users. 

SQLite is incredibly capable. It can handle gigabytes of data and tens of thousands of concurrent reads. For a self-hosted CMS, SQLite is the gold standard (look at Ghost or PocketBase) because it removes the operational burden of running a separate database daemon. 

**The argument for it:**
The only valid reason to build Postgres support right now is if you are pivoting Tovu from a "self-hosted CMS" into a "massively scaled cloud SaaS" where the database exceeds a single node's I/O limits, or if enterprise customers explicitly refuse to adopt software that doesn't run on their managed RDS instances. 

**What you should do instead:**
Keep the *ports* in Tovu clean. Your domain logic should only talk to interfaces (`MediaRepo`, `UserRepo`). Let the implementation of those ports (`media-repo.sqlite.ts`) be unashamedly, purely SQLite. Extract the driver setup and WAL tuning to Jini. Do not write a single line of Postgres schema until someone actually pays you (or creates a highly compelling open-source issue) to do so.

### 5. Failure Modes: What Breaks in 12 Months?

If you proceed down the path of building a fully abstract, multi-database Jini infrastructure while simultaneously building Tovu, here is how you will fail in the next 12 months:

1. **The Lowest Common Denominator Trap:** In an attempt to make Jini support both SQLite and Postgres perfectly, you will limit Tovu to only the features both databases share. Your application will perform worse and be harder to query because you banned yourself from using database-specific superpowers.
2. **The "Agent-Corrupted DB" Disaster:** You will try to be clever and give the AI agent a tool called `executeSql(query)`. The agent will successfully migrate a WordPress site, but it will subtly mess up a polymorphic relation or a tenant ID. Three months later, a tenant will see another tenant's data, or the app will crash on unexpected nulls. The migration must happen through strongly-typed API boundaries, never raw SQL.
3. **Solo Developer Burnout:** You will spend 4 months perfecting the `@jini-ai/infra/db` package. It will be a masterclass in TypeScript generics and interface design. But Tovu's actual product features—the things users care about—will stagnate. You will have built a beautiful engine for a car that has no wheels.

**What would change my mind:**
If you provide evidence that your current ~11MB SQLite file is locking under write-contention from concurrent users, or if you have a hard requirement for geospatial queries (`PostGIS`) that SQLite's spatial extensions cannot satisfy. Absent that, stick to SQLite, keep the schema in Tovu, extract only the mechanical driver wrapper to Jini, and constrain your agents to high-level APIs. 

<<SWARM_END>>
<<<END>>>


### Claude Sonnet 5 subagent [read both repos]

<<<BEGIN>>>
ACK_PACKET_RECEIVED CTX-jini-infra-db-2026-08-11 -- I received the packet and will work on it.

> **Recovery note (Coordinator):** this participant went idle without delivering. Response recovered
> via SendMessage. It confirmed it read files under both repos and cited them; position is grounded,
> not packet-only. It also caught a factual error in the packet — see the correction at the bottom.

## What I found in the actual code

`@jini-ai/infra` today has exactly one real capability: `db/core/ports.ts` defines `DbOpsPort` (capability discovery, restore-point capture, restore-from-artifact) and `db/sqlite/db-ops.ts` implements it against `better-sqlite3` — online backup, atomic rename-swap, WAL/SHM sidecar cleanup. It's wired into Tovu today at `src/db/sqlite/db-ops.ts`, which wraps the infra class only to widen its `RestoreCapability` union (Tovu's port also admits `"unavailable"`/`"external"`). That's the *only* consumer of `@jini-ai/infra` in Tovu right now — I grepped for it.

The Postgres side, `src/db/postgres/db-ops.ts`, is a pure function, `evaluatePostgresRestoreCapability`, that computes a capability answer from four *booleans a caller supplies* (`pgDumpBinaryPath`, `credentialsPresent`, etc.). Its own docstring says "no actual `pg_dump`/blue-green execution." There is no `pg` client, no Postgres schema, nowhere in either repo. This is a stub with one caller, not a backend.

Meanwhile domain repo adapters (`src/db/sqlite/media-repo.sqlite.ts`) implement ports defined not in infra but in `@jini-ai/cms/media` — so the codebase has already drawn one boundary line for me: cross-cutting DB *mechanics* (backup/restore) live in `infra`; domain *shape* (media, posts) lives in the CMS package; Tovu-only shape (commerce, newsletters, per the current git status) stays in Tovu. That's a real precedent, not a hypothetical, and it should anchor the answer below.

## 1. What agent-driven migration actually needs

Separate two things the ask conflates: "Tovu supports more than one backend" and "an agent can pull a WordPress site into Tovu." They share the word "database" and nothing else. Migration needs:

- **A narrow, read-only source connector** to WordPress's MySQL — introspect `wp_posts`, `wp_postmeta`, `wp_users`, `wp_terms`, `wp_term_relationships`. This is not "MySQL support for Tovu"; Tovu never runs on MySQL. It's a one-directional reader.
- **A declared, human-reviewable mapping spec**: `wp_post_type → Tovu content type`, `wp_users → members/users`, taxonomy tree → categories/tags, serialized-PHP `wp_postmeta` blobs → typed fields. This must be data the agent is *handed*, not something it infers per-row. Ambiguous cases (a custom post type with no obvious Tovu analog, HTML entity/shortcode content) need a human decision recorded once, not re-litigated by the agent on every run.
- **Writes through existing domain ports, never raw SQL.** Tovu already enforces this discipline for everything else — 19 `*-repo.sqlite.ts` adapters sit behind ports, domain code never touches SQLite directly. An agent-driven importer that INSERTs directly into `content.db` bypasses every invariant (uniqueness, workspace scoping) those adapters exist to enforce. This is the single most important guardrail: the agent gets a `write` capability that is already-validated domain operations, never a SQL execution tool.
- **Restore-point-before, dry-run-first, resumable.** `DbOpsPort.captureRestorePoint` already exists and is exactly the right primitive — capture before the agent touches anything, let it run in a dry-run/diff mode first, checkpoint so a crash mid-import doesn't require starting over or leaves partial, undetectable state.
- **Workspace scoping threaded through by the tool, not by the agent's judgment.** `content.db` is multi-tenant (per the packet, confirmed by schema.ts's pervasive `workspaceId` columns). WordPress has no concept of "workspace." If the importer doesn't hard-code which workspace every row belongs to, an agent can silently attach an entire migrated site to the wrong tenant, and nothing SQL-level will complain since it's a plain foreign key, not a security boundary.

What must never be agent judgment: taxonomy/type mapping decisions, whether to skip vs. transform malformed rows, and whether a restore point exists before writes begin. Those are policy, and policy goes in the tool's contract, not the prompt.

## 2. Jini/Tovu boundary

**Jini-worthy:** driver-neutral ports and driver mechanics that have zero knowledge of a specific schema — exactly what `db-ops.ts` already is (injected `readWatermark`, no import of Tovu's tables). A generic MySQL *schema introspector* (list tables/columns/types from an arbitrary connection) is also genuinely reusable — any future migration into any future Jini-based product needs "look at what's in this foreign database," independent of what WordPress specifically means.

**Tovu-only, and would poison Jini if moved in:** the WordPress→Tovu field mapping. It's the intersection of two product-specific schemas (WordPress's and Tovu's own 63-table `schema.ts`), and it's useless to anything that isn't Tovu. If this lands in `@jini-ai/infra`, the package's own "zero runtime deps, driver-isolation-guarded" premise (enforced by `scripts/check-driver-isolation.ts`, per the ports.ts docstring) breaks for every other consumer — a hypothetical third product now drags in WordPress-mapping code it never asked for.

Drawn wrong toward Jini: bloats the reusable package with single-consumer, single-use code, and a MySQL client dependency for a capability nothing else uses. Drawn wrong toward Tovu: strands the one piece with genuine reuse value (a working second-driver + real ETL orchestration) in the product repo, defeating the developer's stated motive.

## 3. Structure, and should storage mirror it

Keep `db/core` (ports) / `db/<driver>` (mechanics) — it's proven. Add migration as a **separate namespace**, not nested under `db/`: `migrate/core` (checkpoint/resume, dry-run diffing — generic orchestration) and product-owned source connectors (WordPress mapping) staying in Tovu. Migration operates on two databases at once (source + sink); folding it into `db/` would break `db/core`'s "zero deps" guarantee, since a source connector needs a driver dependency unrelated to what Tovu itself runs on.

Storage should mirror the **principle** — injected host facts, isolated driver folders, an architectural guard test — not the **port shape**. `DbOpsPort`'s methods (`captureRestorePoint`, `restoreFromArtifact`) are backup/restore-shaped; storage's hard problems (streaming, content-addressing, CDN URLs, transform pipelines — already partly modeled by `assetRenditions`/`transformDefinitions` in `schema.ts` and `@jini-ai/cms/media`) are a different shape. Cargo-culting the method names would force-fit a mismatch.

## 4. Is multi-backend worth it?

Against: 63 SQLite tables, zero Postgres tables, one developer, and the existing Postgres file is a stub whose own comment admits "adapter deferred." Building a real second driver plus dual-dialect Drizzle config against zero current demand is engineering for a market of one hypothetical migration. For: the WordPress requirement means *some* non-SQLite code is coming regardless — but that's a source-connector, not "Tovu runs on Postgres." My recommendation: keep `DbOpsPort` (already paid for, and it forced the useful watermark-injection decoupling) but do not build a second real driver until an actual second Jini product needs it. Evidence that would flip me: a concrete second product on Jini with a live Postgres requirement, not "if somebody switches."

## 5. 12-month failure modes

Most likely: chasing "reusability," the developer builds `db/mysql` as a peer to `db/sqlite`, but the WordPress migration turns out to be 80% mapping logic (serialized meta, taxonomy trees, shortcode conversion) that lives entirely outside driver abstraction — so the generic work doesn't shorten the real task, and `@jini-ai/infra` ends up with two driver folders with no real caller, bit-rotting under dependency bumps with no test pressure. Second: time pressure makes the migration ship as a script that writes `content.db` directly, bypassing the port discipline every other adapter follows — and becomes the template copied for the *next* migration. Third: workspace scoping gets silently dropped inside migration code specifically, since WordPress has no such concept, and content only visibly bleeds across tenants once a second workspace exists to notice.

<<SWARM_END>>

---

## Coordinator correction, verified

This participant reported **63** `sqliteTable(` declarations, not the 64 stated in the Round 1 packet. Verified:

```
lines containing "sqliteTable":  64
actual "sqliteTable(" calls:     63
line 2: import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
```

The packet's figure came from `grep -c`, which counted the import line. **63 is correct**; the erroneous 64 was sent to all four participants and is carried into Round 2 as an explicit correction.

Its `@jini-ai/cms/media` claim also verified: `media-repo.sqlite.ts` imports its port types from `@jini-ai/cms/media` (line 19) and `@jini-ai/cms/core` (line 6), and `@jini-ai/infra`'s `db/core/ports.ts` contains no media concepts. The three-way boundary precedent is real.
<<<END>>>
