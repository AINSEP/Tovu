import assert from "node:assert/strict";
import test from "node:test";
import { assertLocalSiteName, createLocalSiteSupervisor, LocalSiteError, startLocalSiteWhenRunning, type LocalSiteProcess, type LocalSiteProcessPort, type LocalSiteState } from "../../local-site-supervisor.js";

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

/** A controllable process port: every child, scheduled probe and cancellation is observable. */
function controllable(overrides: Partial<LocalSiteProcessPort> = {}, options: { maxConcurrent?: number; readyAttempts?: number } = {}) {
  const jobs: Array<{ run: () => void; delayMs: number }> = [];
  const children: Array<{ exit: () => void; terminated: number; killed: boolean }> = [];
  const control = { ready: async (): Promise<boolean> => true, terminate: async (): Promise<void> => {}, cancels: 0, disposed: 0 };
  const processPort: LocalSiteProcessPort = {
    isPortFree: async () => true,
    async launch(): Promise<LocalSiteProcess> {
      const child = { exit: () => {}, terminated: 0, killed: false };
      children.push(child);
      return { pid: 200 + children.length, onExit({ listener }) { child.exit = listener; }, ready: () => control.ready(),
        async terminate() { await control.terminate(); child.terminated++; }, killNow() { child.killed = true; } };
    },
    schedule(job) { jobs.push(job); return () => { control.cancels++; }; },
    ...overrides,
  };
  const supervisor = createLocalSiteSupervisor({ processPort, servingName: "owner", scheme: "http" }, options);
  const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
  return { supervisor, jobs, children, control, settle, runNext: async () => { jobs.shift()?.run(); await settle(); await settle(); } };
}
const foreignState = (name: string): LocalSiteState => ({ name, status: "running", pid: 77, port: 3900, daemonPort: 3901, adminUrl: "http://localhost:3900/admin/", app: "Desktop", external: true });

test("T47/site-dir-1#2: a crash queued behind Stop cannot overwrite the stopped state", async () => {
  const f = controllable();
  await f.supervisor.start({ name: "a" });
  await f.supervisor.start({ name: "b" });
  let release!: () => void;
  let stopping!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { stopping = resolve; });
  f.control.terminate = async () => { stopping(); await held; };
  const stopB = f.supervisor.stop({ name: "b" });
  await entered;

  // B's tree stop holds the lane while Stop A and A's real exit arrive in that order.
  const stopA = f.supervisor.stop({ name: "a" });
  f.children[0]!.exit();
  release();
  try {
    await Promise.all([stopB, stopA]);
    // This mutation is queued after the crash reaper, so it also acts as a lane barrier.
    await f.supervisor.withStoppedSite({ name: "a", task: async () => {} });
    assert.equal(f.supervisor.list().find((site) => site.name === "a")?.status, "stopped");
  } finally {
    release();
    await f.supervisor.shutdown();
  }
});

for (const maxConcurrent of [0, 21, 1.5]) test(`a site limit of ${maxConcurrent} is refused`, () => {
  assert.throws(() => controllable({}, { maxConcurrent }), { name: "LocalSiteError", message: "INVALID_SITE_LIMIT" });
});

for (const name of ["", "x".repeat(101), "../escape"]) test(`site name ${JSON.stringify(name.slice(0, 12))} is refused before any effect`, () => {
  assert.throws(() => assertLocalSiteName({ name }), { name: "LocalSiteError", message: "VALIDATION_ERROR" });
});

test("start after shutdown is refused as host stopping", async () => {
  const f = controllable();
  await f.supervisor.shutdown();
  await assert.rejects(f.supervisor.start({ name: "a" }), { message: "SITE_HOST_STOPPING" });
});

test("shutdown disposes the process port", async () => {
  let disposed = 0;
  const f = controllable({ dispose: async () => { disposed++; } });
  await f.supervisor.shutdown();
  assert.equal(disposed, 1);
});

test("start returns a site another app already runs without launching it", async () => {
  const f = controllable({ existing: ({ name }) => foreignState(name) });
  assert.deepEqual(await f.supervisor.start({ name: "a" }), foreignState("a"));
  assert.equal(f.children.length, 0);
});

test("start refuses a crashed site whose tree could not be stopped", async () => {
  const f = controllable();
  await f.supervisor.start({ name: "a" });
  f.control.terminate = async () => { throw new Error("still alive"); };
  f.children[0]!.exit(); await f.settle();
  await assert.rejects(f.supervisor.start({ name: "a" }), { message: "SITE_STOP_FAILED" });
});

test("start reports exhausted ports and leaves the entry crashed", async () => {
  const f = controllable({ isPortFree: async () => false });
  await assert.rejects(f.supervisor.start({ name: "a" }), { message: "SITE_PORTS_EXHAUSTED" });
  assert.deepEqual(f.supervisor.list().map((site) => [site.status, site.port]), [["crashed", null]]);
});

test("a launch failure is reported as a start failure", async () => {
  const f = controllable({ launch: async () => { throw new Error("spawn ENOENT"); } });
  await assert.rejects(f.supervisor.start({ name: "a" }), { message: "SITE_START_FAILED" });
});

test("a launch that loses to another app returns that app's site", async () => {
  let launched = false;
  const f = controllable({ existing: ({ name }) => launched ? foreignState(name) : null, launch: async () => { launched = true; throw new Error("port taken"); } });
  assert.deepEqual(await f.supervisor.start({ name: "a" }), foreignState("a"));
});

test("a readiness probe that throws counts as a miss and probes again soon", async () => {
  const f = controllable();
  f.control.ready = async () => { throw new Error("ECONNREFUSED"); };
  await f.supervisor.start({ name: "a" });
  await f.runNext();
  assert.equal(f.supervisor.list()[0]?.status, "starting");
  assert.deepEqual(f.jobs.map((job) => job.delayMs), [500]);
});

test("a running site probes every five seconds and crashes after three missed probes", async () => {
  const f = controllable();
  await f.supervisor.start({ name: "a" });
  await f.runNext();
  assert.deepEqual(f.jobs.map((job) => job.delayMs), [5000]);
  f.control.ready = async () => false;
  for (let miss = 0; miss < 3; miss++) await f.runNext();
  assert.equal(f.supervisor.list()[0]?.status, "crashed");
  assert.equal(f.children[0]?.terminated, 1);
});

test("a probe scheduled before a stop does nothing after it", async () => {
  const f = controllable();
  await f.supervisor.start({ name: "a" });
  await f.supervisor.stop({ name: "a" });
  await f.runNext();
  assert.equal(f.jobs.length, 0);
  assert.equal(f.supervisor.list()[0]?.status, "stopped");
});

test("a probe answered after its site stopped schedules nothing more", async () => {
  const f = controllable();
  let answer!: (ready: boolean) => void;
  f.control.ready = () => new Promise<boolean>((resolve) => { answer = resolve; });
  await f.supervisor.start({ name: "a" });
  f.jobs.shift()?.run(); await f.settle();
  await f.supervisor.stop({ name: "a" });
  answer(true); await f.settle();
  assert.equal(f.jobs.length, 0);
  assert.equal(f.supervisor.list()[0]?.status, "stopped");
});

test("an exit after a deliberate stop does not mark the site crashed", async () => {
  const f = controllable();
  await f.supervisor.start({ name: "a" });
  const exit = f.children[0]!.exit;
  await f.supervisor.stop({ name: "a" });
  exit(); await f.settle();
  assert.equal(f.supervisor.list()[0]?.status, "stopped");
});

test("stopping an unknown site reports it stopped", async () => {
  const f = controllable();
  assert.deepEqual(await f.supervisor.stop({ name: "a" }), { name: "a", status: "stopped", pid: null, port: null, daemonPort: null, adminUrl: null });
});

test("stopping a site another app runs is refused", async () => {
  const f = controllable({ existing: ({ name }) => foreignState(name) });
  await assert.rejects(f.supervisor.stop({ name: "a" }), { message: "SITE_RUNNING_ELSEWHERE" });
});

test("list adds sites other apps run, but this host's own child wins", async () => {
  const f = controllable({ listExisting: () => [foreignState("a"), foreignState("b")] });
  await f.supervisor.start({ name: "a" });
  assert.deepEqual(f.supervisor.list().map((site) => [site.name, site.pid]), [["a", 201], ["b", 77]]);
});

test("folder mutation is refused while another app runs the site", async () => {
  const f = controllable({ existing: ({ name }) => foreignState(name) });
  await assert.rejects(f.supervisor.withStoppedSite({ name: "a", task: async () => "never" }), { message: "SITE_RUNNING" });
});

test("folder mutation is refused while this host is still launching the site", async () => {
  let release!: (child: LocalSiteProcess) => void;
  const f = controllable({ launch: () => new Promise<LocalSiteProcess>((resolve) => { release = resolve; }) });
  const starting = f.supervisor.start({ name: "a" });
  await f.settle();
  const mutation = f.supervisor.withStoppedSite({ name: "a", task: async () => "never" });
  release({ pid: 5, onExit() {}, ready: async () => true, terminate: async () => {}, killNow() {} });
  await starting;
  await assert.rejects(mutation, { message: "SITE_RUNNING" });
});

test("folder mutation runs its task for a stopped site", async () => {
  const f = controllable();
  assert.equal(await f.supervisor.withStoppedSite({ name: "a", task: async () => "done" }), "done");
});

test("killNow cancels probes and signals every child synchronously", async () => {
  const f = controllable();
  await f.supervisor.start({ name: "a" });
  f.supervisor.killNow();
  assert.equal(f.children[0]?.killed, true);
  assert.equal(f.control.cancels, 1);
  assert.equal(f.supervisor.list()[0]?.status, "stopped");
});

test("this host's own live child answers Start even when another app also reports the site", async () => {
  let foreign: LocalSiteState | null = null;
  const f = controllable({ existing: () => foreign });
  const own = await f.supervisor.start({ name: "a" });
  foreign = foreignState("a");
  assert.deepEqual(await f.supervisor.start({ name: "a" }), own);
  assert.equal(f.children.length, 1);
});

test("host shutdown while ports are being allocated refuses to launch", async () => {
  let free!: (isFree: boolean) => void;
  const f = controllable({ isPortFree: () => new Promise<boolean>((resolve) => { free = resolve; }) });
  const starting = f.supervisor.start({ name: "a" });
  await f.settle();
  const stopped = f.supervisor.shutdown();
  free(true); await f.settle(); free(true);
  await assert.rejects(starting, { message: "SITE_HOST_STOPPING" });
  await stopped;
  assert.equal(f.children.length, 0);
});

test("startLocalSiteWhenRunning waits for the probe to report running before handing back adminUrl", async () => {
  const f = fixture();
  const sleeps: number[] = [];
  const state = await startLocalSiteWhenRunning({ supervisor: f.supervisor, name: "a" }, { intervalMs: 7, sleep: async (ms) => { sleeps.push(ms); await f.tick(); } });
  assert.equal(state.status, "running");
  assert.equal(state.adminUrl, "https://localhost:3102/admin/");
  assert.deepEqual(sleeps, [7]);
});

test("startLocalSiteWhenRunning stops waiting after its attempts and returns the still-starting state", async () => {
  const started: LocalSiteState = { name: "a", status: "starting", pid: 1, port: 3102, daemonPort: 3103, adminUrl: "http://localhost:3102/admin/" };
  let sleeps = 0;
  const state = await startLocalSiteWhenRunning({ supervisor: { start: async () => started, list: () => [] }, name: "a" }, { attempts: 2, sleep: async () => { sleeps++; } });
  assert.equal(state, started);
  assert.equal(sleeps, 2);
});

test("startLocalSiteWhenRunning returns a crash without a link and uses the real timer by default", async () => {
  const crashed: LocalSiteState = { name: "a", status: "crashed", pid: null, port: null, daemonPort: null, adminUrl: null };
  const starting: LocalSiteState = { ...crashed, status: "starting" };
  const state = await startLocalSiteWhenRunning({ supervisor: { start: async () => starting, list: () => [crashed] }, name: "a" }, { intervalMs: 1 });
  assert.equal(state.adminUrl, null);
  assert.equal(state.status, "crashed");
});
