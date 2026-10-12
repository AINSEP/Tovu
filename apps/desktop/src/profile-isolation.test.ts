import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSitesWorkspace } from "./shared-sites.ts";
import { createSitesWorkspace as createCliWorkspace } from "../../website/src/platform/site-dir/sites-home.ts";
import { createSiteFolders } from "./site-folders.ts";
import { registerSiteIpcHandlers, SITE_IPC_CHANNELS, type ProjectIpcDeps } from "./project-ipc.ts";
import { buildCliEnv } from "./tovu-server.ts";

test("Sites settings IPC and child CLI share the scratch profile and leave owner app-data unchanged", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "desktop-profile-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const real = path.join(root, "Library", "Application Support", "Tovu"), profile = path.join(root, "scratch");
  const realConfig = '{"sitesHome":"/owner-only","siteRoots":["/owner-extra"],"databases":"appData"}';
  const realCatalog = '{"version":1,"entries":[],"migrations":["owner-only"]}';
  fs.mkdirSync(real, { recursive: true }); fs.mkdirSync(profile);
  fs.writeFileSync(path.join(real, "config.json"), realConfig); fs.writeFileSync(path.join(real, "sites.json"), realCatalog);
  const env = { TOVU_DESKTOP_USER_DATA_DIR: `  ${profile}  ` };
  const options = { homeDir: root, cwd: root, env, platform: "darwin" as const, sourceRoots: [] };
  const workspace = createSitesWorkspace({}, options);
  const statePath = path.join(profile, "desktop-state.json");
  const siteFolders = createSiteFolders({ statePath, defaultRoots: [], workspace });
  const handlers = new Map<string, Parameters<ProjectIpcDeps["ipcMain"]["handle"]>[1]>();
  const home = path.join(root, "chosen-home"), extra = path.join(root, "folders", "extra"); fs.mkdirSync(home); fs.mkdirSync(extra, { recursive: true });
  // Only settings handlers run; other registered callbacks must not need their dependencies yet.
  registerSiteIpcHandlers({ sharedSites: workspace, siteFolders, siteScanRoots: [], recentSiteDirs: () => [],
    ipcMain: { handle: (channel: string, listener: Parameters<ProjectIpcDeps["ipcMain"]["handle"]>[1]) => handlers.set(channel, listener) },
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [home] }) },
  } as unknown as ProjectIpcDeps);
  const invoke = async (channel: string, payload?: unknown) => {
    const handler = handlers.get(channel); assert.ok(handler); return handler({}, payload);
  };
  const before = await invoke(SITE_IPC_CHANNELS.listFolders);
  assert.equal(before.configPath, path.join(profile, "config.json"));
  assert.equal(before.databases, "inSite"); assert.deepEqual(before.extraRoots, []);
  await invoke(SITE_IPC_CHANNELS.setHome);
  siteFolders.add({ root: extra });
  await invoke(SITE_IPC_CHANNELS.saveSettings, { databases: "appData" });
  workspace.registry({}).merge({ entries: [{ id: "scratch-id", name: "Scratch", path: home, createdBy: "Desktop", lastOpened: null }] });
  const childEnv = buildCliEnv({ baseEnv: env });
  const child = createCliWorkspace({}, { ...options, env: childEnv });
  assert.deepEqual(child.config({}).siteRoots, [extra]); assert.equal(child.home({}), home);
  assert.equal(child.config({}).databases, "appData");
  assert.equal(child.registry({}).list({})[0]?.id, "scratch-id");
  assert.equal(child.databasePath({ dir: home, id: "scratch-id", filename: "content.db" }), path.join(profile, "databases", "scratch-id", "content.db"));
  assert.deepEqual(child.projectsPaths, [path.join(profile, "desktop-projects.json")]);
  siteFolders.remove({ root: extra });
  assert.deepEqual(createSitesWorkspace({}, options).config({}).siteRoots, []);
  assert.equal(fs.readFileSync(path.join(real, "config.json"), "utf8"), realConfig);
  assert.equal(fs.readFileSync(path.join(real, "sites.json"), "utf8"), realCatalog);
  assert.deepEqual(fs.readdirSync(real).sort(), ["config.json", "sites.json"]);
});

test("relative profile overrides resolve against the host cwd, and blank overrides retain shared app-data", () => {
  const options = { homeDir: "/owner", cwd: "/launch", platform: "darwin" as const, sourceRoots: [] };
  for (const make of [createSitesWorkspace, createCliWorkspace]) {
    assert.equal(make({}, { ...options, env: { TOVU_DESKTOP_USER_DATA_DIR: " scratch " } }).config({}).appData, "/launch/scratch");
    assert.equal(make({}, { ...options, env: { TOVU_DESKTOP_USER_DATA_DIR: " " } }).config({}).appData, "/owner/Library/Application Support/Tovu");
  }
});
