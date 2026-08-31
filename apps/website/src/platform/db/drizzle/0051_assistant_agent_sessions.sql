-- Custom SQL migration file, put your code below! --
--
-- Per-conversation agent-CLI session id, letting a `resumesSessionViaCli` def (see
-- `@jini-ai/agent-runtime`'s `types.ts`) continue its own Claude Code CLI session across chat turns
-- instead of spawning a cold session every turn. This backs the round trip documented on
-- `RunEndPayload.sessionRef` in `@jini-ai/protocol`: `agent-daemon-server.ts` reads the stored id
-- before a run starts (as `AgentExecutorRunInput.resumeSessionId`) and writes back whatever the
-- run's `end` event reported once it finishes.
--
-- Deliberately a SEPARATE table from `ai_chats`/`ai_chat_messages`, not a new column on either.
-- Those two are copied verbatim from `@jini-ai/sqlite`'s `CHAT_HISTORY_DDL` and guarded by
-- `src/assistant/persistence/__tests__/ddl-parity.test.ts` against drift from that upstream
-- package (see migration `0023`'s own header) — a Tovu-only column added there would either fail
-- that parity check or require an upstream Jini schema change this migration cannot make on its
-- own. This table is entirely Tovu-owned, so it carries no such constraint.
--
-- One row per (conversation, agent), not just per conversation: the composer's agent picker lets a
-- conversation be worked by more than one agent id over its life, and each keeps its own
-- independent underlying CLI session — resuming agent A's session for a turn actually run by agent
-- B would hand the wrong CLI process's id to `--resume`.
--
-- `ON DELETE CASCADE` mirrors `ai_chat_messages`' own FK to `ai_chats(id)` in migration `0023`:
-- deleting a conversation should not leave an orphaned session-id row behind it.
CREATE TABLE IF NOT EXISTS assistant_agent_sessions (
  conversation_id TEXT NOT NULL REFERENCES ai_chats(id) ON DELETE CASCADE,
  agent_id        TEXT NOT NULL,
  session_id      TEXT NOT NULL,
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, agent_id)
);
