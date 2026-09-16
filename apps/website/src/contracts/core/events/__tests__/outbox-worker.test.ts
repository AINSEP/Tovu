import assert from "node:assert/strict";
import test from "node:test";

import { computeOutboxBackoffMs, InMemoryEventBus, InMemoryOutbox, MAX_OUTBOX_ATTEMPTS, processOutbox } from "../index.js";
import { DEFAULT_OUTBOX_CLAIM_LEASE_MS, DEFAULT_OUTBOX_DELIVERY_TIMEOUT_MS } from "../outbox-worker.js";

/** Copied from `outbox-drainer.test.ts:20-37` — never import test-only helpers across test files. */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(5);
  }
  return predicate();
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

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

test("the claim lease outlasts a full default batch whose every delivery runs to the delivery timeout (2026-09-14)", () => {
  // 20 is processOutbox's default batchSize. With a shorter lease a second drain could reclaim a row
  // that a live batch simply has not reached yet, and that row would be delivered twice.
  assert.equal(DEFAULT_OUTBOX_DELIVERY_TIMEOUT_MS, 60_000);
  assert.equal(DEFAULT_OUTBOX_CLAIM_LEASE_MS, 30 * 60_000);
  assert.ok(DEFAULT_OUTBOX_CLAIM_LEASE_MS > 20 * DEFAULT_OUTBOX_DELIVERY_TIMEOUT_MS);
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

// ---------------------------------------------------------------------------
// 2026-09-14 — an expired claim lease makes a `processing` row claimable again. A row whose
// claimer keeps dying (a handler that crashes the process, say) must not be reclaimed forever: past
// MAX_OUTBOX_ATTEMPTS claims it is sealed as "failed" without running its handlers again.
// ---------------------------------------------------------------------------

test("processOutbox seals a row claimed past MAX_OUTBOX_ATTEMPTS with no recorded outcome, without publishing it", async () => {
  const leaseMs = 60_000;
  const outbox = new InMemoryOutbox({ claimLeaseMs: leaseMs });
  const startIso = "2026-02-21T00:00:00.000Z";
  await outbox.enqueue({ id: "evt-crasher", name: "crash.event", occurredAt: startIso, workspaceId: "workspace-1", payload: {} });

  // MAX_OUTBOX_ATTEMPTS claimers each die mid-delivery: every claim expires without an outcome.
  let nowMs = Date.parse(startIso);
  for (let claim = 1; claim <= MAX_OUTBOX_ATTEMPTS; claim++) {
    const [row] = await outbox.claimPending(10, new Date(nowMs).toISOString());
    assert.equal(row?.attempts, claim, `claim #${claim} must reclaim the stranded row`);
    nowMs += leaseMs;
  }

  let published = 0;
  const bus = new InMemoryEventBus();
  await bus.subscribe("crash.event", async () => {
    published += 1;
  });
  const failures: Array<[string, string, string, string]> = [];
  const recordingOutbox = {
    enqueue: outbox.enqueue.bind(outbox),
    claimPending: outbox.claimPending.bind(outbox),
    markDelivered: outbox.markDelivered.bind(outbox),
    markFailed: async (id: string, error: string, nextAttemptAt: string, nextStatus: "pending" | "failed") => {
      failures.push([id, error, nextAttemptAt, nextStatus]);
      return outbox.markFailed(id, error, nextAttemptAt, nextStatus);
    },
  };
  const sealIso = new Date(nowMs).toISOString();

  const processed = await processOutbox({ outbox: recordingOutbox, bus, clock: { nowIso: () => sealIso } });

  assert.equal(processed, 1);
  assert.equal(published, 0, "a row that already had its full attempt budget must not run its handlers again");
  assert.deepEqual(failures, [
    ["evt-crasher", `claimed ${MAX_OUTBOX_ATTEMPTS + 1} times; the last claim expired with no recorded outcome (its claimer likely died mid-delivery)`, sealIso, "failed"],
  ]);
  assert.equal((await outbox.claimPending(10, "2099-01-01T00:00:00.000Z")).length, 0);
});

// ---------------------------------------------------------------------------
// 2026-09-14 — a handler that never settles must not stall processOutbox, and with it the
// background drainer and every inline route drain. Each delivery gets a bounded time; one that runs
// out is recorded as a retryable failure and is never marked delivered.
// ---------------------------------------------------------------------------

test("processOutbox gives up on a delivery whose handler never settles, records the timeout and defers its retry to the claim-lease horizon, and delivers the row behind it", async (t) => {
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  let releaseStuckHandler = () => {};
  const stuck = new Promise<void>((resolve) => {
    releaseStuckHandler = resolve;
  });
  t.after(() => releaseStuckHandler());
  const handled: string[] = [];
  await bus.subscribe("stuck.event", () => stuck);
  await bus.subscribe("ok.event", async (event) => {
    handled.push(event.id);
  });
  const nowIso = "2026-02-21T12:00:00.000Z";
  await outbox.enqueue({ id: "evt-stuck", name: "stuck.event", occurredAt: nowIso, workspaceId: "workspace-1", payload: {} });
  await outbox.enqueue({ id: "evt-ok", name: "ok.event", occurredAt: nowIso, workspaceId: "workspace-1", payload: {} });
  const delivered: string[] = [];
  const failures: Array<[string, string, string, string]> = [];
  const recordingOutbox = {
    enqueue: outbox.enqueue.bind(outbox),
    claimPending: outbox.claimPending.bind(outbox),
    markDelivered: async (id: string) => {
      delivered.push(id);
      return outbox.markDelivered(id);
    },
    markFailed: async (id: string, error: string, nextAttemptAt: string, nextStatus: "pending" | "failed") => {
      failures.push([id, error, nextAttemptAt, nextStatus]);
      return outbox.markFailed(id, error, nextAttemptAt, nextStatus);
    },
  };
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  const stalled = new Promise<"stalled">((resolve) => {
    stallTimer = setTimeout(() => resolve("stalled"), 2_000);
  });
  t.after(() => clearTimeout(stallTimer));

  const outcome = await Promise.race([
    processOutbox({ outbox: recordingOutbox, bus, clock: { nowIso: () => nowIso } }, { deliveryTimeoutMs: 20, random: () => 0 }),
    stalled,
  ]);

  assert.equal(outcome, 2, "processOutbox stalled behind a handler that never settles");
  assert.deepEqual({ handled, delivered }, { handled: ["evt-ok"], delivered: ["evt-ok"] });
  const retryAt = new Date(Date.parse(nowIso) + DEFAULT_OUTBOX_CLAIM_LEASE_MS).toISOString();
  assert.deepEqual(failures, [
    ["evt-stuck", 'delivery of outbox event "stuck.event" (evt-stuck) timed out after 20ms', retryAt, "pending"],
  ]);
});

// ---------------------------------------------------------------------------
// 2026-09-16 — an overrunning delivery must not be published again while its own handler is still
// running: the claim lease exists precisely to stop that (see this file's `DEFAULT_OUTBOX_CLAIM_LEASE_MS`
// doc), but the timeout path previously undid it by scheduling the retry at the ordinary backoff.
// ---------------------------------------------------------------------------

test("an overrunning delivery is not published again while its handler still runs, and its late success marks the row delivered", async (t) => {
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const gate = deferred();
  t.after(() => gate.resolve());
  let runs = 0;
  await bus.subscribe("slow.event", async () => {
    runs += 1;
    await gate.promise;
  });
  const startIso = "2026-02-21T12:00:00.000Z";
  await outbox.enqueue({ id: "evt-slow", name: "slow.event", occurredAt: startIso, workspaceId: "workspace-1", payload: {} });
  const delivered: string[] = [];
  const wrapped = {
    enqueue: outbox.enqueue.bind(outbox),
    claimPending: outbox.claimPending.bind(outbox),
    markDelivered: async (id: string) => {
      delivered.push(id);
      return outbox.markDelivered(id);
    },
    markFailed: outbox.markFailed.bind(outbox),
  };

  const first = await processOutbox({ outbox: wrapped, bus, clock: { nowIso: () => startIso } }, { deliveryTimeoutMs: 20, random: () => 0 });
  assert.equal(first, 1);

  // 31s later: comfortably past the old ~15-30s backoff retry window, comfortably inside the new
  // 30-minute claim-lease horizon.
  const laterIso = new Date(Date.parse(startIso) + computeOutboxBackoffMs(1, { random: () => 1 }) + 1_000).toISOString();
  const again = await processOutbox({ outbox: wrapped, bus, clock: { nowIso: () => laterIso } }, { deliveryTimeoutMs: 20 });
  assert.equal(again, 0, "the row must not be due again while its first handler is still running");
  assert.equal(runs, 1, "the handler was started again while its first run was still going");

  gate.resolve();
  assert.ok(await waitFor(() => delivered.length === 1), "the late success was never recorded");
  assert.deepEqual(delivered, ["evt-slow"]);
  assert.equal((await outbox.claimPending(10, "2099-01-01T00:00:00.000Z")).length, 0);
});

test("an overrunning delivery whose handler later rejects is recorded as a normal backed-off failure after the timeout record", async (t) => {
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const gate = deferred();
  t.after(() => gate.resolve());
  await bus.subscribe("late.event", async () => {
    await gate.promise;
    throw new Error("late handler failure");
  });
  const nowIso = "2026-02-21T12:00:00.000Z";
  await outbox.enqueue({ id: "evt-late", name: "late.event", occurredAt: nowIso, workspaceId: "workspace-1", payload: {} });
  const failures: Array<[string, string, string, string]> = [];
  const wrapped = {
    enqueue: outbox.enqueue.bind(outbox),
    claimPending: outbox.claimPending.bind(outbox),
    markDelivered: outbox.markDelivered.bind(outbox),
    markFailed: async (id: string, error: string, nextAttemptAt: string, nextStatus: "pending" | "failed") => {
      failures.push([id, error, nextAttemptAt, nextStatus]);
      return outbox.markFailed(id, error, nextAttemptAt, nextStatus);
    },
  };

  await processOutbox({ outbox: wrapped, bus, clock: { nowIso: () => nowIso } }, { deliveryTimeoutMs: 20, random: () => 0 });
  gate.resolve();
  assert.ok(await waitFor(() => failures.length === 2), "the late failure was never recorded");

  assert.deepEqual(failures, [
    ["evt-late", 'delivery of outbox event "late.event" (evt-late) timed out after 20ms', new Date(Date.parse(nowIso) + DEFAULT_OUTBOX_CLAIM_LEASE_MS).toISOString(), "pending"],
    ["evt-late", "late handler failure", new Date(Date.parse(nowIso) + computeOutboxBackoffMs(1, { random: () => 0 })).toISOString(), "pending"],
  ]);
});

test("a publish that settles while the timeout is being recorded is still written last, so the row ends delivered", async (t) => {
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const gate = deferred();
  t.after(() => gate.resolve());
  await bus.subscribe("slow.event", async () => {
    await gate.promise;
  });
  const nowIso = "2026-02-21T12:00:00.000Z";
  await outbox.enqueue({ id: "evt-slow", name: "slow.event", occurredAt: nowIso, workspaceId: "workspace-1", payload: {} });
  const writes: string[] = [];
  const wrapped = {
    enqueue: outbox.enqueue.bind(outbox),
    claimPending: outbox.claimPending.bind(outbox),
    markDelivered: async (id: string) => {
      writes.push("delivered");
      return outbox.markDelivered(id);
    },
    markFailed: async (id: string, error: string, nextAttemptAt: string, nextStatus: "pending" | "failed") => {
      // Lets the handler finish (and the publish settle) while the timeout record is still in
      // flight, so a correct implementation must not attach the late recorder until AFTER this
      // write settles.
      gate.resolve();
      await sleep(30);
      writes.push("failed");
      return outbox.markFailed(id, error, nextAttemptAt, nextStatus);
    },
  };

  await processOutbox({ outbox: wrapped, bus, clock: { nowIso: () => nowIso } }, { deliveryTimeoutMs: 20 });
  assert.ok(await waitFor(() => writes.length === 2), "the late delivered write was never recorded");

  assert.deepEqual(writes, ["failed", "delivered"]);
  assert.equal((await outbox.claimPending(10, "2099-01-01T00:00:00.000Z")).length, 0);
});

test("a late outcome that cannot be recorded is reported, not thrown as an unhandled rejection", async (t) => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };
  process.on("unhandledRejection", onUnhandled);
  t.after(() => {
    process.off("unhandledRejection", onUnhandled);
  });
  const errors = t.mock.method(console, "error", () => {});

  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const gate = deferred();
  t.after(() => gate.resolve());
  await bus.subscribe("late.event", async () => {
    await gate.promise;
  });
  const nowIso = "2026-02-21T12:00:00.000Z";
  await outbox.enqueue({ id: "evt-late", name: "late.event", occurredAt: nowIso, workspaceId: "workspace-1", payload: {} });
  let markFailedCalls = 0;
  const wrapped = {
    enqueue: outbox.enqueue.bind(outbox),
    claimPending: outbox.claimPending.bind(outbox),
    markDelivered: async () => {
      throw new Error("db locked");
    },
    markFailed: async (id: string, error: string, nextAttemptAt: string, nextStatus: "pending" | "failed") => {
      markFailedCalls += 1;
      // The first call is the timeout record itself, which must succeed so the drain is never
      // stalled. Only the LATE write (after the handler settles) is made to fail here.
      if (markFailedCalls === 1) return outbox.markFailed(id, error, nextAttemptAt, nextStatus);
      throw new Error("db locked");
    },
  };

  await processOutbox({ outbox: wrapped, bus, clock: { nowIso: () => nowIso } }, { deliveryTimeoutMs: 20 });
  gate.resolve();
  assert.ok(await waitFor(() => errors.mock.callCount() === 1), "the unrecordable late outcome was never reported");

  assert.deepEqual(unhandled, []);
  assert.equal(errors.mock.calls[0].arguments[0], '[outbox-worker] could not record the late outcome of outbox event "late.event" (evt-late)');
});

test("a handler that rejects after its delivery timed out surfaces no unhandled rejection", async (t) => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };
  process.on("unhandledRejection", onUnhandled);
  t.after(() => {
    process.off("unhandledRejection", onUnhandled);
  });
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  await bus.subscribe(
    "late.event",
    () =>
      new Promise<void>((_resolve, reject) => {
        setTimeout(() => reject(new Error("late handler failure")), 40);
      })
  );
  const nowIso = "2026-02-21T12:00:00.000Z";
  await outbox.enqueue({ id: "evt-late", name: "late.event", occurredAt: nowIso, workspaceId: "workspace-1", payload: {} });

  await processOutbox({ outbox, bus, clock: { nowIso: () => nowIso } }, { deliveryTimeoutMs: 10 });
  await new Promise((resolve) => setTimeout(resolve, 80));

  assert.deepEqual(unhandled, []);
});
