import type { ClockPort, EventBusPort, ISODateTime, OutboxPort, OutboxRecord } from "@jini-ai/cms/core";

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
 * Retry policy (2026-09-06 fix):
 * A failing row previously re-queued with `nextAttemptAt = now` (the same instant it was just
 * claimed at), so a permanently-failing event spun at the worker's full batch rate forever —
 * `attempts` was incremented on every claim but nothing ever read it. This file now owns the
 * backoff/cap policy the same way `features/webhooks/delivery.ts`'s `recordDeliveryOutcome` owns
 * it for webhook deliveries (ADR-036 §4 shape: equal-jitter exponential backoff, hard attempt
 * cap, defined terminal state). The formula (`computeOutboxBackoffMs`) intentionally mirrors
 * `computeBackoffMs` there rather than importing it — `contracts/core` may not depend on
 * `features` (`.dependency-cruiser.mjs` line ~124), so this is a deliberate, documented parallel
 * implementation, not an accidental fork.
 *
 * `OutboxPort.markFailed` (defined in the external `@jini-ai/cms` package, not this repo) gained a
 * `nextStatus` parameter (2026-09-06 follow-up) so this worker can now tell the port "this row is
 * now terminal" the same way `recordDeliveryOutcome` tells `WebhookDeliveryRepoPort.markFailed` —
 * one caller decides the retry-vs-terminal policy, every adapter just persists it. Before that
 * port change landed, the two adapters implementing `OutboxPort` in this repo (`InMemoryOutbox`
 * below and `SqliteOutboxAdapter`) each independently re-derived the same decision from the row's
 * own already-persisted `attempts`, which this file's own header used to flag as a disclosed
 * policy-split WARNING. `processOutbox` below computes `nextStatus` from `row.attempts` (the exact
 * same signal the adapters used to read for themselves) and activates the `"failed"` status
 * already declared on `OutboxRecord` (previously dead code — `markFailed` always wrote `"pending"`)
 * as the terminal, poison-marked state: `claimPending` only ever selects `"pending"` rows and
 * `"processing"` rows whose claim lease has expired (2026-09-14, see `DEFAULT_OUTBOX_CLAIM_LEASE_MS`),
 * so a `"failed"` row is permanently excluded from retry regardless of `nextAttemptAt`.
 * `MAX_OUTBOX_ATTEMPTS` is exported from this module (and re-exported via `./index.js`) so this is
 * the one place the cap is defined.
 */

/** Capped delivery attempts before an outbox row is permanently excluded from retry (`"failed"`). */
export const MAX_OUTBOX_ATTEMPTS = 6;

/**
 * How long a claim holds a row before another drain may claim it again (2026-09-14).
 *
 * A claimer that dies between `claimPending` and `markDelivered`/`markFailed` (a crash, a tsx-watch
 * reload) used to leave its rows `"processing"` forever. Adapters now store the lease expiry in the
 * row's `nextAttemptAt` and treat an expired `"processing"` row as claimable, so delivery is
 * at-least-once. The lease must outlast the slowest full batch a live claimer can take; otherwise a
 * second drain takes over a row that is still being delivered, and it is delivered twice.
 */
export const DEFAULT_OUTBOX_CLAIM_LEASE_MS = 30 * 60 * 1000; // 30 minutes

/**
 * How long one row's delivery (its `bus.publish`) may run before `processOutbox` gives up on it
 * (2026-09-14). A handler that never settled used to stall `processOutbox` forever, and with it the
 * background drainer and every inline route drain. A timed-out delivery is recorded as a retryable
 * failure, never as delivered. The handler cannot be cancelled and may still finish later, so its
 * effects must tolerate the retry (at-least-once). A full default batch of 20 deliveries that each
 * time out takes 20 minutes, inside `DEFAULT_OUTBOX_CLAIM_LEASE_MS`.
 */
export const DEFAULT_OUTBOX_DELIVERY_TIMEOUT_MS = 60 * 1000; // 1 minute

/** Backoff base: the first retry after a failure waits (before jitter) around this long. */
const BASE_BACKOFF_MS = 30 * 1000; // 30 seconds

/** Backoff cap: no single retry step waits longer than this, however high `attempts` climbs. */
const MAX_BACKOFF_STEP_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Exponential backoff with "equal jitter", mirroring `features/webhooks/delivery.ts`'s
 * `computeBackoffMs` (same formula, deliberately not imported — see this file's header doc):
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
 * @complexity O(1).
 */
export function computeOutboxBackoffMs(attempts: number, optional: { random?: () => number } = {}): number {
  const { random = Math.random } = optional;
  const exponentialStep = Math.min(MAX_BACKOFF_STEP_MS, BASE_BACKOFF_MS * 2 ** (attempts - 1));
  const half = exponentialStep / 2;
  return Math.round(half + random() * half);
}

/** Adds a millisecond offset to an ISO timestamp, returning a new ISO timestamp. */
function addMsToIso(iso: ISODateTime, ms: number): ISODateTime {
  return new Date(Date.parse(iso) + ms).toISOString();
}

/**
 * Claims due outbox rows and attempts to publish each to the event bus, marking delivered on
 * success or scheduling a backed-off retry (or permanent exclusion past `MAX_OUTBOX_ATTEMPTS`,
 * see this file's header doc) on failure. See {@link deliverClaimedRow} for a row claimed more
 * than `MAX_OUTBOX_ATTEMPTS` times. Each delivery may run at most `deliveryTimeoutMs` (default
 * {@link DEFAULT_OUTBOX_DELIVERY_TIMEOUT_MS}) before it is recorded as a retryable failure.
 *
 * @complexity O(batchSize) publish attempts, each O(subscribed handlers for the event's name).
 */
export async function processOutbox(
  required: { outbox: OutboxPort; bus: EventBusPort; clock: ClockPort },
  optional: { batchSize?: number; random?: () => number; deliveryTimeoutMs?: number } = {}
): Promise<number> {
  const { batchSize = 20, random, deliveryTimeoutMs = DEFAULT_OUTBOX_DELIVERY_TIMEOUT_MS } = optional;
  const rows = await required.outbox.claimPending(batchSize, required.clock.nowIso());

  for (const row of rows) {
    await deliverClaimedRow({ ...required, row }, { random, deliveryTimeoutMs });
  }

  return rows.length;
}

/**
 * Publishes one claimed row and records its outcome.
 *
 * A row whose `attempts` already exceeds `MAX_OUTBOX_ATTEMPTS` is sealed as `"failed"` without being
 * published (2026-09-14). A failed attempt at the cap seals the row, so the only way past the cap is
 * a claim that expired with no recorded outcome: its claimer died mid-delivery, possibly because a
 * handler crashed the process. Publishing it again could repeat that crash on every lease expiry.
 *
 * @complexity O(subscribed handlers for the event's name).
 */
async function deliverClaimedRow(
  required: { outbox: OutboxPort; bus: EventBusPort; clock: ClockPort; row: OutboxRecord },
  optional: { random?: () => number; deliveryTimeoutMs: number }
): Promise<void> {
  const { outbox, bus, clock, row } = required;
  const { random, deliveryTimeoutMs } = optional;
  if (row.attempts > MAX_OUTBOX_ATTEMPTS) {
    const reason = `claimed ${row.attempts} times; the last claim expired with no recorded outcome (its claimer likely died mid-delivery)`;
    await outbox.markFailed(row.id, reason, clock.nowIso(), "failed");
    return;
  }

  try {
    await publishWithin({ bus, row, timeoutMs: deliveryTimeoutMs });
    await outbox.markDelivered(row.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown outbox error";
    const nextStatus: Extract<OutboxRecord["status"], "pending" | "failed"> =
      row.attempts >= MAX_OUTBOX_ATTEMPTS ? "failed" : "pending";
    // Anchored to the clock read HERE, not to the batch's claim instant in `processOutbox` (2026-09-07
    // audit, claim #6). The claim instant is when `claimPending` was called; every row after the first
    // is marked some time later, so a batch that takes longer to reach this row than the backoff it
    // computes would schedule a retry already in the past — the row is then re-claimed on the
    // very next tick with no backoff at all, precisely when a slow, failing handler is the reason
    // backoff exists. The floor is 15s (`computeOutboxBackoffMs` at `attempts = 1`, `random = 0`)
    // and the bus is in-process, so this needs a pathologically slow handler to bite; it is fixed
    // because the correct anchor costs one clock read, not because it was observed in the wild.
    const nextAttemptAt = addMsToIso(clock.nowIso(), computeOutboxBackoffMs(row.attempts, { random }));
    await outbox.markFailed(row.id, message, nextAttemptAt, nextStatus);
  }
}

/**
 * Publishes `row.event`, rejecting once `timeoutMs` passes if the publish has not settled by then.
 *
 * A handler cannot be cancelled: a publish that loses the race keeps running and may still finish
 * later, which is why the caller retries a timed-out row instead of marking it delivered.
 * `Promise.race` subscribes to the losing publish too, so its eventual rejection is handled and never
 * surfaces as an unhandled rejection. The timer is cleared as soon as the race settles and is
 * `unref`'d, so it never keeps a process alive.
 *
 * @param required.bus the bus to publish on.
 * @param required.row the claimed row whose event is published.
 * @param required.timeoutMs how long the publish may run.
 * @throws Error `delivery of outbox event "<name>" (<id>) timed out after <ms>ms` on timeout; otherwise
 *   whatever the publish rejects with.
 * @complexity O(1) beyond the publish itself.
 */
async function publishWithin(required: { bus: EventBusPort; row: OutboxRecord; timeoutMs: number }): Promise<void> {
  const { bus, row, timeoutMs } = required;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`delivery of outbox event "${row.event.name}" (${row.id}) timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref();
  });
  try {
    await Promise.race([bus.publish(row.event), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}
