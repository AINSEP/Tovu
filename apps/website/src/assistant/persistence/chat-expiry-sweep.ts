import { createChatMaintenanceForKernel, sweepExpiredChats as sweep, startChatExpirySweep as startSweep } from "@jini-ai/chat/store/runtime";
import { chatKernel, type ChatKernel } from "#src/platform/db/chat-kernel";
import type { SqliteConnectionSource } from "@jini-ai/db/kernel/sqlite";
/** Maintenance authority stays at composition time; no owner-scoped store can sweep others. */
function maintenanceFor({ store }: { store: ChatKernel | SqliteConnectionSource }, _optional = {}) {
  return createChatMaintenanceForKernel({ kernel: chatKernel({ store }) });
}
export function sweepExpiredChats({ store }: { store: ChatKernel | SqliteConnectionSource }, { now = Date.now() }: { now?: number } = {}): Promise<number> {
  return sweep({ maintenance: maintenanceFor({ store: store }) }, { now });
}
export function startChatExpirySweep({ store }: { store: ChatKernel | SqliteConnectionSource }, options: Parameters<typeof startSweep>[1] = {}): () => Promise<void> {
  return startSweep({ maintenance: maintenanceFor({ store: store }) }, options);
}
