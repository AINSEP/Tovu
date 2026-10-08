import { isDaemonRunId } from "#src/contracts/core/assistant-run-events";
import { createChatHistoryStore as createHistory } from "@jini-ai/chat/store/runtime";
import type { ChatOwnerScope, ChatStore } from "@jini-ai/chat/store";
import type { ChatKernel } from "#src/platform/db/chat-kernel";
/** Borrow the host kernel; transcript adapters and legacy order repair belong to Jini. */
export function createChatHistoryStore(kernel: ChatKernel, scope: ChatOwnerScope, now: () => number = Date.now): ChatStore {
  return createHistory({ kernel, scope, isDaemonRunId: ({ runId }) => isDaemonRunId(runId) }, { now });
}
