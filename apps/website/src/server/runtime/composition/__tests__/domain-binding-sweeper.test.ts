import assert from "node:assert/strict";
import test from "node:test";

import type { WebhookDeliveryScheduler } from "../webhook-delivery-worker.js";
import {
  DOMAIN_BINDING_SWEEP_FAILED_LINE,
  DOMAIN_BINDING_SWEEP_INTERVAL_MS,
  DOMAIN_BINDING_SWEEP_LIMIT,
  DOMAIN_BINDING_SWEEP_STOP_GRACE_MS,
  DOMAIN_BINDING_SWEEP_STOP_LATE_LINE,
  startDomainBindingSweeper,
} from "../domain-binding-sweeper.js";

/**
 * @file The due-bindings DNS loop on a fake scheduler: off without a pre-bound sweep, one sweep per
 * interval with the batch limit, never two at once, failures logged (not thrown) and retried, and a
 * bounded `stop`. What a sweep checks is `dns-change-deps.test.ts`'s and `dns-changes.test.ts`'s subject.
 */

function fakeScheduler() {
  const intervals: { ms: number; run: () => void; cancelled: boolean }[] = [];
  const timeouts: { ms: number; run: () => void; cancelled: boolean }[] = [];
  const scheduler: WebhookDeliveryScheduler = {
    every: ({ ms, run }) => { const timer = { ms, run, cancelled: false }; intervals.push(timer); return { cancel: () => { timer.cancelled = true; } }; },
    after: ({ ms, run }) => { const timer = { ms, run, cancelled: false }; timeouts.push(timer); return { cancel: () => { timer.cancelled = true; } }; },
  };
  const fire = () => { for (const timer of intervals) if (!timer.cancelled) timer.run(); };
  return { scheduler, intervals, timeouts, fire };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("no pre-bound sweep: an idle handle and no timer (off by injection)", async () => {
  const clock = fakeScheduler();
  const sweeper = startDomainBindingSweeper({ sweep: undefined }, { scheduler: clock.scheduler });
  assert.equal(clock.intervals.length, 0);
  await sweeper.tick();
  await sweeper.stop();
});

test("sweeps once per interval at the default minute with the default batch limit, single flight", async () => {
  const clock = fakeScheduler();
  const limits: number[] = [];
  const gate = deferred();
  const sweeper = startDomainBindingSweeper({ sweep: async ({ limit }) => { limits.push(limit); await gate.promise; return []; } }, { scheduler: clock.scheduler, log: () => assert.fail("nothing to log") });
  assert.deepEqual(clock.intervals.map((timer) => timer.ms), [DOMAIN_BINDING_SWEEP_INTERVAL_MS]);
  assert.deepEqual(limits, [], "no sweep before the first interval");
  clock.fire();
  clock.fire();
  const direct = sweeper.tick();
  assert.deepEqual(limits, [DOMAIN_BINDING_SWEEP_LIMIT], "a running sweep is never stacked");
  gate.resolve();
  await direct;
  await sweeper.tick();
  assert.equal(limits.length, 2, "the next sweep runs once the previous one settled");
  await sweeper.stop();
  assert.equal(clock.intervals[0]!.cancelled, true);
});

test("a failed sweep is logged by name and capped message, never thrown, and the loop keeps going", async () => {
  const clock = fakeScheduler();
  const lines: string[] = [];
  let calls = 0;
  const failures: unknown[] = [new TypeError(`resolver broke ${"x".repeat(300)}`), "eio"];
  const sweeper = startDomainBindingSweeper({ sweep: async () => { calls += 1; throw failures.shift(); } }, { scheduler: clock.scheduler, intervalMs: 5, limit: 3, log: (line) => lines.push(line) });
  assert.equal(clock.intervals[0]!.ms, 5);
  await sweeper.tick();
  await sweeper.tick();
  assert.equal(calls, 2);
  assert.equal(lines[0], `${DOMAIN_BINDING_SWEEP_FAILED_LINE}: TypeError: resolver broke ${"x".repeat(185)}`);
  assert.equal(lines[1], `${DOMAIN_BINDING_SWEEP_FAILED_LINE}: a non-Error value was thrown`);
  await sweeper.stop();
});

test("stop waits a bounded grace for a running sweep, logs when it gives up, and is idempotent", async () => {
  const clock = fakeScheduler();
  const lines: string[] = [];
  const gate = deferred();
  let stopped = 0;
  const sweeper = startDomainBindingSweeper({ sweep: async () => { await gate.promise; stopped += 1; return ["example.com"]; } }, { scheduler: clock.scheduler, log: (line) => lines.push(line) });
  void sweeper.tick();
  const stopping = sweeper.stop();
  await flush();
  assert.deepEqual(clock.timeouts.map((timer) => timer.ms), [DOMAIN_BINDING_SWEEP_STOP_GRACE_MS]);
  clock.timeouts[0]!.run();
  await stopping;
  assert.deepEqual(lines, [DOMAIN_BINDING_SWEEP_STOP_LATE_LINE]);
  await sweeper.tick();
  assert.equal(stopped, 0, "no sweep starts after stop");
  gate.resolve();
  await flush();

  const quick = deferred();
  const clean = fakeScheduler();
  const second = startDomainBindingSweeper({ sweep: async () => { await quick.promise; return []; } }, { scheduler: clean.scheduler, log: (line) => lines.push(line) });
  void second.tick();
  const done = second.stop();
  quick.resolve();
  await done;
  assert.equal(clean.timeouts[0]!.cancelled, true, "the grace timer is cancelled when the sweep finishes in time");
  await second.stop();
  assert.equal(lines.length, 1);
});

test("rejects a non-positive or non-finite interval", () => {
  for (const intervalMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => startDomainBindingSweeper({ sweep: async () => [] }, { intervalMs }), RangeError);
  }
});

test("the default scheduler and log are the real unref'd timers and console.error", async (t) => {
  const errors = t.mock.method(console, "error", () => {});
  const sweeper = startDomainBindingSweeper({ sweep: async () => { throw new Error("boom"); } });
  await sweeper.tick();
  assert.equal(errors.mock.calls[0]!.arguments[0], `${DOMAIN_BINDING_SWEEP_FAILED_LINE}: Error: boom`);
  await sweeper.stop();
});
