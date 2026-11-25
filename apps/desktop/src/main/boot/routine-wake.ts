/**
 * @file The wake relay (P3-T1b.T): when the machine resumes from sleep, tell each running site this
 * process OWNS to re-check its routine slots now, over the child's private `ipc` channel. Electron's
 * `powerMonitor`, the running-site list, the timers and the logger all arrive as ports.
 *
 * Why this is only an accelerator: a site's late timer already classifies the missed slot on its
 * own, so a lost or skipped message costs latency, never a run. It is not a consent or ownership
 * signal either: the site's scheduler still holds the lease and decides whether to fire.
 */
import type { RoutineReconcileMessage } from "@tovu/contracts/routines";

/** A running site as the relay sees it. Only owned handles carry the IPC send method. */
export type RoutineWakeSiteHandle = Readonly<{
  siteDir: string;
  /** False for a site another app serves (an attachment): this process has no channel to its child. */
  owned: boolean;
  /** Sends `{ type: 'routines.reconcile', reason: 'wake' }` over the owned child's `ipc` channel. */
  sendRoutineReconcile?: (message: { reason: "wake" }, _optional?: Record<string, never>) => void;
}>;

/** The slice of Electron's `powerMonitor` the relay uses. */
export interface WakePowerMonitor {
  on: (event: "resume", listener: () => void) => unknown;
  removeListener: (event: "resume", listener: () => void) => unknown;
}

/** Injected timers, so the debounce is testable without real time. */
export interface WakeTimers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export type RoutineWakeLogEntry = Readonly<{ event: "routine-wake-send-failed"; siteDir: string; error: string }>;

/** Sends one wake to each distinct owned, IPC-capable handle; a send failure is logged, never thrown.
 *  @complexity O(n) in running sites. */
function sendWakes(
  { handles, log }: { handles: readonly RoutineWakeSiteHandle[]; log: (entry: RoutineWakeLogEntry) => void },
  _optional = {},
): void {
  const sent = new Set<string>();
  for (const handle of handles) {
    // Ownership is re-checked here, not trusted from the caller: an attached site's child belongs
    // to another app, and a handle without the method has no private channel to send on.
    if (!handle.owned || !handle.sendRoutineReconcile || sent.has(handle.siteDir)) continue;
    sent.add(handle.siteDir);
    try {
      handle.sendRoutineReconcile({ reason: "wake" }, {});
    } catch (error) {
      log({ event: "routine-wake-send-failed", siteDir: handle.siteDir, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

/**
 * Subscribes to `resume` and, `debounceMs` after the LAST resume of a burst (macOS often emits
 * several per wake), sends at most one reconcile per running owned site. The site list is read when
 * the timer fires, not when `resume` arrives, so a site that stopped meanwhile is never sent to.
 * @returns a dispose that removes the listener and clears any pending timer.
 * @complexity O(1) per resume; O(n) in running sites per flush.
 */
export function relayWake(
  { powerMonitor, ownedRunningSites, timers, log }: {
    powerMonitor: WakePowerMonitor; ownedRunningSites: () => readonly RoutineWakeSiteHandle[];
    timers: WakeTimers; log: (entry: RoutineWakeLogEntry) => void;
  },
  { debounceMs = 2_000 }: { debounceMs?: number } = {},
): () => void {
  let pending: unknown = null;
  const clear = (): void => {
    if (pending !== null) timers.clearTimeout(pending);
    pending = null;
  };
  const onResume = (): void => {
    clear();
    pending = timers.setTimeout(() => {
      pending = null;
      sendWakes({ handles: ownedRunningSites(), log });
    }, debounceMs);
  };
  powerMonitor.on("resume", onResume);
  return () => {
    powerMonitor.removeListener("resume", onResume);
    clear();
  };
}

/** The slice of a spawned `ChildProcess` (spawned with an `ipc` stdio slot) the sender uses. */
export interface RoutineIpcChild {
  /** Undefined (a test double, or a child spawned without `ipc`) counts as closed. */
  connected?: boolean;
  send?: (message: RoutineReconcileMessage, callback: (error: Error | null) => void) => boolean;
}

/**
 * Builds the owned handle's {@link RoutineWakeSiteHandle.sendRoutineReconcile}: writes exactly
 * `{ type: 'routines.reconcile', reason: 'wake' }` on the child's private `ipc` channel. Throws when
 * the channel is closed, so {@link relayWake} logs it.
 * @complexity O(1).
 */
export function createRoutineReconcileSender({ child }: { child: RoutineIpcChild }, _optional = {}) {
  return (_message: { reason: "wake" }, _sendOptional = {}): void => {
    if (!child.connected || !child.send) throw new Error("routine wake not sent: the site's ipc channel is closed");
    const message: RoutineReconcileMessage = { type: "routines.reconcile", reason: "wake" };
    // The callback is passed so a failed write cannot surface as an unhandled `error` event on the
    // child. Such a failure means the child exited mid-send: there is nothing left to wake, and a
    // restarted site's own late timer classifies the missed slot.
    child.send(message, () => {});
  };
}
