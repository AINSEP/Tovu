import { withFileLock as withDirectoryFileLock } from "@jini-ai/platform/fs";
import { createSitesWorkspace, shareSiteDirectories, type SitesWorkspace } from "./shared-sites.ts";
import { ensureIndependentSiteIdentity, type SiteIdentityOptions } from "./site-directory-identity.ts";
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
import { createRespawnPolicy } from "@jini-ai/sidecar/respawn-policy";
import { redactSecrets } from "@jini-ai/core";
import { SITE_SLEEP_EXIT_CODE } from "../../website/src/assistant/daemon-exit-codes.ts";
import { readIdleSiteSleepMinutes } from "./site-view-preference.ts";
import type { ResourcesSnapshot } from "./contracts/resources.ts";
import fs from "node:fs";
import { classifySiteDirSafely } from "./site-dir-store.ts";
import path from "node:path";
import os from "node:os";
import fsp from "node:fs/promises";
import { removeSiteTree } from "./remove-site-tree.ts";
import { uniqueSiteName, duplicateSiteNameError } from "./site-name-policy.ts";
import { siteNameError } from "./contracts/site-name.ts";
import type { SiteFoldersPort } from "./site-folders.ts";
import type { SiteArchiveSource } from "./site-archive-import.ts";
import type { SiteRecord } from "./contracts/project.ts";
import type { ExternalSiteStopper } from "./external-site-stop.ts";
import { registerIdleSiteSleepIpc } from "./site-view-preference.ts";

import { SITE_ORIGIN, readProjectsFile, readTrackedSites, trackSite, untrackSite, discoverSiteDirs, adoptDiscoveredSites, updateProjectsFile } from "./tracked-sites.ts";
import { mayEraseSiteDirectory, readSiteIdentity } from "./project-delete-guard.ts";
import { sitePartition } from "./desktop-auth.ts";
import { createRelocationGate, relocateMovedSites, repointTrackedSite, type RelocationGate } from "./site-relocation.ts";
import { assertTokensCanReachFolder, cleanCreateTokens, initTokenOptions, listTokenSignInPlugins as listTokenSignInPluginsReal, withCreatedTokens, type TokenSignInPlugin } from "./agent-plugin-tokens.ts";

const SITE_IPC_CHANNELS = Object.freeze({
  list: "runner:sites:list",
  create: "runner:sites:create",
  planNewDir: "runner:sites:plan-new-dir",
  delete: "runner:sites:delete",
  openExternal: "runner:sites:open-external",
  start: "runner:sites:start",
  stop: "runner:sites:stop",
  keepRunning: "runner:sites:keep-running",
  rescan: "runner:sites:rescan",
  listFolders: "runner:sites:folders:list",
  addFolder: "runner:sites:folders:add",
  removeFolder: "runner:sites:folders:remove",
  setHome: "runner:sites:home:set",
  saveSettings: "runner:sites:settings:save",
  addSite: "runner:sites:add-site",
  importArchive: "runner:sites:import-archive",
  rename: "runner:sites:rename",
  preview: "runner:sites:preview",
  locate: "runner:sites:locate",
  tokenSignInPlugins: "runner:sites:token-sign-in-plugins",
});
const SITE_PRESENCE_CHANNEL = "runner:sites:presence";

interface PresenceSender {
  isDestroyed(): boolean;
  once(name: 'destroyed' | 'render-process-gone', listener: () => void): unknown;
  removeListener(name: 'destroyed' | 'render-process-gone', listener: () => void): unknown;
}

/** The maintenance owner can query presence without learning about renderer senders. */
export interface SitePresence<Sender extends PresenceSender = PresenceSender> {
  replace(input: { sender: Sender; siteIds: unknown }, options?: {}): void;
  has(input: { siteId: string }, options?: {}): boolean;
  dispose(): void;
}

/** Retain complete lists per shell, never per loaded guest. Invalid updates reject atomically.
 * Sender loss removes only that sender's claim, so another window can keep the same site present.
 * @returns Replace/query/dispose operations; each sender owns one pair of cleanup listeners.
 * @complexity Replacement O(t + n), where t is tracked sites and n is reported ids; lookup O(s)
 * for s shells. Stored claims are bounded by tracked sites per live sender. No per-id I/O.
 */
export function createSitePresence<Sender extends PresenceSender>(
  { allowed, trackedIds }: { allowed: (sender: Sender) => boolean; trackedIds: () => ReadonlySet<string> },
  { hasSiteWindow = () => false, onRelease = () => {} }: { hasSiteWindow?: (siteId: string) => boolean; onRelease?: () => void } = {},
): SitePresence<Sender> {
  const owners = new Map<Sender, { siteIds: Set<string>; release: () => void }>();
  const release = (sender: Sender) => {
    const owner = owners.get(sender);
    if (!owner) return;
    onRelease();
    owners.delete(sender);
    sender.removeListener('destroyed', owner.release);
    sender.removeListener('render-process-gone', owner.release);
  };
  const replace = ({ sender, siteIds }: { sender: Sender; siteIds: unknown }) => {
    if (sender.isDestroyed() || !allowed(sender)) throw new Error('UNTRUSTED_SITE_PRESENCE_SENDER');
    const tracked = trackedIds();
    if (!Array.isArray(siteIds) || !siteIds.every(id => typeof id === 'string' && tracked.has(id))) throw new Error('INVALID_SITE_PRESENCE');
    const ids = new Set<string>(siteIds);
    const owner = owners.get(sender);
    if (owner) { owner.siteIds = ids; return; }
    const created = { siteIds: ids, release: () => release(sender) };
    owners.set(sender, created);
    sender.once('destroyed', created.release);
    sender.once('render-process-gone', created.release);
  };
  return {
    replace,
    has: ({ siteId }) => hasSiteWindow(siteId) || [...owners.values()].some(owner => owner.siteIds.has(siteId)),
    dispose: () => { for (const sender of owners.keys()) release(sender); },
  };
}

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
  displayName?: string;
  displayNameAlias?: string;
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
    external?: boolean;
    pid?: number;
    origin?: string;
    stop?: () => Promise<unknown>;
    onExit?: (listener: (exit: ServerExitLike) => void) => void;
    stopIfIdle?: (required?: {}, optional?: {}) => Promise<boolean>;
    outputTail?: (required?: {}, optional?: {}) => string;
  };
  window?: {
    isDestroyed?: () => boolean;
    destroy?: () => void;
    setTitle?: (title: string) => void;
  };
}

/** Per directory retry policy survives readiness. Only manual Start resets its rolling window. */
interface SiteRuntime {
  policy: ReturnType<typeof createRespawnPolicy>;
  failures: number;
  cancelled: boolean;
  cancelRetry?: () => void;
  starting?: Promise<unknown>;
  status?: "starting" | "sleeping" | "failed";
  detail?: string;
  lastPresentAt: number;
  keepAwake?: boolean;
  rss?: { pid: number; since: number };
  restartAfterExit?: OpenSiteEntry["server"];
}

interface SiteLifecycleOptions {
  now?: () => number;
  schedule?: (input: { delayMs: number; run: () => void }) => () => void;
  sleepMinutes?: () => number;
}

export interface ProjectSiteLifecycle extends SitePresence<PresenceSender & { getURL(): string }> {
  onServerExit(input: { siteDir: string; exit: ServerExitLike; server: OpenSiteEntry["server"] }, options?: {}): void;
  maintain(input: { snapshot: ResourcesSnapshot }, options?: {}): Promise<void>;
  /** Keep running in background: no idle sleep until this launch ends. Memory restarts still run. */
  keepAwake(): void;
  manualStart(input: { siteDir: string }, options?: {}): void;
  cancel(input: { siteDir: string; forget?: boolean }, options?: {}): void;
  onBootFailure(input: { siteDir: string; error: unknown }, options?: {}): void;
}

/** Retry timers are independent of the one fleet maintenance tick, and never keep Quit alive. */
function scheduleSiteRetry({ delayMs, run }: { delayMs: number; run: () => void }, _options = {}): () => void {
  const timer = setTimeout(run, delayMs);
  timer.unref();
  return () => clearTimeout(timer);
}

/** Invalid samples cannot extend a high-RSS observation. */
function isHighSiteRss({ rssBytes }: { rssBytes: number | undefined }): boolean {
  return typeof rssBytes === "number" && Number.isFinite(rssBytes) && rssBytes >= 1_500_000_000;
}

/** Use only the owned root's current OS RSS, independent of the cached footprint display. Totals include grandchildren and cannot enforce this cap.
 * @complexity O(p) for the snapshot's p processes; O(1) retained observation per site.
 */
function siteRssOverTime({ state, server, snapshot, siteDir, at }: {
  state: SiteRuntime; server: OpenSiteEntry["server"]; snapshot: ResourcesSnapshot; siteDir: string; at: number;
}, _options = {}): boolean {
  const root = currentSiteRss({ snapshot, siteDir, pid: server.pid, at });
  const rssBytes = root?.rawRssBytes ?? root?.rssBytes;
  if (!root || !isHighSiteRss({ rssBytes })) {
    state.rss = undefined;
    return false;
  }
  if (state.rss?.pid !== root.pid) state.rss = { pid: root.pid, since: snapshot.sampledAt };
  return snapshot.sampledAt - state.rss.since >= 120_000;
}

/** Cached or failed reads must not extend an RSS observation, nor can another boot's PID. */
function currentSiteRss({ snapshot, siteDir, pid, at }: {
  snapshot: ResourcesSnapshot; siteDir: string; pid: number | undefined; at: number;
}, _options = {}) {
  if (snapshot.status !== "available" || snapshot.sampledAt > at || at - snapshot.sampledAt > 30_000) return;
  return snapshot.sites.find(site => site.siteId === siteDir)?.processes
    .find(row => row.pid === pid && row.role === "site-server");
}

/** Final error is selectable plain text. Redact again at this IPC boundary and retain only a tail. */
function siteFailureDetails({ exit, server, error }: {
  exit?: ServerExitLike; server?: OpenSiteEntry["server"]; error?: unknown;
}, _options = {}): string {
  const reason = exit ? `Exit code: ${exit.code ?? "none"}; signal: ${exit.signal ?? "none"}.` : String(error instanceof Error ? error.message : error);
  return redactSecrets({ input: `${reason}\n${server?.outputTail?.({}, {}) ?? ""}` }, { redactPii: false }).slice(-16_384);
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
  message?: string;
  buttonLabel: string;
  properties: Array<"openDirectory" | "createDirectory" | "openFile">;
  filters?: Array<{ name: string; extensions: string[] }>;
}

/** Electron's `dialog.showOpenDialog` resolution — the subset read here. */
interface OpenDialogResult {
  canceled: boolean;
  filePaths: string[];
}

/** `deps.dialog` — injected so existing-folder/settings handlers are testable without a real native
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
  handle(channel: string, listener: (event: any, ...args: any[]) => any): void; // Mirrors Electron's own ipcMain.handle signature.
  removeHandler?(channel: string): void;
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
  adminPassword?: string;
  database?: { kind: string };
  /** Optional "Connect services" tokens, `{ [pluginId]: token }` — see `agent-plugin-tokens.ts`. */
  agentPluginTokens?: unknown;
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
  adminPassword?: string;
  cliMode?: "source" | "compiled";
  agentPluginTokens?: Readonly<Record<string, string>>;
  onInitOutput?: (output: string) => void;
}

/** {@link handleAddSite}'s own `addSitePointer` shape — mirrors `add-site-pointer.ts`'s real
 *  `addSitePointer`, duplicated rather than imported for the same reason as {@link AdoptSiteDirInput}. */
interface AddSitePointerLike {
  (input: { siteDir: string; projectsPath: string }, options?: SiteIdentityOptions): { siteDir: string; alreadyTracked: boolean; alreadyDismissed: boolean };
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

/** Retry/sleep/error details apply only after liveness and explicit transitions have settled. */
function siteRecordPresentation({ lifecycle, sharedRunning, siteDir, deps }: {
  lifecycle: ReturnType<typeof siteLifecycle>; sharedRunning: SharedRunning; siteDir: string; deps: SiteRecordDeps;
}, _options = {}) {
  const runtime = deps.siteRuntime?.get(siteDir);
  if (lifecycle.status === "stopped" && runtime?.status) return { status: runtime.status,
    desiredState: runtime.status === "starting" ? "running" as const : "stopped" as const, detail: runtime.detail ?? null };
  return { ...lifecycle, detail: siteStatusDetail(sharedRunning, lifecycle.status, deps.openSites, siteDir) };
}

type SiteRecordDeps = Pick<ProjectIpcDeps, "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions" | "sharedSites" | "siteRuntime"> & Partial<Pick<ProjectIpcDeps, "classifySiteDir" | "externalSites">>;
type SharedRunning = ReturnType<ReturnType<SitesWorkspace["running"]>["read"]> | undefined;

/** The admin URL of a server this window does not own: an external one it attached to, or the other app's. */
function siteExternalUrl(openEntry: OpenSiteEntry | undefined, sharedRunning: SharedRunning, status: string): string | undefined {
  // The lease stays live during drain. Advertising it here makes a mounted tab queue Start
  // behind this Stop through its external-workspace attachment effect.
  if (status === "stopping") return undefined;
  if (openEntry) return openEntry.server.external ? `${openEntry.server.origin}/admin/` : undefined;
  return sharedRunning && sharedRunning.port > 0 ? `${sharedRunning.scheme}://localhost:${sharedRunning.port}/admin/` : undefined;
}

/** Which app runs the site, or the last exit of a settled stop; see the `statusDetail` field below. */
function siteStatusDetail(sharedRunning: SharedRunning, status: string, openSites: OpenSites, siteDir: string): string | null {
  if (sharedRunning) {
    const detail = sharedRunning.port > 0 ? `port ${sharedRunning.port}` : "starting";
    return `Running in ${sharedRunning.app} (${detail})`;
  }
  return status === "stopped" ? describeLastExit(openSites, siteDir) : null;
}

/**
 * Only for a site this window can stop although another process serves it; absent, the card
 * offers no Stop for it at all. See `external-site-stop.ts`.
 */
function siteExternalLauncher(externalUrl: string | undefined, sharedRunning: SharedRunning, externalSites: SiteRecordDeps["externalSites"]) {
  return externalUrl && sharedRunning ? externalSites?.launcherOf({ lease: sharedRunning }) ?? undefined : undefined;
}

/** The card name: an alias, the config's name, or (config gone) the last known name. */
function siteDisplayName(row: SiteRow, validSite: boolean, readSiteName: (siteDir: string) => string): string {
  return row.displayNameAlias ?? (validSite ? readSiteName(row.siteDir) : row.displayName ?? path.basename(row.siteDir));
}

/** Join local liveness and shared-lease startup with the explicit transition's intent. O(1). */
export function siteRecordLifecycle(
  { siteDir, openEntry, sharedRunning, transitions }: { siteDir: string; openEntry: OpenSiteEntry | undefined; sharedRunning: SharedRunning; transitions: SiteRecordDeps["transitions"] }, _options = {},
): { sharedPort: number; lifecycle: ReturnType<typeof siteLifecycle> } {
  const sharedPort = sharedRunning?.port ?? 0;
  const running = openEntry !== undefined || sharedPort > 0;
  // `openSites` answers "is it alive", which is a two-valued answer to a four-valued question:
  // both transitions take real wall-clock time, and during either one the two-valued answer is
  // wrong in the direction the operator can SEE — a Start they just pressed reads `stopped` for the
  // whole boot, a Stop reads `running` until the child is gone, and both look like a dead button.
  // `site-transitions.ts` is what makes the other two answers producible; absent (every test that
  // is not exercising them) it reads `null` and nothing here changes.
  const sharedStarting = sharedRunning && !sharedPort ? "starting" : null;
  const lifecycle = siteLifecycle(running, transitions?.get(siteDir) ?? sharedStarting);
  return { sharedPort, lifecycle };
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
function buildSiteRecord(row: SiteRow, deps: SiteRecordDeps) {
  const validSite = (deps.classifySiteDir ?? classifySiteDirSafely)(row.siteDir) === "site";
  const openEntry = deps.openSites.get(row.siteDir);
  const sharedRunning: SharedRunning = deps.sharedSites?.running({ path: row.siteDir }).read({});
  const { sharedPort, lifecycle } = siteRecordLifecycle({ siteDir: row.siteDir, openEntry, sharedRunning, transitions: deps.transitions });
  const presentation = siteRecordPresentation({ lifecycle, sharedRunning, siteDir: row.siteDir, deps });
  const externalUrl = siteExternalUrl(openEntry, sharedRunning, presentation.status);
  return {
    id: row.siteDir,
    slug: path.basename(row.siteDir),
    // The config may be gone even when a themes-only folder remains; keep the last known name.
    displayName: siteDisplayName(row, validSite, deps.readSiteName),
    installDir: row.siteDir,
    port: openEntry?.server.port ?? sharedPort,
    runningApp: sharedRunning?.app,
    externalUrl,
    externalLauncher: siteExternalLauncher(externalUrl, sharedRunning, deps.externalSites),
    // Independent of `running` — a project's partition is a pure function of its own directory
    // (`desktop-auth.ts`'s `sitePartition`), not of whether a server currently answers on it. The
    // embedded-tab renderer needs it either way: `SiteWorkspace`'s `<webview>` sets it up front,
    // before the tab knows whether the site is up yet.
    partition: sitePartition(row.siteDir),
    templateId: "tovu",
    templateVersion: null,
    database: { kind: "sqlite" as const },
    desiredState: presentation.desiredState,
    status: presentation.status,
    // Not always `null` any more: a site that DIED is `stopped` exactly like one that was never
    // started, and before `site-supervisor.ts` owned that transition the two were indistinguishable
    // to the renderer (D-06). This is the one place the difference can be told.
    //
    // Only for a settled `stopped`. Mid-transition the prior crash is not what the operator is
    // looking at — a card that says "Starting" and "the server exited (code 1)" in the same breath
    // is reporting two different moments as one.
    statusDetail: presentation.detail,
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
    // Asked of the disk on every poll, never stored: a folder renamed or deleted behind the app's
    // back is exactly the case a stored flag would get wrong. Admission also rejects a leftover
    // themes-only/corrupt directory — the same Locate / Remove recovery applies to it.
    folderMissing: !validSite,
  };
}

/** Import catalog discovery without transferring local origin or deletion authority. O(n) rows. */
export function importSharedSiteDiscovery(
  { projectsPath, sharedSites, readSiteName }: Pick<ProjectIpcDeps, "projectsPath" | "sharedSites" | "readSiteName">, _options = {},
): void {
  if (!sharedSites) return;
  try {
    // The shared catalog supplies discovery, never the local origin/deletion authority.
    const rows = readTrackedSites(projectsPath);
    if (rows.length) shareSiteDirectories({ workspace: sharedSites, dirs: rows.map((row) => row.siteDir), createdBy: "desktop-legacy", migration: `projects:${projectsPath}` });
    adoptWithUniqueNames({ deps: { projectsPath, readSiteName }, siteDirs: sharedSites.registry({}).list({}).map((entry) => entry.path) });
  } catch { console.warn("tovu desktop: shared discovery is unavailable; showing local website cards."); }
}

/**
 * Every tracked project's record, after healing any whose folder was renamed or moved
 * (`site-relocation.ts`). The heal is best-effort: a list that cannot be SAVED still has to render,
 * so a failed write is logged and the rows are shown as they stand.
 *
 * With `relocationGate` (production: {@link registerSiteIpcHandlers}), the heal runs only when the
 * gate says something could have moved, so a 4 s poll over a missing folder does not rescan its
 * siblings every time. Without one, it runs on every call.
 *
 * @complexity O(n) in the tracked-project count, plus `relocateMovedSites`' scan for a missing row.
 */
function handleList(
  deps: Pick<ProjectIpcDeps, "projectsPath" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions" | "sharedSites" | "siteRuntime"> &
    Partial<Pick<ProjectIpcDeps, "siteScanRoots" | "siteFolders" | "classifySiteDir" | "externalSites">> & { relocationGate?: RelocationGate },
) {
  importSharedSiteDiscovery({ projectsPath: deps.projectsPath, sharedSites: deps.sharedSites, readSiteName: deps.readSiteName });
  const file = readProjectsFile(deps.projectsPath);
  if (deps.relocationGate && !deps.relocationGate.shouldRun(file)) return recordsWithRememberedNames({ rows: file.rows, deps });
  try {
    relocateMovedSites({ projectsPath: deps.projectsPath }, { searchRoots: deps.siteFolders?.read({}).roots ?? deps.siteScanRoots ?? [], classifySiteDir: deps.classifySiteDir });
  } catch (error) {
    console.warn(`tovu desktop: could not save moved site folders — ${(error as Error).message}`);
  }
  const rows = readTrackedSites(deps.projectsPath);
  if (deps.sharedSites) shareSiteDirectories({ workspace: deps.sharedSites, dirs: rows.map((row) => row.siteDir), createdBy: "desktop-legacy" });
  return recordsWithRememberedNames({ rows, deps });
}

/** Store only the name, never lifecycle status or deletion authority. */
function rememberSiteName(
  { projectsPath, siteDir, displayName }: { projectsPath: string; siteDir: string; displayName: string }, _optional = {},
): void {
  try {
    updateProjectsFile(projectsPath, (current) => ({
      rows: current.rows.map((row) => row.siteDir === siteDir ? { ...row, displayName } : row),
      dismissed: current.dismissed,
    }));
  } catch (error) {
    // A metadata cache failure must not report a completed Create/Add/Rename as a failed action.
    console.warn('tovu desktop: could not remember website name', error);
  }
}
function recordsWithRememberedNames(
  { rows, deps }: { rows: SiteRow[]; deps: Pick<ProjectIpcDeps, "projectsPath" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions" | "sharedSites" | "siteRuntime"> }, _optional = {},
) {
  const records = rows.map((row) => buildSiteRecord(row, deps));
  const names = new Map(records.filter((record) => !record.folderMissing).map((record) => [record.id, record.displayName]));
  if (rows.some((row) => names.has(row.siteDir) && names.get(row.siteDir) !== row.displayName)) {
    try {
      updateProjectsFile(deps.projectsPath, (current) => ({
        rows: current.rows.map((row) => names.has(row.siteDir) ? { ...row, displayName: names.get(row.siteDir)! } : row),
        dismissed: current.dismissed,
      }));
    } catch (error) { console.warn('tovu desktop: could not remember website names', error); }
  }
  return records;
}

/**
 * A missing card's Locate: the operator picks where the site's folder is now, and the card is
 * pointed there — keeping its place in the grid, and merging into the existing card when that
 * folder is already tracked. Main owns the dialog, as with `handleAddSite`, so the renderer never
 * names a path.
 *
 * @returns the record at its new folder.
 * @throws {Error} operator-facing, when the dialog is cancelled, the picked folder is not a complete
 *   Tovu site, or `id` is not tracked.
 * @complexity O(n + r + m) for n tracked rows, r catalog rows and m marker bytes.
 */
async function handleLocate(id: string, deps: Pick<ProjectIpcDeps, "dialog" | "classifySiteDir" | "projectsPath" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions" | "sharedSites" | "siteRuntime">) {
  const picked = await deps.dialog.showOpenDialog({
    title: "Locate your Tovu website's folder",
    message: `Pick the folder that now holds the website that was at ${id}. Nothing in it will be changed.`,
    buttonLabel: "Use this folder",
    properties: ["openDirectory"],
  });
  if (picked.canceled || picked.filePaths.length === 0) {
    throw new Error("No folder was chosen.");
  }
  const siteDir = picked.filePaths[0]!; // just checked `filePaths.length === 0` above, so index 0 exists
  const kind = deps.classifySiteDir(siteDir);
  if (kind !== "site") {
    throw new Error(`${siteDir} is not a complete Tovu site (${kind}). Pick the folder that holds this website.`);
  }
  const row = repointTrackedSite(deps.projectsPath, id, siteDir).find((entry) => entry.siteDir === siteDir)!; // repointed onto, or merged into, this exact siteDir above
  if (deps.sharedSites) shareSiteDirectories({ workspace: deps.sharedSites, dirs: [siteDir], createdBy: "Desktop", allowRelocation: true });
  return buildSiteRecord(row, deps);
}

/** Live names include registry aliases and cached names for missing folders. Excluding the target
 * keeps re-adding a tracked folder and renaming a site to its own name idempotent. */
function otherSiteNames({ deps, siteDir }: {
  deps: Pick<ProjectIpcDeps, "projectsPath" | "readSiteName">; siteDir: string;
}, _optional = {}): string[] {
  return readTrackedSites(deps.projectsPath).filter((row) => row.siteDir !== siteDir).map((row) =>
    row.displayNameAlias ?? (!fs.existsSync(row.siteDir) && row.displayName ? row.displayName : deps.readSiteName(row.siteDir)));
}

/** Adding a website must not rewrite its config. Persist a shell alias only when disambiguating. */
function rememberSiteAlias({ projectsPath, siteDir, displayNameAlias }: {
  projectsPath: string; siteDir: string; displayNameAlias?: string;
}, _optional = {}): void {
  updateProjectsFile(projectsPath, (current) => ({
    rows: current.rows.map((row) => row.siteDir === siteDir ? { ...row, displayNameAlias } : row),
    dismissed: current.dismissed,
  }));
}

/**
 * Track discovered sites the way Add existing tracks a picked one: each NEWLY adopted card whose
 * name collides gets a shell alias ("Name 2"), never a config rewrite. Rows already tracked keep
 * their names — only this call's adoptions are named, one at a time so they also differ from each
 * other. O(a·n) for a adoptions over n tracked rows.
 */
function adoptWithUniqueNames({ deps, siteDirs }: {
  deps: Pick<ProjectIpcDeps, "projectsPath" | "readSiteName">; siteDirs: string[];
}, _optional = {}): void {
  for (const siteDir of adoptDiscoveredSites(deps.projectsPath, siteDirs)) {
    const originalName = deps.readSiteName(siteDir);
    const displayName = uniqueSiteName({ name: originalName, names: otherSiteNames({ deps, siteDir }) });
    if (displayName !== originalName) rememberSiteAlias({ projectsPath: deps.projectsPath, siteDir, displayNameAlias: displayName });
  }
}

/** Plan a new Tovu site without creating folders or reserving the destination.
 * The workspace owns home resolution and volume admission for both Create and its preview.
 * @throws {Error} if the name is not a string or the home volume is unavailable.
 * @complexity O(n + k) for n name characters and k conflicting folders; O(n) space.
 */
export function planNewSiteDir({ name }: { name: string }, {
  workspace = createSitesWorkspace({}),
}: { workspace?: Pick<SitesWorkspace, "home" | "homeAvailable"> } = {}): string {
  if (typeof name !== "string") throw new Error("Website name must be a string.");
  const home = workspace.home({});
  if (!workspace.homeAvailable({})) throw new Error(`Sites home volume is unavailable: ${home}. Mount it or choose a local folder in Sites settings.`);
  const folder = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "website";
  let target = path.join(home, folder), suffix = 2;
  while (fs.existsSync(target)) {
    target = path.join(home, `${folder}-${suffix}`);
    suffix++;
  }
  return target;
}

/**
 * "+ Create website" has no folder in its input — `CreateSiteInput` is a display name plus a
 * database choice, ported from Tovu-Runner's own provisioner-backed form. This shell has no such
 * provisioner, so each new project gets a free directory under the configured sites home;
 * `input.displayName` becomes `tovu init`'s `--name`.
 *
 * **The database choice is REFUSED rather than ignored (D-02).** Knowing the field was dead and
 * narrowing it silently was the defect: `buildSiteRecord` hard-codes `{kind: "sqlite"}`, so an
 * operator who chose Supabase — and whom `computeCanCreate` then FORCED to type a project URL and
 * an API key before the button would enable — got a local SQLite site reported back as a success,
 * with their credential discarded. A contract this process does not honour must fail loudly at its
 * boundary; the renderer's own fix (disabling the options it cannot deliver) is the first line,
 * and this is the one that holds whoever calls the channel next.
 *
 * Refused BEFORE planning the destination, deliberately: nobody should prepare a site that was
 * never going to be made. An absent `database` is the same as `sqlite` — every existing caller
 * omits it, and omitting it is not a claim about a provider.
 *
 * @returns the new site record.
 * @throws {Error} for invalid input, an unavailable sites home, or a creation race.
 * @complexity O(k) destination probes for k conflicting folders, plus initialization.
 */
async function handleCreate(
  input: CreateSiteInput,
  deps: Pick<ProjectIpcDeps, "classifySiteDir" | "adoptSiteDir" | "repoRoot" | "statePath" | "cliMode" | "projectsPath" | "openSites" | "readSiteName" | "readPreviewVersion" | "transitions" | "siteFolders" | "sharedSites" | "siteRuntime">
) {
  const agentPluginTokens = validateCreateInput({ input });

  const target = planNewSiteDir({ name: input.displayName }, { workspace: deps.sharedSites });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // BEFORE `adoptSiteDir`, because afterwards the answer is gone: it returns the same path whether
  // it ran `tovu init` into an empty folder or simply recognized a site that was already there. Only
  // the first of those is a directory this app made, and only that one may ever be erased again —
  // see `project-delete-guard.ts`. Create must refuse a folder another app took before either
  // classification, rather than recording its existing site as one this app made.
  const wasEmpty = deps.classifySiteDir(target) === "empty";
  assertTokensCanReachFolder(agentPluginTokens, wasEmpty);
  if (!wasEmpty && input.adminPassword !== undefined) throw new Error("An admin password can only be set while creating a new site. Change an existing site's password under Users.");
  if (!wasEmpty) throw new Error("The new website folder was created by another app. Try creating this website again.");
  const names = otherSiteNames({ deps, siteDir: target });
  const displayName = uniqueSiteName({ name: input.displayName, names });
  const init = { output: "" };
  const adopt = async () => {
    if (deps.classifySiteDir(target) !== "empty") throw new Error("The new website folder was created by another app. Try creating this website again.");
    return deps.adoptSiteDir({
    dir: target,
    repoRoot: deps.repoRoot,
    statePath: deps.statePath,
    name: displayName,
    adminPassword: input.adminPassword,
    cliMode: deps.cliMode,
    ...initTokenOptions(agentPluginTokens, init),
    });
  };
  const siteDir = await withDirectoryFileLock({ lockPath: `${target}.creation.lock`, run: adopt }, { staleMs: Infinity });
  return withCreatedTokens(recordCreatedSite({ siteDir, displayName }, deps), init.output);
}

/**
 * What every site this app made gets: its catalog row with the identity `tovu` just stamped, its
 * shared-registry entry, and its display name. Create and Import both end here.
 * @throws {Error} when the catalog entry cannot be read back.
 * @complexity O(n) in tracked rows.
 */
function recordCreatedSite(
  { siteDir, displayName }: { siteDir: string; displayName: string },
  deps: Pick<ProjectIpcDeps, "projectsPath" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions" | "siteFolders" | "sharedSites" | "siteRuntime">,
) {
  // Read AFTER `adoptSiteDir`, because before it there is no site there to have an identity: this is
  // the id `tovu init` just stamped into `.site-meta.json`. Recording it here is the only moment
  // this app can honestly say "the site at this path is one I made" — every later reader is looking
  // at a path, and a path is not an identity. See `project-delete-guard.ts`'s test 3.
  // `null` when the folder has no readable identity: the row is then recorded without one, the fail-closed direction.
  const siteId = readSiteIdentity(siteDir);
  trackSite(deps.projectsPath, siteDir, SITE_ORIGIN.created, { siteId });
  if (deps.sharedSites) shareSiteDirectories({ workspace: deps.sharedSites, dirs: [siteDir], createdBy: "Desktop" });
  // Remember the created site's parent beyond MRU eviction/card
  // removal, so a site created beside it by the CLI or web admin can appear on the next scan.
  try { deps.siteFolders?.rememberCreated({ siteDir }); }
  catch { console.warn("tovu desktop: could not remember the created website folder; the website was created successfully."); }
  rememberSiteName({ projectsPath: deps.projectsPath, siteDir, displayName });
  const displayNameAlias = displayName !== deps.readSiteName(siteDir) ? displayName : undefined;
  rememberSiteAlias({ projectsPath: deps.projectsPath, siteDir, displayNameAlias });
  const tracked = readTrackedSites(deps.projectsPath).find((row) => row.siteDir === siteDir);
  if (!tracked) throw new Error("The website was created, but its desktop catalog entry is missing. Use Add Tovu Website to add the folder again.");
  return buildSiteRecord({ ...tracked, displayNameAlias }, deps);
}

/** Validate creation before planning the destination; return the existing cleaned token contract.
 * @throws {Error} for unsupported providers, names, tokens or passwords.
 * @complexity O(n) in token count, delegated to cleanCreateTokens.
 */
function validateCreateInput({ input }: { input: CreateSiteInput }, _options = {}) {
  const nameError = siteNameError({ name: input.displayName });
  if (nameError) throw new Error(nameError);
  const kind = input.database?.kind;
  if (kind !== undefined && kind !== "sqlite") {
    throw new Error(`This app only creates SQLite sites, which live in the folder you choose. "${kind}" needs a hosted-database provisioner this app does not have.`);
  }
  // Checked before the dialog for the same reason as the database choice: a malformed map is refused
  // before anyone picks a folder.
  const agentPluginTokens = cleanCreateTokens(input.agentPluginTokens);
  if (input.adminPassword !== undefined && (typeof input.adminPassword !== "string" || input.adminPassword.length === 0)) {
    throw new Error("Admin password must be a nonempty string.");
  }
  return agentPluginTokens;
}

/**
 * The services "+ Create website" can offer a token field for (`agent-plugin-tokens.ts`). A failure
 * is an empty list, never an error: the form then offers no services and creates the site as before.
 *
 * @complexity One CLI spawn.
 */
async function handleTokenSignInPlugins(deps: Pick<ProjectIpcDeps, "repoRoot" | "cliMode" | "listTokenSignInPlugins">): Promise<TokenSignInPlugin[]> {
  try {
    return await (deps.listTokenSignInPlugins ?? listTokenSignInPluginsReal)({ repoRoot: deps.repoRoot, cliMode: deps.cliMode });
  } catch (error) {
    console.warn(`[desktop] could not list the services a new site can connect: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
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
 * It also closes the old confusion where "Create website" adopted a picked existing site.
 * Create now chooses a free directory under sites home; Add owns the existing-folder choice.
 *
 * Main owns the existing-folder dialog, so the renderer never names a path.
 *
 * The row is recorded `adopted` by `addSitePointer` itself, never `created`, so
 * `project-delete-guard.ts` can never let a later delete erase a folder this app did not make.
 *
 * @returns null when the folder picker is cancelled.
 * @throws {AddSitePointerError} when the folder is not a
 *   complete Tovu site — either way an operator-facing message that names the fix.
 * @complexity O(n) in the tracked-project count, plus one classification.
 */
async function handleAddSite(
  deps: Pick<ProjectIpcDeps, "dialog" | "addSitePointer" | "projectsPath" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions" | "sharedSites" | "siteRuntime">,
  input: { folder?: unknown } = {},
) {
  // A dropped folder arrives with its path; everything else goes through main's own dialog.
  const folder = input.folder === undefined ? await pickSiteFolder(deps) : droppedPath({ value: input.folder });
  if (folder === null) return null;

  const { siteDir, alreadyTracked } = deps.addSitePointer({ siteDir: folder, projectsPath: deps.projectsPath }, { workspace: deps.sharedSites });
  if (deps.sharedSites) shareSiteDirectories({ workspace: deps.sharedSites, dirs: [siteDir], createdBy: "Desktop", allowRelocation: true });
  const row = readTrackedSites(deps.projectsPath).find((entry) => entry.siteDir === siteDir)!; // addSitePointer just tracked this exact siteDir above, so a row for it always exists
  // Read back rather than synthesized: an already-tracked folder keeps its ORIGINAL `createdAt` and
  // origin, and a fabricated row would report today's date and reorder the operator's grid.
  if (!alreadyTracked) {
    const originalName = deps.readSiteName(siteDir);
    const displayName = uniqueSiteName({ name: originalName, names: otherSiteNames({ deps, siteDir }) });
    row.displayNameAlias = displayName !== originalName ? displayName : undefined;
    rememberSiteAlias({ projectsPath: deps.projectsPath, siteDir, displayNameAlias: row.displayNameAlias });
  }
  const record = buildSiteRecord(row, deps);
  rememberSiteName({ projectsPath: deps.projectsPath, siteDir, displayName: record.displayName });
  return { ...record, alreadyTracked };
}

/** Main's folder dialog; `null` when cancelled, which is a completed choice, not a failure to show. */
async function pickSiteFolder(deps: Pick<ProjectIpcDeps, "dialog">): Promise<string | null> {
  const picked = await deps.dialog.showOpenDialog({
    title: "Choose your Tovu website's folder",
    message: "Pick a folder that already contains a Tovu website. Nothing in it will be changed.",
    buttonLabel: "Add website",
    // No `createDirectory`: a folder the operator makes in this dialog is
    // empty by definition, and an empty folder is precisely what this verb refuses. Offering the
    // button would invite the one mistake the refusal then has to explain.
    properties: ["openDirectory"],
  });
  return picked.canceled || picked.filePaths.length === 0 ? null : picked.filePaths[0]!;
}

/** A path the renderer read off a drop. What it holds is checked by the verb it goes to. */
function droppedPath({ value }: { value: unknown }): string {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw new Error("That drop did not include a location on this computer. Use the Choose button instead.");
  return value;
}

/** Which archive to import; `null` when the dialog was cancelled. Remote input is checked by the importer. */
async function archiveSource(
  { input }: { input: { file?: unknown; url?: unknown; pick?: unknown } | null | undefined },
  deps: Pick<ProjectIpcDeps, "dialog">,
): Promise<SiteArchiveSource | null> {
  if (typeof input?.url === "string") return { url: input.url };
  if (input?.file !== undefined) {
    const file = droppedPath({ value: input.file });
    if (!/\.zip$/i.test(file)) throw new Error("That is not a .tovu.zip file. Export a website from Tovu to get one.");
    return { file };
  }
  if (input?.pick !== true) throw new Error("Import needs a file or a share link.");
  const picked = await deps.dialog.showOpenDialog({ title: "Choose a .tovu.zip file", buttonLabel: "Import website",
    properties: ["openFile"], filters: [{ name: "Tovu website", extensions: ["zip"] }] });
  return picked.canceled || picked.filePaths.length === 0 ? null : { file: picked.filePaths[0]! };
}

/**
 * A .tovu.zip or share link becomes a new tracked site: `importSiteArchive` makes it, or rolls it
 * back and rejects with the reason, and it then ends the way Create does.
 * @returns the new record and the importer's notices; `null` when the dialog or the import was cancelled.
 * @complexity One child process, then {@link recordCreatedSite}.
 */
async function handleImportArchive(
  input: Parameters<typeof archiveSource>[0]["input"],
  deps: Pick<ProjectIpcDeps, "dialog" | "importSiteArchive" | "cliMode" | "projectsPath" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions" | "siteFolders" | "sharedSites" | "siteRuntime">,
) {
  const source = await archiveSource({ input }, deps);
  if (source === null) return null;
  const imported = await deps.importSiteArchive({ source, repoRoot: deps.repoRoot, cliMode: deps.cliMode });
  if (imported === null) return null;
  const displayName = uniqueSiteName({ name: deps.readSiteName(imported.dir), names: otherSiteNames({ deps, siteDir: imported.dir }) });
  return { ...recordCreatedSite({ siteDir: imported.dir, displayName }, deps), warnings: imported.warnings };
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
 * Stops the project if it is running, erases its directory ONLY when this app created it,
 * then untracks it. Failed removal retains the row as the operator's recovery handle.
 *
 * That last word is load-bearing and is the whole reason this function consults
 * `project-delete-guard.ts` rather than calling `fs.rm` on whatever id arrives. A tracked row can
 * point at a folder the app merely adopted (`seedDevFallbackSite` seeds exactly one such row,
 * `<repo>/sites/tovu-dev`, someone's real 44 MB site), and for those the delete means "take this
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
 * `DEFAULT_READY_TIMEOUT_MS` (180s) while `tovu serve` boots. Start a site, go back to All, delete
 * it, and the delete saw no entry, skipped the stop, and recursively erased the directory the child
 * was booting in — then the start completed and published a running entry for a project that no
 * longer existed. Serializing the two verbs against each other is the whole fix: the delete now
 * queues behind the in-flight start and finds the entry it must stop.
 *
 * @complexity O(1) beyond `fs.rm`'s own cost over the site directory's contents, plus however long
 *   an already-queued operation on the same site takes to settle.
 */
async function handleDelete(id: string, deps: Pick<ProjectIpcDeps, "serializer" | "projectsPath" | "openSites" | "cancelPreviewCapture" | "repoRoot" | "readRegistry" | "registryPath" | "isLiveServeRow" | "recordSiteClosed" | "deletePreview" | "removeSiteTree" | "sharedSites">): Promise<void> {
  await deps.serializer.run(id, () => deleteProject(id, deps));
}

/**
 * {@link handleDelete}'s body, separated only so the serialized region is one named thing rather
 * than an inline closure — everything here assumes it holds this site's serializer key.
 *
 * @complexity see {@link handleDelete}.
 */
async function deleteProject(id: string, deps: Pick<ProjectIpcDeps, "projectsPath" | "openSites" | "cancelPreviewCapture" | "repoRoot" | "readRegistry" | "registryPath" | "isLiveServeRow" | "recordSiteClosed" | "deletePreview" | "removeSiteTree" | "sharedSites">): Promise<void> {
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
  if (erasesFiles) assertNoOtherServer({ id, openEntry, deps });

  deps.cancelPreviewCapture?.({ siteDir: id }, {});
  if (openEntry !== undefined) {
    await openEntry.server.stop!(); // an entry with no `.stop` never reaches this line in practice — `OpenSiteEntry.server.stop` is optional only because other, non-delete tests build entries that omit it
    closeStoppedProject({ id, openEntry, deps });
  }
  // The row is the recovery handle for a partial erase: keep it until removal succeeds.
  if (erasesFiles) await eraseProjectDirectory({ id, deps });
  untrackSite(deps.projectsPath, id);
  if (erasesFiles) removeFromSharedCatalog({ id, sharedSites: deps.sharedSites });
  // Unconditional — independent of `erasesFiles` below. A preview is this shell's own decoration,
  // not the operator's data, so a row that is merely REMOVED (adopted, files kept) still drops its
  // cached thumbnail: once the row is gone `buildSiteRecord` can never ask for it again
  // (`site-preview-store.ts`'s own doc on why an orphan is otherwise unreachable, not merely
  // unlikely), so leaving the file behind would only be litter for the boot sweep to find later.
  deps.deletePreview(id);

}

/** {@link deleteProject}'s erase gate (D-08): refuse while another app or instance serves the site.
 * @complexity O(r) registry rows.
 */
function assertNoOtherServer(
  { id, openEntry, deps }: { id: string; openEntry: OpenSiteEntry | undefined; deps: Pick<ProjectIpcDeps, "readRegistry" | "registryPath" | "isLiveServeRow" | "sharedSites"> }, _options = {},
): void {
  const ownPid = openEntry?.server.pid;
  const shared = deps.sharedSites?.running({ path: id }).read({});
  if (shared && (shared.pid !== ownPid || openEntry?.server.external)) throw new Error(`Running in ${shared.app} (port ${shared.port}). Stop it in that app before deleting.`);
  const foreign = liveForeignServers(deps, id, ownPid);
  if (foreign.length > 0) throw new Error(foreignServerMessage(id, foreign));
}

/** Drop an erased site from the shared catalog; a failure only warns, the folder is already gone.
 * @complexity O(1).
 */
function removeFromSharedCatalog({ id, sharedSites }: { id: string; sharedSites: SitesWorkspace | undefined }, _options = {}): void {
  try { sharedSites?.registry({}).remove({ path: id }); }
  catch { console.warn("tovu desktop: could not remove the erased website from the shared catalog."); }
}

/** Remove this process's stopped handle and close its window before folder deletion.
 * @complexity O(1) time and space.
 */
function closeStoppedProject(
  { id, openEntry, deps }: { id: string; openEntry: OpenSiteEntry; deps: Pick<ProjectIpcDeps, "openSites" | "recordSiteClosed" | "registryPath"> }, _options = {},
): void {
  deps.openSites.delete(id);
  // By pid: `recordSiteOpened` can leave a still-draining earlier child's row for this same site dir,
  // and a close by site dir alone would drop that one too (D-07).
  deps.recordSiteClosed(deps.registryPath, id, { pid: openEntry.server.pid });
  // A sites-home-opened (embedded-tab) entry has no `window` at all — see `openSiteServer` in
  // `main.ts` — so this is optional, not a missing null check.
  if (openEntry.window && !openEntry.window.isDestroyed!()) openEntry.window.destroy!(); // present whenever `window` is (see `OpenSiteEntry.window`'s own doc: optional only for tests that never invoke it)
}

/** Erase the folder; translate failures while leaving untracking to the caller.
 * @throws {Error} with the existing retry instruction on a partial erase.
 * @complexity O(n) in filesystem entries, delegated to removeSiteTree.
 */
async function eraseProjectDirectory(
  { id, deps }: { id: string; deps: Pick<ProjectIpcDeps, "removeSiteTree"> }, _options = {},
): Promise<void> {
  // The row is the recovery handle for a partial erase: keep it until removal succeeds.
  try { await (deps.removeSiteTree ?? removeSiteTree)({ root: id }, {}); }
  catch (error) {
    const reason = (error as NodeJS.ErrnoException).code === 'EACCES'
      ? 'Permission was denied.' : 'The folder could not be removed.';
    throw new Error(`Could not delete this website. ${reason} Its card has been kept so you can try again.`);
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
function handleRename(input: RenameSiteInput, deps: Pick<ProjectIpcDeps, "projectsPath" | "classifySiteDir" | "writeSiteName" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions" | "sharedSites" | "siteRuntime">) {
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

  const nameError = siteNameError({ name: input?.name });
  if (nameError) throw new Error(nameError);
  const duplicateError = duplicateSiteNameError({ name: input.name!, names: otherSiteNames({ deps, siteDir: row.siteDir }) });
  if (duplicateError) throw new Error(duplicateError);
  const name = deps.writeSiteName(row.siteDir, input?.name);
  // An explicit successful rename replaces any Add alias; otherwise the card would keep its old name.
  row.displayNameAlias = undefined;
  rememberSiteAlias({ projectsPath: deps.projectsPath, siteDir: row.siteDir });
  rememberSiteName({ projectsPath: deps.projectsPath, siteDir: row.siteDir, displayName: name });

  retitleOpenSite({ siteDir: row.siteDir, name, openSites: deps.openSites });

  return buildSiteRecord(row, deps);
}

/** Refresh the native Window menu's name after a successful site rename.
 * @complexity O(1) time and space.
 */
function retitleOpenSite(
  { siteDir, name, openSites }: { siteDir: string; name: string; openSites: ProjectIpcDeps["openSites"] }, _options = {},
): void {
  // The open window's title, when there is one. There usually is NOT: a card opens its site as a
  // `<webview>` tab inside the sites home window (whose own title is pinned to "Tovu"), and
  // `openSiteServer` is spawn-only. Only "Open Site…"/"Open Recent" produce a titled window
  // (`main.ts`'s `openSiteWindow`). Worth the line anyway — `readSiteName`'s own doc says that
  // title is "what makes Electron's native Window menu double as a site switcher (distinct titles,
  // distinct entries)", so a stale one is a stale CONTROL, not a stale label.
  //
  // "Open Recent" itself needs no refresh: `main.ts` builds those items with the directory path as
  // the label, not the site name, so a rename cannot stale them.
  const openWindow = openSites.get(siteDir)?.window;
  if (openWindow && !openWindow.isDestroyed!()) openWindow.setTitle!(name); // present whenever `window` is (see `OpenSiteEntry.window`'s own doc)
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
 * @complexity O(n + r + m) for n tracked rows, r catalog rows and m marker bytes, beyond
 *   `openSiteServer` and any already-queued operation on the same site.
 */
async function handleStart<TCtx>(id: string, deps: Pick<ProjectIpcDeps<TCtx>, "serializer" | "projectsPath" | "openSiteServer" | "ctx" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions" | "sharedSites" | "siteRuntime"> & Partial<Pick<ProjectIpcDeps, "classifySiteDir" | "startAllowed">>) {
  return await deps.serializer.run(id, async () => {
    const row = readTrackedSites(deps.projectsPath).find((entry) => entry.siteDir === id);
    if (row === undefined) {
      throw new Error(`Unknown project: ${id}`);
    }
    if (deps.startAllowed && !deps.startAllowed()) return buildSiteRecord(row, deps);
    if ((deps.classifySiteDir ?? classifySiteDirSafely)(row.siteDir) !== "site") throw new Error("Folder moved or not a site. Locate the website folder or remove this card.");
    ensureIndependentSiteIdentity({ siteDir: row.siteDir }, { workspace: deps.sharedSites });
    if (deps.sharedSites) shareSiteDirectories({ workspace: deps.sharedSites, dirs: [row.siteDir], createdBy: "Desktop", allowRelocation: true });
    await markTransition(deps.transitions, id, "starting", () => explainMissingSiteDir(id, deps.openSiteServer(id, deps.ctx)));
    return buildSiteRecord(row, deps);
  });
}

/**
 * Rewrites `tovu serve`'s `SITE_DIR_INVALID` into "folder not found" when the tracked folder itself
 * is gone. A folder renamed or moved on disk (`sites/tovu-com` → `sites/tovu-dev`, 2026-09-28) is
 * still tracked by its old path, and serve's own "config.json is missing at …" sent the operator
 * looking for a config file rather than for the folder. Checked only after serve has refused, so a
 * start that succeeds pays nothing, and every other failure passes through untouched.
 */
async function explainMissingSiteDir(siteDir: string, starting: Promise<unknown>): Promise<void> {
  try {
    await starting;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("SITE_DIR_INVALID")) throw error;
    const folderExists = await fsp.stat(siteDir).then(() => true, () => false);
    if (folderExists) throw error;
    throw new Error(`Site folder not found: ${siteDir}. It was moved, renamed or deleted — remove this site from the list, then use Add Site on its new location.`);
  }
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
 * longer its business. The teardown remains visible to Quit through the injected Jini shutdown
 * tracker; if exit cannot be confirmed, Stop rejects and retains the crash-safety row.
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
 * **A site another process serves** (the shared lease names someone else — `npm run dev`, a sibling
 * instance) is stopped through `deps.externalSites` (owner 2026-10-13; the renderer confirms first).
 * Without that port wired, it is refused as before: "Stop it in that app."
 *
 * @returns the project's fresh record, so the card settles on `stopped` without waiting for a poll.
 * @throws {Error} when `id` names a project this shell is not tracking — same refusal, and same
 *   reason, as {@link handleStart}'s — or the child fails to exit after forced shutdown, or an
 *   external server's identity cannot be proved or it does not exit in time.
 * @complexity O(1) beyond `server.stop()`'s own drain (bounded by grace plus exit wait), plus however long
 *   an already-queued operation on the same site takes to settle.
 */
async function handleStop(id: string, deps: Pick<ProjectIpcDeps, "serializer" | "projectsPath" | "openSites" | "cancelPreviewCapture" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "registryPath" | "recordSiteClosed" | "transitions" | "sharedSites" | "siteRuntime" | "pendingTeardowns" | "externalSites">) {
  return await deps.serializer.run(id, async () => {
    const row = readTrackedSites(deps.projectsPath).find((entry) => entry.siteDir === id);
    if (row === undefined) {
      throw new Error(`Unknown project: ${id}`);
    }
    const running = deps.sharedSites?.running({ path: id }).read({});
    const openEntry = deps.openSites.get(id);
    const externalSites = deps.externalSites;
    if (running && (!openEntry || openEntry.server.external) && externalSites) {
      await markTransition(deps.transitions, id, "stopping", () => stopExternalServer({ id, lease: running, externalSites, deps }));
      return buildSiteRecord(row, deps);
    }
    if (running && !openEntry) throw new Error(`Running in ${running.app} (port ${running.port}). Stop it in that app.`);
    await markTransition(deps.transitions, id, "stopping", () => stopSiteServer(id, deps));
    return buildSiteRecord(row, deps);
  });
}

/**
 * {@link handleStop} for a site another process serves. This window's own attachment (if any) is
 * withdrawn FIRST, for the reason {@link stopSiteServer} drops its entry before stopping: the
 * attachment's lease watcher would otherwise report the exit the operator asked for as a crash.
 * Assumes it holds this site's serializer key.
 * @complexity see `external-site-stop.ts`'s `stopExternalSite`.
 */
async function stopExternalServer(
  { id, lease, externalSites, deps }: {
    id: string; lease: NonNullable<SharedRunning>; externalSites: NonNullable<ProjectIpcDeps["externalSites"]>;
    deps: Pick<ProjectIpcDeps, "openSites" | "cancelPreviewCapture" | "registryPath" | "recordSiteClosed" | "pendingTeardowns" | "sharedSites">;
  },
  _options = {},
): Promise<void> {
  await stopSiteServer(id, deps);
  await externalSites.stop({ lease, readLease: () => deps.sharedSites?.running({ path: id }).read({}) });
}

/**
 * {@link handleStop}'s side effect, split out so the handler above reads as its three steps — find
 * the row, stop the server, report the result — rather than interleaving the drain's own ordering
 * rules with them. Assumes it holds this site's serializer key.
 *
 * @complexity see {@link handleStop}.
 */
async function stopSiteServer(id: string, deps: Pick<ProjectIpcDeps, "openSites" | "cancelPreviewCapture" | "registryPath" | "recordSiteClosed" | "pendingTeardowns">): Promise<void> {
  deps.cancelPreviewCapture?.({ siteDir: id }, {});
  const openEntry = deps.openSites.get(id);
  if (openEntry === undefined) return;
  deps.openSites.delete(id);
  const teardown = openEntry.server.stop!().then(() => {
    // By pid, never by site dir alone: a live SIBLING app instance can hold its own row for this same
    // site, and a close by site dir would take that one too (D-07). A failed Stop keeps this row.
    deps.recordSiteClosed(deps.registryPath, id, { pid: openEntry.server.pid });
  }, error => {
    // Stop could not confirm exit. Keep this live child supervised so Keep running can retain
    // its normal memory and crash recovery, rather than losing it from the lifecycle entirely.
    if (!deps.openSites.has(id)) deps.openSites.set(id, openEntry);
    throw error;
  });
  // openSites no longer exposes this child, so Quit must find its drain in the existing tracker.
  deps.pendingTeardowns?.track({ promise: teardown });
  await teardown;
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
 * @param deps.siteFolders Profile settings read on every scan: built-in roots, remembered
 *   creation parents and extra roots. Supersedes the static roots when supplied.
 * @param deps.recentSiteDirs `site-dir-store.ts`'s recently-opened list, as a thunk — the sites
 *   own-server mode has been recording all along, which are the operator's by definition and
 *   generally do not live under any scan root.
 * @param deps.discoverSites Production's bounded, cancellable worker; reads roots/MRU off-thread.
 * @returns A promise for the same records {@link handleList} would return, after the pass.
 * @throws Discovery limit, timeout or cancellation errors before any candidate is adopted.
 * @complexity O(n log n) discovery plus O(n + m) adoption for n candidates and m stored rows.
 */
async function rescanSites(deps: Pick<ProjectIpcDeps, "siteScanRoots" | "recentSiteDirs" | "classifySiteDir" | "projectsPath" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions" | "siteFolders" | "sharedSites" | "siteRuntime" | "discoverSites">) {
  // Production injects the read-only worker. Legacy hosts/tests retain the same discovery owner.
  const found = deps.discoverSites ? await deps.discoverSites({}) : discoverSiteDirs({
    scanRoots: deps.siteFolders?.read({}).roots ?? deps.siteScanRoots,
    knownDirs: deps.recentSiteDirs(),
    classifySiteDir: deps.classifySiteDir,
  }, { homeDir: deps.sharedSites?.homeDir, sitesHome: deps.sharedSites?.home({}) });
  adoptWithUniqueNames({ deps, siteDirs: found });
  return handleList(deps);
}

/** Main owns the picker; adding a root only changes future discovery, never site files/processes.
 * @returns Fresh settings, or null on cancellation.
 * @throws Native picker or persistence errors, preserving their actual message.
 * @complexity O(n log n) bounded discovery in the worker, then O(r) settings for r roots.
 */
async function handleAddSiteFolder({ deps }: { deps: Pick<ProjectIpcDeps, "dialog" | "siteFolders" | "discoverSites" | "classifySiteDir" | "recentSiteDirs" | "sharedSites"> }, _options = {}) {
  if (!deps.siteFolders) throw new Error("Sites folders settings are unavailable in this desktop version.");
  const picked = await deps.dialog.showOpenDialog({
    title: "Add sites folder", message: "Choose a folder containing Tovu website folders. Use Rescan to discover them.",
    buttonLabel: "Add folder", properties: ["openDirectory"],
  });
  if (picked.canceled || picked.filePaths.length === 0) return null;
  const root = fs.realpathSync(picked.filePaths[0]!);
  const scanRoots = [...new Set([...deps.siteFolders.read({}).roots, root])];
  // Use the discovery owner before committing settings, including aggregate entry/root limits.
  // A failed scan leaves both shared config and legacy profile settings byte-for-byte unchanged.
  if (deps.discoverSites) await deps.discoverSites({ scanRoots });
  else discoverSiteDirs({ scanRoots, knownDirs: deps.recentSiteDirs(), classifySiteDir: deps.classifySiteDir }, { homeDir: deps.sharedSites?.homeDir, sitesHome: deps.sharedSites?.home({}) });
  return deps.siteFolders.add({ root });
}

/**
 * Registers the real `runner:sites:*` handlers, including discovery-folder settings.
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
 * @param options Injected clock/scheduler and preference reader for deterministic lifecycle tests.
 * @returns Presence, confirmed-exit recovery and one-pass maintenance; dispose revokes automatic
 *   starts, retry timers and sender hooks. Start/Stop remain on the existing per-directory serializer.
 * @example const sites = registerSiteIpcHandlers(deps, { now }); await sites.maintain({ snapshot }, {});
 * @complexity O(1) registration; O(s) retained policy/observation state for s sites. Maintenance
 *   costs O(s*p) snapshot lookups; retry decisions use Jini's bounded rolling failure window.
 */
function registerSiteIpcHandlers<TCtx>(deps: ProjectIpcDeps<TCtx>, options: SiteLifecycleOptions = {}): ProjectSiteLifecycle {
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? scheduleSiteRetry;
  const sleepMinutes = options.sleepMinutes ?? (() => readIdleSiteSleepMinutes({ preferencePath: path.join(path.dirname(deps.statePath), 'desktop-preferences.json') }));
  const states = new Map<string, SiteRuntime>();
  let disposed = false;
  let maintenance: Promise<void> | undefined;

  /** One policy per directory, including quiet periods and successful automatic boots. O(1). */
  function stateFor({ siteDir }: { siteDir: string }, _options = {}): SiteRuntime {
    let state = states.get(siteDir);
    if (!state) {
      state = { policy: createRespawnPolicy({ now }, { backoffScheduleMs: [1000, 5000, 30000],
        crashLoopWindowMs: 300000, crashLoopMaxFailures: 4 }), failures: 0, cancelled: false, lastPresentAt: now() };
      states.set(siteDir, state);
    }
    return state;
  }

  /** Stop/delete/quit revoke queued work before waiting on a serializer or a drain. */
  function cancel({ siteDir, forget = false }: { siteDir: string; forget?: boolean }, _options = {}): void {
    const state = states.get(siteDir);
    if (!state) return;
    state.cancelRetry?.(); state.cancelRetry = undefined; state.cancelled = true;
    state.keepAwake = false;
    state.restartAfterExit = undefined; state.status = undefined; state.detail = undefined;
    if (forget) states.delete(siteDir);
  }

  /** Manual recovery clears the trip; automatic starts deliberately never call this. */
  function manualStart({ siteDir }: { siteDir: string }, _options = {}): void {
    cancel({ siteDir });
    const state = stateFor({ siteDir });
    state.policy.reset();
    // Replacing the intent object revokes starts already queued before this manual action while
    // keeping exactly one policy for the directory. Cancellation alone must not be re-enabled.
    states.set(siteDir, { ...state, cancelled: false, status: undefined, detail: undefined,
      lastPresentAt: now(), rss: undefined, starting: undefined });
  }

  /** Recheck cancellation inside handleStart's serializer as well as before queueing it. */
  function startSite(input: { siteDir: string; state: SiteRuntime }, optional: { manual?: boolean } = {}) {
    if (input.state.starting) return input.state.starting;
    const work = attemptStart(input, optional).finally(() => {
      if (input.state.starting === work) input.state.starting = undefined;
    });
    input.state.starting = work;
    deps.pendingTeardowns?.track({ promise: work });
    return work;
  }

  /** Quit waits for an already-started boot, then drains any child it adopted after cancellation. */
  async function attemptStart({ siteDir, state }: { siteDir: string; state: SiteRuntime }, { manual = false } = {}) {
    const allowed = () => !disposed && !state.cancelled && states.get(siteDir) === state;
    if (!allowed()) return;
    const failures = state.failures;
    state.cancelRetry = undefined;
    try {
      const record = await handleStart(siteDir, { ...deps, siteRuntime: states, startAllowed: allowed });
      await finishStart({ siteDir, state, failures, allowed });
      return record;
    } catch (error) {
      // An already-observed post-ready exit counts once, even if adoption also rejects.
      if (allowed() && state.failures === failures) recordFailure({ siteDir, state, detail: siteFailureDetails({ error }) });
      if (manual) throw error;
    }
  }

  /** Publish success only for the still-current intent. A new failure observed during boot owns
   * the status; readiness alone must not clear its scheduled retry or the policy's recent failures.
   */
  async function finishStart({ siteDir, state, failures, allowed }: {
    siteDir: string; state: SiteRuntime; failures: number; allowed: () => boolean;
  }, _options = {}): Promise<void> {
    if (disposed) { await handleStop(siteDir, deps); return; }
    if (!allowed() || state.failures !== failures) return;
    if (deps.openSites.has(siteDir)) await deps.onServerRestarted?.({ siteDir });
    state.status = undefined; state.detail = undefined;
  }

  /** Jini owns the rolling policy; this owner schedules its decision and supplies site wording. */
  function recordFailure({ siteDir, state, detail }: { siteDir: string; state: SiteRuntime; detail: string }, _options = {}): void {
    if (disposed || state.cancelled) return;
    state.failures++;
    state.cancelRetry?.();
    const decision = state.policy.recordFailure({ isPortConflict: false });
    if (decision.action === "give-up") {
      state.cancelRetry = undefined; state.status = "failed";
      state.detail = "This site couldn’t stay running after three automatic restarts in five minutes. Automatic restart has stopped. Try starting it again.\n\nRedacted details (copy and paste):\n" + detail;
      deps.onRestartStopped?.({ siteDir, detail: state.detail });
      return;
    }
    state.status = "starting"; state.detail = undefined;
    const cancelScheduled = schedule({ delayMs: decision.delayMs, run: () => {
      if (state.cancelRetry !== cancelScheduled) return;
      state.cancelRetry = undefined;
      // A post-ready exit may arrive before session adoption settles. Wait for that boot's
      // single-flight result before retrying, without losing this policy decision.
      if (state.starting) {
        void state.starting.then(() => startSite({ siteDir, state }), () => startSite({ siteDir, state }));
      } else void startSite({ siteDir, state });
    } });
    state.cancelRetry = cancelScheduled;
  }

  /** Main has already removed the exited child and done PID-specific cleanup. Sleep isn't failure. */
  function onServerExit({ siteDir, exit, server }: { siteDir: string; exit: ServerExitLike; server: OpenSiteEntry["server"] }, _options = {}): void {
    if (disposed || server.external) return;
    const state = stateFor({ siteDir });
    if (state.cancelled) return;
    if (exit.code !== SITE_SLEEP_EXIT_CODE) {
      state.restartAfterExit = undefined;
      recordFailure({ siteDir, state, detail: siteFailureDetails({ exit, server }) });
      return;
    }
    if (state.restartAfterExit === server) {
      state.restartAfterExit = undefined;
      void startSite({ siteDir, state });
      return;
    }
    state.status = "sleeping"; state.detail = undefined;
  }

  /** Server authority runs under the SAME key as Start/Stop. Accepted sleep waits for confirmed
   * exit in the server handle, so a reopen cannot reuse a fenced, still-draining child.
   */
  async function parkSite({ siteDir, state, server, restart }: {
    siteDir: string; state: SiteRuntime; server: OpenSiteEntry["server"]; restart: boolean;
  }, _options = {}): Promise<void> {
    const stopIfIdle = server.stopIfIdle;
    if (!stopIfIdle) return;
    await deps.serializer.run(siteDir, async () => {
      if (disposed || state.cancelled || deps.openSites.get(siteDir)?.server !== server) return;
      if (!restart && presence.has({ siteId: siteDir })) return;
      await requestIdleStop({ state, server, restart, stopIfIdle });
    });
  }

  /** Fence an RSS restart until confirmed exit; a refused sleep leaves it eligible next tick.
   * @complexity O(1) state, one existing bounded child IPC request; no additional I/O.
   */
  async function requestIdleStop({ state, server, restart, stopIfIdle }: {
    state: SiteRuntime; server: OpenSiteEntry["server"]; restart: boolean;
    stopIfIdle: NonNullable<OpenSiteEntry["server"]["stopIfIdle"]>;
  }, _options = {}): Promise<void> {
    if (restart) state.restartAfterExit = server;
    try {
      await stopIfIdle({}, {});
    } catch { /* Timeout, rejection and disposed channels are busy; the next tick may retry. */ }
    finally { if (state.restartAfterExit === server) state.restartAfterExit = undefined; }
  }

  /** Presence events update the absence clock at tab closure, not one sampler tick earlier. */
  function notePresence(): void {
    const at = now();
    for (const [siteDir, state] of states) if (presence.has({ siteId: siteDir })) state.lastPresentAt = at;
  }

  /** One snapshot serves every owned site. Missing/stale samples reset only RSS observations;
   * no suspension-gap special case is needed because the server always rechecks active work.
   * @complexity O(s*p) snapshot lookups for s sites and p process rows; one sampler, no per-site I/O.
   */
  async function maintainSites({ snapshot }: { snapshot: ResourcesSnapshot }): Promise<void> {
    const at = now();
    const minutes = sleepMinutes();
    const sites = readTrackedSites(deps.projectsPath);
    for (const { siteDir } of sites) await maintainSite({ siteDir, snapshot, at, minutes });
  }

  /** Decide one site's timer/cap eligibility, then ask its own authority. O(p) snapshot lookup. */
  async function maintainSite({ siteDir, snapshot, at, minutes }: { siteDir: string; snapshot: ResourcesSnapshot; at: number; minutes: number }): Promise<void> {
    const entry = deps.openSites.get(siteDir);
    if (!entry || entry.server.external) return;
    const state = stateFor({ siteDir });
    if (presence.has({ siteId: siteDir })) state.lastPresentAt = at;
    const restart = siteRssOverTime({ state, server: entry.server, snapshot, siteDir, at });
    const idle = minutes > 0 && at - state.lastPresentAt >= minutes * 60_000;
    if (restart || idle) await parkSite({ siteDir, state, server: entry.server, restart });
  }
  // With no window left nothing reports presence, so ten idle minutes would stop the sites the user kept.
  let keptAwake = false;
  const presence = createSitePresence({ allowed: deps.isPresenceShell ?? (() => false),
    trackedIds: () => new Set(readTrackedSites(deps.projectsPath).map(row => row.siteDir)),
  }, { hasSiteWindow: siteId => keptAwake || Boolean(states.get(siteId)?.keepAwake) || Boolean(deps.openSites.get(siteId)?.window), onRelease: notePresence });
  deps.ipcMain.handle(SITE_PRESENCE_CHANNEL, ({ sender }, input: { siteIds?: unknown } | undefined) => {
    notePresence();
    presence.replace({ sender, siteIds: input?.siteIds });
    notePresence();

  });
  // The state and preferences files share the launch's userData folder, including E2E profiles.
  // Keep registration here: the original independent UI slice and the lifecycle share this profile.
  const offSleep = registerIdleSiteSleepIpc({ ipcMain: deps.ipcMain, allowed: deps.isPresenceShell ?? (() => false),
    preferencePath: () => path.join(path.dirname(deps.statePath), 'desktop-preferences.json') });
  const relocationGate = createRelocationGate({}, { classifySiteDir: deps.classifySiteDir });
  // Handlers share the live host ports: settings and discovery may be supplied after registration.
  // Read them at dispatch and pass registration-owned runtime explicitly, without mutating deps.
  deps.ipcMain.handle(SITE_IPC_CHANNELS.list, () => handleList({ ...deps, siteRuntime: states, relocationGate }));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.planNewDir, (_event, input) => ({
    path: planNewSiteDir({ name: input?.name }, { workspace: deps.sharedSites }), homeDir: os.homedir(),
  }));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.create, (_event, input) => handleCreate(input, { ...deps, siteRuntime: states }));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.delete, (_event, id) => {
    cancel({ siteDir: id, forget: true });
    return handleDelete(id, deps);
  });
  deps.ipcMain.handle(SITE_IPC_CHANNELS.openExternal, (_event, input) => handleOpenExternal(input, deps));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.start, (_event, id) => {
    manualStart({ siteDir: id });
    return startSite({ siteDir: id, state: stateFor({ siteDir: id }) }, { manual: true });
  });
  deps.ipcMain.handle(SITE_IPC_CHANNELS.stop, (_event, id) => {
    cancel({ siteDir: id });
    return handleStop(id, { ...deps, siteRuntime: states });
  });
  deps.ipcMain.handle(SITE_IPC_CHANNELS.keepRunning, ({ sender }, input: { id?: unknown } | undefined) => {
    if (sender.isDestroyed() || !deps.isPresenceShell?.(sender)) throw new Error('Keep running is only available from the desktop window.');
    const siteDir = input?.id;
    if (typeof siteDir !== 'string' || !readTrackedSites(deps.projectsPath).some(site => site.siteDir === siteDir)) {
      throw new Error('Keep running needs a tracked site.');
    }
    // Preserve the choice across automatic recovery; Stop/delete/manual Start release it in cancel.
    const state = stateFor({ siteDir });
    if (state.cancelled) {
      // A failed Stop revoked the old intent. Replace it so queued work stays revoked while
      // this explicit choice restores memory limits and crash recovery for the live site.
      states.set(siteDir, { ...state, cancelled: false, keepAwake: true, starting: undefined });
    } else state.keepAwake = true;
  });
  deps.ipcMain.handle(SITE_IPC_CHANNELS.rescan, () => rescanSites({ ...deps, siteRuntime: states }));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.setHome, async () => {
    if (!deps.sharedSites) throw new Error("Sites home settings are unavailable in this desktop version.");
    const picked = await deps.dialog.showOpenDialog({ title: "Choose Tovu Sites home", buttonLabel: "Use this folder", properties: ["openDirectory", "createDirectory"] });
    if (picked.canceled || !picked.filePaths[0]) return null;
    const selected = picked.filePaths[0];
    if (!path.isAbsolute(selected) || !fs.statSync(selected).isDirectory()) throw new Error("Choose an existing absolute sites folder.");
    deps.sharedSites.setHome({ path: selected });
    return { ...(deps.siteFolders?.read({}) ?? { roots: [], extraRoots: [] }), home: deps.sharedSites.home({}) };
  });
  deps.ipcMain.handle(SITE_IPC_CHANNELS.saveSettings, (_event, input: import("./contracts/project.ts").SiteSettingsPatch) => {
    if (!deps.sharedSites || !deps.siteFolders) throw new Error("Sites settings are unavailable in this desktop version.");
    const invalidMessage = 'Sites settings accept only databases: "inSite" or "appData". Choose folders with the native picker.';
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(invalidMessage);
    if (Object.keys(input).some((key) => key !== "databases") ||
      (input.databases !== "inSite" && input.databases !== "appData")) throw new Error(invalidMessage);
    deps.sharedSites.updateConfig({ patch: { databases: input.databases } });
    return deps.siteFolders.read({});
  });
  deps.ipcMain.handle(SITE_IPC_CHANNELS.listFolders, () => deps.siteFolders?.read({}) ?? { roots: deps.siteScanRoots, extraRoots: [] });
  deps.ipcMain.handle(SITE_IPC_CHANNELS.addFolder, () => handleAddSiteFolder({ deps }));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.removeFolder, (_event, input: { root: string }) => {
    if (typeof input?.root !== "string" || !path.isAbsolute(input.root)) throw new Error("Choose an absolute sites folder path to remove.");
    if (!deps.siteFolders) throw new Error("Sites folders settings are unavailable in this desktop version.");
    return deps.siteFolders.remove({ root: input.root });
  });
  deps.ipcMain.handle(SITE_IPC_CHANNELS.rename, (_event, input) => handleRename(input, { ...deps, siteRuntime: states }));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.addSite, (_event, input) => handleAddSite({ ...deps, siteRuntime: states }, input ?? {}));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.importArchive, (_event, input) => handleImportArchive(input, { ...deps, siteRuntime: states }));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.cancelImport, () => deps.stopRunningImports({}, { reason: "cancel" }));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.preview, (_event, id) => handleGetPreview(id, deps));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.locate, (_event, id) => handleLocate(id, { ...deps, siteRuntime: states }));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.tokenSignInPlugins, () => handleTokenSignInPlugins(deps));
  return { ...presence, keepAwake: () => { keptAwake = true; }, onServerExit, manualStart, cancel,
    onBootFailure({ siteDir, error }, _options = {}) {
      recordFailure({ siteDir, state: stateFor({ siteDir }), detail: siteFailureDetails({ error }) });
    },
    maintain({ snapshot }, _options = {}) {
      if (disposed) return Promise.resolve();
      return maintenance ??= maintainSites({ snapshot }).finally(() => { maintenance = undefined; });
    },
    dispose: () => {
    disposed = true;
    for (const siteDir of states.keys()) cancel({ siteDir });
    presence.dispose();
    deps.ipcMain.removeHandler?.(SITE_PRESENCE_CHANNEL);
    offSleep();
  } };
}

/**
 * The full `deps` bag {@link registerSiteIpcHandlers} needs — every individual handler above takes
 * only the `Pick` of this it actually reads, so a caller wiring one handler in isolation (as this
 * file's own tests do) never has to fabricate the fields it does not touch.
 */
interface ProjectIpcDeps<TCtx = unknown> {
  /** Main owns the canonical shell URL. Missing authority rejects presence/preferences IPC. */
  isPresenceShell?: (sender: PresenceSender & { getURL(): string }) => boolean;
  /** Native site windows need the same final plain-words error as the shell's SiteRecord. */
  onRestartStopped?: (input: { siteDir: string; detail: string }) => void;
  /** Repoint an existing own-site window after authentication of a replacement server. */
  onServerRestarted?: (input: { siteDir: string }) => Promise<void>;
  /** Internal live status belongs to this registration, never persisted with tracked sites. */
  siteRuntime?: ReadonlyMap<string, SiteRuntime>;
  /** Automatic starts recheck revoked intent after acquiring the existing serializer. */
  startAllowed?: () => boolean;
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
  removeSiteTree?: typeof removeSiteTree;
  /** Stop/Restart must withdraw pending hidden-window work before the server drains. */
  cancelPreviewCapture?: (required: { siteDir: string }, optional: {}) => void;
  /** Jini's existing shutdown tracker: Quit must also await Stops removed from openSites. */
  pendingTeardowns?: { track(required: { promise: PromiseLike<unknown> }): Promise<void> };
  adoptSiteDir: (input: AdoptSiteDirInput) => Promise<string>;
  addSitePointer: AddSitePointerLike;
  /** `site-archive-import.ts`'s real runner. */
  importSiteArchive: typeof import("./site-archive-import.ts").importSiteArchive;
  stopRunningImports: typeof import("./site-archive-import.ts").stopRunningImports;
  /** Injected for tests; defaults to `agent-plugin-tokens.ts`'s CLI-backed lister. */
  listTokenSignInPlugins?: (input: { repoRoot: string; cliMode?: "source" | "compiled" }) => Promise<TokenSignInPlugin[]>;
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
  /** Profile-bound, read fresh at boot and Rescan; optional for older hosts and handler fakes. */
  siteFolders?: SiteFoldersPort;
  /** Production discovery runs filesystem probes off-thread; results grant no deletion authority. */
  discoverSites?: (required: { scanRoots?: string[] }, options?: {}) => Promise<string[]>;
  recentSiteDirs: () => string[];
  sharedSites?: SitesWorkspace;
  /** Stops a site another process serves (`external-site-stop.ts`). Absent: such a Stop is refused. */
  externalSites?: Pick<ExternalSiteStopper, "launcherOf" | "stop">;
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
  handleImportArchive,
  handleDelete,
  handleOpenExternal,
  handleStart,
  handleStop,
  handleRename,
  handleGetPreview,
  handleLocate,
  handleTokenSignInPlugins,
  rescanSites,
  registerSiteIpcHandlers,
};
export type { ProjectIpcDeps, SiteRow, OpenSiteEntry, OpenSites, RegistryRow, SiteTransitionsLike };
