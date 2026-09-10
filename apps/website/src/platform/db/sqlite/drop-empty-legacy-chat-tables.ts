import type Database from "better-sqlite3";

import { CHAT_TABLE_NAMES } from "./chat-orphan-check.js";

/**
 * @file The `content.db` half of making the two-database split (`0fb84ae0`) the actual default for
 * fresh installs, not just the wiring a new boot follows.
 *
 * ## Why this can't be a plain `.sql` migration
 *
 * Migrations `0023_ai_chat_history.sql` and `0051_assistant_agent_sessions.sql` are still in the
 * live migration chain (see their own headers), so every `content.db` — including one created
 * today — still gets `CREATE TABLE IF NOT EXISTS` for `ai_chats`/`ai_chat_messages`/
 * `assistant_agent_sessions`. Those two migrations must not be edited or regenerated: this
 * repository has already been bitten once by a hand-edited historical migration changing its hash
 * and breaking partial-apply on existing installs. The fix has to be additive.
 *
 * But an additive `.sql` migration can't express the actual requirement either. The three tables
 * are safe to drop from a FRESH install (nothing has ever written to them — `chat.db`,
 * `db/sqlite/chat-db.ts`, owns them from the first write on) but NOT from an install that predates
 * the split and still holds real rows (`chat-orphan-check.ts`'s own boot warning exists precisely
 * because `sites/tovu-com/content.db` held 157/562/19 such rows as late as 2026-09-06). Drizzle's
 * `better-sqlite3` migrator (`drizzle-orm/better-sqlite3/migrator`) runs each
 * `--> statement-breakpoint`-separated chunk of a migration file through a single
 * `better-sqlite3` `.prepare()` — one statement per chunk, no branching — and SQLite's DDL grammar
 * has no `DROP TABLE ... WHERE`. A migration file cannot conditionally skip its own `DROP TABLE`
 * based on a `COUNT(*)`. (`features/plugins/data-module.ts` hits the same wall for a different
 * reason and reaches the same conclusion: schema changes SQLite's DDL cannot express are handled as
 * an explicit, out-of-band, application-level operation rather than forced into the migration
 * engine.)
 *
 * ## How this codebase already solves exactly this
 *
 * `site-dir/duplicate-content-db.ts`'s `purgeStrandedChatTables` is this same problem one operation
 * over: a conditional, table-name-driven operation against these three specific raw-SQL tables,
 * run against a raw `better-sqlite3` handle OUTSIDE the Drizzle migration pipeline, sharing
 * `chat-orphan-check.ts`'s `CHAT_TABLE_NAMES` so the two can never disagree about which tables are
 * chat. This file is the same shape, called from a different place: `duplicateContentDb` empties
 * them unconditionally (a duplicate must never carry chat history regardless of size);
 * {@link dropEmptyLegacyChatTables} instead checks each table's own row count and drops ONLY the
 * ones that are empty, leaving any table that still holds real rows completely untouched so
 * `chat-orphan-check.ts`'s boot warning keeps flagging it for a human to run
 * `development/scripts/split-chat-data-into-chat-db.ts` against.
 *
 * ## Where this runs
 *
 * Called from `content-db.ts`'s `openContentDb`, immediately after `migrate()` and before
 * `ensureWatermarkRow` — the same "runs on every real open, before anything else touches the db"
 * slot that function already occupies. On a brand-new site the three tables are created by
 * migration and dropped again in the same `openContentDb` call, so a fresh `content.db` never
 * carries them at all. `openContentDbReadOnly` (dry-run scripts, backfills) deliberately does NOT
 * call this — that function's whole contract is "no write of any kind", and a `readonly: true`
 * connection would reject the `DROP TABLE` at the SQLite level if it somehow did.
 *
 * Not wired into `schema-migration-drift.test.ts`'s `migratedDatabase()` helper: that helper calls
 * `migrate()` directly, not `openContentDb`, so it never runs this function — the three tables stay
 * present after a bare `migrate()`, and `RAW_SQL_MANAGED_TABLES` (that same test file) stays
 * accurate unchanged.
 */

/**
 * Which of {@link CHAT_TABLE_NAMES} physically exist in `db` right now. Mirrors
 * `chat-orphan-check.ts`'s own `existingChatTables` (kept as a private duplicate rather than an
 * export from there: that file's header states its contract as "counts, formats, and prints...
 * never writes", and exporting a helper for a caller that goes on to `DROP TABLE` would blur that
 * line for every future reader of this repo's one read-only chat-diagnostics module).
 */
function existingChatTables(db: Database.Database): Set<string> {
  const placeholders = CHAT_TABLE_NAMES.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`)
    .all(...CHAT_TABLE_NAMES) as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

/**
 * Drops each of {@link CHAT_TABLE_NAMES} from `db` if — and only if — it exists AND is empty.
 * A table this call finds non-empty is left byte-for-byte untouched (not even opened for write):
 * that is the entire safety property this function exists to provide for an install that predates
 * the `chat.db` split and still holds real conversation history in `content.db`.
 *
 * Each table is checked and dropped independently rather than as a single all-or-nothing unit —
 * correct even for a hypothetical inconsistent db where, say, `ai_chats` is empty but
 * `ai_chat_messages` somehow is not (verified empirically: SQLite's `DROP TABLE` does not consult
 * `PRAGMA foreign_keys` or check for referencing rows in a still-existing child table, so dropping
 * one of the three can never fail or cascade because of the other two).
 *
 * Idempotent and safe to call on every boot: a `content.db` that has already had all three dropped
 * costs one `sqlite_master` lookup and nothing else.
 *
 * @param db Raw `better-sqlite3` handle for `content.db` (in `content-db.ts`, the same connection
 *   `migrate()` was just run against).
 * @complexity O(k) statements for k = {@link CHAT_TABLE_NAMES}'s length — a fixed three, never
 *   bounded by caller-controlled input or by how much data any table holds.
 */
export function dropEmptyLegacyChatTables(db: Database.Database): void {
  const present = existingChatTables(db);
  if (present.size === 0) return;

  const dropEmptyOnes = db.transaction(() => {
    for (const name of CHAT_TABLE_NAMES) {
      if (!present.has(name)) continue;
      const { n } = db.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number };
      if (n > 0) continue; // real rows -- leave intact for chat-orphan-check.ts to keep flagging.
      db.exec(`DROP TABLE "${name}"`);
    }
  });
  dropEmptyOnes();
}
