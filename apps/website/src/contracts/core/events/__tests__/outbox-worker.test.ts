import assert from "node:assert/strict";
import test from "node:test";

import { computeOutboxBackoffMs, InMemoryEventBus, InMemoryOutbox, MAX_OUTBOX_ATTEMPTS, processOutbox } from "../index.js";

/** Fails every publish with a distinct, countable message — used by the backoff/cap tests below. */
function alwaysFailingBus(onPublish?: () => void): InMemoryEventBus {
  const bus = new InMemoryEventBus();
  void bus.subscribe("fail.event", async () => {
    onPublish?.();
    throw new Error("handler failed to execute");
  });
  return bus;
}

test("processOutbox publishes pending events and marks delivered", async () => {
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const clock = { nowIso: () => "2026-02-21T00:00:00.000Z" };

  let handled = 0;
  await bus.subscribe("demo.event", async () => {
    handled += 1;
  });

  await outbox.enqueue({
    id: "evt-1",
    name: "demo.event",
    occurredAt: "2026-02-21T00:00:00.000Z",
    workspaceId: "workspace-1",
    payload: { ok: true },
  });

  const processed = await processOutbox({ outbox, bus, clock });
  assert.equal(processed, 1);
  assert.equal(handled, 1);
});

test("processOutbox respects optional batchSize", async () => {
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const clock = { nowIso: () => "2026-02-21T00:00:00.000Z" };

  await outbox.enqueue({
    id: "evt-1",
    name: "demo.event",
    occurredAt: "2026-02-21T00:00:00.000Z",
    workspaceId: "workspace-1",
    payload: { n: 1 },
  });
  await outbox.enqueue({
    id: "evt-2",
    name: "demo.event",
    occurredAt: "2026-02-21T00:00:00.000Z",
    workspaceId: "workspace-1",
    payload: { n: 2 },
  });

  const processed = await processOutbox({ outbox, bus, clock }, { batchSize: 1 });
  assert.equal(processed, 1);
});

test("processOutbox catches Error during publish and marks row failed", async () => {
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const clock = { nowIso: () => "2026-02-21T12:00:00.000Z" };

  await bus.subscribe("fail.event", async () => {
    throw new Error("handler failed to execute");
  });

  await outbox.enqueue({
    id: "evt-fail",
    name: "fail.event",
    occurredAt: "2026-02-21T00:00:00.000Z",
    workspaceId: "workspace-1",
    payload: {},
  });

  const processed = await processOutbox({ outbox, bus, clock });
  assert.equal(processed, 1);

  // 2026-09-06 fix: a failed row must NOT be immediately reclaimable at the exact instant it just
  // failed — that was the bug (outbox-worker.ts:34 passed `now` straight through as
  // `nextAttemptAt`). It becomes eligible again only once its computed backoff has elapsed.
  const immediateReclaim = await outbox.claimPending(10, "2026-02-21T12:00:00.000Z");
  assert.equal(immediateReclaim.length, 0);

  // A day later (comfortably past MAX_BACKOFF_STEP_MS) it is eligible again, with the error and
  // id preserved — this is a retryable backoff, not a permanent exclusion.
  const pendingAgain = await outbox.claimPending(10, "2026-02-22T12:00:00.000Z");
  assert.equal(pendingAgain.length, 1);
  assert.equal(pendingAgain[0].id, "evt-fail");
  assert.equal(pendingAgain[0].lastError, "handler failed to execute");
});

test("processOutbox catches non-Error during publish and marks row failed with fallback message", async () => {
  const outbox = new InMemoryOutbox();
  const bus = {
    publish: async () => {
      throw "literal string error";
    },
    subscribe: async () => {},
  } as unknown as InMemoryEventBus;
  const clock = { nowIso: () => "2026-02-21T12:00:00.000Z" };

  await outbox.enqueue({
    id: "evt-str-fail",
    name: "str.event",
    occurredAt: "2026-02-21T00:00:00.000Z",
    workspaceId: "workspace-1",
    payload: {},
  });

  const processed = await processOutbox({ outbox, bus, clock });
  assert.equal(processed, 1);

  // Same immediate-reclaim proof as the Error-path test above, for the fallback-message branch.
  const immediateReclaim = await outbox.claimPending(10, "2026-02-21T12:00:00.000Z");
  assert.equal(immediateReclaim.length, 0);

  const pendingAgain = await outbox.claimPending(10, "2026-02-22T12:00:00.000Z");
  assert.equal(pendingAgain.length, 1);
  assert.equal(pendingAgain[0].lastError, "unknown outbox error");
});

test("processOutbox returns 0 when outbox has no pending records", async () => {
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const clock = { nowIso: () => "2026-02-21T00:00:00.000Z" };

  const processed = await processOutbox({ outbox, bus, clock });
  assert.equal(processed, 0);
});

test("processOutbox schedules the exact deterministic backoff delay for a first failure", async () => {
  const outbox = new InMemoryOutbox();
  const startIso = "2026-02-21T12:00:00.000Z";
  const bus = alwaysFailingBus();
  const clock = { nowIso: () => startIso };

  await outbox.enqueue({
    id: "evt-fail",
    name: "fail.event",
    occurredAt: startIso,
    workspaceId: "workspace-1",
    payload: {},
  });

  // random: () => 0 pins the jitter to its lower bound so the resulting nextAttemptAt is an exact,
  // reproducible value rather than "some time later" — asserting the concrete delay, not just that
  // one exists.
  await processOutbox({ outbox, bus, clock }, { random: () => 0 });

  const expectedDelayMs = computeOutboxBackoffMs(1, { random: () => 0 });
  const expectedNextAttemptAt = new Date(Date.parse(startIso) + expectedDelayMs).toISOString();

  const justBefore = new Date(Date.parse(expectedNextAttemptAt) - 1).toISOString();
  assert.equal((await outbox.claimPending(10, justBefore)).length, 0, "must not be eligible one ms early");

  const claimedAtBackoff = await outbox.claimPending(10, expectedNextAttemptAt);
  assert.equal(claimedAtBackoff.length, 1);
  assert.equal(claimedAtBackoff[0].nextAttemptAt, expectedNextAttemptAt);
});

test("MAX_OUTBOX_ATTEMPTS is a positive, finite cap (2026-09-06 fix)", () => {
  assert.equal(MAX_OUTBOX_ATTEMPTS, 6);
});

test("computeOutboxBackoffMs stays within [half, full] of the exponential step and respects the cap", () => {
  const lower = computeOutboxBackoffMs(1, { random: () => 0 });
  const upper = computeOutboxBackoffMs(1, { random: () => 1 });
  assert.ok(lower > 0);
  assert.ok(upper > lower);

  // At a high attempt count the exponential step is clamped, so the lower/upper bounds stop
  // growing — proves the cap is real, not just a large-but-still-exponential number. With
  // BASE_BACKOFF_MS=30s and MAX_BACKOFF_STEP_MS=30min, the step first hits the cap at attempts=7
  // (30s * 2^6 = 960s < 1800s cap is attempts=6 still uncapped; attempts=7 -> 1920s, clamped).
  const cappedLower = computeOutboxBackoffMs(20, { random: () => 0 });
  const cappedUpper = computeOutboxBackoffMs(20, { random: () => 1 });
  assert.equal(cappedLower, computeOutboxBackoffMs(7, { random: () => 0 }));
  assert.equal(cappedUpper, computeOutboxBackoffMs(7, { random: () => 1 }));
});

test("processOutbox stops retrying and permanently excludes a row once MAX_OUTBOX_ATTEMPTS is reached", async () => {
  const outbox = new InMemoryOutbox();
  let currentIso = "2026-02-21T00:00:00.000Z";
  let attemptsMade = 0;
  const bus = alwaysFailingBus(() => {
    attemptsMade += 1;
  });
  const clock = { nowIso: () => currentIso };

  await outbox.enqueue({
    id: "evt-fail",
    name: "fail.event",
    occurredAt: currentIso,
    workspaceId: "workspace-1",
    payload: {},
  });

  // Advance the clock by 2 days between rounds -- comfortably past MAX_BACKOFF_STEP_MS (30
  // minutes) regardless of jitter, so every round that still has retry budget reclaims the row.
  // Loop a couple of rounds past the cap to prove attempts genuinely STOP, not merely slow down.
  for (let round = 0; round < MAX_OUTBOX_ATTEMPTS + 2; round++) {
    await processOutbox({ outbox, bus, clock });
    currentIso = new Date(Date.parse(currentIso) + 2 * 24 * 60 * 60 * 1000).toISOString();
  }

  assert.equal(attemptsMade, MAX_OUTBOX_ATTEMPTS, "the handler must be invoked exactly the cap's worth of times, no more");

  // Even decades in the future, an exhausted row must never be claimed again.
  const farFuture = await outbox.claimPending(10, "2099-01-01T00:00:00.000Z");
  assert.equal(farFuture.length, 0);
});


// ---------------------------------------------------------------------------
// 2026-09-07 audit claim #6 — the retry time must be measured from the FAILURE, not from the
// instant the batch was claimed. Every other test in this file holds the clock fixed for the whole
// call, which cannot tell the two apart; this one advances it while delivery is in flight.
// ---------------------------------------------------------------------------

test("processOutbox schedules the retry from the failure instant — a slow batch never leaves nextAttemptAt in the past", async () => {
  const outbox = new InMemoryOutbox();
  await outbox.enqueue({
    id: "evt-slow",
    name: "fail.event",
    occurredAt: "2026-02-21T12:00:00.000Z",
    workspaceId: "workspace-1",
    payload: {},
  });

  // The clock advances by an hour between `claimPending` and the failure being recorded — far more
  // than the ~15s minimum backoff, so a retry anchored to the batch's own start instant lands
  // BEFORE the row is even marked, and the next tick re-claims it with no backoff at all.
  const instants = ["2026-02-21T12:00:00.000Z", "2026-02-21T13:00:00.000Z"];
  let read = 0;
  const clock = { nowIso: () => instants[Math.min(read++, instants.length - 1)]! };
  await processOutbox({ outbox, bus: alwaysFailingBus(), clock }, { random: () => 0 });

  const dueImmediately = await outbox.claimPending(10, "2026-02-21T13:00:00.000Z");
  assert.equal(dueImmediately.length, 0, "a just-failed row must not be immediately due again");

  const dueAfterBackoff = await outbox.claimPending(10, "2026-02-21T13:01:00.000Z");
  assert.equal(dueAfterBackoff.length, 1, "and it must become due once the backoff measured from the failure elapses");
});
