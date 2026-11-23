import { readIdleSiteSleepMinutes } from "./site-view-preference.ts";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { cancel, createLifecycleApi, createSiteLifecycleCtx, manualStart, notePresence, startSite, stateFor, type SiteLifecycleCtx, type SiteLifecycleOptions } from "./project-ipc.site-lifecycle.ts";
import { registerIdleSiteSleepIpc } from "./site-view-preference.ts";
import { readTrackedSites } from "./tracked-sites.ts";
import { createDirectoryRelocationGate } from "@jini-ai/platform/fs";
import { classifySiteDirSafely } from "./site-dir-store.ts";
import { type ProjectIpcDeps, type ProjectSiteLifecycle, type SiteRow } from "./project-ipc.types.ts";
import { handleStart, handleStop, handleOpenExternal, handleGetPreview } from "./project-ipc.server.ts";
import { createSitePresence, type PresenceSender } from "@jini-ai/desktop-host/shell/site-presence";
import { handleList, rescanSites, handleAddSiteFolder, handleLocate } from "./project-ipc.catalog.ts";
import { planNewSiteDir, handleCreate, handleTokenSignInPlugins } from "./project-ipc.create.ts";
import { handleDelete } from "./project-ipc.delete.ts";
import { handleRename } from "./project-ipc.rename.ts";
import { handleAddSite, handleImportArchive } from "./project-ipc.import.ts";


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

export const SITE_IPC_CHANNELS = Object.freeze({
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
  cancelImport: "runner:sites:cancel-import",
  rename: "runner:sites:rename",
  preview: "runner:sites:preview",
  locate: "runner:sites:locate",
  tokenSignInPlugins: "runner:sites:token-sign-in-plugins",
});
const SITE_PRESENCE_CHANNEL = "runner:sites:presence";

/**
 * Registers the real `runner:sites:*` handlers, including discovery-folder settings.
 *
 * @param deps
 * @param deps.openSites live open sites, keyed by site dir — `main.ts`'s own module-level
 *   store, passed in rather than imported. `Map`-compatible; in production it is
 *   `@jini-ai/sidecar/supervisor`'s supervisor, which additionally drops an entry whose child has died and
 *   answers `lastExitOf` about it. A sites-home-opened (embedded-tab) entry carries no `window`; only
 *   own-server-mode entries do.
 * @param deps.serializer per-site-dir operation serializer (`@jini-ai/sidecar/supervisor`).
 * @param deps.projectsPath `tracked-sites.ts`'s tracked-project JSON file.
 * @param deps.registryPath crash-safety registry directory (`site-child-registry.ts`), for
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
 * @param deps.recordSiteClosed `site-child-registry.ts`'s crash-safety row remover.
 * @param deps.readRegistry `site-child-registry.ts`'s crash-safety registry reader, used by
 *   {@link liveForeignServers} to see a SIBLING app instance's open sites — which `openSites`, being
 *   this process's own memory, cannot.
 * @param deps.isLiveServeRow `site-child-registry.ts`'s "is this row's pid still its own live
 *   `tovu serve`" identity proof, so a stale or recycled pid can never block a delete.
 * @param deps.ctx `{cliMode, registryPath}` — passed to `openSiteServer` with the site dir.
 * @param options Injected clock/scheduler and preference reader for deterministic lifecycle tests.
 * @returns Presence, confirmed-exit recovery and one-pass maintenance; dispose revokes automatic
 *   starts, retry timers and sender hooks. Start/Stop remain on the existing per-directory serializer.
 * @example const sites = registerSiteIpcHandlers(deps, { now }); await sites.maintain({ snapshot }, {});
 * @complexity O(1) registration; O(s) retained policy/observation state for s sites. Maintenance
 *   costs O(s*p) snapshot lookups; retry decisions use Jini's bounded rolling failure window.
 */
export function registerSiteIpcHandlers<TCtx>(deps: ProjectIpcDeps<TCtx>, options: SiteLifecycleOptions = {}): ProjectSiteLifecycle {
  const preferencePath = () => path.join(path.dirname(deps.statePath), 'desktop-preferences.json');
  const ctx = createSiteLifecycleCtx<ProjectIpcDeps<TCtx>>({ deps, ports: { handleStart, handleStop }, options,
    sleepMinutes: () => readIdleSiteSleepMinutes({ preferencePath: preferencePath() }) });
  const presence = createSitePresence({ allowed: deps.isPresenceShell ?? (() => false),
    trackedIds: () => new Set(readTrackedSites({ projectsPath: deps.projectsPath }).map(row => row.siteDir)),
  }, { hasSiteWindow: ({ siteId }, _options = {}) => ctx.keptAwake || Boolean(ctx.states.get(siteId)?.keepAwake) || Boolean(deps.openSites.get(siteId)?.window), onRelease: () => notePresence({ ctx }) });
  ctx.presence = presence;
  deps.ipcMain.handle(SITE_PRESENCE_CHANNEL, ({ sender }, input: { siteIds?: unknown } | undefined) => {
    notePresence({ ctx });
    presence.replace({ sender, siteIds: input?.siteIds });
    notePresence({ ctx });
  });
  // The state and preferences files share the launch's userData folder, including E2E profiles.
  // Keep registration here: the original independent UI slice and the lifecycle share this profile.
  const isSleepPreferenceSender = deps.isPresenceShell ?? (() => false);
  const offSleep = registerIdleSiteSleepIpc<PresenceSender & { getURL(): string }>({ ipcMain: deps.ipcMain, allowed: ({ sender }) => isSleepPreferenceSender(sender),
    preferencePath });
  registerSiteCrudHandlers({ deps, ctx });
  registerSiteSettingsHandlers({ deps });
  registerSiteImportHandlers({ deps, ctx });
  const { cancelAll, ...lifecycle } = createLifecycleApi({ ctx });
  return { ...presence, ...lifecycle, dispose: () => {
    cancelAll();
    presence.dispose();
    deps.ipcMain.removeHandler?.(SITE_PRESENCE_CHANNEL);
    offSleep();
  } };
}

/** List/create/delete/start/stop/keep-running channels. Handlers share the live host ports: settings
 * and discovery may be supplied after registration, so they are read at dispatch and the
 * registration-owned runtime is passed explicitly, without mutating deps.
 */
function registerSiteCrudHandlers<TCtx>({ deps, ctx }: { deps: ProjectIpcDeps<TCtx>; ctx: SiteLifecycleCtx<ProjectIpcDeps<TCtx>> }, _optional = {}): void {
  const states = ctx.states;
  const classifySiteDir = deps.classifySiteDir ?? classifySiteDirSafely;
  const relocationGate = createDirectoryRelocationGate<SiteRow>({
    directoryOf: ({ row }) => row.siteDir,
    classifyDirectory: ({ directory }) => classifySiteDir({ dir: directory }),
  });
  deps.ipcMain.handle(SITE_IPC_CHANNELS.list, () => handleList({ ...deps, siteRuntime: states, relocationGate }));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.planNewDir, (_event, input) => ({
    path: planNewSiteDir({ name: input?.name }, { workspace: deps.sharedSites }), homeDir: os.homedir(),
  }));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.create, (_event, input) => handleCreate(input, { ...deps, siteRuntime: states }));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.delete, (_event, id) => {
    cancel({ ctx, siteDir: id, forget: true });
    return handleDelete({ id, deps });
  });
  deps.ipcMain.handle(SITE_IPC_CHANNELS.openExternal, (_event, input) => handleOpenExternal(input, deps));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.start, (_event, id) => {
    manualStart({ ctx, siteDir: id });
    return startSite({ ctx, siteDir: id, state: stateFor({ ctx, siteDir: id }) }, { manual: true });
  });
  deps.ipcMain.handle(SITE_IPC_CHANNELS.stop, (_event, id) => {
    cancel({ ctx, siteDir: id });
    return handleStop({ id, deps: { ...deps, siteRuntime: states } });
  });
  deps.ipcMain.handle(SITE_IPC_CHANNELS.keepRunning, ({ sender }, input: { id?: unknown } | undefined) => keepSiteRunning({ deps, ctx, sender, input }));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.rescan, () => rescanSites({ ...deps, siteRuntime: states }));
}

/** Keep one tracked site running from the desktop window; the choice survives automatic recovery. */
function keepSiteRunning<TCtx>({ deps, ctx, sender, input }: {
  deps: ProjectIpcDeps<TCtx>; ctx: SiteLifecycleCtx<ProjectIpcDeps<TCtx>>; sender: PresenceSender & { getURL(): string }; input: { id?: unknown } | undefined;
}, _optional = {}): void {
  if (sender.isDestroyed() || !deps.isPresenceShell?.(sender)) throw new Error('Keep running is only available from the desktop window.');
  const siteDir = input?.id;
  if (typeof siteDir !== 'string' || !readTrackedSites({ projectsPath: deps.projectsPath }).some(site => site.siteDir === siteDir)) {
    throw new Error('Keep running needs a tracked site.');
  }
  // Preserve the choice across automatic recovery; Stop/delete/manual Start release it in cancel.
  const state = stateFor({ ctx, siteDir });
  if (state.cancelled) {
    // A failed Stop revoked the old intent. Replace it so queued work stays revoked while
    // this explicit choice restores memory limits and crash recovery for the live site.
    ctx.states.set(siteDir, { ...state, cancelled: false, keepAwake: true, starting: undefined });
  } else state.keepAwake = true;
}

/** Sites-home, settings and sites-folder channels. */
function registerSiteSettingsHandlers<TCtx>({ deps }: { deps: ProjectIpcDeps<TCtx> }, _optional = {}): void {
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
}

/** Rename, add, import, preview, locate and token-plugin channels. */
function registerSiteImportHandlers<TCtx>({ deps, ctx }: { deps: ProjectIpcDeps<TCtx>; ctx: SiteLifecycleCtx<ProjectIpcDeps<TCtx>> }, _optional = {}): void {
  const states = ctx.states;
  deps.ipcMain.handle(SITE_IPC_CHANNELS.rename, (_event, input) => handleRename(input, { ...deps, siteRuntime: states }));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.addSite, (_event, input) => handleAddSite({ ...deps, siteRuntime: states }, input ?? {}));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.importArchive, (_event, input) => handleImportArchive(input, { ...deps, siteRuntime: states }));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.cancelImport, () => deps.stopRunningImports({}, { reason: "cancel" }));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.preview, (_event, id) => handleGetPreview({ id, deps }));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.locate, (_event, id) => handleLocate({ id, deps: { ...deps, siteRuntime: states } }));
  deps.ipcMain.handle(SITE_IPC_CHANNELS.tokenSignInPlugins, () => handleTokenSignInPlugins(deps));
}
