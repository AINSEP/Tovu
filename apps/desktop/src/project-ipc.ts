/**
 * @file Real handlers for the nine `runner:sites:*` IPC verbs the Projects screen needs — see
 * `contracts/project.ts`'s `SITE_IPC_CHANNELS` for what each one is for. Registered in
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

import { SITE_ORIGIN, readTrackedSites, trackSite, untrackSite, discoverSiteDirs, adoptDiscoveredSites } from "./tracked-sites.ts";
import { mayEraseSiteDirectory, readSiteIdentity } from "./project-delete-guard.ts";
import { sitePartition } from "./desktop-auth.ts";

const SITE_IPC_CHANNELS = Object.freeze({
  list: "runner:sites:list",
  create: "runner:sites:create",
  delete: "runner:sites:delete",
  openExternal: "runner:sites:open-external",
  start: "runner:sites:start",
  rescan: "runner:sites:rescan",
  addSite: "runner:sites:add-site",
  rename: "runner:sites:rename",
  preview: "runner:sites:preview",
});

/**
 * A tracked-project row as {@link buildSiteRecord} and its siblings need it — loosened from
 * `tracked-sites.js`'s own `TrackedSiteRow` (not exported) in exactly the two fields a caller here
 * can hand in without one: `origin` and `siteId` are optional, because {@link mayEraseSiteDirectory}
 * already treats an absent `origin` as "not created" (refuse) and {@link identityHasChanged} already
 * treats an absent `siteId` as "nothing recorded" — this type describes that existing tolerance
 * rather than inventing it. Deliberately no index signature, unlike `project-delete-guard.js`'s own
 * `RowLike`: a real `TrackedSiteRow` (also no index signature) must flow into this type at every
 * real call site, and TypeScript does not consider a plain interface assignable to one that HAS an
 * index signature. See the `as MayEraseRowLike` casts where a `SiteRow` is handed to
 * {@link mayEraseSiteDirectory} instead.
 */
interface SiteRow {
  siteDir: string;
  createdAt: string;
  origin?: string;
  siteId?: string;
}

/** {@link mayEraseSiteDirectory}'s own (unexported) first-parameter type, extracted structurally
 *  rather than by name — see {@link SiteRow}'s own doc on why a `SiteRow` needs a cast to reach it. */
type MayEraseRowLike = Parameters<typeof mayEraseSiteDirectory>[0];

/** How a site's server exited. Mirrors `site-supervisor.js`'s own `ServerExit` structurally rather
 *  than importing it — this file's `openSites` contract is a plain duck type on purpose (see
 *  {@link OpenSites}), never coupled to the concrete supervisor. */
interface ServerExitLike {
  code: number | null;
  signal: string | null;
}

/** One `openSites` entry. Every field is optional: a caller — this file's own tests included — only
 *  ever fills in what the handler under test actually reads. The real production shape
 *  (`main.js`'s `openSiteServer`) always sets `server.port`/`pid`/`stop` and `window` only for an
 *  own-server-mode entry. */
interface OpenSiteEntry {
  server: {
    port?: number;
    pid?: number;
    origin?: string;
    stop?: () => Promise<unknown>;
    onExit?: (listener: (exit: ServerExitLike) => void) => void;
  };
  window?: {
    isDestroyed?: () => boolean;
    destroy?: () => void;
    setTitle?: (title: string) => void;
  };
}

/** `deps.openSites` — `Map`-compatible, per {@link registerSiteIpcHandlers}'s own doc; in production
 *  it is `site-supervisor.js`'s supervisor, which adds {@link OpenSites.lastExitOf}. This file's own
 *  handlers only ever call `get`/`delete`, but `set`/`has` are part of the type because the
 *  documented "Map-compatible" contract is what callers (this file's own tests, and `main.js`) build
 *  entries with before a handler ever sees them. */
interface OpenSites {
  get(siteDir: string): OpenSiteEntry | undefined;
  set(siteDir: string, entry: OpenSiteEntry): unknown;
  has(siteDir: string): boolean;
  delete(siteDir: string): boolean;
  lastExitOf?(siteDir: string): ServerExitLike | null;
}

/** A crash-safety registry row, as {@link liveForeignServers} needs it — mirrors
 *  `site-process-registry.js`'s own `SiteProcessRow`, duplicated rather than imported for the same
 *  reason `readRegistry`/`isLiveServeRow` arrive on `deps` rather than as a direct import: every
 *  handler here stays callable from plain `node --test` against fakes. */
interface RegistryRow {
  siteDir: string;
  port: number;
  workspaceId: string;
  pid: number;
  updatedAt: number;
}

/** `deps.dialog.showOpenDialog`'s options — the subset of Electron's `OpenDialogOptions` every
 *  caller here actually passes. */
interface OpenDialogOptions {
  title: string;
  message: string;
  buttonLabel: string;
  properties: Array<"openDirectory" | "createDirectory">;
}

/** Electron's `dialog.showOpenDialog` resolution — the subset read here. */
interface OpenDialogResult {
  canceled: boolean;
  filePaths: string[];
}

/** `deps.dialog` — injected so `handleCreate`/`handleAddSite` are testable without a real native
 *  dialog. */
interface DialogLike {
  showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogResult>;
}

/** `deps.shell` — injected so {@link handleOpenExternal} is testable without a real browser launch.
 *  Typed to return `Promise<unknown>` rather than Electron's own `Promise<void>`: this file only
 *  ever awaits the call, and several tests report what they opened by returning their own array
 *  length from the fake. */
interface ShellLike {
  openExternal(url: string): Promise<unknown>;
}

/** `deps.ipcMain` — Electron's own `ipcMain.handle` listener signature is itself
 *  `(event: any, ...args: any[]) => any` (see Electron's `ipcMain.d.ts`): the per-channel
 *  payload/return shape is not something this generic registration API can express, so each
 *  `deps.ipcMain.handle(...)` call below still gives its own listener a real, specific parameter
 *  type at the point that matters — the handler function it delegates to. */
interface IpcMainLike {
  handle(channel: string, listener: (event: any, ...args: any[]) => any): void; // eslint-disable-line @typescript-eslint/no-explicit-any -- mirrors Electron's own ipcMain.handle signature
}

/** `deps.serializer` — `keyed-serializer.js`'s per-key promise chain, loosened from that file's own
 *  exported `KeyedSerializer` type (`run<T>(...): Promise<T>`) to `T | PromiseLike<T>`: this file
 *  only ever `await`s the result, and the plain synchronous fakes several tests use return `fn()`'s
 *  own value rather than a wrapped `Promise`. The real `createKeyedSerializer()` still satisfies
 *  this — `Promise<T>` is one of the two arms. */
interface Serializer {
  run<T>(key: string, fn: () => T | PromiseLike<T>): T | PromiseLike<T>;
}

/** {@link handleCreate}'s input — mirrors `contracts/project.ts`'s `CreateSiteInput`, kept local for
 *  the same reason {@link SITE_IPC_CHANNELS} is inlined rather than imported: see this file's
 *  header. */
interface CreateSiteInput {
  displayName: string;
  database?: { kind: string };
}

/** {@link handleRename}'s input — mirrors `contracts/project.ts`'s `RenameSiteInput`. */
interface RenameSiteInput {
  id?: string;
  name?: string;
}

/** {@link handleOpenExternal}'s input — mirrors `contracts/project.ts`'s `OpenSiteSurfaceInput`. */
interface OpenSiteSurfaceInput {
  siteId: string;
  view: "site" | "admin";
}

/** {@link handleCreate}/{@link rescanSites}'s own `adoptSiteDir` shape — loosened from
 *  `site-dir-store.js`'s own `AdoptSiteDirInput` (not exported) since this field arrives on `deps`,
 *  injected rather than imported, for the same testability reason as every other collaborator here. */
interface AdoptSiteDirInput {
  dir: string;
  repoRoot: string;
  statePath: string;
  name?: string;
  cliMode?: string;
}

/** {@link handleAddSite}'s own `addSitePointer` shape — mirrors `add-site-pointer.js`'s real
 *  `addSitePointer`, duplicated rather than imported for the same reason as {@link AdoptSiteDirInput}. */
interface AddSitePointerLike {
  (input: { siteDir: string; projectsPath: string }): { siteDir: string; alreadyTracked: boolean; alreadyDismissed: boolean };
}

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
function describeLastExit(openSites: OpenSites, siteDir: string): string | null {
  const exit = typeof openSites.lastExitOf === "function" ? openSites.lastExitOf(siteDir) : null;
  if (exit === null) return null;
  if (exit.signal !== null && exit.signal !== undefined) return `The site's server was stopped by ${exit.signal}.`;
  return `The site's server exited (code ${exit.code}).`;
}

/**
 * One tracked row plus `openSites` (ground truth for "running") joined into the `SiteRecord`
 * shape `contracts/project.ts` declares. Every field this shell cannot really know — `templateId`,
 * `templateVersion`, `database` — gets a stated, honest default rather than a fabricated value:
 * every project a JSON-file-tracked site can describe today was created outside a provisioner this
 * shell drives, so there is no template or vendor-database fact to report.
 *
 * @complexity O(1).
 */
function buildSiteRecord(row: SiteRow, deps: Pick<ProjectIpcDeps, "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion">) {
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
    // embedded-tab renderer needs it either way: `SiteWorkspace`'s `<webview>` sets it up front,
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
    deleteErasesFiles: mayEraseSiteDirectory(row as unknown as MayEraseRowLike, { repoRoot: deps.repoRoot }),
    // A version token, never the image — see `SiteRecord.previewVersion`'s own doc on why this
    // record (polled every 4s) must never carry a payload. `null` for a site with no capture yet,
    // which is every site's ordinary state until it has been opened once.
    previewVersion: deps.readPreviewVersion(row.siteDir),
  };
}

/** @complexity O(n) in the tracked-project count. */
function handleList(deps: Pick<ProjectIpcDeps, "projectsPath" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion">) {
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
async function handleCreate(
  input: CreateSiteInput,
  deps: Pick<ProjectIpcDeps, "dialog" | "classifySiteDir" | "adoptSiteDir" | "repoRoot" | "statePath" | "cliMode" | "projectsPath" | "openSites" | "readSiteName" | "readPreviewVersion">
) {
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
  const wasEmpty = deps.classifySiteDir(picked.filePaths[0]!) === "empty"; // just checked `filePaths.length === 0` above, so index 0 exists
  const siteDir = await deps.adoptSiteDir({
    dir: picked.filePaths[0]!, // same non-empty check as above
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
  // TOO-NARROW DEPENDENCY TYPE (reported, not cast — see handoff): `readSiteIdentity` (project-delete-guard.ts)
  // returns `string | null`, but `trackSite`'s own `TrackSiteOptions.siteId` (tracked-sites.ts) is typed
  // `string | undefined` and does not admit `null`, even though `buildTrackedRow`'s `typeof siteId === "string"`
  // check treats null and undefined identically at runtime. Left as a genuine strict-tsc error per the
  // migration rules rather than cast past.
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
async function handleAddSite(deps: Pick<ProjectIpcDeps, "dialog" | "addSitePointer" | "projectsPath" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion">) {
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

  const { siteDir } = deps.addSitePointer({ siteDir: picked.filePaths[0]!, projectsPath: deps.projectsPath }); // just checked `filePaths.length === 0` above, so index 0 exists
  const row = readTrackedSites(deps.projectsPath).find((entry) => entry.siteDir === siteDir)!; // addSitePointer just tracked this exact siteDir above, so a row for it always exists
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
function foreignServerMessage(siteDir: string, foreign: Array<{ pid: number }>): string {
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
function liveForeignServers(deps: Pick<ProjectIpcDeps, "readRegistry" | "registryPath" | "isLiveServeRow">, siteDir: string, ownPid: number | undefined): RegistryRow[] {
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
 * a given card will do, from the same guard's answer carried on `SiteRecord.deleteErasesFiles`,
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
async function handleDelete(id: string, deps: Pick<ProjectIpcDeps, "serializer" | "projectsPath" | "openSites" | "repoRoot" | "readRegistry" | "registryPath" | "isLiveServeRow" | "recordSiteClosed" | "deletePreview">): Promise<void> {
  await deps.serializer.run(id, () => deleteProject(id, deps));
}

/**
 * {@link handleDelete}'s body, separated only so the serialized region is one named thing rather
 * than an inline closure — everything here assumes it holds this site's serializer key.
 *
 * @complexity see {@link handleDelete}.
 */
async function deleteProject(id: string, deps: Pick<ProjectIpcDeps, "projectsPath" | "openSites" | "repoRoot" | "readRegistry" | "registryPath" | "isLiveServeRow" | "recordSiteClosed" | "deletePreview">): Promise<void> {
  const row = readTrackedSites(deps.projectsPath).find((entry) => entry.siteDir === id);
  if (row === undefined) return;

  const openEntry = deps.openSites.get(id);
  const erasesFiles = mayEraseSiteDirectory(row as unknown as MayEraseRowLike, { repoRoot: deps.repoRoot });

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
    await openEntry.server.stop!(); // an entry with no `.stop` never reaches this line in practice — `OpenSiteEntry.server.stop` is optional only because other, non-delete tests build entries that omit it
    deps.openSites.delete(id);
    // By pid: `recordSiteOpened` can leave a live sibling instance's row for this same site dir,
    // and a close by site dir alone would drop that one too (D-07).
    deps.recordSiteClosed(deps.registryPath, id, { pid: openEntry.server.pid });
    // A sites-home-opened (embedded-tab) entry has no `window` at all — see `openSiteServer` in
    // `main.js` — so this is optional, not a missing null check.
    if (openEntry.window && !openEntry.window.isDestroyed!()) openEntry.window.destroy!(); // present whenever `window` is (see `OpenSiteEntry.window`'s own doc: optional only for tests that never invoke it)
  }

  untrackSite(deps.projectsPath, id);
  // Unconditional — independent of `erasesFiles` below. A preview is this shell's own decoration,
  // not the operator's data, so a row that is merely REMOVED (adopted, files kept) still drops its
  // cached thumbnail: once the row is gone `buildSiteRecord` can never ask for it again
  // (`site-preview-store.js`'s own doc on why an orphan is otherwise unreachable, not merely
  // unlikely), so leaving the file behind would only be litter for the boot sweep to find later.
  deps.deletePreview(id);
  if (erasesFiles) {
    await fsp.rm(id, { recursive: true, force: true });
  }
}

/**
 * Whether this row recorded an identity that the directory no longer has.
 *
 * `false` for a row that recorded none — which is every ADOPTED row, since `buildTrackedRow`
 * (`tracked-sites.js`) stamps `siteId` only on a `created` one. That is the deliberate fail-OPEN
 * half of {@link handleRename}'s guard, argued in its own doc: a check that cannot run is not the
 * same as a check that failed, and treating it as failure would make rename impossible on every
 * site the operator adopted.
 *
 * Its own function so the three clauses read as one question at the call site, and so the
 * "recorded nothing" and "recorded something that changed" cases are visibly different answers.
 *
 * @complexity O(1) beyond `readSiteIdentity`'s single file read.
 */
function identityHasChanged(row: SiteRow): boolean {
  if (typeof row.siteId !== "string" || row.siteId === "") return false;
  return readSiteIdentity(row.siteDir) !== row.siteId;
}

/**
 * Change a site's display name — `config.json`'s `name`, the one `readSiteName` reads for every
 * card's `displayName`.
 *
 * **WHY THE GUARD IS NOT `isStillTheRecordedSite`.** That predicate (`project-delete-guard.js`) is
 * the right identity test for DELETE and the wrong one here, and the difference is not a judgement
 * call — it returns `false` immediately unless `row.siteId` is a non-empty string, and
 * `buildTrackedRow` (`tracked-sites.js`) stamps `siteId` ONLY on a `created` row. Every site the
 * operator adopted — "Add Tovu Website", a rescan, "Open Site…" — has no `siteId` and never will,
 * so gating rename on it would refuse rename on essentially every real site: a feature that fails
 * closed into uselessness.
 *
 * The asymmetry is in what each direction costs, which is exactly how `project-delete-guard.js`'s
 * own header argues its case. Delete's fail-closed direction costs the operator a leftover folder
 * they can remove in Finder, while its wrong direction costs them their content — so it refuses
 * whatever it cannot positively prove. Rename's fail-closed direction costs the whole feature on
 * every site, while its wrong direction writes a display name into a site whose name that card is
 * ALREADY showing (`readSiteName` reads whatever `config.json` sits at that path). Non-destructive,
 * reversible, and the operator is renaming what they can see.
 *
 * So this checks what is actually checkable, and reuses the delete guard's own primitive
 * (`readSiteIdentity`) rather than inventing a second notion of site identity:
 *
 * 1. The row is tracked. An id this shell does not know is not a site it may write to.
 * 2. The directory still classifies as a complete Tovu site. This is the check that catches the
 *    moved-, emptied-, or deleted-folder cases, and it is the one that matters most often.
 * 3. When the row DOES carry a `siteId`, the directory's own identity must still match it.
 *    Best-effort by necessity rather than by choice — applied whenever it can be proven at all.
 *
 * **Residual risk, stated rather than hidden:** on an adopted row whose directory was swapped for
 * a different Tovu site, step 3 cannot fire and this renames the site that is there now. That is
 * the same directory whose name the card is already displaying, so the operator is not misled about
 * WHICH name they are changing — and the write is one reversible string, not a deletion.
 *
 * @returns the refreshed `SiteRecord`, so the card re-renders without a second `list` round trip.
 * @throws {Error} operator-facing, for every refusal above and for an invalid name
 *   (`site-config.js`'s own 1..200-after-trim check, which mirrors what `tovu serve` re-applies at
 *   every boot).
 * @complexity O(n) in the tracked-site count, for the row lookup.
 */
function handleRename(input: RenameSiteInput, deps: Pick<ProjectIpcDeps, "projectsPath" | "classifySiteDir" | "writeSiteName" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion">) {
  const id = input?.id;
  const row = readTrackedSites(deps.projectsPath).find((tracked) => tracked.siteDir === id);
  if (row === undefined) {
    throw new Error(`This app is not tracking a site at ${id}, so there is nothing to rename.`);
  }

  // The SAFE classifier (`deps.classifySiteDir` is `classifySiteDirSafely` — see `main.js`), so an
  // unreadable directory becomes a refusal with a reason rather than a throw from inside the guard.
  const kind = deps.classifySiteDir(row.siteDir);
  if (kind !== "site") {
    throw new Error(
      `${row.siteDir} is no longer a complete Tovu site (${kind}), so its name cannot be changed. ` +
        `If you moved the site, remove this card and add it again from its new location.`,
    );
  }

  if (identityHasChanged(row)) {
    throw new Error(
      `The site now at ${row.siteDir} is not the one this card was made for, so it was not renamed. ` +
        `Remove this card and add the site again from its current location.`,
    );
  }

  const name = deps.writeSiteName(row.siteDir, input?.name);

  // The open window's title, when there is one. There usually is NOT: a card opens its site as a
  // `<webview>` tab inside the sites home window (whose own title is pinned to "Tovu"), and
  // `openSiteServer` is spawn-only. Only "Open Site…"/"Open Recent" produce a titled window
  // (`main.js`'s `openSiteWindow`). Worth the line anyway — `readSiteName`'s own doc says that
  // title is "what makes Electron's native Window menu double as a site switcher (distinct titles,
  // distinct entries)", so a stale one is a stale CONTROL, not a stale label.
  //
  // "Open Recent" itself needs no refresh: `main.js` builds those items with the directory path as
  // the label, not the site name, so a rename cannot stale them.
  const openWindow = deps.openSites.get(row.siteDir)?.window;
  if (openWindow && !openWindow.isDestroyed!()) openWindow.setTitle!(name); // present whenever `window` is (see `OpenSiteEntry.window`'s own doc)

  return buildSiteRecord(row, deps);
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
async function handleOpenExternal(input: OpenSiteSurfaceInput, deps: Pick<ProjectIpcDeps, "openSites" | "shell">): Promise<void> {
  const openEntry = deps.openSites.get(input.siteId);
  if (openEntry === undefined) {
    throw new Error("That project is not open. Open it first, then try again.");
  }
  const url = `${openEntry.server.origin}${input.view === "site" ? "/" : "/admin/"}`;
  await deps.shell.openExternal(url);
}

/**
 * One site's cached preview as a `data:` URL, fetched ON DEMAND rather than riding along on
 * `buildSiteRecord`'s `previewVersion` field — see that field's own doc, and `site-preview-store.js`'s
 * header, on why the polled record and the actual bytes are deliberately two different round trips.
 *
 * No tracked-row check, unlike every other handler here: `id` only ever reaches this as an input to
 * a digest (`site-preview-store.js`'s `previewPath`), never as a filesystem path this function opens
 * directly, and reading is the only thing it does — there is no write or delete for a stale or
 * foreign id to cause.
 *
 * @returns the URL, or `null` when no capture exists yet — the ordinary state for a site that has
 *   never been opened, not an error to surface.
 * @complexity O(1) beyond `readPreviewDataUrl`'s own cost.
 */
function handleGetPreview(id: string, deps: Pick<ProjectIpcDeps, "readPreviewDataUrl">) {
  return deps.readPreviewDataUrl(id);
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
async function handleStart(id: string, deps: Pick<ProjectIpcDeps, "serializer" | "projectsPath" | "openSiteServer" | "ctx" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion">) {
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
 *
 * **Too-narrow dependency type, reported rather than cast (see handoff):**
 * `discoverSiteDirs`'s own `classifySiteDir` parameter (`tracked-sites.ts`'s unexported
 * `ClassifySiteDirFn`) is typed to return only `SiteClassification`'s four values, but every real
 * caller of `deps.classifySiteDir` in this codebase (`main.js`'s production wiring, and this file's
 * own `add-site-button-wiring.test.ts`) passes `classifySiteDirSafely`, which can also return
 * `"unreadable"` (`site-dir-store.ts:187`). `deps.classifySiteDir` is typed here to match that real,
 * wider value (`ProjectIpcDeps.classifySiteDir`, below), so the call one line down is the one place
 * that friction surfaces as a strict error rather than being silently narrowed by a cast.
 */
function rescanSites(deps: Pick<ProjectIpcDeps, "siteScanRoots" | "recentSiteDirs" | "classifySiteDir" | "projectsPath" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion">) {
  const found = discoverSiteDirs({
    scanRoots: deps.siteScanRoots,
    knownDirs: deps.recentSiteDirs(),
    // TOO-NARROW DEPENDENCY TYPE (reported, not cast — see this function's own doc above): left as a
    // genuine strict-tsc error rather than cast past it.
    classifySiteDir: deps.classifySiteDir,
  });
  adoptDiscoveredSites(deps.projectsPath, found);
  return handleList(deps);
}

/**
 * Registers the nine real `runner:sites:*` handlers above.
 *
 * @param deps
 * @param deps.openSites live open sites, keyed by site dir — `main.js`'s own module-level
 *   store, passed in rather than imported. `Map`-compatible; in production it is
 *   `site-supervisor.js`'s supervisor, which additionally drops an entry whose child has died and
 *   answers `lastExitOf` about it. A sites-home-opened (embedded-tab) entry carries no `window`; only
 *   own-server-mode entries do.
 * @param deps.serializer per-site-dir operation serializer (`keyed-serializer.js`).
 * @param deps.projectsPath `tracked-sites.js`'s tracked-project JSON file.
 * @param deps.registryPath crash-safety registry file (`site-process-registry.js`), for
 *   `recordSiteClosed` on a delete of a running project.
 * @param deps.repoRoot Tovu repo root.
 * @param deps.statePath `site-dir-store.js`'s MRU file, for `adoptSiteDir`.
 * @param deps.cliMode `"source"` or `"compiled"` — see `tovu-server.js`.
 * @param deps.readSiteName `main.js`'s site-display-name reader.
 * @param deps.writeSiteName `site-config.js`'s validating, atomic `config.json` name
 *   writer, used by {@link handleRename}. Injected rather than imported for the same reason
 *   `adoptSiteDir` is — every handler in this file stays callable from plain `node --test` against
 *   fakes, and a rename test must never write into a real site directory.
 * @param deps.readPreviewVersion `site-preview-store.js`'s reader, bound to this launch's
 *   userData at the same call site every other consumer resolves it from — feeds
 *   `buildSiteRecord`'s `previewVersion` field.
 * @param deps.readPreviewDataUrl `site-preview-store.js`'s reader, bound the same way —
 *   {@link handleGetPreview}'s on-demand fetch.
 * @param deps.deletePreview `site-preview-store.js`'s remover, bound the same way —
 *   called beside `untrackSite` in {@link deleteProject}.
 * @param deps.adoptSiteDir `site-dir-store.js`'s folder-to-site-dir classifier/initializer.
 * @param deps.addSitePointer `add-site-pointer.js`'s pointer-only adder, used by
 *   {@link handleAddSite}. Injected rather than imported for the same reason `adoptSiteDir` is —
 *   every handler in this file stays callable from plain `node --test` against fakes.
 * @param deps.classifySiteDir `site-dir-store.js`'s classifier, called by `handleCreate`
 *   BEFORE `adoptSiteDir` to record whether this app is about to create the directory or is adopting
 *   one that already exists — see `handleCreate`'s own comment and `project-delete-guard.js`.
 * @param deps.openSiteServer `main.js`'s spawn-or-reuse-a-site's-backend function
 *   (no `BrowserWindow` — see that function's own doc).
 * @param deps.recordSiteClosed `site-process-registry.js`'s crash-safety row remover.
 * @param deps.readRegistry `site-process-registry.js`'s crash-safety registry reader, used by
 *   {@link liveForeignServers} to see a SIBLING app instance's open sites — which `openSites`, being
 *   this process's own memory, cannot.
 * @param deps.isLiveServeRow `site-process-registry.js`'s "is this row's pid still its own live
 *   `tovu serve`" identity proof, so a stale or recycled pid can never block a delete.
 * @param deps.ctx `{cliMode, registryPath}` — `openSiteServer`'s own second argument.
 * @complexity O(1) — nine registrations.
 */
function registerSiteIpcHandlers(deps: ProjectIpcDeps): void {
  deps.ipcMain.handle(SITE_IPC_CHANNELS.list, () => handleList(deps));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.create, (_event, input) => handleCreate(input, deps));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.delete, (_event, id) => handleDelete(id, deps));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.openExternal, (_event, input) => handleOpenExternal(input, deps));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.start, (_event, id) => handleStart(id, deps));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.rescan, () => rescanSites(deps));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.rename, (_event, input) => handleRename(input, deps));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.addSite, () => handleAddSite(deps));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.preview, (_event, id) => handleGetPreview(id, deps));
}

/**
 * The full `deps` bag {@link registerSiteIpcHandlers} needs — every individual handler above takes
 * only the `Pick` of this it actually reads, so a caller wiring one handler in isolation (as this
 * file's own tests do) never has to fabricate the fields it does not touch.
 */
interface ProjectIpcDeps {
  ipcMain: IpcMainLike;
  dialog: DialogLike;
  shell: ShellLike;
  openSites: OpenSites;
  serializer: Serializer;
  projectsPath: string;
  registryPath: string;
  repoRoot: string;
  statePath: string;
  cliMode: string;
  readSiteName: (siteDir: string) => string;
  writeSiteName: (siteDir: string, rawName: unknown) => string;
  readPreviewVersion: (siteDir: string) => number | null;
  readPreviewDataUrl: (id: string) => string | null;
  deletePreview: (id: string) => void;
  adoptSiteDir: (input: AdoptSiteDirInput) => Promise<string>;
  addSitePointer: AddSitePointerLike;
  // Loosened to a plain `string`-returning classifier, matching `add-site-pointer.ts`'s own
  // `SiteDirClassifierFn` convention: every real value assigned here (`classifySiteDirSafely`, the
  // throwing `classifySiteDir`, or a test's `() => "empty"`) returns some subtype of `string`, and
  // this file only ever compares the result with `===` against specific literals. See
  // `rescanSites`'s own doc for the one place this looseness meets a narrower dependency type.
  classifySiteDir: (dir: string) => string;
  openSiteServer: (siteDir: string, ctx: unknown) => Promise<void>;
  recordSiteClosed: (registryPath: string, siteDir: string, options?: { pid?: number }) => void;
  readRegistry: (registryPath: string) => { sites: RegistryRow[] };
  isLiveServeRow: (row: RegistryRow) => boolean;
  siteScanRoots: string[];
  recentSiteDirs: () => string[];
  ctx: unknown;
}

export {
  SITE_IPC_CHANNELS,
  foreignServerMessage,
  buildSiteRecord,
  handleList,
  handleAddSite,
  handleCreate,
  handleDelete,
  handleOpenExternal,
  handleStart,
  handleRename,
  handleGetPreview,
  rescanSites,
  registerSiteIpcHandlers,
};
export type { ProjectIpcDeps, SiteRow, OpenSiteEntry, OpenSites, RegistryRow };
