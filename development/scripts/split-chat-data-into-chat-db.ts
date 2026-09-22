/**
 * @file One-time data migration: copies existing rows out of a site's `content.db` chat tables
 * (`ai_chats`, `ai_chat_messages`, `assistant_agent_sessions`) into its sidecar `chat.db`
 * (`apps/website/src/platform/db/sqlite/chat-db.ts`'s `openChatDb`), then deletes those same rows
 * from `content.db`.
 *
 * ## Why this exists
 *
 * `chat-db.ts` split those three tables into their own file so a whole-file `content.db`
 * restore/duplicate never carries (or erases) chat history
 * (`ADS-memory/reports/2026-09-05-db-split-scoping.md` §6). That split is wiring-only — it does
 * NOT touch rows already written into an already-deployed `content.db`. This script is the
 * one-time copy for that existing data, per the owner's own ruling: "Copy them out of ContentDB
 * into ChatsDB. and then you can delete them from ContentDB."
 *
 * ## Safety — same shape as the `backfill-*-aad.ts` family (see `backfill-db-path.ts`)
 *
 * - **Dry run by default.** Destructive work (copying into chat.db AND deleting from content.db)
 *   happens only behind `--apply`.
 * - **A dry run opens content.db strictly read-only** (`openContentDbReadOnly`) and never opens or
 *   creates `chat.db` at all — not even an empty file. This is the exact bug `1e2dc23f` fixed in
 *   `backfill-reset-admin-password.ts`: that script called the migrating `openContentDb()` before
 *   its `--apply` check, so every dry run wrote to a live database. This script never does.
 * - **`--db` must already exist** (`resolveExistingDbPath`) — a mistyped path errors loudly
 *   instead of silently opening (and migrating) a brand-new empty database and reporting "0 rows"
 *   as a false all-clear.
 * - **The two databases must not be the same file** (`resolveChatDbPath`). Aimed at one file, every
 *   safety property above inverts into total data loss and still reports success: `openChatDb`'s
 *   DDL is all `CREATE TABLE IF NOT EXISTS` so the second open succeeds silently, every
 *   `INSERT OR IGNORE` no-ops against the rows already there, verification reads those same rows
 *   back and finds them byte-identical (the "copy landed" signal), and the delete pass then removes
 *   every chat row from the only file that ever held them. Refused before either database is
 *   opened, on a dry run as well as an `--apply`.
 * - **Copy, verify, THEN delete, always in that order.** Verification is a full-row content
 *   checksum per source row, keyed by that table's real primary key — not just a row count, which
 *   could match by coincidence. If EVEN ONE row fails verification (missing from chat.db, or
 *   present with different content — a genuine conflict), the script aborts and deletes NOTHING
 *   from content.db, in any table, for this run.
 * - **Only the rows read and verified this run are deleted, by primary key** — never a blanket
 *   `DELETE FROM ai_chats`. A chat message written to content.db between this script's read and
 *   its delete (the app can be live) is left alone rather than silently lost.
 * - **The delete runs inside one transaction** on content.db; the copy runs inside one transaction
 *   on chat.db. If the process crashes between the two, re-running is safe (see below) — it is not
 *   a torn state that needs manual repair.
 * - **Idempotent / safe to re-run.** Every insert into chat.db is `INSERT OR IGNORE` keyed on that
 *   table's real primary key, so re-running against rows already copied (but not yet deleted, e.g.
 *   after a crash) verifies clean and proceeds to delete them. Re-running after a full prior
 *   success finds zero source rows and reports "nothing to migrate" rather than erroring or
 *   duplicating.
 * - No `IN (...)` clause is used anywhere (every read/insert/delete is scoped to one row's own
 *   primary key at a time), so there is no SQLite bound-parameter limit to worry about regardless
 *   of row count.
 *
 * ## Usage
 *
 *   npx tsx development/scripts/split-chat-data-into-chat-db.ts --db <path/to/content.db>                (dry run)
 *   npx tsx development/scripts/split-chat-data-into-chat-db.ts --db <path/to/content.db> --apply
 *   npx tsx development/scripts/split-chat-data-into-chat-db.ts --db <path> --chat-db <path> --apply     (explicit destination)
 *
 * `--chat-db` defaults to `<dirname of --db>/chat.db` (matching `deps.ts`'s `defaultChatDbPath`).
 *
 * **BACK UP `content.db` (and `chat.db`, if it already exists) before running with `--apply`.**
 * This script deletes rows from `content.db`; a mistake is only as recoverable as your backup.
 *
 * Exit codes: `0` on success (including "nothing to migrate"); `1` if verification fails or the
 * process otherwise throws. Nothing is ever deleted on a non-zero exit.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Database as SqliteDatabase } from "better-sqlite3";

import { resolveExistingDbPath } from "./backfill-db-path.js";

import { openContentDb, openContentDbReadOnly } from "../../apps/website/src/platform/db/sqlite/content-db.js";
import { openChatDb } from "../../apps/website/src/platform/db/sqlite/chat-db.js";

/** A raw-SQL table this script moves, described just enough to read/insert/delete it generically. */
interface TableSpec {
  readonly name: string;
  readonly columns: readonly string[];
  readonly keyColumns: readonly string[];
}

/**
 * Parent-first order. `ai_chats` must be inserted into chat.db before `ai_chat_messages`/
 * `assistant_agent_sessions` (both `REFERENCES ai_chats(id)`, and chat.db opens with
 * `foreign_keys = ON`) — see `chat-db.ts`. Deletion from content.db runs this list REVERSED
 * (children before parent), matching the same dependency for the same reason.
 */
const CHAT_TABLES: readonly TableSpec[] = [
  {
    name: "ai_chats",
    columns: ["id", "scope_id", "owner_kind", "owner_id", "title", "title_source", "created_at", "updated_at", "expires_at"],
    keyColumns: ["id"],
  },
  {
    name: "ai_chat_messages",
    columns: [
      "id", "conversation_id", "role", "content", "agent_id", "agent_name",
      "events_json", "attachments_json", "run_id", "run_status", "position",
      "created_at", "started_at", "ended_at",
    ],
    keyColumns: ["id"],
  },
  {
    name: "assistant_agent_sessions",
    columns: ["conversation_id", "agent_id", "session_id", "updated_at"],
    keyColumns: ["conversation_id", "agent_id"],
  },
];

type Row = Record<string, unknown>;

/** Joins a row's primary-key column(s) into one comparable string. */
function keyOf(row: Row, spec: TableSpec): string {
  return spec.keyColumns.map((c) => String(row[c])).join("\u0000");
}

/** A stable content hash of a row's own columns, in that table's fixed column order — the
 *  verification step's "did the destination row actually match" check, not just "does it exist". */
function hashRow(row: Row, spec: TableSpec): string {
  const values = spec.columns.map((c) => row[c] ?? null);
  return crypto.createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

/** Whether `name` exists as a table in `db` right now — needed because `content-db.ts`'s
 *  `dropEmptyLegacyChatTables` (`fix(db): drop empty legacy chat tables from content.db on open`,
 *  5a189cb2a) now drops each of these three tables from `content.db` the moment `openContentDb`
 *  finds it empty. That happens on EVERY open, including a re-open after this very script's own
 *  prior successful `--apply` emptied them — exactly the "safe to re-run, reports nothing to
 *  migrate" case this file's header promises. Without this check `readAllRows` would throw
 *  "no such table" instead of reporting zero rows. */
function tableExists(db: SqliteDatabase, name: string): boolean {
  return db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name) !== undefined;
}

function readAllRows(db: SqliteDatabase, spec: TableSpec): Row[] {
  if (!tableExists(db, spec.name)) return [];
  return db.prepare(`SELECT ${spec.columns.join(", ")} FROM ${spec.name}`).all() as Row[];
}

function readByKey(db: SqliteDatabase, spec: TableSpec): Map<string, Row> {
  const byKey = new Map<string, Row>();
  for (const row of readAllRows(db, spec)) byKey.set(keyOf(row, spec), row);
  return byKey;
}

/** One row's worth of parameters, in `spec.columns` order — shared by insert and hash. */
function paramsOf(row: Row, spec: TableSpec): unknown[] {
  return spec.columns.map((c) => row[c] ?? null);
}

/** `INSERT OR IGNORE`s every row into `db`, one statement execution per row — idempotent against
 *  a row already present from a prior (possibly crashed) run of this script. */
function insertRows(db: SqliteDatabase, spec: TableSpec, rows: readonly Row[]): void {
  if (rows.length === 0) return;
  const placeholders = spec.columns.map(() => "?").join(", ");
  const stmt = db.prepare(`INSERT OR IGNORE INTO ${spec.name} (${spec.columns.join(", ")}) VALUES (${placeholders})`);
  for (const row of rows) stmt.run(...paramsOf(row, spec));
}

/** Deletes exactly the given rows, by primary key, one statement execution per row — never a
 *  blanket `DELETE FROM <table>`. Returns the number of rows actually removed. */
function deleteRows(db: SqliteDatabase, spec: TableSpec, rows: readonly Row[]): number {
  if (rows.length === 0) return 0;
  const whereClause = spec.keyColumns.map((c) => `${c} = ?`).join(" AND ");
  const stmt = db.prepare(`DELETE FROM ${spec.name} WHERE ${whereClause}`);
  let deleted = 0;
  for (const row of rows) deleted += stmt.run(...spec.keyColumns.map((c) => row[c])).changes;
  return deleted;
}

export interface TableSnapshot {
  readonly rows: readonly Row[];
  readonly count: number;
  /** First 16 hex chars of a sha256 over the row keys, sorted — a quick operator-visible fingerprint,
   *  NOT the verification mechanism itself (that is {@link findMismatches}' per-row content hash). */
  readonly keyChecksum: string;
}

export interface ChatSplitPlan {
  readonly perTable: ReadonlyMap<string, TableSnapshot>;
  readonly totalRows: number;
}

function snapshotTable(spec: TableSpec, rows: readonly Row[]): TableSnapshot {
  const sortedKeys = rows.map((r) => keyOf(r, spec)).sort();
  const keyChecksum = crypto.createHash("sha256").update(sortedKeys.join("\n")).digest("hex").slice(0, 16);
  return { rows, count: rows.length, keyChecksum };
}

/** Reads (never writes) the current state of all three chat tables in `contentDb`. Safe to call
 *  against a read-only connection — this is the whole of what a dry run does. */
export function readChatSplitPlan(contentDb: SqliteDatabase): ChatSplitPlan {
  const perTable = new Map<string, TableSnapshot>();
  let totalRows = 0;
  for (const spec of CHAT_TABLES) {
    const rows = readAllRows(contentDb, spec);
    perTable.set(spec.name, snapshotTable(spec, rows));
    totalRows += rows.length;
  }
  return { perTable, totalRows };
}

export interface TableMismatch {
  readonly table: string;
  readonly key: string;
  readonly reason: "missing_in_destination" | "content_mismatch";
}

/** Every source row that is either absent from `destByKey` or present with different content. An
 *  empty result is the ONLY condition under which this script is allowed to delete anything. */
function findMismatches(spec: TableSpec, sourceRows: readonly Row[], destByKey: Map<string, Row>): TableMismatch[] {
  const mismatches: TableMismatch[] = [];
  for (const row of sourceRows) {
    const key = keyOf(row, spec);
    const destRow = destByKey.get(key);
    if (!destRow) {
      mismatches.push({ table: spec.name, key, reason: "missing_in_destination" });
    } else if (hashRow(destRow, spec) !== hashRow(row, spec)) {
      mismatches.push({ table: spec.name, key, reason: "content_mismatch" });
    } else {
      // Row present with matching content — no mismatch to record.
    }
  }
  return mismatches;
}

/** Prints the dry-run report and returns the plan it was built from (so a caller/test can assert
 *  on the same numbers without re-reading). Never opens or creates chat.db. */
export function reportDryRun(contentDb: SqliteDatabase, log: (message: string) => void = console.log): ChatSplitPlan {
  const plan = readChatSplitPlan(contentDb);
  log("DRY RUN — content.db was opened READ-ONLY; chat.db was not opened or created.");
  for (const spec of CHAT_TABLES) {
    const snapshot = plan.perTable.get(spec.name)!;
    log(
      `  ${spec.name}: ${snapshot.count} row(s) would be copied to chat.db and then deleted from ` +
        `content.db (key checksum=${snapshot.keyChecksum})`
    );
  }
  log(`DRY RUN total: ${plan.totalRows} row(s) across all 3 tables. Re-run with --apply to write. Back up content.db first.`);
  return plan;
}

export interface ChatSplitTableResult {
  readonly table: string;
  readonly sourceCount: number;
  readonly deleted: number;
}

export interface ChatSplitApplyResult {
  readonly migrated: number;
  readonly perTable: readonly ChatSplitTableResult[];
}

/**
 * Copies every current chat row from `contentDb` into `chatDb`, verifies every one landed with
 * identical content, then deletes exactly those rows from `contentDb`. Throws (deleting nothing)
 * if verification finds any row missing or changed.
 *
 * @complexity O(n) in total chat row count — each row is read, hashed, and written/deleted at
 *   most once; no `IN (...)` clause, so no SQLite bound-parameter ceiling regardless of scale.
 */
export function applyChatSplit(deps: {
  contentDb: SqliteDatabase;
  chatDb: SqliteDatabase;
  log?: (message: string) => void;
}): ChatSplitApplyResult {
  const log = deps.log ?? ((message: string) => console.log(message));
  const plan = readChatSplitPlan(deps.contentDb);

  if (plan.totalRows === 0) {
    log("Nothing to migrate — content.db has zero rows across ai_chats/ai_chat_messages/assistant_agent_sessions.");
    return { migrated: 0, perTable: CHAT_TABLES.map((spec) => ({ table: spec.name, sourceCount: 0, deleted: 0 })) };
  }

  const copy = deps.chatDb.transaction(() => {
    for (const spec of CHAT_TABLES) insertRows(deps.chatDb, spec, plan.perTable.get(spec.name)!.rows);
  });
  copy();

  const mismatches = CHAT_TABLES.flatMap((spec) =>
    findMismatches(spec, plan.perTable.get(spec.name)!.rows, readByKey(deps.chatDb, spec))
  );
  if (mismatches.length > 0) {
    log(`ABORTING — ${mismatches.length} row(s) failed verification; nothing was deleted from content.db:`);
    for (const mismatch of mismatches.slice(0, 20)) log(`  ${mismatch.table} key=${mismatch.key} reason=${mismatch.reason}`);
    throw new Error(
      `split-chat-data-into-chat-db: verification failed for ${mismatches.length} row(s) — see log above. Nothing deleted.`
    );
  }

  const deletedByTable = new Map<string, number>();
  const del = deps.contentDb.transaction(() => {
    for (const spec of [...CHAT_TABLES].reverse()) {
      deletedByTable.set(spec.name, deleteRows(deps.contentDb, spec, plan.perTable.get(spec.name)!.rows));
    }
  });
  del();

  const perTable = CHAT_TABLES.map((spec) => ({
    table: spec.name,
    sourceCount: plan.perTable.get(spec.name)!.count,
    deleted: deletedByTable.get(spec.name) ?? 0,
  }));
  const migrated = perTable.reduce((sum, t) => sum + t.deleted, 0);
  log(`Done: ${migrated} row(s) copied to chat.db and removed from content.db.`);
  return { migrated, perTable };
}

interface Args {
  readonly dbPath: string;
  readonly chatDbPath?: string;
  readonly apply: boolean;
}

/** Deliberately has NO default `--db` path (unlike the `backfill-*-aad.ts` siblings, which default
 *  to `infra/content.db`): this script deletes rows, so a caller must name the real database
 *  explicitly rather than risk ever targeting a repo-root guess. */
function parseArgs(argv: readonly string[]): Args {
  const dbFlag = argv.indexOf("--db");
  if (dbFlag === -1 || argv[dbFlag + 1] === undefined) {
    throw new Error("split-chat-data-into-chat-db: --db <path/to/content.db> is required.");
  }
  const chatDbFlag = argv.indexOf("--chat-db");
  return {
    dbPath: argv[dbFlag + 1],
    chatDbPath: chatDbFlag === -1 ? undefined : argv[chatDbFlag + 1],
    apply: argv.includes("--apply"),
  };
}

/**
 * The exact operator-facing text for "both databases name one file". Exported so tests assert on
 * the real string rather than a paraphrase of it — same convention as `backfill-db-path.ts`'s
 * {@link import("./backfill-db-path.js").missingDbPathMessage}.
 */
export function sameDatabaseMessage(resolvedPath: string): string {
  return (
    `split-chat-data-into-chat-db: --db and --chat-db resolve to the same file (${resolvedPath}) — refusing to run. ` +
    `Copying a database onto itself verifies clean (every row is already "there") and then deletes every ` +
    `chat row from the only file holding them. Point --chat-db at a DIFFERENT path.`
  );
}

/**
 * `filePath` reduced to a canonical identity for the same-file comparison below — resolved to an
 * absolute path and, where the filesystem can say, through symlinks.
 *
 * Three tiers, because the destination usually does not exist yet: realpath the file itself when it
 * is there (this is what catches a `chat.db` symlinked at `content.db` — two names, one inode);
 * otherwise realpath its PARENT and re-join the basename (catches a symlinked directory); otherwise
 * fall back to the plain resolved path. The fallback can only ever make the guard less sensitive,
 * never wrong: two identical strings still compare equal.
 *
 * @complexity O(1) — at most two `realpathSync` calls.
 */
function canonicalFilePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  try {
    return fs.realpathSync(resolved);
  } catch {
    try {
      return path.join(fs.realpathSync(path.dirname(resolved)), path.basename(resolved));
    } catch {
      return resolved;
    }
  }
}

/**
 * `<dirname of content.db>/chat.db`, mirroring `deps.ts`'s `defaultChatDbPath` — duplicated here
 * (rather than imported) so this standalone script does not pull in the ~1500-line composition
 * root just for one path expression.
 *
 * Also the chokepoint for the same-file refusal, because this is the one place both paths are known
 * at once. The check covers the DEFAULT as well as an explicit `--chat-db`: a content database that
 * simply happens to be named `chat.db` aims both handles at one file with no operator mistake
 * visible anywhere on the command line.
 *
 * @throws {Error} `sameDatabaseMessage(...)` when both paths name one file.
 * @complexity O(1) beyond {@link canonicalFilePath}'s own cost.
 */
export function resolveChatDbPath(dbPath: string, explicit?: string): string {
  const chatDbPath = explicit ? path.resolve(explicit) : path.join(path.dirname(dbPath), "chat.db");
  if (canonicalFilePath(chatDbPath) === canonicalFilePath(dbPath)) {
    throw new Error(sameDatabaseMessage(canonicalFilePath(dbPath)));
  }
  return chatDbPath;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // Prove content.db is really there BEFORE opening it — same guard the AAD backfill scripts use
  // (backfill-db-path.ts): a mistyped --db must error, not silently open (and migrate) an empty db.
  const dbPath = resolveExistingDbPath(args.dbPath);
  const chatDbPath = resolveChatDbPath(dbPath, args.chatDbPath);

  if (!args.apply) {
    // Read-only open: a dry run must never migrate content.db, and must never open (let alone
    // create) chat.db at all — this is the exact bug 1e2dc23f fixed in a sibling script.
    const contentDb = openContentDbReadOnly(dbPath);
    try {
      reportDryRun(contentDb.$client);
    } finally {
      contentDb.$client.close();
    }
    return;
  }

  console.log("BACK UP content.db (and chat.db, if it already exists) before continuing. This run deletes rows from content.db.");
  console.log(`content.db: ${dbPath}`);
  console.log(`chat.db:    ${chatDbPath}`);

  const contentDb = openContentDb(dbPath);
  const chatDb = openChatDb(chatDbPath);
  try {
    applyChatSplit({ contentDb: contentDb.$client, chatDb });
  } finally {
    chatDb.close();
    contentDb.$client.close();
  }
}

/**
 * Guards `main()` behind an entry-point check — UNLIKE the `backfill-*-aad.ts` siblings, which
 * call `main()` unconditionally at module load (their own tests only ever spawn them as a child
 * process for exactly this reason, per `backfill-reset-admin-password.test.ts`'s header comment).
 * This script's core functions (`readChatSplitPlan`/`reportDryRun`/`applyChatSplit`) are exported
 * for direct unit testing against real temp-file fixtures — importing them for that must NOT also
 * run the CLI against the test runner's own `process.argv`. Running via `npx tsx <this file>` is
 * unaffected: `process.argv[1]` is this file's own path in that case, so `main()` still runs.
 */
const isEntryPoint = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntryPoint) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
