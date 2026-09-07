import type { ClockPort, EventBusPort, ISODateTime, OutboxPort } from "@jini-ai/cms/core";

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
 * Unlike `WebhookDeliveryRepoPort.markFailed`, `OutboxPort.markFailed` (defined in the external
 * `@jini-ai/cms` package, not this repo) takes no `nextStatus` — its caller can only supply
 * `nextAttemptAt`. There is no way for this worker to tell the port "this row is now terminal"
 * without changing that cross-repo contract, which is out of proportion for this fix (it would
 * require a scoped Jini rebuild + dev-server restart touching every `OutboxPort` consumer and
 * both adapters). Instead, the two adapters that implement `OutboxPort` in this repo
 * (`InMemoryOutbox` below and `SqliteOutboxAdapter`) each independently compare the row's own
 * already-persisted `attempts` against `MAX_OUTBOX_ATTEMPTS` inside `markFailed` and activate the
 * `"failed"` status already declared on `OutboxRecord` (previously dead code — `markFailed` always
 * wrote `"pending"`) as the terminal, poison-marked state: `claimPending` only ever selects
 * `status = "pending"` rows, so a `"failed"` row is permanently excluded from retry regardless of
 * `nextAttemptAt`. `MAX_OUTBOX_ATTEMPTS` is exported from this module (and re-exported via
 * `./index.js`) so both adapters share one source of truth instead of each hardcoding the cap.
 */

/** Capped delivery attempts before an outbox row is permanently excluded from retry (`"failed"`). */
export const MAX_OUTBOX_ATTEMPTS = 6;

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
 * see this file's header doc) on failure.
 *
 * @complexity O(batchSize) publish attempts, each O(subscribed handlers for the event's name).
 */
export async function processOutbox(
  required: { outbox: OutboxPort; bus: EventBusPort; clock: ClockPort },
  optional: { batchSize?: number; random?: () => number } = {}
): Promise<number> {
  const { outbox, bus, clock } = required;
  const { batchSize = 20, random } = optional;
  const now = clock.nowIso();
  const rows = await outbox.claimPending(batchSize, now);

  for (const row of rows) {
    try {
      await bus.publish(row.event);
      await outbox.markDelivered(row.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown outbox error";
      const nextAttemptAt = addMsToIso(now, computeOutboxBackoffMs(row.attempts, { random }));
      await outbox.markFailed(row.id, message, nextAttemptAt);
    }
  }

  return rows.length;
}
