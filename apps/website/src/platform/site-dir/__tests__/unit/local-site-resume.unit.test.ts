import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createLocalSiteIntentStore } from "../../local-site-intent.js";
import { createLocalSiteSupervisor, type LocalSiteProcess, type LocalSiteProcessPort, type LocalSiteState } from "../../local-site-supervisor.js";

const settle = () => new Promise<void>(resolve => setImmediate(resolve));
function workspace(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), "site-resume-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { dir, store: createLocalSiteIntentStore({ servingSiteDir: dir }) };
}
function host(t: TestContext, dir: string, session: string | null = "dev-42", overrides: Partial<LocalSiteProcessPort> = {}, maxConcurrent = 3) {
  const jobs: Array<{ run: () => void; delayMs: number }> = [];
  const launches: Array<{ name: string; port: number }> = [];
  const exits: Array<() => void> = [];
  const processPort: LocalSiteProcessPort = {
    isPortFree: async () => true,
    schedule(job) { jobs.push(job); return () => {}; },
    async launch(input): Promise<LocalSiteProcess> {
      launches.push(input);
      return { pid: 42, onExit({ listener }) { exits.push(listener); }, ready: async () => true,
        terminate: async () => {}, killNow() { exits.at(-1)?.(); } };
    },
    ...overrides,
  };
  const supervisor = createLocalSiteSupervisor({ processPort, servingName: "owner", scheme: "http" }, {
    intentPort: createLocalSiteIntentStore({ servingSiteDir: dir }),
    ...(session === null ? {} : { devSession: session }), maxConcurrent,
  });
  t.after(() => supervisor.shutdown());
  return { supervisor, launches, exits, jobs };
}

for (const phase of ["starting", "running"] as const) test(`same-session restart resumes a ${phase} site on its stored port`, async t => {
  const { dir, store } = workspace(t);
  const first = host(t, dir);
  await first.supervisor.start({ name: "fake-test-site" });
  if (phase === "running") { first.jobs.shift()!.run(); await settle(); }
  assert.equal(first.supervisor.list()[0]?.status, phase);
  await first.supervisor.shutdown();
  assert.deepEqual(store.read(), { session: "dev-42", sites: { "fake-test-site": { port: 3101 } } });
  const next = host(t, dir);
  await next.supervisor.resume();
  assert.deepEqual(next.launches, [{ name: "fake-test-site", port: 3101, daemonPort: 3102 }]);
  next.jobs.shift()!.run(); await settle();
  assert.equal(next.supervisor.list()[0]?.status, "running");
});

test("intent is durable before launch, even if shutdown interrupts an awaited spawn", async t => {
  const { dir, store } = workspace(t);
  let release!: (child: LocalSiteProcess) => void;
  const first = host(t, dir, "dev-42", { launch: () => new Promise(resolve => { release = resolve; }) });
  const starting = first.supervisor.start({ name: "mid-start" });
  await settle();
  // Always release the fake spawn, including on a failed assertion, so a red test cannot hang teardown.
  let stopped: Promise<void>;
  try { assert.equal(store.read()?.sites["mid-start"]?.port, 3101); }
  finally {
    stopped = first.supervisor.shutdown();
    release({ pid: 4, onExit() {}, ready: async () => true, terminate: async () => {}, killNow() {} });
  }
  await assert.rejects(starting, /SITE_HOST_STOPPING/); await stopped;
  const next = host(t, dir);
  await next.supervisor.resume();
  assert.equal(next.launches[0]?.name, "mid-start");
});

test("explicit Stop withdraws intent before signalling and prevents resume", async t => {
  const { dir, store } = workspace(t);
  const first = host(t, dir, "dev-42", { launch: async () => ({ pid: 4, onExit() {}, ready: async () => true, killNow() {},
    terminate: async () => { assert.deepEqual(store.read()?.sites, {}); } }) });
  await first.supervisor.start({ name: "stopped" });
  await first.supervisor.stop({ name: "stopped" });
  await first.supervisor.shutdown();
  const next = host(t, dir);
  await next.supervisor.resume();
  assert.deepEqual(next.launches, []);
});

test("a different dev session cannot resume prior intent", async t => {
  const { dir } = workspace(t);
  const first = host(t, dir);
  await first.supervisor.start({ name: "old" }); await first.supervisor.shutdown();
  const next = host(t, dir, "dev-43");
  await next.supervisor.resume();
  assert.deepEqual(next.launches, []);
});

test("without a dev session both resume and intent writes are inert", async t => {
  const { dir, store } = workspace(t);
  store.write({ intent: { session: "dev-42", sites: { old: { port: 3201 } } } });
  const before = readFileSync(join(dir, "ops/local-sites-intent.json"), "utf8");
  const next = host(t, dir, null);
  await next.supervisor.resume();
  assert.deepEqual(next.launches, []);
  await next.supervisor.start({ name: "manual" });
  await next.supervisor.stop({ name: "manual" });
  assert.equal(readFileSync(join(dir, "ops/local-sites-intent.json"), "utf8"), before);
});

test("a crashed resume clears intent and is attempted only once per boot", async t => {
  const { dir, store } = workspace(t);
  const first = host(t, dir);
  await first.supervisor.start({ name: "crasher" }); await first.supervisor.shutdown();
  const next = host(t, dir);
  await next.supervisor.resume(); next.exits[0]!(); await settle();
  assert.deepEqual(store.read()?.sites, {});
  await next.supervisor.resume();
  assert.equal(next.launches.length, 1);
  await next.supervisor.shutdown();
  const third = host(t, dir); await third.supervisor.resume();
  assert.deepEqual(third.launches, []);
});

test("a failed launch clears intent", async t => {
  const { dir, store } = workspace(t);
  const first = host(t, dir, "dev-42", { launch: async () => { throw new Error("spawn failed"); } });
  await assert.rejects(first.supervisor.start({ name: "failed" }), /SITE_START_FAILED/);
  assert.deepEqual(store.read()?.sites, {});
});

test("resume waits for a foreign record and its preferred port to clear", async t => {
  const { dir, store } = workspace(t);
  store.write({ intent: { session: "dev-42", sites: { old: { port: 3201 } } } });
  let occupied = true;
  const foreign: LocalSiteState = { name: "old", status: "running", pid: 99, port: 3201, daemonPort: null, adminUrl: null };
  const next = host(t, dir, "dev-42", { existing: () => occupied ? foreign : null, isPortFree: async ({ port }) => port !== 3201 || !occupied });
  const resuming = next.supervisor.resume(); await settle();
  assert.equal(next.launches.length, 0);
  assert.equal(next.jobs[0]?.delayMs, 500);
  occupied = false; next.jobs.shift()!.run(); await resuming;
  assert.equal(next.launches[0]?.port, 3201);
});

test("resume falls back after five seconds of preferred-port contention", async t => {
  const { dir, store } = workspace(t);
  store.write({ intent: { session: "dev-42", sites: { old: { port: 3201 } } } });
  const next = host(t, dir, "dev-42", { isPortFree: async ({ port }) => port !== 3201 });
  const resuming = next.supervisor.resume(); await settle();
  for (let i = 0; i < 10; i++) { assert.equal(next.jobs[0]?.delayMs, 500); next.jobs.shift()!.run(); await settle(); }
  await resuming;
  assert.equal(next.launches[0]?.port, 3101);
  assert.equal(store.read()?.sites.old?.port, 3101);
});

test("resume shares the serial lane and capacity with manual starts", async t => {
  const { dir, store } = workspace(t);
  store.write({ intent: { session: "dev-42", sites: { a: { port: 3201 }, b: { port: 3202 }, c: { port: 3203 } } } });
  const next = host(t, dir, "dev-42", {}, 2);
  await Promise.all([next.supervisor.start({ name: "manual" }), next.supervisor.resume(), next.supervisor.resume()]);
  assert.deepEqual(next.launches.map(site => site.name), ["manual", "a"]);
  assert.deepEqual(Object.keys(store.read()!.sites), ["a", "manual"]);
});

test("an explicit Stop queued during recovery prevents that site's later resume", async t => {
  const { dir, store } = workspace(t);
  store.write({ intent: { session: "dev-42", sites: { a: { port: 3201 }, b: { port: 3202 } } } });
  const next = host(t, dir);
  await Promise.all([next.supervisor.resume(), next.supervisor.stop({ name: "b" })]);
  assert.deepEqual(next.launches.map(site => site.name), ["a"]);
  assert.deepEqual(store.read()?.sites, { a: { port: 3201 } });
});

test("a resumed launch failure withdraws intent without blocking the next site", async t => {
  const { dir, store } = workspace(t);
  store.write({ intent: { session: "dev-42", sites: { failed: { port: 3201 }, next: { port: 3202 } } } });
  const next = host(t, dir, "dev-42", { launch: async ({ name }) => {
    if (name === "failed") throw new Error("spawn failed");
    return { pid: 42, onExit() {}, ready: async () => true, terminate: async () => {}, killNow() {} };
  } });
  await next.supervisor.resume();
  assert.deepEqual(store.read()?.sites, { next: { port: 3202 } });
  assert.deepEqual(next.supervisor.list().map(site => [site.name, site.status]), [["failed", "crashed"], ["next", "starting"]]);
});

test("a failed manual Start at capacity withdraws its pending recovery intent", async t => {
  const { dir, store } = workspace(t);
  store.write({ intent: { session: "dev-42", sites: { pending: { port: 3201 } } } });
  const next = host(t, dir, "dev-42", {}, 1);
  await next.supervisor.start({ name: "manual" });
  await assert.rejects(next.supervisor.start({ name: "pending" }), /SITE_LIMIT/);
  assert.deepEqual(store.read()?.sites, { manual: { port: 3101 } });
});

test("explicit Stop withdraws intent even while the old host still owns the site", async t => {
  const { dir, store } = workspace(t);
  store.write({ intent: { session: "dev-42", sites: { old: { port: 3201 } } } });
  let occupied = true;
  const next = host(t, dir, "dev-42", { existing: () => occupied ? {
    name: "old", status: "running", pid: 99, port: 3201, daemonPort: null, adminUrl: null,
  } : null });
  await assert.rejects(next.supervisor.stop({ name: "old" }), /SITE_RUNNING_ELSEWHERE/);
  assert.deepEqual(store.read()?.sites, {});
  occupied = false;
  await next.supervisor.resume();
  assert.deepEqual(next.launches, []);
});
