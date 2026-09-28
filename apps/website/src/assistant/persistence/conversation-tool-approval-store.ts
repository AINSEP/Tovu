/**
 * @file The `chat.db` half of G3 remembered approvals: "Allow for this chat", stored with the
 * conversation (`assistant_conversation_tool_approvals`, created by `platform/db/sqlite/chat-db.ts`)
 * so it survives a daemon/API restart and is deleted with the chat. See
 * `assistant/external-mcp-tool-approvals.ts` for the fingerprint and the "Always" half.
 */
import type { Database as SqliteDatabase } from "better-sqlite3";

import type { ConversationToolApprovalStore } from "../external-mcp-tool-approvals.js";

/**
 * A {@link ConversationToolApprovalStore} over `chat.db`'s raw handle.
 *
 * `grant` throws when the conversation is not in `ai_chats` (the foreign key); the confirmer catches
 * that and lets only the one call it was asked about run.
 *
 * @complexity O(1) per call (primary-key lookups).
 */
export function createSqliteConversationToolApprovalStore(db: SqliteDatabase): ConversationToolApprovalStore {
  const selectStmt = db.prepare(
    `SELECT fingerprint FROM assistant_conversation_tool_approvals
     WHERE conversation_id = ? AND principal_id = ? AND connection_id = ? AND tool_name = ?`,
  );
  const upsertStmt = db.prepare(
    `INSERT INTO assistant_conversation_tool_approvals (conversation_id, principal_id, connection_id, tool_name, fingerprint, granted_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (conversation_id, principal_id, connection_id, tool_name)
     DO UPDATE SET fingerprint = excluded.fingerprint, granted_at = excluded.granted_at`,
  );
  return {
    async has(key) {
      const row = selectStmt.get(key.conversationId, key.principalId, key.connectionId, key.toolName) as { fingerprint: string } | undefined;
      return row?.fingerprint === key.fingerprint;
    },
    async grant(key, grantedAt) {
      upsertStmt.run(key.conversationId, key.principalId, key.connectionId, key.toolName, key.fingerprint, grantedAt);
    },
  };
}
