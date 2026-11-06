import { assistantDaemonToken, previousAssistantDaemonConnection } from "../../lifecycle/assistant-daemon-connection.js";
import { ensureAssistantDaemonReady } from "../../lifecycle/daemon-supervisor.js";
import { fetchWithDaemonParkRecovery } from "../../lifecycle/daemon-demand-fetch.js";
import { createNoopTracker } from "@jini-ai/diagnostics/observability";
import type { Tracker } from "@jini-ai/diagnostics/observability";
/**
 * @file Saves an admin-chat turn when its agent run ends — whether or not a browser is still watching.
 *
 * Purpose (FINDING A, `ADS-memory/reports/2026-09-27-stuck-chat-root-cause.md`):
 * the browser used to be the only thing that ever wrote a finished turn. Close the tab mid-run, lose
 * a headless client, or let a restart kill the run, and the row stayed `running` with no content:
 * the answer the run produced existed only in the daemon's memory, and was gone at its next restart.
 *
 * How:
 * Server acceptance writes the logical assistant message before dispatch. This module follows
 * each daemon attempt and checkpoints its projection, independently of browser lifetime. The
 * original browser-created-stub gap is closed: even a tab lost before receiving a run id has a
 * durable binding. Legacy stub PUTs still start watches during the transition.
 *
 * A dropped/stalled stream is not proof of process death. The previous/current daemon probe,
 * bounded follow/readWithinBound loop and one-second trailing checkpoints remain here as the
 * live/uncertain arms of ONE recover() coordinator. A verified missing or failed attempt advances
 * run_id by CAS and continues the same message. Exhaustion preserves saved output and finalizes
 * once; it never asks an operator to resend. Export apps still must not initiate serving recovery.
 * A detached daemon can survive failed teardown, so parent exit alone remains insufficient proof.
 *
 * Every write goes through `ChatRunLedger.settle`, which only changes a row that still belongs to
 * this run and is not yet terminal. A browser receives the saved projection and cannot
 * terminalize a daemon run through the store (`tenant-scope.ts`). A stale attempt cannot checkpoint or settle after its CAS fence.
 *
 * Why finalization stays in the API: the accepted row, principal and attempt meet here, and a
 * daemon cannot finalize its own death. The daemon saves early session locators and mutation
 * barriers through the same guarded persistence ports; projection recovery remains API-owned.
 */
import { checkpointIntervalMs as scaledCheckpointIntervalMs, checkpointProgress, type ChatMessage } from "@jini-ai/chat/core";
import { randomUUID } from "node:crypto";
import { createDurableRecovery } from "#src/assistant/durable-runs/recover";
import type { DurableRecovery, DurableRun, RecoveryTrigger } from "#src/assistant/durable-runs/ports";
import { verifyAttemptChildDead } from "#src/server/inbound/assistant/attempt-process-identity";
import { agentCarriesOwnMemory } from "#src/assistant/agent-session-preset";
import { isProcessAlive } from "@jini-ai/sidecar";
import type { SupervisorScheduler } from "@jini-ai/sidecar/supervisor";
import { createNodeSupervisorScheduler } from "@jini-ai/sidecar/supervisor/node";

import { RUN_PRINCIPAL_HEADER, type ChatRunLedger, type RunSettlement } from "#src/assistant/index";
import {
  isDaemonRunId,
  readSseFrames,
  runContentFromEvents,
  runEventsForSave,
  translateRunFrame,
  type RunFrameCarry,
} from "#src/contracts/core/assistant-run-events";
import { isTerminalRunStatus, type AgentEvent } from "@jini-ai/chat/core";

import { createNoopObservabilityPort, trackFetch, type AgentRunStatus, type ObservabilityPort } from "#src/platform/observability/index";

import { getAgentDaemonUrl } from "../../lifecycle/agent-daemon-port.js";

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

export interface AssistantRunFinalizerOptions {
  readonly ledger: ChatRunLedger;
  /** Site-owned run resources recheck durable liveness when an attempt observer ends. A failed
   * observer alone is not proof of a terminal run. No lifetime stream is added for this hook. */
  readonly onAttemptEnded?: (required: { runId: string }) => Promise<void>;
  readonly daemon?: RunDaemonClient;
  /** Previous site daemon, used only for adopted watches; new sends always use the current daemon. */
  readonly recoveryDaemon?: RunDaemonClient;
  readonly now?: () => number;
  /** Wait between reconnects when the stream drops but the daemon still has the run. */
  readonly reconnectDelayMs?: number;
  /** Reconnects before resolving uncertainty. Runs with fresh live proof keep watching. */
  readonly maxReconnects?: number;
  /** Hard window without live proof, including stalled event requests/streams. Default 120 s.
   * A final status probe can add at most statusTimeoutMs; HTTP availability alone is not proof. */
  readonly resolutionTimeoutMs?: number;
  /** Bound every status probe, including boot discovery and the final liveness check. Default 5 s. */
  readonly statusTimeoutMs?: number;
  /** Jini's timer port; tests advance recovery deadlines without real sleeps or module mocks. */
  readonly scheduler?: SupervisorScheduler;
  /** Override the size-based interval between in-flight checkpoints; tests pass 0. */
  readonly checkpointIntervalMs?: number;
  // Each checkpoint rewrites the projection. Multi-MB turns at 1 s churn ~100 MB/s
  // (memory cause 3); the shared pure size policy owns the 1/3/10 s cadence.
  /**
   * Records each watched run as one agent run (`RouteDeps.observability`). This is the API-side
   * point that learns every daemon run's terminal outcome, so it is where that signal belongs; the
   * daemon cannot report its own death. Also traces the default daemon client's loopback requests.
   * Default: the no-op port.
   */
  readonly observability?: ObservabilityPort;
  /** Agent-run spans use the facade; the raw port above only decorates the default HTTP client. */
  readonly tracker?: Tracker;
  readonly verifyChildDead?: (required: { pid: number; startedAt: string }, optional: {}) => Promise<boolean>;
  readonly supportsNativeResume?: (required: { agentId: string }, optional: {}) => boolean;
}

export interface AssistantRunFinalizer {
  recover: DurableRecovery["recover"];
  /** Serving boot only: adopt persisted runs and resolve interruptions/uncertainty within a bound. */
  reconcileInterrupted(required?: { now?: number }, optional?: {}): Promise<number>;
  /**
   * Starts watching `message`'s run, if it is an in-flight daemon run not already watched. A no-op for
   * a user turn, a terminal turn, a turn with no run id, or a BYOK/AG-UI run id.
   */
  watch(input: { principalId: string; conversationId: string; message: ChatMessage }, optional?: { daemon?: RunDaemonClient; attemptBase?: AgentEvent[] }): void;
  /** Resolves when every watch started so far has settled or failed to persist. For tests. */
  idle(): Promise<void>;
  /** How many runs are being watched right now. */
  activeCount(): number;
}

function daemonHeaders(principalId: string, token: string | undefined): Record<string, string> {
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
        headers: daemonHeaders(principalId, token), signal: signal ?? AbortSignal.timeout(5_000),
      });
      // The response headers establish the status; a stalled body must not stall recovery.
      void response.body?.cancel().catch(() => undefined);
      return response.status;
    } catch {
      return null;
    }
  }
  return {
    release(required, _options = {}) { replayOrigins.delete(replayKey(required)); },
    async launch({ run, request }, _options) {
      await (optional.ensureReady ?? ensureAssistantDaemonReady)({}, {});
      const response = await fetchWithDaemonParkRecovery({ send: () => {
        const address = current();
        return send(`${address.url}/api/runs`, {
          method: "POST", headers: { ...daemonHeaders(run.principalId!, address.token), "Content-Type": "application/json" },
          body: JSON.stringify({ ...request, runId: run.runId, idempotencyKey: run.runId }), signal: AbortSignal.timeout(10_000),
        });
      } }, optional);
      if (!response.ok) throw new Error(`continuation rejected (${response.status})`);
      await response.body?.cancel();
    },
    async cancel(required, _options) {
      const address = await replayOrigin(required);
      const response = await send(`${address.url}/api/runs/${encodeURIComponent(required.runId)}/cancel`, {
        method: "POST", headers: { ...daemonHeaders(required.principalId, address.token), "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "recovery-fence" }), signal: AbortSignal.timeout(5_000),
      });
      await response.body?.cancel();
    },
    openEvents: async (required, { signal } = {}) => {
      const address = await replayOrigin(required);
      return send(`${address.url}/api/runs/${encodeURIComponent(required.runId)}/events`, { headers: daemonHeaders(required.principalId, address.token), signal });
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

type CheckpointState = NonNullable<Parameters<ChatRunLedger["checkpoint"]>[1]>["previous"];

/** One run being watched: the events received on the current connection, and whether it failed. */
interface Watch {
  /** Last exact persisted projection. Owned by this watch; no ledger cache/release lifecycle. */
  checkpointState?: CheckpointState;
  readonly daemon: RunDaemonClient;
  readonly abortStream: AbortController;
  resolutionDeadline: number;
  readonly principalId: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly runId: string;
  readonly attemptBase: AgentEvent[];
  events: AgentEvent[];
  /** Keep the last complete checkpoint while a reconnect is still replaying an earlier prefix. */
  retainedEvents: AgentEvent[];
  /** Split-echo-line memory for the current connection; reset with `events` on every replay. */
  frameCarry?: RunFrameCarry;
  failed: boolean;
  /** Saved payload size and start time of the latest checkpoint attempt (writes are best
   *  effort). The saved size picks the interval before the next one. */
  checkpointedAt: number;
  checkpointedBytes: number;
  /** Meaningful saved progress: status chatter and replayed tool identities do not qualify. */
  checkpointedTextCharacters: number;
  checkpointedExtensionEvents: number;
  checkpointedTools: Set<string>;
  /** Only one best-effort progress write at a time; later frames are coalesced into the next one. */
  checkpointPending: boolean;
  /** Failed writes cannot be retried by new frames before the backed-off deadline. */
  checkpointRetryAt?: number;
  /** Stops progress scheduling as soon as the terminal outcome is known, before its durable write. */
  terminal: boolean;
  /** The trailing checkpoint armed when the interval skipped one (see `checkpoint`). */
  trailing?: ReturnType<typeof setTimeout>;
}

function recoverySettings({ options }: { options: AssistantRunFinalizerOptions }, _optional = {}) {
  return { reconnectDelayMs: options.reconnectDelayMs ?? 2_000, maxReconnects: Math.max(0, options.maxReconnects ?? 30),
    resolutionTimeoutMs: options.resolutionTimeoutMs ?? 120_000, statusTimeoutMs: options.statusTimeoutMs ?? 5_000 };
}

/**
 * String characters in a JSON-shaped value: a cheap lower bound of its serialized size, measured
 * without serializing it (the point is to avoid another multi-MB string per checkpoint).
 * @complexity O(nodes) time, O(depth) stack.
 */
function approximateJsonBytes(value: unknown): number {
  if (typeof value === "string") return value.length;
  if (value === null || typeof value !== "object") return 1;
  let total = 0;
  for (const item of Array.isArray(value) ? value : Object.values(value)) total += approximateJsonBytes(item);
  return total;
}

/** Preserve injected host/test overrides while the shared pure policy owns the default cadence.
 * @complexity O(1) time and space. */
function checkpointDelay({ bytes, options }: { bytes: number; options: AssistantRunFinalizerOptions }, _options = {}): number {
  return options.checkpointIntervalMs ?? scaledCheckpointIntervalMs({ bytes });
}

/** Compare live progress with a successful or attempted checkpoint, including replayed tool ids.
 * @returns Whether unsaved meaningful progress needs a write or trailing timer; no side effects.
 * @complexity O(tool identities) time and space for the comparison. */
function checkpointGrew(
  { previous, progress }: { previous: ReturnType<typeof checkpointProgress>; progress: ReturnType<typeof checkpointProgress> },
  _options = {},
): boolean {
  return progress.textCharacters > previous.textCharacters ||
    progress.extensionEvents > previous.extensionEvents ||
    [...progress.tools].some((key) => !previous.tools.has(key));
}

/** Compare with the last successful save, so replay prefixes and unchanged rows need no retry.
 * @complexity O(tool identities) comparison; does not serialize or mutate progress. */
function hasUnsavedCheckpointGrowth({ watch, progress }: { watch: Watch; progress: ReturnType<typeof checkpointProgress> }, _options = {}): boolean {
  return checkpointGrew({ progress, previous: {
    textCharacters: watch.checkpointedTextCharacters,
    extensionEvents: watch.checkpointedExtensionEvents,
    tools: watch.checkpointedTools,
  } });
}

function clearTrailing({ watch }: { watch: Watch }, _options = {}): void {
  clearTimeout(watch.trailing);
  watch.trailing = undefined;
}

/** Close progress scheduling before aborting I/O or awaiting storage. A late checkpoint completion
 * must not resurrect a watch that settled, was canceled, or failed to persist.
 * @complexity O(1) time and space; idempotent timer cancellation and stream abort. */
function stopWatch({ watch }: { watch: Watch }, _options = {}): void {
  watch.terminal = true;
  clearTrailing({ watch });
  watch.abortStream.abort();
}

function watchable({ message }: { message: ChatMessage }, _optional = {}): boolean {
  if (message.role !== "assistant" || !message.runId || !isDaemonRunId(message.runId)) return false;
  return message.runStatus !== undefined && !isTerminalRunStatus({ status: message.runStatus });
}

type StreamResult = { kind: "ended"; status: RunSettlement["status"] } | { kind: "gone" } | { kind: "dropped" } | { kind: "unresolved" };

/**
 * @complexity O(frame bytes + serialized checkpoint bytes) per run; O(collected events) space,
 *   with one open daemon connection and at most one pending checkpoint per in-flight run.
 */
export function createAssistantRunFinalizer(options: AssistantRunFinalizerOptions, _optional = {}): AssistantRunFinalizer {
  const observability = options.observability ?? createNoopObservabilityPort({});
  const tracker = options.tracker ?? createNoopTracker({});
  const daemon = options.daemon ?? createHttpRunDaemonClient({ observability });
  const now = options.now ?? Date.now;
  const { reconnectDelayMs, maxReconnects, resolutionTimeoutMs, statusTimeoutMs } = recoverySettings({ options });
  const scheduler = options.scheduler ?? createNodeSupervisorScheduler({});
  const active = new Map<string, { watch: Watch; done: Promise<void> }>();
  const recoveryStore = options.ledger.durable;
  const newAttempts = new Set<string>();
  const recovery = recoveryStore ? createDurableRecovery({
    store: recoveryStore, now, mintRunId: randomUUID,
    async probe(run, _options) {
      const status = await probe({ runId: run.runId, principalId: run.principalId! }, { client: newAttempts.has(run.runId) ? daemon : options.recoveryDaemon ?? daemon });
      if (status === 404) return "dead";
      return status === 200 ? "live" : "uncertain";
    },
    attach(run, _options) { finalizer.watch({ principalId: run.principalId!, conversationId: run.conversationId, message: run.message }, {
      attemptBase: [...run.attemptBase], daemon: newAttempts.has(run.runId) ? daemon : options.recoveryDaemon ?? daemon,
    }); },
    async launch(required, optional) {
      if (!daemon.launch) throw new Error("daemon continuation port is unavailable");
      newAttempts.add(required.run.runId);
      await daemon.launch(required, optional);
    },
    cancelAttempt: async (run, optional) => (newAttempts.has(run.runId) ? daemon : options.recoveryDaemon ?? daemon).cancel?.({ runId: run.runId, principalId: run.principalId! }, optional),
    // No process identity is guessed from daemon PID existence. Until the executor provides a
    // verified child identity, reconstruction is the safe universal continuation path.
    verifyChildDead: options.verifyChildDead ?? ((required, _options) => verifyAttemptChildDead(required, {})),
    supportsNativeResume: options.supportsNativeResume ?? (({ agentId }, _options) => agentCarriesOwnMemory({ agentId: agentId }, {})),
    checkpoint: (required, _options) => options.ledger.checkpoint(required),
    settle: (required, _options) => options.ledger.settle(required),
  }, {}) : undefined;

  async function withinDeadline<T>(
    { work, timeoutMs }: { work: Promise<T>; timeoutMs: number },
    { fallback }: { fallback: T },
  ): Promise<T> {
    let cancel!: () => void;
    const timeout = new Promise<T>((resolve) => {
      cancel = scheduler.schedule({ delayMs: Math.max(0, timeoutMs), run: () => resolve(fallback) });
    });
    try { return await Promise.race([work, timeout]); }
    finally { cancel(); }
  }

  async function probe(
    required: RunDaemonRequest,
    { client }: { client: RunDaemonClient },
  ): Promise<number | null> {
    const abort = new AbortController();
    try {
      return await withinDeadline({
        work: client.runStatus(required, { signal: abort.signal }).catch(() => null), timeoutMs: statusTimeoutMs,
      }, { fallback: null });
    } finally { abort.abort(); }
  }

  const delay = (required: { ms: number }, _optional = {}) => new Promise<void>((resolve) => {
    scheduler.schedule({ delayMs: required.ms, run: resolve });
  });

  /** Stop progress scheduling and await the ledger's atomic terminal write; persistence errors propagate. */
  async function settle(watch: Watch, status: RunSettlement["status"], events: AgentEvent[]): Promise<void> {
    stopWatch({ watch });
    await options.ledger.settle({
      conversationId: watch.conversationId,
      messageId: watch.messageId,
      runId: watch.runId,
      status,
      content: runContentFromEvents(events),
      events: runEventsForSave(events),
      endedAt: now(),
    });
  }

  async function recoverWatch(watch: Watch, trigger: RecoveryTrigger): Promise<void> {
    const events = interruptionEvents(watch);
    stopWatch({ watch });
    await options.ledger.checkpoint({ ...watch, content: runContentFromEvents(events), events: runEventsForSave(events) });
    if (!recovery) {
      // Only a fresh status 404 selects "stream". Reconnect/deadline exhaustion is uncertain;
      // without durable recovery's budget and session quarantine, retain this run's saved row.
      if (trigger !== "stream") return;
      await settle(watch, "canceled", [...events, { kind: "status", label: "Stopped. Saved work is above." }]);
      return;
    }
    // A launch can still be committing after durable acceptance. Space repeated missing-run
    // probes so its short grace window cannot turn into a hot loop of adopted watches.
    await delay({ ms: reconnectDelayMs });
    await recovery.recover({ messageId: watch.messageId, expectedRunId: watch.runId, trigger }, {});
  }

  function interruptionEvents(watch: Watch): AgentEvent[] {
    // Storage coalesces text deltas. Equal event counts can still mean a shorter replay prefix,
    // so both text length and event count must catch up before replacing the retained checkpoint.
    return watch.events.length >= watch.retainedEvents.length &&
      runContentFromEvents(watch.events).length >= runContentFromEvents(watch.retainedEvents).length
      ? watch.events : watch.retainedEvents;
  }

  /** One cancelable timer owns skipped frames and failed-write retries. Its callback reuses the
   * terminal, pending-write and unsaved-growth guards, including callbacks queued before cleanup.
   * @complexity O(1) time and space; replaces at most one timer per watch. */
  function scheduleCheckpoint({ watch, delayMs }: { watch: Watch; delayMs: number }, _options = {}): void {
    clearTrailing({ watch });
    watch.trailing = setTimeout(() => {
      watch.trailing = undefined;
      void checkpoint(watch);
    }, delayMs);
    watch.trailing.unref();
  }

  /** Failed storage writes retry during quiet tool/approval waits, at most once per interval and
   * never faster than once per second. False (fenced/unchanged) results do not retry.
   * @complexity O(events + tool identities) growth comparison; one timer per watch. */
  function retryCheckpoint({ watch, interval }: { watch: Watch; interval: number }, _options = {}): void {
    if (watch.terminal || !hasUnsavedCheckpointGrowth({ watch, progress: checkpointProgress({ events: watch.events }) })) return;
    const delayMs = Math.max(interval, 1_000);
    watch.checkpointRetryAt = now() + delayMs;
    scheduleCheckpoint({ watch, delayMs });
  }

  /**
   * Saves what the run has produced so far, when it has grown since the last save and the interval
   * has passed. Only growth counts: a reconnect replays from event 0, and a checkpoint of the
   * replay's first events would shrink the saved answer.
   *
   * A save the interval skips is not dropped: a trailing checkpoint is armed for the end of the
   * interval. Without it, a run that goes quiet (a long tool call) right after a skipped frame kept
   * its last text and tool-call start in memory only, lost on any stop — the process `exit` flush
   * that used to cover a graceful stop is gone (an `exit` listener cannot await an async write).
   * At most one checkpoint is pending per run. It never blocks frame consumption: otherwise a
   * slow progress write holds an already-buffered `end` behind it, leaving a finished turn running
   * for startup repair to misclassify. Later progress is coalesced when the pending write finishes.
   * Terminal settlement uses the ledger's terminal guard to reject any late checkpoint.
   * The last saved payload selects the shared size-based interval (or an injected host override):
   * a merge fallback still rewrites the projection, so large turns need fewer checkpoints.
   * @complexity O(saved events) per write, with one pending write and one trailing timer per run.
   */
  async function checkpoint(watch: Watch): Promise<void> {
    if (watch.terminal || watch.checkpointPending) return;
    const interval = checkpointDelay({ bytes: watch.checkpointedBytes, options });
    const wait = Math.max(watch.checkpointedAt + interval, watch.checkpointRetryAt ?? Number.NEGATIVE_INFINITY) - now();
    // An armed timer will consume the latest frames; avoid rescanning them on every delta.
    if (wait > 0 && watch.trailing) return;
    const progress = checkpointProgress({ events: watch.events });
    // Completion rechecks for coalesced frames. Do not arm a timer for an unchanged projection:
    // only unsaved growth should start the trailing deadline that protects a quiet run.
    if (!hasUnsavedCheckpointGrowth({ watch, progress })) return;
    if (wait > 0) {
      scheduleCheckpoint({ watch, delayMs: wait });
      return;
    }
    const content = runContentFromEvents(watch.events);
    const events = runEventsForSave(watch.events);
    clearTrailing({ watch });
    watch.checkpointedAt = now();
    watch.checkpointRetryAt = undefined;
    watch.checkpointPending = true;
    // Best effort: a failed checkpoint only loses what a restart would keep; the stream goes on.
    await options.ledger
      .checkpoint({
        conversationId: watch.conversationId,
        messageId: watch.messageId,
        runId: watch.runId,
        content,
        events,
      }, {
        expected: watch.checkpointState?.length,
        previous: watch.checkpointState,
        onPersisted: (state) => { watch.checkpointState = state; },
      })
      .then((written) => {
        if (!written) return;
        watch.checkpointedTextCharacters = progress.textCharacters;
        watch.checkpointedExtensionEvents = progress.extensionEvents;
        for (const key of progress.tools) watch.checkpointedTools.add(key);
        watch.checkpointedBytes = approximateJsonBytes(events);
      })
      .catch((error: unknown) => {
        console.error(`[assistant-run-finalizer] checkpoint of run ${watch.runId} failed`, error);
        retryCheckpoint({ watch, interval });
      })
      .finally(() => {
        watch.checkpointPending = false;
        // A false result (including a fenced row) or failure leaves the saved baseline behind.
        // Retrying that same attempt here spins at interval 0, or rearms forever at other intervals.
        // Only newer coalesced progress schedules from completion. Rejections alone also arm the
        // backed-off retry above, so quiet runs are protected without resurrecting the spin.
        if (!watch.terminal && checkpointGrew({ previous: progress, progress: checkpointProgress({ events: watch.events }) })) {
          void checkpoint(watch);
        }
      });
  }

  /** Reads one connection to the end. The daemon replays from event 0 on every connection, so the
   *  events collected by an earlier, dropped connection are discarded rather than doubled. */
  async function readStream(watch: Watch): Promise<StreamResult> {
    const signal = watch.abortStream.signal;
    const response = await watch.daemon.openEvents({ runId: watch.runId, principalId: watch.principalId }, { signal });
    if (signal.aborted) {
      void response.body?.cancel().catch(() => undefined);
      return { kind: "dropped" };
    }
    if (response.status === 404) return { kind: "gone" };
    if (!response.ok || !response.body) return { kind: "dropped" };
    watch.retainedEvents = [...interruptionEvents(watch)];
    watch.events = [...watch.attemptBase];
    watch.frameCarry = {};
    watch.failed = false;
    // Cancel the reader as well as HTTP when a bounded resolution settles the row. Fakes may
    // ignore the request signal; late frames must not change a settled watch's checkpoint.
    for await (const frame of readSseFrames(response.body.pipeThrough(new TransformStream(), { signal }))) {
      if (signal.aborted) return { kind: "dropped" };
      const result = applyStreamFrame(watch, frame);
      if (result) return result;
    }
    return { kind: "dropped" };
  }

  function applyStreamFrame(watch: Watch, frame: { event: string; data: string }): StreamResult | undefined {
    const outcome = translateRunFrame(frame.event, frame.data, watch.frameCarry);
    watch.events.push(...outcome.events);
    if (outcome.error) watch.failed = true;
    if (outcome.terminal) {
      watch.terminal = true;
      return { kind: "ended", status: watch.failed && outcome.terminal === "succeeded" ? "failed" : outcome.terminal };
    }
    void checkpoint(watch);
    return undefined;
  }

  async function retainLiveWatch(watch: Watch): Promise<boolean> {
    if (!recovery) return true;
    // follow/readWithinBound are recovery's live arm. Reuse their fresh proof for this attempt
    // so reconnects and quiet approval waits neither probe twice nor spend the recovery budget.
    const result = await recovery.recover({ messageId: watch.messageId, expectedRunId: watch.runId, trigger: "timeout" }, { liveRunId: watch.runId });
    return result === "reattached" || result === "waiting";
  }

  /** A quiet stream (or a request stuck before headers) still needs bounded resolution. Keep the
   * same stream when the owning daemon answers live, so long tool/card waits are not interrupted. */
  async function readWithinBound(watch: Watch): Promise<StreamResult> {
    const stream = readStream(watch).catch((): StreamResult => ({ kind: "dropped" }));
    for (;;) {
      const result = await withinDeadline<StreamResult | { kind: "timeout" }>({
        work: stream, timeoutMs: watch.resolutionDeadline - now(),
      }, { fallback: { kind: "timeout" } });
      if (result.kind !== "timeout") return result;
      const status = await probe({ runId: watch.runId, principalId: watch.principalId }, { client: watch.daemon });
      // An end frame arriving during the final probe outranks an inconclusive HTTP response.
      if (watch.terminal) return stream;
      if (status !== 200) {
        // The deadline policy resolves uncertainty too; transport/auth errors cannot leave the
        // transcript spinning forever. The final fresh probe always gives a live daemon priority.
        return { kind: "unresolved" };
      }
      if (!await retainLiveWatch(watch)) { stopWatch({ watch }); return { kind: "unresolved" }; }
      watch.resolutionDeadline = now() + resolutionTimeoutMs;
    }
  }

  /** Renews a freshly verified live watch; uncertainty keeps the current reconnect budget.
   * A live run may outlast that budget, so restart counting rather than abandon its saved row.
   * Returns the next counter, or undefined after recovery relinquishes this watch and its stream.
   * @complexity O(1) bookkeeping plus one existing durable-recovery call for a live run. */
  async function prepareReconnect({ watch, status, attempt }: { watch: Watch; status: number | null; attempt: number }, _options: Record<string, never> = {}): Promise<number | undefined> {
    if (status !== 200) return attempt;
    if (!await retainLiveWatch(watch)) {
      stopWatch({ watch });
      return undefined;
    }
    watch.resolutionDeadline = now() + resolutionTimeoutMs;
    if (attempt === maxReconnects) {
      // Keep monitoring a live run even after exhausting reconnects: its later death must
      // not strand the row until another browser attachment or serving boot.
      return -1;
    }
    return attempt;
  }

  /** Follows the run to a terminal outcome or bounded resolution and reports it to the tracker. */
  async function follow(watch: Watch): Promise<AgentRunStatus> {
    let attempt = 0;
    while (true) {
      const result = await readWithinBound(watch);
      const resolved = await resolveStreamOutcome(watch, result);
      if (resolved) return resolved;
      // A dropped stream alone proves nothing: a daemon may be mid-respawn or waiting on a card.
      // Recheck its owning endpoint before either retrying or applying the bounded fallback. Even
      // an events 404 must not override a fresh live answer from the daemon that holds the slot.
      const status = await probe({ runId: watch.runId, principalId: watch.principalId }, { client: watch.daemon });
      if (shouldRecover({ status, result, attempt, watch })) {
        await recoverWatch(watch, status === 404 ? "stream" : "timeout");
        return "interrupted";
      }
      const nextAttempt = await prepareReconnect({ watch, status, attempt });
      if (nextAttempt === undefined) return "interrupted";
      attempt = nextAttempt + 1;
      await delay({ ms: Math.min(reconnectDelayMs, Math.max(0, watch.resolutionDeadline - now())) });
    }
  }

  function shouldRecover({ status, result, attempt, watch }: { status: number | null; result: StreamResult; attempt: number; watch: Watch }, _options = {}): boolean {
    if (status === 404) return true;
    if (status === 200) return false;
    return result.kind === "gone" || attempt === maxReconnects || now() >= watch.resolutionDeadline;
  }

  async function resolveStreamOutcome(watch: Watch, result: StreamResult): Promise<AgentRunStatus | undefined> {
    if (result.kind === "ended") {
      if (result.status === "failed" && recovery) await recoverWatch(watch, "attempt-failed");
      else await settle(watch, result.status, interruptionEvents(watch));
      return result.status;
    }
    if (result.kind === "unresolved") { await recoverWatch(watch, "timeout"); return "interrupted"; }
    return undefined;
  }

  const finalizer: AssistantRunFinalizer = {
    recover: async (required, optional) => recovery ? recovery.recover(required, optional) : "gone",
    reconcileInterrupted(required = {}, _optional = {}) {
      return options.ledger.reconcileInterrupted({ now: required.now ?? now() }, {
        recover: async ({ message }) => {
          if (!message.runId) return false;
          if (recovery) {
            const result = await recovery.recover({ messageId: message.id, trigger: "boot" }, {});
            return result !== "gone";
          }
          return false;
        },
      });
    },
    watch({ principalId, conversationId, message }, optional = {}) {
      const runId = message.runId;
      if (!watchable({ message }) || !runId) return;
      if (active.has(runId) && !active.get(runId)!.watch.terminal) return;

      const watch = makeWatch({ principalId, conversationId, message, runId,
        daemon: optional.daemon ?? daemon, attemptBase: optional.attemptBase ?? [], now: now(), resolutionTimeoutMs,
      });
      startWatch(watch);
    },

    async idle() {
      while (active.size > 0) await Promise.all([...active.values()].map((entry) => entry.done));
    },

    activeCount: () => active.size,
  };

  function makeWatch({ principalId, conversationId, message, runId, daemon, attemptBase, now, resolutionTimeoutMs }: {
    principalId: string; conversationId: string; message: ChatMessage; runId: string; daemon: RunDaemonClient; attemptBase: AgentEvent[]; now: number; resolutionTimeoutMs: number;
  }, _options = {}): Watch {
    const progress = checkpointProgress({ events: message.events ?? [] });
    return {
        daemon,
        abortStream: new AbortController(),
        resolutionDeadline: now + resolutionTimeoutMs,
        principalId,
        conversationId,
        messageId: message.id,
        runId,
        attemptBase,
        events: [...(message.events ?? [])],
        retainedEvents: [...(message.events ?? [])],
        failed: false,
        checkpointedAt: Number.NEGATIVE_INFINITY,
        checkpointedBytes: approximateJsonBytes(message.events ?? []),
        checkpointedTextCharacters: progress.textCharacters,
        checkpointedExtensionEvents: progress.extensionEvents,
        checkpointedTools: progress.tools,
        checkpointPending: false,
        terminal: false,
    };
  }

  function startWatch(watch: Watch) {
      const { runId, conversationId } = watch;
      // Inside the run's scope, so the ledger writes the loop makes are recorded under the run.
      const done = tracker.trace({ name: "assistant.run", run: async (span) => {
        try { span.setOutcome({ status: await follow(watch) }); }
        catch (error) {
          // A watch that threw proved nothing about the run itself; the error says why it stopped.
          span.setOutcome({ status: "abandoned", error });
          console.error(`[assistant-run-finalizer] watching run ${runId} failed`, error);
        }
      } }, { agent: { runId, conversationId } })
        .finally(async () => {
          stopWatch({ watch });
          newAttempts.delete(runId);
          try {
            // Preserve a successor's pin on the same client, but release an old client's
            // credentials when a replacement watch uses a different daemon client.
            const successor = active.get(runId)?.watch;
            if (successor === watch || successor?.daemon !== watch.daemon) watch.daemon.release?.({ runId, principalId: watch.principalId }, {});
            await options.onAttemptEnded?.({ runId });
          }
          catch { console.warn("[assistant-run-finalizer] attempt resource cleanup unavailable"); }
          finally { if (active.get(runId)?.watch === watch) active.delete(runId); }
        });
      active.set(runId, { watch, done });
  }
  return finalizer;
}

// Chat routes and the daemon proxy meet on the same ledger instance. Sharing this coordinator
// avoids a browser-triggered recovery creating an independent boot/finalization engine.
type SharedFinalizer = {
  readonly finalizer: AssistantRunFinalizer;
  readonly options: Omit<AssistantRunFinalizerOptions, "recoveryDaemon" | "onAttemptEnded"> & {
    recoveryDaemon?: RunDaemonClient; onAttemptEnded?: AssistantRunFinalizerOptions["onAttemptEnded"];
  };
};
const sharedFinalizers = new WeakMap<ChatRunLedger, SharedFinalizer>();
export function assistantRunFinalizerFor(required: AssistantRunFinalizerOptions, _optional = {}): AssistantRunFinalizer {
  const existing = sharedFinalizers.get(required.ledger);
  if (existing) {
    // An export app can construct the route module before serving composition opts into boot
    // recovery. Install its prior-daemon port on the same coordinator rather than freezing the
    // earlier export defaults or creating a second recovery engine.
    if (required.recoveryDaemon) existing.options.recoveryDaemon = required.recoveryDaemon;
    if (required.onAttemptEnded) existing.options.onAttemptEnded = required.onAttemptEnded;
    return existing.finalizer;
  }
  const options = { ...required };
  const finalizer = createAssistantRunFinalizer(options, {});
  sharedFinalizers.set(required.ledger, { finalizer, options });
  return finalizer;
}
