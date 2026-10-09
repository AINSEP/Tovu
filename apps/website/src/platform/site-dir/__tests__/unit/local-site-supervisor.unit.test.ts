import assert from "node:assert/strict";
import test from "node:test";
import { createLocalSiteSupervisor, LocalSiteError, type LocalSiteProcess, type LocalSiteProcessPort } from "../../local-site-supervisor.js";

function fixture(cap = 3) {
  const children: Array<{ exit: () => void; stopped: boolean }> = [];
  const ports: number[] = [];
  const ticks: Array<() => void> = [];
  let failStop = false;
  const processPort: LocalSiteProcessPort = {
    async isPortFree({ port }) { return port !== 3101; },
    async launch({ port }): Promise<LocalSiteProcess> {
      ports.push(port);
      const entry = { exit: () => {}, stopped: false };
      children.push(entry);
      return { pid: 100 + children.length, onExit({ listener }) { entry.exit = listener; },
        async ready() { return true; },
        async terminate() { if (failStop) throw new Error("still alive"); entry.stopped = true; },
        killNow() { entry.stopped = true; } };
    },
    schedule({ run }) { ticks.push(run); return () => {}; },
  };
  const supervisor = createLocalSiteSupervisor({ processPort, servingName: "owner", scheme: "https" }, { maxConcurrent: cap });
  return { supervisor, children, ports, tick: async () => { ticks.shift()?.(); await new Promise<void>((resolve) => setImmediate(resolve)); }, failStop: () => { failStop = true; } };
}

test("local sites reserve independent API/daemon ports, cap before awaits, and expose readiness", async () => {
  const f = fixture(2);
  const attempts = await Promise.allSettled([f.supervisor.start({ name: "a" }), f.supervisor.start({ name: "b" }), f.supervisor.start({ name: "c" })]);
  assert.equal(attempts[2].status, "rejected");
  assert.deepEqual(f.ports, [3102, 3104]);
  assert.deepEqual(f.supervisor.list().map((site) => site.status), ["starting", "starting"]);
  await f.tick(); await f.tick();
  assert.equal(f.supervisor.list()[0].adminUrl, "https://localhost:3102/admin/");
  assert.equal(f.supervisor.list()[0].status, "running");
  await f.supervisor.shutdown();
  assert.ok(f.children.every((child) => child.stopped));
  await assert.rejects(f.supervisor.start({ name: "d" }), LocalSiteError);
});

test("crashes reap the tree before a replacement and deliberate stops permit Trash", async () => {
  const f = fixture();
  await f.supervisor.start({ name: "a" });
  f.children[0].exit();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(f.supervisor.list()[0].status, "crashed");
  assert.equal(f.children[0].stopped, true);
  await f.supervisor.start({ name: "a" });
  await assert.rejects(f.supervisor.withStoppedSite({ name: "a", task: async () => {} }), /SITE_RUNNING/);
  await f.supervisor.stop({ name: "a" });
  await f.supervisor.withStoppedSite({ name: "a", task: async () => {} });
  await assert.rejects(f.supervisor.start({ name: "owner" }), /SITE_SERVING/);
});

test("unverified tree-stop keeps capacity and refuses folder mutation", async () => {
  const f = fixture(1);
  await f.supervisor.start({ name: "a" }); f.failStop();
  await assert.rejects(f.supervisor.stop({ name: "a" }), /SITE_STOP_FAILED/);
  await assert.rejects(f.supervisor.start({ name: "b" }), /SITE_LIMIT/);
  await assert.rejects(f.supervisor.withStoppedSite({ name: "a", task: async () => {} }), /SITE_RUNNING/);
});

test("duplicate Start shares one child; stale exit callbacks cannot crash its replacement", async () => {
  const f = fixture();
  await Promise.all([f.supervisor.start({ name: "a" }), f.supervisor.start({ name: "a" })]);
  assert.equal(f.children.length, 1);
  const oldExit = f.children[0].exit;
  await f.supervisor.stop({ name: "a" });
  await f.supervisor.start({ name: "a" }); oldExit();
  assert.equal(f.supervisor.list()[0].status, "starting");
  assert.equal(f.supervisor.list()[0].pid, 102);
});

test("readiness timeout reaps a starting site's orphan tree and frees its reserved capacity", async () => {
  const ticks: Array<() => void> = []; let reaped = false;
  const supervisor = createLocalSiteSupervisor({ servingName: "owner", scheme: "http", processPort: {
    isPortFree: async () => true,
    schedule({ run }) { ticks.push(run); return () => {}; },
    launch: async () => ({ pid: 9, onExit() {}, ready: async () => false, terminate: async () => { reaped = true; }, killNow() {} }),
  } }, { maxConcurrent: 1, readyAttempts: 1 });
  await supervisor.start({ name: "slow" }); ticks.shift()?.();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(reaped, true);
  assert.equal(supervisor.list()[0].status, "crashed");
  assert.equal(supervisor.list()[0].pid, null);
  await supervisor.start({ name: "next" });
});

test("host shutdown during an in-flight spawn reaps the late child instead of stranding it", async () => {
  let release!: (child: LocalSiteProcess) => void;
  let reaped = false;
  const supervisor = createLocalSiteSupervisor({ servingName: "owner", scheme: "http", processPort: {
    isPortFree: async () => true, schedule: () => () => {},
    launch: () => new Promise<LocalSiteProcess>((resolve) => { release = resolve; }),
  } });
  const start = supervisor.start({ name: "late" });
  await new Promise<void>((resolve) => setImmediate(resolve));
  const stopped = supervisor.shutdown();
  release({ pid: 15, onExit() {}, ready: async () => true, terminate: async () => { reaped = true; }, killNow() {} });
  await assert.rejects(start, /SITE_HOST_STOPPING/); await stopped;
  assert.equal(reaped, true); assert.equal(supervisor.list()[0].pid, null);
});
