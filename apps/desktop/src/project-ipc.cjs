/**
 * @file Real handlers for the five `runner:projects:*` IPC verbs the Projects screen needs — see
 * `contracts/project.ts`'s `RUNNER_PROJECT_CHANNELS` for what each one is for. Registered in
 * `main.cjs` BEFORE `registerRunnerIpcStubs` runs, so these channels are never also stubbed —
 * Electron's `ipcMain.handle` throws on a duplicate registration, which is the desired failure if
 * that ever regresses (see `runner-ipc-stubs.cjs`'s own doc).
 *
 * `start`/`stop` are deliberately absent — under the N-`BrowserWindow` model a site cannot run
 * without a window (`openSites` is keyed by an entry that only exists alongside one), so opening a
 * project already covers starting it, and closing its window already covers stopping it. They stay
 * registered as throwing stubs.
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

const { readTrackedProjects, trackProject, untrackProject } = require("./project-registry.cjs");

const RUNNER_PROJECT_CHANNELS = Object.freeze({
  list: "runner:projects:list",
  create: "runner:projects:create",
  delete: "runner:projects:delete",
  openExternal: "runner:projects:open-external",
  openWindow: "runner:projects:open-window",
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
    templateId: "tovu",
    templateVersion: null,
    database: { kind: "sqlite" },
    desiredState: running ? "running" : "stopped",
    status: running ? "running" : "stopped",
    statusDetail: null,
    createdAt: row.createdAt,
    updatedAt: row.createdAt,
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
  const siteDir = await deps.adoptSiteDir({
    dir: picked.filePaths[0],
    repoRoot: deps.repoRoot,
    statePath: deps.statePath,
    name: input.displayName,
    cliMode: deps.cliMode,
  });
  trackProject(deps.projectsPath, siteDir);
  return buildProjectRecord({ siteDir, createdAt: new Date().toISOString() }, deps);
}

/**
 * Irreversible: stops the project if it is running, untracks it, then erases its install
 * directory. Idempotent on an id that is not tracked (already gone) rather than throwing — the
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
  const tracked = readTrackedProjects(deps.projectsPath);
  if (!tracked.some((row) => row.siteDir === id)) return;

  const openEntry = deps.openSites.get(id);
  if (openEntry !== undefined) {
    await openEntry.server.stop();
    deps.openSites.delete(id);
    deps.recordSiteClosed(deps.registryPath, id);
    if (!openEntry.window.isDestroyed()) openEntry.window.destroy();
  }

  untrackProject(deps.projectsPath, id);
  await fsp.rm(id, { recursive: true, force: true });
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
 * A project card's click target: open the site in its own window, spawning its `tovu serve` if it
 * is not already running, or simply focus the window if it is. Reuses `openSiteWindow` — the same
 * verified path "Open Site…"/"Open Recent"/startup already use — through `serializer.run`, so a
 * fast double-click on the same card cannot double-spawn its server (see `main.cjs`'s own doc on
 * `openSiteWindow`/`keyed-serializer.cjs`).
 *
 * @throws {Error} when `id` names a project this shell is not tracking — a stale id from a renderer
 *   that has not yet re-polled past a delete, refused rather than opening an arbitrary path.
 * @complexity O(1) beyond `openSiteWindow`'s own cost.
 */
async function handleOpenWindow(id, deps) {
  const tracked = readTrackedProjects(deps.projectsPath);
  if (!tracked.some((row) => row.siteDir === id)) {
    throw new Error(`Unknown project: ${id}`);
  }
  await deps.serializer.run(id, () => deps.openSiteWindow(id, deps.ctx));
}

/**
 * Registers the five real `runner:projects:*` handlers above.
 *
 * @param {object} deps
 * @param {{handle: Function}} deps.ipcMain
 * @param {{showOpenDialog: Function}} deps.dialog
 * @param {{openExternal: Function}} deps.shell
 * @param {Map<string, {server: object, window: object}>} deps.openSites live open sites, keyed by
 *   site dir — `main.cjs`'s own module-level map, passed in rather than imported.
 * @param {{run: Function}} deps.serializer per-site-dir operation serializer (`keyed-serializer.cjs`).
 * @param {string} deps.projectsPath `project-registry.cjs`'s tracked-project JSON file.
 * @param {string} deps.registryPath crash-safety registry file (`site-registry.cjs`), for
 *   `recordSiteClosed` on a delete of a running project.
 * @param {string} deps.repoRoot Tovu repo root.
 * @param {string} deps.statePath `site-dir-store.cjs`'s MRU file, for `adoptSiteDir`.
 * @param {string} deps.cliMode `"source"` or `"compiled"` — see `tovu-server.cjs`.
 * @param {Function} deps.readSiteName `main.cjs`'s site-display-name reader.
 * @param {Function} deps.adoptSiteDir `site-dir-store.cjs`'s folder-to-site-dir classifier/initializer.
 * @param {Function} deps.openSiteWindow `main.cjs`'s spawn-or-focus-a-site's-window function.
 * @param {Function} deps.recordSiteClosed `site-registry.cjs`'s crash-safety row remover.
 * @param {object} deps.ctx `{cliMode, registryPath}` — `openSiteWindow`'s own second argument.
 * @complexity O(1) — five registrations.
 */
function registerProjectIpcHandlers(deps) {
  deps.ipcMain.handle(RUNNER_PROJECT_CHANNELS.list, () => handleList(deps));
  deps.ipcMain.handle(RUNNER_PROJECT_CHANNELS.create, (_event, input) => handleCreate(input, deps));
  deps.ipcMain.handle(RUNNER_PROJECT_CHANNELS.delete, (_event, id) => handleDelete(id, deps));
  deps.ipcMain.handle(RUNNER_PROJECT_CHANNELS.openExternal, (_event, input) => handleOpenExternal(input, deps));
  deps.ipcMain.handle(RUNNER_PROJECT_CHANNELS.openWindow, (_event, id) => handleOpenWindow(id, deps));
}

module.exports = {
  RUNNER_PROJECT_CHANNELS,
  buildProjectRecord,
  handleList,
  handleCreate,
  handleDelete,
  handleOpenExternal,
  handleOpenWindow,
  registerProjectIpcHandlers,
};
