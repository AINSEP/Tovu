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
 *
 * 2026-09-16: an overrunning delivery no longer becomes due again while its handler runs; see
 * `recordOverrun`.
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
 * (2026-09-14, revised 2026-09-16). A handler that never settled used to stall `processOutbox`
 * forever, and with it the background drainer and every inline route drain. A timed-out delivery is
 * recorded at once as a retryable failure (`lastError` is visible immediately), but the row is not
 * due again until `DEFAULT_OUTBOX_CLAIM_LEASE_MS` later, not at the ordinary backoff — the handler
 * cannot be cancelled and keeps running, and redelivering it in 15-30s would start a second copy
 * while the first is still live, exactly what the claim lease exists to prevent. The handler's real
 * outcome, once it settles, replaces that record (see `recordOverrun`). A full default batch of 20
 * deliveries that each time out takes 20 minutes, inside `DEFAULT_OUTBOX_CLAIM_LEASE_MS`.
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
 * {@link DEFAULT_OUTBOX_DELIVERY_TIMEOUT_MS}) before the drain moves on; see `recordOverrun`.
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

  const publishing = settlePublish(bus, row.event);
  const outcome = await settleWithin(publishing, deliveryTimeoutMs);
  if (outcome === DELIVERY_TIMED_OUT) {
    await recordOverrun({ outbox, clock, row, publishing, timeoutMs: deliveryTimeoutMs }, { random });
    return;
  }
  await recordDeliveryOutcome({ outbox, clock, row, outcome }, { random });
}

/** A publish's outcome, captured instead of thrown so it can be raced against a timeout without rejecting. */
type PublishOutcome = { ok: true } | { ok: false; error: unknown };

/** Distinguishes "the publish itself failed" from "the publish did not settle in time" in {@link deliverClaimedRow}. */
const DELIVERY_TIMED_OUT = Symbol("delivery timed out");

/**
 * Starts `bus.publish(row.event)` and resolves with its outcome. It never rejects — a synchronous
 * throw from the bus counts as a failed outcome, same as an async rejection — so it is safe to leave
 * running unawaited (see `recordOverrun`) without producing an unhandled rejection.
 *
 * @complexity O(1) beyond the publish itself.
 */
function settlePublish(bus: EventBusPort, event: OutboxRecord["event"]): Promise<PublishOutcome> {
  return new Promise<void>((resolve) => resolve(bus.publish(event))).then(
    () => ({ ok: true }) as const,
    (error: unknown) => ({ ok: false, error }) as const
  );
}

/**
 * Resolves with `settling`'s value, or {@link DELIVERY_TIMED_OUT} once `timeoutMs` passes, whichever
 * comes first.
 *
 * A handler cannot be cancelled: a publish that loses the race keeps running and may still finish
 * later (see `recordOverrun`, which observes it after the timeout is recorded). The timer is cleared
 * as soon as the race settles and is `unref`'d, so it never keeps a process alive.
 *
 * @complexity O(1) beyond the awaited promise itself.
 */
async function settleWithin<T>(settling: Promise<T>, timeoutMs: number): Promise<T | typeof DELIVERY_TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<typeof DELIVERY_TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(DELIVERY_TIMED_OUT), timeoutMs);
    timer.unref();
  });
  try {
    return await Promise.race([settling, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

/** `"failed"` once a row has used its last attempt, `"pending"` (retryable) otherwise. Shared by the on-time and late-outcome paths. */
function nextStatusAfterFailure(row: OutboxRecord): Extract<OutboxRecord["status"], "pending" | "failed"> {
  return row.attempts >= MAX_OUTBOX_ATTEMPTS ? "failed" : "pending";
}

/**
 * Records a publish's outcome: `markDelivered` on success, or a normal backed-off `markFailed` on
 * failure — including when `markDelivered` itself throws, which falls through to the failure branch
 * exactly as before this file's 2026-09-16 revision.
 *
 * @complexity O(1) beyond the two port calls it may make.
 */
async function recordDeliveryOutcome(
  required: { outbox: OutboxPort; clock: ClockPort; row: OutboxRecord; outcome: PublishOutcome },
  optional: { random?: () => number }
): Promise<void> {
  const { outbox, clock, row, outcome } = required;
  let err: unknown;
  if (outcome.ok) {
    try {
      await outbox.markDelivered(row.id);
      return;
    } catch (markError) {
      err = markError;
    }
  } else {
    err = outcome.error;
  }
  const message = err instanceof Error ? err.message : "unknown outbox error";
  // Anchored to the clock read HERE, not to the batch's claim instant in `processOutbox` (2026-09-07
  // audit, claim #6). The claim instant is when `claimPending` was called; every row after the first
  // is marked some time later, so a batch that takes longer to reach this row than the backoff it
  // computes would schedule a retry already in the past — the row is then re-claimed on the
  // very next tick with no backoff at all, precisely when a slow, failing handler is the reason
  // backoff exists. The floor is 15s (`computeOutboxBackoffMs` at `attempts = 1`, `random = 0`)
  // and the bus is in-process, so this needs a pathologically slow handler to bite; it is fixed
  // because the correct anchor costs one clock read, not because it was observed in the wild.
  const nextAttemptAt = addMsToIso(clock.nowIso(), computeOutboxBackoffMs(row.attempts, { random: optional.random }));
  await outbox.markFailed(row.id, message, nextAttemptAt, nextStatusAfterFailure(row));
}

/**
 * Records a delivery timeout: `lastError` is written at once so the drain is never stalled behind an
 * overrunning handler, but unlike an ordinary failure the row is not due again until
 * `DEFAULT_OUTBOX_CLAIM_LEASE_MS` later, not the normal backoff (2026-09-16). The handler is still
 * running and cannot be cancelled — retrying it in 15-30s would run a second copy of it while the
 * first is still live, which is the exact duplicate the claim lease exists to prevent (see this
 * file's header doc). Its own outcome, once it settles, replaces this record via
 * {@link recordDeliveryOutcome} — attached only after the timeout record's write has settled, so a
 * publish that finishes while that write is still in flight is still written last. A handler that
 * never settles at all is retried at the lease horizon, exactly like a claimer that died mid-delivery.
 *
 * Residual risk, not fixed here: a handler still running past that horizon can have its row reclaimed
 * by a second drain, and this recorder's eventual late write is not fenced against that second drain's
 * own outcome, because `OutboxPort` (external `@jini-ai/cms`) has no claim token to check against.
 *
 * @complexity O(1) beyond the port calls it makes; the late write happens off the caller's stack.
 */
async function recordOverrun(
  required: { outbox: OutboxPort; clock: ClockPort; row: OutboxRecord; publishing: Promise<PublishOutcome>; timeoutMs: number },
  optional: { random?: () => number }
): Promise<void> {
  const { outbox, clock, row, publishing, timeoutMs } = required;
  try {
    await outbox.markFailed(
      row.id,
      `delivery of outbox event "${row.event.name}" (${row.id}) timed out after ${timeoutMs}ms`,
      addMsToIso(clock.nowIso(), DEFAULT_OUTBOX_CLAIM_LEASE_MS),
      nextStatusAfterFailure(row)
    );
  } finally {
    // Attached only after the timeout record settles, so a publish that settles meanwhile is still
    // written LAST. `settlePublish` never rejects, so this chain never produces an unhandled
    // rejection on its own; a `recordDeliveryOutcome` failure is caught and reported instead of
    // thrown, because nothing here is awaited by the caller.
    void publishing
      .then((late) => recordDeliveryOutcome({ outbox, clock, row, outcome: late }, optional))
      .catch((error: unknown) => {
        // eslint-disable-next-line no-console
        console.error(`[outbox-worker] could not record the late outcome of outbox event "${row.event.name}" (${row.id})`, error);
      });
  }
}
