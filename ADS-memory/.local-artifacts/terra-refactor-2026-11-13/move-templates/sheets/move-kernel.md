# website/platform/db/kernel — PARTIAL: 2 executable slices (MV-kernel-1 now, MV-kernel-2 after wave B); MV-kernel-3 and SP x4 need Opus (W1 #17). Written 2026-11-16 from Tovu `b28d38c6` / Jini `b7666092`.
Skeleton: `make-sheet.py website/platform/db/kernel --kind all` (move-kernel 5 files, split-kernel 4 files). KIND-SUSPECT: none.
untangle_overlap: yes — C3.repoint.tsv:307 (`kernel/ops.ts`), C3.repoint.tsv:310 (`kernel/drivers/sqlite.ts`), C3t.repoint.tsv:74 (`kernel/sqlite-only.ts`: `./port.js` -> `@jini-ai/db/kernel`). MV-kernel-1 touches none of those three files and may run now. Every other slice: **execute after wave B merge**.

## Slices
| id | files | status |
|---|---|---|
| MV-kernel-1 | checkpoint-stopped-wal.ts (19), stopped-database.ts (52) | READY (below) |
| MV-kernel-2 | sqlite-only.ts (120) -> `@jini-ai/db/kernel/sqlite` | READY (group F, below), **after wave B merge** (C3t:74 rewrites its line 3 and adds the Jini kernel type it names) |
| MV-kernel-3 | key-dependent-data.ts (105, MOVE-AFTER) | BLOCKED (re-kind to SPLIT): survey says it hard-codes the `webhook_subscriptions` table and the vault-restore-artifact rule, i.e. product facts. Needs an Opus split (table list as a port). |
| SP-kernel-1..4 | tool-catalog-query.ts (187), drivers/sqlite.ts (59), ops.ts (37), legacy-sqlite.ts (200), site-dir/duplicate-pglite-store.ts (97) | NOT FILLED: MIXED, two of them on C3 rows, `drivers/sqlite.ts` is MOVE-AFTER "Jini driver generic over the connection type" (not in Jini yet). `tool-catalog-query.ts` and `duplicate-pglite-store.ts` belong to other folders (assistant, site-dir) and are listed here only by the backlog; site-dir's sheet (split-site-dir.md) does not duplicate duplicate-pglite-store.ts. Opus tier. |

---------------------------------------------------------------------------------------------------
## Slice MV-kernel-1 (template T-MOVE) — stopped-SQLite admission + WAL checkpoint into `@jini-ai/db/sqlite`
Decision: both files move into ONE new Jini leaf `packages/db/src/sqlite/stopped.ts`. The native opener (`openNativeSqlite`, Tovu's better-sqlite3 binding) becomes a REQUIRED `open` port, so Tovu keeps `stopped-database.ts` as a 2-function binding that passes `open: openNativeSqlite` (STAY-WIRING; it adds a value, so it is not a forwarder). Error wording moves verbatim (no behaviour change, every Tovu assertion keeps its text). Follow-up (not this slice): neutral wording for "site" in three messages is a behaviour change for a later sheet.
```
id: MV-kernel-1
feature: website/platform/db/kernel
precondition: -
tovu_files:
  - apps/website/src/platform/db/kernel/checkpoint-stopped-wal.ts | blob 7411b4ae2a07b71e71e46b6230ca2e7b2c111ca8 | delete
  - apps/website/src/platform/db/kernel/stopped-database.ts | blob 77413d216b746284627abdc9408699bbd5bfecd0 | keep-reduced (becomes the binding below)
tovu_tests:
  - apps/website/src/platform/db/kernel/__tests__/checkpoint-stopped-wal.unit.test.ts | blob 285f262d174df0710dffb95a0861b60ddb708388 | move-to-jini
  - apps/website/src/platform/site-dir/__tests__/integration/move-sites-home.integration.test.ts | (no edit; it calls the Tovu binding through move-sites-home.ts, signature unchanged)
jini_target: db ./sqlite packages/db/src/sqlite/stopped.ts
jini_guards:
  - packages/db/src/sqlite/stopped.ts must not exist; packages/db/src/sqlite/__tests__/stopped.test.ts must not exist
  - packages/db/src/sqlite/index.ts blob c9cfb008d997645e91b0f65dfc695c5790aaea02
  - rg -n "checkpointStoppedSqliteWal|assertSqliteStopped|inspectStoppedSqlite|StoppedSqliteOpener" packages/db/src -> prints nothing
symbol_map:
  - checkpointStoppedSqliteWal -> @jini-ai/db/sqlite checkpointStoppedSqliteWal (db type: better-sqlite3 `Database.Database` -> `Pick<SqliteClient, "pragma">`)
  - assertDatabaseStopped -> @jini-ai/db/sqlite assertSqliteStopped (required gains `open: StoppedSqliteOpener`)
  - inspectStoppedDatabase -> @jini-ai/db/sqlite inspectStoppedSqlite (required gains `open: StoppedSqliteOpener`; optional `verifyIntegrity` unchanged)
values_injected:
  - Tovu `openNativeSqlite` (better-sqlite3 constructor binding) -> required.open (Tovu passes `openNativeSqlite`)
leaf_import_rewrites:
  - 'import { verifySqliteIntegrity } from "@jini-ai/db/sqlite";' -> "import { verifySqliteIntegrity } from './inspect.js';"
  - 'import type Database from "better-sqlite3";' -> "import type { SqliteClient } from './types.js';"
  - 'import { openNativeSqlite } from "./drivers/sqlite.js";' and 'import { checkpointStoppedSqliteWal } from "./checkpoint-stopped-wal.js";' -> deleted (open is a port; the checkpoint is in the same file)
jini_code: |
  NEW packages/db/src/sqlite/stopped.ts, exactly (bodies verbatim apart from `open` and the db type):
  /**
   * @module stopped
   *
   * Native stopped-database admission and verification. SQLite's exclusive lock is the admission
   * proof; nothing is copied while any process still holds the database. The host passes its own
   * opener (its copy of better-sqlite3), so this module never loads a driver.
   */
  import fs from 'node:fs';
  import path from 'node:path';
  import { verifySqliteIntegrity } from './inspect.js';
  import type { SqliteClient } from './types.js';

  /** The host's native opener: `(file, options) => new Database(file, options)`. */
  export type StoppedSqliteOpener = (file: string, options: { readonly?: boolean; fileMustExist?: boolean; timeout?: number }) => Pick<SqliteClient, 'exec' | 'pragma' | 'close'>;

  <tovu checkpoint-stopped-wal.ts lines 4-19 verbatim (doc block + function), with only the signature line changed to:>
  export function checkpointStoppedSqliteWal({ db, path: file }: { db: Pick<SqliteClient, 'pragma'>; path: string }, _options = {}): void {

  <tovu stopped-database.ts lines 7-27 verbatim (doc block + assertDatabaseStopped), with only these two lines changed:>
  export function assertSqliteStopped({ path: file, open }: { path: string; open: StoppedSqliteOpener }, _options = {}): void {
    const db = open(file, { fileMustExist: true, timeout: 0 });

  <tovu stopped-database.ts lines 28-50 verbatim (doc block + inspectStoppedDatabase), with only these lines changed:>
  export function inspectStoppedSqlite({ path: file, open }: { path: string; open: StoppedSqliteOpener }, { verifyIntegrity = verifySqliteIntegrity }: { verifyIntegrity?: typeof verifySqliteIntegrity } = {}): string {
    let db: ReturnType<StoppedSqliteOpener> | undefined;
    db = open(file, { readonly: true, fileMustExist: true });
  (and in the doc block line " * @param options.verifyIntegrity - Integrity/row-count inspector; defaults to Jini's SQLite inspector." -> " * @param options.verifyIntegrity - Integrity/row-count inspector; defaults to `verifySqliteIntegrity`.")
  Blank line between declarations; file ends with a newline. Quote style: single quotes for the import lines only; bodies keep their double-quoted strings verbatim.
jini_index: packages/db/src/sqlite/index.ts: after "export { inspectSqliteDatabase, verifySqliteIntegrity } from \"./inspect.js\";" insert "export { assertSqliteStopped, checkpointStoppedSqliteWal, inspectStoppedSqlite, type StoppedSqliteOpener } from \"./stopped.js\";"
header_rewrite: (in jini_code)
why_moves: -   (both files' why-comments move with the code; none is Tovu-specific)
deletions_in_copy: line 1 of stopped-database.ts "/** Native stopped-database admission and verification, owned by the storage kernel. */" (replaced by the @module block)
entry: -   (existing ./sqlite subpath, runtime node)
census:
  cmd: rg -n --no-heading "kernel/(checkpoint-stopped-wal|stopped-database)" apps development --glob '!**/node_modules/**'
  allowed: [apps/website/src/platform/site-dir/move-sites-home.ts:4, apps/website/src/platform/site-dir/move-sites-home.ts:5, apps/website/src/platform/db/kernel/__tests__/checkpoint-stopped-wal.unit.test.ts:9 (as "../checkpoint-stopped-wal.js"), apps/website/src/platform/db/kernel/stopped-database.ts:5 (as "./checkpoint-stopped-wal.js")]
tovu_reduced: |
  apps/website/src/platform/db/kernel/stopped-database.ts becomes exactly:
  /** Tovu's binding of the stopped-database admission in `@jini-ai/db/sqlite` to its better-sqlite3 opener. */
  import { assertSqliteStopped, inspectStoppedSqlite, verifySqliteIntegrity } from "@jini-ai/db/sqlite";
  import { openNativeSqlite } from "./drivers/sqlite.js";

  /** Refuses unless no process holds the database; see `assertSqliteStopped`. */
  export function assertDatabaseStopped({ path }: { path: string }, _options = {}): void {
    assertSqliteStopped({ path, open: openNativeSqlite });
  }

  /** Strict row counts of a stopped database as JSON; see `inspectStoppedSqlite`. */
  export function inspectStoppedDatabase({ path }: { path: string }, optional: { verifyIntegrity?: typeof verifySqliteIntegrity } = {}): string {
    return inspectStoppedSqlite({ path, open: openNativeSqlite }, optional);
  }
importer_edits: -   (move-sites-home.ts:4-5 keep importing ../db/kernel/stopped-database.js; names unchanged)
test_edits: |
  NEW packages/db/src/sqlite/__tests__/stopped.test.ts = checkpoint-stopped-wal.unit.test.ts byte for byte, then:
  - 'import test from "node:test";' -> 'import { test } from "vitest";'
  - 'import type Database from "better-sqlite3";' -> 'import type { SqliteClient } from "../types.js";'
  - 'import { checkpointStoppedSqliteWal } from "../checkpoint-stopped-wal.js";' -> 'import { checkpointStoppedSqliteWal } from "../stopped.js";'
  - every 'as unknown as Database.Database' -> 'as unknown as Pick<SqliteClient, "pragma">'
  - every '"tovu-checkpoint-wal-"' -> '"jini-checkpoint-wal-"' (COMMON rule 2)
  - node:test's `(t) => { ... t.after(fn) }`: vitest's test context has no `after`; replace each `t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));` with `onTestFinished(() => fs.rmSync(tmp, { recursive: true, force: true }));`, add `onTestFinished` to the vitest import, and drop the now-unused `t` parameter (`(t) =>` -> `() =>`). Assertions (node:assert) stay verbatim.
  Then `git rm -q` the Tovu test.
changeset: .changeset/db-stopped-sqlite.md: '---\n"@jini-ai/db": minor\n---\n\nAdd `assertSqliteStopped`, `inspectStoppedSqlite` and `checkpointStoppedSqliteWal` to `@jini-ai/db/sqlite`: stopped-database admission with an injected native opener.\n'
jini_msg: "feat(db): stopped-SQLite admission and WAL checkpoint in db/sqlite with an injected opener"
tovu_msg: "refactor(db): stopped-database admission from @jini-ai/db/sqlite" | body "Tovu keeps the binding to its better-sqlite3 opener."
extra_stops: if `rg -n "onTestFinished" packages/db/src` prints nothing AND packages/db's vitest version is < 1.3 (`node -p "require('./packages/db/node_modules/vitest/package.json').version"`), STOP (no onTestFinished). The Jini rule-2 check will hit the message text "Stop the site" ONLY if the regex were `site` — it is not; `tovu|site-chat|apps/(admin|website|desktop)` must print nothing.
```

---------------------------------------------------------------------------------------------------
## Slice MV-kernel-2 (template T-MOVE) — SQLite-only catalog primitives into `@jini-ai/db/kernel/sqlite` (group F, 2026-11-16) — execute after wave B merge
Decision: pure move. The file's own header already says "Generic (no Tovu concepts)". `kysely` is a declared `@jini-ai/db` dependency; the kernel type comes from the package's own `src/kernel/port.ts` (leaf). No Tovu value. The no-raw-SQLite ratchet (`kernel/__tests__/no-raw-sqlite.boundary.test.ts`) scans only OUTSIDE `platform/db/kernel`, so deleting this kernel file changes no baseline count. The Tovu test stays in Tovu (it drives Tovu's own sqlite and pglite drivers) and is repointed; it covers the Jini code in the cloud run.
```
id: MV-kernel-2
feature: website/platform/db/kernel
precondition: wave B (C3t row 74) merged: `sed -n 3p apps/website/src/platform/db/kernel/sqlite-only.ts` no longer reads 'import type { StorageKernel } from "./port.js";'. Else SKIPPED "precondition not landed".
tovu_files:
  - apps/website/src/platform/db/kernel/sqlite-only.ts | pre-wave-B blob 0c84998f7af05a1c88b773b7d84bf78282c8c57e; after the merge `git diff b28d38c6 -- <file>` must change only line 3, else STOP | delete
  - apps/website/src/platform/db/kernel/index.ts | text-guarded (C3 rows edit this barrel) | keep-reduced (delete the sqlite-only re-export block)
tovu_tests:
  - apps/website/src/platform/db/kernel/__tests__/sqlite-only.test.ts | blob 6a02a2b889436c382a12e008fbcc0b3ddf3a26da | keep-repointed
jini_target: db ./kernel/sqlite packages/db/src/kernel/sqlite/sqlite-only.ts
jini_guards:
  - packages/db/src/kernel/sqlite/sqlite-only.ts must not exist
  - packages/db/src/kernel/sqlite/index.ts blob 3d73dd17723d276738d6430c9a175ee40f2b456f (if wave B changed it, the anchor line below must still occur once)
  - rg -n "sqliteTableInfo|sqliteForeignKeyCheckedTransaction|sqliteSchemaObjects|sqliteTableExtendedInfo" packages/db/src -> prints nothing
  - rg -n "^export interface StorageKernel<DB>" packages/db/src/kernel/port.ts -> prints one line (if C3 renamed it, use the new interface name in the leaf import below and keep `StorageKernel` as the local alias: `import type { <NewName> as StorageKernel } from "../port.js";`)
symbol_map:
  - sqliteTableInfo, sqliteTableExtendedInfo, sqliteSchemaObjects, sqliteForeignKeyCheckedTransaction, SqliteTableColumn, SqliteExtendedTableColumn, SqliteForeignKeyViolation, SqliteSchemaObject -> @jini-ai/db/kernel/sqlite (same names; shapes already object-arg)
values_injected: -
leaf_import_rewrites:
  - line 3 (whatever wave B made it) -> 'import type { StorageKernel } from "../port.js";'
  - 'import { sql } from "kysely";' unchanged
header_rewrite: |
  replace lines 5-18 (the @file block) with exactly:
  /**
   * @file SQLite-only primitives with no portable equivalent, spelled once at the kernel boundary.
   *
   * Why these are not `listColumns`/`tableExists` (`dialect.ts`): their callers need SQLite's OWN
   * answer, byte for byte. A peer that ships a table's `PRAGMA table_info` shape to another peer,
   * which compares it to its own and hashes it into a row's content hash, needs the declared type to
   * keep its case and `pk` to keep its key ordinal. `listColumns` lower-cases the type and folds `pk`
   * to a boolean, which would make an upgraded peer disagree with an older one about the same table.
   * The deferred foreign-key check is SQLite's `defer_foreign_keys` + `foreign_key_check` pair;
   * Postgres has no statement-level equivalent.
   */
why_moves:
  - "Publish's \"send by hand\" (`apps/website/src/features/publish-content/publish-backstop-row.sqlite.ts`)" (old line 10) -> not kept anywhere new: publish-backstop-row.sqlite.ts already documents its own use; the generic reason is in the Jini header above.
deletions_in_copy:
  - " * Kept here until Jini publishes this primitive; the installed driver has no such export." (tracking pointer, COMMON rule 12)
  - on parameter lines only: every "_optional: Record<string, never> = {}" -> "_optional = {}" and "_options: Record<string, never> = {}" -> "_options = {}" (COMMON rule 10; 4 places: requireSqlite, sqliteSchemaObjects, sqliteTableInfo, sqliteForeignKeyCheckedTransaction). The `optional?: Record<string, never>` inside the `onViolation` TYPE stays.
entry: -   (existing ./kernel/sqlite subpath)
jini_index: packages/db/src/kernel/sqlite/index.ts: after 'export { sqliteOps, copySqliteInto } from "./ops.js";' insert 'export { sqliteForeignKeyCheckedTransaction, sqliteSchemaObjects, sqliteTableExtendedInfo, sqliteTableInfo, type SqliteExtendedTableColumn, type SqliteForeignKeyViolation, type SqliteSchemaObject, type SqliteTableColumn } from "./sqlite-only.js";'
census:
  cmd: rg -n --no-heading "kernel/sqlite-only|\./sqlite-only\.js|\.\./sqlite-only\.js" apps content development --glob '!**/node_modules/**'
  allowed: [apps/website/src/features/publish-content/publish-backstop-row.sqlite.ts:3, apps/website/src/features/publish-content/__tests__/raw-row-contributor.test.ts:1-2, apps/website/src/features/publish-content/__tests__/backstop-batch.apply-loop.test.ts:1-2, apps/website/src/platform/db/sqlite/__tests__/publish-backstop-row.sqlite.test.ts:1-2, apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/import.routes.pins.test.ts:1-2, apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/backstop-import-ui.routes.test.ts:1-2, apps/website/src/server/runtime/composition/publish-backstop-ports.ts:1, apps/website/src/server/runtime/composition/import-database/repo.sqlite.ts:12, apps/website/src/server/runtime/composition/__tests__/publish-content-manifest.test.ts:1-2, apps/website/src/platform/db/kernel/__tests__/sqlite-only.test.ts:9, apps/website/src/platform/db/kernel/index.ts:45]
  (`sqlite-only-services` in composition is a different module: the pattern above does not match it; if it does, ignore those lines.)
importer_edits: |
  In every allowed line except kernel/index.ts, replace only the module specifier, keeping the imported names and `import type`:
  - "#src/platform/db/kernel/sqlite-only" -> "@jini-ai/db/kernel/sqlite"  (publish-backstop-ports.ts:1, repo.sqlite.ts:12, and both lines of the 6 test files)
  - "../../platform/db/kernel/sqlite-only.js" -> "@jini-ai/db/kernel/sqlite"  (publish-backstop-row.sqlite.ts:3)
  - "../sqlite-only.js" -> "@jini-ai/db/kernel/sqlite"  (kernel/__tests__/sqlite-only.test.ts:9)
  apps/website/src/platform/db/kernel/index.ts: delete exactly these 6 lines (they occur once; no file imports these names through the barrel — checked 2026-11-16):
  export {
    type SqliteForeignKeyViolation,
    sqliteForeignKeyCheckedTransaction,
    type SqliteTableColumn,
    sqliteTableInfo,
  } from "./sqlite-only.js";
test_edits: - (no test moves)
changeset: .changeset/db-kernel-sqlite-only.md: '---\n"@jini-ai/db": minor\n---\n\nAdd the SQLite-only catalog primitives `sqliteTableInfo`, `sqliteTableExtendedInfo`, `sqliteSchemaObjects` and `sqliteForeignKeyCheckedTransaction` to `@jini-ai/db/kernel/sqlite`.\n'
jini_msg: "feat(db): SQLite-only catalog primitives in kernel/sqlite" | body "Exact PRAGMA table_info/xinfo, sqlite_schema and the deferred foreign-key check, refused on other dialects."
tovu_msg: "refactor(db): SQLite-only kernel primitives from @jini-ai/db/kernel/sqlite" | body "Moved unchanged; 10 importers repointed."
extra_stops: before the Tovu commit, `rg -n "Sqlite(TableColumn|ForeignKeyViolation)|sqlite(TableInfo|ForeignKeyCheckedTransaction)" apps/website/src --glob '!**/node_modules/**' | rg "platform/db/kernel\"|kernel/index"` must print nothing (no barrel importer appeared since 2026-11-16).
```
Expected cloud run: Jini db typecheck + subpath isolation; Tovu typecheck, `kernel/__tests__/sqlite-only.test.ts`, the 6 publish-content tests, `no-raw-sqlite.boundary.test.ts`.

## Remaining kernel slices (group F triage, not filled)
- MV-kernel-3 `key-dependent-data.ts`: BLOCKED (re-kind SPLIT, Opus): the `webhook_subscriptions` table and the vault-restore-artifact rule are product facts; the table list becomes a required value. Not filled for budget.
- SP-kernel-1..4: unchanged from group B (Opus; `drivers/sqlite.ts` MOVE-AFTER "Jini driver generic over the connection type", `ops.ts` and `drivers/sqlite.ts` on C3 rows 307/310: after wave B). `tool-catalog-query.ts` belongs to the assistant feature and `duplicate-pglite-store.ts` to site-dir; neither is planned here.
