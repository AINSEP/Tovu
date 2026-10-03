# Opus review part 2b: leftovers of part 2 (`platform/db/sqlite/**`), 962f928fb..HEAD

- Reviewer: Claude Opus 5.5 (code-inspection persona, read-only). Date: 2026-09-29.
- Scope: the "Remaining" list in `.local-artifacts/handoffs/2026-09-29-review-p2-sqlite-repos.md`.
  I did not re-report part 2's M1, M2 or L1-L7, the 11 Codex findings, or the 4 parked items.
- Code was read with `git show` / `git diff` only, plus the linked `@jini-ai/infra` and `@jini-ai/cms`
  sources under `node_modules/` to check that callers await. No tests, builds, app runs or metric
  tools were run, so `code_metrics`, `dependency_graph`, `type_safety` and `duplication` are
  INCONCLUSIVE.
- Counts: critical 0, high 0, medium 1, low 4.

## Bugs

### M1 (medium). On Postgres/PGlite, the database introspection tools report every legacy SQLite migration as pending and say the migrations table is unreadable
- `apps/website/src/platform/db/sqlite/database-introspection-adapter.sqlite.ts:19,138-145,158-172,195-225`
  reads only `__drizzle_migrations` and the SQLite drizzle journal (`drizzle/meta/_journal.json`,
  78 entries).
- `server/runtime/composition/deps.ts:1457` now builds this adapter on every dialect
  (`{ db: kernel, dbPath }`). At base it was built from the SQLite `ContentDb` only.
- Postgres/PGlite has no `__drizzle_migrations` table. Its ledger is `tovu_migrations`
  (`migrations/runner.ts`, ADR-066), and `0000_legacy_baseline.postgres.ts` never creates the
  drizzle table. The sibling `site-dir/read-applied-schema-identity.ts:78-84` already handles this
  with a Postgres branch that reads `tovu_migrations` against `CONTENT_MIGRATIONS`. The introspection
  adapter has no such branch.
- What goes wrong on a healthy, fully migrated PG or PGlite site:
  - `database_list_pending_migrations`: `readAppliedTimestamps` returns an empty set, so all 78
    journal entries (`0000`…`0077`) come back as pending. That is a confident wrong answer, not
    "unknown". The class doc (`:87-88`) promises "never a guess".
  - `database_get_health`: returns `migrationsTableReadable: false` and `driftStatus: "unknown"`.
  - `database_get_schema_state`: returns `unknown`.
  - An agent or admin who acts on "78 pending migrations" is being misled.
- A second, smaller gap applies on SQLite too: steps recorded in `tovu_migrations`
  (`0001_post_search`, `0002_drop_empty_legacy_chat_tables`) are never shown as applied or pending.
  Today this is harmless because the runner applies them at boot and a failure aborts the boot.
- Fix direction: branch on `kernel.dialect` the way `readAppliedSchemaIdentity` does. Better, build
  on that function and on the runner's `CONTENT_MIGRATIONS` and ledger for the pending list, so
  there is one source for "what is applied". Add a test on a PGlite kernel.

### L1 (low). The empty-legacy-chat-table drop now runs once instead of on every boot
- Base `sqlite/drop-empty-legacy-chat-tables.ts` ran from `openContentDb` on every open. At HEAD,
  `migrations/0002_drop_empty_legacy_chat_tables.ts:26-37` is a ledger step, so it runs once per
  database.
- Otherwise the step matches the old logic. It uses the same three tables, drops a table only when
  it exists and has 0 rows, leaves tables with rows for `chat-orphan-check`, does nothing on
  Postgres, and runs inside the runner's transaction (the old code used one `db.transaction` too).
- What changed: on a pre-split install, 0002 keeps the tables that have rows and records itself as
  applied. When the operator later runs `development/scripts/split-chat-data-into-chat-db.ts`, which
  only deletes the verified rows, the now-empty `ai_chats`, `ai_chat_messages` and
  `assistant_agent_sessions` stay in `content.db` for good. Before this change, the next boot
  dropped them.
- Impact: the orphan check stays quiet (it only warns when there are rows). But
  `features/database-transfer/table-catalog.ts` `planSnapshotTables` copies unknown tables as
  "introspected" tables, so a later SQLite→Postgres move would create empty `public.ai_chats` and
  its siblings on the target. That contradicts the 0002 header ("never had these tables in
  `public`"). PLAUSIBLE; not run.
- Fix direction: have the split script drop each table once it is empty. Do not re-run 0002; its
  checksum is pinned.

## Excess / slop

### L2 (low). Dead watermark code carried forward
- `contracts/core/gated-mutations/watermark.ts:23-53` (`OpenTransactionHandle`, `stampWatermark`,
  `WatermarkTransactionRequiredError`) has no production caller. Its own header says it is "kept
  with its unit test as the contract's reference shape". That is code kept alive only by its own
  test.
- `platform/db/watermark-kernel.ts:52-59` `reconcileMirror` has no production caller either. The
  base `sqlite/watermark.ts` version had none as well, and it was ported rather than dropped.
- Fix direction: delete both, or wire `reconcileMirror` into boot if SPEC-016 U-004 is still
  wanted. As things stand, U-004 (boot mirror reconciliation) is not implemented on any dialect.
  This is not a regression, but the new doc comments read as if it were.

### L3 (low). `kernelStampWatermark` succeeds silently when the singleton row is missing
- `platform/db/watermark-kernel.ts:22-32` runs an UPDATE on `id = 1` and ignores the affected-row
  count. `prepareContentStore` creates the row on every boot path that stamps (`boot-site-dir.ts:132`,
  `open-site-store.ts:215`, `open-site-content-db.ts:44`, `init-site.ts:243`). But any future path
  that opens a store without `prepareContentStore` and then stamps would lose every stamp without an
  error. The base Drizzle version behaved the same way (it returned `row?.value ?? 0`), so this is
  PLAUSIBLE hardening, not a regression.
- Fix direction: use `numUpdatedRows === 0n` → throw, or an upsert.

## Notes (checked, no new finding)

### `sqlite/db-ops.ts`
- `readWatermark` is now async: `readKernelWatermark(contentKernel(deps.db))`. The infra adapter
  awaits it (`@jini-ai/infra/src/db/sqlite/db-ops.ts:64`, `await this.readWatermark()`), so the
  restore point is still stamped with a number and not a Promise.
- `contentKernel(deps.db)` on each capture does not build a second kernel: `sqliteKernel` memoizes
  per better-sqlite3 client (`kernel/drivers/sqlite.ts:81-83`). The stamp (via
  `sqlite-only-services.ts:21`) and this read share one kernel, so they share one transaction scope
  and one turn lock.

### Watermark: what replaced `watermark.ts` and `content-watermark-adapter.ts`
- At base, the only production stamp was taxonomy's `sqliteStampWatermark`: synchronous and
  autocommit, not inside a transaction (its own doc says so). At HEAD it is `kernelStampWatermark`,
  also autocommit or joining an open kernel transaction. Jini cms's taxonomy write-service awaits
  it at every site (`@jini-ai/cms/src/taxonomy/write-service.ts:249,308,394,523,570,665,713,913,997`).
  Atomicity is unchanged. Nothing that used to happen has stopped.
- At base, `SqliteContentWatermarkAdapter` had no production caller: entries and content-types never
  got a `watermark` dep. Deleting it loses nothing.
- The base header's claim that "gateway.ts calls `stampWatermarkTx` inside its transaction" was
  already false at base (no such caller).
- The watermark row used to be created by `openContentDb`'s `ensureWatermarkRow`. It is now created
  by `prepareContentStore` (ON CONFLICT DO NOTHING) on all four boot paths above.

### Postgres jsonb (handoff item 5)
- JSON columns are `jsonb` on PG (`schema.postgres.ts:17-21`). `kernel/drivers/pg-types.ts:6-10`
  documents the key reordering. `publish-content/content-hash.ts` `canonicalize` sorts keys before
  hashing, so the publish hashes do not depend on key order. I did not trace every JSON-carrying
  field into `canonicalize`, only the entry point.
- A `\u0000` inside a JSON string is rejected by jsonb ("unsupported Unicode escape sequence"). So
  user content containing a NUL character saves on SQLite and fails on PG. This is not new in this
  range: the `jsonText` jsonb column predates it, and `migration/manifest.ts:350-352` already
  discloses it for transfer. Reported for awareness only.

## Architecture
- The introspection adapter reaching the store only through the kernel (`query`, `tableExists`)
  matches ADR-067. Its `Sqlite…` name on a dialect-neutral class is part 2's L7 and is not repeated
  here. M1 is the behavioural consequence of that naming: the class kept its SQLite-only logic.

## Not reviewed
- The admin UI rendering of `migrationsTableReadable: false` or a 78-item pending list. The impact in
  M1 is stated at the port level only.
- Every JSON field's path into `canonicalize` (the jsonb key-order question), beyond the entry point.
