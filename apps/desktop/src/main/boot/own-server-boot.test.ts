/**
 * @file Behaviour of own-server boot (`own-server-boot.ts`): startup site-dir precedence and the
 * pinned port, orphan reconciliation reporting, the startup open order, and what a Dock click
 * restores. Replaces the cut-out-eval `activate` check in `main-desktop-easy-wins.test.ts` and the
 * source-order checks on `reconcileOrphansOnBoot`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  bootOwnServerMode, createOwnServerActivate, ENV_SITE_DIR_ON_MISSING, reconcileOrphansOnBoot, resolveStartupSiteDirs,
  shouldReopenOnActivate, type OwnServerBootPorts, type OwnServerCtx, type StartupSiteDirPorts,
} from "./own-server-boot.ts";

const baseCtx = (): OwnServerCtx => ({ cliMode: "source", statePath: "/ud/desktop-state.json", registryPath: "/ud/registry" });

function dirPorts(env: Record<string, string | undefined>, overrides: Partial<StartupSiteDirPorts> = {}) {
  const initCalls: unknown[] = [];
  const resolveCalls: unknown[] = [];
  const pickDir = async () => "/picked";
  const ports: StartupSiteDirPorts = {
    env, repoRoot: "/payload", devFallbackDir: "/repo/sites/tovu-dev", pickDir,
    resolveOrInitSiteDir: async (input) => { initCalls.push(input); return `resolved:${input.dir}`; },
    resolveSiteDir: async (input) => { resolveCalls.push(input); return "/sites/chosen"; },
    ...overrides,
  };
  return { ports, initCalls, resolveCalls, pickDir };
}

test("TOVU_DESKTOP_SITE_DIRS wins outright: every dir resolves under the fail policy, in order, port left unpinned", async () => {
  const d = dirPorts({ TOVU_DESKTOP_SITE_DIRS: " /a , /b ", TOVU_DESKTOP_SITE_DIR: "/ignored", TOVU_DESKTOP_PORT: "4100" });
  const ctx = baseCtx();
  assert.deepEqual(await resolveStartupSiteDirs({ ctx, ports: d.ports }), ["resolved:/a", "resolved:/b"]);
  assert.deepEqual(d.initCalls, [
    { dir: "/a", onMissingSite: "fail", repoRoot: "/payload", cliMode: "source" },
    { dir: "/b", onMissingSite: "fail", repoRoot: "/payload", cliMode: "source" },
  ]);
  assert.deepEqual(d.resolveCalls, []);
  assert.equal("firstSitePort" in ctx, false, "the plural arm never touches the pinned port");
});

test("the plural arm fails as a whole when any one named dir is refused", async () => {
  const d = dirPorts({ TOVU_DESKTOP_SITE_DIRS: "/a,/missing" }, {
    resolveOrInitSiteDir: async ({ dir }) => { if (dir === "/missing") throw new Error("/missing holds no site"); return dir; },
  });
  await assert.rejects(resolveStartupSiteDirs({ ctx: baseCtx(), ports: d.ports }), /\/missing holds no site/);
});

test("otherwise one site via the precedence chain, with the env dir, dev fallback, picker and fail policy", async () => {
  const d = dirPorts({ TOVU_DESKTOP_SITE_DIR: "/env-site" });
  const ctx = baseCtx();
  assert.deepEqual(await resolveStartupSiteDirs({ ctx, ports: d.ports }), ["/sites/chosen"]);
  assert.deepEqual(d.resolveCalls, [{
    envDir: "/env-site", onMissingSite: ENV_SITE_DIR_ON_MISSING, statePath: "/ud/desktop-state.json",
    devFallbackDir: "/repo/sites/tovu-dev", repoRoot: "/payload", cliMode: "source", pickDir: d.pickDir,
  }]);
  assert.equal(ctx.firstSitePort, undefined);
});

test("a pinned TOVU_DESKTOP_PORT is trimmed onto ctx.firstSitePort; a blank one pins nothing", async () => {
  const pinned = baseCtx();
  await resolveStartupSiteDirs({ ctx: pinned, ports: dirPorts({ TOVU_DESKTOP_PORT: " 4100 " }).ports });
  assert.equal(pinned.firstSitePort, 4100);
  const blank = { ...baseCtx(), firstSitePort: 9 };
  await resolveStartupSiteDirs({ ctx: blank, ports: dirPorts({ TOVU_DESKTOP_PORT: "   " }).ports });
  assert.equal(blank.firstSitePort, undefined, "an earlier value is cleared, as before");
});

test("a packaged app (no dev fallback) passes null through to the chain", async () => {
  const d = dirPorts({}, { devFallbackDir: null });
  await resolveStartupSiteDirs({ ctx: baseCtx(), ports: d.ports });
  assert.equal((d.resolveCalls[0] as { devFallbackDir: unknown }).devFallbackDir, null);
});

test("a picker cancellation surfaces unchanged for the boot-failure reporter", async () => {
  const cancelled = new Error("cancelled");
  const d = dirPorts({}, { resolveSiteDir: async () => { throw cancelled; } });
  await assert.rejects(resolveStartupSiteDirs({ ctx: baseCtx(), ports: d.ports }), (error) => error === cancelled);
});

test("orphan reconciliation is silent when nothing was reaped and names every reaped site otherwise", async () => {
  const logs: string[] = [];
  await reconcileOrphansOnBoot({ registryPath: "/ud/registry", reconcileOrphans: async (p) => { assert.equal(p, "/ud/registry"); return []; }, log: (m) => logs.push(m) });
  assert.deepEqual(logs, []);
  await reconcileOrphansOnBoot({ registryPath: "/ud/registry", reconcileOrphans: async () => [{ siteDir: "/a" }, { siteDir: "/b" }], log: (m) => logs.push(m) });
  assert.deepEqual(logs, ["tovu desktop: reconciled 2 orphaned site process(es) left running by a previous crash: /a, /b"]);
});

test("a Dock click reopens only with no window left and no quit draining", () => {
  assert.equal(shouldReopenOnActivate({ windowCount: 0, quitPhase: "idle" }), true);
  assert.equal(shouldReopenOnActivate({ windowCount: 1, quitPhase: "idle" }), false);
  assert.equal(shouldReopenOnActivate({ windowCount: 0, quitPhase: "draining" }), false);
  assert.equal(shouldReopenOnActivate({ windowCount: 0, quitPhase: "drained" }), false);
});

function bootHarness(overrides: Partial<OwnServerBootPorts> = {}) {
  const events: string[] = [];
  const opens: unknown[] = [];
  const warnings: string[] = [];
  let activate: (() => void) | undefined;
  const ports: OwnServerBootPorts = {
    sitesConfigWarning: () => undefined,
    warn: (m) => warnings.push(m),
    refreshAppMenu: () => { events.push("menu"); },
    resolveStartupSiteDirs: async (ctx) => { events.push("resolve"); ctx.firstSitePort = 4100; return ["/a", "/b"]; },
    selftest: false,
    installSelftestTracker: ({ expectedCount }) => { events.push(`selftest:${expectedCount}`); },
    runSerialized: (siteDir, work) => { events.push(`serial:${siteDir}`); return work(); },
    openSiteWindow: async (required, optional) => { events.push(`open:${required.siteDir}`); opens.push([required.siteDir, optional]); },
    onActivate: (listener) => { events.push("activate-registered"); activate = listener; },
    windowCount: () => 0,
    quitPhase: () => "idle",
    openSiteDirs: () => [],
    promptAndOpenNewSite: async () => { events.push("prompt"); },
    reportBootFailure: async () => { events.push("report"); },
    ...overrides,
  };
  return { ports, events, opens, warnings, activate: () => activate!() };
}

test("own-server boot: menu, resolve, open each site serialized in order (only the first pinned), menu, then activate", async () => {
  const h = bootHarness();
  const ctx = baseCtx();
  await bootOwnServerMode({ ctx, ports: h.ports });
  assert.deepEqual(h.events, ["menu", "resolve", "serial:/a", "open:/a", "serial:/b", "open:/b", "menu", "activate-registered"]);
  assert.deepEqual(h.opens, [["/a", { port: 4100 }], ["/b", { port: undefined }]]);
  assert.deepEqual(h.warnings, []);
});

test("own-server boot opens sites one after another, never concurrently", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const h = bootHarness({
    openSiteWindow: async () => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); await new Promise((r) => setImmediate(r)); inFlight--; },
  });
  await bootOwnServerMode({ ctx: baseCtx(), ports: h.ports });
  assert.equal(maxInFlight, 1);
});

test("a self-test seeds its tracker with the FULL site count before the first window opens", async () => {
  const h = bootHarness({ selftest: true });
  await bootOwnServerMode({ ctx: baseCtx(), ports: h.ports });
  assert.ok(h.events.indexOf("selftest:2") < h.events.indexOf("open:/a"));
});

test("a sites-config warning is logged with its local-home hint before anything opens", async () => {
  const h = bootHarness({ sitesConfigWarning: () => ({ message: "Sites home is on a removable volume.", localHome: "/Users/x/Tovu" }) });
  await bootOwnServerMode({ ctx: baseCtx(), ports: h.ports });
  assert.deepEqual(h.warnings, ["[tovu-desktop] Sites home is on a removable volume. Choose appData in Sites settings or use /Users/x/Tovu."]);
});

test("a failed startup open stops the boot before the second site and the activate handler", async () => {
  const h = bootHarness({ openSiteWindow: async () => { throw new Error("spawn failed"); } });
  await assert.rejects(bootOwnServerMode({ ctx: baseCtx(), ports: h.ports }), /spawn failed/);
  assert.equal(h.events.includes("serial:/b"), false);
  assert.equal(h.events.includes("activate-registered"), false);
});

test("Dock activation restores every retained site window, even if recent-site entries were cleared", async () => {
  const h = bootHarness({ openSiteDirs: () => ["/a", "/b"], promptAndOpenNewSite: async () => assert.fail("must not prompt") });
  const ctx = baseCtx();
  createOwnServerActivate({ ctx, ports: h.ports })();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(h.opens, [["/a", {}], ["/b", {}]]);
});

test("Dock activation with nothing open asks for a site", () => {
  const h = bootHarness();
  createOwnServerActivate({ ctx: baseCtx(), ports: h.ports })();
  assert.deepEqual(h.events, ["prompt"]);
});

test("Dock activation does nothing while a window remains or a quit drains", () => {
  for (const overrides of [{ windowCount: () => 1 }, { quitPhase: () => "draining" as const }]) {
    const h = bootHarness({ ...overrides, openSiteDirs: () => ["/a"] });
    createOwnServerActivate({ ctx: baseCtx(), ports: h.ports })();
    assert.deepEqual(h.events, []);
  }
});

test("a restore that fails is reported through the boot-failure reporter; an entry without a dir is skipped", async () => {
  const h = bootHarness({ openSiteDirs: () => ["", "/a"], openSiteWindow: async () => { throw new Error("restore failed"); } });
  createOwnServerActivate({ ctx: baseCtx(), ports: h.ports })();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(h.events, ["serial:/a", "report"]);
});

test("the activate handler bootOwnServerMode registers is the restore handler", async () => {
  const h = bootHarness();
  await bootOwnServerMode({ ctx: baseCtx(), ports: h.ports });
  h.events.length = 0;
  h.activate();
  assert.deepEqual(h.events, ["prompt"]);
});
