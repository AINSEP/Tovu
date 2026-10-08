import type { Clock as ClockPort } from "@jini-ai/core/primitives";
import type { EventBusPort, OutboxPort } from "@jini-ai/cms/core";
import { computeOutboxBackoffMs as jiniBackoff, processOutbox as processJiniOutbox } from "@jini-ai/infra/events/outbox";
import { outboxWorkerArgs } from "./jini-outbox-adapter.js";

/**
 * @file Outbox processing orchestration.
 *
 * Purpose:
 * Converts persisted outbox records into delivered bus events.
 *
 * How it relates to the project:
 * - Reads and updates outbox state through `OutboxPort` (`src/contracts/core/ports.ts`).
 * - Publishes delivered events through `EventBusPort`.
 * - Called by `src/server/app.ts` after a successful command write.
 *
 * Architectural role:
 * This is the hybrid reliability bridge:
 * synchronous command handling writes data immediately, and this worker
 * handles asynchronous side effects with retry semantics.
 *
 * Jini's outbox worker owns equal-jitter backoff, the attempt cap and terminal `failed` status.
 * Storage adapters persist its `nextStatus` decision; they do not rederive retry policy.
 * Claim leases and delivery timeouts prevent a stalled handler from blocking the drain or
 * immediately starting a second copy. Detailed lifecycle rationale lives in
 * Jini/packages/infra/src/events/outbox/{worker,policy}.ts.
 */

/** Compatibility facade: policy and delivery lifecycle live in @jini-ai/infra/events/outbox. */

/** Capped delivery attempts before an outbox row is permanently excluded from retry (`"failed"`). */
export { MAX_OUTBOX_ATTEMPTS } from "@jini-ai/infra/events/outbox";

/**
 * How long a claim holds a row before another drain may claim it again.
 *
 * A claimer that dies between `claimPending` and `markDelivered`/`markFailed` (a crash, a tsx-watch
 * reload) must not strand its rows as `"processing"`. Adapters store the lease expiry in the
 * row's `nextAttemptAt` and treat an expired `"processing"` row as claimable, so delivery is
 * at-least-once. The lease must outlast the slowest full batch a live claimer can take; otherwise a
 * second drain takes over a row that is still being delivered, and it is delivered twice.
 */
export { DEFAULT_OUTBOX_CLAIM_LEASE_MS } from "@jini-ai/infra/events/outbox";

/**
 * How long one row's delivery (its `bus.publish`) may run before `processOutbox` gives up on it
 * before the drain moves on. A timed-out delivery is
 * recorded at once as a retryable failure (`lastError` is visible immediately), but the row is not
 * due again until `DEFAULT_OUTBOX_CLAIM_LEASE_MS` later, not at the ordinary backoff — the handler
 * cannot be cancelled and keeps running, and redelivering it in 15-30s would start a second copy
 * while the first is still live, exactly what the claim lease exists to prevent. The handler's real
 * outcome, once it settles, replaces that record (see Jini's `recordOverrun`). A full default batch of 20
 * deliveries that each time out takes 20 minutes, inside `DEFAULT_OUTBOX_CLAIM_LEASE_MS`.
 */
export { DEFAULT_OUTBOX_DELIVERY_TIMEOUT_MS } from "@jini-ai/infra/events/outbox";

/**
 * Exponential backoff with "equal jitter", owned by @jini-ai/infra/events/outbox:
 * `half = min(cap, base * 2^(attempts-1)) / 2`, then `half + random() * half` — always at least
 * `half`, at most the full exponential step, so retries never collapse to zero delay (thundering
 * herd) or drift outside the exponential envelope. `attempts` is 1-based (the count *after* the
 * failing attempt that just happened — `claimPending` increments it before the attempt runs).
 * At `attempts = 1..6` with the constants above, the un-jittered midpoints are roughly 15s, 30s,
 * 1m, 2m, 4m, 8m — an internal in-process event-bus failure is expected to be a real bug or a
 * short-lived dependency outage, not a slow external endpoint, so this window is far shorter than
 * the webhook worker's ~1-day one.
 *
 * `random` is injectable (defaults to `Math.random`) purely for deterministic tests.
 *
 * @throws RangeError for invalid attempts or randomness, as enforced by the Jini owner.
 * @example computeOutboxBackoffMs(1, { random: () => 0 }); // 15000
 * @complexity O(1).
 */
export function computeOutboxBackoffMs(attempts: number, optional: { random?: () => number } = {}): number {
  return jiniBackoff({ attempts, random: optional.random ?? Math.random });
}

/**
 * Claims due outbox rows and attempts to publish each to the event bus, marking delivered on
 * success or scheduling a backed-off retry (or permanent exclusion past `MAX_OUTBOX_ATTEMPTS`,
 * see this file's header doc) on failure. See Jini's `deliver` for a row claimed more
 * than `MAX_OUTBOX_ATTEMPTS` times. Each delivery may run at most `deliveryTimeoutMs` (default
 * {@link DEFAULT_OUTBOX_DELIVERY_TIMEOUT_MS}) before the drain moves on; see Jini's `recordOverrun`.
 *
 * @throws RangeError before claiming if the batch/timeout bounds are invalid or outlast the lease.
 * @example await processOutbox({ outbox, bus, clock }, { batchSize: 1 });
 * @complexity O(batchSize) publish attempts, each O(subscribed handlers for the event's name).
 */
export async function processOutbox(
  required: { outbox: OutboxPort; bus: EventBusPort; clock: ClockPort },
  optional: { batchSize?: number; random?: () => number; deliveryTimeoutMs?: number } = {}
): Promise<number> {
  return processJiniOutbox(outboxWorkerArgs(required, { random: optional.random }), {
    batchSize: optional.batchSize, deliveryTimeoutMs: optional.deliveryTimeoutMs,
  });
}
