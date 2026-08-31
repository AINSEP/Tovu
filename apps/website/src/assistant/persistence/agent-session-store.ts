import type { Database as SqliteDatabase } from "better-sqlite3";

/**
 * @file Durable store for `assistant_agent_sessions` (migration `0051`) — the
 * `(conversation, agent) -> underlying agent-CLI session id` mapping that lets a
 * `resumesSessionViaCli` def (`@jini-ai/agent-runtime`'s `types.ts`) continue its own CLI session
 * across chat turns instead of spawning cold every turn. See that migration's own header for why
 * this lives in a table separate from the Jini-mirrored `ai_chats`/`ai_chat_messages`.
 *
 * Read and written from `agent-daemon-server.ts`'s `onStarted`: `getSessionId` before a run starts
 * (feeding `AgentExecutorRunInput.resumeSessionId`), `setSessionId` once a run ends carrying a
 * fresh `RunEndPayload.sessionRef` (`@jini-ai/protocol`'s doc on that field), and `clearSessionId`
 * when a resumed run ends WITHOUT one — see that method's own doc for why leaving a dead id in
 * place there bricks every later turn in the conversation.
 */

export interface AgentSessionStore {
  /**
   * The stored session id for this (conversation, agent) pair, or `null` if none is on record yet
   * — the caller should mint a fresh id for `AgentExecutorRunInput.newSessionId` in that case
   * rather than attempting to resume.
   */
  getSessionId(conversationId: string, agentId: string): Promise<string | null>;
  /**
   * Upserts the session id for this (conversation, agent) pair. Always overwrites whatever was
   * stored before — a CLI session id is superseded by its successor on every resumed turn, never
   * appended to.
   */
  setSessionId(conversationId: string, agentId: string, sessionId: string): Promise<void>;
  /**
   * Removes any stored session id for this (conversation, agent) pair, so the next
   * `getSessionId` call returns `null` and the following turn starts a fresh CLI session instead
   * of retrying one that may be dead.
   *
   * Exists for exactly one caller: `agent-daemon-server.ts`'s `onStarted` stream subscription,
   * when a run that attempted `--resume <storedId>` reaches its terminal `end` event without ever
   * confirming a session id (`shouldClearSessionOnFailedResume`, `agent-session-resume.ts`) — the
   * H1 bug this method fixes. Before this existed, that case left the dead id in place forever:
   * every later turn retried the same `--resume <deadId>` and failed identically, with no
   * recovery short of hand-editing the database. Idempotent: clearing a pair with nothing stored
   * (already cleared, or never set) is a silent no-op, matching `setSessionId`'s own
   * "always overwrites, never errors on an unexpected prior state" contract.
   */
  clearSessionId(conversationId: string, agentId: string): Promise<void>;
}

/**
 * `AgentSessionStore` backed by the host's own database — the same `content.db` handle
 * `createChatStoreFactory` (`store-factory.ts`) already uses, via migration `0051`'s table.
 *
 * @param db Tovu's `content.db` handle (`ContentDb.$client`).
 * @complexity O(1); each method is a single indexed query against the table's own primary key.
 */
export function createSqliteAgentSessionStore(db: SqliteDatabase): AgentSessionStore {
  const selectStmt = db.prepare(
    `SELECT session_id FROM assistant_agent_sessions WHERE conversation_id = ? AND agent_id = ?`,
  );
  const upsertStmt = db.prepare(
    `INSERT INTO assistant_agent_sessions (conversation_id, agent_id, session_id, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (conversation_id, agent_id)
     DO UPDATE SET session_id = excluded.session_id, updated_at = excluded.updated_at`,
  );
  const deleteStmt = db.prepare(
    `DELETE FROM assistant_agent_sessions WHERE conversation_id = ? AND agent_id = ?`,
  );
  return {
    async getSessionId(conversationId, agentId) {
      const row = selectStmt.get(conversationId, agentId) as { session_id: string } | undefined;
      return row?.session_id ?? null;
    },
    async setSessionId(conversationId, agentId, sessionId) {
      upsertStmt.run(conversationId, agentId, sessionId, Date.now());
    },
    async clearSessionId(conversationId, agentId) {
      deleteStmt.run(conversationId, agentId);
    },
  };
}

/**
 * `AgentSessionStore` backed by a private in-memory map, for `server/app.ts`'s test/dev composition
 * root — same "no database for a root that never touches this feature" reasoning as
 * `createInMemoryChatStoreFactory` next to it, but simpler: this store has no `ai_chats` foreign
 * key to enforce, so a plain map is the whole implementation rather than a `:memory:` SQLite handle
 * plus DDL.
 */
export function createInMemoryAgentSessionStore(): AgentSessionStore {
  const sessions = new Map<string, string>();
  // `JSON.stringify` of the pair, not a delimited template string: a delimiter risks an id that
  // contains it colliding two distinct (conversationId, agentId) pairs onto the same key. Ids are
  // opaque strings from elsewhere in the system (UUIDs, agent registry ids) with no format this
  // store controls or should assume.
  function keyOf(conversationId: string, agentId: string): string {
    return JSON.stringify([conversationId, agentId]);
  }
  return {
    async getSessionId(conversationId, agentId) {
      return sessions.get(keyOf(conversationId, agentId)) ?? null;
    },
    async setSessionId(conversationId, agentId, sessionId) {
      sessions.set(keyOf(conversationId, agentId), sessionId);
    },
    async clearSessionId(conversationId, agentId) {
      sessions.delete(keyOf(conversationId, agentId));
    },
  };
}
