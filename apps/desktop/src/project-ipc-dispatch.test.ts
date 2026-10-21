import { isolatedCatalogHome } from "../../website/src/platform/site-dir/__tests__/helpers/isolated-catalog-home.ts";
/** Drive the registered callbacks with renderer payloads, observing disk and host effects. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";

import { createSitesWorkspace, attachRunningSite, shareSiteDirectories } from "./shared-sites.ts";
import { createSiteFolders } from "./site-folders.ts";
import { SITE_IPC_CHANNELS, registerSiteIpcHandlers } from "./project-ipc.ts";
import type { ProjectIpcDeps } from "./project-ipc.ts";
import { sitesFilePath, trackSite, readTrackedSites, readProjectsFile } from "./tracked-sites.ts";
import { classifySiteDirSafely } from "./site-dir-store.ts";
import { writeSiteName } from "./site-config.ts";
import { addSitePointer } from "./add-site-pointer.ts";
import { createKeyedSerializer } from "./keyed-serializer.ts";

function fixture({ t }: { t: TestContext }) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-ipc-dispatch-")));
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
  const openSites = new Map<string, Parameters<ProjectIpcDeps["openSites"]["set"]>[1]>();
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
    openSites,
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
    root, deps, openSites, site, pickedFolders, opened, dialogs, adoptions, previews, deletedPreviews, closed,
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

// REGRESSION: a running card with no preview must ask main for one; captured or stopped ones must not.
test("registered list requests a preview only for running sites that have none", (t) => {
  const f = fixture({ t });
  const bare = f.site({ name: "bare" });
  const captured = f.site({ name: "captured" });
  const stopped = f.site({ name: "stopped" });
  for (const id of [bare, captured, stopped]) trackSite(f.deps.projectsPath, id);
  f.deps.openSites.set(bare, { server: { port: 4401 } });
  f.deps.openSites.set(captured, { server: { port: 4402 } });
  f.previews.set(captured, "data:image/png;base64,AA==");
  const requests: unknown[][] = [];
  f.deps.requestPreviewCapture = (...args) => { requests.push(args); };
  f.invoke({ channel: SITE_IPC_CHANNELS.list });
  assert.deepEqual(requests, [[{ siteDir: bare, port: 4401 }, {}]]);
});

test("registered create forwards the display name to init and records the newly created identity", async (t) => {
  const f = sharedFixture({ t });
  const dir = path.join(f.workspace.home({}), "my-new-website");
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

test("created website and its name survive a discovery-settings write failure", async (t) => {
  const f = sharedFixture({ t });
  const dir = path.join(f.workspace.home({}), "still-created");
  let attempts = 0;
  f.deps.siteFolders = {
    read: () => ({ roots: [], extraRoots: [] }), add: () => ({ roots: [], extraRoots: [] }),
    remove: () => ({ roots: [], extraRoots: [] }),
    rememberCreated: () => { attempts++; throw new Error("EACCES: discovery settings are read-only"); },
  };
  const created = await f.invoke({ channel: SITE_IPC_CHANNELS.create, payload: { displayName: "Still created", database: { kind: "sqlite" } } });
  assert.equal(attempts, 1); assert.equal(created.id, dir); assert.equal(created.displayName, "Still created");
  assert.equal(fs.existsSync(path.join(dir, ".site-meta.json")), true);
  assert.equal(readTrackedSites(f.deps.projectsPath)[0]?.displayName, "Still created");
});

test("registered asynchronous discovery uses the injected worker port and respects dismissals", async (t) => {
  const f = fixture({ t });
  const id = f.site({ name: "worker-found" });
  let finish!: (found: string[]) => void;
  f.deps.discoverSites = () => new Promise((resolve) => { finish = resolve; });
  const cardAdmissions: string[] = [];
  f.deps.classifySiteDir = (dir) => { cardAdmissions.push(dir); return classifySiteDirSafely(dir); };
  f.deps.recentSiteDirs = () => assert.fail("the worker reads recent folders off-thread");
  const pending = f.invoke({ channel: SITE_IPC_CHANNELS.rescan });
  assert.deepEqual(readTrackedSites(f.deps.projectsPath), []);
  assert.deepEqual(cardAdmissions, [], "candidate discovery belongs to the worker");
  finish([id]);
  const records = await pending;
  assert.equal(records[0]?.id, id); assert.equal(records[0]?.status, "stopped");
  // Admission, relocation and card rendering may each validate; one read is not the contract.
  assert.deepEqual([...new Set(cardAdmissions)], [id], "returned cards still validate their site markers");
  assert.equal(records.length, 1);
  assert.equal(records[0]?.folderMissing, false);
  assert.equal(records[0]?.deleteErasesFiles, false);
  fs.rmSync(path.join(id, "config.json"));
  const damaged = f.invoke({ channel: SITE_IPC_CHANNELS.list });
  assert.equal(damaged.length, 1);
  assert.equal(damaged[0]?.id, id);
  assert.equal(damaged[0]?.folderMissing, true, "a worker result cannot keep a damaged folder startable");
  assert.equal(damaged[0]?.displayName, "worker-found", "recovery keeps the last valid name");
  await assert.rejects(() => f.invoke({ channel: SITE_IPC_CHANNELS.start, payload: id }), /Folder moved or not a site/);
  assert.equal(f.openSites.size, 0);
  fs.writeFileSync(path.join(id, "config.json"), JSON.stringify({ name: "worker-found" }));
  await f.invoke({ channel: SITE_IPC_CHANNELS.delete, payload: id });
  f.deps.discoverSites = async () => [id];
  assert.deepEqual(await f.invoke({ channel: SITE_IPC_CHANNELS.rescan }), []);
});

test("a discovery timeout rejects without adopting partial candidates", async (t) => {
  const f = fixture({ t });
  const message = "Sites discovery timed out. Disconnect unavailable volumes or choose smaller sites folders and try again.";
  f.deps.discoverSites = async () => { throw new Error(message); };
  await assert.rejects(() => f.invoke({ channel: SITE_IPC_CHANNELS.rescan }), { message });
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

function sharedFixture({ t }: { t: TestContext }) {
  const f = fixture({ t }); fs.mkdirSync(path.join(f.root, "Documents"));
  const workspace = createSitesWorkspace({}, { homeDir: f.root, env: {}, platform: "linux", cwd: f.root, sourceRoots: [] });
  f.deps.sharedSites = workspace;
  f.deps.siteFolders = createSiteFolders({ statePath: f.deps.statePath, defaultRoots: [], workspace });
  return { ...f, workspace };
}
test("settings save accepts only placement; native setHome owns paths and cancellation", async (t) => {
  const f = sharedFixture({ t }); const before = f.workspace.config({});
  for (const payload of [null, [], { sitesHome: "/etc" }, { siteRoots: ["relative"] }, { databases: "other" }, { databases: "appData", extra: true }]) {
    assert.throws(() => f.invoke({ channel: SITE_IPC_CHANNELS.saveSettings, payload }), { message: 'Sites settings accept only databases: "inSite" or "appData". Choose folders with the native picker.' });
    assert.deepEqual(f.workspace.config({}), before);
  }
  assert.equal(f.invoke({ channel: SITE_IPC_CHANNELS.saveSettings, payload: { databases: "appData" } }).databases, "appData");
  assert.equal(await f.invoke({ channel: SITE_IPC_CHANNELS.setHome, payload: { path: "/etc" } }), null);
  const home = path.join(f.root, "chosen"); fs.mkdirSync(home); f.pickedFolders.push(home);
  assert.equal((await f.invoke({ channel: SITE_IPC_CHANNELS.setHome, payload: { path: "/etc" } })).home, home);
  assert.deepEqual(f.dialogs.at(-1)?.properties, ["openDirectory", "createDirectory"]);
});
test("shared-home Create holds its creation lock, reports the destination, and refuses an unmounted volume", async (t) => {
  const f = sharedFixture({ t }); const adopt = f.deps.adoptSiteDir;
  f.deps.dialog = { showOpenDialog: async () => assert.fail("Create must never open a folder picker") };
  f.deps.adoptSiteDir = async (input) => { assert.equal(fs.existsSync(input.dir + ".creation.lock"), true); return adopt(input); };
  const result = await f.invoke({ channel: SITE_IPC_CHANNELS.create, payload: { displayName: "Home site", database: { kind: "sqlite" } } });
  assert.equal(result.installDir, path.join(f.workspace.home({}), "home-site"));
  assert.equal(fs.existsSync(result.installDir + ".creation.lock"), false); assert.deepEqual(f.dialogs, []);
  const home = path.join(f.root, "unmounted", "Sites"); f.workspace.setHome({ path: home });
  await assert.rejects(() => f.invoke({ channel: SITE_IPC_CHANNELS.create, payload: { displayName: "No volume", database: { kind: "sqlite" } } }), {
    message: `Sites home volume is unavailable: ${home}. Mount it or choose a local folder in Sites settings.`,
  });
  assert.equal(fs.existsSync(path.dirname(home)), false); assert.equal(f.adoptions.length, 1);
});
test("shared-home Create refuses another app winning the reserved folder without adopting it", async (t) => {
  const f = sharedFixture({ t }); let classifications = 0;
  f.deps.classifySiteDir = () => ++classifications === 1 ? "empty" : "site";
  await assert.rejects(() => f.invoke({ channel: SITE_IPC_CHANNELS.create, payload: { displayName: "Raced", database: { kind: "sqlite" } } }), {
    message: "The new website folder was created by another app. Try creating this website again.",
  });
  assert.deepEqual(f.adoptions, []); assert.deepEqual(readTrackedSites(f.deps.projectsPath), []);
});
test("registered list skips bad catalog siblings and repeats import without duplicate cards", (t) => {
  const f = sharedFixture({ t }), first = f.site({ name: "valid", siteId: "same" }), copied = f.site({ name: "copy", siteId: "same" }), bad = f.site({ name: "broken" });
  fs.writeFileSync(path.join(bad, "config.json"), "{broken");
  for (const dir of [first, copied, bad]) trackSite(f.deps.projectsPath, dir);
  // Production's name reader tolerates bad config independently of catalog admission.
  f.deps.readSiteName = (dir) => path.basename(dir);
  assert.equal(f.invoke({ channel: SITE_IPC_CHANNELS.list }).length, 3);
  assert.equal(f.invoke({ channel: SITE_IPC_CHANNELS.list }).length, 3);
  assert.deepEqual(f.workspace.registry({}).list({}).map((row) => row.path), [first]);
});
test("removing a local adopted card retains the shared catalog, and external leases cannot be stopped or erased", async (t) => {
  const f = sharedFixture({ t }), id = f.site({ name: "shared" });
  trackSite(f.deps.projectsPath, id); shareSiteDirectories({ workspace: f.workspace, dirs: [id], createdBy: "Web" });
  await f.invoke({ channel: SITE_IPC_CHANNELS.delete, payload: id });
  assert.equal(f.workspace.registry({}).list({})[0]?.path, id); assert.equal(fs.existsSync(id), true);
  trackSite(f.deps.projectsPath, id, "created", { siteId: "shared" });
  const claim = f.workspace.claim({ path: id, app: "Web", port: 3456 });
  t.after(() => f.workspace.running({ path: id }).release({ token: claim.record.token }));
  await assert.rejects(() => f.invoke({ channel: SITE_IPC_CHANNELS.stop, payload: id }), { message: "Running in Web (port 3456). Stop it in that app." });
  await assert.rejects(() => f.invoke({ channel: SITE_IPC_CHANNELS.delete, payload: id }), { message: "Running in Web (port 3456). Stop it in that app before deleting." });
  assert.equal(fs.existsSync(id), true); assert.equal(f.stops(), 0);
  const server = attachRunningSite({ workspace: f.workspace, dir: id }); assert.equal(server?.adminUrl, "http://localhost:3456/admin/");
  await server?.stop(); assert.equal(f.workspace.running({ path: id }).read({})?.token, claim.record.token);
});

test("registered Start attaches through the host port and retains the external owner's lease", async (t) => {
  const f = sharedFixture({ t }), id = f.site({ name: "external-start" });
  trackSite(f.deps.projectsPath, id);
  const claim = f.workspace.claim({ path: id, app: "Web", port: 3456, scheme: "https" });
  f.deps.openSiteServer = async (dir) => {
    const server = attachRunningSite({ workspace: f.workspace, dir }); assert.ok(server);
    f.deps.openSites.set(dir, { server });
  };
  const result = await f.invoke({ channel: SITE_IPC_CHANNELS.start, payload: id });
  assert.equal(result.externalUrl, "https://localhost:3456/admin/"); assert.equal(result.runningApp, "Web");
  await f.deps.openSites.get(id)?.server.stop?.();
  assert.equal(f.workspace.running({ path: id }).read({})?.token, claim.record.token);
  f.workspace.running({ path: id }).release({ token: claim.record.token });
});


test("deskfx M1: a themes-only stale folder offers recovery and cannot spawn", async (t) => {
  const f = fixture({ t });
  const stale = path.join(f.root, "stale"); fs.mkdirSync(path.join(stale, "themes"), { recursive: true });
  trackSite(f.deps.projectsPath, stale);
  f.deps.openSiteServer = async () => assert.fail("not a site must never start");
  const card = f.invoke({ channel: SITE_IPC_CHANNELS.list })[0];
  assert.equal(card.folderMissing, true);
  await assert.rejects(() => f.invoke({ channel: SITE_IPC_CHANNELS.start, payload: stale }), /Folder moved or not a site/);
  assert.equal(f.openSites.size, 0);
  assert.deepEqual(fs.readdirSync(stale), ["themes"]);
});

test("deskfx S3: picker admission scans proposed aggregate roots before saving, and overflow saves nothing", async (t) => {
  const f = fixture({ t });
  const added = path.join(f.root, "extra"); fs.mkdirSync(added);
  const folders = createSiteFolders({ statePath: f.deps.statePath, defaultRoots: f.deps.siteScanRoots });
  f.deps.siteFolders = folders;
  const before = folders.read({}); let scans = 0;
  f.deps.discoverSites = async ({ scanRoots }) => {
    scans++; assert.deepEqual(scanRoots, [...before.roots, added]);
    assert.deepEqual(folders.read({}), before, "root must not be saved while validation is running");
    throw new Error("Sites discovery is limited to 1000 entries. Choose a smaller folder.");
  };
  f.pickedFolders.push(added);
  await assert.rejects(() => f.invoke({ channel: SITE_IPC_CHANNELS.addFolder }), /1000 entries/);
  assert.equal(scans, 1); assert.deepEqual(folders.read({}), before);
  assert.equal(fs.existsSync(path.join(path.dirname(f.deps.statePath), "desktop-site-folders.json")), false);
  f.deps.discoverSites = async ({ scanRoots }) => { assert.ok(scanRoots?.includes(added)); return []; };
  f.pickedFolders.push(added);
  const saved = await f.invoke({ channel: SITE_IPC_CHANNELS.addFolder });
  assert.deepEqual(saved.extraRoots, [added]);
});

test("deskfx NIT: consecutive polls preserve createdAt and report each invalid catalog row once", (t) => {
  const f = fixture({ t }); const dir = f.site({ name: "stable" });
  trackSite(f.deps.projectsPath, dir);
  const first = f.invoke({ channel: SITE_IPC_CHANNELS.list })[0];
  assert.equal(f.invoke({ channel: SITE_IPC_CHANNELS.list })[0].createdAt, first.createdAt);
  const workspace = createSitesWorkspace({}, { homeDir: f.root, env: {}, cwd: f.root, platform: "linux" });
  const stale = path.join(f.root, "stale"); const notices: string[] = [];
  for (let poll = 0; poll < 3; poll++) shareSiteDirectories({ workspace, dirs: [stale], createdBy: "Desktop" }, { report: (line) => notices.push(line) });
  assert.equal(notices.length, 1); assert.match(notices[0]!, /skipped shared catalog entry/);
});

test("deskfx2 MUST-2: desktop default catalog is isolated without a production test guard", () => {
  const workspace = createSitesWorkspace({});
  assert.equal(os.homedir(), isolatedCatalogHome);
  for (const file of [workspace.config({}).appData, workspace.config({}).configPath, workspace.home({})]) {
    const relative = path.relative(isolatedCatalogHome, file);
    assert.ok(relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
  }
  const site = path.join(isolatedCatalogHome, "fixture-site");
  workspace.registry({}).merge({ entries: [{ id: "isolated-fixture", name: "Fixture", path: site, createdBy: "test", lastOpened: null }] });
  assert.equal(workspace.registry({}).list({}).some((entry) => entry.path === site), true);
});


test("deskfx2 NIT: create reports a missing tracked row clearly and preserves the created site", async (t) => {
  const f = sharedFixture({ t }), dir = path.join(f.workspace.home({}), "created-site");
  f.deps.readSiteName = () => {
    fs.rmSync(f.deps.projectsPath, { force: true });
    return "Created site";
  };
  await assert.rejects(() => f.invoke({ channel: SITE_IPC_CHANNELS.create, payload: { displayName: "Created site" } }), {
    message: "The website was created, but its desktop catalog entry is missing. Use Add Tovu Website to add the folder again.",
  });
  assert.equal(fs.existsSync(path.join(dir, "config.json")), true);
});


test("registered destination preview and Create share suffix selection; preview never writes", async (t) => {
  const f = sharedFixture({ t });
  f.deps.dialog = { showOpenDialog: async () => assert.fail("Create must never open a folder picker") };
  const home = f.workspace.home({});
  const before = fs.existsSync(home);
  assert.deepEqual(f.invoke({ channel: SITE_IPC_CHANNELS.planNewDir, payload: { name: "Corner Bakery" } }), { path: path.join(home, "corner-bakery"), homeDir: os.homedir() });
  assert.equal(fs.existsSync(home), before);
  fs.mkdirSync(path.join(home, "corner-bakery"), { recursive: true });
  fs.mkdirSync(path.join(home, "corner-bakery-2"));
  const planned = f.invoke({ channel: SITE_IPC_CHANNELS.planNewDir, payload: { name: "Corner Bakery" } });
  assert.equal(planned.path, path.join(home, "corner-bakery-3"));
  const created = await f.invoke({ channel: SITE_IPC_CHANNELS.create, payload: { displayName: "Corner Bakery" } });
  assert.equal(created.installDir, planned.path);
  assert.equal(f.adoptions.length, 1);
  assert.throws(() => f.invoke({ channel: SITE_IPC_CHANNELS.planNewDir, payload: { name: 42 } }), { message: "Website name must be a string." });
});

test("without shared settings the settings channels refuse clearly and the folder list is the built-in scan roots", async (t) => {
  const f = fixture({ t });
  await assert.rejects(Promise.resolve().then(() => f.invoke({ channel: SITE_IPC_CHANNELS.setHome })), { message: "Sites home settings are unavailable in this desktop version." });
  assert.throws(() => f.invoke({ channel: SITE_IPC_CHANNELS.saveSettings, payload: { databases: "appData" } }), { message: "Sites settings are unavailable in this desktop version." });
  assert.deepEqual(f.invoke({ channel: SITE_IPC_CHANNELS.listFolders }), { roots: f.deps.siteScanRoots, extraRoots: [] });
  await assert.rejects(Promise.resolve().then(() => f.invoke({ channel: SITE_IPC_CHANNELS.addFolder })), { message: "Sites folders settings are unavailable in this desktop version." });
  for (const payload of [undefined, { root: "relative/sites" }, { root: 7 }]) {
    assert.throws(() => f.invoke({ channel: SITE_IPC_CHANNELS.removeFolder, payload }), { message: "Choose an absolute sites folder path to remove." });
  }
  assert.throws(() => f.invoke({ channel: SITE_IPC_CHANNELS.removeFolder, payload: { root: path.join(f.root, "websites") } }), { message: "Sites folders settings are unavailable in this desktop version." });
  assert.equal(f.dialogs.length, 0, "no picker opens for a setting this version cannot save");
});

test("setHome refuses a picked file or relative path, and without folder settings reports just the new home", async (t) => {
  const f = sharedFixture({ t });
  const file = path.join(f.root, "a-file"); fs.writeFileSync(file, "");
  const before = f.workspace.home({});
  for (const picked of [file, "relative/home"]) {
    f.pickedFolders.push(picked);
    await assert.rejects(Promise.resolve().then(() => f.invoke({ channel: SITE_IPC_CHANNELS.setHome })), { message: "Choose an existing absolute sites folder." });
  }
  assert.equal(f.workspace.home({}), before, "nothing was saved");
  f.deps.siteFolders = undefined;
  const home = path.join(f.root, "chosen-home"); fs.mkdirSync(home); f.pickedFolders.push(home);
  assert.deepEqual(await f.invoke({ channel: SITE_IPC_CHANNELS.setHome }), { roots: [], extraRoots: [], home });
});
