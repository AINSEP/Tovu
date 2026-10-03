/**
 * Tovu's retry profile and clock binding; the pure retry state machine belongs to
 * @jini-ai/sidecar/respawn-policy. No timers or process effects belong in this adapter.
 * The supervisor has no healthy-start acknowledgment, so a rolling window drives both
 * backoff and the crash cap: an isolated failure after a quiet period retries quickly.
 * Consecutive bind failures have a tighter independent cap because waiting longer cannot
 * free a leaked port; any other failure resets that counter. The host's
 * 2026-08-16-daemon-supervision.md records the 1..30s ladder, five-in-60s cap and three
 * port attempts. Each factory call owns an independent policy; manual recovery resets it.
 */
import { createRespawnPolicy as createSidecarRespawnPolicy } from "@jini-ai/sidecar/respawn-policy";
import type { RespawnPolicy, RespawnPolicyOptions as SidecarRespawnPolicyOptions } from "@jini-ai/sidecar/respawn-policy";

export type { RespawnDecision, RespawnFailureInput, RespawnPolicy } from "@jini-ai/sidecar/respawn-policy";

export interface RespawnPolicyOptions extends SidecarRespawnPolicyOptions {
  now?: () => number;
}

/**
 * Bind Tovu's existing retry budgets to the package policy without changing host callers.
 * @param options Retry overrides and an optional clock for deterministic host tests.
 * @returns An independent policy with rolling failures and consecutive port-conflict limits.
 * @throws RangeError for invalid retry budgets.
 * @complexity O(b) construction for b backoff entries; failure recording is O(w) retained failures.
 */
export function createRespawnPolicy(options: RespawnPolicyOptions = {}): RespawnPolicy {
  const { now = Date.now, ...budgets } = options;
  return createSidecarRespawnPolicy({ now }, {
    backoffScheduleMs: [1_000, 2_000, 4_000, 8_000, 16_000, 30_000],
    crashLoopWindowMs: 60_000,
    crashLoopMaxFailures: 5,
    portConflictMaxAttempts: 3,
    ...budgets,
  });
}
