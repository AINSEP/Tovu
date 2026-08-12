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