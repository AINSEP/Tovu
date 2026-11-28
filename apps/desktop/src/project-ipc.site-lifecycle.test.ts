import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ResourcesSnapshot } from "./contracts/resources.ts";
import {
  createLifecycleApi, createSiteLifecycleCtx, notePresence, siteFailureDetails, startSite, stateFor,
  type LifecycleDeps, type OpenSiteEntry,
} from "./project-ipc.site-lifecycle.ts";
import { trackSite } from "./tracked-sites.ts";

/** A lifecycle wired to fakes only: manual timers, an in-memory open-site map, recorded ports. */
function harness({ openSites = new Map<string, OpenSiteEntry>() }: { openSites?: Map<string, OpenSiteEntry> } = {}, _optional = {}) {
  const dir = mkdtempSync(join(tmpdir(), "site-lifecycle-"));
  const timers: { delayMs: number; run: () => void; cancelled: boolean }[] = [];
  const calls: string[] = [];
  let now = 1_000;
  const deps: LifecycleDeps = {
    projectsPath: join(dir, "projects.json"),
    openSites,
    serializer: { run: ({ fn }) => fn() },
    onRestartStopped: ({ siteDir }) => { calls.push(`stopped:${siteDir}`); },
    onServerRestarted: async ({ siteDir }) => { calls.push(`restarted:${siteDir}`); },
  };
  const ports = {
    handleStart: async ({ id }: { id: string }) => { calls.push(`start:${id}`); return { id }; },
    handleStop: async ({ id }: { id: string }) => { calls.push(`stop:${id}`); return { id }; },
  };
  const ctx = createSiteLifecycleCtx({ deps, ports, sleepMinutes: () => 10, options: {
    now: () => now,
    schedule: ({ delayMs, run }) => {
      const task = { delayMs, run, cancelled: false };
      timers.push(task);
      return () => { task.cancelled = true; };
    },
  } });
  const api = createLifecycleApi({ ctx });
  const track = (siteDir: string) => trackSite({ beforeAddedRows: () => {}, projectsPath: deps.projectsPath, siteDir });
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  return { ctx, api, deps, ports, timers, calls, track, cleanup, advance: (ms: number) => { now += ms; } };
}

const unavailable = (at: number): ResourcesSnapshot => {
  const metrics = { rssBytes: 0, cpuPercent: null, memoryWarning: false, cpuWarning: false };
  return { status: "unavailable", sampledAt: at, pollIntervalMs: 5000, totalMemoryBytes: 8e9, approximate: true,
    total: metrics, app: { ...metrics, siteId: null, processes: [] }, sites: [] };
};

test("failure details name a missing exit code/signal and stringify a non-Error rejection", () => {
  assert.equal(siteFailureDetails({ exit: { code: null, signal: null } }), "Exit code: none; signal: none.\n");
  assert.equal(siteFailureDetails({ exit: { code: 3, signal: "SIGTERM" }, server: { outputTail: () => "tail" } }),
    "Exit code: 3; signal: SIGTERM.\ntail");
  assert.equal(siteFailureDetails({ error: "plain reason" }), "plain reason\n");
  assert.equal(siteFailureDetails({ error: new Error("thrown reason") }), "thrown reason\n");
});

test("the ctx defaults: placeholder presence sees no site, sleep minutes come from the caller", () => {
  const deps = { projectsPath: "/none", openSites: new Map(), serializer: { run: <T>({ fn }: { fn: () => T }) => fn() } };
  const ports = { handleStart: async () => undefined, handleStop: async () => undefined };
  const ctx = createSiteLifecycleCtx({ deps, ports, options: {}, sleepMinutes: () => 7 });
  assert.equal(ctx.presence.has({ siteId: "/sites/a" }), false);
  assert.equal(ctx.sleepMinutes(), 7);
  assert.equal(ctx.now, Date.now);
});

test("startSite joins the in-flight boot instead of starting a second one", async () => {
  const h = harness();
  try {
    const state = stateFor({ ctx: h.ctx, siteDir: "/sites/a" });
    const first = startSite({ ctx: h.ctx, siteDir: "/sites/a", state });
    assert.equal(startSite({ ctx: h.ctx, siteDir: "/sites/a", state }), first);
    assert.deepEqual(await first, { id: "/sites/a" });
    assert.deepEqual(h.calls, ["start:/sites/a"]);
    assert.equal(state.starting, undefined);
  } finally { h.cleanup(); }
});

test("a cancelled intent never reaches handleStart; manualStart re-enables it through the api", async () => {
  const h = harness({ openSites: new Map([["/sites/a", { server: {} }]]) });
  try {
    h.api.onBootFailure({ siteDir: "/sites/a", error: new Error("boom") });
    h.api.cancel({ siteDir: "/sites/a" });
    const cancelled = stateFor({ ctx: h.ctx, siteDir: "/sites/a" });
    assert.equal(cancelled.cancelled, true);
    assert.equal(await startSite({ ctx: h.ctx, siteDir: "/sites/a", state: cancelled }), undefined);
    assert.deepEqual(h.calls, []);
    h.api.manualStart({ siteDir: "/sites/a" });
    const fresh = stateFor({ ctx: h.ctx, siteDir: "/sites/a" });
    assert.notEqual(fresh, cancelled);
    assert.equal(fresh.cancelled, false);
    await startSite({ ctx: h.ctx, siteDir: "/sites/a", state: fresh });
    // The site is open, so success announces the restart to the host.
    assert.deepEqual(h.calls, ["start:/sites/a", "restarted:/sites/a"]);
    h.api.cancel({ siteDir: "/sites/a", forget: true });
    assert.equal(h.ctx.states.has("/sites/a"), false);
  } finally { h.cleanup(); }
});

test("a successful boot of a site that is not open does not announce a restart", async () => {
  const h = harness();
  try {
    await startSite({ ctx: h.ctx, siteDir: "/sites/a", state: stateFor({ ctx: h.ctx, siteDir: "/sites/a" }) });
    assert.deepEqual(h.calls, ["start:/sites/a"]);
  } finally { h.cleanup(); }
});

test("a boot that completes after dispose stops the adopted child", async () => {
  const h = harness();
  try {
    const state = stateFor({ ctx: h.ctx, siteDir: "/sites/a" });
    const work = startSite({ ctx: h.ctx, siteDir: "/sites/a", state });
    h.api.cancelAll();
    await work;
    assert.deepEqual(h.calls, ["start:/sites/a", "stop:/sites/a"]);
  } finally { h.cleanup(); }
});

test("a second failure cancels the first retry timer and schedules its own backoff", () => {
  const h = harness();
  try {
    h.api.onBootFailure({ siteDir: "/sites/a", error: new Error("one") });
    h.api.onBootFailure({ siteDir: "/sites/a", error: new Error("two") });
    assert.deepEqual(h.timers.map(t => [t.delayMs, t.cancelled]), [[1000, true], [5000, false]]);
    assert.equal(stateFor({ ctx: h.ctx, siteDir: "/sites/a" }).status, "starting");
  } finally { h.cleanup(); }
});

test("failures after dispose or cancellation record nothing and schedule nothing", () => {
  const h = harness();
  try {
    h.api.onBootFailure({ siteDir: "/sites/b", error: "x" });
    h.api.cancel({ siteDir: "/sites/b" });
    h.api.onBootFailure({ siteDir: "/sites/b", error: "y" });
    assert.equal(stateFor({ ctx: h.ctx, siteDir: "/sites/b" }).failures, 1, "only the pre-cancel failure counts");
    h.api.cancelAll();
    h.api.onBootFailure({ siteDir: "/sites/a", error: "z" });
    assert.equal(stateFor({ ctx: h.ctx, siteDir: "/sites/a" }).failures, 0);
    assert.deepEqual(h.timers.map(t => t.cancelled), [true]);
  } finally { h.cleanup(); }
});

test("server exits are ignored for external servers, after dispose, and for cancelled sites", () => {
  const h = harness();
  try {
    const crash = { code: 1, signal: null };
    h.api.onServerExit({ siteDir: "/sites/ext", exit: crash, server: { external: true } });
    assert.equal(h.ctx.states.has("/sites/ext"), false);
    h.api.onServerExit({ siteDir: "/sites/a", exit: crash, server: {} });
    assert.equal(stateFor({ ctx: h.ctx, siteDir: "/sites/a" }).failures, 1);
    h.api.cancel({ siteDir: "/sites/a" });
    h.api.onServerExit({ siteDir: "/sites/a", exit: crash, server: {} });
    assert.equal(stateFor({ ctx: h.ctx, siteDir: "/sites/a" }).failures, 1);
    h.api.cancelAll();
    h.api.onServerExit({ siteDir: "/sites/c", exit: crash, server: {} });
    assert.equal(h.ctx.states.has("/sites/c"), false);
  } finally { h.cleanup(); }
});

test("maintenance after dispose resolves without reading tracked sites or parking anything", async () => {
  const h = harness();
  try {
    h.ctx.deps.projectsPath = join(h.deps.projectsPath, "not-a-dir", "projects.json");
    h.api.cancelAll();
    assert.equal(await h.api.maintain({ snapshot: unavailable(1_000) }), undefined);
    assert.equal(h.ctx.maintenance, undefined);
  } finally { h.cleanup(); }
});

test("idle maintenance parks an absent site, spares a present one and a server without stopIfIdle", async () => {
  const requests: string[] = [];
  const stopper = (siteDir: string) => async () => { requests.push(siteDir); return true; };
  const openSites = new Map<string, OpenSiteEntry>([
    ["/sites/absent", { server: { pid: 1, stopIfIdle: stopper("/sites/absent") } }],
    ["/sites/present", { server: { pid: 2, stopIfIdle: stopper("/sites/present") } }],
    ["/sites/legacy", { server: { pid: 3 } }],
  ]);
  const h = harness({ openSites });
  try {
    for (const siteDir of openSites.keys()) h.track(siteDir);
    let present = false;
    h.ctx.presence = { has: ({ siteId }) => present && siteId === "/sites/present" };
    await h.api.maintain({ snapshot: unavailable(1_000) });
    present = true;
    h.advance(10 * 60_000);
    await h.api.maintain({ snapshot: unavailable(1_000) });
    assert.deepEqual(requests, ["/sites/absent"]);
    h.advance(5_000);
    notePresence({ ctx: h.ctx });
    assert.equal(stateFor({ ctx: h.ctx, siteDir: "/sites/present" }).lastPresentAt, 1_000 + 10 * 60_000 + 5_000);
    assert.equal(stateFor({ ctx: h.ctx, siteDir: "/sites/absent" }).lastPresentAt, 1_000);
  } finally { h.cleanup(); }
});

test("an entry replaced while its park waited in the serializer is not stopped", async () => {
  let requests = 0;
  const server = { pid: 1, stopIfIdle: async () => { requests++; return true; } };
  const openSites = new Map<string, OpenSiteEntry>([["/sites/a", { server }]]);
  const h = harness({ openSites });
  try {
    h.track("/sites/a");
    h.deps.serializer = { run: ({ fn }) => { openSites.set("/sites/a", { server: { pid: 2 } }); return fn(); } };
    stateFor({ ctx: h.ctx, siteDir: "/sites/a" });
    h.advance(10 * 60_000);
    await h.api.maintain({ snapshot: unavailable(1_000) });
    assert.equal(requests, 0);
  } finally { h.cleanup(); }
});

test("a tab that returns while the idle park waited in the serializer keeps the site running", async () => {
  let requests = 0;
  const openSites = new Map<string, OpenSiteEntry>([["/sites/a", { server: { pid: 1, stopIfIdle: async () => { requests++; return true; } } }]]);
  const h = harness({ openSites });
  try {
    h.track("/sites/a");
    let present = false;
    h.ctx.presence = { has: () => present };
    h.deps.serializer = { run: ({ fn }) => { present = true; return fn(); } };
    stateFor({ ctx: h.ctx, siteDir: "/sites/a" });
    h.advance(10 * 60_000);
    await h.api.maintain({ snapshot: unavailable(1_000) });
    assert.equal(requests, 0);
    present = false;
    h.deps.serializer = { run: ({ fn }) => fn() };
    await h.api.maintain({ snapshot: unavailable(1_000) });
    assert.equal(requests, 1, "the same park without a returning tab does stop the idle site");
  } finally { h.cleanup(); }
});

test("the default retry scheduler runs its task and its canceller revokes it", async () => {
  const deps = { projectsPath: "/none", openSites: new Map(), serializer: { run: <T>({ fn }: { fn: () => T }) => fn() } };
  const ctx = createSiteLifecycleCtx({ deps, ports: { handleStart: async () => undefined, handleStop: async () => undefined },
    options: {}, sleepMinutes: () => 10 });
  const ran: string[] = [];
  const cancelFirst = ctx.schedule({ delayMs: 0, run: () => { ran.push("cancelled"); } });
  cancelFirst();
  // Equal-delay timers fire in creation order, so the revoked one would have run before this one.
  await new Promise<void>(resolve => { ctx.schedule({ delayMs: 0, run: () => { ran.push("kept"); resolve(); } }); });
  assert.deepEqual(ran, ["kept"]);
});
