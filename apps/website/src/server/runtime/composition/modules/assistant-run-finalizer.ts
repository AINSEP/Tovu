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
import type { ChatMessage } from "@jini-ai/chat/core";
import { randomUUID } from "node:crypto";
import { createDurableRecovery } from "#src/assistant/durable-runs/recover";
import type { DurableRecovery, DurableRun, RecoveryTrigger } from "#src/assistant/durable-runs/ports";
import { verifyAttemptChildDead } from "#src/server/inbound/assistant/attempt-process-identity";
import { agentCarriesOwnMemory } from "#src/server/inbound/assistant/agent-session-resume";
import { isProcessAlive } from "@jini-ai/sidecar";
import type { SupervisorScheduler } from "@jini-ai/sidecar/supervisor";
import { createNodeSupervisorScheduler } from "@jini-ai/sidecar/supervisor/node";

import { AGENT_DAEMON_TOKEN_ENV_VAR, RUN_PRINCIPAL_HEADER, type ChatRunLedger, type RunSettlement } from "#src/assistant/index";
import {
  isDaemonRunId,
  readSseFrames,
  runContentFromEvents,
  runEventsForSave,
  translateRunFrame,
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
}

export interface AssistantRunFinalizerOptions {
  readonly ledger: ChatRunLedger;
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
  /** Least time between two in-flight checkpoints of one run. Default 1000 ms; tests pass 0. */
  readonly checkpointIntervalMs?: number;
  /**
   * Records each watched run as one agent run (`RouteDeps.observability`). This is the API-side
   * point that learns every daemon run's terminal outcome, so it is where that signal belongs; the
   * daemon cannot report its own death. Also traces the default daemon client's loopback requests.
   * Default: the no-op port.
   */
  readonly observability?: ObservabilityPort;
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

function daemonHeaders(principalId: string): Record<string, string> {
  const headers: Record<string, string> = { [RUN_PRINCIPAL_HEADER]: principalId, Accept: "text/event-stream" };
  const token = process.env[AGENT_DAEMON_TOKEN_ENV_VAR];
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** The real daemon, over loopback HTTP — the same URL, token and principal header the proxy uses.
 *  Each request is one outbound span through `observability` (host/port and status, never the run id
 *  or token); the events request's span ends at the response headers, not with the stream. */
export function createHttpRunDaemonClient(
  { observability }: { observability: ObservabilityPort },
  optional: {
    /** Serving boot snapshots the prior site's registry before the replacement daemon publishes.
     * A 404 from a new port says nothing about a run still executing on the previous port. */
    previousDaemon?: () => Promise<{ url: string; pid: number } | null>;
    isAlive?: (required: { pid: number }) => boolean;
    currentUrl?: () => string;
    fetch?: typeof fetch;
  } = {},
): RunDaemonClient {
  // The global `fetch` read per call, so a test that swaps it is still honored.
  const send = trackFetch({ fetch: (url: string, init?: RequestInit) => (optional.fetch ?? fetch)(url, init), observability });
  const previous = optional.previousDaemon?.().then((record) => ({ record }), (error: unknown) => ({ error }));
  async function origin(): Promise<string> {
    const result = await previous;
    if (result && "error" in result) throw result.error;
    const record = result?.record;
    if (record && (optional.isAlive ?? isProcessAlive)({ pid: record.pid })) return record.url;
    return (optional.currentUrl ?? getAgentDaemonUrl)();
  }
  // Recovery may probe several runs concurrently. A fallback for one owner's run must never
  // redirect another run's stream to a replacement that does not hold its slot.
  const replayOrigins = new Map<string, string>();
  const replayKey = ({ runId, principalId }: RunDaemonRequest, _optional = {}) => JSON.stringify([principalId, runId]);
  async function statusAt(
    { url, runId, principalId }: RunDaemonRequest & { url: string },
    { signal }: { signal?: AbortSignal } = {},
  ): Promise<number | null> {
    try {
      const response = await send(`${url}/api/runs/${encodeURIComponent(runId)}`, {
        headers: daemonHeaders(principalId), signal: signal ?? AbortSignal.timeout(5_000),
      });
      // The response headers establish the status; a stalled body must not stall recovery.
      void response.body?.cancel().catch(() => undefined);
      return response.status;
    } catch {
      return null;
    }
  }
  return {
    async launch({ run, request }, _options) {
      const response = await send(`${(optional.currentUrl ?? getAgentDaemonUrl)()}/api/runs`, {
        method: "POST", headers: { ...daemonHeaders(run.principalId!), "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, runId: run.runId, idempotencyKey: run.runId }), signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`continuation rejected (${response.status})`);
      await response.body?.cancel();
    },
    async cancel(required, _options) {
      const url = replayOrigins.get(replayKey(required, {})) ?? await origin();
      const response = await send(`${url}/api/runs/${encodeURIComponent(required.runId)}/cancel`, {
        method: "POST", headers: { ...daemonHeaders(required.principalId), "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "recovery-fence" }), signal: AbortSignal.timeout(5_000),
      });
      await response.body?.cancel();
    },
    openEvents: async (required, { signal } = {}) =>
      send(`${replayOrigins.get(replayKey(required, {})) ?? await origin()}/api/runs/${encodeURIComponent(required.runId)}/events`, { headers: daemonHeaders(required.principalId), signal }),
    async runStatus(required, requestOptions = {}) {
      try {
        const url = await origin();
        const status = await statusAt({ ...required, url }, requestOptions);
        if (status !== null && status !== 404) {
          replayOrigins.delete(replayKey(required, {}));
          return status;
        }
        const current = (optional.currentUrl ?? getAgentDaemonUrl)();
        if (url === current || requestOptions.signal?.aborted) return status;
        // PID existence can mean PID reuse. A prior endpoint that cannot find this id may also
        // be a surviving daemon predating a NEW accepted attempt on the current port. Probe both
        // before declaring death; a live prior response always wins. A registry read error still
        // fails closed because the owning address is then unknown.
        const currentStatus = await statusAt({ ...required, url: current }, requestOptions);
        if (currentStatus === 200) replayOrigins.set(replayKey(required, {}), current);
        else replayOrigins.delete(replayKey(required, {}));
        return currentStatus;
      } catch {
        return null;
      }
    },
  };
}

/** One run being watched: the events received on the current connection, and whether it failed. */
interface Watch {
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
  failed: boolean;
  /** Event count and start time of the latest checkpoint attempt (writes are best effort). */
  checkpointedEvents: number;
  checkpointedAt: number;
  /** Only one best-effort progress write at a time; later frames are coalesced into the next one. */
  checkpointPending: boolean;
  /** Stops progress scheduling as soon as the terminal outcome is known, before its durable write. */
  terminal: boolean;
  /** The trailing checkpoint armed when the interval skipped one (see `checkpoint`). */
  trailing?: ReturnType<typeof setTimeout>;
}

function recoverySettings({ options }: { options: AssistantRunFinalizerOptions }, _optional = {}) {
  return { reconnectDelayMs: options.reconnectDelayMs ?? 2_000, maxReconnects: Math.max(0, options.maxReconnects ?? 30),
    resolutionTimeoutMs: options.resolutionTimeoutMs ?? 120_000, statusTimeoutMs: options.statusTimeoutMs ?? 5_000,
    checkpointIntervalMs: options.checkpointIntervalMs ?? 1_000 };
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
  const daemon = options.daemon ?? createHttpRunDaemonClient({ observability });
  const now = options.now ?? Date.now;
  const { reconnectDelayMs, maxReconnects, resolutionTimeoutMs, statusTimeoutMs, checkpointIntervalMs } = recoverySettings({ options }, {});
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
    supportsNativeResume: options.supportsNativeResume ?? (({ agentId }, _options) => agentCarriesOwnMemory(agentId)),
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
    watch.terminal = true;
    watch.abortStream.abort();
    clearTimeout(watch.trailing);
    watch.trailing = undefined;
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
    await options.ledger.checkpoint({ ...watch, content: runContentFromEvents(events), events: runEventsForSave(events) });
    watch.terminal = true;
    watch.abortStream.abort();
    clearTimeout(watch.trailing);
    if (!recovery) {
      // Only a fresh status 404 selects "stream". Reconnect/deadline exhaustion is uncertain;
      // without durable recovery's budget and session quarantine, retain this run's saved row.
      if (trigger !== "stream") return;
      await settle(watch, "canceled", [...events, { kind: "status", label: "Stopped. Saved work is above." }]);
      return;
    }
    // A launch can still be committing after durable acceptance. Space repeated missing-run
    // probes so its short grace window cannot turn into a hot loop of adopted watches.
    await delay({ ms: reconnectDelayMs }, {});
    await recovery.recover({ messageId: watch.messageId, expectedRunId: watch.runId, trigger }, {});
  }

  function interruptionEvents(watch: Watch): AgentEvent[] {
    // Storage coalesces text deltas. Equal event counts can still mean a shorter replay prefix,
    // so both text length and event count must catch up before replacing the retained checkpoint.
    return watch.events.length >= watch.retainedEvents.length &&
      runContentFromEvents(watch.events).length >= runContentFromEvents(watch.retainedEvents).length
      ? watch.events : watch.retainedEvents;
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
   * @complexity O(saved events) per write, with one pending write and one trailing timer per run.
   */
  async function checkpoint(watch: Watch): Promise<void> {
    if (watch.terminal || watch.checkpointPending) return;
    if (watch.events.length <= watch.checkpointedEvents) return;
    const wait = checkpointIntervalMs - (now() - watch.checkpointedAt);
    if (wait > 0) {
      if (!watch.trailing) {
        watch.trailing = setTimeout(() => {
          watch.trailing = undefined;
          void checkpoint(watch);
        }, wait);
        watch.trailing.unref();
      }
      return;
    }
    clearTimeout(watch.trailing);
    watch.trailing = undefined;
    watch.checkpointedEvents = watch.events.length;
    watch.checkpointedAt = now();
    watch.checkpointPending = true;
    // Best effort: a failed checkpoint only loses what a restart would keep; the stream goes on.
    await options.ledger
      .checkpoint({
        conversationId: watch.conversationId,
        messageId: watch.messageId,
        runId: watch.runId,
        content: runContentFromEvents(watch.events),
        events: runEventsForSave(watch.events),
      })
      .catch((error: unknown) => console.error(`[assistant-run-finalizer] checkpoint of run ${watch.runId} failed`, error))
      .finally(() => {
        watch.checkpointPending = false;
        void checkpoint(watch);
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
    const outcome = translateRunFrame(frame.event, frame.data);
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
      if (!await retainLiveWatch(watch)) { watch.terminal = true; watch.abortStream.abort(); return { kind: "unresolved" }; }
      watch.resolutionDeadline = now() + resolutionTimeoutMs;
    }
  }

  /** Follows the run to a terminal outcome or bounded resolution and reports it to the tracker. */
  async function follow(watch: Watch): Promise<AgentRunStatus> {
    for (let attempt = 0; ; attempt += 1) {
      const result = await readWithinBound(watch);
      const resolved = await resolveStreamOutcome(watch, result);
      if (resolved) return resolved;
      // A dropped stream alone proves nothing: a daemon may be mid-respawn or waiting on a card.
      // Recheck its owning endpoint before either retrying or applying the bounded fallback. Even
      // an events 404 must not override a fresh live answer from the daemon that holds the slot.
      const status = await probe({ runId: watch.runId, principalId: watch.principalId }, { client: watch.daemon });
      if (shouldRecover({ status, result, attempt, watch }, {})) {
        await recoverWatch(watch, status === 404 ? "stream" : "timeout");
        return "interrupted";
      }
      if (status === 200) {
        if (!await retainLiveWatch(watch)) { watch.terminal = true; watch.abortStream.abort(); return "interrupted"; }
        watch.resolutionDeadline = now() + resolutionTimeoutMs;
        if (attempt === maxReconnects) {
          // Keep monitoring a live run even after exhausting reconnects: its later death must
          // not strand the row until another browser attachment or serving boot.
          attempt = -1;
        }
      }
      await delay({ ms: Math.min(reconnectDelayMs, Math.max(0, watch.resolutionDeadline - now())) }, {});
    }
  }

  function shouldRecover({ status, result, attempt, watch }: { status: number | null; result: StreamResult; attempt: number; watch: Watch }, _options = {}): boolean {
    return status === 404 || (status !== 200 && (result.kind === "gone" || attempt === maxReconnects || now() >= watch.resolutionDeadline));
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
      if (!watchable({ message }, {}) || !runId) return;
      if (active.has(runId) && !active.get(runId)!.watch.terminal) return;

      const watch = makeWatch({ principalId, conversationId, message, runId,
        daemon: optional.daemon ?? daemon, attemptBase: optional.attemptBase ?? [], now: now(), resolutionTimeoutMs,
      }, {});
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
        checkpointedEvents: message.events?.length ?? 0,
        checkpointedAt: Number.NEGATIVE_INFINITY,
        checkpointPending: false,
        terminal: false,
    };
  }

  function startWatch(watch: Watch) {
      const { runId, conversationId } = watch;
      const tracker = observability.trackAgentRun({ runId }, { conversationId });
      // Inside the run's scope, so the ledger writes the loop makes are recorded under the run.
      const done = tracker
        .run(() => follow(watch))
        .then((status) => tracker.end({ status }))
        .catch((error: unknown) => {
          // A watch that threw proved nothing about the run itself; the error says why it stopped.
          tracker.end({ status: "abandoned", error });
          console.error(`[assistant-run-finalizer] watching run ${runId} failed`, error);
        })
        .finally(() => {
          watch.abortStream.abort();
          clearTimeout(watch.trailing);
          newAttempts.delete(runId);
          if (active.get(runId)?.watch === watch) active.delete(runId);
        });
      active.set(runId, { watch, done });
  }
  return finalizer;
}

// Chat routes and the daemon proxy meet on the same ledger instance. Sharing this coordinator
// avoids a browser-triggered recovery creating an independent boot/finalization engine.
type SharedFinalizer = {
  readonly finalizer: AssistantRunFinalizer;
  readonly options: Omit<AssistantRunFinalizerOptions, "recoveryDaemon"> & { recoveryDaemon?: RunDaemonClient };
};
const sharedFinalizers = new WeakMap<ChatRunLedger, SharedFinalizer>();
export function assistantRunFinalizerFor(required: AssistantRunFinalizerOptions, _optional = {}): AssistantRunFinalizer {
  const existing = sharedFinalizers.get(required.ledger);
  if (existing) {
    // An export app can construct the route module before serving composition opts into boot
    // recovery. Install its prior-daemon port on the same coordinator rather than freezing the
    // earlier export defaults or creating a second recovery engine.
    if (required.recoveryDaemon) existing.options.recoveryDaemon = required.recoveryDaemon;
    return existing.finalizer;
  }
  const options = { ...required };
  const finalizer = createAssistantRunFinalizer(options, {});
  sharedFinalizers.set(required.ledger, { finalizer, options });
  return finalizer;
}
