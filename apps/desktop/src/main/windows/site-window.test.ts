/**
 * @file `site-window.ts`: own-server mode's per-site window, driven with an in-memory `openSites`,
 * fake windows and servers, and the real shutdown tracker for the close-time teardown.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createShutdownTracker } from "@jini-ai/desktop-host/shutdown";
import type { QuitPhase } from "@jini-ai/desktop-host/shutdown";

import { handleSiteWindowClosed, openSiteWindow, retainsSiteOnClose } from "./site-window.ts";
import type { SiteWindow, SiteWindowEntry, SiteWindowPorts, SiteWindowServer } from "./site-window.ts";

interface FakeWindow extends SiteWindow {
  id: string;
  destroyed: boolean;
  shown: number;
  focused: number;
  closed?: () => void;
}

interface FakeServer extends SiteWindowServer {
  stops: number;
}

interface Ctx { registryPath: string }

const CTX: Ctx = { registryPath: "/registry" };
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function fakeWindow(id: string): FakeWindow {
  const window: FakeWindow = {
    id, destroyed: false, shown: 0, focused: 0,
    isDestroyed: () => window.destroyed,
    show: () => { window.shown++; },
    focus: () => { window.focused++; },
    on: (_event, listener) => { window.closed = listener; return window; },
  };
  return window;
}

function fakeServer(pid: number, stop: () => Promise<unknown> = async () => {}): FakeServer {
  const server: FakeServer = {
    adminUrl: `http://127.0.0.1:${4000 + pid}/admin/`, pid, stops: 0,
    stop: () => { server.stops++; return stop(); },
  };
  return server;
}

/** Ports over an in-memory `openSites`, recording every effect into `log` in order. */
function harness(overrides: Partial<SiteWindowPorts<FakeServer, FakeWindow, Ctx>> = {}) {
  const log: string[] = [];
  const openSites = new Map<string, SiteWindowEntry<FakeServer, FakeWindow>>();
  const tracker = createShutdownTracker({});
  let quitPhase: QuitPhase = "idle";
  let spawned = 0;
  const backendCalls: Array<{ siteDir: string; ctx: Ctx; port?: number }> = [];
  const ports: SiteWindowPorts<FakeServer, FakeWindow, Ctx> = {
    openSites,
    startSiteBackend: async ({ siteDir, ctx }, options) => {
      backendCalls.push({ siteDir, ctx, ...options });
      spawned++;
      log.push(`spawn ${siteDir}`);
      return { server: fakeServer(spawned), partition: `persist:${siteDir}` };
    },
    sitePartition: (siteDir) => `persist:${siteDir}`,
    createWindow: ({ url, title, partition }) => { log.push(`window ${url} ${title} ${partition}`); return fakeWindow(`w${log.length}`); },
    readSiteName: (siteDir) => `Name of ${siteDir}`,
    recordSiteClosed: ({ registryPath, siteDir, pid }) => { log.push(`row-closed ${registryPath} ${siteDir} ${pid}`); },
    scheduleSitePreview: (siteDir) => { log.push(`preview ${siteDir}`); },
    siteThemePreviews: {
      sync: ({ siteDir }) => { log.push(`theme-sync ${siteDir}`); },
      stop: ({ siteDir }) => { log.push(`theme-stop ${siteDir}`); },
    },
    sitePreviewScheduler: { cancel: ({ siteDir }) => { log.push(`preview-cancel ${siteDir}`); } },
    endSiteSession: async ({ partition, adminUrl }) => { log.push(`logout ${partition} ${adminUrl}`); },
    trackTeardown: ({ promise }) => tracker.track({ promise }),
    platform: "win32",
    quitPhase: () => quitPhase,
    logError: (message) => { log.push(`error ${message}`); },
    ...overrides,
  };
  return { ports, log, openSites, tracker, backendCalls, setQuitPhase: (phase: QuitPhase) => { quitPhase = phase; } };
}

test("retainsSiteOnClose: only macOS with no quit under way keeps the site running", () => {
  const phases: QuitPhase[] = ["idle", "draining", "drained"];
  for (const platform of ["darwin", "win32", "linux"]) {
    for (const quitPhase of phases) {
      assert.equal(retainsSiteOnClose({ platform, quitPhase }), platform === "darwin" && quitPhase === "idle", `${platform}/${quitPhase}`);
    }
  }
});

test("a first open spawns the server, creates its titled window on the site's partition, publishes it, then schedules previews", async () => {
  const h = harness();
  const window = await openSiteWindow({ siteDir: "/a", ctx: CTX, ports: h.ports }, { port: 4100 });
  assert.deepEqual(h.backendCalls, [{ siteDir: "/a", ctx: CTX, port: 4100 }]);
  assert.deepEqual(h.log, ["spawn /a", "window http://127.0.0.1:4001/admin/ Name of /a persist:/a", "preview /a", "theme-sync /a"]);
  const entry = h.openSites.get("/a");
  assert.equal(entry?.window, window);
  assert.equal(entry?.server.pid, 1);
  assert.equal(entry?.siteDir, "/a");
  assert.ok(window.closed, "a closed listener is registered");
});

test("with no options the backend gets no pinned port", async () => {
  const h = harness();
  await openSiteWindow({ siteDir: "/a", ctx: CTX, ports: h.ports });
  assert.deepEqual(h.backendCalls, [{ siteDir: "/a", ctx: CTX }]);
});

test("an open site's live window is shown and focused, never re-created or re-spawned", async () => {
  const h = harness();
  const first = await openSiteWindow({ siteDir: "/a", ctx: CTX, ports: h.ports });
  h.log.length = 0;
  const again = await openSiteWindow({ siteDir: "/a", ctx: CTX, ports: h.ports });
  assert.equal(again, first);
  assert.equal(first.shown, 1);
  assert.equal(first.focused, 1);
  assert.deepEqual(h.log, []);
});

test("a retained server (macOS window closed) is reused with its own partition — no second spawn", async () => {
  const h = harness();
  const server = fakeServer(7);
  h.openSites.set("/a", { server, siteDir: "/a" });
  const window = await openSiteWindow({ siteDir: "/a", ctx: CTX, ports: h.ports });
  assert.deepEqual(h.backendCalls, []);
  assert.deepEqual(h.log, ["window http://127.0.0.1:4007/admin/ Name of /a persist:/a", "preview /a", "theme-sync /a"]);
  assert.equal(h.openSites.get("/a")?.server, server);
  assert.equal(h.openSites.get("/a")?.window, window);
});

test("an entry whose window was destroyed reuses the server and replaces the window", async () => {
  const h = harness();
  const server = fakeServer(3);
  const dead = fakeWindow("dead");
  dead.destroyed = true;
  h.openSites.set("/a", { server, window: dead, siteDir: "/a" });
  const window = await openSiteWindow({ siteDir: "/a", ctx: CTX, ports: h.ports });
  assert.notEqual(window, dead);
  assert.equal(dead.shown, 0);
  assert.deepEqual(h.backendCalls, []);
  assert.equal(h.openSites.get("/a")?.window, window);
});

test("a window that cannot be created after a fresh spawn drops the row, stops the child, and rethrows", async () => {
  const h = harness({ createWindow: () => { throw new Error("no window"); } });
  await assert.rejects(openSiteWindow({ siteDir: "/a", ctx: CTX, ports: h.ports }), { message: "no window" });
  assert.deepEqual(h.log, ["spawn /a", "row-closed /registry /a 1"]);
  assert.equal(h.openSites.has("/a"), false, "nothing is published for a failed open");
});

test("a window that cannot be created over a REUSED server leaves that server and its row alone", async () => {
  const h = harness({ createWindow: () => { throw new Error("no window"); } });
  const server = fakeServer(9);
  h.openSites.set("/a", { server, siteDir: "/a" });
  await assert.rejects(openSiteWindow({ siteDir: "/a", ctx: CTX, ports: h.ports }), { message: "no window" });
  assert.equal(server.stops, 0);
  assert.deepEqual(h.log, []);
  assert.equal(h.openSites.get("/a")?.server, server);
});

test("a failed rollback stop surfaces instead of the window error", async () => {
  const h = harness({
    createWindow: () => { throw new Error("no window"); },
    startSiteBackend: async () => ({ server: fakeServer(1, async () => { throw new Error("stop failed"); }), partition: "p" }),
  });
  await assert.rejects(openSiteWindow({ siteDir: "/a", ctx: CTX, ports: h.ports }), { message: "stop failed" });
});

test("a backend that fails to start opens nothing", async () => {
  const h = harness({ startSiteBackend: async () => { throw new Error("spawn failed"); } });
  await assert.rejects(openSiteWindow({ siteDir: "/a", ctx: CTX, ports: h.ports }), { message: "spawn failed" });
  assert.deepEqual(h.log, []);
});

test("macOS close (not quitting) releases only the window: the server, row and session stay", async () => {
  const h = harness({ platform: "darwin" });
  const window = await openSiteWindow({ siteDir: "/a", ctx: CTX, ports: h.ports });
  const entry = h.openSites.get("/a");
  h.log.length = 0;
  window.closed!(); // `!`: registered by openSiteWindow.
  assert.equal(h.openSites.get("/a"), entry);
  assert.equal(entry?.window, undefined);
  assert.equal(h.tracker.size, 0);
  assert.deepEqual(h.log, []);
});

test("macOS close of a stale window leaves a replacement entry's window in place", async () => {
  const h = harness({ platform: "darwin" });
  const stale = await openSiteWindow({ siteDir: "/a", ctx: CTX, ports: h.ports });
  const replacement = { server: fakeServer(5), window: fakeWindow("new"), siteDir: "/a" };
  h.openSites.set("/a", replacement);
  stale.closed!(); // `!`: registered by openSiteWindow.
  assert.equal(replacement.window.id, "new");
  assert.equal(h.openSites.get("/a")?.window, replacement.window);
});

test("macOS close with no entry left does nothing", () => {
  const h = harness({ platform: "darwin" });
  const window = fakeWindow("w");
  handleSiteWindowClosed({ siteDir: "/gone", ctx: CTX, window, server: fakeServer(1), partition: "p", ports: h.ports });
  assert.deepEqual(h.log, []);
  assert.equal(h.tracker.size, 0);
});

for (const [platform, phase] of [["win32", "idle"], ["linux", "idle"], ["darwin", "draining"], ["darwin", "drained"]] as const) {
  test(`${platform} close during ${phase}: unpublish, then logout → stop → row, tracked until done`, async () => {
    const h = harness({ platform });
    const window = await openSiteWindow({ siteDir: "/a", ctx: CTX, ports: h.ports });
    const server = h.openSites.get("/a")!.server; // `!`: just opened.
    h.setQuitPhase(phase);
    h.log.length = 0;
    window.closed!(); // `!`: registered by openSiteWindow.
    assert.equal(h.openSites.has("/a"), false);
    assert.equal(h.tracker.size, 1, "the drain must be able to find this stop");
    await h.tracker.drain();
    assert.deepEqual(h.log, [
      "preview-cancel /a", "theme-stop /a",
      "logout persist:/a http://127.0.0.1:4001/admin/",
      "row-closed /registry /a 1",
    ]);
    assert.equal(server.stops, 1);
  });
}

test("the crash-safety row outlives a pending stop", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const h = harness({ startSiteBackend: async () => ({ server: fakeServer(1, () => pending), partition: "p" }) });
  const window = await openSiteWindow({ siteDir: "/a", ctx: CTX, ports: h.ports });
  window.closed!(); // `!`: registered by openSiteWindow.
  await flush();
  assert.equal(h.log.some((step) => step.startsWith("row-closed")), false, "no row drop while the child may still run");
  assert.equal(h.tracker.size, 1);
  release();
  await h.tracker.drain();
  assert.ok(h.log.includes("row-closed /registry /a 1"));
});

test("a failed logout never blocks the stop", async () => {
  const h = harness({ endSiteSession: async () => { throw new Error("offline"); } });
  const window = await openSiteWindow({ siteDir: "/a", ctx: CTX, ports: h.ports });
  window.closed!(); // `!`: registered by openSiteWindow.
  await h.tracker.drain();
  assert.equal(h.openSites.size, 0);
  assert.ok(h.log.includes("row-closed /registry /a 1"));
  assert.equal(h.log.some((step) => step.startsWith("error")), false);
});

test("a stop that cannot confirm exit is logged and keeps its recovery row", async () => {
  const h = harness({ startSiteBackend: async () => ({ server: fakeServer(1, async () => { throw new Error("exit not observed"); }), partition: "p" }) });
  const window = await openSiteWindow({ siteDir: "/a", ctx: CTX, ports: h.ports });
  window.closed!(); // `!`: registered by openSiteWindow.
  await h.tracker.drain();
  assert.equal(h.log.some((step) => step.startsWith("row-closed")), false);
  assert.ok(h.log.includes("error [tovu-desktop] site shutdown failed: exit not observed"));
});

test("closing a stale window stops ITS server but never deletes the replacement entry", async () => {
  const h = harness();
  const stale = await openSiteWindow({ siteDir: "/a", ctx: CTX, ports: h.ports });
  const staleServer = h.openSites.get("/a")!.server; // `!`: just opened.
  const replacement = { server: fakeServer(8), window: fakeWindow("new"), siteDir: "/a" };
  h.openSites.set("/a", replacement);
  h.log.length = 0;
  stale.closed!(); // `!`: registered by openSiteWindow.
  await h.tracker.drain();
  assert.equal(h.openSites.get("/a"), replacement);
  assert.equal(staleServer.stops, 1);
  assert.equal(replacement.server.stops, 0);
  assert.equal(h.log.includes("preview-cancel /a"), false);
  assert.equal(h.log.includes("theme-stop /a"), false);
});
