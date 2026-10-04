/** Drive the registered callbacks with renderer payloads, observing disk and host effects. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";

import { SITE_IPC_CHANNELS, registerSiteIpcHandlers } from "./project-ipc.ts";
import type { ProjectIpcDeps } from "./project-ipc.ts";
import { sitesFilePath, trackSite, readTrackedSites, readProjectsFile } from "./tracked-sites.ts";
import { classifySiteDirSafely } from "./site-dir-store.ts";
import { writeSiteName } from "./site-config.ts";
import { addSitePointer } from "./add-site-pointer.ts";
import { createKeyedSerializer } from "./keyed-serializer.ts";

function fixture({ t }: { t: TestContext }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-ipc-dispatch-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  type Handler = Parameters<ProjectIpcDeps["ipcMain"]["handle"]>[1];
  const handlers = new Map<string, Handler>();
  const pickedFolders: string[] = [];
  const opened: string[] = [];
  const dialogs: Parameters<ProjectIpcDeps["dialog"]["showOpenDialog"]>[0][] = [];
  const adoptions: Parameters<ProjectIpcDeps["adoptSiteDir"]>[0][] = [];
  const deletedPreviews: string[] = [];
  const previews = new Map<string, string>();
  const closed: Array<{ siteDir: string; pid?: number }> = [];
  let stops = 0;
  function site({ name, siteId = name }: { name: string; siteId?: string }): string {
    const dir = path.join(root, "websites", name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name }));
    fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId, schemaVersion: 58 }));
    return dir;
  }
  const deps: ProjectIpcDeps = {
    ipcMain: { handle: (channel, handler) => { handlers.set(channel, handler); } },
    dialog: { showOpenDialog: async (options) => {
      dialogs.push(options);
      const folder = pickedFolders.shift();
      return folder === undefined ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [folder] };
    } },
    shell: { openExternal: async (url) => { opened.push(url); } },
    openSites: new Map(),
    serializer: createKeyedSerializer(),
    projectsPath: sitesFilePath(path.join(root, "state")),
    registryPath: path.join(root, "processes"),
    repoRoot: path.join(root, "repo"),
    statePath: path.join(root, "state", "desktop-state.json"),
    cliMode: "source",
    readSiteName: (dir) => (JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8")) as { name: string }).name,
    writeSiteName,
    readPreviewVersion: (dir) => previews.has(dir) ? 7 : null,
    readPreviewDataUrl: (dir) => previews.get(dir) ?? null,
    deletePreview: (dir) => { deletedPreviews.push(dir); previews.delete(dir); },
    adoptSiteDir: async (input) => {
      adoptions.push(input);
      fs.mkdirSync(input.dir, { recursive: true });
      fs.writeFileSync(path.join(input.dir, "config.json"), JSON.stringify({ name: input.name }));
      fs.writeFileSync(path.join(input.dir, ".site-meta.json"), JSON.stringify({ siteId: "created-by-fixture", schemaVersion: 58 }));
      return input.dir;
    },
    addSitePointer,
    listTokenSignInPlugins: async () => [],
    classifySiteDir: classifySiteDirSafely,
    openSiteServer: async (dir) => {
      deps.openSites.set(dir, { server: { port: 4321, origin: "http://127.0.0.1:4321", pid: 12345,
        stop: async () => { stops += 1; } } });
    },
    recordSiteClosed: (_registry, siteDir, options) => { closed.push({ siteDir, pid: options?.pid }); },
    readRegistry: () => ({ sites: [], unreadable: [] }),
    isLiveServeRow: () => false,
    siteScanRoots: [path.join(root, "websites")],
    recentSiteDirs: () => [],
    ctx: {},
  };
  registerSiteIpcHandlers(deps);
  return {
    root, deps, site, pickedFolders, opened, dialogs, adoptions, previews, deletedPreviews, closed,
    stops: () => stops,
    invoke({ channel, payload }: { channel: string; payload?: unknown }) {
      const handler = handlers.get(channel);
      assert.ok(handler, `missing registered handler: ${channel}`);
      // Distinct event and payload catch forwarding the Electron event as the renderer argument.
      return handler({ sender: "renderer-event" }, payload);
    },
  };
}

test("registered list joins current server state and returns fresh names on consecutive polls", (t) => {
  const f = fixture({ t });
  const id = f.site({ name: "listed" });
  trackSite(f.deps.projectsPath, id);
  f.deps.openSites.set(id, { server: { port: 4321 } });
  f.previews.set(id, "data:image/png;base64,AA==");
  const listed = f.invoke({ channel: SITE_IPC_CHANNELS.list });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, id);
  assert.equal(listed[0].displayName, "listed");
  assert.equal(listed[0].status, "running");
  assert.equal(listed[0].port, 4321);
  assert.equal(listed[0].previewVersion, 7);
  writeSiteName(id, "Changed since the last poll");
  assert.equal(f.invoke({ channel: SITE_IPC_CHANNELS.list })[0].displayName, "Changed since the last poll");
});

test("registered create forwards the display name to init and records the newly created identity", async (t) => {
  const f = fixture({ t });
  const dir = path.join(f.root, "new-site");
  f.pickedFolders.push(dir);
  const created = await f.invoke({ channel: SITE_IPC_CHANNELS.create, payload: { displayName: "My new website", database: { kind: "sqlite" } } });
  assert.equal(created.id, dir);
  assert.equal(created.displayName, "My new website");
  assert.equal(created.status, "stopped");
  assert.equal(created.deleteErasesFiles, true);
  assert.equal(f.adoptions.length, 1);
  assert.equal(f.adoptions[0]?.dir, dir);
  assert.equal(f.adoptions[0]?.name, "My new website");
  assert.equal(f.adoptions[0]?.repoRoot, f.deps.repoRoot);
  assert.equal(f.adoptions[0]?.cliMode, "source");
  assert.equal(readTrackedSites(f.deps.projectsPath)[0]?.siteId, "created-by-fixture");
});

test("registered create refuses hosted databases before opening a folder picker", async (t) => {
  const f = fixture({ t });
  await assert.rejects(() => f.invoke({ channel: SITE_IPC_CHANNELS.create, payload: { displayName: "Hosted", database: { kind: "supabase" } } }), /only creates SQLite sites/);
  assert.deepEqual(f.dialogs, []);
  assert.deepEqual(f.adoptions, []);
  assert.deepEqual(readTrackedSites(f.deps.projectsPath), []);
});

test("registered delete drains the selected adopted site and removes only its card and preview", async (t) => {
  const f = fixture({ t });
  const id = f.site({ name: "removed" });
  const keep = f.site({ name: "kept" });
  trackSite(f.deps.projectsPath, id);
  trackSite(f.deps.projectsPath, keep);
  const contentPath = path.join(id, "content.db");
  fs.writeFileSync(contentPath, "adopted site's bytes");
  await f.deps.openSiteServer(id, f.deps.ctx);
  f.previews.set(id, "data:image/png;base64,AA==");
  const result = await f.invoke({ channel: SITE_IPC_CHANNELS.delete, payload: id });
  assert.equal(result, undefined);
  assert.equal(f.stops(), 1);
  assert.equal(f.deps.openSites.has(id), false);
  assert.deepEqual(f.closed, [{ siteDir: id, pid: 12345 }]);
  assert.deepEqual(f.deletedPreviews, [id]);
  assert.equal(f.previews.has(id), false);
  assert.deepEqual(readTrackedSites(f.deps.projectsPath).map((row) => row.siteDir), [keep]);
  assert.equal(readProjectsFile(f.deps.projectsPath).dismissed.includes(id), true);
  assert.equal(fs.readFileSync(contentPath, "utf8"), "adopted site's bytes");
});

test("registered browser handoff routes each requested surface to the selected running site", async (t) => {
  const f = fixture({ t });
  const id = f.site({ name: "external" });
  await f.deps.openSiteServer(id, f.deps.ctx);
  for (const view of ["site", "admin"]) {
    await f.invoke({ channel: SITE_IPC_CHANNELS.openExternal, payload: { siteId: id, view } });
  }
  assert.deepEqual(f.opened, ["http://127.0.0.1:4321/", "http://127.0.0.1:4321/admin/"]);
  await assert.rejects(() => f.invoke({ channel: SITE_IPC_CHANNELS.openExternal, payload: { siteId: "missing", view: "site" } }), /not open/);
  assert.equal(f.opened.length, 2);
});

test("registered rename updates the selected config, returned name and native window title", (t) => {
  const f = fixture({ t });
  const id = f.site({ name: "rename-me" });
  const other = f.site({ name: "leave-me" });
  trackSite(f.deps.projectsPath, id);
  trackSite(f.deps.projectsPath, other);
  const titles: string[] = [];
  f.deps.openSites.set(id, { server: { port: 4321 }, window: {
    isDestroyed: () => false, setTitle: (title) => { titles.push(title); },
  } });
  const renamed = f.invoke({ channel: SITE_IPC_CHANNELS.rename, payload: { id, name: "  New display name  " } });
  assert.equal(renamed.id, id);
  assert.equal(renamed.displayName, "New display name");
  assert.equal(f.deps.readSiteName(id), "New display name");
  assert.equal(f.deps.readSiteName(other), "leave-me");
  assert.deepEqual(titles, ["New display name"]);
});

test("registered add-site tracks the picked existing folder without initializing or rewriting it", async (t) => {
  const f = fixture({ t });
  const id = f.site({ name: "existing" });
  const original = fs.readFileSync(path.join(id, "config.json"), "utf8");
  f.pickedFolders.push(id);
  const added = await f.invoke({ channel: SITE_IPC_CHANNELS.addSite });
  assert.equal(added.id, id);
  assert.equal(added.deleteErasesFiles, false);
  assert.deepEqual(readTrackedSites(f.deps.projectsPath).map((row) => row.siteDir), [id]);
  assert.deepEqual(f.adoptions, []);
  assert.equal(fs.readFileSync(path.join(id, "config.json"), "utf8"), original);
  assert.deepEqual(f.dialogs[0]?.properties, ["openDirectory"]);
});

test("registered preview reads the requested site's image and returns null for uncaptured sites", (t) => {
  const f = fixture({ t });
  const alpha = f.site({ name: "alpha" });
  const beta = f.site({ name: "beta" });
  f.previews.set(alpha, "data:image/png;base64,AA==");
  f.previews.set(beta, "data:image/png;base64,BB==");
  assert.equal(f.invoke({ channel: SITE_IPC_CHANNELS.preview, payload: beta }), "data:image/png;base64,BB==");
  assert.equal(f.invoke({ channel: SITE_IPC_CHANNELS.preview, payload: alpha }), "data:image/png;base64,AA==");
  assert.equal(f.invoke({ channel: SITE_IPC_CHANNELS.preview, payload: "uncaptured" }), null);
});

test("registered locate replaces the selected stale path with the folder the operator picked", async (t) => {
  const f = fixture({ t });
  const stale = path.join(f.root, "missing-old-folder");
  const other = f.site({ name: "untouched" });
  const moved = f.site({ name: "new-location" });
  trackSite(f.deps.projectsPath, stale);
  trackSite(f.deps.projectsPath, other);
  const createdAt = readTrackedSites(f.deps.projectsPath)[0]?.createdAt;
  f.pickedFolders.push(moved);
  const located = await f.invoke({ channel: SITE_IPC_CHANNELS.locate, payload: stale });
  assert.equal(located.id, moved);
  assert.equal(located.folderMissing, false);
  assert.equal(located.createdAt, createdAt);
  assert.equal(located.deleteErasesFiles, false);
  assert.deepEqual(readTrackedSites(f.deps.projectsPath).map((row) => row.siteDir), [moved, other]);
});

test("registered service discovery returns the CLI-backed lister's result using host configuration", async (t) => {
  const f = fixture({ t });
  const result = [{ pluginId: "fixture-service", displayName: "Fixture", helpUrl: "https://example.test/help" }];
  const calls: unknown[] = [];
  f.deps.listTokenSignInPlugins = async (input) => { calls.push(input); return result; };
  assert.deepEqual(await f.invoke({ channel: SITE_IPC_CHANNELS.tokenSignInPlugins }), result);
  assert.deepEqual(calls, [{ repoRoot: f.deps.repoRoot, cliMode: "source" }]);
});
