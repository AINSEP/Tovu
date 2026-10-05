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
 * - this API process exits or is killed (which also kills the daemon, `daemon-supervisor.ts`): no
 *   write can finish then (storage is async, an `exit` listener cannot await), so the finalizer
 *   checkpoints the answer as it streams (`ChatRunLedger.checkpoint`, at most once per
 *   `checkpointIntervalMs`, with a trailing checkpoint so a run that goes quiet still has its last
 *   frames saved within one interval), and the next boot's `ChatRunLedger.reconcileInterrupted` marks the row
 *   canceled, keeping that partial answer and appending the plain restart notice.
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

/** What the finalizer needs from the daemon. Injected so tests can stand in a fake daemon. */
export interface RunDaemonClient {
  /** Opens `/api/runs/:id/events` from event 0. Resolves with the raw response. */
  openEvents(runId: string, principalId: string): Promise<Response>;
  /** `GET /api/runs/:id`'s HTTP status, or `null` when the daemon could not be reached at all. */
  runStatus(runId: string, principalId: string): Promise<number | null>;
}

export interface AssistantRunFinalizerOptions {
  readonly ledger: ChatRunLedger;
  readonly daemon?: RunDaemonClient;
  readonly now?: () => number;
  /** Wait between reconnects when the stream drops but the daemon still has the run. */
  readonly reconnectDelayMs?: number;
  /** Reconnects to try before leaving the row for the browser or the next boot to settle. */
  readonly maxReconnects?: number;
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
  /**
   * Starts watching `message`'s run, if it is an in-flight daemon run not already watched. A no-op for
   * a user turn, a terminal turn, a turn with no run id, or a BYOK/AG-UI run id.
   */
  watch(input: { principalId: string; conversationId: string; message: ChatMessage }): void;
  /** Resolves when every watch started so far has settled or given up. For tests. */
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
export function createHttpRunDaemonClient({ observability }: { observability: ObservabilityPort }): RunDaemonClient {
  // The global `fetch` read per call, so a test that swaps it is still honored.
  const send = trackFetch({ fetch: (url: string, init?: RequestInit) => fetch(url, init), observability });
  return {
    openEvents: (runId, principalId) =>
      send(`${getAgentDaemonUrl()}/api/runs/${encodeURIComponent(runId)}/events`, { headers: daemonHeaders(principalId) }),
    async runStatus(runId, principalId) {
      try {
        const response = await send(`${getAgentDaemonUrl()}/api/runs/${encodeURIComponent(runId)}`, {
          headers: daemonHeaders(principalId),
        });
        await response.body?.cancel().catch(() => undefined);
        return response.status;
      } catch {
        return null;
      }
    },
  };
}

/** One run being watched: the events received on the current connection, and whether it failed. */
interface Watch {
  readonly principalId: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly runId: string;
  events: AgentEvent[];
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

type StreamResult = { kind: "ended"; status: RunSettlement["status"] } | { kind: "gone" } | { kind: "dropped" };

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * @complexity O(frame bytes + serialized checkpoint bytes) per run; O(collected events) space,
 *   with one open daemon connection and at most one pending checkpoint per in-flight run.
 */
export function createAssistantRunFinalizer(options: AssistantRunFinalizerOptions): AssistantRunFinalizer {
  const observability = options.observability ?? createNoopObservabilityPort({});
  const daemon = options.daemon ?? createHttpRunDaemonClient({ observability });
  const now = options.now ?? Date.now;
  const reconnectDelayMs = options.reconnectDelayMs ?? 2_000;
  const maxReconnects = options.maxReconnects ?? 30;
  const checkpointIntervalMs = options.checkpointIntervalMs ?? 1_000;
  const active = new Map<string, { watch: Watch; done: Promise<void> }>();

  /** Stop progress scheduling and await the ledger's atomic terminal write; persistence errors propagate. */
  async function settle(watch: Watch, status: RunSettlement["status"], events: AgentEvent[]): Promise<void> {
    watch.terminal = true;
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
    return settle(watch, "canceled", [...watch.events, runInterruptedNotice()]);
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
    const response = await daemon.openEvents(watch.runId, watch.principalId);
    if (response.status === 404) return { kind: "gone" };
    if (!response.ok || !response.body) return { kind: "dropped" };
    watch.events = [];
    watch.failed = false;
    for await (const frame of readSseFrames(response.body)) {
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

  /** Follows the run to a proven outcome and returns it for the run's tracker. */
  async function follow(watch: Watch): Promise<AgentRunStatus> {
    for (let attempt = 0; attempt <= maxReconnects; attempt += 1) {
      const result = await readStream(watch).catch((): StreamResult => ({ kind: "dropped" }));
      if (result.kind === "ended") {
        await settle(watch, result.status, watch.events);
        return result.status;
      }
      if (result.kind === "gone") {
        await settleInterrupted(watch);
        return "interrupted";
      }
      // Dropped: only a 404 proves the run is gone. Anything else (the daemon is mid-respawn, a
      // body timeout during a long card wait) is worth another look.
      if ((await daemon.runStatus(watch.runId, watch.principalId)) === 404) {
        await settleInterrupted(watch);
        return "interrupted";
      }
      await delay(reconnectDelayMs);
    }
    // Gave up without proof either way. The row stays `running`: the browser can still reattach,
    // and the next boot's reconcile marks it interrupted if nothing else does.
    return "abandoned";
  }

  return {
    watch({ principalId, conversationId, message }) {
      const runId = message.runId;
      if (message.role !== "assistant" || !runId || !isDaemonRunId(runId)) return;
      if (message.runStatus === undefined || isTerminalRunStatus({ status: message.runStatus })) return;
      if (active.has(runId)) return;

      const watch: Watch = {
        principalId,
        conversationId,
        messageId: message.id,
        runId,
        events: [],
        failed: false,
        checkpointedEvents: 0,
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
}
