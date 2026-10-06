import type { DurableRunStore } from "#src/assistant/durable-runs/ports";
import type { AgentSessionStore } from "#src/assistant/persistence/agent-session-store";
import type { ProcessStartReader } from "./attempt-process-identity.js";

interface SessionEvent { readonly kind: string; readonly payload: unknown }

export function sessionIdFromRunEvent({ event }: { event: SessionEvent }, _optional = {}): string | undefined {
  if (event.payload === null || typeof event.payload !== "object") return undefined;
  const payload = event.payload as { type?: unknown; sessionId?: unknown; sessionRef?: unknown };
  if (event.kind === "end") return typeof payload.sessionRef === "string" ? payload.sessionRef : undefined;
  if (event.kind !== "agent" || payload.type !== "status") return undefined;
  return typeof payload.sessionId === "string" && payload.sessionId ? payload.sessionId : undefined;
}

async function saveSessionLocator(
  { sessions, attemptStore, runId, conversationId, agentId, sessionId }: { sessions: AgentSessionStore; attemptStore?: DurableRunStore;
    runId: string; conversationId: string; agentId: string; sessionId: string }, _optional = {},
): Promise<boolean> {
  // The durable port writes the conversation locator atomically with its generation guard.
  // Non-durable hosts retain the original injected session-store contract.
  if (attemptStore) return attemptStore.captureSession({ runId, sessionId }, {});
  await sessions.setSessionId({ conversationId, agentId, sessionId });
  return true;
}

export function createEarlySessionCapture(
  { sessions, durable, readStart }: { sessions: AgentSessionStore; durable?: DurableRunStore; readStart: ProcessStartReader }, _optional = {},
) {
  return async function capture(
    { event, runId, conversationId, agentId }: { event: SessionEvent; runId: string; conversationId: string; agentId: string }, { durableBinding = true }: { durableBinding?: boolean } = {},
  ): Promise<void> {
    const attemptStore = durableBinding ? durable : undefined;
    const sessionId = sessionIdFromRunEvent({ event }, {});
    if (!sessionId) return;
    // The session locator is committed immediately, even if querying child identity later fails.
    const accepted = await saveSessionLocator({ sessions, attemptStore, runId, conversationId, agentId, sessionId }, {});
    if (!accepted) return;
    const childPid = (event.payload as { childPid?: unknown }).childPid;
    if (typeof childPid !== "number" || !attemptStore) return;
    const startedAt = await readStart({ pid: childPid }, {}).catch(() => null);
    if (startedAt) await attemptStore.captureSession({ runId, sessionId, child: { pid: childPid, startedAt } }, {});
  };
}
