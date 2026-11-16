import type { DurableRun } from "@jini-ai/chat/server/durable-runs";
import { trackFetch, type ObservabilityPort } from "@jini-ai/diagnostics/observability";
import { isProcessAlive } from "@jini-ai/sidecar";

import { RUN_PRINCIPAL_HEADER } from "#src/assistant/index";

import { getAgentDaemonUrl } from "../../lifecycle/agent-daemon-port.js";
import { assistantDaemonToken, previousAssistantDaemonConnection } from "../../lifecycle/assistant-daemon-connection.js";
import { fetchWithDaemonParkRecovery } from "../../lifecycle/daemon-demand-fetch.js";
import { ensureAssistantDaemonReady } from "../../lifecycle/daemon-supervisor.js";

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
  release?(required: RunDaemonRequest, optional?: Record<string, never>): void;
}

function daemonHeaders({ principalId, token }: { principalId: string; token: string | undefined }, _optional = {}): Record<string, string> {
  const headers: Record<string, string> = { [RUN_PRINCIPAL_HEADER]: principalId, Accept: "text/event-stream" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** The real daemon, over loopback HTTP — the same URL, token and principal header the proxy uses.
 *  Each request is one outbound span through `observability` (host/port and status, never the run id
 *  or token); the events request's span ends at the response headers, not with the stream.
 *  Successful status probes pin the owning endpoint/capability until its process dies or the watch calls `release`.
 *  @complexity O(1) per request beyond transport; O(w) retained addresses for w active run/principal watches. */
export function createHttpRunDaemonClient(
  { observability }: { observability: ObservabilityPort },
  optional: {
    /** Serving boot snapshots the prior site's registry before the replacement daemon publishes.
     * A 404 from a new port says nothing about a run still executing on the previous port. */
    previousDaemon?: () => Promise<{ url: string; pid: number; token?: string } | null>;
    isAlive?: (required: { pid: number }) => boolean;
    currentUrl?: () => string;
    ensureReady?: typeof ensureAssistantDaemonReady;
    onParked?: (required: { pid: number }) => void;
    fetch?: typeof fetch;
  } = {},
): RunDaemonClient {
  // The global `fetch` read per call, so a test that swaps it is still honored.
  const send = trackFetch({ fetch: (url: string, init?: RequestInit) => (optional.fetch ?? fetch)(url, init), observability });
  const initialToken = assistantDaemonToken({}, {});
  const previous = optional.previousDaemon?.().then((record) => ({ record }), (error: unknown) => ({ error }));
  type Address = { url: string; token: string | undefined; pid?: number };
  const current = (): Address => ({ url: (optional.currentUrl ?? getAgentDaemonUrl)(), token: assistantDaemonToken({}, {}) });
  async function origin(): Promise<Address> {
    const result = await previous;
    if (result && "error" in result) throw result.error;
    const record = result?.record ?? previousAssistantDaemonConnection({}, {});
    if (record && (optional.isAlive ?? isProcessAlive)({ pid: record.pid })) return { url: record.url, token: record.token ?? initialToken, pid: record.pid };
    return current();
  }
  // Retain endpoint AND capability per run; a fallback for one principal must not redirect
  // another run to a replacement scope or pair its old URL with the replacement credential.
  const replayOrigins = new Map<string, Address>();
  const replayKey = ({ runId, principalId }: RunDaemonRequest, _optional = {}) => JSON.stringify([principalId, runId]);
  /** Keep a live owner's URL/capability together, but never reuse a known-dead owner's port.
   * A prior daemon can outlive the API boot, so a new current URL alone is no reason to switch.
   * @complexity O(1) lookup and process probe; no new daemon is started.
   */
  async function replayOrigin(required: RunDaemonRequest, _options = {}): Promise<Address> {
    const key = replayKey(required);
    const address = replayOrigins.get(key);
    if (address && (address.pid === undefined || (optional.isAlive ?? isProcessAlive)({ pid: address.pid }))) return address;
    replayOrigins.delete(key);
    return origin();
  }
  /** A timed-out probe can resolve after watch cleanup. Never let it retain a retired capability.
   * @complexity O(1) time/space per still-live probe; the owning watch releases its map entry. */
  function retainLiveOrigin(
    { run, address, status }: { run: RunDaemonRequest; address: Address; status: number | null },
    { signal }: { signal?: AbortSignal } = {},
  ): void {
    if (status !== 200 || signal?.aborted) return;
    replayOrigins.set(replayKey(run), address);
  }
  async function statusAt(
    { url, token, runId, principalId }: RunDaemonRequest & Address,
    { signal }: { signal?: AbortSignal } = {},
  ): Promise<number | null> {
    try {
      const response = await send(`${url}/api/runs/${encodeURIComponent(runId)}`, {
        headers: daemonHeaders({ principalId, token }), signal: signal ?? AbortSignal.timeout(5_000),
      });
      // The response headers establish the status; a stalled body must not stall recovery.
      // The status is already known; disposing the unused response body is best effort.
      void response.body?.cancel().catch(() => undefined);
      return response.status;
    } catch {
      return null;
    }
  }
  return {
    release(required, _options = {}) { replayOrigins.delete(replayKey(required)); },
    async launch({ run, request }, _options) {
      const principalId = run.principalId;
      if (!principalId) throw new Error("assistant continuation has no principal id");
      await (optional.ensureReady ?? ensureAssistantDaemonReady)({}, {});
      const response = await fetchWithDaemonParkRecovery({ send: () => {
        const address = current();
        return send(`${address.url}/api/runs`, {
          method: "POST", headers: { ...daemonHeaders({ principalId, token: address.token }), "Content-Type": "application/json" },
          body: JSON.stringify({ ...request, runId: run.runId, idempotencyKey: run.runId }), signal: AbortSignal.timeout(10_000),
        });
      } }, optional);
      if (!response.ok) throw new Error(`continuation rejected (${response.status})`);
      await response.body?.cancel();
    },
    async cancel(required, _options) {
      const address = await replayOrigin(required);
      const response = await send(`${address.url}/api/runs/${encodeURIComponent(required.runId)}/cancel`, {
        method: "POST", headers: { ...daemonHeaders({ principalId: required.principalId, token: address.token }), "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "recovery-fence" }), signal: AbortSignal.timeout(5_000),
      });
      await response.body?.cancel();
    },
    openEvents: async (required, { signal } = {}) => {
      const address = await replayOrigin(required);
      return send(`${address.url}/api/runs/${encodeURIComponent(required.runId)}/events`, { headers: daemonHeaders({ principalId: required.principalId, token: address.token }), signal });
    },
    async runStatus(required, requestOptions = {}) {
      try {
        const address = await replayOrigin(required);
        const status = await statusAt({ ...required, ...address }, requestOptions);
        if (status !== null && status !== 404) {
          retainLiveOrigin({ run: required, address, status }, requestOptions);
          return status;
        }
        const replacement = current();
        if (address.url === replacement.url || requestOptions.signal?.aborted) return status;
        // PID existence can mean PID reuse. A prior endpoint that cannot find this id may also
        // be a surviving daemon predating a NEW accepted attempt on the current port. Probe both
        // before declaring death; a live prior response always wins. A registry read error still
        // fails closed because the owning address is then unknown.
        const currentStatus = await statusAt({ ...required, ...replacement }, requestOptions);
        if (currentStatus === 200) retainLiveOrigin({ run: required, address: replacement, status: currentStatus }, requestOptions);
        else replayOrigins.delete(replayKey(required));
        return currentStatus;
      } catch {
        return null;
      }
    },
  };
}
