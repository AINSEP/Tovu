import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { armDesktopRoutines, type DesktopRoutinesDeps } from "./routine-desktop.ts";

function fixture(releaseEnabled: boolean) {
  const powerMonitor = new EventEmitter();
  const pending = new Map<object, { run: () => void; ms: number }>();
  const reads: { siteDir: string }[] = [], starts: { siteDir: string }[] = [];
  const wakes: unknown[][] = [];
  const logs: unknown[] = [];
  let registrations = 0;
  const required: DesktopRoutinesDeps = {
    releaseEnabled, powerMonitor,
    registeredSites: async () => { registrations++; return [{ siteDir: "/sites/shop" }]; },
    readBeacon: async (input) => { reads.push(input); return { v: 1, enabled: 2, updatedAt: 1 }; },
    backgroundStart: async (input) => { starts.push(input); },
    isRunning: () => false, isWithdrawn: () => false,
    ownedRunningSites: () => starts.map(({ siteDir }) => ({
      siteDir, owned: true, sendRoutineReconcile: (...args) => { wakes.push([siteDir, ...args]); },
    })),
    timers: {
      setTimeout: (run, ms) => { const id = {}; pending.set(id, { run, ms }); return id; },
      clearTimeout: (id) => {
        assert.equal(typeof id, "object");
        assert.equal(pending.delete(id as object), true);
      },
    },
    log: (entry) => logs.push(entry),
  };
  const flush = () => { for (const [id, { run }] of pending) { pending.delete(id); run(); } };
  return { required, powerMonitor, pending, reads, starts, wakes, logs, registrations: () => registrations, flush };
}

test("a disabled release neither reads the registry nor subscribes to wake", async () => {
  const f = fixture(false);
  const armed = armDesktopRoutines(f.required);
  assert.deepEqual(await armed.booted, { started: [] });
  assert.equal(f.registrations(), 0);
  assert.equal(f.powerMonitor.emit("resume"), false);
  armed.dispose();
  assert.deepEqual([f.reads, f.starts, f.wakes, f.logs, [...f.pending]], [[], [], [], [], []]);
});

test("routine boot starts a registered site and quit cancels its pending wake relay", async () => {
  const f = fixture(true);
  const armed = armDesktopRoutines(f.required);
  assert.deepEqual(await armed.booted, { started: ["/sites/shop"] });
  assert.equal(f.registrations(), 1);
  assert.deepEqual(f.reads, [{ siteDir: "/sites/shop" }]);
  assert.deepEqual(f.starts, [{ siteDir: "/sites/shop" }]);
  assert.equal(f.powerMonitor.emit("resume"), true);
  assert.deepEqual([...f.pending.values()].map(({ ms }) => ms), [2_000]);
  assert.deepEqual(f.wakes, []);
  f.flush();
  assert.deepEqual(f.wakes, [["/sites/shop", { reason: "wake" }, {}]]);
  f.powerMonitor.emit("resume");
  armed.dispose();
  assert.equal(f.powerMonitor.emit("resume"), false);
  assert.equal(f.pending.size, 0);
  f.flush();
  assert.deepEqual(f.wakes, [["/sites/shop", { reason: "wake" }, {}]]);
  assert.deepEqual(f.logs, []);
});
