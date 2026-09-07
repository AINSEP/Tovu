/**
 * @file Real handlers for the five `runner:projects:*` IPC verbs the Projects screen needs — see
 * `contracts/project.ts`'s `RUNNER_PROJECT_CHANNELS` for what each one is for. Registered in
 * `main.cjs` BEFORE `registerRunnerIpcStubs` runs, so these channels are never also stubbed —
 * Electron's `ipcMain.handle` throws on a duplicate registration, which is the desired failure if
 * that ever regresses (see `runner-ipc-stubs.cjs`'s own doc).
 *
 * `stop` is deliberately absent — no control in the per-project bar calls it yet; closing the app
 * (`before-quit`, `main.cjs`) or deleting the project (`handleDelete` below) are the two ways a
 * fleet-opened site stops today. It stays registered as a throwing stub.
 *
 * The channel literals below are INLINED rather than imported from `contracts/project.ts`, same
 * reason `runner-ipc-stubs.cjs` inlines its own: this is CommonJS main-process code and the
 * contracts are TypeScript with no compiled output guaranteed at runtime from a source checkout.
 * `project-ipc.test.cjs` parses the contract source and fails if any literal here drifts from it.
 *
 * Every dependency arrives on `deps` rather than through a `require("electron")` or a closed-over
 * module-level variable, so every handler here is callable from plain `node --test` against fakes —
 * no real Electron, no real `tovu serve` child, no real filesystem beyond what a test points it at.
 */
const path = require("node:path");
const fsp = require("node:fs/promises");

const {
  PROJECT_ORIGIN,
  readTrackedProjects,
  trackProject,
  untrackProject,
  discoverSiteDirs,
  adoptDiscoveredProjects,
} = require("./project-registry.cjs");
const { mayEraseProjectDirectory, readSiteIdentity } = require("./project-delete-guard.cjs");
const { sitePartition } = require("./desktop-auth.cjs");

const RUNNER_PROJECT_CHANNELS = Object.freeze({
  list: "runner:projects:list",
  create: "runner:projects:create",
  delete: "runner:projects:delete",
  openExternal: "runner:projects:open-external",
  start: "runner:projects:start",
  rescan: "runner:projects:rescan",
});

/**
 * One tracked row plus `openSites` (ground truth for "running") joined into the `ProjectRecord`
 * shape `contracts/project.ts` declares. Every field this shell cannot really know — `templateId`,
 * `templateVersion`, `database` — gets a stated, honest default rather than a fabricated value:
 * every project a JSON-file-tracked site can describe today was created outside a provisioner this
 * shell drives, so there is no template or vendor-database fact to report.
 *
 * @complexity O(1).
 */
function buildProjectRecord(row, deps) {
  const openEntry = deps.openSites.get(row.siteDir);
  const running = openEntry !== undefined;
  return {
    id: row.siteDir,
    slug: path.basename(row.siteDir),
    displayName: deps.readSiteName(row.siteDir),
    installDir: row.siteDir,
    port: running ? openEntry.server.port : 0,
    // Independent of `running` — a project's partition is a pure function of its own directory
    // (`desktop-auth.cjs`'s `sitePartition`), not of whether a server currently answers on it. The
    // embedded-tab renderer needs it either way: `ProjectWorkspace`'s `<webview>` sets it up front,
    // before the tab knows whether the site is up yet.
    partition: sitePartition(row.siteDir),
    templateId: "tovu",
    templateVersion: null,
    database: { kind: "sqlite" },
    desiredState: running ? "running" : "stopped",
    status: running ? "running" : "stopped",
    statusDetail: null,
    createdAt: row.createdAt,
    updatedAt: row.createdAt,
    // Computed by the SAME function `handleDelete` obeys, never re-derived from `origin` in the
    // renderer — a UI that decided this for itself could drift from the rule main actually enforces
    // and label a button with a consequence that will not happen. See `project-delete-guard.cjs`.
    deleteErasesFiles: mayEraseProjectDirectory(row, { repoRoot: deps.repoRoot }),
  };
}

/** @complexity O(n) in the tracked-project count. */
function handleList(deps) {
  return readTrackedProjects(deps.projectsPath).map((row) => buildProjectRecord(row, deps));
}

/**
 * "+ Create website" has no folder in its input — `CreateProjectInput` is a display name plus a
 * database choice, ported from Tovu-Runner's own provisioner-backed form. This shell has no such
 * provisioner, so creating a project here means the operator picks WHERE it lives, the same way
 * "Open Site…" already does; `input.displayName` becomes `tovu init`'s `--name`.
 *
 * @throws {Error} when the folder picker is cancelled, or the chosen folder is occupied/incomplete
 *   (`adoptSiteDir`'s own errors — an operator-facing message either way).
 * @complexity O(1) beyond `adoptSiteDir`'s own cost.
 */
async function handleCreate(input, deps) {
  const picked = await deps.dialog.showOpenDialog({
    title: "Choose a folder for your new site",
    message: `Pick an empty folder for "${input.displayName}".`,
    buttonLabel: "Create here",
    properties: ["openDirectory", "createDirectory"],
  });
  if (picked.canceled || picked.filePaths.length === 0) {
    throw new Error("No folder was chosen.");
  }
  // BEFORE `adoptSiteDir`, because afterwards the answer is gone: it returns the same path whether
  // it ran `tovu init` into an empty folder or simply recognized a site that was already there. Only
  // the first of those is a directory this app made, and only that one may ever be erased again —
  // see `project-delete-guard.cjs`. `adoptSiteDir` refuses "occupied"/"incomplete" outright, so the
  // only two classifications that reach `trackProject` are the two this maps.
  const wasEmpty = deps.classifySiteDir(picked.filePaths[0]) === "empty";
  const siteDir = await deps.adoptSiteDir({
    dir: picked.filePaths[0],
    repoRoot: deps.repoRoot,
    statePath: deps.statePath,
    name: input.displayName,
    cliMode: deps.cliMode,
  });
  const origin = wasEmpty ? PROJECT_ORIGIN.created : PROJECT_ORIGIN.adopted;
  // Read AFTER `adoptSiteDir`, because before it there is no site there to have an identity: this is
  // the id `tovu init` just stamped into `.site-meta.json`. Recording it here is the only moment
  // this app can honestly say "the site at this path is one I made" — every later reader is looking
  // at a path, and a path is not an identity. See `project-delete-guard.cjs`'s test 3.
  const siteId = readSiteIdentity(siteDir);
  trackProject(deps.projectsPath, siteDir, origin, { siteId });
  return buildProjectRecord({ siteDir, createdAt: new Date().toISOString(), origin, siteId }, deps);
}

/**
 * Stops the project if it is running, untracks it, and — ONLY for a directory this app itself
 * created — erases its install directory.
 *
 * That last word is load-bearing and is the whole reason this function consults
 * `project-delete-guard.cjs` rather than calling `fs.rm` on whatever id arrives. A tracked row can
 * point at a folder the app merely adopted (`seedDevFallbackProject` seeds exactly one such row,
 * `<repo>/sites/tovu-com`, someone's real 44 MB site), and for those the delete means "take this
 * card off my Projects screen" — the row goes, every byte stays. The renderer says which of the two
 * a given card will do, from the same guard's answer carried on `ProjectRecord.deleteErasesFiles`,
 * so the confirm overlay never promises a consequence this function will not deliver.
 *
 * Idempotent on an id that is not tracked (already gone) rather than throwing — the
 * operator's confirm dialog already happened in the renderer, so a second delete of the same
 * project (a slow poll racing a fast double-click) should not surface a scary error for something
 * that already succeeded.
 *
 * The server is stopped and the in-memory `openSites`/on-disk crash-safety row are cleared BEFORE
 * the directory is removed, so `content.db` is never unlinked out from under a live handle. The
 * window's own `closed` listener (`main.cjs`) still fires afterward and repeats the same two
 * cleanup calls — both are idempotent (`stopChild` checks `exitCode`/`signalCode` first;
 * `openSites.delete` and `recordSiteClosed` are no-ops on an absent entry), so the double call is
 * harmless rather than a race.
 *
 * @complexity O(1) beyond `fs.rm`'s own cost over the site directory's contents.
 */
async function handleDelete(id, deps) {
  const row = readTrackedProjects(deps.projectsPath).find((entry) => entry.siteDir === id);
  if (row === undefined) return;

  const openEntry = deps.openSites.get(id);
  if (openEntry !== undefined) {
    await openEntry.server.stop();
    deps.openSites.delete(id);
    deps.recordSiteClosed(deps.registryPath, id);
    // A fleet-opened (embedded-tab) entry has no `window` at all — see `openSiteServer` in
    // `main.cjs` — so this is optional, not a missing null check.
    if (openEntry.window && !openEntry.window.isDestroyed()) openEntry.window.destroy();
  }

  untrackProject(deps.projectsPath, id);
  if (mayEraseProjectDirectory(row, { repoRoot: deps.repoRoot })) {
    await fsp.rm(id, { recursive: true, force: true });
  }
}

/**
 * Hands one of a running project's surfaces to the operator's default browser. Refuses a project
 * that is not currently open rather than guessing a port — nothing durable records a stopped
 * project's last-known port today (see `project-registry.cjs`'s header on why status is derived,
 * not stored), so "not running" and "never had a port to report" are the same state here.
 *
 * @throws {Error} when the project is not open.
 * @complexity O(1).
 */
async function handleOpenExternal(input, deps) {
  const openEntry = deps.openSites.get(input.projectId);
  if (openEntry === undefined) {
    throw new Error("That project is not open. Open it first, then try again.");
  }
  const url = `${openEntry.server.origin}${input.view === "site" ? "/" : "/admin/"}`;
  await deps.shell.openExternal(url);
}

/**
 * A project tab's "not running yet" answer: ensure the site's `tovu serve` is up, spawning it if it
 * is not already running, or reusing it if another tab already has it open — never a `BrowserWindow`.
 * Reuses `openSiteServer` — `main.cjs`'s spawn-only counterpart to the `openSiteWindow` "Open
 * Site…"/"Open Recent"/startup already use — through `serializer.run`, so opening the same tab twice
 * fast cannot double-spawn its server (see `main.cjs`'s own doc on `openSiteServer`/
 * `keyed-serializer.cjs`).
 *
 * Returns the project's fresh record rather than nothing: the renderer's `<webview>` needs the
 * `port` this call just produced, and re-deriving it would mean a second `list` round trip for
 * every tab open.
 *
 * @throws {Error} when `id` names a project this shell is not tracking — a stale id from a renderer
 *   that has not yet re-polled past a delete, refused rather than opening an arbitrary path.
 * @complexity O(1) beyond `openSiteServer`'s own cost.
 */
async function handleStart(id, deps) {
  const row = readTrackedProjects(deps.projectsPath).find((entry) => entry.siteDir === id);
  if (row === undefined) {
    throw new Error(`Unknown project: ${id}`);
  }
  await deps.serializer.run(id, () => deps.openSiteServer(id, deps.ctx));
  return buildProjectRecord(row, deps);
}

/**
 * Find every Tovu site on disk the operator has no stored answer about, track it, and return the
 * whole refreshed list.
 *
 * This is the fix for the Projects screen having no discovery at all: {@link handleList} renders
 * `desktop-projects.json` and nothing else — no scan, no rescan, no fallback — so a site created by
 * `tovu init` outside the shell, or restored from a backup, was invisible forever no matter how
 * plainly it sat on disk. Runs once at boot (`main.cjs`) and again whenever the operator asks.
 *
 * **A directory the operator removed on purpose is never brought back**, however many times this
 * runs. That is `adoptDiscoveredProjects`' rule, not this function's, and the reason it lives down
 * there is that the boot pass and the operator's button must not be able to disagree about it: a
 * rescan that resurrected deleted cards would be the same bug the seed guard exists to prevent,
 * and worse here, since a button can be pressed again. Their way back is the folder dialog, which
 * reaches `trackProject` directly — see that function's own comment on why only the explicit adder
 * clears a dismissal.
 *
 * @param deps.projectScanRoots directories whose immediate children are candidate sites.
 * @param deps.recentSiteDirs `site-dir-store.cjs`'s recently-opened list, as a thunk — the sites
 *   own-server mode has been recording all along, which are the operator's by definition and
 *   generally do not live under any scan root.
 * @returns the same records {@link handleList} would return, after the pass.
 * @complexity O(n) in the scanned child count, times the registry size.
 */
function rescanProjects(deps) {
  const found = discoverSiteDirs({
    scanRoots: deps.projectScanRoots,
    knownDirs: deps.recentSiteDirs(),
    classifySiteDir: deps.classifySiteDir,
  });
  adoptDiscoveredProjects(deps.projectsPath, found);
  return handleList(deps);
}

/**
 * Registers the six real `runner:projects:*` handlers above.
 *
 * @param {object} deps
 * @param {{handle: Function}} deps.ipcMain
 * @param {{showOpenDialog: Function}} deps.dialog
 * @param {{openExternal: Function}} deps.shell
 * @param {Map<string, {server: object, window?: object}>} deps.openSites live open sites, keyed by
 *   site dir — `main.cjs`'s own module-level map, passed in rather than imported. A fleet-opened
 *   (embedded-tab) entry carries no `window`; only own-server-mode entries do.
 * @param {{run: Function}} deps.serializer per-site-dir operation serializer (`keyed-serializer.cjs`).
 * @param {string} deps.projectsPath `project-registry.cjs`'s tracked-project JSON file.
 * @param {string} deps.registryPath crash-safety registry file (`site-registry.cjs`), for
 *   `recordSiteClosed` on a delete of a running project.
 * @param {string} deps.repoRoot Tovu repo root.
 * @param {string} deps.statePath `site-dir-store.cjs`'s MRU file, for `adoptSiteDir`.
 * @param {string} deps.cliMode `"source"` or `"compiled"` — see `tovu-server.cjs`.
 * @param {Function} deps.readSiteName `main.cjs`'s site-display-name reader.
 * @param {Function} deps.adoptSiteDir `site-dir-store.cjs`'s folder-to-site-dir classifier/initializer.
 * @param {Function} deps.classifySiteDir `site-dir-store.cjs`'s classifier, called by `handleCreate`
 *   BEFORE `adoptSiteDir` to record whether this app is about to create the directory or is adopting
 *   one that already exists — see `handleCreate`'s own comment and `project-delete-guard.cjs`.
 * @param {Function} deps.openSiteServer `main.cjs`'s spawn-or-reuse-a-site's-backend function
 *   (no `BrowserWindow` — see that function's own doc).
 * @param {Function} deps.recordSiteClosed `site-registry.cjs`'s crash-safety row remover.
 * @param {object} deps.ctx `{cliMode, registryPath}` — `openSiteServer`'s own second argument.
 * @complexity O(1) — six registrations.
 */
function registerProjectIpcHandlers(deps) {
  deps.ipcMain.handle(RUNNER_PROJECT_CHANNELS.list, () => handleList(deps));
  deps.ipcMain.handle(RUNNER_PROJECT_CHANNELS.create, (_event, input) => handleCreate(input, deps));
  deps.ipcMain.handle(RUNNER_PROJECT_CHANNELS.delete, (_event, id) => handleDelete(id, deps));
  deps.ipcMain.handle(RUNNER_PROJECT_CHANNELS.openExternal, (_event, input) => handleOpenExternal(input, deps));
  deps.ipcMain.handle(RUNNER_PROJECT_CHANNELS.start, (_event, id) => handleStart(id, deps));
  deps.ipcMain.handle(RUNNER_PROJECT_CHANNELS.rescan, () => rescanProjects(deps));
}

module.exports = {
  RUNNER_PROJECT_CHANNELS,
  buildProjectRecord,
  handleList,
  handleCreate,
  handleDelete,
  handleOpenExternal,
  handleStart,
  rescanProjects,
  registerProjectIpcHandlers,
};
