/**
 * @file `startVisibleInterval` — the Projects grid's poll must not tick while the window is hidden
 * (minimized, another Space, fully covered), and must catch up the moment it is shown again.
 * Driven with a fake document and fake timers, so no DOM or clock is needed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";

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

// Execute the real polling hook's effect with only React and IPC boundaries supplied.
test("the projects polling hook schedules its listSites callback every 4000ms", async () => {
  const text = fs.readFileSync(new URL("./App.hooks.ts", import.meta.url), "utf8");
  const sf = ts.createSourceFile("App.hooks.ts", text, ts.ScriptTarget.Latest, true);
  const node = sf.statements.find((stmt) => ts.isFunctionDeclaration(stmt) && stmt.name?.text === "useSitesPolling");
  assert.ok(node);
  const js = ts.transpile(node.getText(sf).replace(/^export /, ""), { target: ts.ScriptTarget.ES2022 });
  let calls = 0;
  let poll: (() => void) | undefined;
  let cleanup: (() => void) | undefined;
  let stopped = false;
  const hook = new Function("useState", "useEffect", "runnerInventoryBridge", "startVisibleInterval", `${js}; return useSitesPolling;`)(
    (initial: unknown) => [initial, () => {}],
    (effect: () => () => void) => { cleanup = effect(); },
    () => ({ listSites: async () => { calls++; return []; } }),
    (tick: () => void, period: number) => { assert.equal(period, 4000); poll = tick; return () => { stopped = true; }; },
  );
  hook();
  assert.equal(calls, 1, "initial load");
  assert.ok(poll);
  poll();
  assert.equal(calls, 2, "the interval callback loads projects");
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(cleanup);
  cleanup();
  assert.equal(stopped, true);
});
