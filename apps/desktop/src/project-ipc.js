/**
 * @file Real handlers for the seven `runner:projects:*` IPC verbs the Projects screen needs — see
 * `contracts/project.ts`'s `RUNNER_PROJECT_CHANNELS` for what each one is for. Registered in
 * `main.js` BEFORE `registerRunnerIpcStubs` runs, so these channels are never also stubbed —
 * Electron's `ipcMain.handle` throws on a duplicate registration, which is the desired failure if
 * that ever regresses (see `runner-ipc-stubs.js`'s own doc).
 *
 * `stop` is deliberately absent — no control in the per-project bar calls it yet; closing the app
 * (`before-quit`, `main.js`) or deleting the project (`handleDelete` below) are the two ways a
 * sites-home-opened site stops today. It stays registered as a throwing stub.
 *
 * The channel literals below are INLINED rather than imported from `contracts/project.ts`, same
 * reason `runner-ipc-stubs.js` inlines its own: this is CommonJS main-process code and the
 * contracts are TypeScript with no compiled output guaranteed at runtime from a source checkout.
 * `project-ipc.test.js` parses the contract source and fails if any literal here drifts from it.
 *
 * Every dependency arrives on `deps` rather than through a `require("electron")` or a closed-over
 * module-level variable, so every handler here is callable from plain `node --test` against fakes —
 * no real Electron, no real `tovu serve` child, no real filesystem beyond what a test points it at.
 */
import path from "node:path";
import fsp from "node:fs/promises";

import { SITE_ORIGIN, readTrackedSites, trackSite, untrackSite, discoverSiteDirs, adoptDiscoveredSites } from "./tracked-sites.js";
import { mayEraseSiteDirectory, readSiteIdentity } from "./project-delete-guard.js";
import { sitePartition } from "./desktop-auth.js";

const RUNNER_PROJECT_CHANNELS = Object.freeze({
  list: "runner:projects:list",
  create: "runner:projects:create",
  delete: "runner:projects:delete",
  openExternal: "runner:projects:open-external",
  start: "runner:projects:start",
  rescan: "runner:projects:rescan",
  addSite: "runner:projects:add-site",
});

/**
 * Why this site's server is not running, when it stopped on its own — `null` when it was never
 * started, was stopped deliberately, or when `openSites` is a store that cannot say (a plain `Map`
 * in a test that is not exercising liveness).
 *
 * Operator-facing prose, not a raw exit record: this string is rendered on the card. `code` and
 * `signal` are mutually exclusive in Node's `exit` event — whichever is non-null is the reason.
 *
 * @complexity O(1).
 */
function describeLastExit(openSites, siteDir) {
  const exit = typeof openSites.lastExitOf === "function" ? openSites.lastExitOf(siteDir) : null;
  if (exit === null) return null;
  if (exit.signal !== null && exit.signal !== undefined) return `The site's server was stopped by ${exit.signal}.`;
  return `The site's server exited (code ${exit.code}).`;
}

/**
 * One tracked row plus `openSites` (ground truth for "running") joined into the `ProjectRecord`
 * shape `contracts/project.ts` declares. Every field this shell cannot really know — `templateId`,
 * `templateVersion`, `database` — gets a stated, honest default rather than a fabricated value:
 * every project a JSON-file-tracked site can describe today was created outside a provisioner this
 * shell drives, so there is no template or vendor-database fact to report.
 *
 * @complexity O(1).
 */
function buildSiteRecord(row, deps) {
  const openEntry = deps.openSites.get(row.siteDir);
  const running = openEntry !== undefined;
  return {
    id: row.siteDir,
    slug: path.basename(row.siteDir),
    displayName: deps.readSiteName(row.siteDir),
    installDir: row.siteDir,
    port: running ? openEntry.server.port : 0,
    // Independent of `running` — a project's partition is a pure function of its own directory
    // (`desktop-auth.js`'s `sitePartition`), not of whether a server currently answers on it. The
    // embedded-tab renderer needs it either way: `ProjectWorkspace`'s `<webview>` sets it up front,
    // before the tab knows whether the site is up yet.
    partition: sitePartition(row.siteDir),
    templateId: "tovu",
    templateVersion: null,
    database: { kind: "sqlite" },
    desiredState: running ? "running" : "stopped",
    status: running ? "running" : "stopped",
    // Not always `null` any more: a site that DIED is `stopped` exactly like one that was never
    // started, and before `site-supervisor.js` owned that transition the two were indistinguishable
    // to the renderer (D-06). This is the one place the difference can be told.
    statusDetail: running ? null : describeLastExit(deps.openSites, row.siteDir),
    createdAt: row.createdAt,
    updatedAt: row.createdAt,
    // Computed by the SAME function `handleDelete` obeys, never re-derived from `origin` in the
    // renderer — a UI that decided this for itself could drift from the rule main actually enforces
    // and label a button with a consequence that will not happen. See `project-delete-guard.js`.
    deleteErasesFiles: mayEraseSiteDirectory(row, { repoRoot: deps.repoRoot }),
  };
}

/** @complexity O(n) in the tracked-project count. */
function handleList(deps) {
  return readTrackedSites(deps.projectsPath).map((row) => buildSiteRecord(row, deps));
}

/**
 * "+ Create website" has no folder in its input — `CreateSiteInput` is a display name plus a
 * database choice, ported from Tovu-Runner's own provisioner-backed form. This shell has no such
 * provisioner, so creating a project here means the operator picks WHERE it lives, the same way
 * "Open Site…" already does; `input.displayName` becomes `tovu init`'s `--name`.
 *
 * **The database choice is REFUSED rather than ignored (D-02).** Knowing the field was dead and
 * narrowing it silently was the defect: `buildSiteRecord` hard-codes `{kind: "sqlite"}`, so an
 * operator who chose Supabase — and whom `computeCanCreate` then FORCED to type a project URL and
 * an API key before the button would enable — got a local SQLite site reported back as a success,
 * with their credential discarded. A contract this process does not honour must fail loudly at its
 * boundary; the renderer's own fix (disabling the options it cannot deliver) is the first line,
 * and this is the one that holds whoever calls the channel next.
 *
 * Refused BEFORE the folder dialog, deliberately: nobody should pick a folder for a site that was
 * never going to be made. An absent `database` is the same as `sqlite` — every existing caller
 * omits it, and omitting it is not a claim about a provider.
 *
 * @throws {Error} when a non-SQLite database is asked for, when the folder picker is cancelled, or
 *   when the chosen folder is occupied/incomplete (`adoptSiteDir`'s own errors — an
 *   operator-facing message either way).
 * @complexity O(1) beyond `adoptSiteDir`'s own cost.
 */
async function handleCreate(input, deps) {
  const kind = input.database?.kind;
  if (kind !== undefined && kind !== "sqlite") {
    throw new Error(`This app only creates SQLite sites, which live in the folder you choose. "${kind}" needs a hosted-database provisioner this app does not have.`);
  }

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
  // see `project-delete-guard.js`. `adoptSiteDir` refuses "occupied"/"incomplete" outright, so the
  // only two classifications that reach `trackSite` are the two this maps.
  const wasEmpty = deps.classifySiteDir(picked.filePaths[0]) === "empty";
  const siteDir = await deps.adoptSiteDir({
    dir: picked.filePaths[0],
    repoRoot: deps.repoRoot,
    statePath: deps.statePath,
    name: input.displayName,
    cliMode: deps.cliMode,
  });
  const origin = wasEmpty ? SITE_ORIGIN.created : SITE_ORIGIN.adopted;
  // Read AFTER `adoptSiteDir`, because before it there is no site there to have an identity: this is
  // the id `tovu init` just stamped into `.site-meta.json`. Recording it here is the only moment
  // this app can honestly say "the site at this path is one I made" — every later reader is looking
  // at a path, and a path is not an identity. See `project-delete-guard.js`'s test 3.
  const siteId = readSiteIdentity(siteDir);
  trackSite(deps.projectsPath, siteDir, origin, { siteId });
  return buildSiteRecord({ siteDir, createdAt: new Date().toISOString(), origin, siteId }, deps);
}

/**
 * "Add Tovu Website" — track a folder that ALREADY holds a Tovu site.
 *
 * The sibling of {@link handleCreate}, and the difference is the entire point: `create` takes an
 * EMPTY folder and runs `tovu init` into it, while this one takes a folder that is already a site
 * and writes nothing but a registry row. `adoptSiteDir` cannot be reused here for exactly that
 * reason — it is `resolveOrInitSiteDir({onMissingSite: "init"})`, so handing it an empty folder
 * creates a site there, which for this verb is the operator's mistake being silently acted on
 * rather than reported.
 *
 * It also explains a confusion this closes rather than adds to: `handleCreate` ALREADY silently
 * adopts a folder that turns out to be a site (see its `wasEmpty` line), so "Create website" has
 * been doing two jobs with one label. This gives the second job its own button and its own refusals.
 *
 * Main owns the dialog, same as `handleCreate`, so the renderer never names a path.
 *
 * The row is recorded `adopted` by `addSitePointer` itself, never `created`, so
 * `project-delete-guard.js` can never let a later delete erase a folder this app did not make.
 *
 * @throws {Error} when the dialog is cancelled, or `AddSitePointerError` when the folder is not a
 *   complete Tovu site — either way an operator-facing message that names the fix.
 * @complexity O(n) in the tracked-project count, plus one classification.
 */
async function handleAddSite(deps) {
  const picked = await deps.dialog.showOpenDialog({
    title: "Choose your Tovu website's folder",
    message: "Pick a folder that already contains a Tovu website. Nothing in it will be changed.",
    buttonLabel: "Add website",
    // No `createDirectory`, unlike `handleCreate`: a folder the operator makes in this dialog is
    // empty by definition, and an empty folder is precisely what this verb refuses. Offering the
    // button would invite the one mistake the refusal then has to explain.
    properties: ["openDirectory"],
  });
  if (picked.canceled || picked.filePaths.length === 0) {
    throw new Error("No folder was chosen.");
  }

  const { siteDir } = deps.addSitePointer({ siteDir: picked.filePaths[0], projectsPath: deps.projectsPath });
  const row = readTrackedSites(deps.projectsPath).find((entry) => entry.siteDir === siteDir);
  // Read back rather than synthesized: an already-tracked folder keeps its ORIGINAL `createdAt` and
  // origin, and a fabricated row would report today's date and reorder the operator's grid.
  return buildSiteRecord(row, deps);
}

/**
 * The exact operator-facing refusal when a SECOND copy of this app still has this site open.
 * Exported so tests assert on the real string rather than a paraphrase of it.
 *
 * @complexity O(n) in foreign row count.
 */
function foreignServerMessage(siteDir, foreign) {
  const pids = foreign.map((row) => row.pid).join(", ");
  return (
    `Another copy of Tovu still has this site open (process ${pids}). Close that window first. ` +
    `Deleting now would erase ${siteDir} out from under a server that is still writing to its database.`
  );
}

/**
 * Crash-safety rows naming a LIVE `tovu serve` for `siteDir` that belongs to some process OTHER
 * than the one this instance is holding — i.e. a second copy of this app with the same site open.
 *
 * `openSites` cannot answer this: it is this process's own in-memory map, so a sibling instance's
 * child is invisible to it. The on-disk registry is the only thing that sees both, and it is
 * already written to see them — `recordSiteOpened`'s "refuse-not-replace" rule (D-07) exists
 * precisely so a sibling's row survives this instance opening the same site.
 *
 * `isLiveServeRow` is the registry's own identity proof (pid alive AND its live argv still names
 * this site dir and port), so a pid the OS recycled to something unrelated can never make this
 * refuse. Stale rows therefore cannot wedge a delete.
 *
 * @param ownPid this instance's own child's pid, excluded — its row is not foreign.
 * @complexity O(n) in registry rows, times one `ps` call per row matching `siteDir` (in practice
 *   zero or one).
 */
function liveForeignServers(deps, siteDir, ownPid) {
  return deps
    .readRegistry(deps.registryPath)
    .sites.filter((row) => row.siteDir === siteDir && row.pid !== ownPid && deps.isLiveServeRow(row));
}

/**
 * Stops the project if it is running, untracks it, and — ONLY for a directory this app itself
 * created — erases its install directory.
 *
 * That last word is load-bearing and is the whole reason this function consults
 * `project-delete-guard.js` rather than calling `fs.rm` on whatever id arrives. A tracked row can
 * point at a folder the app merely adopted (`seedDevFallbackSite` seeds exactly one such row,
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
 * window's own `closed` listener (`main.js`) still fires afterward and repeats the same two
 * cleanup calls — both are idempotent (`stopChild` checks `exitCode`/`signalCode` first;
 * `openSites.delete` and `recordSiteClosed` are no-ops on an absent entry), so the double call is
 * harmless rather than a race.
 *
 * **Runs through the SAME `serializer` key `handleStart` uses, and that is what makes the paragraph
 * above true** (D-05/SEC-02). It used to be false for one interleaving: `openSiteServer` publishes
 * into `openSites` only AFTER `startSiteBackend` resolves, and that can take the full
 * `DEFAULT_READY_TIMEOUT_MS` (60s) while `tovu serve` boots. Start a site, go back to All, delete
 * it, and the delete saw no entry, skipped the stop, and recursively erased the directory the child
 * was booting in — then the start completed and published a running entry for a project that no
 * longer existed. Serializing the two verbs against each other is the whole fix: the delete now
 * queues behind the in-flight start and finds the entry it must stop.
 *
 * @complexity O(1) beyond `fs.rm`'s own cost over the site directory's contents, plus however long
 *   an already-queued operation on the same site takes to settle.
 */
async function handleDelete(id, deps) {
  await deps.serializer.run(id, () => deleteProject(id, deps));
}

/**
 * {@link handleDelete}'s body, separated only so the serialized region is one named thing rather
 * than an inline closure — everything here assumes it holds this site's serializer key.
 *
 * @complexity see {@link handleDelete}.
 */
async function deleteProject(id, deps) {
  const row = readTrackedSites(deps.projectsPath).find((entry) => entry.siteDir === id);
  if (row === undefined) return;

  const openEntry = deps.openSites.get(id);
  const erasesFiles = mayEraseSiteDirectory(row, { repoRoot: deps.repoRoot });

  // BEFORE any side effect, and only for the arm that erases (D-08). The serializer above makes the
  // stop-then-erase sequence safe against THIS process; nothing made it safe against a second copy
  // of the app, and nothing prevents one — `main.js` calls no `requestSingleInstanceLock`, and
  // `site-process-registry.js` is written throughout on the premise that two instances can run at once.
  // Instance A deleting a site instance B has open recursively erased the directory out from under
  // B's live `tovu serve`, which went on writing into unlinked files.
  //
  // Refusing the whole operation rather than untracking-without-erasing: `deleteErasesFiles` is what
  // the confirm overlay showed the operator, and this function's own contract is that the overlay
  // never promises a consequence it will not deliver. A quiet downgrade to "card removed, folder
  // kept" would break that in the direction they cannot see.
  //
  // The non-erasing arm is deliberately NOT gated. There it means "take this card off my Projects
  // screen"; a sibling instance keeping its own copy running is not endangered by that.
  if (erasesFiles) {
    const foreign = liveForeignServers(deps, id, openEntry?.server.pid);
    if (foreign.length > 0) throw new Error(foreignServerMessage(id, foreign));
  }

  if (openEntry !== undefined) {
    await openEntry.server.stop();
    deps.openSites.delete(id);
    // By pid: `recordSiteOpened` can leave a live sibling instance's row for this same site dir,
    // and a close by site dir alone would drop that one too (D-07).
    deps.recordSiteClosed(deps.registryPath, id, { pid: openEntry.server.pid });
    // A sites-home-opened (embedded-tab) entry has no `window` at all — see `openSiteServer` in
    // `main.js` — so this is optional, not a missing null check.
    if (openEntry.window && !openEntry.window.isDestroyed()) openEntry.window.destroy();
  }

  untrackSite(deps.projectsPath, id);
  if (erasesFiles) {
    await fsp.rm(id, { recursive: true, force: true });
  }
}

/**
 * Hands one of a running project's surfaces to the operator's default browser. Refuses a project
 * that is not currently open rather than guessing a port — nothing durable records a stopped
 * project's last-known port today (see `tracked-sites.js`'s header on why status is derived,
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
 * Reuses `openSiteServer` — `main.js`'s spawn-only counterpart to the `openSiteWindow` "Open
 * Site…"/"Open Recent"/startup already use — through `serializer.run`, so opening the same tab twice
 * fast cannot double-spawn its server (see `main.js`'s own doc on `openSiteServer`/
 * `keyed-serializer.js`).
 *
 * Returns the project's fresh record rather than nothing: the renderer's `<webview>` needs the
 * `port` this call just produced, and re-deriving it would mean a second `list` round trip for
 * every tab open.
 *
 * The tracked-row check happens INSIDE the serialized region, not before it (D-05/SEC-02). Read
 * outside, it answered a question about a moment that had already passed: a delete queued on the
 * same key could untrack the row and erase the directory between the check and the spawn, and this
 * would then start a `tovu serve` on a path that no longer exists. Inside, "is this project still
 * tracked" is asked at the only instant its answer is still true when acted on.
 *
 * @throws {Error} when `id` names a project this shell is not tracking — a stale id from a renderer
 *   that has not yet re-polled past a delete, refused rather than opening an arbitrary path.
 * @complexity O(1) beyond `openSiteServer`'s own cost, plus however long an already-queued
 *   operation on the same site takes to settle.
 */
async function handleStart(id, deps) {
  return await deps.serializer.run(id, async () => {
    const row = readTrackedSites(deps.projectsPath).find((entry) => entry.siteDir === id);
    if (row === undefined) {
      throw new Error(`Unknown project: ${id}`);
    }
    await deps.openSiteServer(id, deps.ctx);
    return buildSiteRecord(row, deps);
  });
}

/**
 * Find every Tovu site on disk the operator has no stored answer about, track it, and return the
 * whole refreshed list.
 *
 * This is the fix for the Projects screen having no discovery at all: {@link handleList} renders
 * `desktop-projects.json` and nothing else — no scan, no rescan, no fallback — so a site created by
 * `tovu init` outside the shell, or restored from a backup, was invisible forever no matter how
 * plainly it sat on disk. Runs once at boot (`main.js`) and again whenever the operator asks.
 *
 * **A directory the operator removed on purpose is never brought back**, however many times this
 * runs. That is `adoptDiscoveredSites`' rule, not this function's, and the reason it lives down
 * there is that the boot pass and the operator's button must not be able to disagree about it: a
 * rescan that resurrected deleted cards would be the same bug the seed guard exists to prevent,
 * and worse here, since a button can be pressed again. Their way back is the folder dialog, which
 * reaches `trackSite` directly — see that function's own comment on why only the explicit adder
 * clears a dismissal.
 *
 * @param deps.siteScanRoots directories whose immediate children are candidate sites.
 * @param deps.recentSiteDirs `site-dir-store.js`'s recently-opened list, as a thunk — the sites
 *   own-server mode has been recording all along, which are the operator's by definition and
 *   generally do not live under any scan root.
 * @returns the same records {@link handleList} would return, after the pass.
 * @complexity O(n) in the scanned child count, times the registry size.
 */
function rescanSites(deps) {
  const found = discoverSiteDirs({
    scanRoots: deps.siteScanRoots,
    knownDirs: deps.recentSiteDirs(),
    classifySiteDir: deps.classifySiteDir,
  });
  adoptDiscoveredSites(deps.projectsPath, found);
  return handleList(deps);
}

/**
 * Registers the seven real `runner:projects:*` handlers above.
 *
 * @param {object} deps
 * @param {{handle: Function}} deps.ipcMain
 * @param {{showOpenDialog: Function}} deps.dialog
 * @param {{openExternal: Function}} deps.shell
 * @param {object} deps.openSites live open sites, keyed by site dir — `main.js`'s own module-level
 *   store, passed in rather than imported. `Map`-compatible; in production it is
 *   `site-supervisor.js`'s supervisor, which additionally drops an entry whose child has died and
 *   answers `lastExitOf` about it. A sites-home-opened (embedded-tab) entry carries no `window`; only
 *   own-server-mode entries do.
 * @param {{run: Function}} deps.serializer per-site-dir operation serializer (`keyed-serializer.js`).
 * @param {string} deps.projectsPath `tracked-sites.js`'s tracked-project JSON file.
 * @param {string} deps.registryPath crash-safety registry file (`site-process-registry.js`), for
 *   `recordSiteClosed` on a delete of a running project.
 * @param {string} deps.repoRoot Tovu repo root.
 * @param {string} deps.statePath `site-dir-store.js`'s MRU file, for `adoptSiteDir`.
 * @param {string} deps.cliMode `"source"` or `"compiled"` — see `tovu-server.js`.
 * @param {Function} deps.readSiteName `main.js`'s site-display-name reader.
 * @param {Function} deps.adoptSiteDir `site-dir-store.js`'s folder-to-site-dir classifier/initializer.
 * @param {Function} deps.addSitePointer `add-site-pointer.js`'s pointer-only adder, used by
 *   {@link handleAddSite}. Injected rather than imported for the same reason `adoptSiteDir` is —
 *   every handler in this file stays callable from plain `node --test` against fakes.
 * @param {Function} deps.classifySiteDir `site-dir-store.js`'s classifier, called by `handleCreate`
 *   BEFORE `adoptSiteDir` to record whether this app is about to create the directory or is adopting
 *   one that already exists — see `handleCreate`'s own comment and `project-delete-guard.js`.
 * @param {Function} deps.openSiteServer `main.js`'s spawn-or-reuse-a-site's-backend function
 *   (no `BrowserWindow` — see that function's own doc).
 * @param {Function} deps.recordSiteClosed `site-process-registry.js`'s crash-safety row remover.
 * @param {Function} deps.readRegistry `site-process-registry.js`'s crash-safety registry reader, used by
 *   {@link liveForeignServers} to see a SIBLING app instance's open sites — which `openSites`, being
 *   this process's own memory, cannot.
 * @param {Function} deps.isLiveServeRow `site-process-registry.js`'s "is this row's pid still its own live
 *   `tovu serve`" identity proof, so a stale or recycled pid can never block a delete.
 * @param {object} deps.ctx `{cliMode, registryPath}` — `openSiteServer`'s own second argument.
 * @complexity O(1) — seven registrations.
 */
function registerSiteIpcHandlers(deps) {
  deps.ipcMain.handle(RUNNER_PROJECT_CHANNELS.list, () => handleList(deps));
  deps.ipcMain.handle(RUNNER_PROJECT_CHANNELS.create, (_event, input) => handleCreate(input, deps));
  deps.ipcMain.handle(RUNNER_PROJECT_CHANNELS.delete, (_event, id) => handleDelete(id, deps));
  deps.ipcMain.handle(RUNNER_PROJECT_CHANNELS.openExternal, (_event, input) => handleOpenExternal(input, deps));
  deps.ipcMain.handle(RUNNER_PROJECT_CHANNELS.start, (_event, id) => handleStart(id, deps));
  deps.ipcMain.handle(RUNNER_PROJECT_CHANNELS.rescan, () => rescanSites(deps));
  deps.ipcMain.handle(RUNNER_PROJECT_CHANNELS.addSite, () => handleAddSite(deps));
}

export {
  RUNNER_PROJECT_CHANNELS,
  foreignServerMessage,
  buildSiteRecord,
  handleList,
  handleAddSite,
  handleCreate,
  handleDelete,
  handleOpenExternal,
  handleStart,
  rescanSites,
  registerSiteIpcHandlers,
};
