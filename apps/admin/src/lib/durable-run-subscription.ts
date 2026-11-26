import { browserDurableSubscriptionPorts as createBrowserPorts, followDurableRun as follow } from "@jini-ai/chat/transports/http";
import type { DurableRunBinding, DurableSubscriptionPorts } from "@jini-ai/chat/transports/http";
import { RUN_NOTICES } from "@tovu/assistant-run-events";
import { followDurableRun as followWithActivity } from "@jini-ai/admin/shell/lib/stream-activity";
export const durableRunBindings = new Map<string, DurableRunBinding>();
export function followDurableRun(required: Omit<Parameters<typeof follow>[0], "notices" | "bindings">, optional = {}): () => void {
  return followWithActivity({ ...required, deps: { follow: (input, options) => follow({ ...input, notices: RUN_NOTICES, bindings: durableRunBindings }, options) } }, optional);
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
