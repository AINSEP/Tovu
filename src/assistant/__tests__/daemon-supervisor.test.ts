import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { getReadinessSnapshot, clearAssistantDaemonFailure, setReadinessSnapshot } from "../../server/readiness-state";
import { createDaemonSupervisor } from "../daemon-supervisor";
import type { SpawnedDaemonProcess } from "../daemon-supervisor";
import { createRespawnPolicy } from "../daemon-respawn-policy";
import { AGENT_DAEMON_EXIT_CODE } from "../daemon-exit-codes";

/**
 * @file Proves the automatic-respawn wiring in `daemon-supervisor.ts` against a fake daemon
 * process — no real OS process is ever spawned here (`createFakeDaemonProcess` below is a plain
 * `EventEmitter`). Backoff/crash-loop DECISIONS are proven exhaustively in
 * `daemon-respawn-policy.test.ts`; this file only proves the wiring: an unexpected exit reaches
 * the policy and gets acted on, a deliberate shutdown does not, and the manual restart seam works.
 * Real (tiny) `setTimeout` delays are used rather than a fake clock — every backoff override here
 * is single-digit milliseconds, so this stays fast without needing timer-mocking machinery.
 */

// Astronomically larger than any real OS pid, so `process.kill(-pid, ...)` inside
// `killCurrentChild` reliably throws ESRCH and falls through to the fake's own `.kill()` below,
// instead of this test process ever sending a real signal to a real process group.
const FAKE_PID = 987_654_321;

function createFakeDaemonProcess(): { handle: SpawnedDaemonProcess; emitExit: (code: number | null, signal?: NodeJS.Signals | null) => void; killedSignals: (NodeJS.Signals | undefined)[] } {
  const emitter = new EventEmitter();
  const killedSignals: (NodeJS.Signals | undefined)[] = [];
  const handle: SpawnedDaemonProcess = {
    pid: FAKE_PID,
    on: (event, listener) => emitter.on(event, listener as (...args: unknown[]) => void),
    kill: (signal) => {
      killedSignals.push(signal);
      return true;
    },
  };
  return { handle, emitExit: (code, signal = null) => emitter.emit("exit", code, signal), killedSignals };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test.afterEach(() => {
  // `readiness-state` is a process-wide singleton (see its own header) — every test that latches a
  // failure through the real `recordAssistantDaemonFailure` must leave it as it found it.
  clearAssistantDaemonFailure();
  setReadinessSnapshot({ ok: true, modules: [] });
});

test("an unexpected exit triggers an automatic respawn", async () => {
  const children = [createFakeDaemonProcess(), createFakeDaemonProcess()];
  let spawnCount = 0;
  const supervisor = createDaemonSupervisor({
    spawnDaemonProcess: () => children[spawnCount++].handle,
    policy: createRespawnPolicy({ backoffScheduleMs: [5], crashLoopMaxFailures: 10 }),
  });

  supervisor.start();
  assert.equal(spawnCount, 1, "start() must spawn once immediately");

  children[0].emitExit(1, null);
  await wait(40);

  assert.equal(spawnCount, 2, "an unexpected exit must trigger exactly one automatic respawn");
});

test("a deliberate shutdown kills the current child and does not trigger a respawn on its exit", async () => {
  const children = [createFakeDaemonProcess(), createFakeDaemonProcess()];
  let spawnCount = 0;
  const supervisor = createDaemonSupervisor({
    spawnDaemonProcess: () => children[spawnCount++].handle,
    policy: createRespawnPolicy({ backoffScheduleMs: [5], crashLoopMaxFailures: 10 }),
  });

  supervisor.start();
  supervisor.shutdown();

  assert.deepEqual(children[0].killedSignals, ["SIGTERM"], "shutdown() must kill the running child");

  // Simulate the OS actually finishing the termination after shutdown() already fired.
  children[0].emitExit(null, "SIGTERM");
  await wait(40);

  assert.equal(spawnCount, 1, "an exit that follows a deliberate shutdown must never trigger a respawn");
});

test("the crash-loop cap trips after the configured number of failures and latches a distinct, actionable reason", async () => {
  const children = [createFakeDaemonProcess(), createFakeDaemonProcess(), createFakeDaemonProcess()];
  let spawnCount = 0;
  const supervisor = createDaemonSupervisor({
    spawnDaemonProcess: () => children[spawnCount++].handle,
    policy: createRespawnPolicy({ backoffScheduleMs: [5], crashLoopMaxFailures: 2 }),
  });

  supervisor.start();
  children[0].emitExit(1, null);
  await wait(40);
  assert.equal(spawnCount, 2, "the 1st failure (below the cap of 2) must still retry");

  children[1].emitExit(1, null);
  await wait(40);

  assert.equal(spawnCount, 2, "the 2nd failure hits the cap — no 3rd spawn attempt");
  const entry = getReadinessSnapshot().modules.find((m) => m.name === "assistant-daemon");
  const latchedReason = entry?.lifecycle.status === "failed" ? entry.lifecycle.reasonCode : undefined;
  assert.match(latchedReason ?? "", /^gave up after 2 attempts in 60s:/, "the give-up reason must be distinct from a generic crash message");
});

test("the manual restart seam spawns a fresh daemon even after the crash-loop cap has tripped", async () => {
  const children = [createFakeDaemonProcess(), createFakeDaemonProcess(), createFakeDaemonProcess()];
  let spawnCount = 0;
  const supervisor = createDaemonSupervisor({
    spawnDaemonProcess: () => children[spawnCount++].handle,
    policy: createRespawnPolicy({ backoffScheduleMs: [5], crashLoopMaxFailures: 1 }),
  });

  supervisor.start();
  children[0].emitExit(1, null);
  await wait(20);
  assert.equal(spawnCount, 1, "the cap of 1 must trip on the very first failure — no automatic retry");

  supervisor.restart();

  assert.equal(spawnCount, 2, "restart() must spawn immediately, bypassing the tripped cap");
});

test("restart() waits for a still-live current child to actually exit before spawning its replacement", () => {
  const children = [createFakeDaemonProcess(), createFakeDaemonProcess()];
  let spawnCount = 0;
  const supervisor = createDaemonSupervisor({
    spawnDaemonProcess: () => children[spawnCount++].handle,
    policy: createRespawnPolicy(),
  });

  supervisor.start();
  supervisor.restart();

  assert.deepEqual(children[0].killedSignals, ["SIGTERM"], "restart() must kill the still-live current child");
  assert.equal(spawnCount, 1, "the replacement must not spawn until the old child has actually released the port");

  children[0].emitExit(null, "SIGTERM");

  assert.equal(spawnCount, 2, "once the old child confirms its exit, the replacement spawns");
});

test("PORT_IN_USE exits are described with the real reason instead of a generic exit code", async () => {
  const children = [createFakeDaemonProcess(), createFakeDaemonProcess()];
  let spawnCount = 0;
  const supervisor = createDaemonSupervisor({
    spawnDaemonProcess: () => children[spawnCount++].handle,
    policy: createRespawnPolicy({ backoffScheduleMs: [5], crashLoopMaxFailures: 10 }),
    daemonPort: "4319",
  });

  supervisor.start();
  children[0].emitExit(AGENT_DAEMON_EXIT_CODE.PORT_IN_USE, null);
  // Asserted synchronously, deliberately not after a wait: `recordAssistantDaemonFailure` runs
  // inside the same synchronous "exit" event dispatch, before the scheduled retry (5ms out) has
  // any chance to fire its own `clearAssistantDaemonFailure()` and race this assertion.

  const entry = getReadinessSnapshot().modules.find((m) => m.name === "assistant-daemon");
  const latchedReason = entry?.lifecycle.status === "failed" ? entry.lifecycle.reasonCode : undefined;
  assert.match(latchedReason ?? "", /could not bind 127\.0\.0\.1:4319 — address already in use/);
});
