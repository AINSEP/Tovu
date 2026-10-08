import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { startSubmissionIpExpirySweep, SUBMISSION_IP_SWEEP_INTERVAL_MS } from "../submission-ip-expiry-sweep.js";
type SubmissionIpSweep = typeof import("@jini-ai/cms/forms").sweepExpiredSubmissionIps;

/** Owner retention decision 2026-10-04 / DR-002: prove boot, daily ticks and shutdown behavior. */
// Supplied sweeps here never use their repo: database effects have a separate dialect suite.
const kernel = { dialect: "sqlite" } as ContentKernel;
const turn = () => new Promise<void>(resolve => setImmediate(resolve));

function interval(t: TestContext) {
  let tick: (() => void) | undefined;
  let delay: number | undefined;
  let unrefs = 0;
  let clears = 0;
  const handle = { unref() { unrefs++; } };
  t.mock.method(globalThis, "setInterval", (run: () => void, ms: number) => {
    assert.equal(tick, undefined, "register one timer only");
    tick = run;
    delay = ms;
    return handle;
  });
  t.mock.method(globalThis, "clearInterval", (timer: unknown) => { assert.equal(timer, handle); clears++; });
  return {
    tick() { assert.ok(tick); tick(); },
    get delay() { return delay; }, get unrefs() { return unrefs; }, get clears() { return clears; },
  };
}

test("starts exactly one boot pass, schedules daily, and stops future ticks", async t => {
  const timer = interval(t);
  const times: number[] = [];
  let now = 123;
  const sweep: SubmissionIpSweep = async required => { times.push(required.now); return 0; };
  const stop = startSubmissionIpExpirySweep({ kernel, sweep }, { now: () => now });
  try {
    assert.deepEqual(times, [123], "boot runs immediately and exactly once");
    assert.equal(SUBMISSION_IP_SWEEP_INTERVAL_MS, 24 * 60 * 60 * 1000);
    assert.equal(timer.delay, 24 * 60 * 60 * 1000);
    assert.equal(timer.unrefs, 1);
    await turn();
    now = 456;
    timer.tick();
    await turn();
    assert.deepEqual(times, [123, 456]);
  } finally { await stop(); }
  timer.tick();
  assert.deepEqual(times, [123, 456], "a queued tick after stop cannot start a pass");
  assert.equal(timer.clears, 1);
  await stop();
});

test("skips overlapping ticks; stop waits for a running pass", async t => {
  const timer = interval(t);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const stop = startSubmissionIpExpirySweep({ kernel, sweep: async () => { calls++; await held; return 0; } });
  timer.tick();
  timer.tick();
  assert.equal(calls, 1);
  let stopped = false;
  const stopping = stop().then(() => { stopped = true; });
  await turn();
  assert.equal(stopped, false);
  release();
  await stopping;
  assert.equal(stopped, true);
  assert.equal(calls, 1);
});

test("sync errors, rejected sweeps and throwing reporters stay contained; later ticks retry", async t => {
  const timer = interval(t);
  const failure = new Error("locked");
  const errors: unknown[] = [];
  let calls = 0;
  const sweep: SubmissionIpSweep = () => {
    calls++;
    if (calls === 1) throw failure;
    if (calls === 2) return Promise.reject(failure);
    return Promise.resolve(0);
  };
  const stop = startSubmissionIpExpirySweep({ kernel, sweep }, {
    onError(error) { errors.push(error); throw new Error("logger failed"); },
  });
  try {
    await turn();
    timer.tick();
    await turn();
    timer.tick();
    await turn();
    assert.equal(calls, 3);
    assert.deepEqual(errors, [failure, failure]);
  } finally { await stop(); }
});

test("a failed clock is warned and a later tick retries", async t => {
  const timer = interval(t);
  const failure = new Error("clock failed");
  const errors: unknown[] = [];
  let clockCalls = 0;
  let sweepCalls = 0;
  const stop = startSubmissionIpExpirySweep({ kernel, sweep: async () => { sweepCalls++; return 0; } }, {
    now: () => { if (++clockCalls === 1) throw failure; return 123; },
    onError: error => { errors.push(error); },
  });
  try {
    await turn();
    timer.tick();
    await turn();
    assert.equal(sweepCalls, 1);
    assert.deepEqual(errors, [failure]);
  } finally { await stop(); }
});

test("an old published package warns once and registers no timer", async t => {
  const get = Reflect.get;
  t.mock.method(Reflect, "get", (target: object, key: PropertyKey) => key === "sweepExpiredSubmissionIps" ? undefined : get(target, key));
  let registrations = 0;
  t.mock.method(globalThis, "setInterval", () => { registrations++; throw new Error("unexpected timer"); });
  const errors: unknown[] = [];
  const stop = startSubmissionIpExpirySweep({ kernel }, { onError: error => { errors.push(error); } });
  await stop();
  assert.equal(registrations, 0);
  assert.equal(errors.length, 1);
  assert.match(String(errors[0]), /disabled: published @jini-ai\/cms-forms has no sweepExpiredSubmissionIps/);
});
