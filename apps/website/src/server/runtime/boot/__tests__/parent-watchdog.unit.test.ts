import assert from "node:assert/strict";
import test from "node:test";

import { startOwnParentWatchdog, type ParentWatchdogPorts } from "../parent-watchdog.js";

/**
 * @file The site server's parent watchdog, driven entirely through hand-written fakes for the
 * process-level ports: only a reparent or a confirmed (`ESRCH`) death self-terminates; every
 * inconclusive signal error is skipped; the escape hatch disables the watchdog outright.
 */

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

function fakePorts({ env = {}, ppid = 100, signal = () => {} }: {
  env?: Record<string, string | undefined>; ppid?: number; signal?: (pid: number) => void;
} = {}) {
  const state = { ppid, exits: [] as number[], logs: [] as string[], errors: [] as string[], polls: [] as { callback: () => void; ms: number }[] };
  const ports: ParentWatchdogPorts = {
    env,
    ppid: () => state.ppid,
    signalZero: signal,
    exit: (code) => void state.exits.push(code),
    log: (line) => void state.logs.push(line),
    error: (line) => void state.errors.push(line),
    setInterval: (callback, ms) => void state.polls.push({ callback, ms }),
  };
  return { ports, state };
}

test("TOVU_DISABLE_PARENT_WATCHDOG=1 disables the watchdog: no probe, no poll", () => {
  const signalled: number[] = [];
  const { ports, state } = fakePorts({ env: { TOVU_DISABLE_PARENT_WATCHDOG: "1" }, signal: (pid) => void signalled.push(pid) });
  startOwnParentWatchdog(ports);
  assert.deepEqual(state.logs, ["[index] TOVU_DISABLE_PARENT_WATCHDOG=1 — parent watchdog disabled"]);
  assert.deepEqual(signalled, []);
  assert.deepEqual(state.polls, []);
});

test("a parent already gone at boot (ESRCH) self-terminates before arming the poll", () => {
  const { ports, state } = fakePorts({ ppid: 42, signal: () => { throw errno("ESRCH"); } });
  startOwnParentWatchdog(ports);
  assert.deepEqual(state.exits, [1]);
  assert.deepEqual(state.errors, ["[index] parent process 42 was already gone before this process finished booting — self-terminating"]);
  assert.deepEqual(state.polls, []);
});

test("an inconclusive boot probe (EPERM) still arms the 3s poll, which exits on a reparent", () => {
  const { ports, state } = fakePorts({ ppid: 42, signal: () => { throw errno("EPERM"); } });
  startOwnParentWatchdog(ports);
  assert.deepEqual(state.exits, []);
  assert.equal(state.polls.length, 1);
  assert.equal(state.polls[0]!.ms, 3_000);
  state.polls[0]!.callback();
  assert.deepEqual(state.exits, [], "an unchanged parent is not a death");
  state.ppid = 1;
  state.polls[0]!.callback();
  assert.deepEqual(state.exits, [1]);
  assert.deepEqual(state.errors, ["[index] parent process 42 is gone (reparented to 1) — self-terminating"]);
});

test("an invalid TOVU_DEV_SUPERVISOR_PID is reported and that check is disabled", () => {
  for (const raw of ["abc", "0", "-3", "1.5"]) {
    const signalled: number[] = [];
    const { ports, state } = fakePorts({ env: { TOVU_DEV_SUPERVISOR_PID: raw }, signal: (pid) => void signalled.push(pid) });
    startOwnParentWatchdog(ports);
    assert.deepEqual(state.errors, [`[index] TOVU_DEV_SUPERVISOR_PID="${raw}" is not a valid pid — that check is disabled`]);
    state.polls[0]!.callback();
    assert.deepEqual(signalled, [100], `${raw}: only the boot parent probe ran; the supervisor is never signalled`);
    assert.deepEqual(state.exits, []);
  }
});

test("a dev supervisor is probed each poll: alive or inconclusive continues, confirmed ESRCH exits", () => {
  let supervisor: "alive" | "eperm" | "gone" = "alive";
  const { ports, state } = fakePorts({ env: { TOVU_DEV_SUPERVISOR_PID: "777" }, signal: (pid) => {
    if (pid !== 777) return;
    if (supervisor === "eperm") throw errno("EPERM");
    if (supervisor === "gone") throw errno("ESRCH");
  } });
  startOwnParentWatchdog(ports);
  const poll = state.polls[0]!.callback;
  poll();
  supervisor = "eperm";
  poll();
  assert.deepEqual(state.exits, [], "a live or inconclusive supervisor is never a self-kill");
  supervisor = "gone";
  poll();
  assert.deepEqual(state.exits, [1]);
  assert.deepEqual(state.errors, ["[index] dev supervisor process 777 is gone — self-terminating"]);
});
