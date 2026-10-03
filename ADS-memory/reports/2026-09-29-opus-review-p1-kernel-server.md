# Opus review, part 1 of 6: platform (minus sqlite/ and repos/), server, cli, contracts, index.ts

- Range: `962f928fb..HEAD` on `restructure/apps-website-phased`. Read via `git show HEAD:` / `git diff`, no working tree, no runs.
- Persona: `AI-Dev-Shop/agents/code-inspection/skills.md`.
- Checked against ADR-067 (site storage choice) and the 11 already-fixed Codex findings (`2026-09-28-codex-sol-review-today.md`), none re-reported.
- Stopped at the context budget. See "Not reviewed" and the handoff at `ADS-memory/.local-artifacts/handoffs/2026-09-29-review-p1-kernel-server.md`.

Counts: critical 0, high 0, medium 4, low 9.

## Bugs

### M1 (medium): an inherited `TOVU_PG_SOCKET` makes a PGlite owner unlink another site's live socket and take it over (PLAUSIBLE)
- `server/runtime/composition/open-site-store.ts:155-158` reads `TOVU_PG_SOCKET` from the environment for BOTH roles, owner included. It uses that socket's directory in place of the one derived from this data dir.
- `platform/db/kernel/drivers/pglite-owner.ts:303-304` then runs `if (existsSync(socketPath)) unlinkSync(socketPath)`. The reason it gives is "We hold the lock, so a socket file here was left by a dead owner". That only holds when the socket dir is derived from this data dir (`dirKey`). Here it is someone else's.
- `daemon-supervisor.ts:459` puts `TOVU_PG_SOCKET` in the agent daemon's environment. Agent CLIs and their shells inherit it.
- Scenario: site A runs on PGlite. An assistant run in A's daemon runs `tovu serve <siteB>` or `tovu init --storage pglite <dir>` (`init-site.ts` `createPgSiteStore` opens with `role: "owner"`, default `process.env`).
  - B's owner takes B's lock (a different dir, so no conflict).
  - It unlinks A's live `.s.PGSQL.5432` and listens on that same path.
  - A's API process and daemon reconnect (pool eviction, `pglite-socket.ts:45`) and silently read and write site B's database.
- The same happens for any shell that exported the variable.
- Fix direction: the owner must ignore `PG_SOCKET_ENV` and always use `defaultPgliteSocketDir(dataDir)`. The env is a client-only input.

### M2 (medium): the Postgres pool has no `'error'` listener, so a dropped idle connection crashes the process
- `platform/db/kernel/drivers/postgres.ts:27` creates `new pg.Pool(...)` with no `pool.on("error", …)`.
- node-postgres emits `'error'` on the pool when an idle client's connection is terminated by the server: restart, failover, `pg_terminate_backend`, pooler idle cut.
- An EventEmitter `'error'` with no listener throws, which takes down the API process of every `postgres` site.
- The sibling transport handles exactly this, with the reason spelled out: `pglite-socket.ts:43-45`. It was never carried to the network driver, which is the one that faces real servers (Supabase, Neon).
- Also used by `move-site-storage.ts:98` and `init-site.ts` `assertPostgresTargetEmpty`.

### M3 (medium): `readConnectionStringFromUser` can hang forever on the terminal prompt (PLAUSIBLE)
- `cli/commands/init.ts` (new `readConnectionStringFromUser`, shared by `storage-move.ts:40`) waits only for `rl.once("line", resolve)`.
- Ctrl-D (stdin `close`) never emits `line`, so the promise never settles.
- Ctrl-C on a `terminal: true` readline with no `SIGINT` listener pauses the stream instead of exiting.
- Either way, `tovu init --storage postgres` / `tovu storage move` sits at "Postgres connection string (not shown):" with no way out except killing it. Resolve or reject on `close`/`SIGINT`.

### L1 (low): the sealed-credential inventory's "one snapshot" is false on Postgres
- `platform/db/sealed-credential-inventory.ts:51` and `:312` say that one `kernel.transaction` gives "one consistent snapshot, on any dialect".
- Postgres transactions run at READ COMMITTED: every SELECT takes a fresh snapshot.
- So `countSealedRows` (the limit check) and the later row reads can disagree under concurrent writes. The inventory that guards key replacement can then count rows the entries do not show, or the other way round.
- Fix: `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ` (a `SET LOCAL`-class statement, allowed by the kernel rules), or correct the comment.

### L2 (low): a three-way race in PGlite owner-lock takeover can leave two owners (PLAUSIBLE)
- `pglite-owner.ts:229-250`, `removeStaleLock`.
- Sequence:
  1. A and B both see stale lock L1. B renames L1 aside, removes it and creates L2.
  2. A renames L2 aside, sees the inode differs, and starts to link it back.
  3. In that window, starter C finds no lock and creates L3.
  4. A's link-back fails with `EEXIST`, and A removes L2 (`finally rmSync(aside)`).
- Result: B believes it owns the dir, but the lock file is C's. B and C both open the same PGlite data dir.
- Needs three simultaneous starters on a dead-pid lock, so it is narrow. A lock directory (`mkdir`) or `flock` would close it.

### L3 (low): a stale socket file makes a PGlite client fail instead of wait
- `open-site-store.ts:186-196`: `waitForPgliteSocket` polls only `existsSync`.
- After the owner is killed with -9, its socket file stays until the next owner start unlinks it.
- A daemon started meanwhile sees the file and connects at once, getting `ECONNREFUSED`/`ENOENT` from the first migration query. It never uses the 60 s wait that exists for exactly this case.
- Probe with a connect attempt, not a stat.

### L4 (low): `PgliteOwner.close` skips `db.close()` when `serving.stop()` throws
- `pglite-owner.ts:335-336`: `await serving.stop(); await open.close();` inside `try/finally`.
- The `finally` releases the lock and removes the socket even if the PGlite instance was never closed.
- A same-process re-open (the tests, desktop multi-site) can then open the data dir while the old instance is still live and unflushed.

## Excess

### L5 (low): `pglite/content-schema.ts` is production code with only test callers, and its header is stale
- `platform/db/pglite/content-schema.ts` says "Stand-in until the migrator lands (slice M1)". The migrator has landed.
- Its callers are all under `__tests__/` (`database-types.test.ts`, `pglite-owner.test.ts`, `postgres-baseline.test.ts`, `__tests__/postgres-database.ts`). The generated-types banner also mentions it.
- It imports feature internals by value (`features/database-transfer/table-catalog.js`, `postgres-ddl.js`) from `platform/`. That is a second Postgres schema source (`schema.postgres.ts` DDL) beside the frozen `POSTGRES_BASELINE`.
- Move it under `__tests__/` or a scripts dir, and fix the header.

### L6 (low): the in-process `openPgliteKernel` driver is exported publicly but used only by one-off commands
- `kernel/index.ts:18` re-exports it.
- In production it is used only by `move-site-storage.ts:97` and `duplicate-pglite-store.ts:55,80`, each under a manually taken owner lock.
- Nothing stops a new caller from opening a served data dir directly, which ADR-067 §6 calls "a bug".
- Consider taking the owner lock inside the driver, or not exporting it from the kernel's public surface.

### L7 (low): the `stampWatermark` guard is dead in production and kept only for its test
- `contracts/core/gated-mutations/watermark.ts` (header, updated this range): "no production path adapts a transaction to this guard; it is kept with its unit test as the contract's reference shape".
- Its exports (`stampWatermark`, `OpenTransactionHandle`, `WatermarkTransactionRequiredError`) have no non-test importer at HEAD.

## Slop

### L8 (low): comments that no longer match the code
- `kernel/drivers/postgres.ts:15-16` still says "Not wired into any site yet (storage-adapter plan slice R1)". It is wired: `openSiteStore` Postgres branch, `move-site-storage`, `init-site`.
- `platform/db/pglite/content-schema.ts:11-12`: the stale "stand-in" line from L5.

### L9 (low): repos keep `Sqlite*` names while running on every engine, and one adapter is SQLite-only in practice
- `server/runtime/composition/deps.ts`, e.g. `SqlitePostRepo(kernel)`, `SqliteTrashRepo(kernel)`, `SqliteDatabaseIntrospectionAdapter({ db: kernel })`. These are kernel repos wired for PGlite/Postgres too.
- `SqliteDatabaseIntrospectionAdapter` really is SQLite-only: it reads `__drizzle_migrations`. On a pg store it reports the schema identity as unreadable, even though `readAppliedSchemaIdentity` (`read-applied-schema-identity.ts`) now knows the `tovu_migrations` ledger.
- The Database agent tools therefore show "unreadable" on every Postgres/PGlite site.

## Architecture

### M4 (medium): `platform/site-dir` now imports server composition and a feature internal
- The imports:
  - `platform/site-dir/boot-site-dir.ts:8` → `#src/server/runtime/composition/open-site-store`.
  - `platform/site-dir/init-site.ts:19-21` → `#src/features/database-transfer/pg-store-copy`, `#src/server/runtime/composition/open-site-store`, `#src/server/runtime/composition/storage-secret`.
- This inverts platform→server: `server` already imports `platform/site-dir`. `storage-secret` pulls `features/webhooks` keyring and sealer into the platform layer.
- ADR-067 §3 puts the one store opener in the composition root. `bootSiteDir`/`initSite` reaching up into it makes platform depend on the composition.
- The same smell, smaller: `platform/db/sealed-credential-inventory.ts:6` imports types from `#src/features/webhooks/index`.
- Fix direction: inject the store opener (and the sealer) into `bootSiteDir`/`initSite` from `cli/commands/*`, which is already a composition-level caller.

### Note (not a separate finding): ADR-067 §3 "the body never branches on the engine"
- `deps.ts` `composeSiteRouteDeps` has `if (store.storage.kind === "sqlite") warnOnOrphanedChatRows(...)`.
- It is small and defensible (the check is about `content.db`/`chat.db` files), but it is a branch in the body the ADR says must not exist. Better moved into `sqliteOnlyServices`.

## Checked, no finding
- `pglite-server/socket-server.ts`: queue fairness, rollback on disconnect or idle timeout, `stop()` drain, ReadyForQuery filter framing.
- `kernel-core.ts` / `turn-lock.ts` nesting rules.
- `migrations/runner.ts`: lock plus re-read under lock, ledger created in the step transaction, checksum verification. Also `legacy-sqlite.ts` reconciliation, and the `0000`/`0001`/`0002`/chat steps.
- `storage-secret.ts`: 0600 temp plus rename, errors never carry the secret.
- `site-storage.ts` validation.
- `duplicate-pglite-store.ts`: the lock file is dropped from the dump, `ai_chat` is purged.
- `close-store-on-shutdown.ts` and the `serve.ts` ownership refactor.
- `prepare-content-store.ts` boolean/json mapping (Postgres accepts `'1'` for boolean params).
- `public-page-security-headers.ts`, the `platform/html/escape.ts` consolidation, `tool-approvals.ts`, `feed.ts`, `store.ts`.

## Files reviewed (HEAD)
- platform/db/kernel:
  - drivers: `pglite-owner.ts`, `pglite-socket.ts`, `pglite.ts`, `postgres.ts`, `postgres-lock.ts`, `pg-types.ts`, `pglite-dialect.ts`
  - `pglite-server/socket-server.ts`, `kernel-core.ts`, `turn-lock.ts`, `port.ts`, `index.ts`, `ops.ts`, `dialect.ts`, `schema-scope.ts`
- platform/db/migrations: `runner.ts`, `step.ts`, `index.ts`, `checksums.ts`, `legacy-sqlite.ts`, `0000_legacy_baseline.ts` (+ a glance at `.postgres.ts`), `0001_post_search.ts`, `0002_drop_empty_legacy_chat_tables.ts`, `chat/0000_chat_baseline.ts`, `chat/0001_sqlite_chat_tables.ts`
- platform/db (other): `chat-kernel.ts`, `content-kernel.ts`, `journal-kernel.ts`, `watermark-kernel.ts`, `prepare-content-store.ts`, `key-dependent-data.ts`, `pglite/content-schema.ts`, `postgres/db-ops-adapter.ts`, `sealed-credential-inventory.ts` (header plus `takeSnapshot`)
- platform/site-dir and platform/html: `site-storage.ts`, `types.ts`, `read-site-dir.ts`, `layout.ts`, `init-site.ts`, `boot-site-dir.ts`, `read-applied-schema-identity.ts`, `duplicate-site.ts`, `duplicate-pglite-store.ts`, `escape.ts`, `slug.ts`
- server/runtime: composition/`open-site-store.ts`, `storage-secret.ts`, `move-site-storage.ts`, `open-site-content-db.ts`, `store-bound-services.ts`, `sqlite-only-services.ts`, `agent-daemon-deps.ts`, `deps.ts` (code-line diff); lifecycle/`close-store-on-shutdown.ts`, `daemon-supervisor.ts` (diff)
- server/inbound: `public-http/middleware/public-page-security-headers.ts`, `public-http/routes/site/feed.ts`, `store.ts`, `sitemap.ts`, `public-http/http/site/{render,page-head,form-render,external-links,bare-page}.ts` (diffs), `admin-http/routes/external-mcp/tool-approvals.ts`, `system/site-token.ts`, `seo/deps.ts`, `assistant/agent-daemon-server.ts` (diff)
- contracts: `public-page-security-headers.ts`, `gated-mutations/watermark.ts`, `assistant-run-events.ts` (diffs)
- cli and index: `serve.ts`, `init.ts`, `storage-move.ts`, `program.ts`, `adopt.ts`, `errors.ts` (diffs); `src/index.ts` (diff)

## Not reviewed (budget)
- platform/db: `kernel/schema-shape.ts`, `kernel/typegen.ts`; the rest of `sealed-credential-inventory.ts` (classification half); `content-database.generated.ts` (skipped by instruction)
- platform/site-dir: `duplicate-content-db.ts`, `repair-site.ts`, `resolve-workspace.ts`, `site-registry.ts`, `seed-site-themes.ts`
- platform (other): `observability/*`, `routing/routing.ts` (one-line diffs)
- server/runtime composition: `modules/assistant-chats.ts`, `modules/assistant-run-finalizer.ts`, `modules/external-mcp.ts`, `modules/seo.ts`, `app.ts`, `sealed-credential-descriptors.ts`
- server/runtime boot: `content-db-schema-guard.ts`, `bootstrap.ts`, `boot-readiness-gate.ts`, `resolve-mailer.ts`
- server (other): `server/routes/types.ts`, `assistant-system-overlay.ts`
- cli: `export.ts` (Codex #7 area), `__tests__/helpers/remove-fixture-tree.ts`
- contracts: `commands/appliers.ts`, `gated-mutations/gateway.ts`, `publish-history-list-limit.ts`
- Code-metrics / dependency-graph sensors: not executed (no runs allowed)
