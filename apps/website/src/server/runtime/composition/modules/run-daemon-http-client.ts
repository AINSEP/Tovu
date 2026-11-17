import type { DurableRun } from "@jini-ai/chat/server/durable-runs";
import { trackFetch, type ObservabilityPort } from "@jini-ai/diagnostics/observability";

import { RUN_PRINCIPAL_HEADER } from "#src/assistant/index";

import { assistantDaemonToken } from "../../lifecycle/assistant-daemon-connection.js";
import { fetchWithDaemonParkRecovery } from "../../lifecycle/daemon-demand-fetch.js";
import { ensureAssistantDaemonReady } from "../../lifecycle/daemon-supervisor.js";
import { releaseUnreadBody } from "./run-finalizer/release-body.js";
import { createRunDaemonOrigins, type RunDaemonAddress, type RunDaemonOrigins } from "./run-daemon-origins.js";

/**
 * @file The assistant daemon over loopback HTTP, as the run finalizer's daemon port. Host code:
 * it knows the daemon registry, the principal header, park recovery and which of two daemon
 * processes (the previous site's or the current one) holds a run.
 */

/** The persisted run's owner, supplied by storage rather than an HTTP client. */
export interface RunDaemonRequest {
  readonly runId: string;
  readonly principalId: string;
}

/** What the finalizer needs from the daemon. Injected so tests can stand in a fake daemon. */
export interface RunDaemonClient {
  /** Opens `/api/runs/:id/events` from event 0. Resolves with the raw response. */
  openEvents(required: RunDaemonRequest, optional?: { signal?: AbortSignal }): Promise<Response>;
  /** `GET /api/runs/:id`'s HTTP status, or `null` when the daemon could not be reached at all. */
  runStatus(required: RunDaemonRequest, optional?: { signal?: AbortSignal }): Promise<number | null>;
  launch?(required: { run: DurableRun; request: { contextRef: string; agentId?: string } }, optional: {}): Promise<void>;
  cancel?(required: RunDaemonRequest, optional: {}): Promise<void>;
  /** Release this principal/run's retained endpoint and capability after its watch ends. Idempotent. */
  release?(required: RunDaemonRequest, optional?: {}): void;
}

function daemonHeaders({ principalId, token }: { principalId: string; token: string | undefined }, _optional = {}): Record<string, string> {
  const headers: Record<string, string> = { [RUN_PRINCIPAL_HEADER]: principalId, Accept: "text/event-stream" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

interface HttpRunDaemonClientOptions {
  /** Serving boot snapshots the prior site's registry before the replacement daemon publishes.
   * A 404 from a new port says nothing about a run still executing on the previous port. */
  previousDaemon?: () => Promise<{ url: string; pid: number; token?: string } | null>;
  isAlive?: (required: { pid: number }) => boolean;
  currentUrl?: () => string;
  ensureReady?: typeof ensureAssistantDaemonReady;
  onParked?: (required: { pid: number }) => void;
  fetch?: typeof fetch;
}
/** `trackFetch` over the injected or global fetch. */
type Send = (url: string, init?: RequestInit) => Promise<Response>;
/** What every request of one client shares. */
interface ClientContext { readonly send: Send; readonly origins: RunDaemonOrigins; readonly optional: HttpRunDaemonClientOptions }

async function statusAt(
  { send, url, token, runId, principalId }: RunDaemonRequest & RunDaemonAddress & { send: Send },
  { signal }: { signal?: AbortSignal } = {},
): Promise<number | null> {
  try {
    const response = await send(`${url}/api/runs/${encodeURIComponent(runId)}`, {
      headers: daemonHeaders({ principalId, token }), signal: signal ?? AbortSignal.timeout(5_000),
    });
    // The response headers establish the status; a stalled body must not stall recovery.
    // The status is already known; disposing the unused response body is best effort.
    releaseUnreadBody({ response });
    return response.status;
  } catch {
    return null;
  }
}

async function launch({ context, run, request }: { context: ClientContext; run: DurableRun; request: { contextRef: string; agentId?: string } }, _optional = {}): Promise<void> {
  const { send, origins, optional } = context;
  const principalId = run.principalId;
  if (!principalId) throw new Error("assistant continuation has no principal id");
  await (optional.ensureReady ?? ensureAssistantDaemonReady)({}, {});
  const response = await fetchWithDaemonParkRecovery({ send: () => {
    const address = origins.current();
    return send(`${address.url}/api/runs`, {
      method: "POST", headers: { ...daemonHeaders({ principalId, token: address.token }), "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, runId: run.runId, idempotencyKey: run.runId }), signal: AbortSignal.timeout(10_000),
    });
  } }, optional);
  if (!response.ok) throw new Error(`continuation rejected (${response.status})`);
  await response.body?.cancel();
}

async function cancel({ context, run }: { context: ClientContext; run: RunDaemonRequest }, _optional = {}): Promise<void> {
  const address = await context.origins.replayOrigin(run);
  const response = await context.send(`${address.url}/api/runs/${encodeURIComponent(run.runId)}/cancel`, {
    method: "POST", headers: { ...daemonHeaders({ principalId: run.principalId, token: address.token }), "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "recovery-fence" }), signal: AbortSignal.timeout(5_000),
  });
  await response.body?.cancel();
}

async function runStatus({ context, run }: { context: ClientContext; run: RunDaemonRequest }, requestOptions: { signal?: AbortSignal } = {}): Promise<number | null> {
  const { send, origins } = context;
  try {
    const address = await origins.replayOrigin(run);
    const status = await statusAt({ send, ...run, ...address }, requestOptions);
    if (status !== null && status !== 404) {
      origins.retainLive({ run, address, status }, requestOptions);
      return status;
    }
    const replacement = origins.current();
    if (address.url === replacement.url || requestOptions.signal?.aborted) return status;
    // PID existence can mean PID reuse. A prior endpoint that cannot find this id may also
    // be a surviving daemon predating a NEW accepted attempt on the current port. Probe both
    // before declaring death; a live prior response always wins. A registry read error still
    // fails closed because the owning address is then unknown.
    const currentStatus = await statusAt({ send, ...run, ...replacement }, requestOptions);
    if (currentStatus === 200) origins.retainLive({ run, address: replacement, status: currentStatus }, requestOptions);
    else origins.release(run);
    return currentStatus;
  } catch {
    return null;
  }
}

/** The real daemon, over loopback HTTP — the same URL, token and principal header the proxy uses.
 *  Each request is one outbound span through `observability` (host/port and status, never the run id
 *  or token); the events request's span ends at the response headers, not with the stream.
 *  Successful status probes pin the owning endpoint/capability until its process dies or the watch calls `release`.
 *  @complexity O(1) per request beyond transport; O(w) retained addresses for w active run/principal watches. */
export function createHttpRunDaemonClient(
  { observability }: { observability: ObservabilityPort },
  optional: HttpRunDaemonClientOptions = {},
): RunDaemonClient {
  // The global `fetch` read per call, so a test that swaps it is still honored.
  const send = trackFetch({ fetch: (url: string, init?: RequestInit) => (optional.fetch ?? fetch)(url, init), observability });
  // Both snapshots are taken here, once, before anything else: the prior daemon's fallback token
  // and its registry record must be read before the replacement daemon publishes.
  const initialToken = assistantDaemonToken({}, {});
  const previous = optional.previousDaemon?.().then((record) => ({ record }), (error: unknown) => ({ error }));
  const origins = createRunDaemonOrigins({ previous, initialToken }, optional);
  const context: ClientContext = { send, origins, optional };
  return {
    release(required, _options = {}) { origins.release(required); },
    launch: ({ run, request }, _options) => launch({ context, run, request }),
    cancel: (required, _options) => cancel({ context, run: required }),
    openEvents: async (required, { signal } = {}) => {
      const address = await origins.replayOrigin(required);
      return send(`${address.url}/api/runs/${encodeURIComponent(required.runId)}/events`, { headers: daemonHeaders({ principalId: required.principalId, token: address.token }), signal });
    },
    runStatus: (required, requestOptions = {}) => runStatus({ context, run: required }, requestOptions),
  };
}
