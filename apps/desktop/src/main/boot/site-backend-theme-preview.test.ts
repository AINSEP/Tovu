/**
 * @file A sites-home open (`site-backend.ts`'s `openSiteServer`) driving the real theme-preview
 * subscriptions (`site-theme-preview.ts`): the open's `syncThemePreview` port is the controller's own
 * `sync`, as the Electron entry binds it. Replaces `main-theme-preview-wiring.test.ts`'s cut-out
 * evaluation of `openSiteServer`, which no longer lives in the entry.
 *
 * The controller's `current` port below mirrors the entry's: the live `openSites` entry's port and
 * workspace, the site's own partition, and the server handle itself as the lifecycle. Every other
 * site-backend port is an inert fake; `site-backend.test.ts` covers them.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createSiteBackend, type SiteBackendPorts, type SiteBackendServer } from "./site-backend.ts";
import { createSiteThemePreviewSubscriptions, type SiteThemePreviewTarget, type ThemePreviewFrame } from "../../site-theme-preview.ts";
import type { SiteThemePreviewRefresh } from "../../contracts/project.ts";

interface OpenedStream { siteDir: string; target: SiteThemePreviewTarget; onFrame: (frame: ThemePreviewFrame) => void }

function server(port: number): SiteBackendServer {
  return { adminUrl: `http://127.0.0.1:${port}/admin/`, port, workspaceId: "own-workspace", pid: port, bootToken: null, onExit: () => {} };
}

/** A sites-home launch: the shared `openSites` map, the real theme controller over it, and a backend
 *  whose `startServer` hands out a fresh handle on the next port each time. */
function launch() {
  const openSites = new Map<string, { server: SiteBackendServer; siteDir: string }>();
  const streams: OpenedStream[] = [];
  let closed = 0;
  let starts = 0;
  let nextPort = 4100;
  const themePreviews = createSiteThemePreviewSubscriptions({ ports: {
    current: ({ siteDir }) => {
      const entry = openSites.get(siteDir);
      return entry ? { port: entry.server.port, workspaceId: entry.server.workspaceId, partition: `persist:${siteDir}`, lifecycle: entry.server } : undefined;
    },
    open: ({ siteDir, target, onFrame }) => { streams.push({ siteDir, target, onFrame }); return () => { closed++; }; },
  } });
  const ports: SiteBackendPorts<SiteBackendServer> = {
    partitionFor: ({ siteDir }) => `persist:${siteDir}`,
    attachRunning: () => null,
    rememberOpen: () => {},
    resolveAdminDevProxyUrl: async () => null,
    startCaptureBridge: async () => ({ env: {}, close: () => {} }),
    startServer: async () => { starts++; const handle = server(nextPort); nextPort += 200; return handle; },
    baseToolchainEnv: undefined,
    recordSiteOpened: () => {},
    now: () => 0,
    armOwnerSignIn: () => {},
    ensureSession: async () => true,
    redeemBootSession: async () => ({ ok: true }),
    // Any user-data override skips the desktop-tools announce, which this file is not about.
    env: { TOVU_DESKTOP_USER_DATA_DIR: "" },
    electronPath: () => "/electron",
    bridgePath: "/bridge.ts",
    userDataDir: () => "/user-data",
    writeMcpLauncher: () => assert.fail("the announce is skipped"),
    registerMcpServer: () => assert.fail("the announce is skipped"),
    log: () => {}, warn: () => {}, error: () => {},
    openSites,
    schedulePreview: () => {},
    syncThemePreview: ({ siteDir }) => themePreviews.sync({ siteDir }, {}),
  };
  return {
    backend: createSiteBackend({ ports }), themePreviews, openSites, streams,
    closed: () => closed, starts: () => starts,
  };
}

const ctx = { cliMode: "source" as const, registryPath: "/user-data/registry" };

test("a watched tab's stream opens when its site first starts, against that server's port, workspace and partition", async () => {
  const site = launch();
  const delivered: SiteThemePreviewRefresh[] = [];
  site.themePreviews.watch({ siteDir: "/a", listener: (frame) => delivered.push(frame) });
  assert.equal(site.streams.length, 0, "nothing is running yet, so nothing is streamed");
  await site.backend.openSiteServer({ siteDir: "/a", ctx });
  assert.equal(site.streams.length, 1);
  const target = site.streams[0]!.target;
  assert.deepEqual({ port: target.port, workspaceId: target.workspaceId, partition: target.partition }, { port: 4100, workspaceId: "own-workspace", partition: "persist:/a" });
  assert.equal(target.lifecycle, site.openSites.get("/a")?.server);
  site.streams[0]!.onFrame({ revision: "r1" });
  assert.deepEqual(delivered, [{ siteDir: "/a", revision: "r1" }]);
});

test("after Stop a late frame from the old server is dropped, and a restart streams from the new server", async () => {
  const site = launch();
  const delivered: SiteThemePreviewRefresh[] = [];
  const off = site.themePreviews.watch({ siteDir: "/a", listener: (frame) => delivered.push(frame) });
  await site.backend.openSiteServer({ siteDir: "/a", ctx });
  // A card's Stop: the entry's cancelPreviewCapture stops the stream, and the supervisor drops the entry.
  site.themePreviews.stop({ siteDir: "/a" }, {});
  site.openSites.delete("/a");
  site.streams[0]!.onFrame({ revision: "late" });
  assert.deepEqual(delivered, []);
  await site.backend.openSiteServer({ siteDir: "/a", ctx });
  assert.equal(site.streams.length, 2);
  assert.equal(site.streams[1]!.target.port, 4300);
  site.streams[1]!.onFrame({ revision: "fresh" });
  assert.deepEqual(delivered, [{ siteDir: "/a", revision: "fresh" }]);
  off();
  assert.equal(site.closed(), 2, "the stopped stream and the restarted one are both closed");
  site.themePreviews.dispose();
});

test("an open with no tab watching the site starts its server but opens no stream", async () => {
  const site = launch();
  await site.backend.openSiteServer({ siteDir: "/a", ctx });
  assert.equal(site.starts(), 1);
  assert.equal(site.streams.length, 0);
});

test("reopening a site that is already open reuses its server and keeps its one stream", async () => {
  const site = launch();
  site.themePreviews.watch({ siteDir: "/a", listener: () => {} });
  const first = await site.backend.openSiteServer({ siteDir: "/a", ctx });
  const second = await site.backend.openSiteServer({ siteDir: "/a", ctx });
  assert.equal(second, first);
  assert.equal(site.starts(), 1);
  assert.equal(site.streams.length, 1);
  assert.equal(site.closed(), 0);
});
