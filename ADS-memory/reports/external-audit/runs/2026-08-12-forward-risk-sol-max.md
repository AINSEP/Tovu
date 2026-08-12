ACK_PACKET_RECEIVED AUD-forward-risk-2026-08-12 -- I received the packet and will work on it.

I’m using the `understand-diff` skill because this is a forward-compatibility audit of a defined commit set. I’ll keep the analysis read-only and use the project’s knowledge graph first for code discovery.

The graph MCP methods are not exposed in this session, so I’m falling back to the repository’s local knowledge-graph artifact and targeted Git inspection, as the project instructions permit. The skill’s optional dashboard-overlay write is being skipped because this packet expressly requires read-only analysis.

ACK_PACKET_RECEIVED AUD-forward-risk-2026-08-12 -- I received the packet and will work on it.

None of the four deferred items has been made impossible. Two are materially harder than they needed to be; two are easier because useful boundaries already exist.

## 1. Live SQLite → PostgreSQL migration — HARDER

The generated PostgreSQL schema is useful groundwork, but its mechanical type choices are already becoming migration policy. Every `SQLiteInteger` becomes PostgreSQL `integer`, and every `SQLiteText` remains `text` ([generate-postgres-schema.ts:62](/Users/la/Programming/Tovu/development/scripts/generate-postgres-schema.ts:62), [generate-postgres-schema.ts:67](/Users/la/Programming/Tovu/development/scripts/generate-postgres-schema.ts:67)). That is unsafe for append-only identities such as analytics events, tool attempts, revisions, and especially the global write watermark ([schema.postgres.ts:39](/Users/la/Programming/Tovu/src/db/schema.postgres.ts:39), [schema.postgres.ts:198](/Users/la/Programming/Tovu/src/db/schema.postgres.ts:198)).

The more serious operational problem is consistency. The migration state machine names a quiescing phase, but the current operation lock is an in-process lock around the migration operation; it does not stop ordinary repository writes ([operation-lock.ts:53](/Users/la/Programming/Tovu/src/core/gated-mutations/operation-lock.ts:53)). The write watermark is explicitly opt-in, while normal post save and delete paths do not advance it ([watermark.ts:11](/Users/la/Programming/Tovu/src/core/gated-mutations/watermark.ts:11), [repo.sqlite.ts:98](/Users/la/Programming/Tovu/src/features/post/repo.sqlite.ts:98)). A copier that treats that watermark as a complete change boundary can silently lose a post updated between bulk copy and cutover.

Changing course before PostgreSQL hosts real data is moderate work: correct the generated types, define conversion rules, add PostgreSQL repository/runtime adapters, copy in dependency order, preserve IDs, reseed identities, and rebuild derived search data. After deployment, widening large indexed tables and converting timestamps can require table/index rewrites and operational downtime. A practical first version should use a consistent SQLite backup followed by a short instance-wide write pause for final reconciliation and cutover. Zero-downtime migration needs real CDC or comprehensive dual writes, neither of which exists.

## 2. Conversational WordPress MySQL importer — EASIER

Jini’s boundary helps. Its core database package is driver-neutral and intentionally too narrow to expose arbitrary queries ([ports.ts:1](/Users/la/Programming/Jini/packages/infra/src/db/core/ports.ts:1), [ports.ts:57](/Users/la/Programming/Jini/packages/infra/src/db/core/ports.ts:57)); the SQLite entry point returns a raw driver while leaving schema, migrations, and repositories to the host ([open.ts:17](/Users/la/Programming/Jini/packages/infra/src/db/sqlite/open.ts:17)). Optional-driver isolation is enforced rather than merely documented ([check-driver-isolation.ts:166](/Users/la/Programming/Jini/packages/infra/scripts/check-driver-isolation.ts:166)).

Tovu also has useful precedents: bounded database predicates reject raw SQL ([tier3-browser.ts:78](/Users/la/Programming/Tovu/src/features/database/tier3-browser.ts:78)), and the Supabase integration excludes SQL-execution tools and forces its upstream connection into read-only mode ([supabase-mcp-plugin.ts:82](/Users/la/Programming/Tovu/src/features/plugins/supabase-mcp/supabase-mcp-plugin.ts:82), [supabase-mcp-plugin.ts:142](/Users/la/Programming/Tovu/src/features/plugins/supabase-mcp/supabase-mcp-plugin.ts:142)).

The importer should therefore be a fixed, read-only MySQL source adapter exposing allowlisted reads—not a generic query port—and an immutable mapping plan validated and executed through Tovu application services. The agent may propose that plan but never receive a connection or SQL execution capability. Cost is moderate: source readers, normalization rules, mapping-plan validation/hash, preview counts, deterministic application, and resumability. No shipped abstraction needs unwinding.

## 3. FTS5 → tsvector/GIN search adapter — EASIER

The search boundary is already correctly shaped. `PostSearchPort` is dialect-neutral, including a deliberately loose “higher is better” rank contract ([search.ts:43](/Users/la/Programming/Tovu/src/features/post/search.ts:43), [search.ts:52](/Users/la/Programming/Tovu/src/features/post/search.ts:52)). SQLite-specific `MATCH`, `bm25`, snippets, projection maintenance, and backfill remain in the SQLite adapter ([search-index.sqlite.ts:107](/Users/la/Programming/Tovu/src/features/post/search-index.sqlite.ts:107), [search-index.sqlite.ts:194](/Users/la/Programming/Tovu/src/features/post/search-index.sqlite.ts:194)).

The generator deliberately excludes the external-content FTS table and directs PostgreSQL toward a hand-authored tsvector/GIN implementation ([generate-postgres-schema.ts:30](/Users/la/Programming/Tovu/development/scripts/generate-postgres-schema.ts:30)). That prevents SQLite shadow-table machinery from leaking into PostgreSQL.

The required work is bounded: a PostgreSQL migration for the projection/tsvector column and GIN index, a PostgreSQL implementation of `PostSearchPort`, and write/backfill integration. Ranking and highlighting will differ, but callers do not depend on SQLite’s exact scoring. Search should be rebuilt after migration rather than copied. Nothing needs to be undone.

## 4. PostgreSQL DDL for plugin-declared tables — HARDER

The declaration grammar and 63-byte PostgreSQL identifier check are reusable ([data-module.ts:255](/Users/la/Programming/Tovu/src/features/plugins/data-module.ts:255), [data-module.ts:330](/Users/la/Programming/Tovu/src/features/plugins/data-module.ts:330)). Almost everything below them is SQLite execution policy: raw `better-sqlite3`, `sqlite_master`, PRAGMAs, SQLite type spelling, synchronous transactions, disk-headroom checks, and a `dbPath`-based whole-file snapshot ([data-module.ts:246](/Users/la/Programming/Tovu/src/features/plugins/data-module.ts:246), [data-module.ts:420](/Users/la/Programming/Tovu/src/features/plugins/data-module.ts:420), [data-module.ts:448](/Users/la/Programming/Tovu/src/features/plugins/data-module.ts:448), [data-module.ts:864](/Users/la/Programming/Tovu/src/features/plugins/data-module.ts:864)). Snapshot and recovery explicitly operate on the complete SQLite database file ([snapshot.ts:1](/Users/la/Programming/Tovu/src/features/plugins/snapshot.ts:1), [restore.ts:33](/Users/la/Programming/Tovu/src/features/plugins/restore.ts:33)).

That does not block PostgreSQL, but there is no backend strategy seam at the public API. Preserve the declaration validation and naming code, then introduce a provisioner interface with separate SQLite and PostgreSQL executors. PostgreSQL needs async catalog inspection, `BYTEA` mapping, transactional DDL, and an advisory lock; it does not need file snapshots or disk checks. This is mostly a new executor plus changing plugin installers to depend on the provisioner, not a rewrite of the working SQLite engine.

## The five suspicions

1. **`SQLiteInteger` → `integer`: confirmed; the justification is refuted.** “No value currently exceeds 2³¹” is not a lifetime invariant for append-only identities or a monotonic watermark. At 2,147,483,647, PostgreSQL identity allocation or migration of a larger SQLite row fails. Drizzle already supports PostgreSQL `bigint` with `mode: "number"`, so avoiding JavaScript `bigint` did not require choosing `integer` ([bigint.d.ts:6](/Users/la/Programming/Tovu/node_modules/drizzle-orm/pg-core/columns/bigint.d.ts:6)). Widen high-volume IDs and counters now; also reseed every identity after preserving imported IDs.

2. **Text timestamps: confirmed as accumulating risk, not immediate breakage.** Canonical UTC `toISOString()` values sort correctly lexically, so current text range queries and B-tree indexes work ([database-journal-repo.ts:70](/Users/la/Programming/Tovu/src/db/sqlite/database-journal-repo.ts:70)). PostgreSQL date arithmetic requires casts, however, and casted predicates will not automatically use ordinary text indexes. Conversion to `timestamptz` is lossless for valid offset-bearing strings, but invalid or WordPress-style naive local timestamps require a timezone policy and can be genuinely ambiguous. Drizzle supports timezone-aware timestamps while retaining string-mode application values ([timestamp.d.ts:34](/Users/la/Programming/Tovu/node_modules/drizzle-orm/pg-core/columns/timestamp.d.ts:34)). This remains cheaply reversible only until imported or user-written noncanonical data accumulates.

3. **Seeded-owner-only authorization: confirmed operationally, refuted architecturally.** The current factory grants all instance permissions solely to the seeded owner and ignores distinctions between permission names ([composition.ts:78](/Users/la/Programming/Tovu/src/core/gated-mutations/composition.ts:78)). That denies additional operators. But the gateway receives an injectable `InstanceAuthorizeFn` containing both principal and permission, and routes instance operations centrally ([ports.ts:36](/Users/la/Programming/Tovu/src/core/gated-mutations/ports.ts:36), [gateway.ts:120](/Users/la/Programming/Tovu/src/core/gated-mutations/gateway.ts:120)). Real RBAC requires policy storage, an evaluator, and replacing two composition-root bindings—not changing migration/restore call sites.

4. **Whole-file plugin safety: confirmed, but it has not blocked PostgreSQL.** The reusable seam is one layer too low: declarations are portable, while reconciliation, execution, and recovery are interleaved with SQLite. Extracting a provisioner is necessary; trying to make snapshot/rename behavior generic would be the wrong abstraction. PostgreSQL transactional DDL actually simplifies crash atomicity.

5. **Generator rejection: mostly refuted as a forward risk.** It rejects unknown, non-empty semantics rather than silently dropping them ([generate-postgres-schema.ts:127](/Users/la/Programming/Tovu/development/scripts/generate-postgres-schema.ts:127)). That discipline already prevented lost checks, foreign keys, and indexes. FTS is raw SQL and deliberately outside introspection. Legitimate PostgreSQL-only constructs should enter through explicit overrides or hand-authored dialect migrations; weakening the failure would make migration less safe.

## What to fix first

1. Create an executable semantic migration manifest and test it with a real SQLite-to-PostgreSQL fixture. It should identify 64-bit IDs, UTC timestamps, JSON/text distinctions, identity reseeding, copy transforms, plugin tables, and derived objects that must be rebuilt. Make both schema generation and migration verification consume it. This is the highest-leverage action because it prevents a schema that compiles yet rejects row 2,147,483,648 or misinterprets an imported local timestamp.

2. Implement a genuine instance-wide write-quiescence contract before calling the migration “live.” Do not treat the current lock or watermark as complete coverage.

3. Extract the plugin provisioner boundary, retaining the existing SQLite strategy intact.

4. Build the MySQL importer as plan/review/apply with fixed source reads.

5. Add PostgreSQL search last and rebuild it from canonical post data.

Leave the strict generator, FTS exclusion, search port, instance-authorization port, Jini driver isolation, and 63-byte identifier guard alone. No deferred item should be dropped. What should be dropped, unless CDC is explicitly funded, is any implied promise of uninterrupted migration; a short controlled write pause is much safer than a superficially “live” cutover that can lose edits.

<<SWARM_END>>