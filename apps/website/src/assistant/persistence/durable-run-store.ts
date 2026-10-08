import { createDurableRunStore as createStore } from "@jini-ai/chat/store/runtime";
import { isDaemonRunId } from "#src/contracts/core/assistant-run-events";
import type { ChatKernel } from "#src/platform/db/chat-kernel";
export { attemptCanExecute, savedRunEvents, RUN_SLOT_BUSY, RunSlotBusyError } from "@jini-ai/chat/store/runtime";
/** The host owns run-ID prefixes; attempts and their writes belong to Jini. */
export function createDurableRunStore({ kernel }: { kernel: ChatKernel }, options = {}) {
  return createStore({ kernel, isDaemonRunId: ({ runId }) => isDaemonRunId(runId) }, options);
}
