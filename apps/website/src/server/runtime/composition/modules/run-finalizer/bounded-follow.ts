import type { AgentEvent } from "@jini-ai/chat/core";
import type { RecoveryTrigger } from "@jini-ai/chat/server/durable-runs";

import type { RunSettlement } from "#src/assistant/index";

import type { RunDaemonClient, RunDaemonRequest } from "../run-daemon-http-client.js";
import type { RunTimerPort, RunWatchOutcome } from "./ports.js";
import type { StreamReader, StreamResult } from "./stream.js";
import { interruptionEvents, stopWatch, type Watch } from "./watch-state.js";

/**
 * @file Follows one watched run to a terminal outcome or to a bounded resolution. A dropped or
 * silent stream proves nothing about the run, so every wait here has a bound: the resolution
 * deadline around a connection, the timeout of a status probe, the reconnect count. It owns the
 * `resolutionDeadline` of the `Watch` it is given and the reconnect counter. What to do with a
 * verdict (settle, hand off to recovery, keep a live run) is passed in by the assembly.
 */

export interface FollowSettings {
  /** Wait between reconnects when the stream drops but the daemon still has the run. */
  readonly reconnectDelayMs: number;
  /** Reconnects before resolving uncertainty. Runs with fresh live proof keep watching. */
  readonly maxReconnects: number;
  /** Hard window without live proof, including stalled event requests/streams. */
  readonly resolutionTimeoutMs: number;
  /** Bound of every status probe. */
  readonly statusTimeoutMs: number;
}

export interface FollowerPorts {
  readonly stream: StreamReader;
  readonly now: () => number;
  /** Deadlines and reconnect delays. These keep the process alive, unlike the checkpoint timer. */
  readonly timers: RunTimerPort;
  readonly settings: FollowSettings;
  /** Whether a failed end is handed to recovery (which may continue the run) instead of settled. */
  readonly recoveryAvailable: boolean;
  settle(required: { watch: Watch; status: RunSettlement["status"]; events: AgentEvent[] }, optional?: {}): Promise<void>;
  recoverWatch(required: { watch: Watch; trigger: RecoveryTrigger }, optional?: {}): Promise<void>;
  /** Tells recovery this attempt was just seen live. False: recovery took the run from this watch. */
  retainLive(required: { watch: Watch }, optional?: {}): Promise<boolean>;
}

export interface Follower { follow(required: { watch: Watch }, optional?: {}): Promise<RunWatchOutcome> }

async function withinDeadline<T>(
  { timers, work, timeoutMs }: { timers: RunTimerPort; work: Promise<T>; timeoutMs: number },
  { fallback }: { fallback: T },
): Promise<T> {
  let cancel!: () => void;
  const timeout = new Promise<T>((resolve) => {
    cancel = timers.schedule({ delayMs: Math.max(0, timeoutMs), run: () => resolve(fallback) });
  });
  try { return await Promise.race([work, timeout]); }
  finally { cancel(); }
}

/** One status probe of the daemon client that holds the run, cut off at `statusTimeoutMs`; its
 * request is aborted either way. `null` means no answer: uncertainty, never proof of death.
 * @complexity O(1) beyond the request; one timer. */
export async function probeRun(
  { timers, statusTimeoutMs, client, run }: { timers: RunTimerPort; statusTimeoutMs: number; client: RunDaemonClient; run: RunDaemonRequest },
  _optional = {},
): Promise<number | null> {
  const abort = new AbortController();
  try {
    return await withinDeadline({
      // An unavailable or aborted status probe deliberately falls back to recovery.
      timers, work: client.runStatus(run, { signal: abort.signal }).catch(() => null), timeoutMs: statusTimeoutMs,
    }, { fallback: null });
  } finally { abort.abort(); }
}

export function delay({ timers, ms }: { timers: RunTimerPort; ms: number }, _optional = {}): Promise<void> {
  return new Promise<void>((resolve) => {
    timers.schedule({ delayMs: ms, run: resolve });
  });
}

function probeOwner({ ports, watch }: { ports: FollowerPorts; watch: Watch }, _optional = {}): Promise<number | null> {
  return probeRun({
    timers: ports.timers, statusTimeoutMs: ports.settings.statusTimeoutMs, client: watch.daemon, run: { runId: watch.runId, principalId: watch.principalId },
  });
}

/** A quiet stream (or a request stuck before headers) still needs bounded resolution. Keep the
 * same stream when the owning daemon answers live, so long tool/card waits are not interrupted. */
async function readWithinBound({ ports, watch }: { ports: FollowerPorts; watch: Watch }, _optional = {}): Promise<StreamResult> {
  const stream = ports.stream.read({ watch }).catch((): StreamResult => ({ kind: "dropped" }));
  for (;;) {
    const result = await withinDeadline<StreamResult | { kind: "timeout" }>({
      timers: ports.timers, work: stream, timeoutMs: watch.resolutionDeadline - ports.now(),
    }, { fallback: { kind: "timeout" } });
    if (result.kind !== "timeout") return result;
    const status = await probeOwner({ ports, watch });
    // An end frame arriving during the final probe outranks an inconclusive HTTP response.
    if (watch.terminal) return stream;
    if (status !== 200) {
      // The deadline policy resolves uncertainty too; transport/auth errors cannot leave the
      // transcript spinning forever. The final fresh probe always gives a live daemon priority.
      return { kind: "unresolved" };
    }
    if (!await ports.retainLive({ watch })) { stopWatch({ watch }); return { kind: "unresolved" }; }
    watch.resolutionDeadline = ports.now() + ports.settings.resolutionTimeoutMs;
  }
}

/** Renews a freshly verified live watch; uncertainty keeps the current reconnect budget.
 * A live run may outlast that budget, so restart counting rather than abandon its saved row.
 * Returns the next counter, or undefined after recovery relinquishes this watch and its stream.
 * @complexity O(1) bookkeeping plus one existing durable-recovery call for a live run. */
async function prepareReconnect(
  { ports, watch, status, attempt }: { ports: FollowerPorts; watch: Watch; status: number | null; attempt: number },
  _options = {},
): Promise<number | undefined> {
  if (status !== 200) return attempt;
  if (!await ports.retainLive({ watch })) {
    stopWatch({ watch });
    return undefined;
  }
  watch.resolutionDeadline = ports.now() + ports.settings.resolutionTimeoutMs;
  if (attempt === ports.settings.maxReconnects) {
    // Keep monitoring a live run even after exhausting reconnects: its later death must
    // not strand the row until another browser attachment or serving boot.
    return -1;
  }
  return attempt;
}

function shouldRecover(
  { ports, status, result, attempt, watch }: { ports: FollowerPorts; status: number | null; result: StreamResult; attempt: number; watch: Watch },
  _options = {},
): boolean {
  if (status === 404) return true;
  if (status === 200) return false;
  return result.kind === "gone" || attempt === ports.settings.maxReconnects || ports.now() >= watch.resolutionDeadline;
}

async function resolveStreamOutcome(
  { ports, watch, result }: { ports: FollowerPorts; watch: Watch; result: StreamResult },
  _optional = {},
): Promise<RunWatchOutcome | undefined> {
  if (result.kind === "ended") {
    if (result.status === "failed" && ports.recoveryAvailable) await ports.recoverWatch({ watch, trigger: "attempt-failed" });
    else await ports.settle({ watch, status: result.status, events: interruptionEvents({ watch }) });
    return result.status;
  }
  if (result.kind === "unresolved") { await ports.recoverWatch({ watch, trigger: "timeout" }); return "interrupted"; }
  return undefined;
}

/** Follows the run to a terminal outcome or bounded resolution; the caller reports the outcome. */
async function follow({ ports, watch }: { ports: FollowerPorts; watch: Watch }, _optional = {}): Promise<RunWatchOutcome> {
  let attempt = 0;
  while (true) {
    const result = await readWithinBound({ ports, watch });
    const resolved = await resolveStreamOutcome({ ports, watch, result });
    if (resolved) return resolved;
    // A dropped stream alone proves nothing: a daemon may be mid-respawn or waiting on a card.
    // Recheck its owning endpoint before either retrying or applying the bounded fallback. Even
    // an events 404 must not override a fresh live answer from the daemon that holds the slot.
    const status = await probeOwner({ ports, watch });
    if (shouldRecover({ ports, status, result, attempt, watch })) {
      await ports.recoverWatch({ watch, trigger: status === 404 ? "stream" : "timeout" });
      return "interrupted";
    }
    const nextAttempt = await prepareReconnect({ ports, watch, status, attempt });
    if (nextAttempt === undefined) return "interrupted";
    attempt = nextAttempt + 1;
    await delay({ timers: ports.timers, ms: Math.min(ports.settings.reconnectDelayMs, Math.max(0, watch.resolutionDeadline - ports.now())) });
  }
}

/** @complexity O(1) to build; one open connection, one deadline timer and at most one probe per run. */
export function createFollower(ports: FollowerPorts, _optional = {}): Follower {
  return { follow: ({ watch }, _options = {}) => follow({ ports, watch }) };
}
