/**
 * @file Pure decision logic for `daemon-supervisor.ts`'s automatic respawn loop. Deliberately
 * carries no I/O, no timers, and no reference to `child_process` at all, so the backoff/crash-loop
 * rules can be proven directly against an injected fake clock instead of by orchestrating real
 * `setTimeout` delays or a real daemon process — see `daemon-supervisor.ts`'s own header for how
 * this plugs into the actual spawn loop, and this codebase's `2026-08-16-daemon-supervision.md`
 * report for the design rationale behind the specific numbers below.
 *
 * Two independent counters, not one:
 * - A rolling window of ALL failure timestamps (`crashLoopWindowMs`) drives both the backoff delay
 *   (index into `backoffScheduleMs`) and the generic crash-loop cap (`crashLoopMaxFailures`).
 *   Deriving backoff from the SAME window rather than a lifetime attempt count is deliberate:
 *   nothing in this codebase's daemon-spawn path waits for the daemon to report itself healthy
 *   (see `daemon-supervisor.ts`), so there is no "reset the counter, this attempt succeeded"
 *   signal to hook. A window-based count self-heals instead — one isolated crash after hours of
 *   healthy running always retries at the fast end of the ladder, and only a genuine back-to-back
 *   crash burst escalates toward the cap.
 * - A CONSECUTIVE (not time-windowed) count of `PORT_IN_USE` failures specifically
 *   (`portConflictMaxAttempts`), tripping independently and sooner than the generic cap. A leaked
 *   port either clears within the first couple of short backoff delays or it doesn't — hammering
 *   it all the way up the same ladder used for a crashing process wastes cycles on a failure mode
 *   backoff duration cannot fix. Any non-port failure resets this counter — it tracks "is THIS
 *   specific problem stuck", not "how unhealthy has this process been in general".
 */

/** 1s, 2s, 4s, 8s, 16s, then holds at 30s — see this file's own header for why the index into this
 *  ladder comes from the rolling window count rather than a lifetime attempt count. */
const DEFAULT_BACKOFF_SCHEDULE_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000] as const;
const DEFAULT_CRASH_LOOP_WINDOW_MS = 60_000;
const DEFAULT_CRASH_LOOP_MAX_FAILURES = 5;
const DEFAULT_PORT_CONFLICT_MAX_ATTEMPTS = 3;

export interface RespawnPolicyOptions {
  /** Delay before each successive retry, indexed by how many failures currently sit inside the
   *  rolling window; the last entry repeats for any further attempt. */
  backoffScheduleMs?: readonly number[];
  /** Width of the rolling window used for both the backoff index and the generic crash-loop cap. */
  crashLoopWindowMs?: number;
  /** Failures inside the window before the generic crash-loop cap trips. */
  crashLoopMaxFailures?: number;
  /** Consecutive `PORT_IN_USE` failures (independent of the window) before the port-conflict cap
   *  trips. */
  portConflictMaxAttempts?: number;
  /** Injectable clock — real `Date.now` in production, a controllable fake in tests. */
  now?: () => number;
}

export interface RespawnFailureInput {
  /** True when this exit is `AGENT_DAEMON_EXIT_CODE.PORT_IN_USE` — see this file's own header for
   *  why that failure mode gets its own, tighter cap. */
  isPortConflict: boolean;
}

export type RespawnDecision =
  | { action: "retry"; delayMs: number; attempt: number }
  | { action: "give-up"; kind: "crash-loop"; attempts: number; windowMs: number }
  | { action: "give-up"; kind: "port-conflict"; attempts: number };

export interface RespawnPolicy {
  /** Record one failed spawn attempt and decide what happens next. */
  recordFailure(input: RespawnFailureInput): RespawnDecision;
  /** Clear all counters and the tripped state — called by the manual restart seam so an operator
   *  can always force a fresh attempt regardless of prior history. */
  reset(): void;
  /** True once a `recordFailure` call has returned `"give-up"` and `reset()` hasn't run since. */
  isTripped(): boolean;
}

/**
 * Create a fresh, untripped {@link RespawnPolicy}.
 *
 * @param options see {@link RespawnPolicyOptions}; every field has a production default.
 * @returns a policy instance with its own private counters — independent of any other instance.
 * @complexity `recordFailure`: O(w) worst case per call, where `w` is the number of timestamps
 *   currently inside the window (bounded by `crashLoopMaxFailures`, since the window is pruned
 *   before growing and a trip stops further calls) — not unbounded with process lifetime.
 *   `reset`/`isTripped`: O(1).
 */
export function createRespawnPolicy(options: RespawnPolicyOptions = {}): RespawnPolicy {
  const backoffScheduleMs = options.backoffScheduleMs ?? DEFAULT_BACKOFF_SCHEDULE_MS;
  const crashLoopWindowMs = options.crashLoopWindowMs ?? DEFAULT_CRASH_LOOP_WINDOW_MS;
  const crashLoopMaxFailures = options.crashLoopMaxFailures ?? DEFAULT_CRASH_LOOP_MAX_FAILURES;
  const portConflictMaxAttempts = options.portConflictMaxAttempts ?? DEFAULT_PORT_CONFLICT_MAX_ATTEMPTS;
  const now = options.now ?? Date.now;

  let failureTimestamps: number[] = [];
  let consecutivePortConflicts = 0;
  let tripped = false;

  function recordFailure(input: RespawnFailureInput): RespawnDecision {
    consecutivePortConflicts = input.isPortConflict ? consecutivePortConflicts + 1 : 0;

    const cutoff = now() - crashLoopWindowMs;
    failureTimestamps = [...failureTimestamps.filter((ts) => ts > cutoff), now()];

    if (consecutivePortConflicts >= portConflictMaxAttempts) {
      tripped = true;
      return { action: "give-up", kind: "port-conflict", attempts: consecutivePortConflicts };
    }

    if (failureTimestamps.length >= crashLoopMaxFailures) {
      tripped = true;
      return { action: "give-up", kind: "crash-loop", attempts: failureTimestamps.length, windowMs: crashLoopWindowMs };
    }

    const attempt = failureTimestamps.length;
    const delayIndex = Math.min(attempt - 1, backoffScheduleMs.length - 1);
    return { action: "retry", delayMs: backoffScheduleMs[delayIndex], attempt };
  }

  function reset(): void {
    failureTimestamps = [];
    consecutivePortConflicts = 0;
    tripped = false;
  }

  function isTripped(): boolean {
    return tripped;
  }

  return { recordFailure, reset, isTripped };
}
