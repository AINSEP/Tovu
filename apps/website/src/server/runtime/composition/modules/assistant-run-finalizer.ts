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
 * - the daemon answers 404 for the run (it restarted and forgot it): `failed`, keeping every event
 *   received so far, plus the plain restart notice.
 * - this API process exits or is killed (which also kills the daemon, `daemon-supervisor.ts`): no
 *   write can finish then (storage is async, an `exit` listener cannot await), so the finalizer
 *   checkpoints the answer as it streams (`ChatRunLedger.checkpoint`, at most once per
 *   `checkpointIntervalMs`), and the next boot's `ChatRunLedger.reconcileInterrupted` marks the row
 *   failed, keeping that partial answer and appending the plain restart notice.
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

/** The real daemon, over loopback HTTP — the same URL, token and principal header the proxy uses. */
export const httpRunDaemonClient: RunDaemonClient = {
  openEvents: (runId, principalId) =>
    fetch(`${getAgentDaemonUrl()}/api/runs/${encodeURIComponent(runId)}/events`, { headers: daemonHeaders(principalId) }),
  async runStatus(runId, principalId) {
    try {
      const response = await fetch(`${getAgentDaemonUrl()}/api/runs/${encodeURIComponent(runId)}`, {
        headers: daemonHeaders(principalId),
      });
      await response.body?.cancel().catch(() => undefined);
      return response.status;
    } catch {
      return null;
    }
  },
};

/** One run being watched: the events received on the current connection, and whether it failed. */
interface Watch {
  readonly principalId: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly runId: string;
  events: AgentEvent[];
  failed: boolean;
  /** How many events the last checkpoint saved, and when (see `checkpoint`). */
  checkpointedEvents: number;
  checkpointedAt: number;
}

type StreamResult = { kind: "ended"; status: RunSettlement["status"] } | { kind: "gone" } | { kind: "dropped" };

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * @complexity O(frames) per watched run; one open daemon connection per in-flight run.
 */
export function createAssistantRunFinalizer(options: AssistantRunFinalizerOptions): AssistantRunFinalizer {
  const daemon = options.daemon ?? httpRunDaemonClient;
  const now = options.now ?? Date.now;
  const reconnectDelayMs = options.reconnectDelayMs ?? 2_000;
  const maxReconnects = options.maxReconnects ?? 30;
  const checkpointIntervalMs = options.checkpointIntervalMs ?? 1_000;
  const active = new Map<string, { watch: Watch; done: Promise<void> }>();

  async function settle(watch: Watch, status: RunSettlement["status"], events: AgentEvent[]): Promise<void> {
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
    return settle(watch, "failed", [...watch.events, runInterruptedNotice()]);
  }

  /**
   * Saves what the run has produced so far, when it has grown since the last save and the interval
   * has passed. Only growth counts: a reconnect replays from event 0, and a checkpoint of the
   * replay's first events would shrink the saved answer.
   */
  async function checkpoint(watch: Watch): Promise<void> {
    if (watch.events.length <= watch.checkpointedEvents) return;
    if (now() - watch.checkpointedAt < checkpointIntervalMs) return;
    watch.checkpointedEvents = watch.events.length;
    watch.checkpointedAt = now();
    // Best effort: a failed checkpoint only loses what a restart would keep; the stream goes on.
    await options.ledger
      .checkpoint({
        conversationId: watch.conversationId,
        messageId: watch.messageId,
        runId: watch.runId,
        content: runContentFromEvents(watch.events),
        events: runEventsForSave(watch.events),
      })
      .catch((error: unknown) => console.error(`[assistant-run-finalizer] checkpoint of run ${watch.runId} failed`, error));
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
        return { kind: "ended", status: watch.failed && outcome.terminal === "succeeded" ? "failed" : outcome.terminal };
      }
      await checkpoint(watch);
    }
    return { kind: "dropped" };
  }

  async function follow(watch: Watch): Promise<void> {
    for (let attempt = 0; attempt <= maxReconnects; attempt += 1) {
      const result = await readStream(watch).catch((): StreamResult => ({ kind: "dropped" }));
      if (result.kind === "ended") return settle(watch, result.status, watch.events);
      if (result.kind === "gone") return settleInterrupted(watch);
      // Dropped: only a 404 proves the run is gone. Anything else (the daemon is mid-respawn, a
      // body timeout during a long card wait) is worth another look.
      if ((await daemon.runStatus(watch.runId, watch.principalId)) === 404) return settleInterrupted(watch);
      await delay(reconnectDelayMs);
    }
    // Gave up without proof either way. The row stays `running`: the browser can still reattach,
    // and the next boot's reconcile marks it failed if nothing else does.
  }

  return {
    watch({ principalId, conversationId, message }) {
      const runId = message.runId;
      if (message.role !== "assistant" || !runId || !isDaemonRunId(runId)) return;
      if (message.runStatus === undefined || isTerminalRunStatus(message.runStatus)) return;
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
      };
      const done = follow(watch)
        .catch((error: unknown) => {
          console.error(`[assistant-run-finalizer] watching run ${runId} failed`, error);
        })
        .finally(() => {
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
