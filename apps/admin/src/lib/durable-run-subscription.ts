import type { ChatMessage } from "@jini-ai/chat/core";
import { followDurableRun as follow } from "@jini-ai/chat/transports/http";
import type { DurableRunBinding, DurableSubscriptionPorts } from "@jini-ai/chat/transports/http";
import { RUN_NOTICES } from "@tovu/assistant-run-events";
import { subscriptionEnded, type TrackedRunHandlers } from "./stream-activity";
import { querySuffix } from "./query-suffix";
export type { DurableRunBinding, DurableSubscriptionPorts } from "@jini-ai/chat/transports/http";
export const durableRunBindings = new Map<string, DurableRunBinding>();
/** Jini owns recovery, continuation, polling and terminal disposal. A missing durable row ends
 * this browser subscription without onDone, so release the host's page-stream retain as well.
 */
export function followDurableRun(required: Omit<Parameters<typeof follow>[0], "notices" | "bindings">, optional = {}): () => void {
  const endActivity = () => (required.handlers as TrackedRunHandlers)[subscriptionEnded]?.();
  const stop = follow({ ...required, notices: RUN_NOTICES, bindings: durableRunBindings, ports: {
    ...required.ports,
    read: async (input, options) => {
      const message = await required.ports.read(input, options);
      if (message === "gone") endActivity();
      return message;
    },
  } }, optional);
  return () => { stop(); endActivity(); };
}

/** Browser adapters only: active run streams are never visibility-paused. Ports permit DI fakes
 * without replacing modules; native disconnects retain Jini's existing recovery/backoff behavior.
 */
export function browserDurableSubscriptionPorts(_required = {}, {
  request = fetch, open = (url: string) => new EventSource(url),
  schedule = ({ work, delayMs }: { work: () => void; delayMs: number }) => {
    const timer = setTimeout(work, delayMs); return () => clearTimeout(timer);
  },
}: {
  request?: typeof fetch;
  open?: (url: string) => Pick<EventSource, "addEventListener" | "close" | "readyState">;
  schedule?: (required: { work: () => void; delayMs: number }) => () => void;
} = {}): DurableSubscriptionPorts {
  return {
    async read({ runId, messageId }, { recover = true }: { recover?: boolean } = {}) {
      const path = `/api/runs/${encodeURIComponent(runId)}`;
      const checkpointQuery = messageId ? "messageId=" + encodeURIComponent(messageId) : "";
      const response = recover ? await request(`${path}/recover`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId }),
      }) : await request(`${path}/checkpoint${querySuffix(checkpointQuery)}`, {
        method: "GET", credentials: "same-origin",
      });
      if (response.status === 404) return "gone";
      if (!response.ok) return null;
      const payload = await response.json() as { message: ChatMessage };
      return payload.message;
    },
    stream({ runId, cursor, frame, dropped }, _options) {
      const source = open(`/api/runs/${encodeURIComponent(runId)}/events${querySuffix(cursor ? "afterCursor=" + encodeURIComponent(cursor) : "")}`);
      for (const kind of ["agent", "stdout", "stderr", "end", "error"]) {
        source.addEventListener(kind, (event) => {
          const message = event as MessageEvent<string>;
          if (kind === "error" && !message.data) { source.close(); dropped(); return; }
          frame(kind, message.data, message.lastEventId);
        });
      }
      return () => source.close();
    },
    schedule(required, _options) { return schedule(required); },
  };
}
