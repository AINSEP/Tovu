import { type ChatKernel, chatKernel } from "#src/platform/db/chat-kernel";
import type { SqliteConnectionSource } from "#src/platform/db/kernel/index";

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
 * `AgentSessionStore` over the chat kernel (`platform/db/chat-kernel.ts`): one Kysely body for
 * every dialect, on `chat.db`'s `assistant_agent_sessions` table (`sqlite/chat-db.ts`; Postgres:
 * `pglite/chat-schema.ts`). The name predates the kernel; kept so the composition roots need no edit.
 *
 * @param store the chat kernel, or the open `chat.db` handle (`openChatDb`) whose kernel to use.
 * @complexity O(1); each method is a single statement on the table's primary key.
 */
export function createSqliteAgentSessionStore(store: ChatKernel | SqliteConnectionSource): AgentSessionStore {
  const kernel = chatKernel(store);
  return {
    async getSessionId(conversationId, agentId) {
      const row = await kernel.run((db) =>
        db
          .selectFrom("assistant_agent_sessions")
          .select("session_id")
          .where("conversation_id", "=", conversationId)
          .where("agent_id", "=", agentId)
          .executeTakeFirst()
      );
      return row?.session_id ?? null;
    },
    async setSessionId(conversationId, agentId, sessionId) {
      const updatedAt = Date.now();
      await kernel.run((db) =>
        db
          .insertInto("assistant_agent_sessions")
          .values({ conversation_id: conversationId, agent_id: agentId, session_id: sessionId, updated_at: updatedAt })
          .onConflict((oc) =>
            oc.columns(["conversation_id", "agent_id"]).doUpdateSet({ session_id: sessionId, updated_at: updatedAt })
          )
          .execute()
      );
    },
    async clearSessionId(conversationId, agentId) {
      await kernel.run((db) =>
        db
          .deleteFrom("assistant_agent_sessions")
          .where("conversation_id", "=", conversationId)
          .where("agent_id", "=", agentId)
          .execute()
      );
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
