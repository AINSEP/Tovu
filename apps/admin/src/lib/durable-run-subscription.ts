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

/** Map the existing recovery/checkpoint routes to one fetch. Conditional headers apply only to
 * routine polls; explicit recovery must always reach the finalizer. No response body is read here.
 */
function requestDurableProjection({ request, runId, messageId, recover, etag }: {
  request: typeof fetch; runId: string; messageId?: string | undefined; recover: boolean; etag?: string | null | undefined;
}, _options = {}): Promise<Response> {
  const path = `/api/runs/${encodeURIComponent(runId)}`;
  if (recover) return request(`${path}/recover`, {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId }),
  });
  const query = messageId ? 'messageId=' + encodeURIComponent(messageId) : '';
  return request(`${path}/checkpoint${querySuffix(query)}`, {
    method: 'GET', credentials: 'same-origin', ...(etag ? { headers: { 'If-None-Match': etag } } : {}),
  });
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
  let checkpointKey: string | undefined;
  let checkpointEtag: string | null | undefined;
  return {
    async read({ runId, messageId }, { recover = true }: { recover?: boolean } = {}) {
      const key = messageId ?? runId;
      const etag = checkpointKey === key ? checkpointEtag : undefined;
      const response = await requestDurableProjection({ request, runId, messageId, recover, etag });
      if (recover) { checkpointKey = undefined; checkpointEtag = undefined; }
      if (response.status === 304) return null;
      if (response.status === 404) return "gone";
      if (!response.ok) return null;
      if (!recover) { checkpointKey = key; checkpointEtag = response.headers.get('ETag'); }
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
