/**
 * @file Coverage for `project-ipc.cjs` — the five real `runner:projects:*` handlers the Projects
 * screen needs. No real Electron anywhere: `ipcMain`/`dialog`/`shell` are plain fakes, `openSites`
 * is a real `Map` standing in for `main.cjs`'s module-level one, and `openSiteServer`/`adoptSiteDir`
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
  handleStart,
  rescanProjects,
  registerProjectIpcHandlers,
} = require("./project-ipc.cjs");
const { PROJECT_ORIGIN, projectsFilePath, trackProject, readTrackedProjects, writeTrackedProjects } = require("./project-registry.cjs");
const { classifySiteDir } = require("./site-dir-store.cjs");

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
    classifySiteDir: () => "empty",
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

test("buildProjectRecord's partition is stable for the same site dir and independent of running status", () => {
  const deps = baseDeps();
  const row = { siteDir: "/sites/a", createdAt: "2026-01-01T00:00:00.000Z" };

  const stopped = buildProjectRecord(row, deps);
  deps.openSites.set("/sites/a", { server: { port: 4321 } });
  const running = buildProjectRecord(row, deps);

  assert.match(stopped.partition, /^persist:tovu-site-[0-9a-f]{32}$/);
  assert.equal(stopped.partition, running.partition);
});

test("buildProjectRecord gives two different site dirs two different partitions", () => {
  const deps = baseDeps();
  const a = buildProjectRecord({ siteDir: "/sites/a", createdAt: "2026-01-01" }, deps);
  const b = buildProjectRecord({ siteDir: "/sites/b", createdAt: "2026-01-01" }, deps);
  assert.notEqual(a.partition, b.partition);
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

test("handleDelete on a running project the app CREATED stops the server before removing the directory", async () => {
  const dir = tempDir();
  const siteDir = path.join(dir, "site-to-delete");
  fs.mkdirSync(siteDir);
  fs.writeFileSync(path.join(siteDir, "config.json"), "{}");

  const order = [];
  const deps = baseDeps();
  // `created`, and outside `deps.repoRoot` — the only combination the guard lets through, which is
  // what makes this the proof that the guard did not simply disable delete for everything.
  trackProject(deps.projectsPath, siteDir, PROJECT_ORIGIN.created);
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

test("handleDelete stops a fleet-opened (embedded-tab) entry that carries no window at all", async () => {
  const siteDir = path.join(tempDir(), "embedded-tab-site");
  fs.mkdirSync(siteDir);
  const deps = baseDeps();
  trackProject(deps.projectsPath, siteDir, PROJECT_ORIGIN.adopted);
  let stopped = false;
  deps.openSites.set(siteDir, { server: { stop: async () => { stopped = true; } } });

  await assert.doesNotReject(() => handleDelete(siteDir, deps));

  assert.equal(stopped, true);
  assert.equal(deps.openSites.has(siteDir), false);
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

test("handleStart refuses an id this shell is not tracking", async () => {
  const deps = baseDeps({ openSiteServer: async () => assert.fail("must not be called") });
  await assert.rejects(() => handleStart("/sites/unknown", deps), /Unknown project/);
});

test("handleStart serializes on the site dir, calls openSiteServer with ctx, and returns the fresh record", async () => {
  let openedWith = null;
  const deps = baseDeps({
    openSiteServer: async (siteDir, ctx) => {
      openedWith = { siteDir, ctx };
      deps.openSites.set(siteDir, { server: { port: 4321 } });
    },
  });
  trackProject(deps.projectsPath, "/sites/a");

  const record = await handleStart("/sites/a", deps);

  assert.deepEqual(openedWith, { siteDir: "/sites/a", ctx: deps.ctx });
  assert.equal(record.status, "running");
  assert.equal(record.port, 4321);
});

test("registerProjectIpcHandlers registers exactly the five real channels", () => {
  const registered = new Map();
  const deps = baseDeps({ ipcMain: { handle: (channel, listener) => registered.set(channel, listener) } });

  registerProjectIpcHandlers(deps);

  assert.deepEqual([...registered.keys()].sort(), Object.values(RUNNER_PROJECT_CHANNELS).sort());
});

// --- delete guard (2026-09-06) -------------------------------------------------------------
//
// `handleDelete` ends in `fs.rm(id, {recursive: true, force: true})`. Every test below exists to
// prove that call is reached ONLY for a directory this app itself created. The hazard these were
// written against: `seedDevFallbackProject` tracks `<repo>/sites/tovu-com` — a git-tracked folder
// holding a real 44 MB production database — and the Projects screen gives every card a two-click
// delete. Nothing about that row said "the app did not make this".

test("handleDelete does NOT erase the directory of a project the app only adopted", async () => {
  const dir = tempDir();
  const siteDir = path.join(dir, "adopted-site");
  fs.mkdirSync(siteDir);
  fs.writeFileSync(path.join(siteDir, "content.db"), "a real site's real database");

  const deps = baseDeps();
  // No origin argument: the legacy/unknown-provenance row shape, which must fail CLOSED.
  trackProject(deps.projectsPath, siteDir);

  await handleDelete(siteDir, deps);

  assert.equal(fs.existsSync(path.join(siteDir, "content.db")), true, "an adopted project's files must survive delete");
  assert.deepEqual(readTrackedProjects(deps.projectsPath), [], "the card must still go away");
});

test("handleDelete refuses to erase anything under the repo root, even a row claiming the app created it", async () => {
  const repoRoot = tempDir();
  const siteDir = path.join(repoRoot, "sites", "tovu-com");
  fs.mkdirSync(siteDir, { recursive: true });
  fs.writeFileSync(path.join(siteDir, "content.db"), "leona's 44 MB production database");

  const deps = baseDeps({ repoRoot });
  writeTrackedProjects(deps.projectsPath, [{ siteDir, createdAt: "2026-01-01T00:00:00.000Z", origin: "created" }]);

  await handleDelete(siteDir, deps);

  assert.equal(fs.existsSync(path.join(siteDir, "content.db")), true, "a repo-root directory must survive delete regardless of what the row claims");
});

test("handleCreate records 'created' when it initialized an empty folder, 'adopted' when the folder was already a site", async () => {
  for (const [kind, expected] of [["empty", PROJECT_ORIGIN.created], ["site", PROJECT_ORIGIN.adopted]]) {
    const picked = `/sites/${kind}-one`;
    const deps = baseDeps({
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [picked] }) },
      // Classified BEFORE `adoptSiteDir` runs, because afterwards both cases look identical: it
      // returns the same path whether it ran `tovu init` or recognized an existing site.
      classifySiteDir: () => kind,
      adoptSiteDir: async () => picked,
    });

    const record = await handleCreate({ displayName: "New Site" }, deps);

    assert.equal(readTrackedProjects(deps.projectsPath)[0].origin, expected, `a "${kind}" folder must be tracked as ${expected}`);
    assert.equal(record.deleteErasesFiles, expected === PROJECT_ORIGIN.created);
  }
});

test("buildProjectRecord tells the renderer whether delete will erase files, from the guard main obeys", () => {
  const repoRoot = tempDir();
  const insideRepo = path.join(repoRoot, "sites", "tovu-com");
  const outsideRepo = path.join(tempDir(), "my-site");
  const deps = baseDeps({ repoRoot });

  const created = buildProjectRecord({ siteDir: outsideRepo, createdAt: "2026-01-01", origin: PROJECT_ORIGIN.created }, deps);
  const adopted = buildProjectRecord({ siteDir: outsideRepo, createdAt: "2026-01-01", origin: PROJECT_ORIGIN.adopted }, deps);
  const inRepo = buildProjectRecord({ siteDir: insideRepo, createdAt: "2026-01-01", origin: PROJECT_ORIGIN.created }, deps);

  assert.equal(created.deleteErasesFiles, true);
  assert.equal(adopted.deleteErasesFiles, false);
  assert.equal(inRepo.deleteErasesFiles, false);
});

test("handleDelete still stops and closes a running project it may not erase", async () => {
  const siteDir = path.join(tempDir(), "adopted-but-open");
  fs.mkdirSync(siteDir);
  fs.writeFileSync(path.join(siteDir, "content.db"), "keep me");

  const order = [];
  const deps = baseDeps();
  trackProject(deps.projectsPath, siteDir, PROJECT_ORIGIN.adopted);
  deps.openSites.set(siteDir, {
    server: { stop: async () => order.push("stopped") },
    window: { isDestroyed: () => false, destroy: () => order.push("destroyed") },
  });

  await handleDelete(siteDir, deps);

  assert.deepEqual(order, ["stopped", "destroyed"], "removing the card still closes the site it was showing");
  assert.equal(fs.existsSync(path.join(siteDir, "content.db")), true);
});

// ---------------------------------------------------------------------------------------------
// `rescanProjects` — the discovery pass, run once at boot and again whenever the operator asks.
// ---------------------------------------------------------------------------------------------

/** A directory the REAL `classifySiteDir` will call a site: both marker files present. */
function siteFolder(parent, name) {
  const dir = path.join(parent, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), "{}");
  fs.writeFileSync(path.join(dir, ".site-meta.json"), "{}");
  return dir;
}

/** `deps` wired to the REAL classifier over a real scan root, since a fake one would happily
 *  "discover" folders that are not sites at all and prove nothing about the boot path. */
function scanDeps(overrides = {}) {
  const root = path.join(tempDir(), "sites");
  fs.mkdirSync(root, { recursive: true });
  return {
    ...baseDeps({
      classifySiteDir,
      projectScanRoots: [root],
      recentSiteDirs: () => [],
      ...overrides,
    }),
    scanRoot: root,
  };
}

test("rescanProjects makes a site dir that exists on disk but was never registered visible", () => {
  const deps = scanDeps();
  const alpha = siteFolder(deps.scanRoot, "alpha");
  assert.deepEqual(handleList(deps), [], "precondition: nothing is tracked yet");
  const records = rescanProjects(deps);
  assert.deepEqual(records.map((r) => r.id), [alpha]);
  assert.deepEqual(handleList(deps).map((r) => r.id), [alpha], "and it survives into the next list");
});

test("rescanProjects records a discovery as adopted, so deleting its card can never erase it", () => {
  const deps = scanDeps();
  siteFolder(deps.scanRoot, "alpha");
  const [record] = rescanProjects(deps);
  assert.equal(record.deleteErasesFiles, false);
  assert.equal(readTrackedProjects(deps.projectsPath)[0].origin, PROJECT_ORIGIN.adopted);
});

test("rescanProjects never resurrects a project the operator removed on purpose", async () => {
  const deps = scanDeps();
  const alpha = siteFolder(deps.scanRoot, "alpha");
  rescanProjects(deps);
  await handleDelete(alpha, deps);
  assert.deepEqual(handleList(deps), [], "precondition: the removal took");
  // Repeatedly, because a rescan is an operator-triggered button, not a one-shot boot step.
  assert.deepEqual(rescanProjects(deps), []);
  assert.deepEqual(rescanProjects(deps), []);
  assert.deepEqual(handleList(deps), []);
  assert.equal(fs.existsSync(path.join(alpha, "config.json")), true, "and the folder itself is untouched");
});

test("rescanProjects picks up a recently-opened site that lives outside every scan root", () => {
  const outside = siteFolder(tempDir(), "elsewhere");
  const deps = scanDeps({ recentSiteDirs: () => [outside] });
  assert.deepEqual(rescanProjects(deps).map((r) => r.id), [outside]);
});

test("rescanProjects leaves an already-tracked project's row exactly as it was", () => {
  const deps = scanDeps();
  const alpha = siteFolder(deps.scanRoot, "alpha");
  trackProject(deps.projectsPath, alpha, PROJECT_ORIGIN.adopted);
  const before = readTrackedProjects(deps.projectsPath);
  rescanProjects(deps);
  assert.deepEqual(readTrackedProjects(deps.projectsPath), before);
});

test("rescanProjects ignores a folder under the scan root that is not a site", () => {
  const deps = scanDeps();
  fs.mkdirSync(path.join(deps.scanRoot, "not-a-site"), { recursive: true });
  fs.writeFileSync(path.join(deps.scanRoot, "loose.txt"), "hi");
  assert.deepEqual(rescanProjects(deps), []);
});
