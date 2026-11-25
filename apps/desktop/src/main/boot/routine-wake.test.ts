/**
 * @file Behaviour of the wake relay (`routine-wake.ts`): a debounced `resume` sends at most one
 * private reconcile per running OWNED site, never to an attached or non-IPC handle, and its
 * dispose removes both the listener and any pending timer.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRoutineReconcileSender, relayWake, type RoutineWakeLogEntry, type RoutineWakeSiteHandle, type WakeTimers } from "./routine-wake.ts";

function harness(handles: RoutineWakeSiteHandle[]) {
  const listeners = new Map<string, Set<() => void>>();
  const powerMonitor = {
    on: (event: "resume", fn: () => void) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event)?.add(fn); },
    removeListener: (event: "resume", fn: () => void) => { listeners.get(event)?.delete(fn); },
  };
  let nextId = 0;
  const pending = new Map<number, { fn: () => void; ms: number }>();
  const timers: WakeTimers = {
    setTimeout: (fn, ms) => { const id = ++nextId; pending.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => { pending.delete(id as number); },
  };
  const fire = () => { for (const [id, t] of [...pending]) { pending.delete(id); t.fn(); } };
  const resume = () => { for (const fn of [...(listeners.get("resume") ?? [])]) fn(); };
  const logs: RoutineWakeLogEntry[] = [];
  const dispose = relayWake({ powerMonitor, ownedRunningSites: () => handles, timers, log: (e) => { logs.push(e); } });
  return { listeners, pending, fire, resume, logs, dispose };
}

function owned(siteDir: string, sent: string[]) {
  return { siteDir, owned: true, sendRoutineReconcile: (message: { reason: "wake" }) => { sent.push(`${siteDir}:${message.reason}`); } };
}

test("resume relays one reconcile to each running owned site", () => {
  const sent: string[] = [];
  const h = harness([owned("/a", sent), owned("/b", sent)]);
  h.resume();
  assert.deepEqual(sent, [], "nothing is sent before the debounce elapses");
  assert.deepEqual([...h.pending.values()].map((t) => t.ms), [2_000]);
  h.fire();
  assert.deepEqual(sent, ["/a:wake", "/b:wake"]);
});

test("debounce: a burst of resumes sends once per site; a duplicate handle is still sent once", () => {
  const sent: string[] = [];
  const a = owned("/a", sent);
  const h = harness([a, a]);
  h.resume(); h.resume(); h.resume();
  assert.equal(h.pending.size, 1, "each resume replaces the pending timer");
  h.fire();
  assert.deepEqual(sent, ["/a:wake"]);
  h.resume(); h.fire();
  assert.deepEqual(sent, ["/a:wake", "/a:wake"], "a later, separate wake relays again");
});

test("an attached process or a handle without the IPC send method is never sent to", () => {
  const sent: string[] = [];
  const attached = { ...owned("/attached", sent), owned: false };
  const noIpc: RoutineWakeSiteHandle = { siteDir: "/no-ipc", owned: true };
  const h = harness([attached, noIpc, owned("/a", sent)]);
  h.resume(); h.fire();
  assert.deepEqual(sent, ["/a:wake"]);
});

test("a send that throws is logged and does not stop the other sites", () => {
  const sent: string[] = [];
  const broken = { siteDir: "/closed", owned: true, sendRoutineReconcile: () => { throw new Error("channel closed"); } };
  const odd = { siteDir: "/odd", owned: true, sendRoutineReconcile: () => { throw "gone"; } };
  const h = harness([broken, odd, owned("/a", sent)]);
  h.resume(); h.fire();
  assert.deepEqual(sent, ["/a:wake"]);
  assert.deepEqual(h.logs, [
    { event: "routine-wake-send-failed", siteDir: "/closed", error: "channel closed" },
    { event: "routine-wake-send-failed", siteDir: "/odd", error: "gone" },
  ]);
});

test("listener teardown: dispose removes the resume listener and the pending timer", () => {
  const sent: string[] = [];
  const h = harness([owned("/a", sent)]);
  assert.equal(h.listeners.get("resume")?.size, 1);
  h.resume();
  h.dispose();
  assert.equal(h.listeners.get("resume")?.size, 0);
  assert.equal(h.pending.size, 0);
  h.resume(); h.fire();
  assert.deepEqual(sent, []);
  h.dispose();
});

test("the owned handle's sender writes exactly the reconcile message on a connected ipc channel", () => {
  const sent: unknown[] = [];
  let failSend = false;
  const child = {
    connected: true,
    send: (message: unknown, callback: (error: Error | null) => void) => {
      sent.push(message);
      callback(failSend ? new Error("EPIPE") : null);
      return true;
    },
  };
  const send = createRoutineReconcileSender({ child });
  send({ reason: "wake" });
  assert.deepEqual(sent, [{ type: "routines.reconcile", reason: "wake" }]);
  failSend = true;
  send({ reason: "wake" });
  assert.equal(sent.length, 2, "an asynchronous send failure is tolerated, never thrown into the relay");
  child.connected = false;
  assert.throws(() => send({ reason: "wake" }), /ipc channel is closed/);
  assert.equal(sent.length, 2);
  assert.throws(() => createRoutineReconcileSender({ child: { connected: true } })({ reason: "wake" }), /ipc channel is closed/);
});
