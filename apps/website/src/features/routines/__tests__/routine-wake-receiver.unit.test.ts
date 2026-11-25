/**
 * @file Behaviour of the site child's wake receiver (`routine-wake-receiver.ts`): installed only
 * for a verified desktop-eligible serving boot, it accepts exactly the private reconcile message
 * from the parent channel, routes it to `reconcile({ reason: 'wake' }, {})`, logs a rejection
 * without throwing, and its dispose removes the listener.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { installRoutineWakeReceiver, type RoutineWakeChannel } from "../routine-wake-receiver.ts";

function fakeChannel() {
  const listeners = new Set<(message: unknown) => void>();
  const channel: RoutineWakeChannel = {
    on: (event, fn) => { assert.equal(event, "message"); listeners.add(fn); },
    off: (event, fn) => { assert.equal(event, "message"); listeners.delete(fn); },
  };
  const emit = (message: unknown) => { for (const fn of [...listeners]) fn(message); };
  return { channel, listeners, emit };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("accepts exactly { type: 'routines.reconcile', reason: 'wake' } and nothing else", async () => {
  const c = fakeChannel();
  const calls: unknown[][] = [];
  installRoutineWakeReceiver({ channel: c.channel, reconcile: async (...args) => { calls.push(args); }, eligible: true, log: () => {} });
  for (const other of [
    null, "routines.reconcile", ["routines.reconcile", "wake"], { type: "routines.reconcile" },
    { type: "routines.reconcile", reason: "timer" }, { type: "routines.reconcile", reason: "wake", extra: 1 },
    { type: "other", reason: "wake" },
  ]) c.emit(other);
  await flush();
  assert.deepEqual(calls, []);
  c.emit({ type: "routines.reconcile", reason: "wake" });
  await flush();
  assert.deepEqual(calls, [[{ reason: "wake" }, {}]]);
});

test("ineligible boot installs nothing, and its dispose is a harmless no-op", () => {
  const c = fakeChannel();
  let called = false;
  const dispose = installRoutineWakeReceiver({ channel: c.channel, reconcile: async () => { called = true; }, eligible: false, log: () => {} });
  assert.equal(c.listeners.size, 0);
  c.emit({ type: "routines.reconcile", reason: "wake" });
  dispose();
  assert.equal(called, false);
});

test("a missing parent channel (not spawned with ipc) installs nothing", () => {
  let called = false;
  const dispose = installRoutineWakeReceiver({ channel: undefined, reconcile: async () => { called = true; }, eligible: true, log: () => {} });
  assert.doesNotThrow(() => dispose());
  assert.equal(called, false);
});

test("a rejected or throwing reconcile is logged, never thrown", async () => {
  const c = fakeChannel();
  const logs: unknown[] = [];
  let mode: "reject" | "throw" | "odd" = "reject";
  installRoutineWakeReceiver({
    channel: c.channel,
    reconcile: (): Promise<void> => {
      if (mode === "throw") throw new Error("sync boom");
      return Promise.reject(mode === "odd" ? "odd" : new Error("db closed"));
    },
    eligible: true,
    log: (entry) => { logs.push(entry); },
  });
  const wake = { type: "routines.reconcile", reason: "wake" };
  c.emit(wake); await flush();
  mode = "throw"; c.emit(wake); await flush();
  mode = "odd"; c.emit(wake); await flush();
  assert.deepEqual(logs, [
    { event: "routine-wake-reconcile-failed", error: "db closed" },
    { event: "routine-wake-reconcile-failed", error: "sync boom" },
    { event: "routine-wake-reconcile-failed", error: "odd" },
  ]);
});

test("teardown: dispose removes the listener, so a later wake is ignored", async () => {
  const c = fakeChannel();
  let calls = 0;
  const dispose = installRoutineWakeReceiver({ channel: c.channel, reconcile: async () => { calls++; }, eligible: true, log: () => {} });
  assert.equal(c.listeners.size, 1);
  dispose();
  assert.equal(c.listeners.size, 0);
  c.emit({ type: "routines.reconcile", reason: "wake" });
  await flush();
  assert.equal(calls, 0);
});
