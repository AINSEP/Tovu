/**
 * @file Coverage for `project-ipc.cjs` — the five real `runner:projects:*` handlers the Projects
 * screen needs. No real Electron anywhere: `ipcMain`/`dialog`/`shell` are plain fakes, `openSites`
 * is a real `Map` standing in for `main.cjs`'s module-level one, and `openSiteWindow`/`adoptSiteDir`
 * are spies rather than the real functions — those are covered by `main.cjs`'s own doc and by the
 * E2E suite; this file's job is the IPC wiring and the pure `buildProjectRecord` join.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  RUNNER_PROJECT_CHANNELS,
  buildProjectRecord,
  handleList,
  handleCreate,
  handleDelete,
  handleOpenExternal,
  handleOpenWindow,
  registerProjectIpcHandlers,
} = require("./project-ipc.cjs");
const { projectsFilePath, trackProject, readTrackedProjects } = require("./project-registry.cjs");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-project-ipc-"));
}

/** A minimal `deps` object every handler needs, with per-test overrides layered on. */
function baseDeps(overrides = {}) {
  const dir = tempDir();
  return {
    projectsPath: projectsFilePath(dir),
    registryPath: path.join(dir, "site-registry.json"),
    repoRoot: "/repo",
    statePath: path.join(dir, "desktop-state.json"),
    cliMode: "source",
    openSites: new Map(),
    readSiteName: (siteDir) => path.basename(siteDir),
    recordSiteClosed: () => {},
    serializer: { run: (_key, fn) => fn() },
    ctx: {},
    ...overrides,
  };
}

test("the five channel literals here match contracts/project.ts exactly (no drift)", () => {
  const source = fs.readFileSync(path.join(__dirname, "contracts", "project.ts"), "utf8");
  for (const [key, channel] of Object.entries(RUNNER_PROJECT_CHANNELS)) {
    assert.ok(source.includes(`'${channel}'`), `contracts/project.ts is missing the '${channel}' literal for ${key}`);
  }
});

test("buildProjectRecord reports a tracked-but-closed project as stopped, port 0", () => {
  const deps = baseDeps();
  const row = { siteDir: "/sites/a", createdAt: "2026-01-01T00:00:00.000Z" };
  const record = buildProjectRecord(row, deps);
  assert.equal(record.id, "/sites/a");
  assert.equal(record.status, "stopped");
  assert.equal(record.desiredState, "stopped");
  assert.equal(record.port, 0);
  assert.equal(record.slug, "a");
});

test("buildProjectRecord reports an open project as running, with its real port", () => {
  const deps = baseDeps();
  deps.openSites.set("/sites/a", { server: { port: 4321 }, window: {} });
  const record = buildProjectRecord({ siteDir: "/sites/a", createdAt: "2026-01-01T00:00:00.000Z" }, deps);
  assert.equal(record.status, "running");
  assert.equal(record.desiredState, "running");
  assert.equal(record.port, 4321);
});

test("handleList returns one record per tracked row, joined against openSites", () => {
  const deps = baseDeps();
  trackProject(deps.projectsPath, "/sites/a");
  trackProject(deps.projectsPath, "/sites/b");
  deps.openSites.set("/sites/b", { server: { port: 9000 }, window: {} });

  const records = handleList(deps);
  assert.equal(records.length, 2);
  const byId = new Map(records.map((r) => [r.id, r]));
  assert.equal(byId.get("/sites/a").status, "stopped");
  assert.equal(byId.get("/sites/b").status, "running");
  assert.equal(byId.get("/sites/b").port, 9000);
});

test("handleCreate throws when the folder picker is cancelled", async () => {
  const deps = baseDeps({ dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) } });
  await assert.rejects(() => handleCreate({ displayName: "New Site" }, deps), /No folder was chosen/);
});

test("handleCreate adopts the picked folder, tracks it, and returns its record", async () => {
  const picked = "/sites/new-one";
  let adoptCalledWith = null;
  const deps = baseDeps({
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [picked] }) },
    adoptSiteDir: async (input) => {
      adoptCalledWith = input;
      return picked;
    },
  });

  const record = await handleCreate({ displayName: "New Site" }, deps);

  assert.equal(adoptCalledWith.dir, picked);
  assert.equal(adoptCalledWith.name, "New Site");
  assert.equal(record.id, picked);
  assert.deepEqual(readTrackedProjects(deps.projectsPath).map((r) => r.siteDir), [picked]);
});

test("handleDelete on an untracked id is a no-op — no stop, no fs.rm, no throw", async () => {
  const deps = baseDeps();
  await assert.doesNotReject(() => handleDelete("/sites/never-tracked", deps));
});

test("handleDelete on a running project stops the server before removing the directory", async () => {
  const dir = tempDir();
  const siteDir = path.join(dir, "site-to-delete");
  fs.mkdirSync(siteDir);
  fs.writeFileSync(path.join(siteDir, "config.json"), "{}");

  const order = [];
  const deps = baseDeps();
  trackProject(deps.projectsPath, siteDir);
  deps.openSites.set(siteDir, {
    server: {
      stop: async () => {
        order.push("stopped");
      },
    },
    window: { isDestroyed: () => false, destroy: () => order.push("destroyed") },
  });

  await handleDelete(siteDir, deps);

  assert.deepEqual(order, ["stopped", "destroyed"]);
  assert.equal(deps.openSites.has(siteDir), false);
  assert.equal(fs.existsSync(siteDir), false);
  assert.deepEqual(readTrackedProjects(deps.projectsPath), []);
});

test("handleOpenExternal throws when the project is not currently open", async () => {
  const deps = baseDeps();
  await assert.rejects(() => handleOpenExternal({ projectId: "/sites/a", view: "admin" }, deps), /not open/);
});

test("handleOpenExternal opens the admin surface by default, the site surface when asked", async () => {
  const opened = [];
  const deps = baseDeps({ shell: { openExternal: async (url) => opened.push(url) } });
  deps.openSites.set("/sites/a", { server: { origin: "http://127.0.0.1:4321" } });

  await handleOpenExternal({ projectId: "/sites/a", view: "admin" }, deps);
  await handleOpenExternal({ projectId: "/sites/a", view: "site" }, deps);

  assert.deepEqual(opened, ["http://127.0.0.1:4321/admin/", "http://127.0.0.1:4321/"]);
});

test("handleOpenWindow refuses an id this shell is not tracking", async () => {
  const deps = baseDeps({ openSiteWindow: async () => assert.fail("must not be called") });
  await assert.rejects(() => handleOpenWindow("/sites/unknown", deps), /Unknown project/);
});

test("handleOpenWindow serializes on the site dir and calls openSiteWindow with ctx", async () => {
  let openedWith = null;
  const deps = baseDeps({
    openSiteWindow: async (siteDir, ctx) => {
      openedWith = { siteDir, ctx };
    },
  });
  trackProject(deps.projectsPath, "/sites/a");

  await handleOpenWindow("/sites/a", deps);

  assert.deepEqual(openedWith, { siteDir: "/sites/a", ctx: deps.ctx });
});

test("registerProjectIpcHandlers registers exactly the five real channels", () => {
  const registered = new Map();
  const deps = baseDeps({ ipcMain: { handle: (channel, listener) => registered.set(channel, listener) } });

  registerProjectIpcHandlers(deps);

  assert.deepEqual([...registered.keys()].sort(), Object.values(RUNNER_PROJECT_CHANNELS).sort());
});
