import type { ChatMessage, RunHandlers } from "@jini-ai/chat/core";
import { translateRunFrame } from "@tovu/assistant-run-events";

export interface DurableRunBinding { readonly messageId: string; readonly conversationId: string }
export const durableRunBindings = new Map<string, DurableRunBinding>();

export interface DurableSubscriptionPorts {
  readonly read: (required: { runId: string; messageId?: string }, optional: {}) => Promise<ChatMessage | null | "gone">;
  readonly stream: (required: { runId: string; cursor: string; frame: (kind: string, data: string, cursor: string) => void; dropped: () => void }, optional: {}) => () => void;
  readonly schedule: (required: { work: () => void; delayMs: number }, optional: {}) => () => void;
}

type CheckpointHandlers = RunHandlers & { onCheckpoint?: (message: ChatMessage) => void };

/** SSE is a view of one attempt. The saved message owns terminal state and can point at a new
 * attempt after recovery; neither a browser 404 nor a closed stream may fail the logical run. */
export function followDurableRun(
  { runId: initialRunId, handlers, signal, binding, ports }: { runId: string; handlers: CheckpointHandlers; signal?: AbortSignal; binding?: DurableRunBinding; ports: DurableSubscriptionPorts }, _optional = {},
): () => void {
  let runId = initialRunId;
  let cursor = "";
  let stopped = false;
  let reading = false;
  let dropped = false;
  let stopStream: (() => void) | undefined;
  let stopTimer: (() => void) | undefined;
  let messageId = binding?.messageId;

  function stop() {
    stopped = true;
    stopStream?.();
    stopTimer?.();
    signal?.removeEventListener("abort", stop);
  }

  function finish(message: ChatMessage) {
    stop();
    handlers.onCheckpoint?.(message);
    if (message.runStatus === "failed" && !handlers.onCheckpoint) handlers.onError(new Error("The assistant could not finish this answer. Saved work is above."));
    handlers.onDone(message.events ?? []);
  }

  function open() {
    dropped = false;
    stopStream?.();
    stopStream = ports.stream({ runId, cursor, frame, dropped: () => { dropped = true; void read().catch(() => undefined); } }, {});
  }

  function frame(kind: string, data: string, nextCursor: string) {
    if (stopped) return;
    if (nextCursor) cursor = nextCursor;
    const outcome = translateRunFrame(kind, data);
    // An attempt's error/end may be followed by a continuation. Only the row can finalize it.
    if (outcome.terminal || outcome.error) { void read().catch(() => undefined); return; }
    // With the checkpoint-capable hook, render only durable projections. Replaying a daemon
    // prefix into a seeded bubble would duplicate its text; the server folds those deltas once.
    if (handlers.onCheckpoint) return;
    for (const event of outcome.events) handlers.onEvent(event);
  }

  async function read() {
    if (stopped || reading) return;
    reading = true;
    stopTimer?.();
    stopTimer = undefined;
    try {
      const message = await ports.read({ runId, ...(messageId ? { messageId } : {}) }, {});
      if (stopped || !message) return;
      if (message === "gone") { stop(); return; }
      applySavedMessage(message);
    } finally {
      reading = false;
      if (!stopped) stopTimer = ports.schedule({ work: () => void read().catch(() => undefined), delayMs: 1_000 }, {});
    }
  }

  function applySavedMessage(message: ChatMessage) {
    messageId = message.id;
    if (["succeeded", "failed", "canceled"].includes(message.runStatus ?? "")) { finish(message); return; }
    handlers.onCheckpoint?.(message);
    if (message.runId && message.runId !== runId) {
      runId = message.runId;
      cursor = "";
      if (binding) durableRunBindings.set(runId, binding);
      dropped = true;
    }
    if (dropped) open();
  }

  if (signal?.aborted) return stop;
  signal?.addEventListener("abort", stop);
  open();
  // Polling also covers an attempt that dies before a first frame/connection error arrives.
  stopTimer = ports.schedule({ work: () => void read().catch(() => undefined), delayMs: 1_000 }, {});
  return stop;
}

export function browserDurableSubscriptionPorts(_required = {}, _optional = {}): DurableSubscriptionPorts {
  return {
    async read({ runId, messageId }, _options) {
      const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/recover`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId }),
      });
      if (response.status === 404) return "gone";
      if (!response.ok) return null;
      const payload = await response.json() as { message: ChatMessage };
      return payload.message;
    },
    stream({ runId, cursor, frame, dropped }, _options) {
      const source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events${cursor ? `?afterCursor=${encodeURIComponent(cursor)}` : ""}`);
      for (const kind of ["agent", "stdout", "stderr", "end", "error"]) {
        source.addEventListener(kind, (event) => {
          const message = event as MessageEvent<string>;
          if (kind === "error" && !message.data) { source.close(); dropped(); return; }
          frame(kind, message.data, message.lastEventId);
        });
      }
      return () => source.close();
    },
    schedule({ work, delayMs }, _options) { const timer = setTimeout(work, delayMs); return () => clearTimeout(timer); },
  };
}
