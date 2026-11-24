import type { Clock as ClockPort } from "@jini-ai/core/primitives";
import type { EventBusPort, OutboxPort } from "@jini-ai/core/contracts/events";
import { processDomainOutbox } from "@jini-ai/infra/events/domain-outbox";
import { outboxRetryPolicyForEvent } from "./outbox-retry-policies.js";

/**
 * @file The site's outbox drain: binds the site retry table to the generic domain-outbox worker.
 *
 * Purpose:
 * Converts persisted outbox records into delivered bus events.
 *
 * How it relates to the project:
 * - Reads and updates outbox state through `OutboxPort` (`@jini-ai/core/contracts/events`).
 * - Publishes delivered events through `EventBusPort`.
 * - Called by `apps/website/src/server/runtime/composition/app.ts` after a successful command write.
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
 * Jini/packages/infra/src/events/outbox/{worker,policy}.ts; the domain-port translation lives in
 * Jini/packages/infra/src/events/domain-outbox.ts. What stays here is host policy: every drain, inline
 * after a route write or in the background drainer, must apply the same per-event retry table.
 */

/**
 * Claims due outbox rows and attempts to publish each to the event bus, marking delivered on
 * success or scheduling a backed-off retry (or permanent exclusion past `MAX_OUTBOX_ATTEMPTS`,
 * see this file's header doc) on failure. See Jini's `deliver` for a row claimed more
 * than `MAX_OUTBOX_ATTEMPTS` times. Each delivery may run at most `deliveryTimeoutMs` (default
 * `DEFAULT_OUTBOX_DELIVERY_TIMEOUT_MS`) before the drain moves on; see Jini's `recordOverrun`.
 * Events listed in `outbox-retry-policies.ts` (external form deliveries) use their own cap and backoff.
 *
 * @throws RangeError before claiming if the batch/timeout bounds are invalid or outlast the lease.
 * @example await processOutbox({ outbox, bus, clock }, { batchSize: 1 });
 * @complexity O(batchSize) publish attempts, each O(subscribed handlers for the event's name).
 */
export async function processOutbox(
  required: { outbox: OutboxPort; bus: EventBusPort; clock: ClockPort },
  optional: { batchSize?: number; random?: () => number; deliveryTimeoutMs?: number } = {}
): Promise<number> {
  return processDomainOutbox(required, { ...optional, retryPolicyForEvent: outboxRetryPolicyForEvent });
}
