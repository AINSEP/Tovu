import type { Clock as ClockPort } from "@jini-ai/core/primitives";
import type { EventBusPort, OutboxPort } from "@jini-ai/cms/core";
import { startOutboxDrainer as startJiniOutboxDrainer, type OutboxDrainer } from "@jini-ai/infra/events/outbox";
import { outboxWorkerArgs } from "./jini-outbox-adapter.js";

/**
 * @file Background outbox drainer: the one owner that delivers outbox rows in a site-serving process.
 *
 * Enqueue-only writes need a background drain so their events do not wait for an unrelated write.
 *
 * Contract:
 * - Start it only in the process whose bus carries the site's real subscribers, and only after they
 *   are subscribed. `server/runtime/composition/serving-app.ts` is the one caller and does both. A
 *   drain anywhere else marks rows delivered against the wrong handlers (see `enqueue-only-outbox.ts`).
 * - One drain at a time. The next drain is scheduled only after the current one settles, so a slow
 *   handler never overlaps itself. A full batch drains again at once; otherwise the loop waits
 *   `intervalMs`. A handler that never settles costs at most the delivery timeout per row
 *   (`processOutbox`'s `deliveryTimeoutMs`), so it cannot stall the loop.
 * - Retry, backoff and the terminal `"failed"` state stay in `processOutbox`. A failing handler
 *   reschedules only its own row, so the rows behind it keep flowing. A drain that throws (e.g. a
 *   locked database) goes to `onError` and the loop carries on.
 * - Inline route drains stay safe beside it: `claimPending` is atomic, so whichever drain claims a
 *   row delivers it. A claim is a lease (`DEFAULT_OUTBOX_CLAIM_LEASE_MS`): if its claimer dies or
 *   outlives the lease, another drain claims the row again, so delivery is at-least-once.
 * - The timer is `unref`'d, so the drainer never keeps a process alive by itself.
 */

/** Wait between drains when the last one did not fill a batch; bounds how late an event is delivered. */
export { DEFAULT_OUTBOX_DRAIN_INTERVAL_MS } from "@jini-ai/infra/events/outbox";

export type { OutboxDrainer } from "@jini-ai/infra/events/outbox";

/**
 * Starts draining `outbox` into `bus` in the background. The first drain runs on the next timer turn.
 *
 * @param required.outbox the shared outbox to claim rows from.
 * @param required.bus the bus whose subscribers must see every delivered event.
 * @param required.clock passed through to `processOutbox`.
 * @param optional.intervalMs idle wait between drains (default {@link DEFAULT_OUTBOX_DRAIN_INTERVAL_MS}).
 * @param optional.batchSize rows claimed per drain (default 20).
 * @param optional.deliveryTimeoutMs how long one row's delivery may run (default: `processOutbox`'s own).
 * @param optional.onError receives any error a drain throws (default: `console.error`). If it throws
 *   itself, that is swallowed, so a broken reporter can never end the loop.
 * @returns a handle whose `stop()` ends the loop.
 * @throws RangeError before scheduling if the interval or delivery policy is invalid.
 * @example const drainer = startOutboxDrainer({ outbox, bus, clock }, { intervalMs: 1000 });
 * @complexity O(batchSize) publish attempts per drain (see `processOutbox`); O(1) state between drains.
 */
export function startOutboxDrainer(
  required: { outbox: OutboxPort; bus: EventBusPort; clock: ClockPort },
  optional: { intervalMs?: number; batchSize?: number; deliveryTimeoutMs?: number; onError?: (error: unknown) => void } = {}
): OutboxDrainer {
  return startJiniOutboxDrainer(outboxWorkerArgs(required), optional);
}
