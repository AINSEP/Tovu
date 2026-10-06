/**
 * @file Saves an admin-chat turn when its agent run ends — whether or not a browser is still watching.
 *
 * Purpose (FINDING A, `ADS-memory/reports/2026-09-27-stuck-chat-root-cause.md`):
 * the browser used to be the only thing that ever wrote a finished turn. Close the tab mid-run, lose
 * a headless client, or let a restart kill the run, and the row stayed `running` with no content:
 * the answer the run produced existed only in the daemon's memory, and was gone at its next restart.
 *
 * How:
 * When the browser saves the in-flight stub of a daemon run (`assistant-chats.ts`'s PUT route — the
 * one moment the server learns which row a run belongs to), this module opens the run's own event
 * stream on the daemon, folds it through the SAME translation the browser uses
 * (`contracts/core/assistant-run-events.ts`), and settles the row when the run ends:
 *
 * - `end` frame: the daemon's own classification (`succeeded`/`failed`/`canceled`) with the full
 *   answer and events.
 * - the daemon answers 404 for the run (it restarted and forgot it): `canceled`, keeping every event
 *   received so far, plus the plain restart notice.
 * - reconnects or the recovery window are exhausted without fresh live proof: `canceled` with the
 *   same notice. Always probe once more before this policy applies; a live answer renews watching.
 * - this API process exits or is killed: no
 *   write can finish then (storage is async, an `exit` listener cannot await), so the finalizer
 *   checkpoints the answer as it streams (`ChatRunLedger.checkpoint`, at most once per
 *   `checkpointIntervalMs`, with a trailing checkpoint so a run that goes quiet still has its last
 *   frames saved within one interval). The next serving boot probes the daemon: surviving runs
 *   are reattached from event zero; forgotten runs and bounded unresolved watches are canceled
 *   with the partial answer kept. A fresh live response prevents cancellation and renews recovery.
 *   A detached daemon can survive failed teardown, so parent exit alone is not evidence of death.
 *
 * Every write goes through `ChatRunLedger.settle`, which only changes a row that still belongs to
 * this run and is not yet terminal. So when a browser IS attached and saves the same turn first, the
 * finalizer's write is a no-op, and a browser save that arrives after the finalizer's is ignored by
 * the store (`tenant-scope.ts`). First terminal write wins; both are translations of the same stream.
 *
 * Why the API and not the daemon: the API already owns every `chat.db` write and is the process the
 * browser's stub reaches, so the row, the principal and the run id meet here without a protocol
 * change. The daemon reads `chat.db` too, but writing from two processes would add a second writer
 * for no gain — and the daemon cannot write "failed" for its own death.
 */
import type { ChatMessage } from "@jini-ai/chat/core";
import { isProcessAlive } from "@jini-ai/sidecar";
import type { SupervisorScheduler } from "@jini-ai/sidecar/supervisor";
import { createNodeSupervisorScheduler } from "@jini-ai/sidecar/supervisor/node";

import { AGENT_DAEMON_TOKEN_ENV_VAR, RUN_PRINCIPAL_HEADER, type ChatRunLedger, type RunSettlement } from "#src/assistant/index";
import {
  isDaemonRunId,
  readSseFrames,
  runContentFromEvents,
  runEventsForSave,
  runInterruptedNotice,
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
}

export interface AssistantRunFinalizer {
  /** Serving boot only: adopt persisted runs and resolve interruptions/uncertainty within a bound. */
  reconcileInterrupted(required?: { now?: number }, optional?: {}): Promise<number>;
  /**
   * Starts watching `message`'s run, if it is an in-flight daemon run not already watched. A no-op for
   * a user turn, a terminal turn, a turn with no run id, or a BYOK/AG-UI run id.
   */
  watch(input: { principalId: string; conversationId: string; message: ChatMessage }, optional?: { daemon?: RunDaemonClient }): void;
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
    openEvents: async (required, { signal } = {}) =>
      send(`${replayOrigins.get(replayKey(required, {})) ?? await origin()}/api/runs/${encodeURIComponent(required.runId)}/events`, { headers: daemonHeaders(required.principalId), signal }),
    async runStatus(required, requestOptions = {}) {
      try {
        const url = await origin();
        const status = await statusAt({ ...required, url }, requestOptions);
        if (status !== null) {
          replayOrigins.delete(replayKey(required, {}));
          return status;
        }
        const current = (optional.currentUrl ?? getAgentDaemonUrl)();
        if (url === current || requestOptions.signal?.aborted) return null;
        // PID existence can mean PID reuse. Once the prior endpoint is unreachable, the current
        // daemon's 404 can resolve the run. Never let it override a response from the prior daemon,
        // and never fall through on a registry read error (the old address is then unknown).
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

type StreamResult = { kind: "ended"; status: RunSettlement["status"] } | { kind: "gone" } | { kind: "dropped" } | { kind: "unresolved" };

/**
 * @complexity O(frame bytes + serialized checkpoint bytes) per run; O(collected events) space,
 *   with one open daemon connection and at most one pending checkpoint per in-flight run.
 */
export function createAssistantRunFinalizer(options: AssistantRunFinalizerOptions, _optional = {}): AssistantRunFinalizer {
  const observability = options.observability ?? createNoopObservabilityPort({});
  const daemon = options.daemon ?? createHttpRunDaemonClient({ observability });
  const now = options.now ?? Date.now;
  const reconnectDelayMs = options.reconnectDelayMs ?? 2_000;
  const maxReconnects = Math.max(0, options.maxReconnects ?? 30);
  const resolutionTimeoutMs = options.resolutionTimeoutMs ?? 120_000;
  const statusTimeoutMs = options.statusTimeoutMs ?? 5_000;
  const scheduler = options.scheduler ?? createNodeSupervisorScheduler({});
  const checkpointIntervalMs = options.checkpointIntervalMs ?? 1_000;
  const active = new Map<string, { watch: Watch; done: Promise<void> }>();

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

  function settleInterrupted(watch: Watch): Promise<void> {
    // A stalled replay can contain less than the saved checkpoint. Cancellation keeps the most
    // complete answer, just as checkpoints reject a shorter replay prefix.
    const events = interruptionEvents(watch);
    return settle(watch, "canceled", [...events, runInterruptedNotice()]);
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
    watch.events = [];
    watch.failed = false;
    // Cancel the reader as well as HTTP when a bounded resolution settles the row. Fakes may
    // ignore the request signal; late frames must not change a settled watch's checkpoint.
    for await (const frame of readSseFrames(response.body.pipeThrough(new TransformStream(), { signal }))) {
      if (signal.aborted) return { kind: "dropped" };
      const outcome = translateRunFrame(frame.event, frame.data);
      watch.events.push(...outcome.events);
      if (outcome.error) watch.failed = true;
      if (outcome.terminal) {
        watch.terminal = true;
        return { kind: "ended", status: watch.failed && outcome.terminal === "succeeded" ? "failed" : outcome.terminal };
      }
      void checkpoint(watch);
    }
    return { kind: "dropped" };
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
      watch.resolutionDeadline = now() + resolutionTimeoutMs;
    }
  }

  /** Follows the run to a terminal outcome or bounded resolution and reports it to the tracker. */
  async function follow(watch: Watch): Promise<AgentRunStatus> {
    for (let attempt = 0; ; attempt += 1) {
      const result = await readWithinBound(watch);
      if (result.kind === "ended") {
        await settle(watch, result.status, watch.events);
        return result.status;
      }
      if (result.kind === "unresolved") {
        await settleInterrupted(watch);
        return "interrupted";
      }
      // A dropped stream alone proves nothing: a daemon may be mid-respawn or waiting on a card.
      // Recheck its owning endpoint before either retrying or applying the bounded fallback. Even
      // an events 404 must not override a fresh live answer from the daemon that holds the slot.
      const status = await probe({ runId: watch.runId, principalId: watch.principalId }, { client: watch.daemon });
      if (status === 404 || (status !== 200 && (result.kind === "gone" || attempt === maxReconnects || now() >= watch.resolutionDeadline))) {
        await settleInterrupted(watch);
        return "interrupted";
      }
      if (status === 200) {
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

  const finalizer: AssistantRunFinalizer = {
    reconcileInterrupted(required = {}, _optional = {}) {
      return options.ledger.reconcileInterrupted(required, {
        recover: async ({ principalId, conversationId, message }) => {
          if (!message.runId || !isDaemonRunId(message.runId) || !principalId) return false;
          // A retained terminal daemon record is replayable too: the API may have died between
          // the run's end and its durable save. Inconclusive probes get a bounded adopted watch;
          // the boot probe itself is bounded so stalled discovery cannot block every chat route.
          const recoveryDaemon = options.recoveryDaemon ?? daemon;
          if (await probe({ runId: message.runId, principalId }, { client: recoveryDaemon }) === 404) return false;
          finalizer.watch({ principalId, conversationId, message }, { daemon: recoveryDaemon });
          return true;
        },
      });
    },
    watch({ principalId, conversationId, message }, optional = {}) {
      const runId = message.runId;
      if (message.role !== "assistant" || !runId || !isDaemonRunId(runId)) return;
      if (message.runStatus === undefined || isTerminalRunStatus({ status: message.runStatus })) return;
      if (active.has(runId)) return;

      const watch: Watch = {
        daemon: optional.daemon ?? daemon,
        abortStream: new AbortController(),
        resolutionDeadline: now() + resolutionTimeoutMs,
        principalId,
        conversationId,
        messageId: message.id,
        runId,
        events: [...(message.events ?? [])],
        retainedEvents: [...(message.events ?? [])],
        failed: false,
        checkpointedEvents: message.events?.length ?? 0,
        checkpointedAt: Number.NEGATIVE_INFINITY,
        checkpointPending: false,
        terminal: false,
      };
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
          active.delete(runId);
        });
      active.set(runId, { watch, done });
    },

    async idle() {
      while (active.size > 0) await Promise.all([...active.values()].map((entry) => entry.done));
    },

    activeCount: () => active.size,
  };
  return finalizer;
}
