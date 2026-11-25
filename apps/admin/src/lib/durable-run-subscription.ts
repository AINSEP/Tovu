import { browserDurableSubscriptionPorts as createBrowserPorts, followDurableRun as follow } from "@jini-ai/chat/transports/http";
import type { DurableRunBinding, DurableSubscriptionPorts } from "@jini-ai/chat/transports/http";
import { RUN_NOTICES } from "@tovu/assistant-run-events";
import { subscriptionEnded, type TrackedRunHandlers } from "@jini-ai/admin/shell/lib/stream-activity";
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
  return createBrowserPorts({ request, open, schedule, runPath: ({ runId }) => `/api/runs/${encodeURIComponent(runId)}` }, {});
}
