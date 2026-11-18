import { classifyAgentServiceFailure, startupFailureMessage } from "@jini-ai/agent-runtime";
import type { ChatAgentFailurePort } from "@jini-ai/chat/core";

/** Binds chat's `ChatAgentFailurePort` to the real agent runtime: saved executor failures are classified, and a
 * launch rejection is worded and redacted by the runtime, never by chat. */
export const agentFailures = {
  classifyServiceFailure: classifyAgentServiceFailure,
  startupFailureMessage,
} satisfies ChatAgentFailurePort;
