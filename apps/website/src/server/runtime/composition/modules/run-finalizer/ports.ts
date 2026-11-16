/**
 * @file Ports the run finalizer's slices receive from the host. Types only: the host decides what
 * a timer and a log are, the slices only name the one call they need.
 */

/** Same required keys as the supervisor scheduler's `schedule`, restated here so a slice does not
 * import the scheduler's package. Returns the function that cancels the timer. */
export interface RunTimerPort { schedule(required: { delayMs: number; run: () => void }, optional?: {}): () => void }

/** Where the finalizer reports a failure it has already handled. Call it through `reportSafely`:
 * a host log may throw, and that must not change what happens to the run. */
export interface RunLogPort {
  error(required: { operation: "checkpoint"; runId: string; error: unknown }, optional?: {}): void;
}
