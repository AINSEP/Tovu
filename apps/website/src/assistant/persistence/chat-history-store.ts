import type { ChatOwnerScope, ChatStore } from "@jini-ai/chat/store";
import { createSqliteChatStore } from "@jini-ai/chat/store/sqlite";
// Owner isolation versus legacy project-only storage: Jini/packages/chat/src/store/sqlite/index.ts.
import { createPgliteChatStore } from "@jini-ai/chat/store/pglite";
import { createPostgresChatStore } from "@jini-ai/chat/store/postgres";

import type { ChatKernel } from "#src/platform/db/chat-kernel";
import type { ChatMessage } from "@jini-ai/chat/core";
import { isDaemonRunId } from "#src/contracts/core/assistant-run-events";

function repairLegacyTurnOrder({ messages }: { messages: ChatMessage[] }, _optional = {}): ChatMessage[] {
  const ordered: ChatMessage[] = [];
  for (let index = 0; index < messages.length; index++) {
    const answer = messages[index];
    const question = messages[index + 1];
    // Legacy acceptance saved no question ID. Repair only an orphan daemon answer immediately
    // followed by an earlier/equal-clock user row; a preceding question already owns its answer.
    // A global timestamp sort would reorder valid follow-ups when browser/server clocks disagree.
    if (ordered.at(-1)?.role !== "user" && answer.role === "assistant" && answer.runId && isDaemonRunId(answer.runId)
      && question?.role === "user" && question.createdAt !== undefined && answer.createdAt !== undefined
      && question.createdAt <= answer.createdAt) {
      ordered.push(question, answer);
      index++;
    } else ordered.push(answer);
  }
  return ordered;
}

// Transcript-isolation rationale: Jini packages/chat/src/store/sql/store.ts.
/**
 * Host compatibility factory over Jini's owner-scoped transcript adapters (PLAN C3).
 * Borrows the exact migrated kernel: the adapter's append joins Tovu's run-ledger transaction.
 * The host retains principal hashing, run settlement, migrations and connection lifetime.
 * @param kernel The already-open chat kernel; never wrap or open a second connection here.
 * @param scope The authenticated owner tuple; guest ownerId is already hashed by tenant-scope.
 * @param now Injectable epoch-millisecond clock.
 * @returns Full ChatStore, also assignable to existing eight-method ChatHistoryStore consumers.
 */
export function createChatHistoryStore(
  kernel: ChatKernel,
  scope: ChatOwnerScope,
  now: () => number = Date.now,
): ChatStore {
  const required = { kernel, scope };
  const optional = { clock: { nowMs: now } };
  const store = kernel.transport === "better-sqlite3" ? createSqliteChatStore(required, optional)
    : kernel.transport === "pglite" || kernel.transport === "pglite-socket" ? createPgliteChatStore(required, optional)
    : createPostgresChatStore(required, optional);
  return { ...store,
    // Admin reload and recovery use this full-transcript compatibility read. Preserve stored
    // positions (and Jini's position-based page cursors); existing user databases need no migration.
    async messages(required, optional = {}) {
      return repairLegacyTurnOrder({ messages: await store.messages(required, optional) }, {});
    },
  };
}
