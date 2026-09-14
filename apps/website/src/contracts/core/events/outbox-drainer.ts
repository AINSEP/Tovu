import type { ClockPort, EventBusPort, OutboxPort } from "@jini-ai/cms/core";

import { processOutbox } from "./outbox-worker.js";

/**
 * @file Background outbox drainer: the one owner that delivers outbox rows in a site-serving process.
 *
 * Purpose:
 * Before this file (2026-09-14), a row was delivered only when a route happened to call
 * `processOutbox` inline right after its own write. Comments, taxonomy, menus, widgets, redirects,
 * form definitions, plugin enable and change-set revert all enqueue without draining, so their
 * events waited for some unrelated post/page/entry write to drain them.
 *
 * Contract:
 * - Start it only in the process whose bus carries the site's real subscribers, and only after they
 *   are subscribed. `server/runtime/composition/serving-app.ts` is the one caller and does both. A
 *   drain anywhere else marks rows delivered against the wrong handlers; that was the agent daemon's
 *   bug (see `enqueue-only-outbox.ts`).
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
export const DEFAULT_OUTBOX_DRAIN_INTERVAL_MS = 1_000;

/** Same default as `processOutbox`'s own `batchSize`. */
const DEFAULT_BATCH_SIZE = 20;

export interface OutboxDrainer {
  /** Stops scheduling drains, then resolves once a drain already running has settled. Idempotent. */
  stop(): Promise<void>;
}

type DrainDeps = { outbox: OutboxPort; bus: EventBusPort; clock: ClockPort };

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
 * @complexity O(batchSize) publish attempts per drain (see `processOutbox`); O(1) state between drains.
 */
export function startOutboxDrainer(
  required: DrainDeps,
  optional: { intervalMs?: number; batchSize?: number; deliveryTimeoutMs?: number; onError?: (error: unknown) => void } = {}
): OutboxDrainer {
  const { intervalMs = DEFAULT_OUTBOX_DRAIN_INTERVAL_MS, batchSize = DEFAULT_BATCH_SIZE, deliveryTimeoutMs, onError = logDrainError } = optional;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> = Promise.resolve();

  const schedule = (delayMs: number): void => {
    if (stopped) return;
    timer = setTimeout(() => {
      inFlight = drain();
    }, delayMs);
    timer.unref();
  };

  const drain = async (): Promise<void> => {
    const claimed = await drainOnce(required, { batchSize, deliveryTimeoutMs, onError });
    schedule(claimed >= batchSize ? 0 : intervalMs);
  };

  schedule(0);

  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await inFlight;
    },
  };
}

/** One `processOutbox` call that never rejects: an error is reported and counts as zero rows claimed. */
async function drainOnce(
  required: DrainDeps,
  optional: { batchSize: number; deliveryTimeoutMs?: number; onError: (error: unknown) => void }
): Promise<number> {
  try {
    return await processOutbox(required, { batchSize: optional.batchSize, deliveryTimeoutMs: optional.deliveryTimeoutMs });
  } catch (error) {
    try {
      optional.onError(error);
    } catch {
      // The loop must outlive a reporter that throws; the drain error itself is already lost to it.
    }
    return 0;
  }
}

function logDrainError(error: unknown): void {
  // eslint-disable-next-line no-console
  console.error("[outbox-drainer] drain failed; retrying after the idle interval", error);
}
