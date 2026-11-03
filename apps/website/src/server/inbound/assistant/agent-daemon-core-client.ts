/** Private Tovu retained-state client. No retry or acceptance mirror: a lost mutation response
 * remains uncertain in the server's real ledger. Provider plugins also have that single owner. */
import { z } from "zod";
import { fetchTextWithTimeout } from "@jini-ai/platform/fetch-with-timeout";
import { createTracker, redactedError } from "@jini-ai/diagnostics/observability/node";
import type { Tracker } from "@jini-ai/diagnostics/observability";
import type { AiTraceEvent, AiTraceSink, AiContentCapture } from "@jini-ai/agent-runtime/ai-trace";
import type { getEffective } from "@jini-ai/core/settings";
import { DaemonCoreError, daemonCoreSnapshot, type DaemonCoreRequest, type DaemonDurableRunStore, type DaemonCoreSnapshot } from "#src/assistant/daemon-core-protocol";

export interface DaemonCoreClient {
  bootstrap(): Promise<DaemonCoreSnapshot>;
  readonly durable: DaemonDurableRunStore;
  readonly getEffective: typeof getEffective;
  readonly tracker: Tracker;
  getSessionForAttempt(input: { runId: string }, options?: Record<string, never>): Promise<string | null>;
  trace(input: { capture: AiContentCapture }, options?: Record<string, never>): AiTraceSink;
  flush(): Promise<void>;
  close(): Promise<void>;
}

/** Compose only the retained private operations over Jini's bounded transport (TLS roots included).
 * @param required Actual site listener origin and separately held per-boot RPC credential.
 * @param optional Injectable fetch, never a local fallback.
 * @returns Site authority, fresh settings and an admission-bounded telemetry sender.
 * @throws On refused/invalid RPC; telemetry failures are reported locally and never escape a run.
 * @complexity O(payload bytes), 16 MiB/control request, 5 s/call; at most 128 ordered telemetry envelopes / 4 MiB queued; 1 s drain.
 * @example const site = createDaemonCoreClient({ baseUrl, token });
 */
export function createDaemonCoreClient({ baseUrl, token }: { baseUrl: string; token: string }, options: { fetch?: typeof fetch } = {}): DaemonCoreClient {
  const endpoint = new URL("/internal/agent-daemon-core", baseUrl);
  if (!["http:", "https:"].includes(endpoint.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname) || !token) {
    throw new DaemonCoreError({ reason: "the daemon needs its site's authenticated loopback listener" });
  }
  let traceCapture: AiContentCapture = "metadata";
  /** One owner call, never retrying an uncertain write. The envelope distinguishes null from refusal. */
  async function call(request: DaemonCoreRequest): Promise<unknown> { return transmit(JSON.stringify(request)); }
  /** Send an already serialized host envelope without retaining a second object graph. */
  async function transmit(body: string, signal?: AbortSignal): Promise<unknown> {
    if (Buffer.byteLength(body) > 16 * 1024 * 1024) throw new DaemonCoreError({ reason: "retained-state request exceeds 16 MiB" });
    const { response, text } = await fetchTextWithTimeout({ url: endpoint, timeoutMs: 5_000, init: {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body, redirect: "error", cache: "no-store", ...(signal ? { signal } : {}),
    } }, { ...options, maxResponseBytes: 16 * 1024 * 1024, strictUtf8: true });
    if (!response.ok) throw new DaemonCoreError({ reason: `site retained-state RPC refused (${response.status})` });
    const envelope = z.object({ value: z.unknown(), traceCapture: z.enum(["off", "metadata", "full"]).optional() }).parse(JSON.parse(text) as unknown);
    // Durable intake reads before lifecycle.start, so the next recorder sees live provider policy.
    // The server's existing fan-out still enforces each destination's current consent on delivery.
    if (envelope.traceCapture !== undefined) traceCapture = envelope.traceCapture;
    return envelope.value;
  }
  const durable: DaemonDurableRunStore = {
    find: async input => {
      const value = await call({ operation: "find", input });
      if (value === null) return null;
      // The private owner supplies only the retained head. Validate authority before use.
      z.object({ runId: z.string(), workspaceId: z.string(), messageId: z.string(), conversationId: z.string(),
        principalId: z.string().nullable(), cancelReason: z.string().nullable(),
        message: z.object({ runStatus: z.string().nullable().optional() }), request: z.object({ contextRef: z.string() }) }).parse(value);
      return value as Awaited<ReturnType<DaemonDurableRunStore["find"]>>;
    },
    captureSession: async input => z.boolean().parse(await call({ operation: "captureSession", input })),
    clearSession: async input => { await call({ operation: "clearSession", input }); },
    guardTool: async input => z.enum(["allowed", "unknown", "stale"]).parse(await call({ operation: "guardTool", input })),
    completeTool: async input => { await call({ operation: "completeTool", input }); },
  };
  let tail: Promise<void> = Promise.resolve();
  let queued = 0;
  let queuedBytes = 0;
  let stopped = false;
  const telemetryAbort = new AbortController();
  /** Preserve provider event order without blocking a run. Reject overflow before retaining it:
   * at most 128 envelopes and 4 MiB of UTF-8 wire data (bounded expansion in JS strings).
   * Serialization and delivery failures are diagnostics only, never a new run failure. */
  function send(request: DaemonCoreRequest): void {
    if (stopped) return;
    let body: string;
    try { body = JSON.stringify(request); }
    catch { console.warn("[agent-daemon] telemetry serialization failed"); return; }
    const bytes = Buffer.byteLength(body);
    if (queued >= 128 || bytes > 2 * 1024 * 1024 || queuedBytes + bytes > 4 * 1024 * 1024) { console.warn("[agent-daemon] telemetry queue is full"); return; }
    queued++; queuedBytes += bytes;
    tail = tail.then(() => transmit(body, telemetryAbort.signal)).then(() => {}, () => {
      console.warn("[agent-daemon] telemetry delivery failed");
    }).finally(() => { queued--; queuedBytes -= bytes; });
  }
  const tracker: Tracker = { ...createTracker({}),
    capture: (input: { name: string; userId: string }, optional: { properties?: Readonly<Record<string, string | number | boolean>> } = {}) => {
      send({ operation: "telemetryCapture", input: { ...input, ...optional } });
    },
    error: (input: Parameters<ReturnType<typeof createTracker>["error"]>[0], optional: Parameters<ReturnType<typeof createTracker>["error"]>[1] = {}) => {
      const error = redactedError({ error: input.error }, { exactSecrets: optional.context?.exactSecrets });
      send({ operation: "telemetryError", input: { name: error.name, message: error.message, stack: error.stack,
        operation: optional.context?.operation ?? optional.context?.route ?? "daemon", level: optional.context?.level,
        attributes: { ...optional.context?.attributes, process: "daemon" } } });
    },
  };
  /** Drain this client's accepted events and the trace sink; never dispose server provider leases. */
  async function flush(): Promise<void> {
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<void>(resolve => { deadline = setTimeout(() => {
      stopped = true; telemetryAbort.abort();
      console.warn("[agent-daemon] telemetry drain exceeded one second"); resolve();
    }, 1_000); });
    const drain = tail.then(() => transmit(JSON.stringify({ operation: "telemetryFlush", input: {} }), telemetryAbort.signal)).then(() => {});
    try { await Promise.race([drain, expired]); }
    finally { clearTimeout(deadline); }
  }
  const readEffective: typeof getEffective = async (_deps, input) => {
    const value = await call({ operation: "getEffective", input: input as Extract<DaemonCoreRequest, { operation: "getEffective" }>["input"] });
    if (value === null) return null;
    z.object({ value: z.unknown(), sourceLayer: z.string() }).parse(value);
    return value as Awaited<ReturnType<typeof getEffective>>;
  };
  return { bootstrap: async () => daemonCoreSnapshot.parse(await call({ operation: "bootstrap", input: {} })), durable,
    getEffective: readEffective, tracker, flush, close: async () => { stopped = true; await flush(); },
    getSessionForAttempt: async (input: { runId: string }, _options = {}) => z.string().nullable().parse(await call({ operation: "sessionForAttempt", input })),
    trace: ({ capture }: { capture: AiContentCapture }, _options = {}): AiTraceSink => {
      traceCapture = capture;
      return { get capture() { return traceCapture; },
        record: (event: AiTraceEvent) => send({ operation: "telemetryTrace", input: event }), flush };
    },
  };
}
