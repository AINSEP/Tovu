import Database from "better-sqlite3";
import { ensureChatHistoryTables } from "@jini-ai/sqlite";

/**
 * @file Sidecar `chat.db` bootstrap — mirrors `database-journal-db.ts`'s reasoning
 * (`database-journal-db.ts:11-18`) for why a second SQLite file exists at all: a whole-file
 * restore/duplicate of `content.db` must never carry (or erase) conversation history, and vice
 * versa. `SqliteDbOpsAdapter.captureRestorePoint` (`db-ops.ts`) backs up `content.db` by physical
 * file copy with no table-level filtering possible at that layer (SQLite's Online Backup API), so
 * the only way to keep a restore point from sweeping up chat data is to keep chat data in a
 * different file to begin with.
 *
 * Unlike `content-db.ts`/`database-journal-db.ts`, this file does NOT run a Drizzle migration.
 * `ai_chats`/`ai_chat_messages` are owned by `@jini-ai/sqlite`'s own `ensureChatHistoryTables` —
 * the exact call `createInMemoryChatStoreFactory` already makes against a private `:memory:`
 * handle (`assistant/persistence/store-factory.ts`); migration `0023`'s own header explains why
 * Tovu mirrors that DDL into `content.db` instead of calling the function there ("a second
 * migrator against content.db would write DDL behind Tovu's snapshot/backup tooling... One
 * database, one migrator") — an objection that is specifically about *sharing* `content.db` and
 * does not apply to a dedicated chat file. `assistant_agent_sessions` is Tovu-owned (migration
 * `0051`) but is a single `CREATE TABLE IF NOT EXISTS` statement, small enough to bootstrap the
 * same way rather than stand up a second Drizzle schema/migrations pair for three tables that
 * never join into content (`ADS-memory/reports/2026-09-05-db-split-scoping.md` §1/§3).
 *
 * The composition root (`server/runtime/composition/deps.ts`) opens this once, alongside
 * `content.db` and `ops/database-journal.db`, and points `createChatStoreFactory`/
 * `createSqliteAgentSessionStore` at its raw handle instead of `content.db`'s.
 */

/**
 * `assistant_agent_sessions` DDL, copied verbatim from migration
 * `0051_assistant_agent_sessions.sql` — see that migration's own header for why this table is
 * Tovu-owned rather than part of `@jini-ai/sqlite`'s chat-history DDL. `IF NOT EXISTS` keeps this
 * idempotent across repeated opens of an already-initialized file, matching
 * `ensureChatHistoryTables`' own idempotency contract.
 */
const ASSISTANT_AGENT_SESSIONS_DDL = `
CREATE TABLE IF NOT EXISTS assistant_agent_sessions (
  conversation_id TEXT NOT NULL REFERENCES ai_chats(id) ON DELETE CASCADE,
  agent_id        TEXT NOT NULL,
  session_id      TEXT NOT NULL,
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, agent_id)
);
`;

/**
 * Opens (or creates) `chat.db`: sets the same pragmas `content-db.ts`'s `openContentDb` sets
 * (`journal_mode = WAL`, `foreign_keys = ON` — required for `ai_chat_messages`' and
 * `assistant_agent_sessions`' `ON DELETE CASCADE` to actually fire — and `busy_timeout = 5000`),
 * then ensures all three chat tables exist. Returns the raw `better-sqlite3` handle, not a
 * Drizzle wrapper: none of `ai_chats`/`ai_chat_messages`/`assistant_agent_sessions` has a
 * `sqliteTable` declaration in `schema.sqlite.ts` (by design, `RAW_SQL_MANAGED_TABLES` in
 * `schema-migration-drift.test.ts`), and both consumers (`createChatStoreFactory`,
 * `createSqliteAgentSessionStore`) already take a raw handle, not a typed one.
 *
 * Idempotent: every DDL statement is `CREATE ... IF NOT EXISTS`, so calling this again against an
 * already-initialized file is a no-op that preserves existing rows.
 *
 * @param filePath Absolute path to the chat database file (created if it does not exist).
 * @returns The opened `better-sqlite3` handle, ready to pass to `createChatStoreFactory`/
 *   `createSqliteAgentSessionStore`.
 * @complexity O(1) — one connection open plus a fixed number of DDL statements.
 */
export function openChatDb(filePath: string): Database.Database {
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  ensureChatHistoryTables(sqlite);
  sqlite.exec(ASSISTANT_AGENT_SESSIONS_DDL);
  return sqlite;
}
