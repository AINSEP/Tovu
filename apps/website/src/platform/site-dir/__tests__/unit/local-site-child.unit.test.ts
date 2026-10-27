import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import type { StopProcessesResult } from "@jini-ai/platform/process";
import {
  createOwnTreeReaper, isEntrypoint, NO_REGISTRY, ownerPidFrom, parentGone, runLocalSiteChild, selfAsDaemonProcess,
  type LocalSiteChildProcess, type WatchdogHandle, type WatchdogTimers,
} from "../../local-site-child.js";

const OWNER = 4242;

/** A process fake whose parent pid and liveness answer can change between probes. */
function fakeProcess(env: NodeJS.ProcessEnv, { ppid = OWNER, liveness = (): void => {} }: { ppid?: number; liveness?: () => void } = {}) {
  const signals: Array<{ pid: number; signal: NodeJS.Signals | number | undefined }> = [];
  const exits: Array<number | undefined> = [];
  const proc: LocalSiteChildProcess & { ppid: number } = {
    env, pid: 777, ppid, execPath: "/node", cwd: () => "/site",
    kill(pid, signal) { signals.push({ pid, signal }); if (signal === 0) liveness(); return true; },
    exit(code) { exits.push(code); },
  };
  return { proc, signals, exits };
}

function fakeTimers() {
  const handle: WatchdogHandle & { unrefs: number } = { unrefs: 0, unref() { this.unrefs++; } };
  const state = { tick: undefined as (() => void) | undefined, ms: 0, cleared: [] as WatchdogHandle[] };
  const timers: WatchdogTimers = {
    setInterval(run, ms) { state.tick = run; state.ms = ms; return handle; },
    clearInterval(cleared) { state.cleared.push(cleared); },
  };
  return { timers, handle, state };
}

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

test("T47/site-dir-1#3: owner loss during a pending bundle build prevents the later site import", async () => {
  const { proc } = fakeProcess({ TOVU_LOCAL_SITE_OWNER_PID: String(OWNER),
    TOVU_LOCAL_ADMIN_BUILD_ROOT: "/runtime", TOVU_REPO_ROOT: "/repo" });
  const { timers, state } = fakeTimers();
  let finishBuild!: (dist: string) => void;
  const bundle = new Promise<string>((resolve) => { finishBuild = resolve; });
  const imported: string[] = [];
  let reaped = 0;
  const boot = runLocalSiteChild({}, { proc, timers,
    buildAdminBundle: () => bundle,
    reapOwnTree: async () => { reaped++; },
    importEntry: async (specifier) => { imported.push(specifier); },
  });

  // A tree-stop request can settle before the OS has finished terminating the process.
  proc.ppid = 1;
  state.tick!();
  finishBuild("/runtime/admin-dist");
  await boot;

  assert.equal(reaped, 1);
  assert.deepEqual(imported, [], "a completed bundle must not resume boot after the watchdog observed owner loss");
});

test("ownerPidFrom accepts only a positive integer owner pid", () => {
  assert.equal(ownerPidFrom({ env: { TOVU_LOCAL_SITE_OWNER_PID: "42" } }), 42);
  for (const value of [undefined, "", "abc", "1.5", "0", "-3"]) {
    assert.throws(() => ownerPidFrom({ env: { TOVU_LOCAL_SITE_OWNER_PID: value } }), /Local site owner is required/, String(value));
  }
});

test("parentGone: re-parented or ESRCH means gone; a live or permission-guarded owner is present", () => {
  assert.equal(parentGone({ proc: fakeProcess({}, { ppid: 1 }).proc, ownerPid: OWNER }), true);
  const alive = fakeProcess({});
  assert.equal(parentGone({ proc: alive.proc, ownerPid: OWNER }), false);
  assert.deepEqual(alive.signals, [{ pid: OWNER, signal: 0 }]);
  assert.equal(parentGone({ proc: fakeProcess({}, { liveness: () => { throw errno("ESRCH"); } }).proc, ownerPid: OWNER }), true);
  assert.equal(parentGone({ proc: fakeProcess({}, { liveness: () => { throw errno("EPERM"); } }).proc, ownerPid: OWNER }), false);
});

test("selfAsDaemonProcess signals this process, SIGTERM unless a signal is named, and ignores subscriptions", () => {
  const { proc, signals } = fakeProcess({});
  const self = selfAsDaemonProcess({ proc });
  assert.equal(self.pid, 777);
  assert.equal(self.kill({}), true);
  assert.equal(self.kill({}, {}), true);
  assert.equal(self.kill({}, { signal: "SIGKILL" }), true);
  assert.deepEqual(signals, [{ pid: 777, signal: "SIGTERM" }, { pid: 777, signal: "SIGTERM" }, { pid: 777, signal: "SIGKILL" }]);
  assert.equal(self.on({ event: "exit", listener: () => assert.fail("a self handle never reports exit") }), undefined);
});

test("the reaper's registry holds no record", async () => {
  assert.equal(await NO_REGISTRY.readLive(), null);
  assert.equal(await NO_REGISTRY.write({ record: { pid: 1, port: 1, host: "127.0.0.1", url: "http://127.0.0.1:1", startedAt: "" } }), undefined);
  assert.equal(await NO_REGISTRY.removeIfCurrent({ pid: 1 }), undefined);
});

function stopResult(remainingPids: number[]): StopProcessesResult {
  return { alreadyStopped: false, forcedPids: [], matchedPids: [777], remainingPids, stoppedPids: [] };
}

test("createOwnTreeReaper stops this process's own group; a stop that leaves processes running exits 1", async () => {
  const groupSignals: Array<[number, string | number | undefined]> = [];
  const adapter = {
    platform: "linux" as const,
    signalProcess: ((pid: number, signal?: string | number) => { groupSignals.push([pid, signal]); return true; }) as typeof process.kill,
    listProcessSnapshots: async () => [{ pid: 777, ppid: OWNER, command: "node" }],
  };
  const clean = fakeProcess({});
  await createOwnTreeReaper({ proc: clean.proc }, { adapter: { ...adapter, stopProcesses: async () => stopResult([]) } })();
  assert.deepEqual(groupSignals, [[-777, "SIGTERM"]]);
  assert.deepEqual(clean.exits, []);

  const stuck = fakeProcess({});
  const throwingGroup = { ...adapter, signalProcess: (() => { throw errno("ESRCH"); }) as typeof process.kill };
  await createOwnTreeReaper({ proc: stuck.proc }, { adapter: { ...throwingGroup, stopProcesses: async () => stopResult([777]) } })();
  assert.deepEqual(stuck.signals, [{ pid: 777, signal: "SIGTERM" }], "a failed group signal falls back to the process itself");
  assert.deepEqual(stuck.exits, [1]);
});

test("an owner already gone reaps before any bundle work or site import", async () => {
  const { proc } = fakeProcess({ TOVU_LOCAL_SITE_OWNER_PID: String(OWNER) }, { ppid: 1 });
  const { timers, handle, state } = fakeTimers();
  let reaped = 0;
  await runLocalSiteChild({}, { proc, timers, reapOwnTree: async () => { reaped++; },
    buildAdminBundle: async () => assert.fail("no build after the owner is gone"),
    importEntry: async () => assert.fail("no site boot after the owner is gone") });
  assert.equal(reaped, 1);
  assert.deepEqual(state.cleared, [handle]);
  assert.equal(handle.unrefs, 1, "the watchdog never keeps the process alive");
});

test("a live owner builds the shared admin bundle when none is supplied, then boots the site entry", async () => {
  const env: NodeJS.ProcessEnv = { TOVU_LOCAL_SITE_OWNER_PID: String(OWNER), TOVU_LOCAL_ADMIN_BUILD_ROOT: "/runtime", TOVU_REPO_ROOT: "/repo" };
  const { proc } = fakeProcess(env);
  const { timers, state } = fakeTimers();
  const calls: string[] = [];
  await runLocalSiteChild({}, { proc, timers, reapOwnTree: async () => assert.fail("owner is alive"),
    buildAdminBundle: async (required, optional) => {
      calls.push(`build ${required.runtimeDir} ${required.repoRoot}`);
      assert.equal(optional?.env, env);
      return "/runtime/admin-build/dist";
    },
    importEntry: async (specifier) => { calls.push(`import ${specifier} ${env.TOVU_ADMIN_DIST}`); } });
  assert.deepEqual(calls, ["build /runtime /repo", "import ../../index.js /runtime/admin-build/dist"]);
  assert.equal(state.ms, 1000);
});

test("a supplied admin bundle is reused without building; the watchdog reaps once the owner goes away", async () => {
  const env: NodeJS.ProcessEnv = { TOVU_LOCAL_SITE_OWNER_PID: String(OWNER), TOVU_ADMIN_DIST: "/shared/dist" };
  const { proc } = fakeProcess(env);
  const { timers, handle, state } = fakeTimers();
  let reaped = 0;
  const imported: string[] = [];
  await runLocalSiteChild({}, { proc, timers, reapOwnTree: async () => { reaped++; },
    buildAdminBundle: async () => assert.fail("a supplied bundle is never rebuilt"),
    siteEntry: "entry.js", importEntry: async (specifier) => { imported.push(specifier); } });
  assert.deepEqual(imported, ["entry.js"]);
  assert.equal(env.TOVU_ADMIN_DIST, "/shared/dist");
  state.tick!();
  assert.equal(reaped, 0, "a live owner keeps the site running");
  proc.ppid = 1;
  state.tick!();
  assert.equal(reaped, 1);
  assert.deepEqual(state.cleared, [handle]);
});

test("default importer and timers: the named site entry is really imported, and the real watchdog is cleared", async () => {
  const marker = `local-site-child-${process.pid}`;
  const env: NodeJS.ProcessEnv = { TOVU_LOCAL_SITE_OWNER_PID: String(OWNER), TOVU_ADMIN_DIST: "/shared/dist" };
  const live = fakeProcess(env);
  await runLocalSiteChild({}, { proc: live.proc, reapOwnTree: async () => assert.fail("owner is alive"),
    siteEntry: `data:text/javascript,globalThis[${JSON.stringify(marker)}]=true` });
  assert.equal((globalThis as Record<string, unknown>)[marker], true);
  let reaped = 0;
  const gone = fakeProcess({ TOVU_LOCAL_SITE_OWNER_PID: String(OWNER) }, { ppid: 1 });
  await runLocalSiteChild({}, { proc: gone.proc, reapOwnTree: async () => { reaped++; } });
  assert.equal(reaped, 1);
});

test("without an injected reaper the child builds its own tree reaper (constructed, not run, while the owner lives)", async () => {
  const env: NodeJS.ProcessEnv = { TOVU_LOCAL_SITE_OWNER_PID: String(OWNER), TOVU_ADMIN_DIST: "/shared/dist" };
  const { proc, signals } = fakeProcess(env);
  const { timers } = fakeTimers();
  let booted = false;
  await runLocalSiteChild({}, { proc, timers, importEntry: async () => { booted = true; } });
  assert.equal(booted, true);
  assert.deepEqual(signals, [{ pid: OWNER, signal: 0 }], "only the owner liveness probe was signalled");
});

test("run as a process entry, a missing owner pid fails before any boot work", () => {
  const entry = path.resolve(import.meta.dirname, "../../local-site-child.ts");
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.TOVU_LOCAL_SITE_OWNER_PID;
  const result = spawnSync(process.execPath, ["--import", "tsx", entry], { env, encoding: "utf8", timeout: 60_000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Local site owner is required/);
});

// `import.meta.main` needs Node >=24.2 while the engines floor is 24.0; on 24.0-24.1 it is undefined and the
// child would exit without booting. The entry check therefore compares the launched script with this module.
test("isEntrypoint is true when the launched script resolves to this module", () => {
  const realpath = (p: string): string => (p === "/link/child.ts" ? "/real/child.ts" : p);
  assert.equal(isEntrypoint({ moduleUrl: "file:///real/child.ts", argv: ["/node", "/real/child.ts"] }, { realpath }), true);
  assert.equal(isEntrypoint({ moduleUrl: "file:///real/child.ts", argv: ["/node", "/link/child.ts"] }, { realpath }), true);
});

test("isEntrypoint is false when the module is imported or no script was launched", () => {
  assert.equal(isEntrypoint({ moduleUrl: "file:///real/child.ts", argv: ["/node", "/real/runner.ts"] }, { realpath: (p) => p }), false);
  assert.equal(isEntrypoint({ moduleUrl: "file:///real/child.ts", argv: ["/node"] }), false);
  const missing = (): string => { throw new Error("ENOENT"); };
  assert.equal(isEntrypoint({ moduleUrl: "file:///real/child.ts", argv: ["/node", "/gone/child.ts"] }, { realpath: missing }), false);
});
