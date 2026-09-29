import { sql } from "kysely";

import type { StorageKernel } from "../../kernel/port.js";
import type { MigrationStep } from "../step.js";

/**
 * @file Chat step `0001_sqlite_chat_tables` (R1 plan R1h): the AI chat tables in a SQLite site's
 * own `chat.db` — `@jini-ai/sqlite`'s `CHAT_HISTORY_DDL` plus Tovu's `assistant_agent_sessions` and
 * `assistant_conversation_tool_approvals`, exactly as `openChatDb` created them before the runner.
 * Every statement is `IF NOT EXISTS`, so an existing `chat.db` is adopted as it is.
 *
 * Postgres/PGlite: nothing (`0000_chat_baseline` created them in `ai_chat`).
 *
 * Frozen here, not imported from Jini: the pinned checksum hashes this file.
 */

export const SQLITE_CHAT_TABLES_ID = "0001_sqlite_chat_tables";

export const SQLITE_CHAT_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS ai_chats (
  id            TEXT PRIMARY KEY,
  scope_id      TEXT NOT NULL,
  owner_kind    TEXT NOT NULL CHECK (owner_kind IN ('user','guest')),
  owner_id      TEXT NOT NULL,
  title         TEXT,
  title_source  TEXT NOT NULL DEFAULT 'fallback'
                CHECK (title_source IN ('fallback','generated','manual')),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  expires_at    INTEGER
)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_chats_owner
  ON ai_chats(scope_id, owner_kind, owner_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_chats_expiry
  ON ai_chats(expires_at) WHERE expires_at IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_chats(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content         TEXT NOT NULL,
  agent_id        TEXT,
  agent_name      TEXT,
  events_json     TEXT,
  attachments_json TEXT,
  run_id          TEXT,
  run_status      TEXT,
  position        INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  started_at      INTEGER,
  ended_at        INTEGER,
  UNIQUE (conversation_id, position)
)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_order
  ON ai_chat_messages(conversation_id, position)`,
  `CREATE TABLE IF NOT EXISTS assistant_agent_sessions (
  conversation_id TEXT NOT NULL REFERENCES ai_chats(id) ON DELETE CASCADE,
  agent_id        TEXT NOT NULL,
  session_id      TEXT NOT NULL,
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, agent_id)
)`,
  `CREATE TABLE IF NOT EXISTS assistant_conversation_tool_approvals (
  conversation_id TEXT NOT NULL REFERENCES ai_chats(id) ON DELETE CASCADE,
  principal_id    TEXT NOT NULL,
  connection_id   TEXT NOT NULL,
  tool_name       TEXT NOT NULL,
  fingerprint     TEXT NOT NULL,
  granted_at      TEXT NOT NULL,
  PRIMARY KEY (conversation_id, principal_id, connection_id, tool_name)
)`,
];

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  if (kernel.dialect !== "sqlite") return;
  for (const statement of SQLITE_CHAT_STATEMENTS) await kernel.execute(sql.raw(statement));
}

export const sqliteChatTables = (checksum: string): MigrationStep => ({ id: SQLITE_CHAT_TABLES_ID, checksum, up });
