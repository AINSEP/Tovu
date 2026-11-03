import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clearAssistantDaemonFailure, isAssistantDaemonKnownFailed, recordAssistantDaemonFailure } from "../readiness-state.js";
import * as lifecycle from "../daemon-supervisor.js";

// A namespace import keeps the suite loadable on a build without the demand gate, so a regression
// fails on behaviour (a boot-time spawn) rather than on module linking.
const {
  startAssistantDaemon, ensureAssistantDaemonReady, ensureAssistantDaemonStarted,
  restartAssistantDaemon, resetAssistantDaemonSingletonForTests, shutdownAssistantDaemon,
} = lifecycle;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test.afterEach(resetAssistantDaemonSingletonForTests);

test("wake racing park starts one replacement after exit", async () => {
  const children: EventEmitter[] = [];
  const supervisor = lifecycle.createDaemonSupervisor({
    spawnDaemonProcess: () => {
      const child = Object.assign(new EventEmitter(), { pid: 800 + children.length, kill: () => true });
      children.push(child); return child;
    },
    readiness: { isReady: async () => true },
    scheduler: { schedule: ({ run, delayMs }) => {
      const timer = setTimeout(run, delayMs); return () => clearTimeout(timer);
    } },
  });
  await supervisor.ensureReady({}, {});
  supervisor.markParking({ pid: 800 }, {});
  assert.equal(supervisor.isReady(), false);
  const first = supervisor.ensureReady({}, {});
  const second = supervisor.ensureReady({}, {});
  assert.equal(children.length, 1);
  children[0]!.emit("exit", 88, null);
  await Promise.all([first, second]);
  assert.equal(children.length, 2);
  children[1]!.emit("exit", 88, null);
  assert.equal(supervisor.getState(), "parked");
  supervisor.shutdown();
});

test("boot registers a cold lifecycle; first concurrent chat requests wait and spawn exactly once", async () => {
  const boot = deferred(); const discovery = deferred(); const spawned = deferred(); let spawns = 0;
  startAssistantDaemon({ workspaceId: "site-a", siteDir: "/fake-site" }, {
    registerProcessSignalHandlers: false, refreshPort: async () => {}, beforeStart: () => boot.promise,
    readDiscovery: async () => { await discovery.promise; return { pid: 321, url: "http://127.0.0.1:9876" }; },
    spawnDaemonProcess: () => { spawns += 1; spawned.resolve(); return Object.assign(new EventEmitter(), { pid: 321, kill: () => true }); },
  });
  assert.equal(spawns, 0);
  const first = ensureAssistantDaemonReady({}, {});
  const second = ensureAssistantDaemonReady({}, {});
  assert.equal(spawns, 0, "seeders finish before spawn");
  boot.resolve(); await spawned.promise;
  assert.equal(spawns, 1);
  let done = false; void first.then(() => { done = true; });
  assert.equal(done, false, "a live child alone is not ready");
  discovery.resolve(); await Promise.all([first, second]);
  assert.equal(spawns, 1);
});

test("ensureStarted and restart work before the first spawn", async () => {
  let spawns = 0;
  startAssistantDaemon({ workspaceId: "site-a", siteDir: "/fake-site" }, {
    registerProcessSignalHandlers: false, refreshPort: async () => {},
    readDiscovery: async () => ({ pid: 321, url: "http://127.0.0.1:9876" }),
    spawnDaemonProcess: () => { spawns += 1; return Object.assign(new EventEmitter(), { pid: 321, kill: () => true }); },
  });
  assert.equal(spawns, 0);
  assert.deepEqual(restartAssistantDaemon(), { ok: true });
  await ensureAssistantDaemonReady({}, {});
  assert.deepEqual(ensureAssistantDaemonStarted(), { ok: true });
  assert.equal(spawns, 1);
});

test("both boot adapters register the readiness and eligibility gates without spawning", () => {
  for (const file of ["../../../../index.ts", "../../../../cli/commands/serve.ts"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /beforeStart: async/);
    assert.match(source, /await awaitSiteBootReadiness/);
    assert.match(source, /await agentDaemonWanted/);
  }
});


test("discovery from a different PID cannot satisfy the first request", async () => {
  const read = deferred(); const pendingPoll = deferred();
  let pid = 999; let poll!: () => void; let spawns = 0;
  startAssistantDaemon({ workspaceId: "site-a", siteDir: "/fake-site" }, {
    registerProcessSignalHandlers: false, refreshPort: async () => {},
    scheduler: { schedule: ({ delayMs, run }) => { if (delayMs === 250) { poll = run; pendingPoll.resolve(); } return () => {}; } },
    readDiscovery: async () => { read.resolve(); return { pid, url: "http://127.0.0.1:9876" }; },
    spawnDaemonProcess: () => { spawns += 1; return Object.assign(new EventEmitter(), { pid: 321, kill: () => true }); },
  });
  assert.equal(spawns, 0, "registration is cold");
  let done = false;
  const pending = ensureAssistantDaemonReady({}, {}).then(() => { done = true; });
  await read.promise; await pendingPoll.promise;
  assert.equal(done, false);
  pid = 321; poll(); await pending;
  assert.equal(done, true);
});

test("an ineligible site never spawns on demand", async () => {
  let spawns = 0;
  startAssistantDaemon({ workspaceId: "site-a", siteDir: "/fake-site" }, {
    registerProcessSignalHandlers: false, refreshPort: async () => {},
    beforeStart: async () => { throw new Error("disabled"); },
    spawnDaemonProcess: () => { spawns++; return Object.assign(new EventEmitter(), { pid: 321, kill: () => true }); },
  });
  assert.equal(spawns, 0, "registration is cold");
  await assert.rejects(ensureAssistantDaemonReady({}, {}), /disabled/);
  assert.equal(spawns, 0);
});

test("shutdown while demand awaits seeders prevents the first spawn", async () => {
  const boot = deferred(); let spawns = 0;
  startAssistantDaemon({ workspaceId: "site-a", siteDir: "/fake-site" }, {
    registerProcessSignalHandlers: false, refreshPort: async () => {}, beforeStart: () => boot.promise,
    spawnDaemonProcess: () => { spawns++; return Object.assign(new EventEmitter(), { pid: 321, kill: () => true }); },
  });
  assert.equal(spawns, 0, "registration is cold");
  const pending = ensureAssistantDaemonReady({}, {});
  await shutdownAssistantDaemon(); boot.resolve();
  await assert.rejects(pending, /shutting down/);
  assert.equal(spawns, 0);
});

test("a verified-ready daemon clears a stale latch, so /api/agents does not stay failed after a slow restart", async () => {
  startAssistantDaemon({ workspaceId: "site-a", siteDir: "/fake-site" }, {
    registerProcessSignalHandlers: false, refreshPort: async () => {},
    readDiscovery: async () => ({ pid: 321, url: "http://127.0.0.1:9876" }),
    spawnDaemonProcess: () => Object.assign(new EventEmitter(), { pid: 321, kill: () => true }),
  });
  await ensureAssistantDaemonReady({}, {});
  // What restartAssistantDaemon latches when its readiness wait outlives the 30s deadline.
  recordAssistantDaemonFailure("Error: daemon readiness timed out");
  try {
    await ensureAssistantDaemonReady({}, {});
    assert.equal(isAssistantDaemonKnownFailed(), false);
  } finally { clearAssistantDaemonFailure(); }
});
