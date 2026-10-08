import { isDaemonRunId } from "#src/contracts/core/assistant-run-events";
import { createChatRunLedger as createLedger } from "@jini-ai/chat/store/runtime";
import { chatKernel, type ChatKernel } from "#src/platform/db/chat-kernel";
import type { SqliteConnectionSource } from "@jini-ai/db/kernel/sqlite";
import type { ChatRunLedger as JiniLedger, RunRef, UnlessSettled } from "@jini-ai/chat/store/runtime";
export type * from "@jini-ai/chat/store/runtime";
export { runLockKey } from "@jini-ai/chat/store/runtime";
/** Legacy host call contract while all run semantics are owned by Jini. */
export interface ChatRunLedger extends Omit<JiniLedger, "unlessSettled"> {
  unlessSettled<T>(run: RunRef, write: () => Promise<T>): Promise<UnlessSettled<T>>;
}
export function createChatRunLedger(store: ChatKernel | SqliteConnectionSource): ChatRunLedger {
  const ledger = createLedger({ kernel: chatKernel(store), isDaemonRunId: ({ runId }) => isDaemonRunId(runId) }, {});
  return { ...ledger, unlessSettled: (run, write) => ledger.unlessSettled({ run, write }, {}) };
}
