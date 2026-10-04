// Local federation forks moved to @jini-ai/mcp/federation (+ /stdio, /approvals); see development/DELETED-CODE.md.
/**
 * @file The `chat.db` half of G3 remembered approvals: "Allow for this chat", stored with the
 * conversation (`assistant_conversation_tool_approvals`, created by `platform/db/sqlite/chat-db.ts`)
 * so it survives a daemon/API restart and is deleted with the chat. See
 * `assistant/external-mcp-tool-approvals.ts` for the fingerprint and the "Always" half.
 */
import { type ChatKernel, chatKernel } from "#src/platform/db/chat-kernel";
import type { SqliteConnectionSource } from "@jini-ai/db/kernel/sqlite";

import type { ConversationToolApprovalStore } from "../external-mcp-tool-approval-ports.js";

/**
 * A {@link ConversationToolApprovalStore} over the chat kernel: one Kysely body for every dialect.
 * The name predates the kernel; kept so the composition roots need no edit.
 *
 * `grant` throws when the conversation is not in `ai_chats` (the foreign key); the confirmer catches
 * that and lets only the one call it was asked about run.
 *
 * @param store the chat kernel, or the open `chat.db` handle (`openChatDb`) whose kernel to use.
 * @complexity O(1) per call (primary-key lookups).
 */
export function createSqliteConversationToolApprovalStore(
  store: ChatKernel | SqliteConnectionSource
): ConversationToolApprovalStore {
  const kernel = chatKernel(store);
  return {
    async has(key) {
      const row = await kernel.run((db) =>
        db
          .selectFrom("assistant_conversation_tool_approvals")
          .select("fingerprint")
          .where("conversation_id", "=", key.conversationId)
          .where("principal_id", "=", key.principalId)
          .where("connection_id", "=", key.connectionId)
          .where("tool_name", "=", key.toolName)
          .executeTakeFirst()
      );
      return row?.fingerprint === key.fingerprint;
    },
    async grant(key, grantedAt) {
      await kernel.run((db) =>
        db
          .insertInto("assistant_conversation_tool_approvals")
          .values({
            conversation_id: key.conversationId,
            principal_id: key.principalId,
            connection_id: key.connectionId,
            tool_name: key.toolName,
            fingerprint: key.fingerprint,
            granted_at: grantedAt,
          })
          .onConflict((oc) =>
            oc
              .columns(["conversation_id", "principal_id", "connection_id", "tool_name"])
              .doUpdateSet({ fingerprint: key.fingerprint, granted_at: grantedAt })
          )
          .execute()
      );
    },
  };
}
