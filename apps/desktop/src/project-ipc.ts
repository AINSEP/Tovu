/**
 * @file Real handlers for the ten `runner:sites:*` IPC verbs the Projects screen needs — see
 * `contracts/project.ts`'s `SITE_IPC_CHANNELS` for what each one is for. Registered in
 * `main.ts` BEFORE `registerRunnerIpcStubs` runs, so these channels are never also stubbed —
 * Electron's `ipcMain.handle` throws on a duplicate registration, which is the desired failure if
 * that ever regresses (see `runner-ipc-stubs.ts`'s own doc).
 *
 * `stop` is one of them as of the site card's own Start/Stop control ({@link handleStop}). Until
 * that control existed there was NO way to stop a site from inside the app at all: closing the app
 * (`before-quit`, `main.ts`) and deleting the project (`handleDelete` below) were the only two
 * paths, and an operator who wanted one site down had to find and kill its process from a terminal.
 *
 * The channel literals below are INLINED rather than imported from `contracts/project.ts`, same
 * reason `runner-ipc-stubs.ts` inlines its own: this is CommonJS main-process code and the
 * contracts are TypeScript with no compiled output guaranteed at runtime from a source checkout.
 * `project-ipc.test.ts` parses the contract source and fails if any literal here drifts from it.
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
  stop: "runner:sites:stop",
  rescan: "runner:sites:rescan",
  addSite: "runner:sites:add-site",
  rename: "runner:sites:rename",
  preview: "runner:sites:preview",
});

/**
 * A tracked-project row as {@link buildSiteRecord} and its siblings need it — loosened from
 * `tracked-sites.ts`'s own `TrackedSiteRow` (not exported) in exactly the two fields a caller here
 * can hand in without one: `origin` and `siteId` are optional, because {@link mayEraseSiteDirectory}
 * already treats an absent `origin` as "not created" (refuse) and {@link identityHasChanged} already
 * treats an absent `siteId` as "nothing recorded" — this type describes that existing tolerance
 * rather than inventing it. Deliberately no index signature, unlike `project-delete-guard.ts`'s own
 * `RowLike`: a real `TrackedSiteRow` (also no index signature) must flow into this type at every
 * real call site, and TypeScript does not consider a plain interface assignable to one that HAS an
 * index signature. See the `as MayEraseRowLike` casts where a `SiteRow` is handed to
 * {@link mayEraseSiteDirectory} instead.
 */
interface SiteRow {
  siteDir: string;
  createdAt: string;
  origin?: string;
  siteId?: string | null;
}

/** {@link mayEraseSiteDirectory}'s own (unexported) first-parameter type, extracted structurally
 *  rather than by name — see {@link SiteRow}'s own doc on why a `SiteRow` needs a cast to reach it. */
type MayEraseRowLike = Parameters<typeof mayEraseSiteDirectory>[0];

/** How a site's server exited. Mirrors `site-supervisor.ts`'s own `ServerExit` structurally rather
 *  than importing it — this file's `openSites` contract is a plain duck type on purpose (see
 *  {@link OpenSites}), never coupled to the concrete supervisor. */
interface ServerExitLike {
  code: number | null;
  signal: string | null;
}

/** One `openSites` entry. Every field is optional: a caller — this file's own tests included — only
 *  ever fills in what the handler under test actually reads. The real production shape
 *  (`main.ts`'s `openSiteServer`) always sets `server.port`/`pid`/`stop` and `window` only for an
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
 *  it is `site-supervisor.ts`'s supervisor, which adds {@link OpenSites.lastExitOf}. This file's own
 *  handlers only ever call `get`/`delete`, but `set`/`has` are part of the type because the
 *  documented "Map-compatible" contract is what callers (this file's own tests, and `main.ts`) build
 *  entries with before a handler ever sees them. */
interface OpenSites {
  get(siteDir: string): OpenSiteEntry | undefined;
  set(siteDir: string, entry: OpenSiteEntry): unknown;
  has(siteDir: string): boolean;
  delete(siteDir: string): boolean;
  lastExitOf?(siteDir: string): ServerExitLike | null;
}

/** `deps.transitions` — `site-transitions.ts`'s store, as the two readers here need it. Structural
 *  rather than an import of its own type, for the same reason {@link OpenSites} is a duck type:
 *  this file's handlers stay callable from plain `node --test` against a two-line fake. */
interface SiteTransitionsLike {
  get(siteDir: string): "starting" | "stopping" | null;
  during<T>(siteDir: string, transition: "starting" | "stopping", body: () => Promise<T>): Promise<T>;
}

/** A crash-safety registry row, as {@link liveForeignServers} needs it — mirrors
 *  `site-process-registry.ts`'s own `SiteProcessRow`, duplicated rather than imported for the same
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

/** `deps.serializer` — `keyed-serializer.ts`'s per-key promise chain, loosened from that file's own
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
 *  `site-dir-store.ts`'s own `AdoptSiteDirInput` (not exported) since this field arrives on `deps`,
 *  injected rather than imported, for the same testability reason as every other collaborator here. */
interface AdoptSiteDirInput {
  dir: string;
  repoRoot: string;
  statePath: string;
  name?: string;
  cliMode?: "source" | "compiled";
}

/** {@link handleAddSite}'s own `addSitePointer` shape — mirrors `add-site-pointer.ts`'s real
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
 * What to report as a site's `status` and `desiredState`, from the two facts that decide them: is
 * its `tovu serve` alive right now, and is a start or a stop in flight on it.
 *
 * Its own function because those two facts do not compose by precedence alone — a `stopping` site
 * IS still alive, and a `starting` one is NOT yet, so the transition has to win over `running` in
 * one direction and over `stopped` in the other. Inlined in {@link buildSiteRecord} that reads as
 * three nested ternaries whose ordering is load-bearing and invisible.
 *
 * `desiredState` follows the transition's INTENT rather than its current liveness: an operator
 * mid-stop wants this site down, which is the honest thing for a card to say while the drain runs.
 *
 * @complexity O(1).
 */
function siteLifecycle(running: boolean, transition: "starting" | "stopping" | null) {
  if (transition === "starting") return { status: "starting" as const, desiredState: "running" as const };
  if (transition === "stopping") return { status: "stopping" as const, desiredState: "stopped" as const };
  if (running) return { status: "running" as const, desiredState: "running" as const };
  return { status: "stopped" as const, desiredState: "stopped" as const };
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
function buildSiteRecord(row: SiteRow, deps: Pick<ProjectIpcDeps, "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions">) {
  const openEntry = deps.openSites.get(row.siteDir);
  const running = openEntry !== undefined;
  // `openSites` answers "is it alive", which is a two-valued answer to a four-valued question:
  // both transitions take real wall-clock time, and during either one the two-valued answer is
  // wrong in the direction the operator can SEE — a Start they just pressed reads `stopped` for the
  // whole boot, a Stop reads `running` until the child is gone, and both look like a dead button.
  // `site-transitions.ts` is what makes the other two answers producible; absent (every test that
  // is not exercising them) it reads `null` and nothing here changes.
  const lifecycle = siteLifecycle(running, deps.transitions?.get(row.siteDir) ?? null);
  return {
    id: row.siteDir,
    slug: path.basename(row.siteDir),
    displayName: deps.readSiteName(row.siteDir),
    installDir: row.siteDir,
    port: running ? openEntry.server.port : 0,
    // Independent of `running` — a project's partition is a pure function of its own directory
    // (`desktop-auth.ts`'s `sitePartition`), not of whether a server currently answers on it. The
    // embedded-tab renderer needs it either way: `SiteWorkspace`'s `<webview>` sets it up front,
    // before the tab knows whether the site is up yet.
    partition: sitePartition(row.siteDir),
    templateId: "tovu",
    templateVersion: null,
    database: { kind: "sqlite" },
    desiredState: lifecycle.desiredState,
    status: lifecycle.status,
    // Not always `null` any more: a site that DIED is `stopped` exactly like one that was never
    // started, and before `site-supervisor.ts` owned that transition the two were indistinguishable
    // to the renderer (D-06). This is the one place the difference can be told.
    //
    // Only for a settled `stopped`. Mid-transition the prior crash is not what the operator is
    // looking at — a card that says "Starting" and "the server exited (code 1)" in the same breath
    // is reporting two different moments as one.
    statusDetail: lifecycle.status === "stopped" ? describeLastExit(deps.openSites, row.siteDir) : null,
    createdAt: row.createdAt,
    updatedAt: row.createdAt,
    // Computed by the SAME function `handleDelete` obeys, never re-derived from `origin` in the
    // renderer — a UI that decided this for itself could drift from the rule main actually enforces
    // and label a button with a consequence that will not happen. See `project-delete-guard.ts`.
    deleteErasesFiles: mayEraseSiteDirectory(row as unknown as MayEraseRowLike, { repoRoot: deps.repoRoot }),
    // A version token, never the image — see `SiteRecord.previewVersion`'s own doc on why this
    // record (polled every 4s) must never carry a payload. `null` for a site with no capture yet,
    // which is every site's ordinary state until it has been opened once.
    previewVersion: deps.readPreviewVersion(row.siteDir),
  };
}

/** @complexity O(n) in the tracked-project count. */
function handleList(deps: Pick<ProjectIpcDeps, "projectsPath" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions">) {
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
  deps: Pick<ProjectIpcDeps, "dialog" | "classifySiteDir" | "adoptSiteDir" | "repoRoot" | "statePath" | "cliMode" | "projectsPath" | "openSites" | "readSiteName" | "readPreviewVersion" | "transitions">
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
  // see `project-delete-guard.ts`. `adoptSiteDir` refuses "occupied"/"incomplete" outright, so the
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
  // at a path, and a path is not an identity. See `project-delete-guard.ts`'s test 3.
  // `null` when the folder has no readable identity: the row is then recorded without one, the fail-closed direction.
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
 * `project-delete-guard.ts` can never let a later delete erase a folder this app did not make.
 *
 * @throws {Error} when the dialog is cancelled, or `AddSitePointerError` when the folder is not a
 *   complete Tovu site — either way an operator-facing message that names the fix.
 * @complexity O(n) in the tracked-project count, plus one classification.
 */
async function handleAddSite(deps: Pick<ProjectIpcDeps, "dialog" | "addSitePointer" | "projectsPath" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions">) {
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
 * The exact operator-facing refusal when a crash-safety registry file cannot be read, so whether a
 * second copy of this app has the site open is unknown.
 *
 * @complexity O(n) in unreadable path count.
 */
function unreadableRegistryMessage(unreadable: string[]): string {
  return `Could not read ${unreadable.join(", ")}, so Tovu cannot tell whether another copy of Tovu still has this site open. Nothing was deleted. Restart Tovu and try again.`;
}

/**
 * Crash-safety rows naming a LIVE `tovu serve` for `siteDir` that belongs to some process OTHER
 * than the one this instance is holding — i.e. a second copy of this app with the same site open.
 *
 * `openSites` cannot answer this: it is this process's own in-memory map, so a sibling instance's
 * child is invisible to it. The on-disk registry is the only thing that sees both, and it is
 * already written to see them — each instance records only into its own file there, so a sibling's
 * row survives this instance opening the same site.
 *
 * `isLiveServeRow` is the registry's own identity proof (pid alive AND its live argv still names
 * this site dir and port), so a pid the OS recycled to something unrelated can never make this
 * refuse. Stale rows therefore cannot wedge a delete.
 *
 * An UNREADABLE registry file throws instead: its rows are unknown, and reading it as "no rows" is
 * exactly how this guard used to wave an erase through a torn sibling file. It does not wedge for
 * long — the next boot moves a dead instance's unreadable file aside, and a live one's own next
 * write does the same (`site-process-registry.ts`'s `quarantineUnreadableFile`).
 *
 * @param ownPid this instance's own child's pid, excluded — its row is not foreign.
 * @complexity O(n) in registry rows, times one `ps` call per row matching `siteDir` (in practice
 *   zero or one).
 */
function liveForeignServers(deps: Pick<ProjectIpcDeps, "readRegistry" | "registryPath" | "isLiveServeRow">, siteDir: string, ownPid: number | undefined): RegistryRow[] {
  const registry = deps.readRegistry(deps.registryPath);
  if (registry.unreadable.length > 0) throw new Error(unreadableRegistryMessage(registry.unreadable));
  return registry.sites.filter((row) => row.siteDir === siteDir && row.pid !== ownPid && deps.isLiveServeRow(row));
}

/**
 * Stops the project if it is running, untracks it, and — ONLY for a directory this app itself
 * created — erases its install directory.
 *
 * That last word is load-bearing and is the whole reason this function consults
 * `project-delete-guard.ts` rather than calling `fs.rm` on whatever id arrives. A tracked row can
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
 * window's own `closed` listener (`main.ts`) still fires afterward and repeats the same two
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
  // of the app, and nothing prevents one — `main.ts` calls no `requestSingleInstanceLock`, and
  // `site-process-registry.ts` is written throughout on the premise that two instances can run at once.
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
    // By pid: `recordSiteOpened` can leave a still-draining earlier child's row for this same site dir,
    // and a close by site dir alone would drop that one too (D-07).
    deps.recordSiteClosed(deps.registryPath, id, { pid: openEntry.server.pid });
    // A sites-home-opened (embedded-tab) entry has no `window` at all — see `openSiteServer` in
    // `main.ts` — so this is optional, not a missing null check.
    if (openEntry.window && !openEntry.window.isDestroyed!()) openEntry.window.destroy!(); // present whenever `window` is (see `OpenSiteEntry.window`'s own doc: optional only for tests that never invoke it)
  }

  untrackSite(deps.projectsPath, id);
  // Unconditional — independent of `erasesFiles` below. A preview is this shell's own decoration,
  // not the operator's data, so a row that is merely REMOVED (adopted, files kept) still drops its
  // cached thumbnail: once the row is gone `buildSiteRecord` can never ask for it again
  // (`site-preview-store.ts`'s own doc on why an orphan is otherwise unreachable, not merely
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
 * (`tracked-sites.ts`) stamps `siteId` only on a `created` one. That is the deliberate fail-OPEN
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
 * **WHY THE GUARD IS NOT `isStillTheRecordedSite`.** That predicate (`project-delete-guard.ts`) is
 * the right identity test for DELETE and the wrong one here, and the difference is not a judgement
 * call — it returns `false` immediately unless `row.siteId` is a non-empty string, and
 * `buildTrackedRow` (`tracked-sites.ts`) stamps `siteId` ONLY on a `created` row. Every site the
 * operator adopted — "Add Tovu Website", a rescan, "Open Site…" — has no `siteId` and never will,
 * so gating rename on it would refuse rename on essentially every real site: a feature that fails
 * closed into uselessness.
 *
 * The asymmetry is in what each direction costs, which is exactly how `project-delete-guard.ts`'s
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
 *   (`site-config.ts`'s own 1..200-after-trim check, which mirrors what `tovu serve` re-applies at
 *   every boot).
 * @complexity O(n) in the tracked-site count, for the row lookup.
 */
function handleRename(input: RenameSiteInput, deps: Pick<ProjectIpcDeps, "projectsPath" | "classifySiteDir" | "writeSiteName" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions">) {
  const id = input?.id;
  const row = readTrackedSites(deps.projectsPath).find((tracked) => tracked.siteDir === id);
  if (row === undefined) {
    throw new Error(`This app is not tracking a site at ${id}, so there is nothing to rename.`);
  }

  // The SAFE classifier (`deps.classifySiteDir` is `classifySiteDirSafely` — see `main.ts`), so an
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
  // (`main.ts`'s `openSiteWindow`). Worth the line anyway — `readSiteName`'s own doc says that
  // title is "what makes Electron's native Window menu double as a site switcher (distinct titles,
  // distinct entries)", so a stale one is a stale CONTROL, not a stale label.
  //
  // "Open Recent" itself needs no refresh: `main.ts` builds those items with the directory path as
  // the label, not the site name, so a rename cannot stale them.
  const openWindow = deps.openSites.get(row.siteDir)?.window;
  if (openWindow && !openWindow.isDestroyed!()) openWindow.setTitle!(name); // present whenever `window` is (see `OpenSiteEntry.window`'s own doc)

  return buildSiteRecord(row, deps);
}

/**
 * Hands one of a running project's surfaces to the operator's default browser. Refuses a project
 * that is not currently open rather than guessing a port — nothing durable records a stopped
 * project's last-known port today (see `tracked-sites.ts`'s header on why status is derived,
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
 * `buildSiteRecord`'s `previewVersion` field — see that field's own doc, and `site-preview-store.ts`'s
 * header, on why the polled record and the actual bytes are deliberately two different round trips.
 *
 * No tracked-row check, unlike every other handler here: `id` only ever reaches this as an input to
 * a digest (`site-preview-store.ts`'s `previewPath`), never as a filesystem path this function opens
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
 * Reuses `openSiteServer` — `main.ts`'s spawn-only counterpart to the `openSiteWindow` "Open
 * Site…"/"Open Recent"/startup already use — through `serializer.run`, so opening the same tab twice
 * fast cannot double-spawn its server (see `main.ts`'s own doc on `openSiteServer`/
 * `keyed-serializer.ts`).
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
 * The boot is marked `starting` for its whole duration (`site-transitions.ts`) — seconds, during
 * which `openSites` still says "not running" and a card left to that alone shows the operator a
 * Start button that appears to have done nothing. The mark is released before the record below is
 * built, so what this RESOLVES with is the settled answer, never `starting`.
 *
 * @throws {Error} when `id` names a project this shell is not tracking — a stale id from a renderer
 *   that has not yet re-polled past a delete, refused rather than opening an arbitrary path.
 * @complexity O(1) beyond `openSiteServer`'s own cost, plus however long an already-queued
 *   operation on the same site takes to settle.
 */
async function handleStart<TCtx>(id: string, deps: Pick<ProjectIpcDeps<TCtx>, "serializer" | "projectsPath" | "openSiteServer" | "ctx" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions">) {
  return await deps.serializer.run(id, async () => {
    const row = readTrackedSites(deps.projectsPath).find((entry) => entry.siteDir === id);
    if (row === undefined) {
      throw new Error(`Unknown project: ${id}`);
    }
    await markTransition(deps.transitions, id, "starting", () => deps.openSiteServer(id, deps.ctx));
    return buildSiteRecord(row, deps);
  });
}

/**
 * Take one site's `tovu serve` down — the card's Stop, and the first way this app has ever had to
 * stop a single site from inside itself. Before it, `before-quit` (every site at once) and
 * `handleDelete` (the project is going away) were the only two, so an operator who wanted one site
 * down had to kill its process from a terminal.
 *
 * **Drains rather than kills.** `server.stop()` is `tovu-server.ts`'s `stopChild`: SIGTERM to the
 * child, which runs `serve.ts`'s own BR-07 shutdown — stop accepting, finish in-flight requests,
 * stop the agent daemon, close the sqlite handle — with a SIGKILL of the process GROUP only as the
 * 5 s escalation. That is the same call `before-quit` and `handleDelete` make; nothing here is a
 * shortcut past it, and nothing is left orphaned: `stopChild` resolves only once the child is
 * really gone.
 *
 * **The entry is dropped BEFORE the stop is awaited, deliberately** — the window-`closed` path in
 * `main.ts` does the identical thing for the identical reason. `site-supervisor.ts` watches each
 * entry's child and reports an exit it did not expect through `onUnexpectedExit`, which logs a
 * crash and records a `lastExitOf` the card then shows as "the site's server was stopped by
 * SIGTERM". For a stop the operator ASKED for, that is a lie in the one place they can read it.
 * Removing the entry first is what makes the supervisor's own identity check see this exit as no
 * longer its business. `stopChild` cannot reject (every path resolves), so there is no arm where
 * this forgets a site whose child is still alive.
 *
 * The crash-safety row is dropped only AFTER the stop, never before: it exists so the NEXT launch
 * can reap a child this process left running, so it has to outlive the child. Dropping it up front
 * would mean a hard kill of the app mid-drain left a `tovu serve` that `reconcileOrphans` could
 * never find — the exact bug the window-`closed` path's own comment records.
 *
 * Stopping a site nobody started is a no-op that still returns its record, not an error: the
 * renderer polls every 4 s, so a card can be a click behind main's truth through no fault of the
 * operator's, and refusing would surface an error for a state they already wanted.
 *
 * @returns the project's fresh record, so the card settles on `stopped` without waiting for a poll.
 * @throws {Error} when `id` names a project this shell is not tracking — same refusal, and same
 *   reason, as {@link handleStart}'s.
 * @complexity O(1) beyond `server.stop()`'s own drain (bounded by its 5 s grace), plus however long
 *   an already-queued operation on the same site takes to settle.
 */
async function handleStop(id: string, deps: Pick<ProjectIpcDeps, "serializer" | "projectsPath" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "registryPath" | "recordSiteClosed" | "transitions">) {
  return await deps.serializer.run(id, async () => {
    const row = readTrackedSites(deps.projectsPath).find((entry) => entry.siteDir === id);
    if (row === undefined) {
      throw new Error(`Unknown project: ${id}`);
    }
    await markTransition(deps.transitions, id, "stopping", () => stopSiteServer(id, deps));
    return buildSiteRecord(row, deps);
  });
}

/**
 * {@link handleStop}'s side effect, split out so the handler above reads as its three steps — find
 * the row, stop the server, report the result — rather than interleaving the drain's own ordering
 * rules with them. Assumes it holds this site's serializer key.
 *
 * @complexity see {@link handleStop}.
 */
async function stopSiteServer(id: string, deps: Pick<ProjectIpcDeps, "openSites" | "registryPath" | "recordSiteClosed">): Promise<void> {
  const openEntry = deps.openSites.get(id);
  if (openEntry === undefined) return;
  deps.openSites.delete(id);
  await openEntry.server.stop!(); // an entry with no `.stop` never reaches this line in practice — see `OpenSiteEntry.server.stop`'s own note in `deleteProject`
  // By pid, never by site dir alone: a live SIBLING app instance can hold its own row for this same
  // site, and a close by site dir would take that one too (D-07).
  deps.recordSiteClosed(deps.registryPath, id, { pid: openEntry.server.pid });
}

/**
 * Run `body` with `siteDir` marked as mid-`transition`, when a transitions store was wired in.
 *
 * The optional half is what the two handlers would otherwise each repeat: `deps.transitions` is
 * absent in every test that is not exercising transition status, and a handler that had to
 * null-check it inline would state the boot/drain's own logic twice.
 *
 * @complexity O(1) beyond `body`'s own cost.
 */
function markTransition<T>(
  transitions: SiteTransitionsLike | undefined,
  siteDir: string,
  transition: "starting" | "stopping",
  body: () => Promise<T>,
): Promise<T> {
  return transitions === undefined ? body() : transitions.during(siteDir, transition, body);
}

/**
 * Find every Tovu site on disk the operator has no stored answer about, track it, and return the
 * whole refreshed list.
 *
 * This is the fix for the Projects screen having no discovery at all: {@link handleList} renders
 * `desktop-projects.json` and nothing else — no scan, no rescan, no fallback — so a site created by
 * `tovu init` outside the shell, or restored from a backup, was invisible forever no matter how
 * plainly it sat on disk. Runs once at boot (`main.ts`) and again whenever the operator asks.
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
 * @param deps.recentSiteDirs `site-dir-store.ts`'s recently-opened list, as a thunk — the sites
 *   own-server mode has been recording all along, which are the operator's by definition and
 *   generally do not live under any scan root.
 * @returns the same records {@link handleList} would return, after the pass.
 * @complexity O(n) in the scanned child count, times the registry size.
 */
function rescanSites(deps: Pick<ProjectIpcDeps, "siteScanRoots" | "recentSiteDirs" | "classifySiteDir" | "projectsPath" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions">) {
  const found = discoverSiteDirs({
    scanRoots: deps.siteScanRoots,
    knownDirs: deps.recentSiteDirs(),
    classifySiteDir: deps.classifySiteDir,
  });
  adoptDiscoveredSites(deps.projectsPath, found);
  return handleList(deps);
}

/**
 * Registers the ten real `runner:sites:*` handlers above.
 *
 * @param deps
 * @param deps.openSites live open sites, keyed by site dir — `main.ts`'s own module-level
 *   store, passed in rather than imported. `Map`-compatible; in production it is
 *   `site-supervisor.ts`'s supervisor, which additionally drops an entry whose child has died and
 *   answers `lastExitOf` about it. A sites-home-opened (embedded-tab) entry carries no `window`; only
 *   own-server-mode entries do.
 * @param deps.serializer per-site-dir operation serializer (`keyed-serializer.ts`).
 * @param deps.projectsPath `tracked-sites.ts`'s tracked-project JSON file.
 * @param deps.registryPath crash-safety registry directory (`site-process-registry.ts`), for
 *   `recordSiteClosed` on a delete of a running project and `readRegistry` in its guard.
 * @param deps.repoRoot Tovu repo root.
 * @param deps.statePath `site-dir-store.ts`'s MRU file, for `adoptSiteDir`.
 * @param deps.cliMode `"source"` or `"compiled"` — see `tovu-server.ts`.
 * @param deps.readSiteName `main.ts`'s site-display-name reader.
 * @param deps.writeSiteName `site-config.ts`'s validating, atomic `config.json` name
 *   writer, used by {@link handleRename}. Injected rather than imported for the same reason
 *   `adoptSiteDir` is — every handler in this file stays callable from plain `node --test` against
 *   fakes, and a rename test must never write into a real site directory.
 * @param deps.readPreviewVersion `site-preview-store.ts`'s reader, bound to this launch's
 *   userData at the same call site every other consumer resolves it from — feeds
 *   `buildSiteRecord`'s `previewVersion` field.
 * @param deps.readPreviewDataUrl `site-preview-store.ts`'s reader, bound the same way —
 *   {@link handleGetPreview}'s on-demand fetch.
 * @param deps.deletePreview `site-preview-store.ts`'s remover, bound the same way —
 *   called beside `untrackSite` in {@link deleteProject}.
 * @param deps.adoptSiteDir `site-dir-store.ts`'s folder-to-site-dir classifier/initializer.
 * @param deps.addSitePointer `add-site-pointer.ts`'s pointer-only adder, used by
 *   {@link handleAddSite}. Injected rather than imported for the same reason `adoptSiteDir` is —
 *   every handler in this file stays callable from plain `node --test` against fakes.
 * @param deps.classifySiteDir `site-dir-store.ts`'s classifier, called by `handleCreate`
 *   BEFORE `adoptSiteDir` to record whether this app is about to create the directory or is adopting
 *   one that already exists — see `handleCreate`'s own comment and `project-delete-guard.ts`.
 * @param deps.openSiteServer `main.ts`'s spawn-or-reuse-a-site's-backend function
 *   (no `BrowserWindow` — see that function's own doc).
 * @param deps.recordSiteClosed `site-process-registry.ts`'s crash-safety row remover.
 * @param deps.readRegistry `site-process-registry.ts`'s crash-safety registry reader, used by
 *   {@link liveForeignServers} to see a SIBLING app instance's open sites — which `openSites`, being
 *   this process's own memory, cannot.
 * @param deps.isLiveServeRow `site-process-registry.ts`'s "is this row's pid still its own live
 *   `tovu serve`" identity proof, so a stale or recycled pid can never block a delete.
 * @param deps.ctx `{cliMode, registryPath}` — `openSiteServer`'s own second argument.
 * @complexity O(1) — ten registrations.
 */
function registerSiteIpcHandlers<TCtx>(deps: ProjectIpcDeps<TCtx>): void {
  deps.ipcMain.handle(SITE_IPC_CHANNELS.list, () => handleList(deps));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.create, (_event, input) => handleCreate(input, deps));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.delete, (_event, id) => handleDelete(id, deps));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.openExternal, (_event, input) => handleOpenExternal(input, deps));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.start, (_event, id) => handleStart(id, deps));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.stop, (_event, id) => handleStop(id, deps));
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
interface ProjectIpcDeps<TCtx = unknown> {
  ipcMain: IpcMainLike;
  dialog: DialogLike;
  shell: ShellLike;
  openSites: OpenSites;
  serializer: Serializer;
  projectsPath: string;
  registryPath: string;
  repoRoot: string;
  statePath: string;
  cliMode: "source" | "compiled";
  readSiteName: (siteDir: string) => string;
  writeSiteName: (siteDir: string, rawName: unknown) => string;
  readPreviewVersion: (siteDir: string) => number | null;
  readPreviewDataUrl: (id: string) => string | null;
  deletePreview: (id: string) => void;
  adoptSiteDir: (input: AdoptSiteDirInput) => Promise<string>;
  addSitePointer: AddSitePointerLike;
  // `classifySiteDirSafely`'s verdicts, spelled out because `site-dir-store.ts` does not export its
  // `SiteClassification`. The throwing `classifySiteDir` and the tests' fakes return a subset.
  classifySiteDir: (dir: string) => "site" | "incomplete" | "empty" | "occupied" | "unreadable";
  openSiteServer: (siteDir: string, ctx: TCtx) => Promise<unknown>;
  /**
   * `site-transitions.ts`'s store — which sites are mid-start or mid-stop right now, the fact
   * `openSites` cannot express. `main.ts` wires the real one (`main-project-wiring.test.ts` holds
   * it there); `buildSiteRecord` and the two lifecycle handlers are its only readers.
   *
   * Optional so every existing test bag stays valid: a handler asked to build a record without one
   * reports the same two-valued `running`/`stopped` it always did, which is exactly right for a
   * test that is not exercising a transition.
   */
  transitions?: SiteTransitionsLike;
  recordSiteClosed: (registryPath: string, siteDir: string, options?: { pid?: number }) => void;
  readRegistry: (registryPath: string) => { sites: RegistryRow[]; unreadable: string[] };
  isLiveServeRow: (row: RegistryRow) => boolean;
  siteScanRoots: string[];
  recentSiteDirs: () => string[];
  ctx: TCtx;
}

export {
  SITE_IPC_CHANNELS,
  foreignServerMessage,
  unreadableRegistryMessage,
  buildSiteRecord,
  handleList,
  handleAddSite,
  handleCreate,
  handleDelete,
  handleOpenExternal,
  handleStart,
  handleStop,
  handleRename,
  handleGetPreview,
  rescanSites,
  registerSiteIpcHandlers,
};
export type { ProjectIpcDeps, SiteRow, OpenSiteEntry, OpenSites, RegistryRow, SiteTransitionsLike };
