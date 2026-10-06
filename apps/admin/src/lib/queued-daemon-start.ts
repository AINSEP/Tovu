export interface QueuedStartPorts {
  readonly post: (required: { body: unknown }, optional: {}) => Promise<Response>;
  readonly wait: (required: { signal?: AbortSignal }, optional: {}) => Promise<void>;
}

/** Follow-ups wait in this browser only (no durable queue in this cut). Keep the same message
 * identity across retries, and never require an operator to resend a refused concurrent turn. */
export async function startQueuedDaemonRun(
  { body, signal, ports }: { body: unknown; signal?: AbortSignal; ports: QueuedStartPorts }, _optional = {},
): Promise<Response> {
  for (;;) {
    if (signal?.aborted) throw new DOMException("The queued turn was stopped.", "AbortError");
    const response = await ports.post({ body }, {});
    if (response.status !== 409) return response;
    const payload = await response.clone().json().catch(() => null) as { code?: string } | null;
    if (payload?.code !== "CHAT_RUN_BUSY") return response;
    await ports.wait({ signal }, {});
  }
}

export function browserQueuedStartPorts(_required = {}, _optional = {}): QueuedStartPorts {
  return {
    post: ({ body }, _options) => fetch("/api/runs", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    wait: ({ signal }, _options) => new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(new DOMException("The queued turn was stopped.", "AbortError")); return; }
      const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, 1_000);
      function abort() { clearTimeout(timer); reject(new DOMException("The queued turn was stopped.", "AbortError")); }
      signal?.addEventListener("abort", abort, { once: true });
    }),
  };
}
