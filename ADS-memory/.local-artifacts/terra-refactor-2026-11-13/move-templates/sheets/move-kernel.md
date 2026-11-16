# website/platform/db/kernel — PARTIAL: 1 executable slice, 2 more need Opus (W1 #17). Written 2026-11-16 from Tovu `b28d38c6` / Jini `b7666092`.
Skeleton: `make-sheet.py website/platform/db/kernel --kind all` (move-kernel 5 files, split-kernel 4 files). KIND-SUSPECT: none.
untangle_overlap: yes — C3.repoint.tsv:307 (`kernel/ops.ts`), C3.repoint.tsv:310 (`kernel/drivers/sqlite.ts`), C3t.repoint.tsv:74 (`kernel/sqlite-only.ts`: `./port.js` -> `@jini-ai/db/kernel`). MV-kernel-1 touches none of those three files and may run now. Every other slice: **execute after wave B merge**.

## Slices
| id | files | status |
|---|---|---|
| MV-kernel-1 | checkpoint-stopped-wal.ts (19), stopped-database.ts (52) | READY (below) |
| MV-kernel-2 | sqlite-only.ts (120) -> `@jini-ai/db/kernel/sqlite` | NOT FILLED: after C3t:74 lands (its only import changes); 10 importers (8 tests, `publish-backstop-ports.ts:1`, `import-database/repo.sqlite.ts:12`, type-only `publish-backstop-row.sqlite.ts:3`) + the no-raw-sqlite boundary allow-entry the survey names. Sonnet tier after C3. |
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
