import { randomUUID } from "node:crypto";

import type { AgentEvent, ChatMessage } from "@jini-ai/chat/core";
import type { DurableRecovery, RecoveryTrigger } from "@jini-ai/chat/server/durable-runs";
import { createNoopTracker } from "@jini-ai/diagnostics/observability";
import type { Tracker } from "@jini-ai/core/contracts/site/diagnostics-observability";
import {
  createNoopObservabilityPort,
  type ObservabilityPort,
} from "@jini-ai/core/contracts/observability";
import type { SupervisorScheduler } from "@jini-ai/sidecar/supervisor";
import { createNodeSupervisorScheduler } from "@jini-ai/sidecar/supervisor/node";

import { agentCarriesOwnMemory } from "#src/assistant/agent-session-preset";
import { type ChatRunLedger, type RunSettlement } from "#src/assistant/index";
import { runContentFromEvents, runEventsForSave } from "#src/contracts/core/assistant-run-events";
import { describeErrorForLog } from "#src/contracts/core/model-facing-tool-errors";
import { verifyAttemptChildDead } from "#src/server/inbound/assistant/attempt-process-identity";

import { createHttpRunDaemonClient, type RunDaemonClient } from "../run-daemon-http-client.js";
import { createFollower, delay, probeRun, type Follower } from "./bounded-follow.js";
import { createCheckpointer } from "./checkpointer.js";
import type { RunLogPort, RunTimerPort } from "./ports.js";
import { createRecoveryBinding, type RecoveryBinding } from "./recovery-binding.js";
import { reportSafely } from "./report.js";
import { createStreamReader } from "./stream.js";
import { interruptionEvents, makeWatch, stopWatch, watchable, type Watch } from "./watch-state.js";

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

/** The finalizer's reporter is the console. The three lines are printed exactly as before the
 * log port existed; only the cleanup warning is reduced to the error's class and code. Each call
 * returns what the console returned, so `reportSafely` also sees a reporter that fails late. */
const consoleRunLog: RunLogPort = {
  error({ operation, runId, error }) {
    if (operation === "checkpoint") return console.error(`[assistant-run-finalizer] checkpoint of run ${runId} failed`, error);
    return console.error(`[assistant-run-finalizer] watching run ${runId} failed`, error);
  },
  warn: ({ error }) => console.warn("[assistant-run-finalizer] attempt resource cleanup unavailable", describeErrorForLog({ err: error })),
};

/** What a terminal write needs. `ledger` is the host's own object, called as `ledger.settle(...)`. */
interface SettlePorts { readonly ledger: Pick<ChatRunLedger, "settle">; readonly now: () => number }
/** What the hand-off of a watch to recovery needs on top of a terminal write. */
interface HandOffPorts extends SettlePorts {
  readonly ledger: Pick<ChatRunLedger, "settle" | "checkpoint">;
  readonly timers: RunTimerPort;
  readonly reconnectDelayMs: number;
  readonly recovery: DurableRecovery | undefined;
}
/** The watches in progress and what the start and the end of one need. */
interface Registry {
  readonly active: Map<string, { watch: Watch; done: Promise<void> }>;
  readonly tracker: Tracker;
  readonly follower: Follower;
  readonly log: RunLogPort;
  readonly attemptEnded: RecoveryBinding["attemptEnded"];
  /** Asks the host's handler at every watch end, never cached: a host may install it after construction. */
  onAttemptEnded(required: { runId: string }, optional?: {}): Promise<void> | undefined;
}

/** Stop progress scheduling and await the ledger's atomic terminal write; persistence errors propagate. */
async function settle(
  { ports, watch, status, events }: { ports: SettlePorts; watch: Watch; status: RunSettlement["status"]; events: AgentEvent[] },
  _optional = {},
): Promise<void> {
  stopWatch({ watch });
  await ports.ledger.settle({
    conversationId: watch.conversationId,
    messageId: watch.messageId,
    runId: watch.runId,
    status,
    content: runContentFromEvents(events),
    events: runEventsForSave(events),
    endedAt: ports.now(),
  });
}

async function recoverWatch({ ports, watch, trigger }: { ports: HandOffPorts; watch: Watch; trigger: RecoveryTrigger }, _optional = {}): Promise<void> {
  const events = interruptionEvents({ watch });
  stopWatch({ watch });
  await ports.ledger.checkpoint({ ...watch, content: runContentFromEvents(events), events: runEventsForSave(events) });
  if (!ports.recovery) {
    // Only a fresh status 404 selects "stream". Reconnect/deadline exhaustion is uncertain;
    // without durable recovery's budget and session quarantine, retain this run's saved row.
    if (trigger !== "stream") return;
    await settle({ ports, watch, status: "canceled", events: [...events, { kind: "status", label: "Stopped. Saved work is above." }] });
    return;
  }
  // A launch can still be committing after durable acceptance. Space repeated missing-run
  // probes so its short grace window cannot turn into a hot loop of adopted watches.
  await delay({ timers: ports.timers, ms: ports.reconnectDelayMs });
  await ports.recovery.recover({ messageId: watch.messageId, expectedRunId: watch.runId, trigger }, {});
}

async function retainLive({ recovery, watch }: { recovery: DurableRecovery | undefined; watch: Watch }, _optional = {}): Promise<boolean> {
  if (!recovery) return true;
  // follow/readWithinBound are recovery's live arm. Reuse their fresh proof for this attempt
  // so reconnects and quiet approval waits neither probe twice nor spend the recovery budget.
  const result = await recovery.recover({ messageId: watch.messageId, expectedRunId: watch.runId, trigger: "timeout" }, { liveRunId: watch.runId });
  return result === "reattached" || result === "waiting";
}

/** Boot repair of one unfinished row. Awaited by the ledger, which handles one row at a time. */
async function recoverAtBoot({ recovery, message }: { recovery: DurableRecovery | undefined; message: ChatMessage }, _optional = {}): Promise<boolean> {
  if (!message.runId) return false;
  if (recovery) {
    const result = await recovery.recover({ messageId: message.id, trigger: "boot" }, {});
    return result !== "gone";
  }
  return false;
}

/** The end of one watch, whatever ended it: stop it, forget the attempt, release the daemon
 * pin, tell the host, and only then drop it from the registry.
 * @complexity O(1) beyond the host's handler. */
async function endAttempt({ registry, watch }: { registry: Registry; watch: Watch }, _optional = {}): Promise<void> {
  const { runId } = watch;
  stopWatch({ watch });
  registry.attemptEnded({ runId });
  try {
    // Preserve a successor's pin on the same client, but release an old client's
    // credentials when a replacement watch uses a different daemon client.
    const successor = registry.active.get(runId)?.watch;
    if (successor === watch || successor?.daemon !== watch.daemon) watch.daemon.release?.({ runId, principalId: watch.principalId }, {});
    await registry.onAttemptEnded({ runId });
  }
  catch (error) { reportSafely({ report: () => registry.log.warn({ operation: "attempt-cleanup", runId, error }) }); }
  finally { if (registry.active.get(runId)?.watch === watch) registry.active.delete(runId); }
}

function startWatch({ registry, watch }: { registry: Registry; watch: Watch }, _optional = {}): void {
  const { runId, conversationId } = watch;
  // Inside the run's scope, so the ledger writes the loop makes are recorded under the run.
  const done = registry.tracker.trace({ name: "assistant.run", run: async (span) => {
    try {
      const status = await registry.follower.follow({ watch });
      reportSafely({ report: () => span.setOutcome({ status }) });
    } catch (error) {
      // A watch that threw proved nothing about the run itself; the error says why it stopped.
      reportSafely({ report: () => span.setOutcome({ status: "abandoned", error }) });
      reportSafely({ report: () => registry.log.error({ operation: "watch", runId, error }) });
    }
  } }, { agent: { runId, conversationId } })
    .finally(() => endAttempt({ registry, watch }));
  registry.active.set(runId, { watch, done });
}

/**
 * @complexity O(frame bytes + serialized checkpoint bytes) per run; O(collected events) space,
 *   with one open daemon connection and at most one pending checkpoint per in-flight run.
 */
export function createAssistantRunFinalizer(options: AssistantRunFinalizerOptions, _optional = {}): AssistantRunFinalizer {
  const observability = options.observability ?? createNoopObservabilityPort({});
  const tracker = options.tracker ?? createNoopTracker({});
  const daemon = options.daemon ?? createHttpRunDaemonClient({ observability });
  const now = options.now ?? Date.now;
  const settings = recoverySettings({ options });
  const timers = options.scheduler ?? createNodeSupervisorScheduler({});
  const active: Registry["active"] = new Map();
  const durable = options.ledger.durable;
  const checkpointer = createCheckpointer({
    ledger: options.ledger, now, checkpointTimers: unrefTimers, log: consoleRunLog, checkpointIntervalMs: options.checkpointIntervalMs,
  });
  const { recovery, attemptEnded } = createRecoveryBinding({
    ledger: options.ledger, durable, now, mintRunId: randomUUID, daemon,
    recoveryDaemon: () => options.recoveryDaemon,
    probe: ({ run, client }) => probeRun({ timers, statusTimeoutMs: settings.statusTimeoutMs, client, run }),
    attach: ({ principalId, conversationId, message }, { attemptBase, daemon: holder }) => {
      finalizer.watch({ principalId, conversationId, message }, { attemptBase, daemon: holder });
    },
    // No process identity is guessed from daemon PID existence. Until the executor provides a
    // verified child identity, reconstruction is the safe universal continuation path.
    verifyChildDead: options.verifyChildDead ?? ((required, _options) => verifyAttemptChildDead(required, {})),
    supportsNativeResume: options.supportsNativeResume ?? (({ agentId }, _options) => agentCarriesOwnMemory({ agentId: agentId }, {})),
  });
  const handOff: HandOffPorts = { ledger: options.ledger, now, timers, reconnectDelayMs: settings.reconnectDelayMs, recovery };
  const follower = createFollower({
    stream: createStreamReader({ checkpointer }), now, timers, settings, recoveryAvailable: recovery !== undefined,
    settle: ({ watch, status, events }) => settle({ ports: handOff, watch, status, events }),
    recoverWatch: ({ watch, trigger }) => recoverWatch({ ports: handOff, watch, trigger }),
    retainLive: ({ watch }) => retainLive({ recovery, watch }),
  });
  const registry: Registry = {
    active, tracker, follower, log: consoleRunLog, attemptEnded, onAttemptEnded: ({ runId }) => options.onAttemptEnded?.({ runId }),
  };
  const finalizer: AssistantRunFinalizer = {
    recover: async (required, optional) => recovery ? recovery.recover(required, optional) : "gone",
    reconcileInterrupted(required = {}, _optional = {}) {
      return options.ledger.reconcileInterrupted({ now: required.now ?? now() }, { recover: ({ message }) => recoverAtBoot({ recovery, message }) });
    },
    watch: createRunWatcher({ active, registry, daemon, now, settings }),
    async idle() {
      while (active.size > 0) await Promise.all([...active.values()].map((entry) => entry.done));
    },
    activeCount: () => active.size,
  };
  return finalizer;
}

function createRunWatcher({ active, registry, daemon, now, settings }: { active: Registry["active"]; registry: Registry; daemon: NonNullable<AssistantRunFinalizerOptions["daemon"]>; now: () => number; settings: ReturnType<typeof recoverySettings> }): AssistantRunFinalizer["watch"] {
  return function watch({ principalId, conversationId, message }, optional = {}) {
      const runId = message.runId;
      if (!watchable({ message }) || !runId) return;
      const existing = active.get(runId);
      if (existing && !existing.watch.terminal) return;
      startWatch({ registry, watch: makeWatch({
        principalId, conversationId, message, runId, daemon: optional.daemon ?? daemon, attemptBase: optional.attemptBase ?? [],
        now: now(), resolutionTimeoutMs: settings.resolutionTimeoutMs,
      }) });
    };
}
