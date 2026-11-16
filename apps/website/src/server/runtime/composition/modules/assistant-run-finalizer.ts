import { createNoopTracker } from "@jini-ai/diagnostics/observability";
import { describeErrorForLog } from "#src/contracts/core/model-facing-tool-errors";
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
import type { ChatMessage } from "@jini-ai/chat/core";
import { randomUUID } from "node:crypto";
import { createDurableRecovery } from "@jini-ai/chat/server/durable-runs";
import type { DurableRecovery, RecoveryTrigger } from "@jini-ai/chat/server/durable-runs";
import { verifyAttemptChildDead } from "#src/server/inbound/assistant/attempt-process-identity";
import { agentCarriesOwnMemory } from "#src/assistant/agent-session-preset";
import type { SupervisorScheduler } from "@jini-ai/sidecar/supervisor";
import { createNodeSupervisorScheduler } from "@jini-ai/sidecar/supervisor/node";

import { type ChatRunLedger, type RunSettlement } from "#src/assistant/index";
import { createHttpRunDaemonClient, type RunDaemonClient, type RunDaemonRequest } from "./run-daemon-http-client.js";
import { createCheckpointer } from "./run-finalizer/checkpointer.js";
import type { RunLogPort, RunTimerPort } from "./run-finalizer/ports.js";
import { interruptionEvents, makeWatch, stopWatch, watchable, type Watch } from "./run-finalizer/watch-state.js";
import {
  readSseFrames,
  runContentFromEvents,
  runEventsForSave,
  translateRunFrame,
} from "#src/contracts/core/assistant-run-events";
import type { AgentEvent } from "@jini-ai/chat/core";

import { createNoopObservabilityPort, type AgentRunStatus, type ObservabilityPort } from "@jini-ai/diagnostics/observability";


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



function recoverySettings({ options }: { options: AssistantRunFinalizerOptions }, _optional = {}) {
  return { reconnectDelayMs: options.reconnectDelayMs ?? 2_000, maxReconnects: Math.max(0, options.maxReconnects ?? 30),
    resolutionTimeoutMs: options.resolutionTimeoutMs ?? 120_000, statusTimeoutMs: options.statusTimeoutMs ?? 5_000 };
}


/** The trailing checkpoint timer. A global timer the process may exit past: a quiet run must not
 * hold an idle site open. `setTimeout` and `clearTimeout` are read at every call, so a test that
 * replaces the globals still sees this timer; an injected `scheduler` never does. */
const unrefTimers: RunTimerPort = {
  schedule({ delayMs, run }) {
    const timer = setTimeout(run, delayMs);
    timer.unref();
    return () => { clearTimeout(timer); };
  },
};

const consoleRunLog: RunLogPort = {
  error({ runId, error }) { console.error(`[assistant-run-finalizer] checkpoint of run ${runId} failed`, error); },
};

/** Releases an events response that will never be read. An unread body stays open, and a run
 * reconnects up to maxReconnects times. Not awaited: a body that never finishes cancelling must
 * not stall the watch. A failed cancel has nothing left to release.
 * @complexity O(1); starts one cancel and returns. */
function releaseUnreadBody({ response }: { response: Response }, _optional = {}): void {
  void response.body?.cancel().catch(() => undefined);
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
  const checkpointer = createCheckpointer({
    ledger: options.ledger, now, checkpointTimers: unrefTimers, log: consoleRunLog, checkpointIntervalMs: options.checkpointIntervalMs,
  });
  const recovery = recoveryStore ? createDurableRecovery({
    store: recoveryStore, now, mintRunId: randomUUID,
    async probe(run, _options) {
      if (!run.principalId) throw new Error("assistant recovery probe has no principal id");
      const status = await probe({ runId: run.runId, principalId: run.principalId }, { client: newAttempts.has(run.runId) ? daemon : options.recoveryDaemon ?? daemon });
      if (status === 404) return "dead";
      return status === 200 ? "live" : "uncertain";
    },
    attach(run, _options) { if (!run.principalId) throw new Error("assistant recovery watch has no principal id"); finalizer.watch({ principalId: run.principalId, conversationId: run.conversationId, message: run.message }, {
      attemptBase: [...run.attemptBase], daemon: newAttempts.has(run.runId) ? daemon : options.recoveryDaemon ?? daemon,
    }); },
    async launch(required, optional) {
      if (!daemon.launch) throw new Error("daemon continuation port is unavailable");
      newAttempts.add(required.run.runId);
      await daemon.launch(required, optional);
    },
    cancelAttempt: async (run, optional) => {
      const client = newAttempts.has(run.runId) ? daemon : options.recoveryDaemon ?? daemon;
      if (!client.cancel) return;
      if (!run.principalId) throw new Error("assistant recovery cancellation has no principal id");
      return client.cancel({ runId: run.runId, principalId: run.principalId }, optional);
    },
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
        // An unavailable or aborted status probe deliberately falls back to recovery.
        work: client.runStatus(required, { signal: abort.signal }).catch(() => null), timeoutMs: statusTimeoutMs,
      }, { fallback: null });
    } finally { abort.abort(); }
  }

  const delay = (required: { ms: number }, _optional = {}) => new Promise<void>((resolve) => {
    scheduler.schedule({ delayMs: required.ms, run: resolve });
  });

  /** Stop progress scheduling and await the ledger's atomic terminal write; persistence errors propagate. */
  async function settle({ watch, status, events }: { watch: Watch; status: RunSettlement["status"]; events: AgentEvent[] }, _optional = {}): Promise<void> {
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
    const events = interruptionEvents({ watch });
    stopWatch({ watch });
    await options.ledger.checkpoint({ ...watch, content: runContentFromEvents(events), events: runEventsForSave(events) });
    if (!recovery) {
      // Only a fresh status 404 selects "stream". Reconnect/deadline exhaustion is uncertain;
      // without durable recovery's budget and session quarantine, retain this run's saved row.
      if (trigger !== "stream") return;
      await settle({ watch, status: "canceled", events: [...events, { kind: "status", label: "Stopped. Saved work is above." }] });
      return;
    }
    // A launch can still be committing after durable acceptance. Space repeated missing-run
    // probes so its short grace window cannot turn into a hot loop of adopted watches.
    await delay({ ms: reconnectDelayMs });
    await recovery.recover({ messageId: watch.messageId, expectedRunId: watch.runId, trigger }, {});
  }

  /** Reads one connection to the end. The daemon replays from event 0 on every connection, so the
   *  events collected by an earlier, dropped connection are discarded rather than doubled. */
  async function readStream(watch: Watch): Promise<StreamResult> {
    const signal = watch.abortStream.signal;
    const response = await watch.daemon.openEvents({ runId: watch.runId, principalId: watch.principalId }, { signal });
    if (signal.aborted) {
      // The stream was already aborted; body cancellation is best-effort cleanup.
      void response.body?.cancel().catch(() => undefined);
      return { kind: "dropped" };
    }
    if (response.status === 404) { releaseUnreadBody({ response }); return { kind: "gone" }; }
    if (!response.ok || !response.body) { releaseUnreadBody({ response }); return { kind: "dropped" }; }
    watch.retainedEvents = [...interruptionEvents({ watch })];
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
    const outcome = translateRunFrame({ kind: frame.event, raw: frame.data }, { carry: watch.frameCarry });
    watch.events.push(...outcome.events);
    if (outcome.error) watch.failed = true;
    if (outcome.terminal) {
      watch.terminal = true;
      return { kind: "ended", status: watch.failed && outcome.terminal === "succeeded" ? "failed" : outcome.terminal };
    }
    checkpointer.onFrame({ watch });
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
      else await settle({ watch, status: result.status, events: interruptionEvents({ watch }) });
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
      const existing = active.get(runId);
      if (existing && !existing.watch.terminal) return;

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
          catch (error) { console.warn("[assistant-run-finalizer] attempt resource cleanup unavailable", describeErrorForLog({ err: error })); }
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
