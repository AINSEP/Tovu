import type { ChatOwnerScope, ChatStore } from "@jini-ai/chat/store";
import { createSqliteChatStore } from "@jini-ai/chat/store/sqlite";
// Owner isolation versus legacy project-only storage: Jini/packages/chat/src/store/sqlite/index.ts.
import { createPgliteChatStore } from "@jini-ai/chat/store/pglite";
import { createPostgresChatStore } from "@jini-ai/chat/store/postgres";

import type { ChatKernel } from "#src/platform/db/chat-kernel";

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
  switch (kernel.transport) {
    case "better-sqlite3": return createSqliteChatStore(required, optional);
    case "pglite":
    case "pglite-socket": return createPgliteChatStore(required, optional);
    default: return createPostgresChatStore(required, optional);
  }
}
