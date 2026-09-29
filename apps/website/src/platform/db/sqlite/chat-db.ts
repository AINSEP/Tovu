import Database from "better-sqlite3";

import { sqliteKernel } from "../kernel/drivers/sqlite.js";
import { SQLITE_CHAT_STATEMENTS } from "../migrations/chat/0001_sqlite_chat_tables.js";
import { migrateChatDatabase } from "../migrations/index.js";

/**
 * @file Sidecar `chat.db` bootstrap — mirrors `database-journal-db.ts`'s reasoning
 * (`database-journal-db.ts:11-18`) for why a second SQLite file exists at all: a whole-file
 * restore/duplicate of `content.db` must never carry (or erase) conversation history, and vice
 * versa. `SqliteDbOpsAdapter.captureRestorePoint` (`db-ops.ts`) backs up `content.db` by physical
 * file copy with no table-level filtering possible at that layer (SQLite's Online Backup API), so
 * the only way to keep a restore point from sweeping up chat data is to keep chat data in a
 * different file to begin with.
 *
 * Its schema is the AI chat history of the migration runner (`CHAT_MIGRATIONS`, ADR-066/067): the
 * same history a Postgres/PGlite site applies to its `ai_chat` schema, with its own ledger. The
 * tables are `@jini-ai/sqlite`'s `CHAT_HISTORY_DDL` plus two Tovu-owned tables, frozen in chat step
 * `0001_sqlite_chat_tables` (`ADS-memory/reports/2026-09-05-db-split-scoping.md` §1/§3).
 *
 * The composition root (`server/runtime/composition/open-site-store.ts`) opens this once, alongside
 * `content.db` and `ops/database-journal.db`, and points `createChatStoreFactory`/
 * `createSqliteAgentSessionStore` at its raw handle instead of `content.db`'s.
 */

/** Opens (or creates) `chat.db` with the pragmas `content-db.ts` sets — no schema, no write. */
function openChatConnection(filePath: string): Database.Database {
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  // Required for `ai_chat_messages`' and `assistant_agent_sessions`' `ON DELETE CASCADE` to fire.
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return sqlite;
}

/**
 * A site's `chat.db` on boot: open, then the AI chat history to head through the migration runner
 * (`CHAT_MIGRATIONS`, ledger `tovu_chat_migrations` in the file; an existing file is adopted as it
 * is, every chat DDL statement being `IF NOT EXISTS`). Returns the raw handle
 * `createChatStoreFactory`/`createSqliteAgentSessionStore` take (none of the chat tables has a
 * `sqliteTable` declaration, by design: `RAW_SQL_MANAGED_TABLES` in `schema-migration-drift.test.ts`).
 */
export async function openSiteChatDb(filePath: string): Promise<Database.Database> {
  const sqlite = openChatConnection(filePath);
  try {
    await migrateChatDatabase(sqliteKernel<unknown>(sqlite));
  } catch (err) {
    sqlite.close();
    throw err;
  }
  return sqlite;
}

/**
 * Opens (or creates) a `chat.db` and creates the chat tables synchronously (the same statements as
 * chat step `0001_sqlite_chat_tables`, no ledger): for `:memory:` stores (`store-factory.ts`) and
 * tests. A site's boot uses {@link openSiteChatDb}.
 *
 * @complexity O(1) — one connection open plus a fixed number of DDL statements.
 */
export function openChatDb(filePath: string): Database.Database {
  const sqlite = openChatConnection(filePath);
  for (const statement of SQLITE_CHAT_STATEMENTS) sqlite.exec(statement);
  return sqlite;
}
