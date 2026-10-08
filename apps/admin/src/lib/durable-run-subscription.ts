import type { ChatMessage } from "@jini-ai/chat/core";
import { followDurableRun as follow } from "@jini-ai/chat/transports/http";
import type { DurableRunBinding, DurableSubscriptionPorts } from "@jini-ai/chat/transports/http";
import { RUN_NOTICES } from "@tovu/assistant-run-events";
export type { DurableRunBinding, DurableSubscriptionPorts } from "@jini-ai/chat/transports/http";
export const durableRunBindings = new Map<string, DurableRunBinding>();
export function followDurableRun(required: Omit<Parameters<typeof follow>[0], "notices" | "bindings">, optional = {}) { return follow({ ...required, notices: RUN_NOTICES, bindings: durableRunBindings }, optional); }

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
