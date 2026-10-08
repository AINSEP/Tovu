/** Tovu agent definition lookup, native timer port and user-facing refusal wording. */
import { AGENT_DEFS } from "@jini-ai/agent-runtime";
import { agentCarriesOwnMemory as carriesMemory, agentAcceptsHostMintedSessionId as acceptsSessionId,
  waitForStoppingRuns as waitForDaemonStoppingRuns } from "@jini-ai/daemon/session-coordination";
import type { LiveRunTracker, StoppingRunLifecycle } from "@jini-ai/daemon/session-coordination";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
export { createLiveRunTracker, createConversationStartLock, failRunBeforeStart, STOPPING_RUN_WAIT_MS,
  resolveHostMintedSessionId, resolveNewSessionField, resolveResumeSessionField,
  extractSessionRefFromEndEvent, shouldClearSessionOnFailedResume, wouldForcedColdStartLoseConversationContext } from "@jini-ai/daemon/session-coordination";
export type { LiveRunTracker, StoppingRunLifecycle, FailingRunLifecycle, ConversationStartLock } from "@jini-ai/daemon/session-coordination";
export const CONCURRENT_RUN_REFUSAL_MESSAGE = "Another answer in this chat is still running. This turn could not start.";
const agents = { lookup: ({ agentId }: { agentId: string }) => AGENT_DEFS.find(def => def.id === agentId) };
export function agentCarriesOwnMemory(required: { agentId: string }, optional = {}): boolean {
  return carriesMemory({ ...required, agents }, optional);
}
export function agentAcceptsHostMintedSessionId(required: { agentId: string }, optional = {}): boolean {
  return acceptsSessionId({ ...required, agents }, optional);
}
export function waitForStoppingRuns(required: { tracker: LiveRunTracker; lifecycle: StoppingRunLifecycle; conversationId: string; runId: string }, optional: { timeoutMs?: number } = {}): Promise<void> {
  return waitForDaemonStoppingRuns({ ...required, scheduler: createTimeoutScheduler({}, { keepAlive: true }) }, optional);
}
