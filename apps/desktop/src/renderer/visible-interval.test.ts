/**
 * @file `startVisibleInterval` — the Projects grid's poll must not tick while the window is hidden
 * (minimized, another Space, fully covered), and must catch up the moment it is shown again.
 * Driven with a fake document and fake timers, so no DOM or clock is needed. That the projects
 * poll actually runs on it — every 4000 ms, an initial load, a stop on unmount — is rendered from
 * the real hook in `use-sites-inventory.hooks.render.test.ts` (`useSitesPolling`).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { startVisibleInterval } from "./visible-interval.js";
import type { IntervalTimers, VisibilitySource } from "./visible-interval.js";

function fakeDocument(initial: DocumentVisibilityState): VisibilitySource & {
  set: (state: DocumentVisibilityState) => void;
  listenerCount: () => number;
} {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get visibilityState() {
      return state;
    },
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    set(next) {
      state = next;
      for (const listener of [...listeners]) listener();
    },
    listenerCount: () => listeners.size,
  };
}

function fakeTimers(): IntervalTimers & { running: () => number; fire: () => void; periods: number[] } {
  const active = new Map<number, () => void>();
  let next = 1;
  const periods: number[] = [];
  return {
    periods,
    setInterval: (callback, ms) => {
      periods.push(ms);
      active.set(next, callback);
      return next++;
    },
    clearInterval: (handle) => {
      active.delete(handle as number);
    },
    running: () => active.size,
    fire: () => {
      for (const callback of [...active.values()]) callback();
    },
  };
}

test("ticks on its period while the window is visible", () => {
  const doc = fakeDocument("visible");
  const timers = fakeTimers();
  let ticks = 0;
  startVisibleInterval(() => ticks++, 4000, doc, timers);
  assert.equal(timers.running(), 1);
  assert.deepEqual(timers.periods, [4000]);
  timers.fire();
  timers.fire();
  assert.equal(ticks, 2);
});

test("stops its timer when the window is hidden", () => {
  const doc = fakeDocument("visible");
  const timers = fakeTimers();
  let ticks = 0;
  startVisibleInterval(() => ticks++, 4000, doc, timers);
  doc.set("hidden");
  assert.equal(timers.running(), 0);
  timers.fire();
  assert.equal(ticks, 0);
});

test("starts with no timer when the window is already hidden", () => {
  const doc = fakeDocument("hidden");
  const timers = fakeTimers();
  startVisibleInterval(() => {}, 4000, doc, timers);
  assert.equal(timers.running(), 0);
});

test("ticks at once and resumes when the window is shown again", () => {
  const doc = fakeDocument("visible");
  const timers = fakeTimers();
  let ticks = 0;
  startVisibleInterval(() => ticks++, 4000, doc, timers);
  doc.set("hidden");
  doc.set("visible");
  assert.equal(ticks, 1, "a shown window catches up without waiting a whole period");
  assert.equal(timers.running(), 1);
  doc.set("visible");
  assert.equal(timers.running(), 1, "a repeated visible event does not stack a second timer");
});

test("the returned stop clears the timer and the listener", () => {
  const doc = fakeDocument("visible");
  const timers = fakeTimers();
  let ticks = 0;
  const stop = startVisibleInterval(() => ticks++, 4000, doc, timers);
  stop();
  assert.equal(timers.running(), 0);
  assert.equal(doc.listenerCount(), 0);
  doc.set("hidden");
  doc.set("visible");
  assert.equal(ticks, 0);
});

test("the default timers are the real global interval: it ticks, and stop clears it", async () => {
  const doc = fakeDocument("visible");
  let ticks = 0;
  const stop = startVisibleInterval(() => { ticks += 1; }, 5, doc);
  await new Promise((resolve) => setTimeout(resolve, 40));
  stop();
  const afterStop = ticks;
  assert.ok(afterStop >= 1, `expected the real interval to tick, got ${afterStop}`);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(ticks, afterStop, "a stopped interval never ticks again");
});
