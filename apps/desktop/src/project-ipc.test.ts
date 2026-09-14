/**
 * @file Coverage for `project-ipc.js` — the seven real `runner:sites:*` handlers the Projects
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

import { SITE_IPC_CHANNELS, buildSiteRecord, handleList, handleAddSite, handleCreate, handleDelete, handleOpenExternal, handleStart, handleRename, handleGetPreview, rescanSites, registerSiteIpcHandlers } from "./project-ipc.ts";
import type { ProjectIpcDeps } from "./project-ipc.ts";
import { SITE_ORIGIN, sitesFilePath, trackSite, readTrackedSites, writeTrackedSites } from "./tracked-sites.ts";
import { classifySiteDir, classifySiteDirSafely } from "./site-dir-store.ts";
import { writeSiteName } from "./site-config.ts";
import { addSitePointer } from "./add-site-pointer.ts";
import { createKeyedSerializer } from "./keyed-serializer.ts";
import { createSiteSupervisor } from "./site-supervisor.ts";
import type { SupervisedServer } from "./site-supervisor.ts";
import { readRegistry, writeRegistry, isLiveServeRow } from "./site-process-registry.ts";
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
 * identity `project-delete-guard.js` proves before any `created` row's directory may be erased.
 */
function writeSite(dir: string, siteId: string, contents: Record<string, string> = {}): string {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: path.basename(dir) }));
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId, schemaVersion: 58 }));
  for (const [name, body] of Object.entries(contents)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
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
    registryPath: path.join(dir, "site-registry.json"),
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
    classifySiteDir: () => "empty",
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
  const source = fs.readFileSync(path.join(__dirname, "contracts", "project.ts"), "utf8");
  for (const [key, channel] of Object.entries(SITE_IPC_CHANNELS)) {
    assert.ok(source.includes(`'${channel}'`), `contracts/project.ts is missing the '${channel}' literal for ${key}`);
  }
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
});

test("handleAddSite's dialog does NOT offer to create a folder", async () => {
  const { deps, shown } = addSiteDeps(siteFixture());

  await handleAddSite(deps);

  // `handleCreate` passes `createDirectory` on purpose; this must not. A folder the operator makes
  // in the dialog is empty by definition, and an empty folder is exactly what this verb refuses —
  // offering the button would invite the one mistake the refusal then has to explain.
  assert.deepEqual(shown[0]!.properties, ["openDirectory"]); // this test's own call above pushed exactly one entry
  assert.equal(shown[0]!.properties.includes("createDirectory"), false); // this test's own call above pushed exactly one entry
});

test("handleAddSite rejects a cancelled dialog without writing anything", async () => {
  const { deps } = addSiteDeps(null);

  await assert.rejects(() => handleAddSite(deps), /No folder was chosen/);

  assert.deepEqual(readTrackedSites(deps.projectsPath), []);
});

test("handleAddSite keeps an already-tracked project's original createdAt", async () => {
  const siteDir = siteFixture();
  const { deps } = addSiteDeps(siteDir);
  const first = await handleAddSite(deps);

  const second = await handleAddSite(deps);

  // Read back from the registry rather than synthesized: a fabricated record would stamp today's
  // date and silently reorder the operator's Projects grid on a re-add.
  assert.equal(second.createdAt, first.createdAt);
  assert.equal(readTrackedSites(deps.projectsPath).length, 1);
});

test("handleCreate refuses a hosted-database choice instead of quietly making a SQLite site", async () => {
  // D-02. The renderer's CreateSiteInput carries a `database` choice, ported from Tovu-Runner's
  // provisioner-backed form; this shell has no provisioner and `buildSiteRecord` hard-codes
  // `{kind: "sqlite"}`. The operator picked Supabase, was FORCED to type a URL and key to get past
  // `canCreate`, and got a local SQLite site reported back as success. Refusing at the boundary is
  // what stops main silently narrowing a contract it does not honour — and it refuses BEFORE the
  // folder dialog, so nobody picks a folder for a site that was never going to be made.
  let pickerOpened = false;
  const deps = baseDeps({ dialog: { showOpenDialog: async () => { pickerOpened = true; return { canceled: true, filePaths: [] }; } } });

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
    const deps = baseDeps({
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [siteDir] }) },
      classifySiteDir: () => "empty",
      adoptSiteDir: async () => siteDir,
    });
    const record = await handleCreate({ displayName: "New Site", database }, deps);
    assert.equal(record.database.kind, "sqlite");
  }
});

test("handleCreate throws when the folder picker is cancelled", async () => {
  const deps = baseDeps({ dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) } });
  await assert.rejects(() => handleCreate({ displayName: "New Site" }, deps as typeof deps & Pick<ProjectIpcDeps, "adoptSiteDir">), /No folder was chosen/); // never reached — refused before adoptSiteDir
});

test("handleCreate adopts the picked folder, tracks it, and returns its record", async () => {
  const picked = "/sites/new-one";
  let adoptCalledWith: Parameters<ProjectIpcDeps["adoptSiteDir"]>[0] | null = null;
  const deps = baseDeps({
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [picked] }) },
    adoptSiteDir: async (input) => {
      adoptCalledWith = input;
      return picked;
    },
  });

  const record = await handleCreate({ displayName: "New Site" }, deps);

  assert.equal(adoptCalledWith!.dir, picked); // handleCreate above always calls adoptSiteDir before returning
  assert.equal(adoptCalledWith!.name, "New Site"); // handleCreate above always calls adoptSiteDir before returning
  assert.equal(record.id, picked);
  assert.deepEqual(readTrackedSites(deps.projectsPath).map((r) => r.siteDir), [picked]);
});

test("handleDelete on an untracked id is a no-op — no stop, no fs.rm, no throw", async () => {
  const deps = baseDeps();
  await assert.doesNotReject(() => handleDelete("/sites/never-tracked", deps));
});

test("handleDelete on a running project the app CREATED stops the server before removing the directory", async () => {
  const siteDir = writeSite(path.join(tempDir(), "site-to-delete"), "site-a");

  const order: string[] = [];
  const deps = baseDeps();
  // `created`, outside `deps.repoRoot`, and still holding the site whose id the row recorded — the
  // only combination the guard lets through, which is what makes this the proof that the guard did
  // not simply disable delete for everything.
  trackSite(deps.projectsPath, siteDir, SITE_ORIGIN.created, { siteId: "site-a" });
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

test("registerSiteIpcHandlers registers exactly the real channels declared in SITE_IPC_CHANNELS", () => {
  const registered = new Map();
  const deps = baseDeps({ ipcMain: { handle: (channel, listener) => registered.set(channel, listener) } });

  registerSiteIpcHandlers(deps as ProjectIpcDeps); // none of the nine registered handlers is ever invoked here — this only inspects what got registered

  assert.deepEqual([...registered.keys()].sort(), Object.values(SITE_IPC_CHANNELS).sort());
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
  // DEFAULT_READY_TIMEOUT_MS (60s) booting before `openSiteServer` publishes it into `openSites`,
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
  const deps = baseDeps();

  const record = await handleCreateInto(deps as Parameters<typeof handleCreate>[1], siteDir, "site-a"); // handleCreateInto assigns dialog/classifySiteDir/adoptSiteDir itself before use

  assert.equal(readTrackedSites(deps.projectsPath)[0]!.siteId, "site-a");
  assert.equal(record.deleteErasesFiles, true, "the site it just made is still the site at that path");
});

test("handleCreate records no identity for a folder it merely adopted", async () => {
  // An `adopted` row can never erase anything, so an identity stamp on it would be a fact nothing
  // reads — and one a future rule might mistake for permission.
  const siteDir = path.join(tempDir(), "already-a-site");
  writeSite(siteDir, "site-a");
  const deps = baseDeps({
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [siteDir] }) },
    classifySiteDir: () => "site",
    adoptSiteDir: async () => siteDir,
  });

  await handleCreate({ displayName: "Adopted" }, deps);

  const [row] = readTrackedSites(deps.projectsPath);
  assert.equal(row!.origin, SITE_ORIGIN.adopted); // handleCreate above just tracked exactly one row
  assert.equal(row!.siteId, undefined); // handleCreate above just tracked exactly one row
});

/** Drive `handleCreate` through the folder picker onto a site that already exists at `siteDir`,
 *  classified `empty` so the row records `created` — what a real `tovu init` run produces. */
function handleCreateInto(deps: Parameters<typeof handleCreate>[1], siteDir: string, _siteId: string) {
  deps.dialog = { showOpenDialog: async () => ({ canceled: false, filePaths: [siteDir] }) };
  deps.classifySiteDir = () => "empty";
  deps.adoptSiteDir = async () => siteDir;
  return handleCreate({ displayName: path.basename(siteDir) }, deps);
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
  fs.mkdirSync(siteDir, { recursive: true });
  fs.writeFileSync(path.join(siteDir, "content.db"), "leona's 44 MB production database");

  const deps = baseDeps({ repoRoot });
  writeTrackedSites(deps.projectsPath, [{ siteDir, createdAt: "2026-01-01T00:00:00.000Z", origin: "created" }]);

  await handleDelete(siteDir, deps);

  assert.equal(fs.existsSync(path.join(siteDir, "content.db")), true, "a repo-root directory must survive delete regardless of what the row claims");
});

test("handleCreate records 'created' when it initialized an empty folder, 'adopted' when the folder was already a site", async () => {
  for (const [kind, expected] of [["empty", SITE_ORIGIN.created], ["site", SITE_ORIGIN.adopted]] as const) {
    // A real site on disk either way — `adoptSiteDir` has run by the time the row is written, so
    // what the classifier said about the folder BEFOREHAND is the only thing separating these two.
    const picked = writeSite(path.join(tempDir(), `${kind}-one`), `site-${kind}`);
    const deps = baseDeps({
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [picked] }) },
      // Classified BEFORE `adoptSiteDir` runs, because afterwards both cases look identical: it
      // returns the same path whether it ran `tovu init` or recognized an existing site.
      classifySiteDir: () => kind,
      adoptSiteDir: async () => picked,
    });

    const record = await handleCreate({ displayName: "New Site" }, deps);

    assert.equal(readTrackedSites(deps.projectsPath)[0]!.origin, expected, `a "${kind}" folder must be tracked as ${expected}`);
    assert.equal(record.deleteErasesFiles, expected === SITE_ORIGIN.created);
  }
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
      siteScanRoots: [root],
      recentSiteDirs: () => [],
      ...overrides,
    }),
    scanRoot: root,
  };
}

test("rescanSites makes a site dir that exists on disk but was never registered visible", () => {
  const deps = scanDeps();
  const alpha = siteFolder(deps.scanRoot, "alpha");
  assert.deepEqual(handleList(deps), [], "precondition: nothing is tracked yet");
  const records = rescanSites(deps);
  assert.deepEqual(records.map((r) => r.id), [alpha]);
  assert.deepEqual(handleList(deps).map((r) => r.id), [alpha], "and it survives into the next list");
});

test("rescanSites records a discovery as adopted, so deleting its card can never erase it", () => {
  const deps = scanDeps();
  siteFolder(deps.scanRoot, "alpha");
  const [record] = rescanSites(deps);
  assert.equal(record!.deleteErasesFiles, false); // this test's own siteFolder call above seeds exactly one discoverable site
  assert.equal(readTrackedSites(deps.projectsPath)[0]!.origin, SITE_ORIGIN.adopted);
});

test("rescanSites never resurrects a project the operator removed on purpose", async () => {
  const deps = scanDeps();
  const alpha = siteFolder(deps.scanRoot, "alpha");
  rescanSites(deps);
  await handleDelete(alpha, deps);
  assert.deepEqual(handleList(deps), [], "precondition: the removal took");
  // Repeatedly, because a rescan is an operator-triggered button, not a one-shot boot step.
  assert.deepEqual(rescanSites(deps), []);
  assert.deepEqual(rescanSites(deps), []);
  assert.deepEqual(handleList(deps), []);
  assert.equal(fs.existsSync(path.join(alpha, "config.json")), true, "and the folder itself is untouched");
});

test("rescanSites picks up a recently-opened site that lives outside every scan root", () => {
  const outside = siteFolder(tempDir(), "elsewhere");
  const deps = scanDeps({ recentSiteDirs: () => [outside] });
  assert.deepEqual(rescanSites(deps).map((r) => r.id), [outside]);
});

test("rescanSites leaves an already-tracked project's row exactly as it was", () => {
  const deps = scanDeps();
  const alpha = siteFolder(deps.scanRoot, "alpha");
  trackSite(deps.projectsPath, alpha, SITE_ORIGIN.adopted);
  const before = readTrackedSites(deps.projectsPath);
  rescanSites(deps);
  assert.deepEqual(readTrackedSites(deps.projectsPath), before);
});

test("rescanSites ignores a folder under the scan root that is not a site", () => {
  const deps = scanDeps();
  fs.mkdirSync(path.join(deps.scanRoot, "not-a-site"), { recursive: true });
  fs.writeFileSync(path.join(deps.scanRoot, "loose.txt"), "hi");
  assert.deepEqual(rescanSites(deps), []);
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
  const records = await registered.get(SITE_IPC_CHANNELS.rescan)({}) as ReturnType<typeof rescanSites>;
  assert.deepEqual(records.map((r) => r.id), [alpha]);
});

// D-08. `handleDelete`'s stop-then-erase sequence was safe against THIS process (the serializer) and
// against nothing else. `main.ts` calls no `requestSingleInstanceLock`, and `site-process-registry.js` is
// written throughout on the premise that two instances can run at once — its `recordSiteOpened`
// deliberately RETAINS a sibling's row for the same site. Instance A deleting a site instance B has
// open recursively erased the directory out from under B's live `tovu serve`.

/** Registry state as a second app instance would have left it: a row for `siteDir` under a pid this
 *  process is not holding. */
function seedForeignRegistryRow(deps: Pick<ProjectIpcDeps, "registryPath">, siteDir: string, pid = 999_001): void {
  writeRegistry(deps.registryPath, {
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
  const deps = baseDeps({ isLiveServeRow: () => true });
  deps.openSites.set(siteDir, { server: { pid: 4242, stop: async () => { stopped = true; } } });
  trackSite(deps.projectsPath, siteDir, SITE_ORIGIN.created, { siteId: "site-shared-open" });
  seedForeignRegistryRow(deps, siteDir);

  await assert.rejects(() => handleDelete(siteDir, deps), /still has this site open/);
  assert.equal(stopped, false, "a refused delete must leave this instance's own site running too");
  assert.equal(deps.openSites.has(siteDir), true);
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
  // The registry's own identity proof is what decides. A pid that is dead, or that the OS recycled
  // to something unrelated, must never be able to make a delete impossible.
  const siteDir = writeSite(path.join(tempDir(), "site-stale"), "site-stale", {});
  const deps = baseDeps({ isLiveServeRow: () => false });
  trackSite(deps.projectsPath, siteDir, SITE_ORIGIN.created, { siteId: "site-stale" });
  seedForeignRegistryRow(deps, siteDir);

  await assert.doesNotReject(() => handleDelete(siteDir, deps));
  assert.equal(fs.existsSync(siteDir), false);
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
  const deps = renameDeps();
  const dir = writeSite(path.join(path.dirname(deps.projectsPath), "adopted-site"), "id-a");
  trackSite(deps.projectsPath, dir, SITE_ORIGIN.adopted);
  assert.equal(readTrackedSites(deps.projectsPath)[0]!.siteId, undefined, "precondition: adopted rows carry no siteId");

  const record = handleRename({ id: dir, name: "Renamed Site" }, deps);

  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8")).name, "Renamed Site");
  assert.equal(record.id, dir);
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
  // `project-delete-guard.js`'s documented trap: the operator moves their site and something else
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
