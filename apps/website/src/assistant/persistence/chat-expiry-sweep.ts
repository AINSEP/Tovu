import { createSqliteChatMaintenance } from "@jini-ai/chat/store/sqlite";
import { createPgliteChatMaintenance } from "@jini-ai/chat/store/pglite";
import { createPostgresChatMaintenance } from "@jini-ai/chat/store/postgres";
import { sweepExpiredChats as sweep, startChatExpirySweep as startSweep } from "@jini-ai/chat/store/runtime";
import { chatKernel, type ChatKernel } from "#src/platform/db/chat-kernel";
import type { SqliteConnectionSource } from "@jini-ai/db/kernel/sqlite";
export { CHAT_EXPIRY_SWEEP_INTERVAL_MS } from "@jini-ai/chat/store/runtime";
/** Maintenance authority stays at composition time; no owner-scoped store can sweep others. */
function maintenanceFor({ store }: { store: ChatKernel | SqliteConnectionSource }, _optional = {}) {
  const kernel = chatKernel(store);
  if (kernel.transport === "better-sqlite3") return createSqliteChatMaintenance({ kernel });
  if (kernel.transport === "pglite" || kernel.transport === "pglite-socket") return createPgliteChatMaintenance({ kernel });
  return createPostgresChatMaintenance({ kernel });
}
export function sweepExpiredChats({ store }: { store: ChatKernel | SqliteConnectionSource }, { now = Date.now() }: { now?: number } = {}): Promise<number> {
  return sweep({ maintenance: maintenanceFor({ store: store }) }, { now });
}
export function startChatExpirySweep({ store }: { store: ChatKernel | SqliteConnectionSource }, options: Parameters<typeof startSweep>[1] = {}): () => Promise<void> {
  return startSweep({ maintenance: maintenanceFor({ store: store }) }, options);
}
