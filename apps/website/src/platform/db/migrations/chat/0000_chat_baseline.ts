import { sql } from "kysely";

import type { StorageKernel } from "../../kernel/port.js";
import type { MigrationStep } from "../step.js";

/**
 * @file Chat step `0000_chat_baseline` (R1 plan R1f, ADR-067): the AI chat tables
 * (`chat-kernel.ts`'s `ChatDatabase`) on Postgres/PGlite, in their own schema `ai_chat` — never
 * `public`, where the content tables live, and never `chat` (that name is kept for human-to-human
 * chat). `@jini-ai/sqlite`'s `CHAT_HISTORY_DDL` plus `sqlite/chat-db.ts`'s two Tovu tables in
 * Postgres spelling; the time columns are `BIGINT` because epoch milliseconds overflow `INTEGER`
 * (read back as numbers through `kernel/drivers/pg-types.ts`).
 *
 * SQLite: nothing. `chat.db` is its own file; its tables are chat step `0001_sqlite_chat_tables`.
 * Names are written out, not built from `AI_CHAT_SCHEMA`: the pinned checksum hashes this file.
 */

export const CHAT_BASELINE_ID = "0000_chat_baseline";

const STATEMENTS = [
  "CREATE SCHEMA IF NOT EXISTS ai_chat",
  `CREATE TABLE ai_chat.ai_chats (
    id            TEXT PRIMARY KEY,
    scope_id      TEXT NOT NULL,
    owner_kind    TEXT NOT NULL CHECK (owner_kind IN ('user','guest')),
    owner_id      TEXT NOT NULL,
    title         TEXT,
    title_source  TEXT NOT NULL DEFAULT 'fallback'
                  CHECK (title_source IN ('fallback','generated','manual')),
    created_at    BIGINT NOT NULL,
    updated_at    BIGINT NOT NULL,
    expires_at    BIGINT
  )`,
  `CREATE INDEX idx_ai_chats_owner
    ON ai_chat.ai_chats(scope_id, owner_kind, owner_id, updated_at DESC)`,
  `CREATE INDEX idx_ai_chats_expiry
    ON ai_chat.ai_chats(expires_at) WHERE expires_at IS NOT NULL`,
  `CREATE TABLE ai_chat.ai_chat_messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES ai_chat.ai_chats(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user','assistant')),
    content         TEXT NOT NULL,
    agent_id        TEXT,
    agent_name      TEXT,
    events_json     TEXT,
    attachments_json TEXT,
    run_id          TEXT,
    run_status      TEXT,
    position        INTEGER NOT NULL,
    created_at      BIGINT NOT NULL,
    started_at      BIGINT,
    ended_at        BIGINT,
    UNIQUE (conversation_id, position)
  )`,
  `CREATE INDEX idx_ai_chat_messages_order
    ON ai_chat.ai_chat_messages(conversation_id, position)`,
  `CREATE TABLE ai_chat.assistant_agent_sessions (
    conversation_id TEXT NOT NULL REFERENCES ai_chat.ai_chats(id) ON DELETE CASCADE,
    agent_id        TEXT NOT NULL,
    session_id      TEXT NOT NULL,
    updated_at      BIGINT NOT NULL,
    PRIMARY KEY (conversation_id, agent_id)
  )`,
  `CREATE TABLE ai_chat.assistant_conversation_tool_approvals (
    conversation_id TEXT NOT NULL REFERENCES ai_chat.ai_chats(id) ON DELETE CASCADE,
    principal_id    TEXT NOT NULL,
    connection_id   TEXT NOT NULL,
    tool_name       TEXT NOT NULL,
    fingerprint     TEXT NOT NULL,
    granted_at      TEXT NOT NULL,
    PRIMARY KEY (conversation_id, principal_id, connection_id, tool_name)
  )`,
];

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  if (kernel.dialect === "sqlite") return;
  for (const statement of STATEMENTS) await kernel.execute(sql.raw(statement));
}

export const chatBaseline = (checksum: string): MigrationStep => ({ id: CHAT_BASELINE_ID, checksum, up });
