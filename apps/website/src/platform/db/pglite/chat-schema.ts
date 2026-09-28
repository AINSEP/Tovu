import type { PGlite } from "@electric-sql/pglite";

/**
 * @file The chat-history tables (`chat-kernel.ts`'s `ChatDatabase`) on a fresh Postgres (PGlite)
 * database: `@jini-ai/sqlite`'s `CHAT_HISTORY_DDL` in Postgres spelling. The one difference is the
 * time columns: epoch milliseconds overflow Postgres's 32-bit `INTEGER`, so they are `BIGINT`
 * (read back as numbers through `kernel/drivers/pg-types.ts`).
 *
 * Stand-in until the migrator lands (storage-adapter plan, slice M1), like `content-schema.ts`:
 * `IF NOT EXISTS` throughout, so it never changes an existing database.
 */
export const PG_CHAT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ai_chats (
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
);

CREATE INDEX IF NOT EXISTS idx_ai_chats_owner
  ON ai_chats(scope_id, owner_kind, owner_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_chats_expiry
  ON ai_chats(expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS ai_chat_messages (
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
  created_at      BIGINT NOT NULL,
  started_at      BIGINT,
  ended_at        BIGINT,
  UNIQUE (conversation_id, position)
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_order
  ON ai_chat_messages(conversation_id, position);
`;

/** Creates the chat tables in one transaction when they are absent. */
export async function ensurePgChatSchema(client: PGlite): Promise<void> {
  await client.transaction(async (tx) => {
    await tx.exec(PG_CHAT_SCHEMA_SQL);
  });
}
