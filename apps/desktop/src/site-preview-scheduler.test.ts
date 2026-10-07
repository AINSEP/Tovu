/** Behavioral contract for P1 in e2e-0112-packaged/fix-spec-and-decision.md.
 * Fake timer and capture ports exercise the policy without Electron, servers or real waits. */
import test from "node:test";
import assert from "node:assert/strict";
import { createSitePreviewScheduler, type PreviewTarget } from "./site-preview-scheduler.ts";

const SITE = "/scratch/site";
function harness() {
  let now = 0;
  let nextTimer = 0;
  const timers = new Map<number, { work: () => void; at: number }>();
  const targets = new Map<string, PreviewTarget>([[SITE, { port: 8123, partition: "persist:site" }]]);
  const captures: Array<PreviewTarget & { siteDir: string }> = [];
  let capture: (input: PreviewTarget & { siteDir: string }) => Promise<boolean> = async () => true;
  const scheduler = createSitePreviewScheduler<number>({ ports: {
    current: ({ siteDir }) => targets.get(siteDir),
    capture: (input) => { captures.push(input); return capture(input); },
    schedule: ({ work, delayMs }) => { const timer = ++nextTimer; timers.set(timer, { work, at: now + delayMs }); return timer; },
    cancel: ({ timer }) => { timers.delete(timer); },
  } }, {});
  return {
    scheduler, targets, captures, timers,
    setCapture(fn: typeof capture) { capture = fn; },
    async tick(ms: number) {
      now += ms;
      for (const [id, timer] of timers) {
        if (timer.at > now) continue;
        timers.delete(id);
        timer.work();
      }
      // Flush the injected async capture and the scheduler's completion continuation.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

test("P1: debounce reserves once and resolves the current port/partition when it fires", async () => {
  const h = harness();
  h.scheduler.schedule({ siteDir: SITE }, {});
  h.scheduler.schedule({ siteDir: SITE }, {});
  assert.equal(h.timers.size, 1);
  await h.tick(1499);
  assert.deepEqual(h.captures, []);
  h.targets.set(SITE, { port: 9000, partition: "persist:current" });
  await h.tick(1);
  assert.deepEqual(h.captures, [{ siteDir: SITE, port: 9000, partition: "persist:current" }]);
  h.scheduler.schedule({ siteDir: SITE }, {});
  assert.equal(h.timers.size, 0, "success reserves the current lifecycle");
});

test("P1: a site no longer running when the timer fires is skipped and can be started later", async () => {
  const h = harness();
  h.scheduler.schedule({ siteDir: SITE }, {});
  h.targets.delete(SITE);
  await h.tick(1500);
  assert.equal(h.captures.length, 0);
  h.targets.set(SITE, { port: 9001, partition: "persist:site" });
  h.scheduler.schedule({ siteDir: SITE }, {});
  await h.tick(1500);
  assert.equal(h.captures[0]?.port, 9001);
});

test("P1: stop cancels the pending debounce without a hidden navigation", async () => {
  const h = harness();
  h.scheduler.schedule({ siteDir: SITE }, {});
  h.scheduler.cancel({ siteDir: SITE }, {});
  h.targets.delete(SITE);
  assert.equal(h.timers.size, 0);
  await h.tick(20_000);
  assert.deepEqual(h.captures, []);
});

test("P1: restart within the debounce cancels the old work and captures only the new port", async () => {
  const h = harness();
  h.scheduler.schedule({ siteDir: SITE }, {});
  await h.tick(1000);
  h.scheduler.cancel({ siteDir: SITE }, {});
  h.targets.set(SITE, { port: 9002, partition: "persist:site" });
  h.scheduler.schedule({ siteDir: SITE }, {});
  await h.tick(500);
  assert.equal(h.captures.length, 0);
  await h.tick(1000);
  assert.deepEqual(h.captures.map((capture) => capture.port), [9002]);
});

test("P1: restart after a successful capture re-arms the lifecycle reservation", async () => {
  const h = harness();
  h.scheduler.schedule({ siteDir: SITE }, {});
  await h.tick(1500);
  h.scheduler.cancel({ siteDir: SITE }, {});
  h.targets.set(SITE, { port: 9003, partition: "persist:site" });
  h.scheduler.schedule({ siteDir: SITE }, {});
  await h.tick(1500);
  assert.deepEqual(h.captures.map((capture) => capture.port), [8123, 9003]);
});

test("P1: false and rejected capture results both permit a later successful capture", async () => {
  for (const failure of [async () => false, async () => { throw new Error("load failed"); }]) {
    const h = harness();
    h.setCapture(failure);
    h.scheduler.schedule({ siteDir: SITE }, {});
    await h.tick(1500);
    h.setCapture(async () => true);
    h.scheduler.schedule({ siteDir: SITE }, {});
    await h.tick(1500);
    assert.equal(h.captures.length, 2);
    h.scheduler.schedule({ siteDir: SITE }, {});
    assert.equal(h.timers.size, 0);
  }
});

test("P1: an old in-flight failure cannot erase the replacement lifecycle's reservation", async () => {
  const h = harness();
  let finishOld!: (result: boolean) => void;
  h.setCapture(() => new Promise<boolean>((resolve) => { finishOld = resolve; }));
  h.scheduler.schedule({ siteDir: SITE }, {});
  await h.tick(1500);
  h.scheduler.cancel({ siteDir: SITE }, {});
  h.targets.set(SITE, { port: 9004, partition: "persist:site" });
  h.setCapture(async () => true);
  h.scheduler.schedule({ siteDir: SITE }, {});
  finishOld(false);
  await h.tick(1500);
  h.scheduler.schedule({ siteDir: SITE }, {});
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.captures.map((capture) => capture.port), [8123, 9004]);
});
