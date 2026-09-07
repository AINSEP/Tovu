import type Database from "better-sqlite3";

/**
 * @file Boot-time detection of chat rows stranded in `content.db` by the `chat.db` split.
 *
 * ## Why this exists
 *
 * `chat-db.ts` moved `ai_chats`/`ai_chat_messages`/`assistant_agent_sessions` into a sidecar
 * `chat.db` so a whole-file `content.db` restore/duplicate never carries (or erases) conversation
 * history. That change was wiring-only: `deps.ts` points `createChatStoreFactory` and
 * `createSqliteAgentSessionStore` at the new file, and from that boot onward every conversation is
 * written there. Rows already in `content.db` were neither moved nor noticed — the stores simply
 * stopped reading the file they were in.
 *
 * The result is silent data invisibility, not data loss. Verified read-only against the owner's own
 * site on 2026-09-06: `sites/tovu-com/content.db` held 157 `ai_chats` / 562 `ai_chat_messages` /
 * 19 `assistant_agent_sessions`, while `sites/tovu-com/chat.db` held 11 / 40 / 6. The assistant was
 * listing 11 conversations out of 168, and nothing in the product, the logs, or the boot path said
 * so. `development/scripts/split-chat-data-into-chat-db.ts` — the script that moves them — is
 * manual, dry-run by default, and requires an explicit `--db`, so a self-hoster upgrading past the
 * split had no way to learn it existed.
 *
 * ## What this module does, and deliberately does not do
 *
 * It counts, formats, and prints. It never writes. Three alternatives were weighed and rejected:
 *
 * - **Migrate automatically at boot.** `applyChatSplit` deletes rows from `content.db` after
 *   copying and verifying them; its own header says "BACK UP content.db (and chat.db, if it already
 *   exists) before running with --apply". A boot path has no backup step and no operator watching,
 *   so this would perform the one operation the migration's author said not to perform unattended.
 * - **Copy into `chat.db` without deleting from `content.db`.** Non-destructive, but it leaves the
 *   two files diverging the moment the user continues any copied conversation, after which
 *   `applyChatSplit`'s per-row content hash reports `content_mismatch` and refuses to finish — it
 *   trades a visible problem for a stuck one.
 * - **Refuse to boot.** Takes a working site offline over data that is present and intact, merely
 *   unread.
 *
 * Reversal is deleting this file and its single call in `deps.ts`'s `createSqliteRouteDeps`; there
 * is no state to unwind, because it creates none.
 */

/** Per-table row counts found in `content.db`, keyed by camelCase for the call sites' benefit. */
export interface OrphanedChatRowCounts {
  readonly aiChats: number;
  readonly aiChatMessages: number;
  readonly assistantAgentSessions: number;
}

export interface OrphanedChatRowsCheck {
  readonly counts: OrphanedChatRowCounts;
  /** Sum across all three tables — messages and agent sessions count, not just conversations. */
  readonly total: number;
  readonly orphaned: boolean;
}

/**
 * The three tables the split moved, in the order the warning prints them (parent first, matching
 * `split-chat-data-into-chat-db.ts`'s own `CHAT_TABLES` order). `key` is the field each count lands
 * in; `table` is the literal SQL identifier, interpolated only from this frozen list — never from
 * caller input.
 */
const CHAT_TABLES = [
  { table: "ai_chats", key: "aiChats" },
  { table: "ai_chat_messages", key: "aiChatMessages" },
  { table: "assistant_agent_sessions", key: "assistantAgentSessions" },
] as const;

/**
 * {@link CHAT_TABLES}' names alone — "the tables the `chat.db` split moved out of `content.db`, and
 * which a `content.db` written before the split may therefore still physically hold".
 *
 * Exported so `site-dir/duplicate-content-db.ts` can purge exactly this set from a duplicated
 * `content.db` rather than keeping a fourth copy of these three names (this repo already has three:
 * here, `development/scripts/split-chat-data-into-chat-db.ts`'s own `CHAT_TABLES`, and the
 * `RAW_SQL_MANAGED_TABLES` registry in `platform/db/__tests__/schema-migration-drift.test.ts`).
 * Sharing it means the boot-time warning and the duplicate purge can never disagree about which
 * tables are chat: adding a fourth chat table here updates both.
 */
export const CHAT_TABLE_NAMES: readonly string[] = CHAT_TABLES.map(({ table }) => table);

/** Which of {@link CHAT_TABLES} actually exist in this database. A `content.db` that never carried
 *  them (or a future one that drops them) must count as zero rather than throwing "no such table"
 *  and taking down a boot over a diagnostic. */
function existingChatTables(db: Database.Database): Set<string> {
  const names = CHAT_TABLES.map((t) => t.table);
  const placeholders = names.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`)
    .all(...names) as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

/**
 * Counts the chat rows still present in `contentDb`. Read-only — a `SELECT` against `sqlite_master`
 * plus one `count(*)` per table that exists, nothing more; the accompanying integration test proves
 * this by running it against a `readonly: true` connection, where any write would raise
 * `SQLITE_READONLY`.
 *
 * @param contentDb Raw handle for the site's `content.db` (in `deps.ts`, `db.$client`).
 * @returns Per-table counts, their sum, and whether any were found at all.
 * @complexity O(1) statements — three bounded `count(*)` queries over indexed tables, independent of
 *   any caller-supplied collection.
 */
export function checkForOrphanedChatRows(contentDb: Database.Database): OrphanedChatRowsCheck {
  const present = existingChatTables(contentDb);
  const counts = { aiChats: 0, aiChatMessages: 0, assistantAgentSessions: 0 };
  let total = 0;
  for (const { table, key } of CHAT_TABLES) {
    if (!present.has(table)) continue;
    const row = contentDb.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number };
    counts[key] = row.n;
    total += row.n;
  }
  return { counts, total, orphaned: total > 0 };
}

/** `ai_chats                    157 row(s)` — one padded line per table, so the three counts line up
 *  in a terminal and a wrong-looking number is easy to spot. */
function countLine(table: string, count: number): string {
  return `    ${table.padEnd(26)}${String(count).padStart(8)} row(s)`;
}

/**
 * Renders the operator-facing warning for a check result, or `""` when there is nothing to say —
 * {@link warnOnOrphanedChatRows} relies on that empty string to stay completely silent on the
 * overwhelmingly common already-migrated boot.
 *
 * The text names the counts, both database paths, and the full `--db`-bearing command line for
 * `split-chat-data-into-chat-db.ts` (which has no default `--db`, deliberately — see its
 * `parseArgs` doc), because the whole failure mode this closes is an operator who has no way to
 * discover that the script exists.
 *
 * @complexity O(1) — a fixed number of string concatenations over three known tables.
 */
export function formatOrphanedChatRowsWarning(
  check: OrphanedChatRowsCheck,
  paths: { contentDbPath: string; chatDbPath: string }
): string {
  if (!check.orphaned) return "";
  const rule = "=".repeat(88);
  return [
    rule,
    `[chat-db] UNMIGRATED CONVERSATIONS — ${check.counts.aiChats} conversation(s) in content.db are NOT being shown.`,
    "-".repeat(88),
    "  This site's chat history now lives in a sidecar chat.db, but content.db still holds rows",
    "  from before that split. The assistant reads ONLY chat.db, so these conversations are",
    "  invisible everywhere in the product. Nothing is lost — they are simply not being read.",
    "",
    `    content.db  ${paths.contentDbPath}`,
    `    chat.db     ${paths.chatDbPath}`,
    "",
    ...CHAT_TABLES.map(({ table, key }) => countLine(table, check.counts[key])),
    countLine("total", check.total),
    "",
    "  To move them — dry run first; BACK UP content.db AND chat.db before --apply:",
    `    npx tsx development/scripts/split-chat-data-into-chat-db.ts --db "${paths.contentDbPath}"`,
    `    npx tsx development/scripts/split-chat-data-into-chat-db.ts --db "${paths.contentDbPath}" --apply`,
    "",
    "  This check is read-only: boot did not copy, delete, or modify anything in either database.",
    rule,
  ].join("\n");
}

/**
 * Boot-path entry point: counts, and prints a single warning if — and only if — rows were found.
 * A site that has already migrated (or never had chat rows in `content.db`) gets no output and one
 * cheap query, so the normal boot is neither slowed nor made noisier.
 *
 * Safe to call any number of times: it holds no state and writes nothing, so a repeat call re-reads
 * and re-reports rather than latching or double-counting.
 *
 * @param deps.log Defaults to `console.error`, matching how `deps.ts`'s other boot-time failures
 *   announce themselves (`rebuildNavLocationBindings failed at boot`, etc.) and keeping the notice
 *   on stderr where operators look. Injectable so tests assert on the message instead of stdout.
 * @returns The same {@link OrphanedChatRowsCheck} it decided from, so a caller can act on the
 *   counts without re-querying.
 * @complexity O(1) — delegates to {@link checkForOrphanedChatRows} plus at most one format call.
 */
export function warnOnOrphanedChatRows(deps: {
  contentDb: Database.Database;
  contentDbPath: string;
  chatDbPath: string;
  log?: (message: string) => void;
}): OrphanedChatRowsCheck {
  const check = checkForOrphanedChatRows(deps.contentDb);
  const warning = formatOrphanedChatRowsWarning(check, {
    contentDbPath: deps.contentDbPath,
    chatDbPath: deps.chatDbPath,
  });
  if (warning !== "") (deps.log ?? ((message: string) => console.error(message)))(warning);
  return check;
}
