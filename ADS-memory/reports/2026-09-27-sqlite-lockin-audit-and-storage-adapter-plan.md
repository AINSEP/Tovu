# SQLite lock-in audit and storage-adapter plan (Postgres / PGlite / Supabase)

- Date: 2026-09-27. Branch `restructure/apps-website-phased`. Read-only audit; no source edited.
- Ask (owner): "The assistant chat should have some kind of adapter so SQLite is not locked in. What if we use
  Postgres later? Do we need a redesign to take SQLite out so we can use PGlite or Supabase Postgres?"
- Governing docs read: `reports/architecture/ADR-015-drizzle-sql-data-layer-behind-ports.md` (ACCEPTED; Drizzle
  behind repo ports, Postgres as the planned second adapter), `reports/architecture/postgres-supabase-database-backend-spec.md`
  (2026-07-30 scoping spec, still the most complete Postgres design), `governance/adrs/GOV-ADR-001` (watermark
  chokepoint), `reports/2026-09-27-assistant-db-transfer-plan.md`, `development/todos.md` (PGlite parked, commit
  `7af0cfc4b`). No ADR covers PGlite, chat storage portability, or schema-per-site runtime. This report updates the
  July spec with what changed since then and adds chat, PGlite and the transaction model, which that spec did not cover.

All paths below are under `apps/website/src/` unless they start with another root. Counts are grep counts over
non-test `.ts` files, then classified by reading the files. They are call-site estimates, not facts about behavior.

---

## 0. Short answer

- **No full redesign is needed. The architecture is mostly right. Four specific things block Postgres.** Almost
  every repository already sits behind an async port with a second (in-memory) implementation: 54 `*.sqlite.ts`
  adapters, 33 `*.memory.ts` twins, and ports like `PostRepoPort` (`features/post/post.ts:244`) that return Promises.
  Chat already has an async port (`ChatHistoryStore`, `node_modules/@jini-ai/chat/src/core/persistence/ports.ts:87`).
  Jini already has driver-neutral DB ports with an enforced driver-isolation rule (`@jini-ai/infra/src/db/core/ports.ts:1-20`).
- **The four real blockers:**
  1. **Transactions are ambient and tied to one SQLite connection.** `transaction(fn)` takes no transaction handle,
     and the repos inside `fn` keep using the shared handle (`features/post/repo.sqlite.ts:459-470`,
     `features/trash/repo.sqlite.ts:238-251`; 40 `BEGIN IMMEDIATE` sites across 21 files). On a Postgres pool the
     inner writes run outside the transaction, so atomicity is silently lost. On PGlite they deadlock, because PGlite
     holds a mutex for the whole transaction and a plain `db.query` waits on it (PGlite `base.ts`, via context7).
  2. **Some code depends on synchronous SQLite.** Drizzle's better-sqlite3 API is synchronous: 384 `.all()/.get()/.run()`
     terminals and 26 `db.transaction((tx) => …)` callbacks in the adapters. Postgres drivers are async-only. Three
     places are sync *by design* and need a contract change: `ChatRunLedger` (`assistant/persistence/run-ledger.ts:41-51`;
     its header, lines 17-18, says correctness relies on "no `await` between check and write"), the watermark stamp
     (`platform/db/sqlite/watermark.ts:50-80`, 42 references, the GOV-ADR-001 chokepoint), and
     `WriteServiceDeps.stampWatermark` (`features/taxonomy/repo.sqlite.ts:583-592`).
  3. **File-level operations have no Postgres equivalent yet:** restore points, plugin snapshots, site duplicate and
     plugin-table DDL (`.backup()`, `VACUUM INTO`, `wal_checkpoint`, `PRAGMA table_info`, `sqlite_master`).
  4. **No Postgres runtime exists at all.** There is no driver dependency, no Postgres migrations and no composition root.
- **Size:** a large but incremental refactor, about 6-8 weeks of agent work in narrow slices. It is not a rewrite,
  and SQLite keeps working throughout.
- **First slice (agrees with the brief, with one change):** first build a small storage kernel (Postgres + PGlite
  drivers, an explicit transaction context, and a contract-test matrix). Then put chat persistence on it. Chat is the
  smallest real surface: 5 interfaces, about 12 raw statements, already a separate file, no Drizzle, and no plugin DDL.
  It proves every hard piece (async ledger, pooling, schema naming, the multi-process question) before the 54 content
  adapters are touched.

---

## 1. Inventory by area

Legend: **PORT** = behind a dialect-neutral interface (async unless noted). **DRZ-SYNC** = Drizzle over better-sqlite3,
which uses the synchronous API. **RAW** = raw `better-sqlite3` prepared statements or `.exec`. **SQLITE-ONLY** = SQL or
APIs with no direct Postgres equivalent.

| Area | Port? | How it touches SQLite | SQLite-only constructs (file:line) | Call-site estimate |
|---|---|---|---|---|
| **Content/CMS repos** (posts, entries, pages, taxonomy, redirects, navigation, widgets, forms, comments, newsletter, members, media, content-types, settings) | PORT, async (e.g. `PostRepoPort` `features/post/post.ts:244`); memory twins exist | DRZ-SYNC mostly; RAW `$client` escapes for transactions and a few queries | `json_extract` filters for site fields `features/entries/repo.sqlite.ts:91,115`; `json_set` counters `features/newsletter/repo.sqlite.ts:209`; ambient `BEGIN IMMEDIATE` `features/post/repo.sqlite.ts:461`; comments/newsletter are mostly RAW (14 and 27 `prepare` calls) | 54 adapter files; 384 sync Drizzle terminals; 61 `onConflictDo*` (portable); 48 `sql\`` fragments (need a per-fragment check); 153 `prepare(` in 28 files |
| **Chat / assistant persistence** (`chat.db`: conversations, messages, run ledger, agent sessions, "allow for this chat" approvals) | `ChatHistoryStore` + `ChatHistoryMaintenance` (Jini, async); `AgentSessionStore`, `ConversationToolApprovalStore` (async); **`ChatRunLedger` is SYNC** | RAW only. Opened in `platform/db/sqlite/chat-db.ts:84-93` (WAL, foreign keys, busy_timeout pragmas; DDL for Jini's tables plus 2 inline tables). SQL lives in `@jini-ai/sqlite` (`chat-history/store.ts`) and in Tovu `assistant/persistence/{run-ledger,agent-session-store,conversation-tool-approval-store}.ts` | Sync better-sqlite3 transactions in Jini (`chat-history/store.ts:256`, `messages.ts:95`) and `run-ledger.ts:120`; check-then-act `tenant-scope.ts:112` (`isSettled` then `appendMessage`) | 5 interfaces; ~12 statements in Tovu plus the Jini store; 3 call sites for the sync ledger (`tenant-scope.ts:112`, `modules/assistant-chats.ts:90`, `modules/assistant-run-finalizer.ts:130`) |
| **Auth / identity** (principals, users, sessions, grants) | PORT (`features/identity/repo.sqlite.ts`, 46 async methods) | DRZ-SYNC; `features/identity/wiring.ts:281` takes a raw `ContentDb` | none found beyond sync API | 1 adapter plus wiring |
| **Settings / secrets** (sealed credentials: vendor, publish, site, source-control, custom, media-provider, execution, external-MCP) | PORT | DRZ-SYNC with sync `db.transaction((tx)` (`platform/db/sqlite/vendor-credential-repo.sqlite.ts:58,68,115`, `publish-credential-repo.sqlite.ts:67,80,127`); settings uses `BEGIN IMMEDIATE` | `features/webhooks/site-key-sources.ts:261-277` scans `sqlite_master … sql LIKE '%sealed_ciphertext%'` on a separate read-only connection | ~10 adapters. **AAD is logical-id only**, so sealed bytes copy verbatim (transfer plan §1.2 item 5) |
| **Plugins' own tables** (`p_<id>__*`) | **No port.** `declareDataModule({ db: Database.Database … })` `features/plugins/data-module.ts:872-873` | RAW; plugins open their **own** connections: `plugins/store/store-plugin.ts:162`, `deploy/deploy-plugin.ts:295`, `lipay/lipay-plugin.ts:1058`, `migration-recovery.ts:31` | `PRAGMA table_info/index_list/index_info` (`data-module.ts:494,622,630`), `sqlite_master` (`:458`), `INTEGER PRIMARY KEY AUTOINCREMENT` (`:445`), whole-file snapshot `plugins/snapshot.ts:66` (`db.backup`), restore by `copyFileSync` `plugins/restore.ts:38`, `wal_checkpoint(FULL)` `migration-journal.ts:41` | ~10 files; about 60 raw statements; the hardest single piece (July spec §2.2 still stands) |
| **Search** | Post search behind a port (`search-index.sqlite.ts` / `.memory.ts`); tool/component/agent-plugin catalog behind Jini's `ToolCatalogQuery` | Posts: durable FTS5 external-content table plus 3 triggers (`platform/db/drizzle/0022_posts_fts_search_index.sql`), `rowid` join `features/post/search-index.sqlite.ts:215`. Tools: **in-memory, disposable** FTS5 `assistant/tool-catalog-query.ts:64` (`new Database(":memory:")`, rebuilt every daemon boot) | FTS5, `bm25()`, `rowid` | Post search is 1 adapter plus 1 migration. Tool search is **not a storage concern** (no data to move); it only keeps a native-module dependency |
| **Migrations / journal** | Drizzle migrator (`platform/db/sqlite/content-db.ts`); ops journal has its own config (`drizzle.database-journal.config.ts`) | 78 SQLite migration files (7 contain data DML, 4 are table rebuilds); journal "when" ordering trap (memory note) | FTS/trigger custom SQL (0022); `INSERT OR IGNORE` bootstrap `content-db.ts:129` | **Zero Postgres migrations exist.** `schema.postgres.ts` is generated (92 tables, `schema.postgres.ts:1-13`) and drift-tested, but used only by `features/database-transfer/*` |
| **Backups / restore points / snapshots** | `DbOpsPort` (`contracts/core/gated-mutations/ports.ts:73`) with real SQLite (`platform/db/sqlite/db-ops.ts` → `@jini-ai/infra/db/sqlite/db-ops.ts`) and **evaluation-only** Postgres (`platform/db/postgres/db-ops.ts:1-14`) | better-sqlite3 online backup via `$client` | `.backup()`, file swap; `watermark.ts` sync | 1 port, 2 adapters (1 real) |
| **Site duplicate / export / init / boot** | No port; `platform/site-dir/*` works on file paths | RAW and file ops: `duplicate-content-db.ts:168` (`VACUUM INTO`), `:182` (`VACUUM`), `:196` (`wal_checkpoint(TRUNCATE)`); `content.db` filename hard-coded (`site-dir/layout.ts:61`, `repair-site.ts:72`, `boot-site-dir.ts:73`, `init-site.ts:213`, `cli/commands/serve.ts:306`, `export.ts:135`) | as listed | ~14 files in `platform/site-dir` |
| **Database transfer** (the SQLite→Postgres copier) | Source/target ports (`sqlite-source.ts`, `postgres-target.ts`) | Reads SQLite bytes read-only; **writes Postgres by spawning `psql`** (`postgres-target.ts:1,6`); no driver | n/a (this is the bridge) | Already does schema-per-site: `copy-engine.ts:42` (`"tovu"`), `:60` `siteSchemaName` → `tovu_<slug>` with a hash fallback. Chat tables are "later slices" (`copy-engine.ts:38`) |
| **Desktop app** (`apps/desktop`) | n/a; spawns `tovu serve` per site and never opens the DB | Ships the native `better-sqlite3` (smoke-tested in `apps/desktop/src/smoke-native.ts:83-111`); lifecycle code assumes one `content.db` file per site dir (`main.ts:964,1325`, `project-ipc.ts:487`) | none directly | PGlite (WASM) would remove a native module but adds one data directory per site |
| **Memory mode** (`TOVU_DB=memory`) | Uses the memory twins | **Not SQLite-free:** in-memory SQLite for taxonomy `server/runtime/composition/app.ts:521`, chat `assistant/persistence/store-factory.ts:54`, post search `features/post/search-index.memory.ts:66` | FTS5 | 3 sites |
| **Tests** | Contract suites exist for a few ports only (settings `features/settings/__tests__/repo.contract.test.ts:354-364`, forms, commands, outbox, webhooks) | 174 of 1237 test files open real SQLite | n/a | The contract pattern exists but covers about 6 of 54 adapters |

**Containment check (ADR-015 decision 2):** `ContentDb` (`platform/db/sqlite/content-db.ts:44`, concrete
`BetterSQLite3Database & { $client }`) appears in 94 non-test files. 66 of them are adapters, `platform/db`, or the
composition root. The other 28 are mostly `platform/site-dir/*`, plugin snapshot/recovery, and doc comments (for
example `server/routes/types.ts` mentions it only in comments). No route or feature logic takes it. **Containment
mostly held.** The escape hatch is `$client`: 53 uses in 24 files, 16 of them in `server/runtime/composition/deps.ts`.

---

## 2. What works on Postgres today

**Nothing at runtime. Refuted with evidence:**

- No Postgres driver anywhere: the root `package.json` has `better-sqlite3`, `drizzle-orm`, `drizzle-kit` and no
  `pg`, `postgres` or `@electric-sql/pglite`. A search for imports of `pg`, `postgres`, `@electric-sql/pglite`, or
  `drizzle-orm/{node-postgres,postgres-js,pglite}` across `apps/` and `packages/` returns 0 files.
- The only DB switch is `TOVU_DB === "memory"` (`index.ts:36`, `server/runtime/composition/agent-daemon-deps.ts:129`).
  Otherwise the code opens SQLite at `TOVU_CONTENT_DB ?? <siteDir>/content.db` (`server/runtime/composition/deps.ts:524`).
  There is no URL, dialect or `DATABASE_URL` variable.
- `schema.postgres.ts` / `schema.mysql.ts` are imported at runtime only by `features/database-transfer/{table-catalog,copy-engine}.ts`.

**What exists and is reusable:**

- A generated, drift-tested Postgres schema (`schema.postgres.ts`, generator `development/scripts/generate-postgres-schema.ts`,
  tests `platform/db/__tests__/schema-postgres-{drift,parity}.test.ts`). This settles the July spec's "dual-schema
  maintenance" open question: the SQLite schema stays the source and Postgres is derived from it.
- The migration manifest (copy order, column classes, identity reseed; `platform/db/migration/manifest.ts`), tested
  against a live Postgres.
- The working SQLite→Postgres copier with schema-per-site naming (`features/database-transfer/`).
- Evaluation-only Postgres restore capability (`platform/db/postgres/db-ops.ts`).
- The dialect-conditional migrate-forward state machine (`features/database/migrate-forward/`, per the July spec §2.3).
- Jini's driver-neutral `db/core` ports with the R12 driver-isolation guard (`@jini-ai/infra/src/db/core/ports.ts:1-20`).

---

## 3. Target design

### 3.1 Shape

```
feature code ──> repo PORTS (exist, async)               e.g. PostRepoPort, ChatHistoryStore
                    │
                    ├── *.memory.ts      (exist)
                    ├── *.sqlite.ts      (exist; sqlite-core, better-sqlite3)
                    └── *.pg.ts          (NEW; ONE set, written against drizzle pg-core `PgDatabase`)
                                             ├── driver: node-postgres (Supabase / any Postgres)
                                             └── driver: PGlite (local, in-process WASM)
                    │
          StorageKernel port (NEW, in @jini-ai/infra/db/core): open/migrate/close,
          `withTransaction(fn)` + `currentExecutor()` (AsyncLocalStorage), health, dialect id,
          restore-point capability (DbOpsPort already exists)
```

- **One Postgres adapter set, two drivers.** `drizzle-orm/pglite` and `drizzle-orm/node-postgres` both produce a
  `PgDatabase`. Repos written against `PgDatabase<…, typeof pgSchema>` run on either, so PGlite costs almost nothing
  beyond the Postgres work. Drizzle table objects are dialect-typed (`sqliteTable` ≠ `pgTable`), so a single repo body
  cannot serve both SQLite and Postgres type-safely. There will be two adapter sets while SQLite remains supported.
- **Dual dialect is a transition state, not the end state.** After the Postgres set has shipped and PGlite has been
  measured on desktop, decide whether PGlite replaces SQLite as the local default (§4, phase 9). If it does, the 54
  SQLite adapters get deleted and double maintenance ends. Kysely (one builder for all dialects) was considered and
  rejected: it would override ADR-015 and still require rewriting every adapter.
- **Explicit transaction context (the key change).** Replace "ambient `BEGIN IMMEDIATE` on the shared client" with
  `kernel.withTransaction(fn)`, which stores the transaction executor in AsyncLocalStorage. Every adapter gets its
  executor from `kernel.executor()`, which returns the open transaction if there is one and the pool/handle otherwise.
  Nesting becomes a savepoint or a pass-through inside the *same* async context only. This fixes both the pool case
  (inner writes escaping the transaction) and the PGlite case (deadlock). The ALS precedent is already in the repo
  (`server/runtime/composition/plugin-runtime.ts:238`).

### 3.2 Databases per site (chat kept separate)

Today each site has 3 SQLite files: `content.db`, `chat.db` (`deps.ts:545`), and `ops/database-journal.db`
(`deps.ts:1347`). They are separate so that a whole-file restore of content never carries or erases chat or the
incident journal (`deps.ts:538-545`, `2026-09-05-db-split-scoping.md` §6). Keep that property on every backend:

| Store | SQLite (today) | Shared Postgres / Supabase | PGlite (local) |
|---|---|---|---|
| Content | `content.db` | schema `tovu` (first site) / `tovu_<slug>` (`siteSchemaName`, `copy-engine.ts:60`) | data dir `<site>/pg/content` with schema `tovu` |
| Chat | `chat.db` | schema `<siteSchema>__chat` | separate data dir `<site>/pg/chat` **or** the same instance with schema `tovu__chat` (spike decides; see below) |
| Ops journal | `ops/database-journal.db` | schema `<siteSchema>__ops` | separate data dir or schema, same rule |

- **Why `__chat` is safe:** `siteSchemaName` collapses every run of other characters to a single `_` and trims the
  ends (`copy-engine.ts:61`), and the hash fallback joins with a single `_`. So `__` can never come out of a site name,
  and `<schema>__chat` cannot collide with a site called "chat". **Trap:** `siteSchemaName` already fills up to
  63 bytes, so the chat/ops suffix (6 bytes) must come out of the same budget. Make the budget a shared helper, not a
  second copy of the slug rule.
- **Chat stays off the content path in Postgres too.** The chat tables have no foreign keys to content tables
  (`chat-db.ts` DDL references only `ai_chats`), so a separate schema costs nothing. A per-schema `pg_dump -n` restore
  of content never touches chat.
- **PGlite nuance:** restore on PGlite is a whole-cluster `dumpDataDir`, so chat in the same instance would be carried
  by a content restore. That argues for two PGlite instances per site (content, chat). The cost is WASM heap per
  instance, which the spike must measure (todos.md already lists RAM/disk as open).

### 3.3 Migrations per dialect

- SQLite: unchanged (`drizzle/`, 78 files).
- Postgres: new `platform/db/drizzle-postgres/`, generated by drizzle-kit from `schema.postgres.ts` and **baselined as
  one squashed `0000`**. No need to replay 78 SQLite steps: new Postgres sites start at head, and existing sites arrive
  through the transfer copy, which moves already-transformed data. Hand-written custom migrations cover what the
  generator cannot express: tsvector columns and GIN indexes (§3.4), and the watermark seed row (`ON CONFLICT DO NOTHING`
  instead of `INSERT OR IGNORE`, `content-db.ts:129`).
- Run migrations with `search_path` set to the site schema, and keep bookkeeping per schema
  (`<schema>.__drizzle_migrations`).
- **Ongoing cost to accept:** every future *data* migration (7 so far) must be written twice, and CI must run both.
  Schema DDL stays single-sourced through the generator.
- Chat DDL today is Jini's `ensureChatHistoryTables` plus 2 inline `CREATE TABLE`s (`chat-db.ts`). The Postgres version
  needs the same parity guard that `assistant/persistence/__tests__/ddl-parity.test.ts` gives SQLite.

### 3.4 Search

- **Post search (durable):** replace FTS5 external content plus triggers with a `post_search_document.search tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', title || ' ' || slug || ' ' || body_text)) STORED` column and a GIN
  index. Query with `websearch_to_tsquery('simple', $1)` and rank with `ts_rank_cd`. Use `'simple'` (no stemming)
  because the current BM25 setup is deliberately unstemmed (memory `tool_search_retrieval`). `ts_rank_cd` is **not**
  BM25, so rankings will differ: gate the swap on the existing eval set, not on "it returns rows". `pg_trgm` is worth
  adding only for typo tolerance on titles and slugs. Treat `pg_textsearch` (BM25) as optional, since PGlite lists it
  but Supabase availability is unverified.
- **Tool / component / agent-plugin catalog:** leave as is. It is an in-memory index rebuilt from code each boot
  (`tool-catalog-query.ts:42-64`), not site data. A Postgres site still loads `better-sqlite3` for it. Only if the
  native module must go (for example a PGlite-only desktop build) should this be replaced by a pure-JS BM25. That is a
  separate decision.

### 3.5 Multi-process (API + agent daemon)

- **Verified:** the daemon builds full SQLite route deps (`agent-daemon-deps.ts:129` → `createSqliteRouteDepsForWorkspace`
  `deps.ts:2185-2197` → `createSqliteRouteDeps`), so it opens `content.db`, `chat.db` and the journal in a **second
  process**. The two processes share them through SQLite WAL file locking. CLI commands (`cli/commands/export.ts:135`)
  and plugin connections (`store-plugin.ts:162`, etc.) open more handles.
- **Postgres (remote):** no problem. Each process gets its own pool; size pools small (Supabase connection limits).
- **PGlite:** only one process may open a data directory. Options, cheapest first:
  1. **The API process owns PGlite and exposes it on a Unix socket through `@electric-sql/pglite-socket`. The daemon
     and CLI connect with the normal `pg` driver**, so they reuse the node-postgres adapter unchanged. Docs caveat
     (context7): concurrent clients go through a *multiplexer over one connection*, "not all use cases are guaranteed
     to work", `--max-connections` defaults to 1, and there is no SSL (fine on a Unix socket). **The spike must test
     two clients with interleaved transactions.** If one client's `BEGIN` can capture another client's statements, this
     option is unsafe.
  2. The daemon stops opening the DB and reaches data through the API over HTTP. This is cleaner, but the daemon
     currently uses the full `RouteDeps` in-process, so it is a large change.
  3. `embedded-postgres` (a real server, ~50-100 MB per platform), already listed as the comparison in todos.md.
- **Recommendation:** spike option 1 during phase 1. If it fails the interleaved-transaction test, fall back to option 3
  for desktop and keep PGlite for tests and single-process tools.

### 3.6 Transactions and concurrency differences to design for

- SQLite with `BEGIN IMMEDIATE` is one writer per file, and waiting happens through `busy_timeout`. Postgres is MVCC
  with row locks at READ COMMITTED by default, and the failure mode is pool exhaustion rather than "database is locked".
- **Check-then-act code must become single statements or locked reads.** `tenant-scope.ts:112` (`isSettled` then
  `appendMessage`) and `run-ledger.ts` rely on sync atomicity. On Postgres use conditional `UPDATE … WHERE NOT terminal
  RETURNING`, `INSERT … ON CONFLICT`, or `SELECT … FOR UPDATE` inside `withTransaction`. The `expectedVersion`/`ifVersion`
  saves (`PostRepoPort.saveIfVersion`) already have the right shape.
- **A latent SQLite hazard the Postgres port must not copy:** `createContentDbTransactionRunner`
  (`features/trash/repo.sqlite.ts:238-251`) passes straight through when `client.inTransaction` is true. That is
  safe today only because transaction bodies await nothing but already-resolved work. If any body ever awaits real I/O,
  an unrelated request's writes can land inside, and roll back with, someone else's transaction. The ALS context in
  §3.1 fixes this for SQLite too.
- Identity columns: Postgres `GENERATED ALWAYS AS IDENTITY` needs `OVERRIDING SYSTEM VALUE` plus a reseed on copy (the
  manifest already handles this). Unordered reads differ (Postgres heap order is not rowid order), so any list without
  `ORDER BY` becomes nondeterministic. There are 37 `.orderBy(` sites; audit the lists that have none. NULL sort order
  differs too (SQLite puts NULLs first in ASC, Postgres puts them last).
- **Supabase pooler:** session state such as `search_path` does not survive the transaction pooler (port 6543). Use the
  session pooler (5432, as the transfer plan already chose) or schema-qualify through `SET LOCAL search_path` inside
  every transaction.

---

## 4. Phased plan (each slice shippable and reversible; SQLite stays the default until phase 8)

| # | Slice | Value | Reversible because | Effort (agent-days) | Risk |
|---|---|---|---|---|---|
| 0 | **ADR:** amend ADR-015 (one pg-core adapter set, two drivers; dual dialect is transitional; explicit transaction context; per-site schema naming including `__chat`/`__ops`; ADR-041 carve-out from the July spec §6). Touch GOV-ADR-001 for an async watermark stamp. | Unblocks everything; settles the naming rule once | Doc only | 0.5-1 | Low |
| 1 | **Storage kernel + test matrix.** `@jini-ai/infra/db/{postgres,pglite}` drivers (open, migrate, `withTransaction`/`executor` via ALS, `search_path`); add `pg` and `@electric-sql/pglite`. Generic contract-suite runner: memory + SQLite + PGlite always; real Postgres when `TOVU_TEST_PG_URL` is set, and **RED when it is set but unreachable, never skip** (memory `local_postgres`). Include the pglite-socket two-client spike (§3.5). | Everything after this is mechanical | Nothing at runtime uses it yet | 3-4 | Medium (cross-repo Jini publish; the socket spike may fail) |
| 2 | **Chat persistence on the port** (the owner's ask). Make `ChatRunLedger` async (3 call sites). Postgres `ChatHistoryStore` + maintenance, `AgentSessionStore`, `ConversationToolApprovalStore`, run ledger, and DDL parity with Jini. Selection `TOVU_CHAT_STORE = sqlite (default) \| pglite:<dir> \| postgres://…`. Copy chat into `<schema>__chat` by extending `database-transfer` (already listed as a later slice). Replace the check-then-act at `tenant-scope.ts:112`. | Chat can live on Supabase/PGlite; proves async, pooling, naming and multi-process on a small surface | Env switch; SQLite untouched | 3-5 | Medium (Jini owns the chat DDL: build the adapter in Tovu first, move it upstream after) |
| 3 | **Transaction refactor on SQLite, no behavior change.** Move the 40 `BEGIN IMMEDIATE` sites / 21 files and the 26 sync `db.transaction((tx)` sites onto `kernel.withTransaction` + `executor()`. Async watermark stamp (42 refs). | Removes blocker 1 and the latent hazard; keeps the Postgres port honest | Same SQL, same tests; revert per file | 4-6 | Medium (write paths; relies on existing regression suites) |
| 4 | **Postgres content adapters**, in value order: workspace/settings/identity (needed to boot) → posts/entries/pages/media/taxonomy/redirects/navigation/widgets → sealed credentials → publish/webhooks/outbox/change-sets → the rest. Each slice = N `*.pg.ts` files plus contract suites run on all backends. Rewrite `json_extract` filters to `->>`/jsonb (`entries/repo.sqlite.ts:91,115`) and `json_set` to `jsonb_set` (`newsletter/repo.sqlite.ts:209`). | The bulk | Not wired until phase 8 | 12-18 (54 adapters, ~384 terminals; parallel narrow slices) | Low per slice, medium in total (volume) |
| 5 | **Post search on Postgres** (tsvector + GIN + `websearch_to_tsquery('simple')`), gated on the eval set | Keeps content search working | Adapter-level | 1-2 | Medium (ranking drift) |
| 6 | **Plugin DDL engine twin** (`declareDataModule` on Postgres: `information_schema`/`pg_catalog` introspection, transactional DDL instead of snapshot + journal). Plugins stop opening their own connections and receive the kernel instead (`store-plugin.ts:162`, `deploy-plugin.ts:295`, `lipay-plugin.ts:1058`). | Plugins work on Postgres | SQLite engine untouched | 5-7 | **High** (ADR-023 safety semantics; the July spec's "crux") |
| 7 | **Ops on Postgres:** live `DbOpsPort` (`pg_dump -n` / Supabase PITR = external / PGlite `dumpDataDir`); site duplicate (`CREATE SCHEMA` + copy, replacing `VACUUM INTO`); site-key scan through `pg_catalog` instead of `sqlite_master` (`site-key-sources.ts:267`); export; the migrate-forward executor. SQLite-only one-off repairs (`chat-orphan-check`, `drop-empty-legacy-chat-tables`, `reset-legacy-site-title-pin`) stay SQLite-only. | Safe restores on Postgres | New adapters only | 5-7 | Medium-high |
| 8 | **Runtime switch:** `createPostgresRouteDeps` beside `createSqliteRouteDeps`; `TOVU_DB=postgres://…` or `pglite:<dir>` read at both roots (`index.ts:36`, `agent-daemon-deps.ts:129`); boot guards; desktop wiring for PGlite (per the phase 1 spike outcome); stop hard-coding `content.db` in `platform/site-dir` (`layout.ts:61` etc.) behind a "site storage descriptor". | A site actually runs on Postgres/PGlite | Env switch; default SQLite | 4-6 | Medium-high (desktop lifecycle, multi-process) |
| 9 | **Decision:** keep dual dialect, or make PGlite the local default and retire the SQLite adapters (existing sites convert through the transfer engine on upgrade). Data-driven after a soak. | Ends double maintenance | It is a decision | — | — |

**Total, phases 0-8:** about 38-56 agent-days, roughly 6-8 weeks with 2-3 agents in parallel on phase 4. Phases 0-2
(about 7-10 days) deliver the owner's literal ask: chat not locked to SQLite.

**Is chat first right?** Yes, with the kernel (phase 1) as its prerequisite. The evidence supports it: chat is already
a separate file, has no Drizzle, no plugin DDL and no FTS, has 5 small interfaces, and its only sync contract has 3
callers. The risk is the dependency on Jini: the SQL for `ChatHistoryStore` lives in `@jini-ai/sqlite`. Build the
Postgres store in Tovu (`assistant/persistence/pg/`) against the Jini port first (prototype first), then upstream it
as `@jini-ai/infra/db/postgres` + a chat adapter.

**Test strategy:**
- One contract suite per port, parameterized by an adapter factory. The existing `runContractSuite` in
  `features/settings/__tests__/repo.contract.test.ts:354-364` is the template.
- Backends: memory, SQLite `:memory:`, PGlite in-memory (fast, in-process, no server) on every run; real Postgres 14
  (`pg_ctl -D /usr/local/var/postgresql@14`, memory `local_postgres`) when enabled.
- **Negative proof:** stop Postgres and confirm the suite goes RED.
- Concurrency tests (two overlapping `withTransaction` calls; two processes through pglite-socket) are part of phase 1,
  not an afterthought.
- Search parity: run the same eval queries on FTS5 and on tsvector and compare top-3.
- Copy round-trip: SQLite → Postgres through `database-transfer`, then run the read contract suites against the copy.

---

## 5. Top traps

1. **Ambient transactions** (`fn` with no transaction handle). On a pool they silently lose atomicity. On PGlite they
   deadlock (the transaction holds PGlite's mutex; an inner `db.query` waits forever). This must be fixed before any
   content adapter moves (phase 3).
2. **Correctness that depends on sync code:** `run-ledger.ts:17-18`, the watermark stamp (GOV-ADR-001),
   `sqliteStampWatermark` (`taxonomy/repo.sqlite.ts:583`). Moving to async opens check-then-act races unless each one
   is rewritten as a single conditional statement or a locked read.
3. **PGlite is single-process, but Tovu runs 2+ processes on the same data** (API, daemon, CLI, plugin connections).
   pglite-socket multiplexes one connection, and interleaved transactions from two clients are unverified.
4. **Tables invisible to the schema:** chat tables, `p_*` plugin tables, `_plugin_migrations` and FTS objects are not
   in `schema.sqlite.ts` (memory `three_raw_sql_tables_invisible_copy_order`; `RAW_SQL_MANAGED_TABLES`). Every
   generator, copier and migration step must list them explicitly.
5. **Drizzle table types are per dialect.** Plan for two adapter sets, not "flip the dialect". Put the Postgres set on
   `PgDatabase` so PGlite and node-postgres share it.
6. **Semantic drift that type-checks:** 78 timestamp columns stored as text (ISO strings sort correctly; keep them text
   in phase 4); 7 integer-boolean columns become `boolean`; NULL ordering; heap order without `ORDER BY`; JSON-as-text
   vs `jsonb` (the generated schema's `jsonText` returns a string, `schema.postgres.ts:17-21`, so callers see no
   change); the SQLite `JSONB` NUMERIC-affinity trap (memory `jsonb_across_three_dialects`).
7. **Supabase pooler and `search_path`:** the transaction pooler drops session settings. Also the 63-byte identifier
   limit applies to `<schema>__chat`.
8. **Memory mode is not SQLite-free** (`app.ts:521`, `store-factory.ts:54`, `search-index.memory.ts:66`). "Remove
   better-sqlite3" is a separate project from "support Postgres".
9. **Data migrations get written twice from now on.** The schema generator does not cover DML.
10. **Green-by-skip tests:** a Postgres suite that skips when the server is down proves nothing. Require RED.
11. **Drizzle journal timestamps** (memory `drizzle_future_journal_timestamps_skip_migrations`): the new
    `drizzle-postgres/` journal must not inherit the fake 2027 stamps.

---

## 6. Open questions for the owner (parked, not blocking phases 0-2)

- PGlite on desktop needs the multi-process answer (§3.5). If pglite-socket fails the spike, is `embedded-postgres`
  (~50-100 MB per platform) acceptable?
- After phase 9 data exists: retire SQLite for new sites, or keep it as a supported local backend long-term?
