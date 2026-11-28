import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import type { ChildProcess, Serializable } from "node:child_process";
import test from "node:test";

import { currentToolExecToken, ensureToolExecToken, TOOL_EXEC_TOKEN_ENV_VAR } from "#src/assistant/daemon-access";
import { AGENT_DAEMON_EXIT_CODE } from "@tovu/contracts/daemon-exit-codes";
import { delegatedAssistantDaemonConnection } from "../assistant-daemon-connection.js";
import { clearAssistantDaemonFailure, getAssistantDaemonFailureReasonCode, getReadinessSnapshot, setReadinessSnapshot } from "../readiness-state.js";
import {
  createDaemonSupervisor,
  createRealDaemonProcessPorts,
  ensureAssistantDaemonReady,
  ensureAssistantDaemonStarted,
  isAssistantDaemonReady,
  noteAssistantDaemonParking,
  resetAssistantDaemonSingletonForTests,
  resolveDaemonScriptPath,
  restartAssistantDaemon,
  shutdownAssistantDaemon,
  startAssistantDaemon,
  type SpawnedDaemonProcess,
} from "../daemon-supervisor.js";

/**
 * @file The process-wide wrapper around the daemon supervisor (`startAssistantDaemon` and friends)
 * in its two modes — desktop-delegated (an IPC parent owns the agent service) and site-local
 * (this process supervises its own child) — plus the lifecycle log wording. Every child is an
 * `EventEmitter` double with a pid far above any real OS pid, and every IPC parent is an in-memory
 * peer, so no real process is spawned or signalled. Signal handlers are read back off `process`,
 * invoked directly with `process.exit` mocked, and removed again.
 */

const FAKE_PID = 987_654_321;
const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

type Reply = { payload: Serializable } | { refusalReason: string } | "silent";

/** In-memory IPC parent: records every request payload and answers per operation. */
class FakeParent extends EventEmitter {
  connected = true;
  requests: Array<Record<string, unknown>> = [];
  replies: Array<Record<string, unknown>> = [];
  answers = new Map<string, Reply>([["register", { payload: { url: "http://127.0.0.1:3300/s/site", token: "scope-tok", pid: 999 } }]]);
  send(message: Serializable, callback: (error: Error | null) => void): boolean {
    const envelope = message as { kind: string; id: string; payload: Record<string, unknown> };
    if (envelope.kind === "reply") { this.replies.push(envelope as unknown as Record<string, unknown>); callback(null); return true; }
    this.requests.push(envelope.payload);
    const answer = this.answers.get(String(envelope.payload.operation)) ?? { payload: {} };
    if (answer !== "silent") {
      queueMicrotask(() => this.emit("message", "refusalReason" in answer
        ? { jiniIpc: 1, kind: "reply", id: envelope.id, ok: false, refusalReason: answer.refusalReason }
        : { jiniIpc: 1, kind: "reply", id: envelope.id, ok: true, payload: answer.payload }));
    }
    callback(null); return true;
  }
  operations(): unknown[] { return this.requests.map(request => request.operation); }
}

function fakeChild({ pid = FAKE_PID, pidless = false, kill = (): boolean => true } = {}) {
  const emitter = new EventEmitter();
  const killed: (NodeJS.Signals | undefined)[] = [];
  const handle: SpawnedDaemonProcess = {
    pid: pidless ? undefined : pid,
    on: (event, listener) => emitter.on(event, listener as (...args: unknown[]) => void),
    kill: (signal) => { killed.push(signal); return kill(); },
  };
  return { handle, killed, emitExit: (code: number | null, signal: NodeJS.Signals | null = null) => emitter.emit("exit", code, signal) };
}

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const SITE = { workspaceId: "site-w", siteDir: "/site-w", siteApiOrigin: "http://127.0.0.1:3100" };

/** Listeners this test added to `process`, so they can be invoked and then removed. */
function addedListeners(before: Map<string, Function[]>): Map<string, Function[]> {
  const added = new Map<string, Function[]>();
  for (const [event, old] of before) added.set(event, process.listeners(event as NodeJS.Signals).filter(listener => !old.includes(listener)));
  return added;
}
function snapshotListeners(events: readonly string[]): Map<string, Function[]> {
  return new Map(events.map(event => [event, [...process.listeners(event as NodeJS.Signals)]]));
}
function removeListeners(added: Map<string, Function[]>): void {
  for (const [event, listeners] of added) for (const listener of listeners) process.removeListener(event, listener as () => void);
}

test.afterEach(() => {
  resetAssistantDaemonSingletonForTests();
  clearAssistantDaemonFailure();
  setReadinessSnapshot({ ok: true, modules: [] });
});

// Must stay first: the tool credential is a once-per-process module holder with no reset seam.
test("desktop registration refuses without a site tool credential and sends nothing to the parent", async () => {
  assert.equal(currentToolExecToken(), undefined, "precondition: nothing minted the tool credential yet in this file");
  const parent = new FakeParent();
  startAssistantDaemon(SITE, { parentIpc: parent, registerProcessSignalHandlers: false });
  await assert.rejects(ensureAssistantDaemonReady({}, {}), { message: "site tool credential is unavailable" });
  assert.deepEqual(parent.requests, []);
  assert.equal(isAssistantDaemonReady(), false);
});

test("desktop registration waits for boot prerequisites, then sends the site's scope identity and environment, without the tool token in env", async t => {
  const token = ensureToolExecToken({ env: {} }, {});
  const inherited = process.env[TOOL_EXEC_TOKEN_ENV_VAR];
  process.env[TOOL_EXEC_TOKEN_ENV_VAR] = "tok-a";
  t.after(() => { if (inherited === undefined) delete process.env[TOOL_EXEC_TOKEN_ENV_VAR]; else process.env[TOOL_EXEC_TOKEN_ENV_VAR] = inherited; });
  const parent = new FakeParent();
  const order: string[] = [];
  startAssistantDaemon({ ...SITE, siteCallbackOrigin: "http://127.0.0.1:4100", pgSocketPath: "/run/pg.sock" }, {
    parentIpc: parent, registerProcessSignalHandlers: false,
    beforeStart: async () => { order.push(`beforeStart:${parent.requests.length}`); },
  });
  await ensureAssistantDaemonReady({}, {});
  assert.deepEqual(order, ["beforeStart:0"], "boot prerequisites finish before the scope is registered");
  const [register] = parent.requests as Array<{ operation: string; siteId: string; token: string; env: NodeJS.ProcessEnv }>;
  assert.equal(register.operation, "register");
  assert.equal(register.siteId, "site-w");
  assert.equal(register.token, token);
  assert.equal(register.env.TOVU_SITE_DIR, "/site-w");
  assert.equal(register.env.TOVU_WORKSPACE, "site-w");
  assert.equal(register.env.TOVU_SITE_CALLBACK_ORIGIN, "http://127.0.0.1:4100");
  assert.equal(register.env.TOVU_SITE_LISTENER_ORIGIN, "http://127.0.0.1:3100");
  assert.equal(register.env.TOVU_SITE_PROCESS_CWD, process.cwd());
  assert.equal(register.env.TOVU_PG_SOCKET, "/run/pg.sock");
  assert.equal(TOOL_EXEC_TOKEN_ENV_VAR in register.env, false, "an inherited tool token never rides along in the daemon env");
  assert.equal(isAssistantDaemonReady(), true);
});

test("without a PGlite socket or callback origin the registration env falls back to the listener origin and omits TOVU_PG_SOCKET", async () => {
  ensureToolExecToken({ env: {} }, {});
  const parent = new FakeParent();
  startAssistantDaemon(SITE, { parentIpc: parent, registerProcessSignalHandlers: false });
  await ensureAssistantDaemonReady({}, {});
  const env = (parent.requests[0] as { env: NodeJS.ProcessEnv }).env;
  assert.equal(env.TOVU_SITE_CALLBACK_ORIGIN, "http://127.0.0.1:3100");
  assert.equal("TOVU_PG_SOCKET" in env, false);
});

test("a desktop daemon is not ready once the IPC parent disconnects", async () => {
  ensureToolExecToken({ env: {} }, {});
  const parent = new FakeParent();
  startAssistantDaemon(SITE, { parentIpc: parent, registerProcessSignalHandlers: false });
  await ensureAssistantDaemonReady({}, {});
  assert.equal(isAssistantDaemonReady(), true);
  parent.connected = false;
  assert.equal(isAssistantDaemonReady(), false);
});

test("an unavailable notice for a different daemon pid keeps this site ready; malformed and site-bound-only notices are refused", async () => {
  ensureToolExecToken({ env: {} }, {});
  const parent = new FakeParent();
  startAssistantDaemon(SITE, { parentIpc: parent, registerProcessSignalHandlers: false });
  await ensureAssistantDaemonReady({}, {});
  parent.emit("message", { jiniIpc: 1, kind: "request", id: "other-pid", payload: { operation: "unavailable", pid: 1234 } });
  parent.emit("message", { jiniIpc: 1, kind: "request", id: "bogus", payload: { operation: "unavailable", pid: "x" } });
  parent.emit("message", { jiniIpc: 1, kind: "request", id: "wrong-way", payload: { operation: "ready" } });
  await tick();
  assert.equal(isAssistantDaemonReady(), true);
  assert.deepEqual(parent.replies, [
    { jiniIpc: 1, kind: "reply", id: "other-pid", ok: true, payload: {} },
    { jiniIpc: 1, kind: "reply", id: "bogus", ok: false },
    { jiniIpc: 1, kind: "reply", id: "wrong-way", ok: false },
  ]);
});

test("parking in desktop mode reports the pid to the parent and drops readiness; a refused report is logged", async t => {
  ensureToolExecToken({ env: {} }, {});
  const parent = new FakeParent();
  parent.answers.set("parking", { refusalReason: "desktop busy" });
  const errors = t.mock.method(console, "error", () => {});
  startAssistantDaemon(SITE, { parentIpc: parent, registerProcessSignalHandlers: false });
  await ensureAssistantDaemonReady({}, {});
  noteAssistantDaemonParking({ pid: 999 });
  assert.equal(isAssistantDaemonReady(), false);
  assert.deepEqual(parent.requests[1], { operation: "parking", pid: 999 });
  await tick();
  assert.equal(errors.mock.callCount(), 1);
  assert.equal(errors.mock.calls[0].arguments[0], "[daemon-supervisor] Could not report daemon parking");
  assert.equal(errors.mock.calls[0].arguments[1], "Error", "only the error class is logged, never the parent's refusal text");
});

test("a shutdown that lands while desktop registration is in flight refuses the late connection", async t => {
  ensureToolExecToken({ env: {} }, {});
  const warnings = t.mock.method(console, "warn", () => {});
  const errors = t.mock.method(console, "error", () => {});
  const parent = new FakeParent();
  startAssistantDaemon(SITE, { parentIpc: parent, registerProcessSignalHandlers: false });
  const ready = ensureAssistantDaemonReady({}, {});
  const stopped = shutdownAssistantDaemon();
  await assert.rejects(ready, { message: "shutting down" });
  await stopped;
  assert.equal(warnings.mock.callCount() + errors.mock.callCount(), 0, "the shutdown race never falls back to local supervision");
  assert.deepEqual(parent.operations(), ["withdraw", "register"]);
  assert.equal(delegatedAssistantDaemonConnection({}, {}), undefined);
  assert.equal(isAssistantDaemonReady(), false);
});

test("a refused desktop withdrawal during shutdown is logged with its reason, and shutdown still resolves", async t => {
  ensureToolExecToken({ env: {} }, {});
  const parent = new FakeParent();
  parent.answers.set("withdraw", { refusalReason: "scope unknown" });
  const warnings = t.mock.method(console, "warn", () => {});
  startAssistantDaemon(SITE, { parentIpc: parent, registerProcessSignalHandlers: false });
  await ensureAssistantDaemonReady({}, {});
  await shutdownAssistantDaemon();
  assert.deepEqual(warnings.mock.calls.map(call => call.arguments), [["[daemon-supervisor] desktop scope withdrawal unavailable: scope unknown"]]);
  assert.equal(delegatedAssistantDaemonConnection({}, {}), undefined);
});

test("restart and ensureStarted in desktop mode re-register with the parent; a failed registration is latched", async () => {
  ensureToolExecToken({ env: {} }, {});
  const parent = new FakeParent();
  startAssistantDaemon(SITE, { parentIpc: parent, registerProcessSignalHandlers: false });
  assert.deepEqual(restartAssistantDaemon(), { ok: true });
  await tick();
  assert.deepEqual(parent.operations(), ["register"]);
  parent.answers.set("register", { refusalReason: "desktop declined the scope" });
  assert.deepEqual(ensureAssistantDaemonStarted(), { ok: true });
  await tick(); await tick();
  assert.deepEqual(parent.operations(), ["register", "register"]);
  const lifecycle = getReadinessSnapshot().modules.find(module => module.name === "assistant-daemon")?.lifecycle;
  assert.equal(lifecycle?.status, "failed");
  assert.match(String(lifecycle?.reasonCode), /desktop declined the scope/);
});

test("desktop mode registers signal handlers that withdraw the scope and then exit 0", async t => {
  ensureToolExecToken({ env: {} }, {});
  const parent = new FakeParent();
  const before = snapshotListeners(SIGNALS);
  startAssistantDaemon(SITE, { parentIpc: parent });
  const added = addedListeners(before);
  try {
    assert.deepEqual([...added.values()].map(listeners => listeners.length), [1, 1, 1]);
    const exits: unknown[] = [];
    t.mock.method(process, "exit", ((code?: number) => { exits.push(code); }) as typeof process.exit);
    (added.get("SIGTERM")![0] as () => void)();
    await tick(); await tick();
    assert.deepEqual(parent.operations(), ["withdraw"]);
    assert.deepEqual(exits, [0]);
  } finally { removeListeners(added); }
});

test("site-local mode registers exit and signal handlers that shut the daemon down", async t => {
  const child = fakeChild();
  const before = snapshotListeners(["exit", ...SIGNALS]);
  startAssistantDaemon(SITE, {
    parentIpc: false, refreshPort: async () => {}, readDiscovery: async () => ({ pid: FAKE_PID, url: "http://127.0.0.1:4319" }),
    spawnDaemonProcess: () => child.handle,
  });
  const added = addedListeners(before);
  try {
    assert.deepEqual([...added.values()].map(listeners => listeners.length), [1, 1, 1, 1]);
    await ensureAssistantDaemonReady({}, {});
    const exits: unknown[] = [];
    t.mock.method(process, "exit", ((code?: number) => { exits.push(code); }) as typeof process.exit);
    (added.get("SIGHUP")![0] as () => void)();
    assert.deepEqual(exits, [0]);
    assert.deepEqual(child.killed, ["SIGTERM"], "process-group kill of the fake pid fails, so the direct child is signalled");
    child.emitExit(null, "SIGTERM");
    assert.equal(isAssistantDaemonReady(), false);
    (added.get("exit")![0] as () => void)();
    assert.deepEqual(child.killed, ["SIGTERM"], "the exit hook on an already-stopped daemon signals nothing");
  } finally { removeListeners(added); }
});

test("a second startAssistantDaemon in one boot is ignored and keeps the first supervisor", async t => {
  const errors = t.mock.method(console, "error", () => {});
  let firstSpawns = 0;
  const options = { parentIpc: false as const, registerProcessSignalHandlers: false, refreshPort: async () => {}, readDiscovery: async () => ({ pid: FAKE_PID, url: "http://127.0.0.1:4319" }) };
  startAssistantDaemon(SITE, { ...options, spawnDaemonProcess: () => { firstSpawns++; return fakeChild().handle; } });
  startAssistantDaemon(SITE, { ...options, spawnDaemonProcess: () => assert.fail("the second registration must not be used") });
  assert.deepEqual(errors.mock.calls.map(call => call.arguments), [["[daemon-supervisor] startAssistantDaemon called more than once this process boot — ignoring"]]);
  await ensureAssistantDaemonReady({}, {});
  assert.equal(firstSpawns, 1);
});

test("the module wrappers refuse with explicit reasons when never started or already shutting down", async () => {
  assert.deepEqual(ensureAssistantDaemonStarted(), { ok: false, reason: "the assistant daemon was never started this process boot" });
  await assert.rejects(ensureAssistantDaemonReady({}, {}), { message: "the assistant daemon lifecycle is not configured" });
  startAssistantDaemon(SITE, { parentIpc: false, registerProcessSignalHandlers: false, refreshPort: async () => {}, spawnDaemonProcess: () => assert.fail("never spawned") });
  await shutdownAssistantDaemon();
  assert.deepEqual(restartAssistantDaemon(), { ok: false, reason: "shutting down" });
  assert.deepEqual(ensureAssistantDaemonStarted(), { ok: false, reason: "shutting down" });
  await assert.rejects(ensureAssistantDaemonReady({}, {}), { message: "shutting down" });
});

test("an idle-park exit is logged as parked, not as an unexpected exit", () => {
  const child = fakeChild({ pid: 4242 });
  const lines: string[] = [];
  const supervisor = createDaemonSupervisor({
    spawnDaemonProcess: () => child.handle, now: () => Date.UTC(2026, 0, 2, 3, 4, 5), log: line => lines.push(line), quietRoutineLifecycle: false,
    scheduler: { schedule: () => () => {} },
  });
  supervisor.start();
  child.emitExit(AGENT_DAEMON_EXIT_CODE.IDLE_PARK);
  assert.deepEqual(lines, [
    "[daemon-supervisor] 2026-01-02T03:04:05.000Z spawned agent daemon pid=4242",
    "[daemon-supervisor] 2026-01-02T03:04:05.000Z agent daemon pid=4242 parked after idle",
  ]);
  assert.equal(supervisor.getState(), "parked");
});

test("an idle-park exit of a pid-less child is logged as pid=unknown", () => {
  const child = fakeChild({ pidless: true });
  const lines: string[] = [];
  const supervisor = createDaemonSupervisor({
    spawnDaemonProcess: () => child.handle, now: () => Date.UTC(2026, 0, 2, 3, 4, 5), log: line => lines.push(line), quietRoutineLifecycle: true,
    scheduler: { schedule: () => () => {} },
  });
  supervisor.start();
  child.emitExit(AGENT_DAEMON_EXIT_CODE.IDLE_PARK);
  assert.deepEqual(lines, ["[daemon-supervisor] 2026-01-02T03:04:05.000Z agent daemon pid=unknown parked after idle"]);
});

test("a pid-less child is logged as pid=unknown and is never signalled on shutdown", t => {
  const groupKills = t.mock.method(process, "kill", () => { throw new Error("no real signal in tests"); });
  const child = fakeChild({ pidless: true });
  const lines: string[] = [];
  const supervisor = createDaemonSupervisor({
    spawnDaemonProcess: () => child.handle, now: () => Date.UTC(2026, 0, 2, 3, 4, 5), log: line => lines.push(line), quietRoutineLifecycle: false,
    scheduler: { schedule: () => () => {} },
  });
  supervisor.start();
  supervisor.shutdown();
  assert.equal(groupKills.mock.callCount(), 0);
  assert.deepEqual(child.killed, [], "a child without a pid never started, so nothing is signalled");
  child.emitExit(1);
  assert.deepEqual(lines, [
    "[daemon-supervisor] 2026-01-02T03:04:05.000Z spawned agent daemon pid=unknown",
    "[daemon-supervisor] 2026-01-02T03:04:05.000Z agent daemon pid=unknown exited (code=1, signal=null, deliberate=true) — any run in flight died with it",
  ]);
});

test("shutdown on posix tolerates a child whose own kill() also throws", () => {
  const child = fakeChild({ kill: () => { throw new Error("ESRCH"); } });
  const supervisor = createDaemonSupervisor({ spawnDaemonProcess: () => child.handle, platform: "linux", log: () => {}, scheduler: { schedule: () => () => {} } });
  supervisor.start();
  assert.doesNotThrow(() => supervisor.shutdown());
  assert.deepEqual(child.killed, ["SIGTERM"]);
  assert.equal(supervisor.getState(), "shutting-down");
});

test("a local-site-owned API passes its own pid to the production daemon's argv", t => {
  const siteDir = mkdtempSync(path.join(os.tmpdir(), "ds-wrapper-"));
  const saved = process.env.TOVU_LOCAL_SITE_OWNER_PID;
  t.after(() => {
    if (saved === undefined) delete process.env.TOVU_LOCAL_SITE_OWNER_PID; else process.env.TOVU_LOCAL_SITE_OWNER_PID = saved;
    rmSync(siteDir, { recursive: true, force: true });
  });
  const spawnArgs: string[][] = [];
  const spawn = ({ args }: { args: readonly string[] }) => {
    spawnArgs.push([...args]);
    return Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() }) as unknown as ChildProcess;
  };
  const tail = ["--optimize-for-size", resolveDaemonScriptPath(), "--workspace", "ws-owner"];
  delete process.env.TOVU_LOCAL_SITE_OWNER_PID;
  createRealDaemonProcessPorts({ workspaceId: "ws-owner", siteDir, daemonPortOverride: undefined }, { spawn }).spawnDaemonProcess();
  process.env.TOVU_LOCAL_SITE_OWNER_PID = "1";
  createRealDaemonProcessPorts({ workspaceId: "ws-owner", siteDir, daemonPortOverride: undefined }, { spawn }).spawnDaemonProcess();
  assert.deepEqual(spawnArgs[0].slice(-4), tail);
  assert.deepEqual(spawnArgs[1].slice(-5), [...tail, `--local-site-api-pid=${process.pid}`]);
});

test("in site-local mode a failed boot prerequisite behind restart or ensureStarted is latched as the daemon's failure, and nothing spawns", async () => {
  let spawns = 0;
  let prerequisite: Error | undefined = new Error("seeders unavailable");
  startAssistantDaemon(SITE, { parentIpc: false, registerProcessSignalHandlers: false, refreshPort: async () => {},
    beforeStart: async () => { if (prerequisite) throw prerequisite; },
    readDiscovery: async () => ({ pid: FAKE_PID, url: "http://127.0.0.1:4319" }),
    spawnDaemonProcess: () => { spawns++; return fakeChild().handle; } });

  assert.deepEqual(restartAssistantDaemon(), { ok: true }, "restart answers at once; the failure arrives later");
  await tick();
  assert.equal(getAssistantDaemonFailureReasonCode(), "Error: seeders unavailable");

  clearAssistantDaemonFailure();
  prerequisite = new Error("eligibility refused");
  assert.deepEqual(ensureAssistantDaemonStarted(), { ok: true });
  await tick();
  assert.equal(getAssistantDaemonFailureReasonCode(), "Error: eligibility refused", "a failed preparation is retried, not cached");
  assert.equal(spawns, 0);
});
