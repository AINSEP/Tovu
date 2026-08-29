import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import test from "node:test";

import { getReadinessSnapshot, clearAssistantDaemonFailure, setReadinessSnapshot } from "../readiness-state.js";
import {
  createDaemonSupervisor,
  resolveDaemonScriptPath,
  startAssistantDaemon,
  shutdownAssistantDaemon,
  resetAssistantDaemonSingletonForTests,
} from "../daemon-supervisor.js";
import type { SpawnedDaemonProcess } from "../daemon-supervisor.js";
import { createRespawnPolicy, AGENT_DAEMON_EXIT_CODE } from "#src/assistant/index";

/**
 * @file Proves the automatic-respawn wiring in `daemon-supervisor.ts` against a fake daemon
 * process — no real OS process is ever spawned here (`createFakeDaemonProcess` below is a plain
 * `EventEmitter`). Backoff/crash-loop DECISIONS are proven exhaustively in
 * `daemon-respawn-policy.test.ts`; this file only proves the wiring: an unexpected exit reaches
 * the policy and gets acted on, a deliberate shutdown does not, and the manual restart seam works.
 * Real (tiny) `setTimeout` delays are used rather than a fake clock — every backoff override here
 * is single-digit milliseconds, so this stays fast without needing timer-mocking machinery.
 *
 * Also proves the two additions from the production-reality follow-up: `restart()`/`ensureStarted()`
 * refusing once `shutdown()` has run (the SIGTERM-vs-manual-restart race — this is the closest a
 * unit test can safely get to that interaction; actually sending a real SIGTERM to the test
 * runner's own process to exercise `startAssistantDaemon`'s real `process.on(...)` wiring would kill
 * `node:test` itself, so that wiring is exercised at this factory level instead, where `shutdown()`
 * is the same call the real signal handler makes), and the on-demand/lazy-start seam
 * (`ensureStarted()`) — single-flight, cooldown-guarded, and re-arming after the crash-loop cap.
 */

// Astronomically larger than any real OS pid, so `process.kill(-pid, ...)` inside
// `killCurrentChild` reliably throws ESRCH and falls through to the fake's own `.kill()` below,
// instead of this test process ever sending a real signal to a real process group.
const FAKE_PID = 987_654_321;

function createFakeDaemonProcess(): {
  handle: SpawnedDaemonProcess;
  emitExit: (code: number | null, signal?: NodeJS.Signals | null) => void;
  /** Simulates a spawn-level failure (e.g. `spawn()` itself couldn't find the daemon script) —
   *  distinct from `emitExit`, since `attemptSpawn` deliberately does NOT feed this into the
   *  respawn policy (see that function's own comment): no retry is ever scheduled from this path. */
  emitError: (error: Error) => void;
  killedSignals: (NodeJS.Signals | undefined)[];
} {
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
  return {
    handle,
    emitExit: (code, signal = null) => emitter.emit("exit", code, signal),
    emitError: (error) => emitter.emit("error", error),
    killedSignals,
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test.afterEach(() => {
  // `readiness-state` is a process-wide singleton (see its own header) — every test that latches a
  // failure through the real `recordAssistantDaemonFailure` must leave it as it found it.
  clearAssistantDaemonFailure();
  setReadinessSnapshot({ ok: true, modules: [] });
  // `startAssistantDaemon`/`shutdownAssistantDaemon`'s module-singleton (see `daemon-supervisor.ts`'s
  // own header on the wrapper section) is likewise process-wide — reset it explicitly rather than
  // relying on test file ordering, so a later test never inherits an earlier test's singleton state.
  resetAssistantDaemonSingletonForTests();
});

test("resolveDaemonScriptPath() points at a script that actually exists on disk", () => {
  // Regression: every other test in this file fakes `spawnDaemonProcess`, so none of them ever
  // call the real `resolveDaemonScriptPath()` -- that's exactly how a same-directory `path.join`
  // assumption silently outlived the `src/server/` split that moved `agent-daemon-server.ts` to
  // `inbound/assistant/` while this file stayed in `runtime/lifecycle/`: nothing failed until a
  // real `child_process.spawn` actually tried to load the wrong path
  // (`ERR_MODULE_NOT_FOUND`, found running `npm run dev` for real after the 2026-08-28 rename).
  // Asserting the resolved path exists is the cheapest check that would have caught it immediately.
  assert.ok(
    existsSync(resolveDaemonScriptPath()),
    `resolveDaemonScriptPath() returned ${resolveDaemonScriptPath()}, which does not exist`,
  );
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

  const result = supervisor.restart();

  assert.equal(spawnCount, 2, "restart() must spawn immediately, bypassing the tripped cap");
  assert.deepEqual(result, { ok: true }, "a restart while merely policy-tripped (not terminating) must succeed");
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

test("restart() spawns a replacement immediately after a spawn-level error, instead of waiting forever for an exit event that will never come", () => {
  // Regression test for a real bug found while building `ensureStarted()`: verified directly with
  // Node that a spawn-level failure (ENOENT) fires ONLY "error", never "exit", and `pid` stays
  // `undefined` for that child's whole lifetime. Before `attemptSpawn`'s error handler started
  // marking `childHasExited = true`, `restart()`'s "wait for the stale child's actual exit before
  // spawning the replacement" branch (see the test above) would wait on an "exit" event this kind
  // of child can never emit — a permanent hang, not merely a slow recovery.
  const children = [createFakeDaemonProcess(), createFakeDaemonProcess()];
  let spawnCount = 0;
  const supervisor = createDaemonSupervisor({
    spawnDaemonProcess: () => children[spawnCount++].handle,
    policy: createRespawnPolicy(),
  });

  supervisor.start();
  children[0].emitError(new Error("spawn ENOENT"));

  const result = supervisor.restart();

  assert.deepEqual(result, { ok: true });
  assert.equal(spawnCount, 2, "restart() must spawn the replacement immediately — there is no live child left to wait on");
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

// -------------------------------------------------------------------------------------------
// terminating vs. crash-loop-tripped: restart() must tell them apart (production-reality follow-up)
// -------------------------------------------------------------------------------------------

test("restart() refuses once shutdown() has run, and does not spawn a replacement — the SIGTERM-vs-manual-restart race", () => {
  const children = [createFakeDaemonProcess(), createFakeDaemonProcess()];
  let spawnCount = 0;
  const supervisor = createDaemonSupervisor({
    spawnDaemonProcess: () => children[spawnCount++].handle,
    policy: createRespawnPolicy(),
  });

  supervisor.start();
  supervisor.shutdown(); // the same call the real SIGINT/SIGTERM/SIGHUP handler makes
  children[0].emitExit(null, "SIGTERM"); // the OS confirming the kill actually landed

  const result = supervisor.restart();

  assert.deepEqual(result, { ok: false, reason: "shutting down" }, "a restart racing the process's own teardown must be refused, not silently ignored");
  assert.equal(spawnCount, 1, "no replacement may be spawned once the process is terminating");
});

test("startAssistantDaemon() refuses to spawn a child once shutdownAssistantDaemon() has already run this boot, even though no singleton existed yet at shutdown time — the post-shutdown spawn race", () => {
  // Reproduces the real bug in `cli/commands/serve.ts`: it kicks off `startAssistantDaemon()` from
  // an un-awaited `Promise.all([...]).then(...)` chain that can still be pending when its own
  // SIGINT/SIGTERM handler fires `shutdownAssistantDaemon()`. `shutdownAssistantDaemon()` is
  // `singleton?.shutdown()` — a no-op when `singleton` is still `undefined` — so nothing before this
  // fix stopped the later `startAssistantDaemon()` call from spawning a fresh, unsupervised daemon
  // child with `registerProcessSignalHandlers: false` (no signal handlers of its own) after the
  // process had already decided to shut down.
  let spawnCount = 0;

  shutdownAssistantDaemon(); // shutdown arrives BEFORE the daemon was ever started this boot

  startAssistantDaemon(
    { workspaceId: "test-workspace", siteDir: "/tmp/daemon-supervisor-test-site" },
    {
      registerProcessSignalHandlers: false,
      spawnDaemonProcess: () => {
        spawnCount += 1;
        return createFakeDaemonProcess().handle;
      },
    },
  );

  assert.equal(spawnCount, 0, "a startAssistantDaemon() call arriving after shutdownAssistantDaemon() must never spawn a child");
});

test("ensureStarted() also refuses once shutdown() has run", () => {
  const children = [createFakeDaemonProcess()];
  let spawnCount = 0;
  const supervisor = createDaemonSupervisor({
    spawnDaemonProcess: () => children[spawnCount++].handle,
    policy: createRespawnPolicy(),
  });

  supervisor.start();
  supervisor.shutdown();

  assert.deepEqual(supervisor.ensureStarted(), { ok: false, reason: "shutting down" });
  assert.equal(spawnCount, 1);
});

// -------------------------------------------------------------------------------------------
// ensureStarted(): the on-demand/lazy-start seam
// -------------------------------------------------------------------------------------------

test("ensureStarted() reports ok without spawning when a daemon is already running — single-flight", () => {
  const children = [createFakeDaemonProcess(), createFakeDaemonProcess()];
  let spawnCount = 0;
  const supervisor = createDaemonSupervisor({
    spawnDaemonProcess: () => children[spawnCount++].handle,
    policy: createRespawnPolicy(),
  });

  supervisor.start();

  // Ten "concurrent" callers (as concurrent as this ever gets in a single-threaded event loop —
  // each call is fully synchronous, with no `await` between the "already running?" check and
  // `attemptSpawn`'s own `currentChild` assignment) must all see the same running child.
  for (let i = 0; i < 10; i += 1) {
    assert.deepEqual(supervisor.ensureStarted(), { ok: true });
  }

  assert.equal(spawnCount, 1, "ten calls against an already-running daemon must trigger zero extra spawns");
});

test("ensureStarted() reports ok without spawning when a retry is already scheduled on its own backoff", async () => {
  const children = [createFakeDaemonProcess(), createFakeDaemonProcess()];
  let spawnCount = 0;
  const supervisor = createDaemonSupervisor({
    spawnDaemonProcess: () => children[spawnCount++].handle,
    policy: createRespawnPolicy({ backoffScheduleMs: [30], crashLoopMaxFailures: 10 }),
  });

  supervisor.start();
  children[0].emitExit(1, null); // schedules an automatic retry ~30ms out

  assert.deepEqual(supervisor.ensureStarted(), { ok: true }, "a recovery already in progress must not be accelerated");
  assert.equal(spawnCount, 1, "no extra spawn while the scheduled retry has not fired yet");

  await wait(60);
  assert.equal(spawnCount, 2, "the originally-scheduled retry still fires on its own");
});

test("ensureStarted() triggers a fresh spawn when nothing is running and nothing is scheduled — the never-started/spawn-error case", () => {
  const children = [createFakeDaemonProcess(), createFakeDaemonProcess()];
  let spawnCount = 0;
  const supervisor = createDaemonSupervisor({
    spawnDaemonProcess: () => children[spawnCount++].handle,
    policy: createRespawnPolicy(),
  });

  supervisor.start();
  // A real spawn-level error (verified directly with Node: ENOENT fires ONLY "error", never
  // "exit", and leaves `pid` `undefined` for the child's whole lifetime — see `attemptSpawn`'s own
  // comment). Deliberately NOT fed into the respawn policy, so nothing gets scheduled after this —
  // exactly the state `ensureStarted()` exists to recover from.
  children[0].emitError(new Error("spawn ENOENT"));

  const result = supervisor.ensureStarted();

  assert.deepEqual(result, { ok: true });
  assert.equal(spawnCount, 2, "a request arriving while nothing is running or scheduled must trigger a fresh attempt");
});

test("ensureStarted() re-arms after the crash-loop cap has tripped, just like the manual seam", async () => {
  const children = [createFakeDaemonProcess(), createFakeDaemonProcess()];
  let spawnCount = 0;
  const supervisor = createDaemonSupervisor({
    spawnDaemonProcess: () => children[spawnCount++].handle,
    policy: createRespawnPolicy({ backoffScheduleMs: [5], crashLoopMaxFailures: 1 }),
  });

  supervisor.start();
  children[0].emitExit(1, null);
  await wait(20);
  assert.equal(spawnCount, 1, "the cap of 1 trips on the very first failure");

  const result = supervisor.ensureStarted();

  assert.deepEqual(result, { ok: true });
  assert.equal(spawnCount, 2, "a request arriving after the cap tripped must trigger a fresh attempt, same as the manual seam");
});

test("ensureStarted() cooldown: a repeated call shortly after a re-arm does not trigger a second spawn (thundering-herd guard)", async () => {
  const children = [createFakeDaemonProcess(), createFakeDaemonProcess(), createFakeDaemonProcess()];
  let spawnCount = 0;
  let clock = 0;
  const supervisor = createDaemonSupervisor({
    spawnDaemonProcess: () => children[spawnCount++].handle,
    policy: createRespawnPolicy({ backoffScheduleMs: [5], crashLoopMaxFailures: 1 }),
    now: () => clock,
    onDemandCooldownMs: 1_000,
  });

  supervisor.start();
  children[0].emitExit(1, null);
  await wait(20);
  assert.equal(spawnCount, 1, "the cap of 1 trips on the very first failure");

  const first = supervisor.ensureStarted();
  assert.deepEqual(first, { ok: true });
  assert.equal(spawnCount, 2, "the first request after the trip re-arms");

  // The freshly re-armed daemon fails again immediately (still durably broken) — the cap trips
  // again on this single-failure policy, landing back in the "nothing running, nothing scheduled"
  // state ensureStarted() would otherwise re-arm from on every subsequent request.
  children[1].emitExit(1, null);

  clock += 500; // still inside the 1s cooldown
  const second = supervisor.ensureStarted();
  assert.deepEqual(second, { ok: false, reason: "an on-demand restart was already attempted recently — cooling down before trying again" });
  assert.equal(spawnCount, 2, "a second request inside the cooldown window must not trigger another spawn");

  clock += 600; // now 1.1s after the first re-arm — past the cooldown
  const third = supervisor.ensureStarted();
  assert.deepEqual(third, { ok: true });
  assert.equal(spawnCount, 3, "once the cooldown elapses, the next request may re-arm again");
});
