import type { ChatMessage } from "@jini-ai/chat/core";
import type { ChatRunLedger } from "#src/assistant/persistence/run-ledger";
import type { DurableRun, DurableRunStore } from "#src/assistant/durable-runs/ports";

/** Recovery integration fake: all mutations honor the same generation and terminal predicates. */
export function recoveryLedgerFixture(
  { message, now }: { message: ChatMessage; now: () => number }, _optional = {},
) {
  let attempt: DurableRun = { messageId: message.id, conversationId: "chat", runId: message.runId!, workspaceId: "ws", principalId: "owner", engine: "daemon",
    message, transcript: [], request: { agentId: "opencode", contextRef: JSON.stringify({ prompt: "Answer", conversationId: "chat", assistantMessageId: message.id }) },
    recoveryCount: 0, recoveryDeadline: null, attemptStartedAt: 0, lastProgressAt: now(), cancelReason: null,
    sessionId: null, sessionConfirmed: false, child: null, attemptBase: [],
  };
  let elapsed = 0;
  const current = (runId: string) => message.runId === runId && ["queued", "running"].includes(message.runStatus ?? "");
  const snapshot = () => ({ ...attempt, runId: message.runId!, message: { ...message, events: [...(message.events ?? [])] } });
  const durable: DurableRunStore = {
    load: async () => snapshot(), find: async ({ runId }) => message.runId === runId ? snapshot() : null,
    accept: async () => snapshot(),
    async advance({ run, nextRunId, now, events }) {
      if (!current(run.runId) || attempt.cancelReason) return false;
      Object.assign(message, { runId: nextRunId, runStatus: "queued", events: [...events] });
      attempt = { ...attempt, runId: nextRunId, recoveryCount: attempt.recoveryCount + 1, attemptStartedAt: now, attemptBase: events };
      return true;
    },
    cancel: async ({ reason }) => { attempt = { ...attempt, cancelReason: reason }; },
    cancelPending: async () => snapshot(), captureSession: async () => true, clearSession: async () => {},
    guardTool: async () => "allowed", completeTool: async () => {},
    async recoveryClock({ runId, active, now }) {
      if (!current(runId)) return;
      if (active && attempt.recoveryDeadline === null) attempt = { ...attempt, recoveryDeadline: now + 300_000 - elapsed };
      if (!active && attempt.recoveryDeadline !== null) { elapsed = 300_000 - (attempt.recoveryDeadline - now); attempt = { ...attempt, recoveryDeadline: null }; }
    },
  };
  const ledger: ChatRunLedger = {
    durable,
    unlessSettled: async (_run, write) => ({ written: true, value: await write() }),
    async checkpoint(input) {
      if (!current(input.runId) || input.content.length < message.content.length) return false;
      Object.assign(message, { content: input.content, events: [...input.events] }); return true;
    },
    async settle(input) {
      if (!current(input.runId)) return false;
      const content = input.content.length < message.content.length ? message.content : input.content;
      Object.assign(message, { content, events: [...input.events], runStatus: input.status, endedAt: input.endedAt }); return true;
    },
    reconcileInterrupted: async (_required, options) => await options?.recover?.({ principalId: "owner", conversationId: "chat", message: { ...message } }) ? 1 : 0,
  };
  return { ledger, snapshot };
}
