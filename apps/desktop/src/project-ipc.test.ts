/**
 * @file Coverage for `project-ipc.ts` — the seven real `runner:sites:*` handlers the Projects
 * screen needs. No real Electron anywhere: `ipcMain`/`dialog`/`shell` are plain fakes, `openSites`
 * is a real `Map` standing in for `main.ts`'s module-level one, and `openSiteServer`/`adoptSiteDir`
 * are spies rather than the real functions — those are covered by `main.ts`'s own doc and by the
 * E2E suite; this file's job is the IPC wiring and the pure `buildSiteRecord` join.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { SITE_IPC_CHANNELS as CONTRACT_SITE_IPC_CHANNELS } from "./contracts/project.ts";
import { SITE_IPC_CHANNELS, buildSiteRecord, siteRecordLifecycle, importSharedSiteDiscovery, handleList, handleAddSite, handleCreate, planNewSiteDir, handleDelete, handleOpenExternal, handleStart, handleStop, handleRename, handleGetPreview, handleLocate, handleTokenSignInPlugins, rescanSites, registerSiteIpcHandlers } from "./project-ipc.ts";
import { createSiteTransitions } from "./site-transitions.ts";
import type { ProjectIpcDeps } from "./project-ipc.ts";
import { SITE_ORIGIN, sitesFilePath, trackSite, readTrackedSites, writeTrackedSites } from "./tracked-sites.ts";
import { classifySiteDir, classifySiteDirSafely } from "./site-dir-store.ts";
import { createSitesWorkspace } from "./shared-sites.ts";
import { createSiteFolders } from "./site-folders.ts";
import { writeSiteName } from "./site-config.ts";
import { addSitePointer } from "./add-site-pointer.ts";
import { createKeyedSerializer } from "./keyed-serializer.ts";
import { sourceFunction } from "./renderer/source-test-harness.ts";
import { sitePortPresentation } from "./renderer/site-port.rules.ts";
import { createSiteSupervisor } from "./site-supervisor.ts";
import type { SupervisedServer } from "./site-supervisor.ts";
import { readRegistry, writeRegistry, isLiveServeRow, instanceFilePath } from "./site-process-registry.ts";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-project-ipc-"));
}

/** What these tests store per site through `createSiteSupervisor` — mirrors
 *  `site-supervisor.test.ts`'s own `TestEntry`, its established precedent for this exact generic. */
interface SupervisorEntry {
  server: SupervisedServer & { port: number };
}

/**
 * A real site directory on disk: both marker files, with `.site-meta.json` carrying `siteId` — the
 * identity `project-delete-guard.ts` proves before any `created` row's directory may be erased.
 */
function writeSite(dir: string, siteId: string, contents: Record<string, string> = {}): string {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: path.basename(dir) }));
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId, schemaVersion: 58 }));
  for (const [name, body] of Object.entries(contents)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

/** The first record of a list that must not be empty — the `handleList(deps)[0]` every transition
 *  test reads, with the "possibly undefined" answered once rather than at each call site. */
function first<T>(records: readonly T[]): T {
  const record = records[0];
  assert.ok(record !== undefined, "expected at least one record");
  return record;
}

/** A minimal `deps` object every handler needs, with per-test overrides layered on. The return type
 *  keeps the 16 unconditional defaults definite, admits any other `ProjectIpcDeps` field as
 *  optional (so a test may assign one, e.g. `deps.openSiteServer = ...`, after construction, or a
 *  caller may need an inline `as` where a handler's own `Pick<...>` requires a field this helper has
 *  no meaningful default for — `dialog`, `adoptSiteDir`, `shell`, `openSiteServer` and the like —
 *  because the test's own control flow never reaches it), and folds in `O` so a caller's own
 *  overrides (e.g. `dialog`, `addSitePointer`) come back definite rather than merely optional. */
function baseDeps<O extends Partial<ProjectIpcDeps>>(
  overrides: O = {} as O
): Partial<ProjectIpcDeps> &
  Pick<
    ProjectIpcDeps,
    | "projectsPath"
    | "registryPath"
    | "repoRoot"
    | "statePath"
    | "cliMode"
    | "openSites"
    | "readSiteName"
    | "readPreviewVersion"
    | "readPreviewDataUrl"
    | "deletePreview"
    | "classifySiteDir"
    | "recordSiteClosed"
    | "readRegistry"
    | "isLiveServeRow"
    | "serializer"
    | "ctx"
  > &
  O {
  const dir = tempDir();
  return {
    projectsPath: sitesFilePath(dir),
    registryPath: path.join(dir, "site-processes"),
    repoRoot: "/repo",
    statePath: path.join(dir, "desktop-state.json"),
    cliMode: "source",
    openSites: new Map(),
    readSiteName: (siteDir: string) => path.basename(siteDir),
    // No capture exists for any fixture site by default — every test that cares about a real
    // version overrides this explicitly.
    readPreviewVersion: () => null,
    readPreviewDataUrl: () => null,
    deletePreview: () => {},
    classifySiteDir: (siteDir) => siteDir.startsWith("/sites/") ? "site" : classifySiteDirSafely(siteDir),
    recordSiteClosed: () => {},
    // The REAL registry reader and identity proof, pointed at a per-test temp path that does not
    // exist yet — so every test that is not about a sibling app instance sees an empty registry and
    // behaves exactly as it did before the D-08 guard existed.
    readRegistry,
    isLiveServeRow,
    serializer: { run: (_key: string, fn: () => unknown) => fn() },
    ctx: {},
    ...overrides,
  };
}

test("every channel literal here matches contracts/project.ts exactly (no drift)", () => {
  assert.deepEqual(SITE_IPC_CHANNELS, CONTRACT_SITE_IPC_CHANNELS);
});

test("buildSiteRecord reports a tracked-but-closed project as stopped, port 0", () => {
  const deps = baseDeps();
  const row = { siteDir: "/sites/a", createdAt: "2026-01-01T00:00:00.000Z" };
  const record = buildSiteRecord(row, deps);
  assert.equal(record.id, "/sites/a");
  assert.equal(record.status, "stopped");
  assert.equal(record.desiredState, "stopped");
  assert.equal(record.port, 0);
  assert.equal(record.slug, "a");
});

test("buildSiteRecord reports an open project as running, with its real port", () => {
  const deps = baseDeps();
  deps.openSites.set("/sites/a", { server: { port: 4321 }, window: {} });
  const record = buildSiteRecord({ siteDir: "/sites/a", createdAt: "2026-01-01T00:00:00.000Z" }, deps);
  assert.equal(record.status, "running");
  assert.equal(record.desiredState, "running");
  assert.equal(record.port, 4321);
});

test("buildSiteRecord's partition is stable for the same site dir and independent of running status", () => {
  const deps = baseDeps();
  const row = { siteDir: "/sites/a", createdAt: "2026-01-01T00:00:00.000Z" };

  const stopped = buildSiteRecord(row, deps);
  deps.openSites.set("/sites/a", { server: { port: 4321 } });
  const running = buildSiteRecord(row, deps);

  assert.match(stopped.partition, /^persist:tovu-site-[0-9a-f]{32}$/);
  assert.equal(stopped.partition, running.partition);
});

test("buildSiteRecord gives two different site dirs two different partitions", () => {
  const deps = baseDeps();
  const a = buildSiteRecord({ siteDir: "/sites/a", createdAt: "2026-01-01" }, deps);
  const b = buildSiteRecord({ siteDir: "/sites/b", createdAt: "2026-01-01" }, deps);
  assert.notEqual(a.partition, b.partition);
});

test("buildSiteRecord reports no preview for a site that has never been captured", () => {
  const deps = baseDeps();
  const record = buildSiteRecord({ siteDir: "/sites/a", createdAt: "2026-01-01" }, deps);
  assert.equal(record.previewVersion, null);
});

test("buildSiteRecord surfaces whatever version deps.readPreviewVersion reports, keyed by siteDir", () => {
  const seen: string[] = [];
  const deps = baseDeps({
    readPreviewVersion: (siteDir: string) => {
      seen.push(siteDir);
      return siteDir === "/sites/a" ? 12345 : null;
    },
  });
  const a = buildSiteRecord({ siteDir: "/sites/a", createdAt: "2026-01-01" }, deps);
  const b = buildSiteRecord({ siteDir: "/sites/b", createdAt: "2026-01-01" }, deps);
  assert.equal(a.previewVersion, 12345);
  assert.equal(b.previewVersion, null);
  assert.deepEqual(seen, ["/sites/a", "/sites/b"]);
});

test("handleGetPreview delegates straight to deps.readPreviewDataUrl, keyed by the id it was given", () => {
  const deps = baseDeps({ readPreviewDataUrl: (id: string) => (id === "/sites/a" ? "data:image/png;base64,AA==" : null) });
  assert.equal(handleGetPreview("/sites/a", deps), "data:image/png;base64,AA==");
  assert.equal(handleGetPreview("/sites/unknown", deps), null);
});

test("a crashed project is reported stopped, with a statusDetail saying why", async () => {
  // D-06 end to end at the sink the renderer actually reads. Before the supervisor owned the
  // `running -> exited` transition this record kept saying `running` with the dead child's port
  // forever, and `useSitesPolling`'s 4s re-poll re-read the same unchanged answer.
  const deps = baseDeps({ openSites: createSiteSupervisor<SupervisorEntry>({ onUnexpectedExit: () => {} }) });
  const row = { siteDir: "/sites/a", createdAt: "2026-01-01T00:00:00.000Z" };

  let died: ((exit: { code: number | null; signal: string | null }) => void) | undefined;
  deps.openSites.set("/sites/a", { server: { port: 4321, onExit: (listener) => { died = listener; } } });
  assert.equal(buildSiteRecord(row, deps).status, "running");

  died!({ code: 1, signal: null });

  const record = buildSiteRecord(row, deps);
  assert.equal(record.status, "stopped");
  assert.equal(record.port, 0);
  assert.equal(record.statusDetail, "The site's server exited (code 1).");
});

test("a project that was simply never started has no statusDetail to report", () => {
  const deps = baseDeps({ openSites: createSiteSupervisor<SupervisorEntry>({ onUnexpectedExit: () => {} }) });
  const record = buildSiteRecord({ siteDir: "/sites/a", createdAt: "2026-01-01" }, deps);
  assert.equal(record.status, "stopped");
  assert.equal(record.statusDetail, null);
});

test("a killed project reports its signal rather than an exit code", () => {
  const deps = baseDeps({ openSites: createSiteSupervisor<SupervisorEntry>({ onUnexpectedExit: () => {} }) });
  let died: ((exit: { code: number | null; signal: string | null }) => void) | undefined;
  deps.openSites.set("/sites/a", { server: { port: 4321, onExit: (listener) => { died = listener; } } });
  died!({ code: null, signal: "SIGKILL" });
  assert.equal(buildSiteRecord({ siteDir: "/sites/a", createdAt: "2026-01-01" }, deps).statusDetail, "The site's server was stopped by SIGKILL.");
});

test("handleList returns one record per tracked row, joined against openSites", () => {
  const deps = baseDeps();
  trackSite(deps.projectsPath, "/sites/a");
  trackSite(deps.projectsPath, "/sites/b");
  deps.openSites.set("/sites/b", { server: { port: 9000 }, window: {} });

  const records = handleList(deps);
  assert.equal(records.length, 2);
  const byId = new Map(records.map((r) => [r.id, r]));
  assert.equal(byId.get("/sites/a")!.status, "stopped"); // just built from `records`, so a row for this id always exists
  assert.equal(byId.get("/sites/b")!.status, "running");
  assert.equal(byId.get("/sites/b")!.port, 9000);
});

// Idle CPU (2026-09-29): the list heals moved folders only when its relocation gate says to.
test("handleList heals a renamed folder when its relocation gate allows a pass, and skips the pass when it does not", () => {
  const root = tempDir();
  const before = writeSite(path.join(root, "before"), "site-gate");
  const after = path.join(root, "after");
  const allowed = baseDeps();
  trackSite(allowed.projectsPath, before);
  let passes = 0;
  const open = { shouldRun: () => (passes += 1) > 0 };

  handleList({ ...allowed, relocationGate: open }); // records the folder's id
  fs.renameSync(before, after);
  assert.deepEqual(handleList({ ...allowed, relocationGate: open }).map((record) => [record.id, record.folderMissing]), [[after, false]]);
  assert.equal(passes, 2);

  const root2 = tempDir();
  const before2 = writeSite(path.join(root2, "before"), "site-gate-2");
  const skipped = baseDeps();
  trackSite(skipped.projectsPath, before2);
  const closed = { shouldRun: () => false };
  handleList({ ...skipped, relocationGate: closed });
  fs.renameSync(before2, path.join(root2, "after"));
  assert.deepEqual(handleList({ ...skipped, relocationGate: closed }).map((record) => [record.id, record.folderMissing]), [[before2, true]], "no pass: the card shows the folder missing");
});

/** A folder that is a complete Tovu site, via this file's existing {@link writeSite}. */
function siteFixture(name = "existing-site"): string {
  return writeSite(path.join(tempDir(), name), `id-${name}`);
}

/** `baseDeps` plus the folder dialog and the real pointer adder `handleAddSite` needs. */
function addSiteDeps<O extends Partial<ProjectIpcDeps>>(pickedPath: string | null, overrides: O = {} as O) {
  const shown: Array<Parameters<ProjectIpcDeps["dialog"]["showOpenDialog"]>[0]> = [];
  const deps = baseDeps({
    classifySiteDir: classifySiteDirSafely,
    addSitePointer,
    dialog: {
      showOpenDialog: async (options) => {
        shown.push(options);
        return pickedPath === null ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [pickedPath] };
      },
    },
    ...overrides,
  });
  return { deps, shown };
}

test("handleAddSite tracks an existing site as `adopted` and returns its record", async () => {
  const siteDir = siteFixture();
  const { deps } = addSiteDeps(siteDir);

  const record = await handleAddSite(deps);
  assert.ok(record);

  assert.equal(record.id, siteDir);
  assert.equal(record.installDir, siteDir);
  assert.equal(record.status, "stopped");
  // The consequence that matters: `deleteErasesFiles` false means a later delete drops the card and
  // leaves every byte of someone else's site where it is.
  assert.equal(record.deleteErasesFiles, false);
  assert.equal(readTrackedSites(deps.projectsPath)[0]!.origin, "adopted");
});

test("handleAddSite REFUSES an empty folder and never initializes a site in it", async () => {
  const siteDir = path.join(tempDir(), "fresh");
  fs.mkdirSync(siteDir);
  const { deps } = addSiteDeps(siteDir);

  await assert.rejects(() => handleAddSite(deps), /no Tovu site here to add/);

  // The distinction from `handleCreate`, asserted rather than described: that one runs `tovu init`
  // into an empty folder on purpose. This one must not, and an empty folder is the case where the
  // difference is visible.
  assert.deepEqual(fs.readdirSync(siteDir), []);
  assert.deepEqual(readTrackedSites(deps.projectsPath), []);
});

test("handleAddSite REFUSES an incomplete site and an occupied folder", async () => {
  const incomplete = path.join(tempDir(), "half");
  fs.mkdirSync(incomplete);
  fs.writeFileSync(path.join(incomplete, "config.json"), "{}");
  const occupied = path.join(tempDir(), "docs");
  fs.mkdirSync(occupied);
  fs.writeFileSync(path.join(occupied, "a.txt"), "x");

  const first = addSiteDeps(incomplete);
  await assert.rejects(() => handleAddSite(first.deps), /half-initialized or damaged/);
  const second = addSiteDeps(occupied);
  await assert.rejects(() => handleAddSite(second.deps), /folder of unrelated files/);

  assert.deepEqual(readTrackedSites(first.deps.projectsPath), []);
  assert.deepEqual(readTrackedSites(second.deps.projectsPath), []);
  assert.deepEqual(fs.readdirSync(incomplete), ["config.json"]);
  assert.deepEqual(fs.readdirSync(occupied), ["a.txt"]);
  assert.equal(fs.readFileSync(path.join(incomplete, "config.json"), "utf8"), "{}");
  assert.equal(fs.readFileSync(path.join(occupied, "a.txt"), "utf8"), "x");
});

test("handleAddSite's dialog does NOT offer to create a folder", async () => {
  const { deps, shown } = addSiteDeps(siteFixture());

  await handleAddSite(deps);

  // Create computes its directory automatically; Add must not offer creation. A folder the operator makes
  // in the dialog is empty by definition, and an empty folder is exactly what this verb refuses —
  // offering the button would invite the one mistake the refusal then has to explain.
  assert.deepEqual(shown[0]!.properties, ["openDirectory"]); // this test's own call above pushed exactly one entry
  assert.equal(shown[0]!.properties.includes("createDirectory"), false); // this test's own call above pushed exactly one entry
});

test("handleAddSite returns null for a cancelled dialog without writing anything", async () => {
  const { deps } = addSiteDeps(null);

  assert.equal(await handleAddSite(deps), null);

  assert.deepEqual(readTrackedSites(deps.projectsPath), []);
});

test("handleAddSite keeps an already-tracked project's original createdAt", async () => {
  const siteDir = siteFixture();
  const { deps } = addSiteDeps(siteDir);
  const first = await handleAddSite(deps);
  assert.ok(first);

  const second = await handleAddSite(deps);
  assert.ok(second);

  // Read back from the registry rather than synthesized: a fabricated record would stamp today's
  // date and silently reorder the operator's Projects grid on a re-add.
  assert.equal(second.createdAt, first.createdAt);
  assert.equal(first.alreadyTracked, false);
  assert.equal(second.alreadyTracked, true);
  assert.equal(readTrackedSites(deps.projectsPath).length, 1);
});

/** Creation fixtures use an isolated sites home; existing-folder tests retain their picker. */
function createDeps<O extends Partial<ProjectIpcDeps>>(overrides: O, { home = tempDir(), homeDir = home }: { home?: string; homeDir?: string } = {}) {
  const sharedSites = createSitesWorkspace({}, { homeDir, env: { TOVU_SITES_HOME: home }, cwd: home, sourceRoots: [], platform: "linux" });
  return baseDeps({ sharedSites, dialog: { showOpenDialog: async () => assert.fail("Create must never open a folder picker") }, ...overrides });
}

test("handleCreate refuses a hosted-database choice instead of quietly making a SQLite site", async () => {
  // D-02. The renderer's CreateSiteInput carries a `database` choice, ported from Tovu-Runner's
  // provisioner-backed form; this shell has no provisioner and `buildSiteRecord` hard-codes
  // `{kind: "sqlite"}`. The operator picked Supabase, was FORCED to type a URL and key to get past
  // `canCreate`, and got a local SQLite site reported back as success. Refusing at the boundary is
  // what stops main silently narrowing a contract it does not honour — and it refuses BEFORE the
  // folder dialog, so nobody picks a folder for a site that was never going to be made.
  let pickerOpened = false;
  const deps = createDeps({ dialog: { showOpenDialog: async () => { pickerOpened = true; return { canceled: true, filePaths: [] }; } } });

  for (const kind of ["supabase", "custom"]) {
    await assert.rejects(
      () => handleCreate({ displayName: "New Site", database: { kind } }, deps as typeof deps & Pick<ProjectIpcDeps, "adoptSiteDir">), // never reached — refused before adoptSiteDir
      /only creates SQLite sites/,
      `a "${kind}" choice must be refused, not silently narrowed`,
    );
  }
  assert.equal(pickerOpened, false, "the refusal must come before the folder picker");
});

test("handleCreate accepts an explicit sqlite choice, and an input with no database at all", async () => {
  for (const database of [{ kind: "sqlite" }, undefined]) {
    const siteDir = writeSite(path.join(tempDir(), "ok"), "site-a");
    const deps = createDeps({
      dialog: { showOpenDialog: async () => assert.fail("Create must never open a folder picker") },
      classifySiteDir: () => "empty",
      adoptSiteDir: async () => siteDir,
    });
    const record = await handleCreate({ displayName: "New Site", database }, deps);
    assert.ok(record);
    assert.equal(record.database.kind, "sqlite");
  }
});

test("handleCreate never opens a picker and plans conflict suffixes without writing", async () => {
  const deps = createDeps({ adoptSiteDir: async ({ dir, name }) => writeSite(dir, "new-id", { "config.json": JSON.stringify({ name }) }) });
  const home = deps.sharedSites.home({});
  assert.equal(planNewSiteDir({ name: "" }, { workspace: deps.sharedSites }), path.join(home, "website"));
  const base = path.join(home, "corner-bakery");
  fs.mkdirSync(base); fs.mkdirSync(base + "-2");
  const before = fs.readdirSync(home);
  assert.equal(planNewSiteDir({ name: " Corner Bakery! " }, { workspace: deps.sharedSites }), base + "-3");
  assert.deepEqual(fs.readdirSync(home), before, "planning is read-only");
  const record = await handleCreate({ displayName: " Corner Bakery! " }, deps);
  assert.equal(record.installDir, base + "-3");
  assert.equal(record.deleteErasesFiles, true);
});

test("handleCreate without sharedSites reuses the workspace resolver and never opens a picker", async (t) => {
  const home = tempDir();
  const previous = process.env.TOVU_SITES_HOME;
  process.env.TOVU_SITES_HOME = home;
  t.after(() => { if (previous === undefined) delete process.env.TOVU_SITES_HOME; else process.env.TOVU_SITES_HOME = previous; });
  const expected = path.join(createSitesWorkspace({}).home({}), "corner-bakery");
  const deps = { ...createDeps({ adoptSiteDir: async ({ dir, name }) => writeSite(dir, "fallback-id", { "config.json": JSON.stringify({ name }) }) }), sharedSites: undefined };
  const record = await handleCreate({ displayName: "Corner Bakery" }, deps);
  assert.equal(record.installDir, expected);
});

test("handleCreate refuses an unavailable home with the plain Sites settings error", async () => {
  const home = path.join(fs.realpathSync(tempDir()), "unmounted", "sites");
  const deps = createDeps({ adoptSiteDir: async () => assert.fail("unavailable home must not initialize") }, { home });
  await assert.rejects(handleCreate({ displayName: "Bakery" }, deps), { message: `Sites home volume is unavailable: ${home}. Mount it or choose a local folder in Sites settings.` });
  assert.equal(fs.existsSync(path.dirname(home)), false);
});

test("handleCreate initializes the planned folder, tracks it, and returns its record", async () => {
  const picked = path.join(fs.realpathSync(tempDir()), "new-site");
  let adoptCalledWith: Parameters<ProjectIpcDeps["adoptSiteDir"]>[0] | null = null;
  const deps = createDeps({
    adoptSiteDir: async (input) => {
      adoptCalledWith = input;
      return writeSite(picked, "created-record-id", { "config.json": JSON.stringify({ name: input.name }) });
    },
  }, { home: path.dirname(picked) });

  const record = await handleCreate({ displayName: "New Site" }, deps);
  assert.ok(record);

  assert.equal(adoptCalledWith!.dir, picked); // handleCreate above always calls adoptSiteDir before returning
  assert.equal(adoptCalledWith!.name, "New Site"); // handleCreate above always calls adoptSiteDir before returning
  assert.equal(record.id, picked);
  assert.equal(record.displayName, "New Site");
  assert.equal(record.folderMissing, false);
  assert.equal(readTrackedSites(deps.projectsPath)[0]?.origin, SITE_ORIGIN.created);
  assert.deepEqual(readTrackedSites(deps.projectsPath).map((r) => r.siteDir), [picked]);
});

test("handleCreate passes a custom admin password only to init and never persists or returns it", async () => {
  const picked = path.join(fs.realpathSync(tempDir()), "custom-site");
  const password = "ipc-custom-password-fixture";
  let givenPassword: string | undefined;
  const deps = createDeps({
    adoptSiteDir: async (input) => {
      givenPassword = input.adminPassword;
      return writeSite(picked, "password-create-id", { "config.json": JSON.stringify({ name: input.name }) });
    },
  }, { home: path.dirname(picked) });
  const record = await handleCreate({ displayName: "Custom Site", adminPassword: password }, deps);
  assert.equal(givenPassword, password);
  assert.ok(!JSON.stringify(record).includes(password));
  assert.ok(!fs.readFileSync(deps.projectsPath, "utf8").includes(password));
});

test("handleCreate rejects malformed or empty admin password before choosing a folder", async () => {
  const deps = createDeps({
    dialog: { showOpenDialog: async () => assert.fail("invalid input must not open the folder dialog") },
    adoptSiteDir: async () => assert.fail("invalid input must not initialize a site"),
  });
  for (const adminPassword of ["", null, 123]) {
    await assert.rejects(handleCreate({ displayName: "Custom Site", adminPassword: adminPassword as string }, deps), { message: "Admin password must be a nonempty string." });
  }
});

test("handleCreate refuses a custom password for a folder that already has a site", async () => {
  const deps = createDeps({
    classifySiteDir: () => "site",
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ["/sites/existing"] }) },
    adoptSiteDir: async () => assert.fail("an existing site's credentials must not change"),
  });
  await assert.rejects(handleCreate({ displayName: "Existing", adminPassword: "chosen" }, deps), { message: "An admin password can only be set while creating a new site. Change an existing site's password under Users." });
});

test("handleDelete on an untracked id is a no-op — no stop, no fs.rm, no throw", async () => {
  const siteDir = writeSite(path.join(tempDir(), "never-tracked"), "untracked", { "sentinel.txt": "keep these bytes" });
  const deps = baseDeps({
    recordSiteClosed: () => assert.fail("an untracked child must retain its registry row"),
    deletePreview: () => assert.fail("an untracked site's preview must remain"),
  });
  const entry = { server: { pid: 777, stop: async () => assert.fail("an untracked server must not stop") } };
  deps.openSites.set(siteDir, entry);
  const files = fs.readdirSync(siteDir).map((name) => [name, fs.readFileSync(path.join(siteDir, name), "utf8")]);
  await assert.doesNotReject(() => handleDelete(siteDir, deps));
  assert.deepEqual(fs.readdirSync(siteDir).map((name) => [name, fs.readFileSync(path.join(siteDir, name), "utf8")]), files);
  assert.equal(deps.openSites.get(siteDir), entry);
  assert.deepEqual(readTrackedSites(deps.projectsPath), []);
});

test("handleDelete on a running project the app CREATED stops the server before removing the directory", async () => {
  const siteDir = writeSite(path.join(tempDir(), "site-to-delete"), "site-a");

  const order: string[] = [];
  let release = () => {};
  const draining = new Promise<void>((resolve) => { release = resolve; });
  const deps = baseDeps();
  // `created`, outside `deps.repoRoot`, and still holding the site whose id the row recorded — the
  // only combination the guard lets through, which is what makes this the proof that the guard did
  // not simply disable delete for everything.
  trackSite(deps.projectsPath, siteDir, SITE_ORIGIN.created, { siteId: "site-a" });
  deps.openSites.set(siteDir, {
    server: {
      stop: async () => {
        await draining;
        order.push("stopped");
      },
    },
    window: { isDestroyed: () => false, destroy: () => order.push("destroyed") },
  });

  const deleting = handleDelete(siteDir, deps);
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(fs.existsSync(siteDir), true, "files must survive until stop completes");
    assert.deepEqual(readTrackedSites(deps.projectsPath).map((row) => row.siteDir), [siteDir]);
    assert.equal(deps.openSites.has(siteDir), true);
    assert.deepEqual(order, []);
  } finally {
    release();
    await deleting;
  }

  assert.deepEqual(order, ["stopped", "destroyed"]);
  assert.equal(deps.openSites.has(siteDir), false);
  assert.equal(fs.existsSync(siteDir), false);
  assert.deepEqual(readTrackedSites(deps.projectsPath), []);
});

test("handleDelete stops a sites-home-opened (embedded-tab) entry that carries no window at all", async () => {
  const siteDir = path.join(tempDir(), "embedded-tab-site");
  fs.mkdirSync(siteDir);
  const deps = baseDeps();
  trackSite(deps.projectsPath, siteDir, SITE_ORIGIN.adopted);
  let stopped = false;
  deps.openSites.set(siteDir, { server: { stop: async () => { stopped = true; } } });

  await assert.doesNotReject(() => handleDelete(siteDir, deps));

  assert.equal(stopped, true);
  assert.equal(deps.openSites.has(siteDir), false);
});

test("handleDelete drops the cached preview for a project it ERASES", async () => {
  const siteDir = writeSite(path.join(tempDir(), "erased-with-preview"), "site-erase");
  const deleted: string[] = [];
  const deps = baseDeps({ deletePreview: (id) => deleted.push(id) });
  trackSite(deps.projectsPath, siteDir, SITE_ORIGIN.created, { siteId: "site-erase" });

  await handleDelete(siteDir, deps);

  assert.deepEqual(deleted, [siteDir]);
});

test("handleDelete drops the cached preview for a project it only REMOVES (adopted, files kept)", async () => {
  // The cleanup is unconditional — a preview is this shell's own decoration, not the operator's
  // data, so it must go whether or not `erasesFiles` does. Otherwise a removed card's stale
  // thumbnail sits as litter the boot sweep alone would have to catch.
  const siteDir = path.join(tempDir(), "removed-with-preview");
  fs.mkdirSync(siteDir);
  const deleted: string[] = [];
  const deps = baseDeps({ deletePreview: (id) => deleted.push(id) });
  trackSite(deps.projectsPath, siteDir, SITE_ORIGIN.adopted);

  await handleDelete(siteDir, deps);

  assert.deepEqual(deleted, [siteDir]);
  assert.equal(fs.existsSync(siteDir), true, "an adopted folder's bytes must survive its own delete");
});

test("handleDelete on an untracked id never calls deletePreview — there is no row to clean up after", async () => {
  const deleted: string[] = [];
  const deps = baseDeps({ deletePreview: (id) => deleted.push(id) });

  await handleDelete("/sites/never-tracked", deps);

  assert.deepEqual(deleted, []);
});

test("handleOpenExternal throws when the project is not currently open", async () => {
  const deps = baseDeps();
  await assert.rejects(() => handleOpenExternal({ siteId: "/sites/a", view: "admin" }, deps as typeof deps & Pick<ProjectIpcDeps, "shell">), /not open/); // never reached — refused before shell.openExternal
});

test("handleOpenExternal opens the admin surface by default, the site surface when asked", async () => {
  const opened: string[] = [];
  const deps = baseDeps({ shell: { openExternal: async (url) => opened.push(url) } });
  deps.openSites.set("/sites/a", { server: { origin: "http://127.0.0.1:4321" } });

  await handleOpenExternal({ siteId: "/sites/a", view: "admin" }, deps);
  await handleOpenExternal({ siteId: "/sites/a", view: "site" }, deps);

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
  trackSite(deps.projectsPath, "/sites/a");

  const record = await handleStart("/sites/a", deps);

  assert.deepEqual(openedWith, { siteDir: "/sites/a", ctx: deps.ctx });
  assert.equal(record.status, "running");
  assert.equal(record.port, 4321);
});

test("handleStart refuses a missing folder before attempting to spawn", async () => {
  // 2026-09-28: `sites/tovu-com` was renamed on disk while the desktop still tracked it, and Start
  // surfaced `tovu serve`'s own `SITE_DIR_INVALID: config.json is missing at …` — true, but it sent
  // the operator hunting for a config file in a folder that was simply gone.
  const siteDir = path.join(tempDir(), "renamed-away");
  const deps = baseDeps({ classifySiteDir: classifySiteDirSafely, openSiteServer: async () => assert.fail("must refuse before spawn") });
  trackSite(deps.projectsPath, siteDir);

  await assert.rejects(
    () => handleStart(siteDir, deps),
    new Error("Folder moved or not a site. Locate the website folder or remove this card."),
  );
});

test("handleStart refuses an existing non-site folder before spawning", async () => {
  const siteDir = tempDir();
  const deps = baseDeps({ openSiteServer: async () => assert.fail("must refuse before spawn") });
  trackSite(deps.projectsPath, siteDir);

  await assert.rejects(() => handleStart(siteDir, deps), /Folder moved or not a site/);
});

// --- stop (2026-09-18) ---------------------------------------------------------------------
//
// The site card's own Stop, and the first way this app has ever had to take ONE site down from
// inside itself. Every test below is about an ordering rule rather than the happy path: the stop
// itself is one `server.stop()` call, and everything that can go wrong is about what happens around
// it.

test("handleStop refuses an id this shell is not tracking", async () => {
  const deps = baseDeps();
  await assert.rejects(() => handleStop("/sites/unknown", deps), /Unknown project/);
});

test("P1: Stop/Restart cancels a pending preview before the site's graceful drain", async () => {
  const order: string[] = [];
  const deps = baseDeps({
    cancelPreviewCapture: ({ siteDir }: { siteDir: string }) => { order.push(`cancel ${siteDir}`); },
  });
  trackSite(deps.projectsPath, "/sites/a");
  deps.openSites.set("/sites/a", { server: { port: 4321, stop: async () => { order.push("drain"); } } });
  await handleStop("/sites/a", deps);
  assert.deepEqual(order, ["cancel /sites/a", "drain"]);
  await handleStop("/sites/a", deps);
  assert.deepEqual(order, ["cancel /sites/a", "drain", "cancel /sites/a"], "even an already-stopped site withdraws pending work");
});

test("P1: removing an adopted site cancels its preview before the server drains", async () => {
  const order: string[] = [];
  const deps = baseDeps({
    cancelPreviewCapture: ({ siteDir }: { siteDir: string }) => { order.push(`cancel ${siteDir}`); },
  });
  trackSite(deps.projectsPath, "/sites/a", SITE_ORIGIN.adopted);
  deps.openSites.set("/sites/a", { server: { stop: async () => { order.push("drain"); } } });
  await handleDelete("/sites/a", deps);
  assert.deepEqual(order, ["cancel /sites/a", "drain"]);
});

test("handleStop drains the server, drops the entry, and returns a stopped record with no port", async () => {
  let stopped = 0;
  const deps = baseDeps();
  deps.openSites.set("/sites/a", { server: { port: 4321, pid: 777, stop: async () => { stopped += 1; } } });
  trackSite(deps.projectsPath, "/sites/a");

  const record = await handleStop("/sites/a", deps);

  assert.equal(stopped, 1, "the child's own graceful drain must be what stops it");
  assert.equal(deps.openSites.get("/sites/a"), undefined);
  assert.equal(record.status, "stopped");
  assert.equal(record.desiredState, "stopped");
  // A site's port is reassigned on every start, so a stopped record carrying its old one would be
  // a card showing an address nothing answers on.
  assert.equal(record.port, 0);
});

test("the entry is dropped BEFORE the stop is awaited, so a deliberate stop is never reported as a crash", async () => {
  // `site-supervisor.ts` watches each entry's child and calls `onUnexpectedExit` for an exit it did
  // not expect — which drops the crash-safety row and makes `lastExitOf` answer, so the card would
  // then read "the site's server was stopped by SIGTERM" about a stop the operator ASKED for.
  // Removing the entry first is what makes the supervisor's identity check ignore this exit.
  const unexpected: string[] = [];
  // `pid`/`stop` on top of `SupervisorEntry`'s own shape: `handleStop` reads both, and the
  // supervisor's generic is what carries them through to `onUnexpectedExit`.
  const openSites = createSiteSupervisor<SupervisorEntry & { server: { pid: number; stop: () => Promise<void> } }>({
    onUnexpectedExit: (siteDir) => unexpected.push(siteDir),
  });
  const listeners: Array<(exit: { code: number | null; signal: string | null }) => void> = [];
  const deps = baseDeps({ openSites });
  openSites.set("/sites/a", {
    server: {
      port: 4321,
      pid: 777,
      onExit: (listener) => listeners.push(listener),
      // What a real `stopChild` does: the child exits, and its `exit` listener fires, DURING the stop.
      stop: async () => { for (const listener of listeners) listener({ code: null, signal: "SIGTERM" }); },
    },
  });
  trackSite(deps.projectsPath, "/sites/a");

  const record = await handleStop("/sites/a", deps);

  assert.deepEqual(unexpected, [], "a stop the operator asked for is not an unexpected exit");
  assert.equal(record.statusDetail, null, "no crash reason may be shown for a deliberate stop");
});

test("the crash-safety row is dropped only AFTER the child is really gone, and by pid", async () => {
  // It exists so the NEXT launch can reap a child this process left running, so it has to outlive
  // the child: dropping it up front means a hard kill mid-drain strands a `tovu serve` that
  // `reconcileOrphans` can never find. By pid because a live SIBLING instance can hold its own row
  // for this same site dir (D-07).
  const order: string[] = [];
  let release = () => {};
  const draining = new Promise<void>((resolve) => { release = resolve; });
  const deps = baseDeps({ recordSiteClosed: (_registryPath, siteDir, options) => order.push(`closed:${siteDir}:${options?.pid}`) });
  deps.openSites.set("/sites/a", { server: { port: 4321, pid: 777, stop: async () => { await draining; order.push("stopped"); } } });
  trackSite(deps.projectsPath, "/sites/a");

  const stopping = handleStop("/sites/a", deps);
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(order, [], "the crash-safety row must outlive the draining child");
  } finally {
    release();
    await stopping;
  }

  assert.deepEqual(order, ["stopped", "closed:/sites/a:777"]);
});

test("stopping an already-stopped site is a no-op that still returns its record, not an error", async () => {
  // The renderer polls on an interval, so a card can be a click behind main's truth through no
  // fault of the operator's. Refusing would surface an error for the state they already wanted.
  const deps = baseDeps({ recordSiteClosed: () => assert.fail("nothing was open to close") });
  trackSite(deps.projectsPath, "/sites/a");

  const record = await handleStop("/sites/a", deps);

  assert.equal(record.status, "stopped");
});

test("a rejected card Stop keeps the crash-recovery row and reports failure", async () => {
  const deps = baseDeps();
  trackSite(deps.projectsPath, "/sites/a");
  let closedRows = 0;
  deps.recordSiteClosed = () => { closedRows++; };
  deps.openSites.set("/sites/a", { server: { port: 4321, pid: 123, stop: async () => {
    throw new Error("forced Stop did not observe exit");
  } } });
  await assert.rejects(handleStop("/sites/a", deps), /forced Stop did not observe exit/);
  assert.equal(closedRows, 0);
});

test("handleStop runs inside the per-site serializer, so a delete cannot erase under a running stop", async () => {
  const keys: string[] = [];
  const deps = baseDeps({ serializer: { run: <T,>(key: string, fn: () => T | PromiseLike<T>) => { keys.push(key); return fn(); } } });
  deps.openSites.set("/sites/a", { server: { port: 4321, pid: 1, stop: async () => {} } });
  trackSite(deps.projectsPath, "/sites/a");

  await handleStop("/sites/a", deps);

  assert.deepEqual(keys, ["/sites/a"]);
});

test("a site reads `stopping` for the whole drain: a live lease poll cannot restart alpha or stop beta", async (t) => {
  // The defect this closes: `openSites` answers "is it alive", so a stop read `running` until the
  // child was gone — and a Stop button that leaves the card saying Running looks like a dead button.
  const transitions = createSiteTransitions();
  const root = fs.realpathSync(tempDir());
  const alpha = writeSite(path.join(root, "alpha"), "alpha-id");
  const beta = writeSite(path.join(root, "beta"), "beta-id");
  const sharedSites = createSitesWorkspace({}, { homeDir: root, cwd: root, env: {}, sourceRoots: [] });
  const alphaLease = sharedSites.claim({ path: alpha, app: "Tovu", port: 4321 });
  const betaLease = sharedSites.claim({ path: beta, app: "Tovu", port: 4322 });
  const deps = baseDeps({ transitions, sharedSites, serializer: createKeyedSerializer(), projectsPath: sitesFilePath(root) });
  t.after(() => {
    sharedSites.running({ path: alpha }).release({ token: alphaLease.record.token });
    sharedSites.running({ path: beta }).release({ token: betaLease.record.token });
    fs.rmSync(root, { recursive: true, force: true });
  });
  let release = () => {};
  const draining = new Promise<void>((resolve) => { release = resolve; });
  deps.openSites.set(alpha, { server: { port: 4321, pid: 1, stop: async () => {
    await draining;
    sharedSites.running({ path: alpha }).release({ token: alphaLease.record.token });
  } } });
  const betaEntry = { server: { port: 4322, pid: 2, stop: async () => assert.fail("beta must keep serving") } };
  deps.openSites.set(beta, betaEntry);
  trackSite(deps.projectsPath, alpha);
  trackSite(deps.projectsPath, beta);
  let automaticStarts = 0;
  let spawned = 0;
  deps.openSiteServer = async () => { spawned++; };
  const source = fs.readFileSync(path.join(__dirname, "renderer", "use-site-workspace.hooks.ts"), "utf8");
  const siteSurfaceUrl = sourceFunction(source, "siteSurfaceUrl", { sitePortPresentation });
  const prepareExternalWorkspace = sourceFunction(source, "prepareExternalWorkspace", { siteSurfaceUrl });

  const stopping = handleStop(alpha, deps);
  await new Promise<void>((resolve) => setImmediate(resolve));
  let attachment: Promise<unknown> | undefined;
  try {
    // Force the same poll a still-mounted, hidden alpha tab consumes while the drain is deferred.
    const records = handleList(deps);
    const midDrain = records.find((row) => row.id === alpha)!;
    assert.equal(midDrain.status, "stopping", "mid-drain the card must say so");
    assert.equal(midDrain.desiredState, "stopped", "the operator's intent, not the child's liveness");
    assert.ok(sharedSites.running({ path: alpha }).read({}), "the lease is still readable during drain");
    attachment = prepareExternalWorkspace({ project: midDrain, bridge: { startSite: (id: string) => {
      automaticStarts++;
      return handleStart(id, deps as ProjectIpcDeps);
    } } }).then((url: string | null) => ({ url }), (error: unknown) => ({ error }));
    assert.equal(automaticStarts, 0, "the attachment function must not queue Start behind Stop");
    assert.equal(midDrain.externalUrl, undefined);
    assert.equal(records.find((row) => row.id === beta)?.status, "running");
  } finally {
    release();
    await stopping;
    await attachment;
  }
  const record = await stopping;
  assert.deepEqual(await attachment, { url: null });
  assert.equal(record.status, "stopped", "what the call RESOLVES with is the settled answer");
  assert.equal(handleList(deps).find((row) => row.id === alpha)?.status, "stopped");
  assert.equal(deps.openSites.has(alpha), false);
  assert.equal(spawned, 0);
  assert.equal(deps.openSites.get(beta), betaEntry);
  assert.equal(handleList(deps).find((row) => row.id === beta)?.port, 4322);
  assert.equal(sharedSites.running({ path: beta }).read({})?.token, betaLease.record.token);
});

// --- stop a site another process serves (owner 2026-10-13) ------------------------------------
//
// `npm run dev` holds the shared lease; this app only attached. Stop goes through the injected
// `externalSites` port (`external-site-stop.ts`), which these tests fake: no real process is signalled.

function externalLeaseFixture(t: { after: (fn: () => void) => void }) {
  const transitions = createSiteTransitions();
  const root = fs.realpathSync(tempDir());
  const site = writeSite(path.join(root, "dev-site"), "dev-site-id");
  const sharedSites = createSitesWorkspace({}, { homeDir: root, cwd: root, env: {}, sourceRoots: [] });
  const lease = sharedSites.claim({ path: site, app: "Web", port: 4555 });
  const release = () => sharedSites.running({ path: site }).release({ token: lease.record.token });
  t.after(() => { release(); fs.rmSync(root, { recursive: true, force: true }); });
  const calls: string[] = [];
  const externalSites: NonNullable<ProjectIpcDeps["externalSites"]> = {
    launcherOf: ({ lease: seen }) => { calls.push(`launcherOf:${seen.token === lease.record.token}`); return "npm-run-dev"; },
    stop: async ({ lease: seen, readLease }) => {
      calls.push(`stop:${seen.token === lease.record.token}:${readLease()?.token === lease.record.token}:${transitions.get(site)}`);
      release();
    },
  };
  const deps = baseDeps({ transitions, sharedSites, externalSites: externalSites as ProjectIpcDeps["externalSites"], serializer: createKeyedSerializer(), projectsPath: sitesFilePath(root) });
  trackSite(deps.projectsPath, site);
  return { site, deps, calls, lease };
}

test("Stop on a site npm run dev serves goes through externalSites, reads stopping, and settles stopped", async (t) => {
  const { site, deps, calls } = externalLeaseFixture(t);
  const listed = handleList(deps).find((row) => row.id === site)!;
  assert.equal(listed.externalLauncher, "npm-run-dev", "the card learns it may offer Stop, and which confirm");
  assert.equal(listed.externalUrl, "http://localhost:4555/admin/");
  const record = await handleStop(site, deps);
  assert.ok(calls.includes("stop:true:true:stopping"), `the lease handed over is the live one, inside the stopping transition: ${calls}`);
  assert.equal(record.status, "stopped");
  assert.equal(record.externalLauncher, undefined);
  assert.equal(record.externalUrl, undefined);
});

test("Stop withdraws this window's own attachment BEFORE signalling the external owner", async (t) => {
  const { site, deps, calls } = externalLeaseFixture(t);
  const closed: unknown[] = [];
  deps.recordSiteClosed = (_registry, siteDir, options) => { closed.push([siteDir, options?.pid]); };
  deps.openSites.set(site, { server: { external: true, pid: 999, port: 4555, origin: "http://localhost:4555", stop: async () => { calls.push("detach"); } } });
  await handleStop(site, deps);
  assert.deepEqual(calls.filter((call) => !call.startsWith("launcherOf")).map((call) => call.split(":")[0]), ["detach", "stop"]);
  assert.equal(deps.openSites.has(site), false);
});

test("an external Stop that fails surfaces main's sentence and keeps the lease", async (t) => {
  const { site, deps, lease } = externalLeaseFixture(t);
  deps.externalSites = { launcherOf: () => "other", stop: async () => { throw new Error("The site did not stop within 15 s. Stop it where it was started."); } };
  await assert.rejects(handleStop(site, deps), /did not stop within 15 s/);
  assert.equal(deps.sharedSites!.running({ path: site }).read({})?.token, lease.record.token);
  assert.equal(handleList(deps).find((row) => row.id === site)?.status, "running");
});

test("a site this window serves itself never takes the external path, and gets no externalLauncher", async (t) => {
  const { site, deps, calls, lease } = externalLeaseFixture(t);
  let drained = 0;
  // Our own child's drain is what drops its lease.
  deps.openSites.set(site, { server: { pid: 4242, port: 4555, stop: async () => {
    drained += 1;
    deps.sharedSites!.running({ path: site }).release({ token: lease.record.token });
  } } });
  assert.equal(handleList(deps).find((row) => row.id === site)?.externalLauncher, undefined);
  await handleStop(site, deps);
  assert.equal(drained, 1);
  assert.deepEqual(calls, [], "neither launcherOf nor stop is consulted for our own child");
});

test("without a proved launcher the record offers no external Stop", (t) => {
  const { site, deps } = externalLeaseFixture(t);
  deps.externalSites = { launcherOf: () => null, stop: async () => assert.fail("unused") };
  assert.equal(handleList(deps).find((row) => row.id === site)?.externalLauncher, undefined);
  deps.externalSites = undefined;
  assert.equal(handleList(deps).find((row) => row.id === site)?.externalLauncher, undefined);
});

test("a site reads `starting` for its whole boot, not `stopped` until the port opens", async () => {
  const transitions = createSiteTransitions();
  const deps = baseDeps({ transitions });
  let release = () => {};
  const booting = new Promise<void>((resolve) => { release = resolve; });
  deps.openSiteServer = async (siteDir: string) => { await booting; deps.openSites.set(siteDir, { server: { port: 4321 } }); };
  trackSite(deps.projectsPath, "/sites/a");

  const starting = handleStart("/sites/a", deps as typeof deps & Pick<ProjectIpcDeps, "openSiteServer">); // assigned just above
  assert.equal(first(handleList(deps)).status, "starting");
  assert.equal(first(handleList(deps)).desiredState, "running");
  // Never a stale port: the record carries one only once a live entry publishes it.
  assert.equal(first(handleList(deps)).port, 0);

  release();
  assert.equal((await starting).status, "running");
});

test("a start that FAILS leaves the card stopped, not starting forever", async () => {
  const transitions = createSiteTransitions();
  const deps = baseDeps({ transitions });
  deps.openSiteServer = async () => { throw new Error("tovu serve failed: PORT_IN_USE"); };
  trackSite(deps.projectsPath, "/sites/a");

  await assert.rejects(() => handleStart("/sites/a", deps as typeof deps & Pick<ProjectIpcDeps, "openSiteServer">), /PORT_IN_USE/); // assigned just above
  assert.equal(first(handleList(deps)).status, "stopped");
});

test("a mid-transition card shows no stale crash reason from a previous exit", async () => {
  // Two different moments reported as one: "Starting" and "the server exited (code 1)" in the same
  // breath is a card describing the boot it is watching AND the death that preceded it.
  const transitions = createSiteTransitions();
  const openSites = createSiteSupervisor<SupervisorEntry>({ onUnexpectedExit: () => {} });
  const listeners: Array<(exit: { code: number | null; signal: string | null }) => void> = [];
  const deps = baseDeps({ openSites, transitions });
  openSites.set("/sites/a", { server: { port: 4321, onExit: (listener) => listeners.push(listener) } });
  for (const listener of listeners) listener({ code: 1, signal: null });
  trackSite(deps.projectsPath, "/sites/a");
  assert.match(first(handleList(deps)).statusDetail ?? "", /exited \(code 1\)/, "the crash IS reported while settled");

  let release = () => {};
  const booting = new Promise<void>((resolve) => { release = resolve; });
  deps.openSiteServer = async () => { await booting; };
  const starting = handleStart("/sites/a", deps as typeof deps & Pick<ProjectIpcDeps, "openSiteServer">); // assigned just above

  assert.equal(first(handleList(deps)).statusDetail, null);
  release();
  await starting;
});

test("without a transitions store, every record is exactly the two-valued answer it always was", () => {
  // The dep is optional so no existing caller or test has to fabricate one. That tolerance is only
  // safe if its absence changes nothing.
  const deps = baseDeps();
  deps.openSites.set("/sites/a", { server: { port: 4321 } });
  trackSite(deps.projectsPath, "/sites/a");
  trackSite(deps.projectsPath, "/sites/b");

  const records = handleList(deps);
  assert.equal(records[0]?.status, "running");
  assert.equal(records[1]?.status, "stopped");
});

test("registerSiteIpcHandlers registers exactly the real channels declared in SITE_IPC_CHANNELS", async () => {
  const registered = new Map();
  const siteDir = writeSite(path.join(tempDir(), "channel-bindings"), "bindings");
  let starts = 0;
  let stops = 0;
  const deps = baseDeps({
    ipcMain: { handle: (channel, listener) => registered.set(channel, listener) },
    openSiteServer: async (id: string) => {
      assert.equal(id, siteDir);
      starts += 1;
      deps.openSites.set(id, { server: { port: 4321, pid: 777, stop: async () => { stops += 1; } } });
    },
  });
  trackSite(deps.projectsPath, siteDir);

  registerSiteIpcHandlers(deps as ProjectIpcDeps); // only start/stop are invoked below

  assert.deepEqual([...registered.keys()].sort(), Object.values(SITE_IPC_CHANNELS).sort());
  const running = await registered.get(CONTRACT_SITE_IPC_CHANNELS.start)({}, siteDir);
  assert.equal(starts, 1);
  assert.equal(stops, 0);
  assert.equal(running.status, "running");
  assert.equal(running.port, 4321);
  assert.equal(deps.openSites.has(siteDir), true);
  const stopped = await registered.get(CONTRACT_SITE_IPC_CHANNELS.stop)({}, siteDir);
  assert.equal(starts, 1);
  assert.equal(stops, 1);
  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.port, 0);
  assert.equal(deps.openSites.has(siteDir), false);
});

// --- delete guard (2026-09-06) -------------------------------------------------------------
//
// `handleDelete` ends in `fs.rm(id, {recursive: true, force: true})`. Every test below exists to
// prove that call is reached ONLY for a directory this app itself created. The hazard these were
// written against: `seedDevFallbackSite` tracks `<repo>/sites/tovu-com` — a git-tracked folder
// holding a real 44 MB production database — and the Projects screen gives every card a two-click
// delete. Nothing about that row said "the app did not make this".

test("handleDelete waits for an in-flight handleStart on the same site instead of rm-ing under it", async () => {
  // D-05/SEC-02. Start a site, then immediately delete it: the child spends up to
  // DEFAULT_READY_TIMEOUT_MS (180s) booting before `openSiteServer` publishes it into `openSites`,
  // so a delete that does not queue behind the start sees no entry, skips the stop, and erases the
  // directory the `tovu serve` is booting in.
  const siteDir = writeSite(path.join(tempDir(), "started-then-deleted"), "site-a");
  const deps = baseDeps({ serializer: createKeyedSerializer() });
  trackSite(deps.projectsPath, siteDir, SITE_ORIGIN.created, { siteId: "site-a" });

  const order: string[] = [];
  let releaseBoot!: () => void; // assigned synchronously by the Promise executor below
  const booted = new Promise<void>((resolve) => { releaseBoot = resolve; });
  deps.openSiteServer = async (id) => {
    order.push("boot:started");
    await booted;
    order.push(fs.existsSync(id) ? "boot:dir-present" : "boot:dir-ERASED");
    deps.openSites.set(id, { server: { port: 4321, stop: async () => order.push("stopped") } });
  };

  const starting = handleStart(siteDir, deps as typeof deps & Pick<ProjectIpcDeps, "openSiteServer">); // assigned just above
  const deleting = handleDelete(siteDir, deps);
  releaseBoot();
  await Promise.all([starting, deleting]);

  assert.deepEqual(order, ["boot:started", "boot:dir-present", "stopped"]);
  assert.equal(deps.openSites.has(siteDir), false);
  assert.equal(fs.existsSync(siteDir), false, "the delete the operator confirmed still happens, just after the stop");
});

test("handleStart refuses a project that was deleted while its start was queued behind the delete", async () => {
  // The reverse interleaving: `handleStart` used to validate the row OUTSIDE the serialized
  // function, so a delete landing between the check and the spawn started a `tovu serve` for a
  // directory that had just been erased.
  const siteDir = writeSite(path.join(tempDir(), "deleted-then-started"), "site-a");
  const deps = baseDeps({ serializer: createKeyedSerializer() });
  trackSite(deps.projectsPath, siteDir, SITE_ORIGIN.created, { siteId: "site-a" });

  let spawned = false;
  deps.openSiteServer = async () => { spawned = true; };
  deps.openSites.set(siteDir, { server: { stop: async () => { await new Promise((r) => setTimeout(r, 20)); } } });

  const deleting = handleDelete(siteDir, deps);
  const starting = handleStart(siteDir, deps as typeof deps & Pick<ProjectIpcDeps, "openSiteServer">); // assigned just above

  await deleting;
  await assert.rejects(() => starting, /Unknown project/);
  assert.equal(spawned, false, "no tovu serve may be spawned for an erased directory");
});

test("handleDelete does NOT erase a created project's path once a DIFFERENT site occupies it", async () => {
  // SEC-01/D-04 at the sink that actually calls `fs.rm`. The operator moved their site elsewhere and
  // another site took its old path; the row is still `created` and still outside the repo, so
  // provenance and containment both pass. Only identity stops this.
  const siteDir = path.join(tempDir(), "my-site");
  writeSite(siteDir, "site-a");

  const deps = baseDeps();
  await handleCreateInto(deps as Parameters<typeof handleCreate>[1], siteDir, "site-a"); // handleCreateInto assigns dialog/classifySiteDir/adoptSiteDir itself before use

  writeSite(siteDir, "site-b-someone-elses", { "content.db": "someone else's real database" });
  await handleDelete(siteDir, deps);

  assert.equal(fs.existsSync(path.join(siteDir, "content.db")), true, "a replacement site's files must survive delete");
  assert.deepEqual(readTrackedSites(deps.projectsPath), [], "the card must still go away");
});

test("handleCreate stamps the new site's own identity on its created row", async () => {
  const siteDir = path.join(tempDir(), "brand-new");
  writeSite(siteDir, "site-a");
  const deps = createDeps({});

  const record = await handleCreateInto(deps as Parameters<typeof handleCreate>[1], siteDir, "site-a"); // handleCreateInto assigns dialog/classifySiteDir/adoptSiteDir itself before use
  assert.ok(record);

  assert.equal(readTrackedSites(deps.projectsPath)[0]!.siteId, "site-a");
  assert.equal(record.deleteErasesFiles, true, "the site it just made is still the site at that path");
});

test("handleAddSite records no deletion identity for a folder it merely adopted", async () => {
  // An `adopted` row can never erase anything, so an identity stamp on it would be a fact nothing
  // reads — and one a future rule might mistake for permission.
  const siteDir = writeSite(path.join(tempDir(), "already-a-site"), "site-a");
  const { deps } = addSiteDeps(siteDir);
  await handleAddSite(deps);
  const [row] = readTrackedSites(deps.projectsPath);
  assert.equal(row!.origin, SITE_ORIGIN.adopted);
  assert.equal(row!.siteId, undefined);
});

/** Drive Create with an initializer fake; only Add owns an existing-folder picker. */
function handleCreateInto(deps: Parameters<typeof handleCreate>[1], siteDir: string, _siteId: string) {
  const creation = createDeps({ ...deps, sharedSites: createSitesWorkspace({}, { homeDir: path.dirname(siteDir), env: { TOVU_SITES_HOME: path.dirname(siteDir) }, platform: "linux" }) });
  creation.dialog = { showOpenDialog: async () => assert.fail("Create must never open a folder picker") };
  creation.classifySiteDir = () => "empty";
  creation.adoptSiteDir = async () => siteDir;
  return handleCreate({ displayName: path.basename(siteDir) }, creation);
}

test("handleDelete does NOT erase the directory of a project the app only adopted", async () => {
  const dir = tempDir();
  const siteDir = path.join(dir, "adopted-site");
  fs.mkdirSync(siteDir);
  fs.writeFileSync(path.join(siteDir, "content.db"), "a real site's real database");

  const deps = baseDeps();
  // No origin argument: the legacy/unknown-provenance row shape, which must fail CLOSED.
  trackSite(deps.projectsPath, siteDir);

  await handleDelete(siteDir, deps);

  assert.equal(fs.existsSync(path.join(siteDir, "content.db")), true, "an adopted project's files must survive delete");
  assert.deepEqual(readTrackedSites(deps.projectsPath), [], "the card must still go away");
});

test("handleDelete refuses to erase anything under the repo root, even a row claiming the app created it", async () => {
  const repoRoot = tempDir();
  const siteDir = path.join(repoRoot, "sites", "tovu-com");
  writeSite(siteDir, "repo-site", { "content.db": "leona's 44 MB production database" });

  const deps = baseDeps({ repoRoot });
  trackSite(deps.projectsPath, siteDir, SITE_ORIGIN.created, { siteId: "repo-site" });

  await handleDelete(siteDir, deps);

  assert.equal(fs.existsSync(path.join(siteDir, "content.db")), true, "a repo-root directory must survive delete regardless of what the row claims");
});

test("handleCreate records created for initialization and refuses a raced existing site", async () => {
  // Classify BEFORE initialization: afterward an initialized and a pre-existing site look alike.
  // That distinction protects existing folders from ever receiving created deletion authority.
  const deps = createDeps({ adoptSiteDir: async ({ dir }) => writeSite(dir, "site-created") });
  const record = await handleCreate({ displayName: "New Site" }, deps);
  assert.equal(readTrackedSites(deps.projectsPath)[0]!.origin, SITE_ORIGIN.created);
  assert.equal(record.deleteErasesFiles, true);
  const raced = createDeps({ classifySiteDir: () => "site", adoptSiteDir: async () => assert.fail("Create must not adopt a raced folder") });
  await assert.rejects(handleCreate({ displayName: "Raced" }, raced), { message: "The new website folder was created by another app. Try creating this website again." });
  assert.deepEqual(readTrackedSites(raced.projectsPath), []);
});

test("buildSiteRecord tells the renderer whether delete will erase files, from the guard main obeys", () => {
  const repoRoot = tempDir();
  const insideRepo = writeSite(path.join(repoRoot, "sites", "tovu-com"), "site-in-repo");
  const outsideRepo = writeSite(path.join(tempDir(), "my-site"), "site-a");
  const deps = baseDeps({ repoRoot });
  const base = { createdAt: "2026-01-01", siteId: "site-a" };

  const created = buildSiteRecord({ ...base, siteDir: outsideRepo, origin: SITE_ORIGIN.created }, deps);
  const adopted = buildSiteRecord({ ...base, siteDir: outsideRepo, origin: SITE_ORIGIN.adopted }, deps);
  const inRepo = buildSiteRecord({ ...base, siteDir: insideRepo, siteId: "site-in-repo", origin: SITE_ORIGIN.created }, deps);
  const movedAway = buildSiteRecord({ ...base, siteDir: outsideRepo, siteId: "site-that-left", origin: SITE_ORIGIN.created }, deps);

  assert.equal(created.deleteErasesFiles, true);
  assert.equal(adopted.deleteErasesFiles, false);
  assert.equal(inRepo.deleteErasesFiles, false);
  // The renderer must not offer "this deletes your files" for a path whose site is no longer the
  // one the row names — the overlay's promise and `handleDelete`'s behaviour stay one answer.
  assert.equal(movedAway.deleteErasesFiles, false);
});

test("handleDelete still stops and closes a running project it may not erase", async () => {
  const siteDir = path.join(tempDir(), "adopted-but-open");
  fs.mkdirSync(siteDir);
  fs.writeFileSync(path.join(siteDir, "content.db"), "keep me");

  const order: string[] = [];
  const deps = baseDeps();
  trackSite(deps.projectsPath, siteDir, SITE_ORIGIN.adopted);
  deps.openSites.set(siteDir, {
    server: { stop: async () => order.push("stopped") },
    window: { isDestroyed: () => false, destroy: () => order.push("destroyed") },
  });

  await handleDelete(siteDir, deps);

  assert.deepEqual(order, ["stopped", "destroyed"], "removing the card still closes the site it was showing");
  assert.equal(fs.existsSync(path.join(siteDir, "content.db")), true);
});

// ---------------------------------------------------------------------------------------------
// `rescanSites` — the discovery pass, run once at boot and again whenever the operator asks.
// ---------------------------------------------------------------------------------------------

/** A directory the REAL `classifySiteDir` will call a site: both marker files present. */
function siteFolder(parent: string, name: string): string {
  const dir = path.join(parent, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name }));
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
      siteScanRoots: [root],
      recentSiteDirs: () => [],
      ...overrides,
    }),
    scanRoot: root,
  };
}

test("rescanSites reads persisted extra folders fresh and leaves all discoveries stopped", async () => {
  const deps = scanDeps();
  const folders = createSiteFolders({ statePath: deps.statePath, defaultRoots: deps.siteScanRoots });
  const wired = { ...deps, siteFolders: folders, openSiteServer: async () => assert.fail('discovery must never start a server') };
  const outsideRoot = fs.realpathSync(tempDir());
  const luvira = siteFolder(outsideRoot, "luvira");
  const plannie = siteFolder(outsideRoot, "plannie");
  assert.deepEqual(await rescanSites(wired), []);
  folders.add({ root: outsideRoot });
  const records = await rescanSites(wired);
  assert.deepEqual(records.map((record) => record.id), [luvira, plannie]);
  assert.ok(records.every((record) => record.status === "stopped" && record.desiredState === "stopped" && record.port === 0));
  assert.equal((wired.openSites as Map<string, unknown>).size, 0);
  const before = readTrackedSites(wired.projectsPath);
  assert.equal((await rescanSites(wired)).length, 2);
  assert.deepEqual(readTrackedSites(wired.projectsPath), before);
  folders.remove({ root: outsideRoot });
  assert.equal((await rescanSites(wired)).length, 2, 'removing a root never removes existing cards');
});

test("handleCreate remembers its home so a site later created beside it is discovered", async () => {
  const homeDir = fs.realpathSync(tempDir());
  const parent = path.join(homeDir, "Documents", "Tovu", "sites");
  fs.mkdirSync(parent, { recursive: true });
  const picked = path.join(parent, "created");
  const deps = createDeps({
    adoptSiteDir: async () => writeSite(picked, "created-id"),
    siteScanRoots: [] as string[], recentSiteDirs: () => [],
  }, { home: parent, homeDir });
  const folders = createSiteFolders({ statePath: deps.statePath, defaultRoots: [] });
  await handleCreate({ displayName: "Created" }, { ...deps, siteFolders: folders });
  const sibling = siteFolder(parent, "plannie");
  const restarted = createSiteFolders({ statePath: deps.statePath, defaultRoots: [] });
  const records = await rescanSites({ ...deps, classifySiteDir: classifySiteDirSafely, siteFolders: restarted });
  assert.deepEqual(records.map((record) => record.id).sort(), [picked, sibling].sort());
});

test("sites folders IPC picks a root, handles cancellation, and removes only the setting", async () => {
  const deps = scanDeps();
  const root = fs.realpathSync(tempDir());
  const folders = createSiteFolders({ statePath: deps.statePath, defaultRoots: [] });
  const registered = new Map<string, Parameters<ProjectIpcDeps["ipcMain"]["handle"]>[1]>();
  let canceled = false;
  const options: unknown[] = [];
  registerSiteIpcHandlers({
    ...deps, siteFolders: folders,
    ipcMain: { handle: (channel, handler) => { registered.set(channel, handler); } },
    dialog: { showOpenDialog: async (input) => { options.push(input); return { canceled, filePaths: [root] }; } },
  } as ProjectIpcDeps);
  const invoke = (channel: string, input?: unknown) => registered.get(channel)!({}, input);
  assert.deepEqual(await invoke(SITE_IPC_CHANNELS.listFolders), { roots: [], extraRoots: [] });
  assert.deepEqual(await invoke(SITE_IPC_CHANNELS.addFolder), { roots: [root], extraRoots: [root] });
  assert.deepEqual(options[0], {
    title: "Add sites folder", message: "Choose a folder containing Tovu website folders. Use Rescan to discover them.",
    buttonLabel: "Add folder", properties: ["openDirectory"],
  });
  canceled = true;
  assert.equal(await invoke(SITE_IPC_CHANNELS.addFolder), null);
  assert.deepEqual(folders.read({}).extraRoots, [root]);
  assert.throws(() => invoke(SITE_IPC_CHANNELS.removeFolder, { root: "relative" }), { message: "Choose an absolute sites folder path to remove." });
  assert.deepEqual(await invoke(SITE_IPC_CHANNELS.removeFolder, { root }), { roots: [], extraRoots: [] });
  assert.equal(fs.existsSync(root), true);
});

test("rescanSites makes a site dir that exists on disk but was never registered visible", async () => {
  const deps = scanDeps();
  const alpha = siteFolder(deps.scanRoot, "alpha");
  assert.deepEqual(handleList(deps), [], "precondition: nothing is tracked yet");
  const records = await rescanSites(deps);
  assert.deepEqual(records.map((r) => r.id), [alpha]);
  assert.deepEqual(handleList(deps).map((r) => r.id), [alpha], "and it survives into the next list");
});

test("rescanSites records a discovery as adopted, so deleting its card can never erase it", async () => {
  const deps = scanDeps();
  siteFolder(deps.scanRoot, "alpha");
  const [record] = await rescanSites(deps);
  assert.equal(record!.deleteErasesFiles, false); // this test's own siteFolder call above seeds exactly one discoverable site
  assert.equal(readTrackedSites(deps.projectsPath)[0]!.origin, SITE_ORIGIN.adopted);
});

test("rescanSites never resurrects a project the operator removed on purpose", async () => {
  const deps = scanDeps();
  const alpha = siteFolder(deps.scanRoot, "alpha");
  await rescanSites(deps);
  await handleDelete(alpha, deps);
  assert.deepEqual(handleList(deps), [], "precondition: the removal took");
  // Repeatedly, because a rescan is an operator-triggered button, not a one-shot boot step.
  assert.deepEqual(await rescanSites(deps), []);
  assert.deepEqual(await rescanSites(deps), []);
  assert.deepEqual(handleList(deps), []);
  assert.equal(fs.existsSync(path.join(alpha, "config.json")), true, "and the folder itself is untouched");
});

test("rescanSites picks up a recently-opened site that lives outside every scan root", async () => {
  const outside = siteFolder(tempDir(), "elsewhere");
  const deps = scanDeps({ recentSiteDirs: () => [outside] });
  assert.deepEqual((await rescanSites(deps)).map((r) => r.id), [outside]);
});

test("rescanSites leaves an already-tracked project's row as it was, apart from the cached name", async () => {
  const deps = scanDeps();
  const alpha = siteFolder(deps.scanRoot, "alpha");
  trackSite(deps.projectsPath, alpha, SITE_ORIGIN.adopted);
  const before = readTrackedSites(deps.projectsPath);
  await rescanSites(deps);
  // D-18: listing caches the last known name so a later missing-folder card can still show it;
  // origin, createdAt and identity must stay exactly as tracked.
  assert.deepEqual(readTrackedSites(deps.projectsPath), [{ ...before[0]!, displayName: "alpha" }]);
});

test("rescanSites ignores a folder under the scan root that is not a site", async () => {
  const deps = scanDeps();
  fs.mkdirSync(path.join(deps.scanRoot, "not-a-site"), { recursive: true });
  fs.writeFileSync(path.join(deps.scanRoot, "loose.txt"), "hi");
  assert.deepEqual(await rescanSites(deps), []);
});

test("registerSiteIpcHandlers registers the rescan channel and it returns the fresh list", async () => {
  const deps = scanDeps();
  const alpha = siteFolder(deps.scanRoot, "alpha");
  const registered = new Map();
  registerSiteIpcHandlers({
    ...deps,
    ipcMain: { handle: (c: string, h: Parameters<ProjectIpcDeps["ipcMain"]["handle"]>[1]) => registered.set(c, h) },
    dialog: {},
    shell: {}
  } as unknown as ProjectIpcDeps); // only the rescan channel is ever invoked below
  const records = await registered.get(SITE_IPC_CHANNELS.rescan)({}) as Awaited<ReturnType<typeof rescanSites>>;
  assert.deepEqual(records.map((r) => r.id), [alpha]);
});

// D-08. `handleDelete`'s stop-then-erase sequence was safe against THIS process (the serializer) and
// against nothing else. `main.ts` calls no `requestSingleInstanceLock`, and `site-process-registry.ts` is
// written throughout on the premise that two instances can run at once — each records only into its
// own file, so a sibling's row for the same site survives. Instance A deleting a site instance B has
// open recursively erased the directory out from under B's live `tovu serve`.

/** Registry state as a second app instance would have left it: a row for `siteDir` under a pid this
 *  process is not holding, in that instance's own file. */
function seedForeignRegistryRow(deps: Pick<ProjectIpcDeps, "registryPath">, siteDir: string, pid = 999_001): void {
  writeRegistry(instanceFilePath(deps.registryPath, "424242-f0f0f0f0"), {
    sites: [{ siteDir, port: 41234, workspaceId: "ws-foreign", pid, updatedAt: Date.now() }],
  });
}

test("handleDelete refuses to erase a directory a SECOND app instance still has open", async () => {
  const siteDir = writeSite(path.join(tempDir(), "site-shared"), "site-shared", { "content.db": "real bytes" });
  const deps = baseDeps({ isLiveServeRow: () => true });
  trackSite(deps.projectsPath, siteDir, SITE_ORIGIN.created, { siteId: "site-shared" });
  seedForeignRegistryRow(deps, siteDir);

  await assert.rejects(() => handleDelete(siteDir, deps), /still has this site open/);

  // The load-bearing half: refused BEFORE any side effect, not partway through one.
  assert.equal(fs.existsSync(siteDir), true, "the directory must survive — a live server is still writing to it");
  assert.equal(fs.existsSync(path.join(siteDir, "content.db")), true);
  assert.equal(readTrackedSites(deps.projectsPath).length, 1, "the project must stay tracked, since nothing was deleted");
});

test("handleDelete does not stop its OWN server when it refuses", async () => {
  const siteDir = writeSite(path.join(tempDir(), "site-shared-open"), "site-shared-open", {});
  let stopped = false;
  const closed: unknown[] = [];
  const deps = baseDeps({ isLiveServeRow: () => true, recordSiteClosed: (...args) => closed.push(args) });
  deps.openSites.set(siteDir, { server: { pid: 4242, stop: async () => { stopped = true; } } });
  trackSite(deps.projectsPath, siteDir, SITE_ORIGIN.created, { siteId: "site-shared-open" });
  seedForeignRegistryRow(deps, siteDir);

  await assert.rejects(() => handleDelete(siteDir, deps), /still has this site open/);
  assert.equal(stopped, false, "a refused delete must leave this instance's own site running too");
  assert.equal(deps.openSites.has(siteDir), true);
  assert.deepEqual(closed, [], "a refusal must retain the crash-safety row");
});

test("this instance's OWN registry row never counts as a foreign server", async () => {
  // Narrowed by pid, exactly as `recordSiteClosed` is: our own child writes a row for this site dir,
  // and reading it back as "someone else has it open" would make every delete of a running project
  // impossible.
  const siteDir = writeSite(path.join(tempDir(), "site-own"), "site-own", {});
  const deps = baseDeps({ isLiveServeRow: () => true });
  deps.openSites.set(siteDir, { server: { pid: 777, stop: async () => {} } });
  trackSite(deps.projectsPath, siteDir, SITE_ORIGIN.created, { siteId: "site-own" });
  seedForeignRegistryRow(deps, siteDir, 777);

  await assert.doesNotReject(() => handleDelete(siteDir, deps));
  assert.equal(fs.existsSync(siteDir), false);
});

test("a STALE registry row does not wedge a delete", async () => {
  // Exercise both halves of the real identity proof: a dead pid, and a live unrelated process
  // standing in for a recycled pid. Neither may be mistaken for this site's server.
  const deadPid = 2_147_483_647;
  assert.throws(() => process.kill(deadPid, 0), { code: "ESRCH" }, "the fixture must really be dead");
  for (const pid of [deadPid, process.pid]) {
    const siteDir = writeSite(path.join(tempDir(), "site-stale"), "site-stale", {});
    const deps = baseDeps();
    trackSite(deps.projectsPath, siteDir, SITE_ORIGIN.created, { siteId: "site-stale" });
    seedForeignRegistryRow(deps, siteDir, pid);

    await assert.doesNotReject(() => handleDelete(siteDir, deps));
    assert.equal(fs.existsSync(siteDir), false);
  }
});

test("handleDelete refuses to erase while a registry file is unreadable — its rows are unknown, not absent", async () => {
  // A torn or corrupt sibling file used to read as "no rows", so the guard waved the erase through
  // without knowing whether that sibling had this very site open.
  const siteDir = writeSite(path.join(tempDir(), "site-unknown"), "site-unknown", { "content.db": "real bytes" });
  const deps = baseDeps({ isLiveServeRow: () => true });
  trackSite(deps.projectsPath, siteDir, SITE_ORIGIN.created, { siteId: "site-unknown" });
  const torn = instanceFilePath(deps.registryPath, "424242-f0f0f0f0");
  fs.mkdirSync(deps.registryPath, { recursive: true });
  fs.writeFileSync(torn, '{\n  "sites": [\n    { "siteDir": ');

  await assert.rejects(
    () => handleDelete(siteDir, deps),
    (error: Error) => error.message === `Could not read ${torn}, so Tovu cannot tell whether another copy of Tovu still has this site open. Nothing was deleted. Restart Tovu and try again.`,
  );
  assert.equal(fs.existsSync(path.join(siteDir, "content.db")), true, "nothing may be erased on an unknown");
  assert.equal(readTrackedSites(deps.projectsPath).length, 1, "and the project stays tracked");
});

test("REMOVING an adopted project is not gated by a sibling instance — it erases nothing", async () => {
  // The non-erasing arm means "take this card off my Projects screen". A second instance keeping
  // its own copy running is not endangered by that, so refusing would block a harmless action.
  const siteDir = writeSite(path.join(tempDir(), "site-adopted"), "site-adopted", { "content.db": "real bytes" });
  const deps = baseDeps({ isLiveServeRow: () => true });
  trackSite(deps.projectsPath, siteDir, SITE_ORIGIN.adopted, { siteId: "site-adopted" });
  seedForeignRegistryRow(deps, siteDir);

  await assert.doesNotReject(() => handleDelete(siteDir, deps));
  assert.deepEqual(readTrackedSites(deps.projectsPath), [], "the card is gone");
  assert.equal(fs.existsSync(path.join(siteDir, "content.db")), true, "and every byte stays");
});

/* ---------- handleRename ---------- */

/** `deps` for a rename: a real tracked row, a real site on disk, and the real `writeSiteName`. */
function renameDeps(overrides = {}) {
  const deps = baseDeps({ classifySiteDir: classifySiteDirSafely, writeSiteName, ...overrides });
  return deps;
}

test("handleRename renames an ADOPTED row, which carries no siteId and never will", () => {
  // THE regression test for this feature's original design defect. `isStillTheRecordedSite` was
  // the proposed guard; it returns false unless `row.siteId` is a non-empty string, and
  // `buildTrackedRow` stamps `siteId` only on a `created` row. Every site the operator adopted —
  // "Add Tovu Website", a rescan, "Open Site…" — is therefore unrenameable under that guard, which
  // is to say the feature would not have worked on a single real site.
  const deps = renameDeps({ readSiteName: (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8")).name });
  const dir = writeSite(path.join(path.dirname(deps.projectsPath), "adopted-site"), "id-a");
  trackSite(deps.projectsPath, dir, SITE_ORIGIN.adopted);
  assert.equal(readTrackedSites(deps.projectsPath)[0]!.siteId, undefined, "precondition: adopted rows carry no siteId");

  const record = handleRename({ id: dir, name: "Renamed Site" }, deps);

  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8")).name, "Renamed Site");
  assert.equal(record.id, dir);
  assert.equal(record.displayName, "Renamed Site");
});

test("handleRename refuses an id this shell does not track", () => {
  const deps = renameDeps();
  assert.throws(
    () => handleRename({ id: "/sites/never-tracked", name: "New" }, deps),
    /not tracking a site at \/sites\/never-tracked/,
  );
});

test("handleRename refuses a directory that is no longer a complete Tovu site", () => {
  // The moved-, emptied-, or deleted-folder case — the one this guard actually catches most often.
  const deps = renameDeps();
  const dir = writeSite(path.join(path.dirname(deps.projectsPath), "gone-site"), "id-a");
  trackSite(deps.projectsPath, dir, SITE_ORIGIN.adopted);
  fs.rmSync(path.join(dir, ".site-meta.json"));

  assert.throws(() => handleRename({ id: dir, name: "New" }, deps), /no longer a complete Tovu site \(incomplete\)/);
  // And the name on disk is untouched — a refusal must not half-apply.
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8")).name, "gone-site");
});

test("handleRename refuses when a CREATED row's recorded identity no longer matches the directory", () => {
  // `project-delete-guard.ts`'s documented trap: the operator moves their site and something else
  // takes the old path. Provable only for a row that recorded an identity, which is why this is the
  // `created` case and the adopted test above is the fail-open one.
  const deps = renameDeps();
  const dir = writeSite(path.join(path.dirname(deps.projectsPath), "swapped-site"), "id-original");
  trackSite(deps.projectsPath, dir, SITE_ORIGIN.created, { siteId: "id-original" });
  // A DIFFERENT site now occupies that path.
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId: "id-stranger", schemaVersion: 58 }));

  assert.throws(() => handleRename({ id: dir, name: "New" }, deps), /not the one this card was made for/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8")).name, "swapped-site");
});

test("handleRename renames a CREATED row whose identity still matches", () => {
  // The other half of the check above — it must not refuse the case it exists to permit.
  const deps = renameDeps();
  const dir = writeSite(path.join(path.dirname(deps.projectsPath), "created-site"), "id-same");
  trackSite(deps.projectsPath, dir, SITE_ORIGIN.created, { siteId: "id-same" });

  handleRename({ id: dir, name: "Still Mine" }, deps);

  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8")).name, "Still Mine");
});

test("handleRename rejects an invalid name without writing", () => {
  const deps = renameDeps();
  const dir = writeSite(path.join(path.dirname(deps.projectsPath), "named-site"), "id-a");
  trackSite(deps.projectsPath, dir, SITE_ORIGIN.adopted);

  assert.throws(() => handleRename({ id: dir, name: "   " }, deps), /1 to 200 characters/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8")).name, "named-site");
});

test("handleRename retitles an OPEN own-server window, so the native Window menu stops lying", () => {
  // `readSiteName`'s own doc: that title is "what makes Electron's native Window menu double as a
  // site switcher (distinct titles, distinct entries)" — so a stale one is a stale CONTROL.
  const deps = renameDeps();
  const dir = writeSite(path.join(path.dirname(deps.projectsPath), "open-site"), "id-a");
  trackSite(deps.projectsPath, dir, SITE_ORIGIN.adopted);
  const titles: string[] = [];
  deps.openSites.set(dir, {
    server: { port: 4321 },
    window: { isDestroyed: () => false, setTitle: (title) => titles.push(title) },
  });

  handleRename({ id: dir, name: "Retitled" }, deps);

  assert.deepEqual(titles, ["Retitled"], "the open window's title must follow the rename");
});

test("handleRename skips a destroyed own-server window", () => {
  const deps = renameDeps();
  const dir = writeSite(path.join(path.dirname(deps.projectsPath), "destroyed-window-site"), "id-a");
  trackSite(deps.projectsPath, dir, SITE_ORIGIN.adopted);
  const titles: string[] = [];
  deps.openSites.set(dir, {
    server: { port: 4321 },
    window: { isDestroyed: () => true, setTitle: (title) => titles.push(title) },
  });

  const record = handleRename({ id: dir, name: "Renamed" }, deps);

  assert.equal(record.id, dir);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8")).name, "Renamed");
  assert.deepEqual(titles, [], "setTitle must never run on a destroyed window");
});

test("handleRename survives the usual case, where there is no window at all", () => {
  // A card opens its site as a `<webview>` tab inside the sites home window; `openSiteServer` is
  // spawn-only and sets no `window`. That is the COMMON shape, so an unguarded `.setTitle` here
  // would throw on nearly every rename of a running site.
  const deps = renameDeps();
  const dir = writeSite(path.join(path.dirname(deps.projectsPath), "tabbed-site"), "id-a");
  trackSite(deps.projectsPath, dir, SITE_ORIGIN.adopted);
  deps.openSites.set(dir, { server: { port: 4321 } });

  const record = handleRename({ id: dir, name: "Tabbed" }, deps);

  assert.equal(record.status, "running");
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8")).name, "Tabbed");
});

test("handleRename does not touch .site-meta.json — the marker repairSite refuses to overwrite", () => {
  // The whole argument for why this write is allowed to exist next to a function that refuses to
  // write: `repairSite`'s refusal protects the schema stamp, and a rename must never go near it.
  const deps = renameDeps();
  const dir = writeSite(path.join(path.dirname(deps.projectsPath), "stamped-site"), "id-a");
  trackSite(deps.projectsPath, dir, SITE_ORIGIN.adopted);
  const before = fs.readFileSync(path.join(dir, ".site-meta.json"), "utf8");

  handleRename({ id: dir, name: "Renamed" }, deps);

  assert.equal(fs.readFileSync(path.join(dir, ".site-meta.json"), "utf8"), before, ".site-meta.json must be byte-identical");
});

// ---- Moved or renamed site folders (owner, 0.1.6 dmg: "tovu-com showed up but didn't exist") ----

test("handleList heals a renamed site folder: the card follows the folder to its new name", () => {
  const deps = baseDeps();
  const parent = tempDir();
  const oldDir = path.join(parent, "tovu-com");
  writeTrackedSites(deps.projectsPath, [{ siteDir: oldDir, createdAt: "2026-01-01", relocationId: "id-1" }]);
  const newDir = writeSite(path.join(parent, "tovu-dev"), "id-1");

  const records = handleList(deps);

  assert.deepEqual(records.map((record) => [record.id, record.folderMissing]), [[newDir, false]]);
  assert.deepEqual(readTrackedSites(deps.projectsPath).map((row) => row.siteDir), [newDir]);
});

test("handleList keeps a folder it cannot find, and says so on the card", () => {
  const deps = baseDeps();
  const gone = path.join(tempDir(), "deleted-site");
  trackSite(deps.projectsPath, gone);

  assert.deepEqual(handleList(deps).map((record) => [record.id, record.folderMissing]), [[gone, true]]);
});

test("handleList still answers when the healed list cannot be saved", (t) => {
  const deps = baseDeps();
  const parent = tempDir();
  const oldDir = path.join(parent, "tovu-com");
  writeTrackedSites(deps.projectsPath, [{ siteDir: oldDir, createdAt: "2026-01-01", relocationId: "id-1" }]);
  writeSite(path.join(parent, "tovu-dev"), "id-1");
  const stored = fs.readFileSync(deps.projectsPath, "utf8");
  const renameSync = fs.renameSync;
  let failedWrites = 0;
  t.mock.method(fs, "renameSync", (from: fs.PathLike, to: fs.PathLike) => {
    if (to === deps.projectsPath) {
      failedWrites += 1;
      throw new Error("injected persistence failure");
    }
    return renameSync(from, to);
  });
  assert.deepEqual(handleList(deps).map((record) => record.id), [oldDir]);
  assert.equal(failedWrites, 1, "the heal must actually attempt to persist");
  assert.equal(fs.readFileSync(deps.projectsPath, "utf8"), stored);
  assert.deepEqual(readTrackedSites(deps.projectsPath).map((row) => row.siteDir), [oldDir]);
});

test("buildSiteRecord's folderMissing is false for a folder that exists", () => {
  const deps = baseDeps();
  assert.equal(buildSiteRecord({ siteDir: siteFixture(), createdAt: "2026-01-01" }, deps).folderMissing, false);
});

/** `baseDeps` plus the folder dialog {@link handleLocate} opens, answering with `pickedPath`. */
function locateDeps(pickedPath: string | null) {
  return baseDeps({
    classifySiteDir: classifySiteDirSafely,
    dialog: {
      showOpenDialog: async () => (pickedPath === null ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [pickedPath] }),
    },
  });
}

test("handleLocate points a missing card at the folder the operator picked", async () => {
  const picked = siteFixture("moved-here");
  const deps = locateDeps(picked);
  const gone = path.join(tempDir(), "gone");
  trackSite(deps.projectsPath, gone);

  const record = await handleLocate(gone, deps);

  assert.equal(record.id, picked);
  assert.equal(record.folderMissing, false);
  assert.deepEqual(readTrackedSites(deps.projectsPath).map((row) => row.siteDir), [picked]);
});

test("handleLocate refuses a folder that is not a Tovu site, and changes nothing", async () => {
  const deps = locateDeps(tempDir());
  const gone = path.join(tempDir(), "gone");
  trackSite(deps.projectsPath, gone);

  await assert.rejects(() => handleLocate(gone, deps), {
    message: /is not a complete Tovu site \(empty\)\. Pick the folder that holds this website\.$/,
  });
  assert.deepEqual(readTrackedSites(deps.projectsPath).map((row) => row.siteDir), [gone]);
});

test("handleLocate rejects a cancelled dialog", async () => {
  const deps = locateDeps(null);
  await assert.rejects(() => handleLocate("/whatever", deps), { message: "No folder was chosen." });
});

test("handleLocate merges into an already-tracked folder without replacing its row", async () => {
  const picked = siteFixture("already-tracked");
  const deps = locateDeps(picked);
  const gone = path.join(tempDir(), "gone");
  trackSite(deps.projectsPath, gone);
  trackSite(deps.projectsPath, picked);
  const existing = readTrackedSites(deps.projectsPath).find((row) => row.siteDir === picked)!;

  const record = await handleLocate(gone, deps);

  assert.equal(record.id, picked);
  assert.equal(record.folderMissing, false);
  assert.deepEqual(readTrackedSites(deps.projectsPath), [existing]);
});

test("handleLocate refuses an untracked id without altering the tracked list", async () => {
  const picked = siteFixture("picked");
  const deps = locateDeps(picked);
  trackSite(deps.projectsPath, picked);
  const before = readTrackedSites(deps.projectsPath);

  await assert.rejects(() => handleLocate("/never-tracked", deps), /not tracking a site.*nothing to locate/);

  assert.deepEqual(readTrackedSites(deps.projectsPath), before);
});

test('D-01: delete untracks and removes the preview only after the files are gone; a failed erase keeps the card', async () => {
  for (const fails of [true, false]) {
    const siteDir = writeSite(path.join(tempDir(), 'read-only-site'), 'd01-site');
    const deps = baseDeps({
      removeSiteTree: async ({ root }): Promise<void> => {
        assert.equal(root, siteDir);
        assert.equal(readTrackedSites(deps.projectsPath).length, 1, 'keep the recovery card during erase');
        if (fails) throw Object.assign(new Error('unlink failed'), { code: 'EACCES' });
        fs.rmSync(root, { recursive: true });
      },
      deletePreview: () => assert.equal(fs.existsSync(siteDir), false),
    });
    trackSite(deps.projectsPath, siteDir, SITE_ORIGIN.created, { siteId: 'd01-site' });
    if (fails) {
      await assert.rejects(handleDelete(siteDir, deps), {
        message: 'Could not delete this website. Permission was denied. Its card has been kept so you can try again.',
      });
      assert.equal(readTrackedSites(deps.projectsPath).length, 1);
      assert.equal(fs.existsSync(siteDir), true);
    } else {
      await handleDelete(siteDir, deps);
      assert.deepEqual(readTrackedSites(deps.projectsPath), []);
      assert.equal(fs.existsSync(siteDir), false);
    }
  }
});

test('D-01: deleting a read-only plugin store really removes its entire tree', async () => {
  const siteDir = writeSite(path.join(tempDir(), 'immutable-site'), 'immutable-site');
  const store = path.join(siteDir, 'agent-plugins', 'package');
  fs.mkdirSync(store, { recursive: true });
  fs.writeFileSync(path.join(store, 'mcp.json'), '{}');
  fs.chmodSync(path.join(store, 'mcp.json'), 0o444);
  fs.chmodSync(store, 0o555);
  fs.chmodSync(path.dirname(store), 0o555);
  const deps = baseDeps();
  trackSite(deps.projectsPath, siteDir, SITE_ORIGIN.created, { siteId: 'immutable-site' });
  await handleDelete(siteDir, deps);
  assert.equal(fs.existsSync(siteDir), false);
  assert.deepEqual(readTrackedSites(deps.projectsPath), []);
});

test('D-02: invalid Create names are rejected with exact inline copy before opening the folder picker', async () => {
  const deps = baseDeps({
    dialog: { showOpenDialog: async () => assert.fail('invalid names must not open the picker') },
    adoptSiteDir: async () => assert.fail('invalid names must not create files'),
  });
  for (const displayName of ['', '   ', 'x'.repeat(201)]) {
    await assert.rejects(handleCreate({ displayName }, deps), {
      message: 'A name must be 1 to 200 characters, not counting spaces at either end.',
    });
  }
});

test('D-18: the last read name survives a missing folder, including after Rename', () => {
  const siteDir = writeSite(path.join(tempDir(), 'slug'), 'named-site');
  const deps = baseDeps({
    readSiteName: (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')).name as string,
    writeSiteName,
    classifySiteDir: classifySiteDirSafely,
  });
  trackSite(deps.projectsPath, siteDir, SITE_ORIGIN.created, { siteId: 'named-site' });
  assert.equal(first(handleList(deps)).displayName, 'slug');
  handleRename({ id: siteDir, name: 'My website' }, deps);
  fs.rmSync(siteDir, { recursive: true });
  const record = first(handleList(deps));
  assert.equal(record.displayName, 'My website');
  assert.equal(record.folderMissing, true);
});

test('D-10: Create passes the first free name to the injected initializer', async () => {
  const names = new Map<string, string>();
  const root = tempDir();
  let initializedName = '';
  const deps = createDeps({
    readSiteName: (dir: string) => names.get(dir) ?? path.basename(dir),
    adoptSiteDir: async ({ dir, name }: { dir: string; name?: string }) => {
      fs.mkdirSync(dir, { recursive: true });
      initializedName = name!;
      names.set(dir, name!);
      return dir;
    },
  });
  for (const [slug, name] of [['a', ' Bakery '], ['b', 'BAKERY 2'], ['c', 'Bakery 4']]) {
    const dir = path.join(root, slug!);
    names.set(dir, name!);
    trackSite(deps.projectsPath, dir, SITE_ORIGIN.adopted);
  }
  const target = planNewSiteDir({ name: 'bakery' }, { workspace: deps.sharedSites });
  const result = await handleCreate({ displayName: 'bakery' }, deps);
  assert.equal(initializedName, 'bakery 3');
  assert.equal(result?.displayName, 'bakery 3');
  assert.equal(handleList(deps).find((row) => row.id === target)?.displayName, 'bakery 3');
});

test('D-10: Add aliases duplicate names durably without writing either site config; re-add is stable', async () => {
  const root = tempDir();
  const first = writeSite(path.join(root, 'first'), 'first');
  const second = writeSite(path.join(root, 'second'), 'second');
  fs.writeFileSync(path.join(first, 'config.json'), JSON.stringify({ name: 'Bakery' }));
  fs.writeFileSync(path.join(second, 'config.json'), JSON.stringify({ name: ' bakery ' }));
  const before = fs.readFileSync(path.join(second, 'config.json'), 'utf8');
  const { deps } = addSiteDeps(second, {
    readSiteName: (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')).name as string,
  });
  trackSite(deps.projectsPath, first, SITE_ORIGIN.adopted);
  assert.equal((await handleAddSite(deps))?.displayName, 'bakery 2');
  assert.equal((await handleAddSite(deps))?.displayName, 'bakery 2');
  assert.equal(handleList(deps).find((row) => row.id === second)?.displayName, 'bakery 2');
  assert.equal(fs.readFileSync(path.join(second, 'config.json'), 'utf8'), before);
  assert.equal(JSON.parse(fs.readFileSync(path.join(first, 'config.json'), 'utf8')).name, 'Bakery');
});

test('D-10: Rename refuses duplicate before calling its write port and allows its own name', () => {
  const root = tempDir();
  const own = writeSite(path.join(root, 'own'), 'own');
  const other = writeSite(path.join(root, 'other'), 'other');
  let writes = 0;
  const names = new Map([[own, 'Bakery'], [other, 'bakery 2']]);
  const deps = renameDeps({
    readSiteName: (dir: string) => names.get(dir)!,
    writeSiteName: (dir: string, name: string) => { writes += 1; names.set(dir, name.trim()); return name.trim(); },
  });
  trackSite(deps.projectsPath, own, SITE_ORIGIN.adopted);
  trackSite(deps.projectsPath, other, SITE_ORIGIN.adopted);
  assert.throws(() => handleRename({ id: own, name: ' BAKERY 2 ' }, deps), {
    message: 'A website named "BAKERY 2" is already tracked. Choose a different name.',
  });
  assert.equal(writes, 0);
  assert.equal(handleRename({ id: own, name: ' BAKERY ' }, deps).displayName, 'BAKERY');
  assert.equal(writes, 1);
});

test("default rescan and Add folder use the workspace's injected home for broad-root admission", async (t) => {
  const { createSitesWorkspace } = await import("./shared-sites.ts");
  const home = fs.realpathSync(tempDir()); t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const sharedSites = createSitesWorkspace({}, { homeDir: home, env: {}, cwd: home, sourceRoots: [], platform: "linux" });
  const old = writeSite(path.join(home, "Documents", "Tovu", "alpha"), "alpha-id");
  const nested = writeSite(path.join(sharedSites.home({}), "sites", "beta"), "beta-id");
  writeSite(path.join(home, "Tovu", "stay-local"), "local-id");
  const projectsPath = path.join(home, "profile", "desktop-projects.json"), statePath = path.join(home, "profile", "desktop-state.json");
  const siteFolders = createSiteFolders({ statePath, defaultRoots: [], workspace: sharedSites });
  let picked = path.join(home, "Documents", "Websites"); fs.mkdirSync(picked);
  const deps = baseDeps({ sharedSites, projectsPath, statePath, siteFolders, classifySiteDir: classifySiteDirSafely,
    recentSiteDirs: () => [], siteScanRoots: [], dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [picked] }) } });
  assert.deepEqual((await rescanSites(deps)).map((record) => record.id).sort(), [old, nested].sort());
  const registered = new Map<string, Parameters<ProjectIpcDeps["ipcMain"]["handle"]>[1]>();
  registerSiteIpcHandlers({ ...deps, ipcMain: { handle: (channel, handler) => { registered.set(channel, handler); } } } as ProjectIpcDeps);
  await registered.get(SITE_IPC_CHANNELS.addFolder)!({});
  assert.deepEqual(siteFolders.read({}).extraRoots, [picked]);
  picked = path.join(home, "Tovu");
  await assert.rejects(Promise.resolve(registered.get(SITE_IPC_CHANNELS.addFolder)!({})), /too broad/);
  assert.deepEqual(siteFolders.read({}).extraRoots, [path.join(home, "Documents", "Websites")]);
});

test("stalecard: list heals a themes-only duplicate using its valid tracked twin outside scan roots", () => {
  const deps = baseDeps();
  const root = tempDir(), stale = path.join(root, "repo", "sites", "tovu-dev");
  fs.mkdirSync(path.join(stale, "themes"), { recursive: true });
  const moved = writeSite(path.join(root, "Documents", "Tovu", "tovu-dev"), "site-id");
  writeTrackedSites(deps.projectsPath, [
    { siteDir: stale, createdAt: "2026-01-01", relocationId: "site-id", displayName: "tovu-dev" },
    { siteDir: moved, createdAt: "2026-01-01" },
  ]);
  assert.deepEqual(handleList(deps).map((row) => [row.id, row.folderMissing]), [[moved, false]]);
  assert.deepEqual(handleList(deps).map((row) => row.id), [moved]);
  assert.deepEqual(fs.readdirSync(stale), ["themes"]);
});

test("stalecard: same-name different-id cards survive list and retain their distinct paths", () => {
  const deps = baseDeps();
  const root = tempDir(), stale = path.join(root, "repo", "sites", "tovu-dev");
  const valid = writeSite(path.join(root, "Documents", "Tovu", "tovu-dev"), "other-id");
  writeTrackedSites(deps.projectsPath, [
    { siteDir: stale, createdAt: "2026-01-01", relocationId: "old-id", displayName: "tovu-dev" },
    { siteDir: valid, createdAt: "2026-01-01" },
  ]);
  assert.deepEqual(handleList(deps).map((row) => [row.installDir, row.displayName, row.folderMissing]), [
    [stale, "tovu-dev", true], [valid, "tovu-dev", false],
  ]);
});

test("card lifecycle combines local liveness with absent, starting and running shared leases", () => {
  const lease = { pid: 10, token: "shared", started: "2026-10-17T00:00:00.000Z", app: "Web", scheme: "http" as const, port: 3456 };
  const local = { server: {} }, starting = { ...lease, port: 0 };
  for (const [openEntry, sharedRunning, sharedPort, status, desiredState] of [
    [undefined, undefined, 0, "stopped", "stopped"],
    [undefined, null, 0, "stopped", "stopped"],
    [undefined, starting, 0, "starting", "running"],
    [undefined, lease, 3456, "running", "running"],
    [local, undefined, 0, "running", "running"],
    [local, null, 0, "running", "running"],
    [local, starting, 0, "starting", "running"],
    [local, lease, 3456, "running", "running"],
  ] as const) {
    const actual = siteRecordLifecycle({ siteDir: "/site", openEntry, sharedRunning, transitions: undefined });
    assert.deepEqual(actual, { sharedPort, lifecycle: { status, desiredState } });
  }
});

test("explicit card transitions override shared startup and current local liveness for the same site", async () => {
  const transitions = createSiteTransitions();
  const input = { siteDir: "/alpha", openEntry: { server: { port: 3456 } }, transitions,
    sharedRunning: { pid: 10, token: "shared", started: "2026-10-17T00:00:00.000Z", app: "Web", scheme: "http" as const, port: 0 } };
  await transitions.during("/alpha", "stopping", async () => {
    assert.deepEqual(siteRecordLifecycle(input), { sharedPort: 0, lifecycle: { status: "stopping", desiredState: "stopped" } });
    assert.equal(siteRecordLifecycle({ ...input, siteDir: "/beta" }).lifecycle.status, "starting");
  });
  await transitions.during("/alpha", "starting", async () => {
    assert.deepEqual(siteRecordLifecycle({ ...input, sharedRunning: null }), { sharedPort: 0, lifecycle: { status: "starting", desiredState: "running" } });
  });
});

test("shared discovery imports new paths while preserving local creation authority and migration state", (t) => {
  const root = fs.realpathSync(tempDir());
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const local = writeSite(path.join(root, "local"), "local-id");
  const discovered = writeSite(path.join(root, "discovered"), "discovered-id");
  const projectsPath = sitesFilePath(root);
  const sharedSites = createSitesWorkspace({}, { homeDir: root, cwd: root, env: {}, sourceRoots: [], platform: "linux" });
  sharedSites.registry({}).merge({ entries: [{ id: "discovered-id", name: "Discovered", path: discovered, createdBy: "Web", lastOpened: null }] });
  importSharedSiteDiscovery({ projectsPath, sharedSites });
  trackSite(projectsPath, local, SITE_ORIGIN.created, { siteId: "local-id" });
  importSharedSiteDiscovery({ projectsPath, sharedSites });
  importSharedSiteDiscovery({ projectsPath, sharedSites });
  const rows = readTrackedSites(projectsPath);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.siteDir === local)?.origin, SITE_ORIGIN.created);
  assert.equal(rows.find((row) => row.siteDir === local)?.siteId, "local-id");
  assert.equal(rows.find((row) => row.siteDir === discovered)?.origin, SITE_ORIGIN.adopted);
  assert.equal(sharedSites.registry({}).hasMigration({ migration: `projects:${projectsPath}` }), true);
  assert.deepEqual(new Set(sharedSites.registry({}).list({}).map((row) => row.path)), new Set([local, discovered]));
});

test("shared discovery with no workspace is inert and unavailable discovery preserves local records", (t) => {
  const root = tempDir();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectsPath = sitesFilePath(root);
  importSharedSiteDiscovery({ projectsPath, sharedSites: undefined });
  assert.equal(fs.existsSync(projectsPath), false);
  trackSite(projectsPath, path.join(root, "local"));
  const before = fs.readFileSync(projectsPath, "utf8");
  const sharedSites = { registry: () => { throw new Error("Catalog unavailable"); } } as unknown as NonNullable<ProjectIpcDeps["sharedSites"]>;
  const warn = t.mock.method(console, "warn", () => {});
  importSharedSiteDiscovery({ projectsPath, sharedSites });
  assert.deepEqual(warn.mock.calls.map((call) => call.arguments[0]), [
    "tovu desktop: shared catalog bookkeeping is unavailable; local websites remain usable.",
    "tovu desktop: shared discovery is unavailable; showing local website cards.",
  ]);
  assert.equal(fs.readFileSync(projectsPath, "utf8"), before);
});


// --- start-failure translation, shared catalog sharing, erase reasons (coverage, 2026-10-21) -------

test("handleStart with no injected classifier uses the real one and starts a real site folder", async () => {
  const siteDir = siteFixture("default-classifier");
  let started = 0;
  const deps = baseDeps({ classifySiteDir: undefined, openSiteServer: async () => { started += 1; } });
  trackSite(deps.projectsPath, siteDir);
  await handleStart(siteDir, deps as ProjectIpcDeps);
  assert.equal(started, 1);
});

test("a SITE_DIR_INVALID start failure becomes 'folder not found' only when the folder vanished; other failures pass through", async () => {
  const siteDir = siteFixture("vanishing");
  const invalid = new Error("SITE_DIR_INVALID: config.json is missing at the site");
  const deps = baseDeps({ openSiteServer: async () => { throw invalid; } });
  trackSite(deps.projectsPath, siteDir);
  await assert.rejects(handleStart(siteDir, deps as ProjectIpcDeps), (error) => error === invalid, "the folder is still there: serve's own reason stands");

  deps.openSiteServer = async () => { fs.rmSync(siteDir, { recursive: true, force: true }); throw invalid; };
  // The classifier ran before the spawn, so the folder disappearing mid-start is what serve reports.
  await assert.rejects(handleStart(siteDir, deps as ProjectIpcDeps), {
    message: `Site folder not found: ${siteDir}. It was moved, renamed or deleted — remove this site from the list, then use Add Site on its new location.`,
  });

  const other = siteFixture("other-failure");
  trackSite(deps.projectsPath, other);
  deps.openSiteServer = async () => { throw "port in use"; };
  await assert.rejects(handleStart(other, deps as ProjectIpcDeps), (error) => error === "port in use");
});

test("service discovery with no injected lister uses the real CLI, and any failure is an empty list with a warning", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  assert.deepEqual(await handleTokenSignInPlugins({ repoRoot: tempDir(), cliMode: "compiled" }), []);
  assert.equal(warn.mock.callCount(), 1);
  assert.deepEqual(await handleTokenSignInPlugins({ repoRoot: "/repo", cliMode: "source", listTokenSignInPlugins: async () => { throw "cli vanished"; } }), []);
  assert.equal(warn.mock.calls[1]!.arguments[0], "[desktop] could not list the services a new site can connect: cli vanished");
});

test("Locate and Add Site share the folder into the shared catalog when shared settings are on", async () => {
  const root = fs.realpathSync(tempDir());
  const workspace = createSitesWorkspace({}, { homeDir: root, env: {}, platform: "linux", cwd: root, sourceRoots: [] });
  const moved = writeSite(path.join(root, "moved-here"), "moved-id");
  const located = locateDeps(moved);
  located.sharedSites = workspace;
  trackSite(located.projectsPath, path.join(root, "gone"));
  await handleLocate(path.join(root, "gone"), located as ProjectIpcDeps);
  assert.ok(workspace.registry({}).list({}).some((row) => row.path === moved), "the located folder is in the shared catalog");

  const added = writeSite(path.join(root, "added-here"), "added-id");
  const { deps } = addSiteDeps(added, { sharedSites: workspace });
  await handleAddSite(deps as ProjectIpcDeps);
  assert.ok(workspace.registry({}).list({}).some((row) => row.path === added), "the added folder is in the shared catalog");
});

test("an erase that fails for a reason other than permissions says the folder could not be removed", async () => {
  const siteDir = writeSite(path.join(tempDir(), "busy-site"), "busy-site");
  const deps = baseDeps({ removeSiteTree: async () => { throw Object.assign(new Error("resource busy"), { code: "EBUSY" }); } });
  trackSite(deps.projectsPath, siteDir, SITE_ORIGIN.created, { siteId: "busy-site" });
  await assert.rejects(handleDelete(siteDir, deps as ProjectIpcDeps), {
    message: "Could not delete this website. The folder could not be removed. Its card has been kept so you can try again.",
  });
  assert.equal(readTrackedSites(deps.projectsPath).length, 1);
});

test("D-10: Rename also refuses the remembered name of a tracked site whose folder is missing", () => {
  const root = tempDir();
  const own = writeSite(path.join(root, 'own'), 'own');
  const missing = path.join(root, 'unplugged-drive-site');
  let writes = 0;
  const deps = renameDeps({
    readSiteName: (dir: string) => (dir === own ? 'Own' : assert.fail(`a missing folder's name is never read from disk: ${dir}`)),
    writeSiteName: (_dir: string, name: string) => { writes += 1; return name.trim(); },
  });
  trackSite(deps.projectsPath, own, SITE_ORIGIN.adopted);
  trackSite(deps.projectsPath, missing, SITE_ORIGIN.adopted);
  writeTrackedSites(deps.projectsPath, readTrackedSites(deps.projectsPath).map((row) => row.siteDir === missing ? { ...row, displayName: 'Bakery' } : row));
  assert.throws(() => handleRename({ id: own, name: 'bakery' }, deps), {
    message: 'A website named "bakery" is already tracked. Choose a different name.',
  });
  assert.equal(writes, 0);
});

test("erasing a created site drops it from the shared catalog, and a catalog failure only warns", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  for (const catalogFails of [false, true]) {
    const root = fs.realpathSync(tempDir());
    const real = createSitesWorkspace({}, { homeDir: root, env: {}, platform: "linux", cwd: root, sourceRoots: [] });
    const siteDir = writeSite(path.join(root, "made"), `made-${catalogFails}`);
    real.registry({}).merge({ entries: [{ id: `made-${catalogFails}`, name: "Made", path: siteDir, createdBy: "Desktop", lastOpened: null }] });
    const sharedSites = catalogFails
      ? { ...real, registry: (required: Record<string, never>) => ({ ...real.registry(required), remove: () => { throw new Error("catalog locked"); } }) }
      : real;
    const deps = baseDeps({ sharedSites, removeSiteTree: async ({ root: dir }: { root: string }) => { fs.rmSync(dir, { recursive: true }); } });
    trackSite(deps.projectsPath, siteDir, SITE_ORIGIN.created, { siteId: `made-${catalogFails}` });
    await handleDelete(siteDir, deps as ProjectIpcDeps);
    assert.equal(fs.existsSync(siteDir), false);
    assert.deepEqual(readTrackedSites(deps.projectsPath), []);
    assert.equal(real.registry({}).list({}).some((row) => row.path === siteDir), catalogFails, "kept only when the catalog refused");
  }
  assert.deepEqual(warn.mock.calls.map((entry) => entry.arguments[0]), ["tovu desktop: could not remove the erased website from the shared catalog."]);
});
