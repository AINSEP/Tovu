import type { Tracker } from "@jini-ai/diagnostics/observability";
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
/** Adapt the shared run ledger and summarize only a newly committed terminal settlement.
 * Attribution lookup failure is diagnostic only and preserves the committed settlement result.
 * @complexity O(1) indexed reads/writes; event projection remains with the shared ledger.
 */
export function createChatRunLedger({ store }: { store: ChatKernel | SqliteConnectionSource }, { tracker }: { tracker?: Tracker } = {}): ChatRunLedger {
  const ledger = createLedger({ kernel: chatKernel(store), isDaemonRunId: ({ runId }) => isDaemonRunId(runId) }, {});
  return { ...ledger,
    async settle(required, optional) {
      const changed = await ledger.settle(required, optional);
      if (!changed || !tracker) return changed;
      const run = await ledger.durable?.find({ runId: required.runId }, {}).catch(() => {
        tracker.error(new Error("Run analytics attribution lookup failed"), { operation: "assistant.run.product-event" });
        return null;
      });
      if (run?.principalId) tracker.capture({ name: "assistant_run_finished", userId: run.principalId,
        properties: { chatSurface: "admin", logicalRunId: required.messageId, outcome: required.status, eventId: `assistant-finish:${required.messageId}` } });
      return changed;
    },
    unlessSettled: (run, write) => ledger.unlessSettled({ run, write }, {}) };
}
