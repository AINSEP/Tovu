import type { Generated } from "kysely";

// The driver and port directly, not `kernel/index.js` (as `content-kernel.ts`): the migration list
// imports this module and must not pull the Postgres drivers into a build script's graph.
import { type SqliteConnectionSource, sqliteKernel } from "./kernel/drivers/sqlite.js";
import type { StorageKernel } from "./kernel/port.js";
import { scopeToSchema } from "./kernel/schema-scope.js";

/**
 * @file The chat database (`chat.db`, see `sqlite/chat-db.ts`) as a storage kernel:
 * `StorageKernel<ChatDatabase>`, whichever driver is underneath. The chat twin of
 * `content-kernel.ts`.
 *
 * `content-database.generated.ts` covers `content.db` only, so the chat tables are typed here by
 * hand, snake_case, exactly as `@jini-ai/sqlite`'s `CHAT_HISTORY_DDL` plus `sqlite/chat-db.ts`
 * (SQLite) and chat migration `0000_chat_baseline` (Postgres, schema {@link AI_CHAT_SCHEMA}) create them. Type aliases, not interfaces: Kysely's table
 * typing needs them (see `features/comments/repo.rows.ts`). Times are epoch milliseconds.
 */

export type AiChatsTable = {
  id: string;
  scope_id: string;
  owner_kind: string;
  owner_id: string;
  title: string | null;
  title_source: Generated<string>;
  created_at: number;
  updated_at: number;
  expires_at: number | null;
};

export type AiChatMessagesTable = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  agent_id: string | null;
  agent_name: string | null;
  events_json: string | null;
  attachments_json: string | null;
  run_id: string | null;
  run_status: string | null;
  position: number;
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
};

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
 * statement addressed to {@link AI_CHAT_SCHEMA} (`kernel/schema-scope.ts`). The tables come from
 * `migrateChatDatabase`.
 */
export function pgChatKernel(kernel: StorageKernel<unknown>): ChatKernel {
  return scopeToSchema(kernel as ChatKernel, AI_CHAT_SCHEMA);
}
