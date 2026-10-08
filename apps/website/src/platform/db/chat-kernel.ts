import type { AiChatsTable, AiChatMessagesTable } from "@jini-ai/chat/store/sqlite";
export type { AiChatsTable, AiChatMessagesTable } from "@jini-ai/chat/store/sqlite";

// Dedicated db entries keep migrations driver-free; sqliteKernel memoizes the same host client
// used by the packaged history adapter, sessions and Tovu's run ledger.
import { type SqliteConnectionSource, sqliteKernel } from "@jini-ai/db/kernel/sqlite";
import { scopeToSchema, type StorageKernel } from "@jini-ai/db/kernel";

/**
 * @file The chat database (`chat.db`, see `sqlite/chat-db.ts`) as a storage kernel:
 * `StorageKernel<ChatDatabase>`, whichever driver is underneath. The chat twin of
 * `content-kernel.ts`.
 *
 * `content-database.generated.ts` covers `content.db` only. The chat tables compose Jini's shared
 * types with host sessions/approvals, exactly as `@jini-ai/chat/store/sqlite`'s `CHAT_HISTORY_DDL`
 * plus `sqlite/chat-db.ts`
 * (SQLite) and chat migration `0000_chat_baseline` (Postgres, schema {@link AI_CHAT_SCHEMA}) create them. Type aliases, not interfaces: Kysely's table
 * typing needs them (see `Jini/packages/cms/src/comments/sql/repo.rows.ts`). Times are epoch milliseconds.
 */

/** Tovu-owned (`sqlite/chat-db.ts`): which agent-CLI session a conversation's agent resumes. */
export type AssistantAgentSessionsTable = {
  conversation_id: string;
  agent_id: string;
  session_id: string;
  updated_at: number;
};

/** Tovu-owned (`sqlite/chat-db.ts`): "Allow for this chat" tool approvals. `granted_at` is ISO text. */
export type AssistantConversationToolApprovalsTable = {
  conversation_id: string;
  principal_id: string;
  connection_id: string;
  tool_name: string;
  fingerprint: string;
  granted_at: string;
};

export type ChatDatabase = {
  ai_chats: AiChatsTable;
  ai_chat_messages: AiChatMessagesTable;
  assistant_agent_sessions: AssistantAgentSessionsTable;
  assistant_conversation_tool_approvals: AssistantConversationToolApprovalsTable;
  assistant_run_attempts: {
    message_id: string;
    engine: string;
    accepted_json: string;
    recovery_count: number;
    recovery_deadline: number | null;
    recovery_elapsed_ms: number;
    attempt_started_at: number;
    last_progress_at: number;
    cancel_reason: string | null;
    session_id: string | null;
    session_confirmed: number;
    child_pid: number | null;
    child_started_at: string | null;
    attempt_base_json: string;
  };
};

export type ChatKernel = StorageKernel<ChatDatabase>;

/**
 * The kernel itself, or the one kernel of an open SQLite `chat.db` handle (the call sites that
 * still pass the raw handle). Told apart by `lockKey`, which only a kernel has.
 */
export function chatKernel(store: ChatKernel | SqliteConnectionSource): ChatKernel {
  return typeof (store as Partial<ChatKernel>).lockKey === "function"
    ? (store as ChatKernel)
    : sqliteKernel<ChatDatabase>(store as SqliteConnectionSource);
}

/** The Postgres schema of the AI chat tables and their ledger (ADR-067): never `public`, never `chat`. */
export const AI_CHAT_SCHEMA = "ai_chat";

/**
 * The chat kernel over a Postgres/PGlite content database: the same connection, every chat
 * statement addressed to {@link AI_CHAT_SCHEMA} (`@jini-ai/db/kernel`). The tables come from
 * `migrateChatDatabase`.
 */
export function pgChatKernel(kernel: StorageKernel<unknown>): ChatKernel {
  return scopeToSchema(kernel as ChatKernel, AI_CHAT_SCHEMA);
}
