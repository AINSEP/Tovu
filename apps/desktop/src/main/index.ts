import { migrateNestedSitesHome } from "../nested-sites-migration.ts";
import { createSitesWorkspace, rememberSharedSiteOpen, attachRunningSite } from "../shared-sites.ts";
/**
 * @file `apps/desktop` — an Electron shell around the SAME Tovu that `npm run dev` boots, now
 * multi-site: several sites can be open, each in its own window, each spawning its own `tovu serve`.
 *
 * This directory is deliberately additive and self-contained. Nothing outside it imports it,
 * nothing outside it references it, and `development/scripts/dev.mjs` is untouched — deleting
 * `apps/desktop/` returns the repo to exactly its previous state. That is the whole point: the
 * desktop mode is a second CONSUMER of the existing product, never a fork of it.
 *
 * Three boot modes, one product:
 *
 * 0. **Sites Home** — the DEFAULT since 2026-09-06. Opens Tovu-Runner's ported renderer
 *    (`src/renderer/`, built to `dist/renderer/index.html`) instead of any site's admin — its
 *    Projects screen, now the app's actual front page. Opening a project embeds it as a TAB in this
 *    SAME window, in a `<webview>` (`renderer/app/SiteWorkspace.tsx`), rather than popping it into its
 *    own `BrowserWindow` — matching Tovu-Runner's own tabbed UI, which is the reference this was
 *    built against. `list`/`create`/`delete`/`open-external`/`start` are real (`src/project-ipc.ts`),
 *    `start` routing a tab's first open through `openSiteServer`'s `serializer`-guarded spawn-or-reuse
 *    below (the sites-home counterpart of `openSiteWindow`, spawn-only, no window); `stop` stays a
 *    throwing stub — no control in the per-project bar calls it yet. See `sitesUiRequested`'s own doc
 *    for exactly which env vars bypass this default and fall through to modes 1/2 instead.
 *
 * 1. **Attach** (`TOVU_DESKTOP_URL` set). The window loads a stack someone else already started —
 *    normally the `npm run dev` pair (API on :3000, admin Vite on :5173). Nothing is spawned, so
 *    web mode and desktop mode run side by side against the same server. Single-site only — there
 *    is exactly one URL to attach to — and unrelated to everything else below. Bypasses the sites
 *    home UI unconditionally: an automation/dev workflow that already names its one destination has no
 *    use for a project picker.
 *
 * 2. **Own server** (`TOVU_DESKTOP_SITE_DIR` or `TOVU_DESKTOP_SITE_DIRS` set). Spawns Tovu's OWN
 *    `tovu serve <dir>` CLI as a child per open site and loads the port each one reports. `tovu
 *    serve` is already the packaged single-site entry point — it boots the site dir, opens
 *    `<dir>/content.db`, wires the admin SPA and starts the agent daemon
 *    (`apps/website/src/cli/commands/serve.ts`). The shell therefore needs no Tovu-side change to
 *    open a second, third, or Nth site: `src/tovu-server.ts`'s `startTovuServer` was already a
 *    pure `{repoRoot, siteDir, port} -> handle` function with no single-instance assumption
 *    anywhere in it. Also bypasses the sites home UI unconditionally, same reasoning as attach mode —
 *    this is what keeps every `TOVU_DESKTOP_SITE_DIR`-driven E2E spec and any other automation
 *    byte-for-byte unaffected by the sites home UI becoming the default.
 *
 * **Multi-site, concretely (own-server/attach modes):**
 * - `openSites` (a `Map<siteDir, {server, window?}>`) replaces the old single `tovuServer` variable.
 *   The sites home UI (mode 0) shares this same map but never sets `window` — see `openSiteServer`.
 * - Each open site gets its own `BrowserWindow`, titled with the site's own name — Electron's native
 *   `role: "windowMenu"` (macOS) then lists every open window and switches between them for free.
 *   That IS the site switcher: no custom panel was needed, every open site is just another window.
 *   The sites home UI's own switcher is its tab strip instead (`renderer/app/TabStrip.tsx`) — one window, N tabs.
 * - "Open Site…" (File menu) runs the folder picker for a NEW site, independent of whichever sites
 *   are already open. "Open Recent" lists `site-dir-store.ts`'s existing MRU.
 * - `keyed-serializer.ts` serializes opens PER SITE DIR, so a fast double-click on the same recent-
 *   site menu entry cannot double-spawn a `tovu serve` for it (Tovu-Runner's `serializeByProject`
 *   pattern, generalized).
 *
 * **Crash-safety**, now in scope (`site-process-registry.ts`): every open site's `{siteDir, port,
 * workspaceId, pid}` is persisted to a small JSON registry the moment its `tovu serve` reports ready,
 * and removed the moment it is stopped deliberately (a window closed on Windows/Linux, or the app
 * quit cleanly). macOS window close retains the server and registry until an explicit stop/quit. If
 * Electron itself is hard-killed (SIGKILL, a crash, a forced logout) before that removal runs, the
 * NEXT launch's `reconcileOrphans()` finds the stale row, proves the pid is STILL that row's own
 * `tovu serve` (identity-before-kill — see that file's own header), and terminates it before any
 * window opens. This was `main.js`'s own prior comment's deferred item: "that machinery belongs
 * with the fleet supervisor... reported rather than ported." It is now built, sized to what this
 * shell actually needs (not Tovu-Runner's full fleet registry). That reconciliation runs for EVERY
 * boot mode ({@link reconcileOrphansOnBoot}, above the mode split); it lived inside own-server mode
 * alone until 2026-09-06, which left the sites home UI — the default, and the mode that actually produces
 * these rows — leaking a stranded child per open site on every hard kill.
 *
 * **The `dist/` schema-skew fix**: own-server mode now runs the CLI's own TypeScript source under
 * `--import tsx` by default (`TOVU_DESKTOP_CLI_MODE=source`), not the compiled `dist/` this
 * checkout's `bin.tovu` names. `dist/src/cli/main.js` here was last built 2026-08-28 (schema v50);
 * current source is v57 — own-server mode rejected every site created from current source with
 * `SITE_NEWER_THAN_RUNTIME`. Rebuilding `dist/` was not an option (`npm run build` is gated behind
 * `check-no-linked-jini.mjs`, and this checkout deliberately keeps 13 `@jini-ai/*` packages symlinked
 * to a local Jini checkout for active development); running the CLI from source instead — the same
 * way `development/scripts/dev.mjs` already runs `index.ts` under `npx tsx watch` — removes the skew
 * without touching the build or the Jini links. See `tovu-server.ts`'s `buildCliSpawnPlan` for the
 * mode's own default (unchanged, `"compiled"`, so every existing test keeps its exact prior
 * behavior) versus this file's production default (`"source"`, set here via the env var).
 *
 * `TOVU_DESKTOP_SELFTEST=1` makes the shell prove itself and exit instead of staying open: it
 * reports every opened window's URL and title, then quits 0 once all have loaded (1 on any failure).
 *
 * Environment:
 * - `TOVU_DESKTOP_UI`        — `"runner"` opens the ported sites home renderer explicitly (redundant
 *   with the default now, kept for anyone who has it set); any other non-empty value forces the
 *   pre-flip behavior even with no site-selecting env var set. See `sitesUiRequested`.
 * - `TOVU_DESKTOP_URL`       — attach to this origin instead of spawning any server (single-site);
 *   also bypasses the sites home UI default.
 * - `TOVU_DESKTOP_SITE_DIR`  — force a single site dir for own-server mode, skipping the picker;
 *   also bypasses the sites home UI default.
 * - `TOVU_DESKTOP_SITE_DIRS` — comma-separated site dirs to open at launch, one window each —
 *   bypasses the picker/MRU/dev-fallback precedence entirely, and the sites home UI default. Chiefly
 *   for verification/automation (proving N sites boot concurrently without driving the menu by
 *   hand); a real user reaches the
 *   same result through "Open Site…"/"Open Recent" after the first site opens.
 * - `TOVU_DESKTOP_PORT`      — pin the FIRST own-server site's port; every other open site still
 *   self-allocates (two sites must never collide).
 * - `TOVU_DESKTOP_CLI_MODE`  — `"source"` (default) or `"compiled"`; see the schema-skew note above.
 * - `TOVU_DESKTOP_SELFTEST`  — `1` to verify and exit rather than staying open.
 * - `TOVU_DESKTOP_USER_DATA_DIR` — E2E-only. Overrides `app.getPath("userData")`. Unset in every
 *   real launch — see the constant's own doc for why this exists instead of scoping `HOME`.
 */
import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog, shell, Menu, ipcMain, net, session, screen, crashReporter, webContents } from "electron";
import { createNativeAgentRuntime } from "@jini-ai/agent-runtime";
import { createElectronUrlCapturePool } from "@jini-ai/desktop-host/electron";

import { startTovuServer, DEFAULT_STOP_GRACE_MS } from "../tovu-server.ts";
import { startDesktopCaptureBridge } from "../desktop-capture.ts";
import { createDesktopMcpHttpRuntime } from "../desktop-mcp-http.ts";
import { writeNodeToolchain, buildNodeToolchainEnv } from "../node-toolchain.ts";
import { resolveAdminDevProxyUrl } from "../admin-dev-proxy.ts";
// Launch-time env decisions (boot mode, CLI mode, pinned site dirs, the rejected-default clause)
// live in `startup-env.ts`, where they are tested; this file passes `process.env` to them.
import { isSupervisedSiteUrl } from "../supervised-site-url.ts";
import { readSiteName as readSiteNameIn } from "../site-name.ts";
import { isUnattendedSiteLaunch as isUnattendedSiteLaunchIn, resolveCliMode as resolveCliModeIn, type CliMode, type RejectedDefault } from "../startup-env.ts";
import { resolveSiteDir, resolveOrInitSiteDir, adoptSiteDir, classifySiteDirSafely, stateFilePath, existingRecentSiteDirs, SiteDirSelectionCancelled } from "../site-dir-store.ts";
import { registryDirPath, reconcileOrphans, recordSiteOpened, recordSiteClosed, readRegistry, isLiveServeRow } from "../site-process-registry.ts";
import { createExternalSiteStopper } from "../external-site-stop.ts";
import { createKeyedSerializer } from "../keyed-serializer.ts";
import { createSiteSupervisor } from "../site-supervisor.ts";
import { createSiteTransitions } from "../site-transitions.ts";
// Shared shutdown rules and their rationale now live in Jini's desktop-host/shutdown modules.
// Teardown rationale: Jini packages/desktop-host/src/shutdown/shutdown-tracker.ts.
// Signal rationale: Jini packages/desktop-host/src/shutdown/quit-signals.ts.
import { createShutdownTracker, routeQuitSignals, decideBeforeQuit } from "@jini-ai/desktop-host/shutdown";
// Repeated-quit/drain rationale: Jini/packages/desktop-host/src/shutdown/quit-drain-gate.ts.
import { isShellPageUrl } from "../window-navigation-policy.ts";
import { registerSpeechIpc } from "../speech/speech-ipc.ts";
import { registerFindInPageIpc, relayFindResults } from "../find-in-page-ipc.ts";
import { registerRunnerIpcStubs } from "../runner-ipc-stubs.ts";
import { registerAppVersionIpc } from "../app-version-ipc.ts";
import { createDesktopResources } from "../desktop-resources.ts";
import { reportDesktopServerExit } from '../product-telemetry.ts';
import { registerResourcesIpc } from "../resources-ipc.ts";
import { runOwnerStoreCli } from "../owner-store-cli.ts";
import { createOwnerStoreController, importConfirmation, registerOwnerStoreIpc, settleLegacyOwnerStore } from "../owner-store-ipc.ts";
import { listProcessUsage } from "@jini-ai/platform/process";
import { totalmem } from "node:os";
import { createUpdateCheckNow, registerUpdateCheckIpc } from "../update-check-now.ts";
import { armDesktopOwnerSignIn, redeemBootSession, sitePartition, ensureSiteSession, endSiteSession } from "../desktop-auth.ts";
import { sitesFilePath, seedDevFallbackSite, retireDevFallbackSite, migrateLegacyDismissals, readTrackedSites } from "../tracked-sites.ts";
import { writeSiteName } from "../site-config.ts";
import { readPreviewVersion, readPreviewDataUrl, writePreview, deletePreview, sweepOrphanedPreviews } from "../site-preview-store.ts";
import { createSiteThemePreviewSubscriptions, openSiteThemePreviewStream } from "../site-theme-preview.ts";
import { registerSiteThemePreviewIpc } from "../site-theme-preview-ipc.ts";
import { createSitePreviewScheduler } from "../site-preview-scheduler.ts";
import { registerSiteIpcHandlers, rescanSites } from "../project-ipc.ts";
import { createSiteFolders } from "../site-folders.ts";
import { discoverDesktopSites, startDesktopSiteDiscovery } from "../site-discovery.ts";
import { addSitePointer } from "../add-site-pointer.ts";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveDesktopRoots } from "../packaged-paths.ts";
import { readWindowBounds, writeWindowBounds } from "../window-bounds-store.ts";
import { registerSpellCheckContextMenu } from "../spellcheck-menu.ts";
import { readAutomaticUpdates, writeAutomaticUpdates } from "../desktop-update-preference.ts";
import { readMaximumLiveSiteViews, writeMaximumLiveSiteViews, refreshMaximumLiveSiteViewsMenu, registerSiteViewPreferenceIpc } from "../site-view-preference.ts";
import { SITE_VIEW_PREFERENCE_CHANNELS } from "../contracts/site-view-preference.ts";
import { createLivePreviewGuests } from "./boot/site-preview-guests.ts";
import { presenceDirPath } from "../instance-presence.ts";
// Owner 2026-10-06: DMG window already shows drag-to-Applications; prompt redundant.
// Restore the removed prompt imports, helper and call from git history, then re-enable wiring tests.
import type { MenuItemConstructorOptions, WebContents } from "electron";
import type { QuitPhase } from "@jini-ai/desktop-host/shutdown";
import type { SelftestTracker } from "../selftest-tracker.ts";
// The decisions this file wires live beside it in src/main/: windows/ (window and navigation policy), boot/
// (site spawn, previews, boot steps and failures), updates/ (updater, Settings menu, notices, telemetry).
import { promptForSiteDir as promptForSiteFolder } from "./windows/site-folder-prompt.ts";
import { createAppWindow } from "./windows/app-window.ts";
import { openSitesHomeWindow as openSitesHomeWindowWith } from "./windows/sites-home-window.ts";
import { openSiteWindow as openSiteWindowWith } from "./windows/site-window.ts";
import { installWebviewGuestPolicy } from "./windows/guest-navigation.ts";
import { adoptAndOpenSite as adoptAndOpenSiteWith, promptAndOpenNewSite as promptAndOpenNewSiteWith, type SiteOpenActionPorts } from "./windows/site-open-actions.ts";
import { applyDockIcon as applyDockIconWith } from "./windows/dock-icon.ts";
import { createDesktopUpdater, desktopUpdaterSkipReason } from "./updates/desktop-updater.ts";
import { explainOthersOpen, promptUpdateReady, showDesktopNotice as showNativeNotice, type DesktopNotice } from "./updates/native-notices.ts";
import { desktopPreferencesPath as preferencesPathIn, desktopSettingsMenu, ownServerMenuTemplate } from "./updates/settings-menu.ts";
import { armFirstProductConsent, createDesktopProductState, initializeDesktopProductTelemetry as initializeProductTelemetryIn } from "./updates/product-telemetry-boot.ts";
import { createSiteBackend } from "./boot/site-backend.ts";
import { createSitePreviewCapture, createPreviewTargetResolver, createListedPreviewRequests, sweepSitePreviewsOnBoot as sweepSitePreviewsOnBootIn, PREVIEW_CAPTURE_DEBOUNCE_MS } from "./boot/site-preview.ts";
import { reportBootFailure as reportBootFailureIn, buildSelftestTracker as buildSelftestTrackerIn } from "./boot/boot-failure.ts";
import { resolveStartupSiteDirs as resolveStartupSiteDirsIn, reconcileOrphansOnBoot as reconcileOrphansOnBootIn, bootOwnServerMode as bootOwnServerModeIn } from "./boot/own-server-boot.ts";
import { applyUserDataDir, chooseBootMode, prepareNodeToolchainEnv, settleDevFallbackRows, createSiteDiscoveryLanes, settleLegacyOwnerStoreOnStart as settleLegacyOwnerStoreOnStartIn } from "./boot/boot-steps.ts";
import { appWideMenuTemplate, openSingleWindow, runDesktopBoot, runSitesHomeBoot, type SingleWindowPorts } from "./boot/boot-sequence.ts";

/** `apps/desktop` (the `.asar` root when packaged). This file lives two levels below it, in
 *  `src/main/`; every bundled path below — preloads, renderer, icon, MCP bridge — is resolved from here. */
const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");


/** A resolved {@link startTovuServer} handle. `tovu-server.ts` does not export the type. */
type TovuServerHandle = Awaited<ReturnType<typeof startTovuServer>>;


/** One {@link openSites} entry. Only own-server mode's {@link openSiteWindow} sets `window`; a sites-home
 *  tab, opened through {@link openSiteServer}, has none. */
interface OpenSite {
  server: TovuServerHandle;
  window?: BrowserWindow;
  /** Identity for resource rows. Reopen a macOS window without consulting the recent-site list,
   *  which may have been cleared. */
  siteDir: string;
}

/** The per-launch inputs a site open reads: {@link bootOwnServerMode}'s `ctx`, or the sites-home
 *  branch's `sitesCtx`. */
interface SiteOpenCtx {
  cliMode: CliMode;
  statePath: string;
  registryPath: string;
  /** Own-server mode only: the pinned `TOVU_DESKTOP_PORT`, set by {@link resolveStartupSiteDirs}. */
  firstSitePort?: number;
}

/** Options for one site open. */
interface SiteOpenOptions {
  /** Pin this site's port. See {@link startSiteBackend}'s `options.port`. */
  port?: number;
}

/** Preload for every window this shell creates, regardless of boot mode — see `createWindow`. It
 *  is what makes `window.tovuVoice` exist inside Electron at all; see `preload-speech.cts`'s and
 *  `speech-ipc.ts`'s own headers for the wiring gap this closes (both were built and tested with
 *  neither this path nor {@link registerSpeechIpc} ever called from here).
 *
 *  The COMPILED file, not `src/speech/preload-speech.cts` itself: Electron's sandboxed preload loader
 *  runs neither TypeScript nor ESM, so `npm run build:preload` (`tsconfig.preload.json`) emits it
 *  here, the same way {@link SITES_PRELOAD_PATH} is built. `npm run desktop` and `npm run package`
 *  both run that build first. */
const SPEECH_PRELOAD_PATH = path.join(DESKTOP_ROOT, "dist", "speech", "preload-speech.cjs");

/** The built sites home renderer. `npm run build:renderer` produces it; `openSitesHomeWindow` reports its
 *  absence rather than opening a blank window on a source-only checkout. */
const SITES_RENDERER_PATH = path.join(DESKTOP_ROOT, "dist", "renderer", "index.html");

/** Preload for the SITES HOME window only. A native-ESM preload, which Electron 43 supports solely in an
 *  unsandboxed renderer — hence `sandbox: false` in {@link openSitesHomeWindow}, and hence site-admin
 *  windows keeping {@link SPEECH_PRELOAD_PATH} and `sandbox: true` untouched. It exposes BOTH
 *  `window.tovuRunner` and `window.tovuVoice`; see its own header on why the mic bridge had to be
 *  duplicated rather than shared. */
const SITES_PRELOAD_PATH = path.join(DESKTOP_ROOT, "dist", "preload", "preload.mjs");

/** The Tovu mark for the macOS dock tile — see {@link applyDockIcon}. Copied into this directory
 *  from the tovu-theme theme rather than referenced out of `sites/tovu-dev/`, which is a user's live
 *  site folder and not an asset source this app may depend on. */
const APP_ICON_PATH = path.join(DESKTOP_ROOT, "src", "renderer", "public", "brand", "tovu-app-icon.png");

const REPO_ROOT = path.resolve(DESKTOP_ROOT, "..", "..");

/**
 * Every root that differs between a checkout and a packaged `.app`, resolved once. See
 * `packaged-paths.ts` for what each one means and why the delete-guard containment boundary rides
 * along with `payloadRoot`. In dev these are byte-identical to the values this file derived from
 * {@link REPO_ROOT} directly before that module existed.
 *
 * `app.isPackaged` and `process.resourcesPath` are both readable at module load (Electron derives
 * them from the executable path, not from `whenReady`), so this stays a module constant next to the
 * paths it replaces rather than becoming boot-time state threaded through `ctx`.
 */
const DESKTOP_ROOTS = resolveDesktopRoots({
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  repoRoot: REPO_ROOT,
  documentsDir: app.getPath("documents"),
  appDataDir: app.getPath("appData"),
});

// This launch's `userData`, and the E2E-only `TOVU_DESKTOP_USER_DATA_DIR` override that wins over it.
// Must run before `app.whenReady()`; see `applyUserDataDir`'s doc (src/main/boot/boot-steps.ts) for why.
const userDataProfile = applyUserDataDir({ env: process.env, defaultUserDataDir: DESKTOP_ROOTS.userDataDir, resolvePath: (dir) => path.resolve(dir),
  setUserDataDir: (dir) => app.setPath("userData", dir), getUserDataDir: () => app.getPath("userData") });

// The bundled node/npm/npx shims' env, or `undefined` if writing them failed. Written once, after
// `userData` is set and before any site is served; see `prepareNodeToolchainEnv`'s doc.
const NODE_TOOLCHAIN_ENV = prepareNodeToolchainEnv({ userDataDir: app.getPath("userData"), electronPath: process.execPath,
  npmRoot: DESKTOP_ROOTS.npmRoot, writeNodeToolchain, buildNodeToolchainEnv, warn: (message) => console.warn(message) });

/**
 * The runnable Tovu tree: `dist/`'s CLI, `apps/admin/dist`, `apps/site-chat/dist` and the
 * `node_modules` they resolve against. The checkout itself in dev, `Resources/tovu/` when packaged.
 *
 * Replaces {@link REPO_ROOT} at every site that previously passed it downward. Note this is ALSO
 * what `project-delete-guard.ts` receives as its containment root — see `packaged-paths.ts`.
 */
const PAYLOAD_ROOT = DESKTOP_ROOTS.payloadRoot;
const SELFTEST = process.env.TOVU_DESKTOP_SELFTEST === "1";

/**
 * The site a checkout always has and a packaged app never does — `bootOwnServerMode`'s last
 * precedence tier, the sites home UI's first-launch seed, and the one directory
 * `migrateLegacyDismissals` can reason about.
 *
 * A named constant rather than three copies of the same `path.join` because those last two MUST be
 * the same directory to be correct at all: the migration records "the operator removed this" about
 * whatever it is pointed at, and the seed asks about whatever IT is pointed at. Pointed at
 * different folders they would silently stop talking about the same thing, and the symptom — a
 * deleted card coming back on one boot — would surface nowhere near the cause.
 */
const DEV_FALLBACK_SITE_DIR = DESKTOP_ROOTS.devFallbackSiteDir;

/**
 * Where a site created outside this shell is looked for at boot: the flat `sites/` directory a
 * checkout keeps, the same one {@link DEV_FALLBACK_SITE_DIR} sits in.
 *
 * A list because the shell has no single instances root to scan — unlike Tovu-Runner, whose
 * provisioner owns `<userData>/instances` and names every folder in it, this shell's
 * "+ Create website" asks the operator WHERE the site should live, so its projects are scattered
 * wherever they said. The profile's sites-folders settings also retain creation parents and
 * user-added roots; `rescanSites` reads them fresh alongside the recently-opened list.
 */
const SITE_SCAN_ROOTS = DESKTOP_ROOTS.siteScanRoots;
// Resolve from the payload, not the launcher's cwd; only source checkouts scan repo sites by default.
const sharedSites = createSitesWorkspace({}, { cwd: PAYLOAD_ROOT, sourceRoots: app.isPackaged ? [] : [path.join(REPO_ROOT, "sites")], catalogRecovery: true,
  appDataDir: userDataProfile.overridden ? app.getPath("userData") : undefined,
});
/** The sites-home `discoverSites` lanes: picker validation and a rescan never cancel each other. */
const siteDiscovery = createSiteDiscoveryLanes({ discover: ({ scanRoots, signal }) => discoverDesktopSites({ statePath: stateFilePath(app.getPath("userData")), scanRoots,
  workspaceOptions: { cwd: PAYLOAD_ROOT, sourceRoots: app.isPackaged ? [] : [path.join(REPO_ROOT, "sites")] } }, { signal }) });

// Only the payload child opens project.db or a legacy owner.db. Electron chooses the profile
// (Roaming on Windows) and the native backup picker; no path comes from the renderer.
const runOwnerStore: Parameters<typeof createOwnerStoreController>[0]["run"] = (input) =>
  runOwnerStoreCli({ ...input, repoRoot: PAYLOAD_ROOT, userDataDir: app.getPath("userData") }, { cliMode: resolveCliMode() });
const ownerStore = createOwnerStoreController({
  run: runOwnerStore,
  pickBackup: async () => {
    const filters = [{ name: "Tovu shared keys backup", extensions: ["tovu-owner-backup"] }];
    const pick = await dialog.showOpenDialog({ title: "Import shared keys", filters, properties: ["openFile"] });
    return pick.canceled ? null : pick.filePaths[0] ?? null;
  },
  confirmImport: async ({ report }) => {
    const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const options = { type: "question" as const, buttons: ["Import", "Cancel"], defaultId: 0, cancelId: 1, ...importConfirmation({ report }) };
    const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
    return response === 0;
  },
});

/** Desktop start: an empty legacy owner store (and its key, -wal, -shm) is deleted; one holding
 * keys is kept and the existing native notice says an import is available.
 */
function settleLegacyOwnerStoreOnStart(): void {
  void settleLegacyOwnerStoreOnStartIn({ userDataDir: app.getPath("userData"), settle: (input) => settleLegacyOwnerStore({ ...input, run: runOwnerStore }),
    removeFile: (file) => fs.rmSync(file, { force: true }), showNotice: showDesktopNotice, warn: (message) => console.warn(message) });
}


/**
 * `siteDir -> { server, window }` for every site this process currently has open. Replaces the
 * single-site `tovuServer` variable the shell used before multi-site.
 *
 * A `site-supervisor.ts` supervisor rather than a bare `Map` since D-06. The `Map` surface is
 * unchanged — every `get`/`set`/`has`/`delete`/`values`/`size` below and in `project-ipc.ts` means
 * exactly what it did — but it now also watches each entry's child and REMOVES an entry whose
 * `tovu serve` has died. Without that this map answered "was started", never "is alive": a crashed
 * site stayed `running` for the rest of the session, `openSiteServer` handed its dead handle back
 * to "Start site", and the 4 s renderer poll re-read an answer that could not change.
 */
const openSites = createSiteSupervisor<OpenSite>({
  onUnexpectedExit: (siteDir, exit, entry) => {
    reportDesktopServerExit({ tracker: productState.product.tracker, code: exit.code, signal: exit.signal });
    sitePreviewScheduler.cancel({ siteDir }, {});
    siteThemePreviews.stop({ siteDir }, {});
    // The row exists to let the NEXT launch reap a child this process left running. This one is
    // already gone, so the row is now a lie that `reconcileOrphans` would spend a `ps` call on.
    // Narrowed by pid: this instance's own file can also hold a still-draining earlier child's row
    // for this same site (D-07).
    recordSiteClosed(registryDirPath(app.getPath("userData")), siteDir, { pid: entry.server.pid });
    console.warn(`tovu desktop: ${siteDir}'s server exited on its own (code ${exit.code ?? "none"}, signal ${exit.signal ?? "none"}). Its tab will show as stopped; Start will spawn a fresh one.`);
  },
});

/** The product telemetry handle (a no-op until boot) and the listeners `before-quit` disposes. */
const productState = createDesktopProductState();
// One cache/sampler serves the chip, Resources panel and product observations in every boot mode.
const desktopResources = createDesktopResources({ desktopPid: process.pid, platform: process.platform,
  listUsage: () => listProcessUsage(), now: Date.now, totalMem: totalmem,
  listElectronMetrics: () => app.getAppMetrics(),
  // External handles belong to another launcher; the monitor covers only this desktop.
  openSites: () => [...openSites.values()].filter(entry => !entry.server.external)
    .map(entry => ({ id: entry.siteDir, pid: entry.server.pid })),
});

/** Bind the approved product ports before a window or child can send a signal. */
async function initializeDesktopProductTelemetry(): Promise<void> {
  const preferencePath = desktopPreferencesPath();
  await initializeProductTelemetryIn({ app, processInfo: process, crashReporter, ipcMain, webContents, windows: BrowserWindow,
    preferencePath, isShellPage, monitor: desktopResources, state: productState,
    armConsent: () => armFirstProductConsent({ app, dialog, menu: Menu, preferencePath, state: productState }) });
}

/** Main owns the authenticated transport; tabs hold disposable claims, never credentials. */
const siteThemePreviews = createSiteThemePreviewSubscriptions({ ports: {
  current: ({ siteDir }) => {
    const entry = openSites.get(siteDir);
    return entry ? { port: entry.server.port, workspaceId: entry.server.workspaceId,
      partition: sitePartition(siteDir), lifecycle: entry.server } : undefined;
  },
  open: ({ target, getRevision, onFrame }) => openSiteThemePreviewStream({
    target, getRevision, onFrame,
    fetch: (url, init) => session.fromPartition(target.partition).fetch(String(url), { ...init, credentials: "include" }),
  }),
} });

/** Serializes site opens PER SITE DIR — see this file's own header on why. */
const serializer = createKeyedSerializer();

/** Which sites are mid-start or mid-stop right now — the fact {@link openSites} cannot express,
 *  since its answer is two-valued and both transitions take seconds of wall clock. Read by
 *  `project-ipc.ts`'s `buildSiteRecord`, written by its `handleStart`/`handleStop`; see
 *  `site-transitions.ts` for why it is not folded into the supervisor. */
const siteTransitions = createSiteTransitions();

/** Teardowns a window's `closed` handler or a card Stop has STARTED but not finished, so `before-quit` below can
 *  wait for them — see `shutdown-tracker.ts`'s own header for the leak this closes (D-09). */
// D-09: closed removes openSites before loopback logout/server.stop settles. The last window
// can therefore leave an empty map with a detached tovu serve still holding content.db open;
// if its crash-safety row was already removed, the next launch cannot discover that orphan.
const pendingTeardowns = createShutdownTracker({});

/** One app-owned Jini runtime, shared with desktop chat when its paused boot wiring is enabled. */
const desktopAgentRuntime = createNativeAgentRuntime({ env: process.env });
// Electron partitions live for the process; every site's bridge must share their FIFO leases.
const capturePool = createElectronUrlCapturePool({});

/** Where `before-quit`'s graceful multi-site shutdown is: `"idle"`, `"draining"` (stopping every open
 *  site and waiting on in-flight teardowns), or `"drained"` (finished, its own `app.quit()` going
 *  through). `decideBeforeQuit` reads it — see `quit-drain-gate.ts` for why an attempt mid-drain is
 *  held rather than let through. */
let quitPhase: QuitPhase = "idle";

/** The auto-updater's lifecycle (`src/main/updates/desktop-updater.ts`). `before-quit` asks it whether
 *  the final quit installs an update. */
const desktopUpdater = createDesktopUpdater({ ports: {
  automaticUpdates: () => readAutomaticUpdates({ preferencePath: desktopPreferencesPath() }),
  saveAutomaticUpdates: ({ enabled }) => writeAutomaticUpdates({ preferencePath: desktopPreferencesPath(), enabled }),
  skipReason: currentUpdaterSkipReason,
  // Imported here, not at the top, so a dev launch never loads it.
  loadNativeUpdater: async () => (await import("electron-updater")).default.autoUpdater,
  quitIdle: () => quitPhase === "idle",
  controllerDeps: () => ({ platform: process.platform, pid: process.pid, presenceDir: presenceDirPath(app.getPath("userData")),
    now: Date.now, explainOthersOpen: (count: number) => explainOthersOpen({ dialog, count }), quit: () => app.quit(),
    log: (message: string) => console.log(`[tovu-desktop] ${message}`) }),
  promptUpdateReady: ({ version }) => promptUpdateReady({ dialog, windows: BrowserWindow,
    automaticUpdates: () => readAutomaticUpdates({ preferencePath: desktopPreferencesPath() }), version }),
  log: (message) => console.log(`[tovu-desktop] ${message}`),
  logError: (message) => console.error(`[tovu-desktop] ${message}`),
} });

/**
 * How long a graceful quit gets before `app.exit(1)`. The first termination signal arms it
 * (`quit-signals.ts`), and so does `before-quit` when its drain starts. The drain stops every open
 * site in parallel, and each `server.stop()` escalates to SIGKILL after one `DEFAULT_STOP_GRACE_MS`,
 * then allows one more grace for the exit event, regardless of how many sites are open. It waits on
 * `pendingTeardowns`, whose loopback logout has no timeout of its own, and only this deadline bounds that.
 */
const QUIT_DEADLINE_MS = DEFAULT_STOP_GRACE_MS * 3;


/** Ask the user which folder holds their site; cancelling returns `null`. See `site-folder-prompt.ts`. */
function promptForSiteDir(rejectedDefault: RejectedDefault | null): Promise<string | null> {
  return promptForSiteFolder({ rejectedDefault, dialog: { showOpenDialog: (options) => dialog.showOpenDialog(options) }, selftest: SELFTEST });
}


// Wiring edge for the launch-time decisions in `startup-env.ts` / `site-name.ts`: each binds this
// process's own `process.env`, packaged CLI default or filesystem, keeping the call sites (and the
// source-shape wiring tests that read them) unchanged.
function resolveCliMode(): CliMode { return resolveCliModeIn({ env: process.env, defaultCliMode: DESKTOP_ROOTS.defaultCliMode }); }
function isUnattendedSiteLaunch(): boolean { return isUnattendedSiteLaunchIn({ env: process.env }); }
function readSiteName(siteDir: string): string { return readSiteNameIn({ siteDir }); }

/** One sandboxed admin window (own-server site or attach mode) — see `app-window.ts`. */
function createWindow(url: string, title?: string, partition?: string): BrowserWindow {
  return createAppWindow(
    { url, createBrowserWindow: (options) => new BrowserWindow(options), preloadPath: SPEECH_PRELOAD_PATH, openExternal: (target) => void shell.openExternal(target) },
    { title, partition, selftest: SELFTEST, trackWindow: (window) => selftestTracker?.add(window) },
  );
}

/** Open the sites home UI (boot mode 0); `null` when the renderer is not built. See `sites-home-window.ts`. */
function openSitesHomeWindow(): BrowserWindow | null {
  return openSitesHomeWindowWith({ ports: {
    rendererPath: SITES_RENDERER_PATH, sitesPreloadPath: SITES_PRELOAD_PATH, guestPreloadPath: SPEECH_PRELOAD_PATH,
    userDataDir: app.getPath("userData"), fileExists: (file) => fs.existsSync(file),
    createBrowserWindow: (options) => new BrowserWindow(options), getAllDisplays: () => screen.getAllDisplays(),
    readWindowBounds, writeWindowBounds, isSupervisedGuestUrl,
    registerPreviewGuest: ({ window, webContents: contents }) => livePreviewGuests.register({ owner: window, guest: contents as WebContents }),
    openExternal: (target) => void shell.openExternal(target),
    relayFindResults, registerSpellCheck: ({ webContents }) => registerSpellCheckContextMenu({ webContents, menuBuilder: Menu }),
    showErrorBox: (title, message) => dialog.showErrorBox(title, message), logError: (message) => console.error(message),
    setExitCode: (code) => { process.exitCode = code; }, quit: () => app.quit(),
  } }, { selftest: SELFTEST, trackWindow: (window) => selftestTracker?.add(window) });
}

/** One main owns the desktop capability, regardless of its window/site count. It is never
 * republished when this instance attaches to another main's server. */
const desktopMcpHttp = createDesktopMcpHttpRuntime({ context: {
  projectsPath: sitesFilePath(app.getPath("userData")),
  revealPath: async (target) => { shell.showItemInFolder(target); },
}, warn: (message) => console.warn(message) });

/** Spawn-or-attach one site's `tovu serve`, seed its admin session, bind the desktop capability —
 *  see `site-backend.ts`. Shared by own-server windows and sites-home tabs. */
const siteBackend = createSiteBackend<TovuServerHandle>({ ports: {
  partitionFor: ({ siteDir }) => sitePartition(siteDir),
  attachRunning: ({ siteDir }) => attachRunningSite({ workspace: sharedSites, dir: siteDir }),
  rememberOpen: ({ siteDir }) => rememberSharedSiteOpen({ workspace: sharedSites, dir: siteDir }),
  resolveAdminDevProxyUrl: () => resolveAdminDevProxyUrl({ isPackaged: app.isPackaged, env: process.env }),
  startCaptureBridge: () => startDesktopCaptureBridge({ createWindow: (options) => new BrowserWindow(options), capturePool }),
  desktopMcpEnv: () => desktopMcpHttp.environment({}),
  connectDesktopMcp: server => desktopMcpHttp.connectSite({ adminUrl: server.adminUrl, onExit: listener => server.onExit(listener) }),
  startServer: (input) => startTovuServer({ ...input,
    isPackaged: app.isPackaged, productTelemetry: productState.product.launch, repoRoot: PAYLOAD_ROOT }),
  baseToolchainEnv: NODE_TOOLCHAIN_ENV,
  recordSiteOpened: ({ registryPath, row }) => recordSiteOpened(registryPath, row),
  now: Date.now,
  armOwnerSignIn: ({ partition, adminUrl, capability }) => armDesktopOwnerSignIn({ session: session.fromPartition(partition), adminUrl, capability }),
  ensureSession: ({ partition, adminUrl, redeem }) => ensureSiteSession({ net, session: session.fromPartition(partition), adminUrl, redeem }),
  redeemBootSession: ({ partition, adminUrl, bootToken }) => redeemBootSession({ net, session: session.fromPartition(partition), adminUrl, bootToken }),
  log: (message) => console.log(message), warn: (message) => console.warn(message), error: (message) => console.error(message),
  openSites,
  schedulePreview: () => {}, // Readiness of a public live guest owns thumbnail scheduling.
  syncThemePreview: ({ siteDir }) => siteThemePreviews.sync({ siteDir }, {}),
} });

/** Resolve through the existing canonical site/server owner, never through a renderer claim. */
const currentPreviewTarget = createPreviewTargetResolver({ ports: { openSite: ({ siteDir }) => openSites.get(siteDir),
  readLease: ({ siteDir }) => sharedSites.running({ path: siteDir }).read({}), partitionFor: ({ siteDir }) => sitePartition(siteDir) } });
const livePreviewGuests = createLivePreviewGuests<BrowserWindow, WebContents>({
  resolve: ({ url }) => {
    let origin: string;
    try { origin = new URL(url).origin; } catch { return undefined; }
    for (const [siteDir, entry] of openSites) {
      if (new URL(entry.server.origin).origin !== origin) continue;
      const target = currentPreviewTarget({ siteDir });
      if (target) return { siteDir, ...target };
    }
    return undefined;
  },
  allowed: ({ owner, guest, target }) => !owner.isDestroyed()
    && owner.webContents.getURL() === pathToFileURL(SITES_RENDERER_PATH).href
    && guest.hostWebContents === owner.webContents
    && guest.session === session.fromPartition(target.partition),
  schedule: input => sitePreviewScheduler.schedule(input),
  cancel: input => sitePreviewScheduler.cancel(input),
});
const captureSitePreview = createSitePreviewCapture({ ports: {
  liveGuest: input => livePreviewGuests.liveGuest(input),
  writePreview: ({ siteDir, png }) => writePreview(app.getPath("userData"), siteDir, png),
  warn: message => console.warn(message),
} });
const sitePreviewScheduler = createSitePreviewScheduler<ReturnType<typeof setTimeout>>({ ports: {
  current: currentPreviewTarget, capture: captureSitePreview,
  schedule: ({ work, delayMs }) => setTimeout(work, delayMs), cancel: ({ timer }) => clearTimeout(timer),
} }, { debounceMs: PREVIEW_CAPTURE_DEBOUNCE_MS });

/** Legacy server-window callers stay inert: never allocate a guest solely for a thumbnail. */
function scheduleSitePreview(_siteDir: string): void {}
const requestListedSitePreview = createListedPreviewRequests({ schedule: () => {} });

/** Open (or focus) one own-server site's window — see `site-window.ts`. Run through `serializer.run(siteDir, …)`. */
async function openSiteWindow(siteDir: string, ctx: SiteOpenCtx, options: SiteOpenOptions = {}): Promise<BrowserWindow> {
  return openSiteWindowWith({ siteDir, ctx, ports: {
    openSites,
    startSiteBackend: ({ siteDir: dir, ctx: openCtx }, openOptions) => siteBackend.startSiteBackend({ siteDir: dir, ctx: openCtx }, openOptions),
    sitePartition, readSiteName,
    createWindow: ({ url, title, partition }) => createWindow(url, title, partition),
    recordSiteClosed: ({ registryPath, siteDir: dir, pid }) => recordSiteClosed(registryPath, dir, { pid }),
    scheduleSitePreview, siteThemePreviews, sitePreviewScheduler,
    endSiteSession: ({ partition, adminUrl }) => endSiteSession({ net, session: session.fromPartition(partition), adminUrl }),
    trackTeardown: ({ promise }) => pendingTeardowns.track({ promise }),
    platform: process.platform, quitPhase: () => quitPhase, logError: (message) => console.error(message),
  } }, options);
}

/**
 * Whether `raw` points at a site this launch is currently supervising through the sites home UI's
 * embedded tabs — the boundary {@link registerGuestNavigationPolicy} enforces before ever handing a
 * guest-requested url to the operator's own browser, and the allowlist for where a guest may start
 * (`will-attach-webview`) or be redirected (`will-redirect`). Scoped to `openSites`' own live ports rather
 * than a separate registry, since `openSites` already IS this shell's registry of what is running.
 *
 * @complexity O(n) in currently open sites.
 */
function isSupervisedGuestUrl(raw: string): boolean {
  return isSupervisedSiteUrl({ raw, sites: openSites.values() });
}

/**
 * Whether `raw` is a page this shell serves — the speech channels' sender check. A supervised site
 * (own-server windows and sites-home tabs are both `http://127.0.0.1:<port>`), attach mode's one
 * origin, or the sites home renderer, whose own preload exposes `tovuVoice` too (`preload.mts`).
 * Read at call time, so a site opened after boot is admitted from its first call.
 *
 * @complexity O(n) in currently open sites.
 */
function isShellPage(raw: string): boolean {
  return isShellPageUrl(raw, {
    isSupervisedSite: isSupervisedGuestUrl,
    attachUrl: process.env.TOVU_DESKTOP_URL?.trim(),
    rendererFileUrl: pathToFileURL(SITES_RENDERER_PATH).href,
  });
}

/** Every project tab's `<webview>` guest: same-origin navigation stays, the rest is denied or handed to
 *  the OS browser — see `guest-navigation.ts`. Registered once, globally, from the sites-home branch. */
function registerGuestNavigationPolicy(): void {
  app.on("web-contents-created", (_event, contents) =>
    installWebviewGuestPolicy({ contents, isSupervisedGuestUrl, openExternal: (url) => void shell.openExternal(url) }));
}

/** "Open Site…" / "Open Recent" effects, bound to one launch's `ctx` — see `site-open-actions.ts`. */
function siteOpenPorts(ctx: SiteOpenCtx): SiteOpenActionPorts {
  return {
    adoptSiteDir: (dir) => adoptSiteDir({ dir, sharedSites, repoRoot: PAYLOAD_ROOT, statePath: ctx.statePath, cliMode: ctx.cliMode }),
    openSiteWindow: (siteDir) => openSiteWindow(siteDir, ctx),
    refreshAppMenu: () => refreshAppMenu(ctx),
    promptForSiteDir: () => promptForSiteDir(null),
    showErrorBox: (title, message) => dialog.showErrorBox(title, message),
  };
}
async function adoptAndOpenSite(dir: string, ctx: SiteOpenCtx): Promise<void> { await adoptAndOpenSiteWith({ dir, ports: siteOpenPorts(ctx) }); }
async function promptAndOpenNewSite(ctx: SiteOpenCtx): Promise<void> { await promptAndOpenNewSiteWith({ ports: siteOpenPorts(ctx) }); }

/**
 * The app's menu. The "Window" menu's native `role: "windowMenu"` (macOS) is the site switcher
 * itself — every open site is a distinctly-titled window, and macOS lists and switches between them
 * for free; nothing custom was built for this. "Open Recent" is rebuilt on every call (see
 * `refreshAppMenu`) so a just-opened site appears there next time.
 * @complexity O(n) in the MRU length (bounded, see `site-dir-store.ts`'s `MAX_RECENT_SITE_DIRS`).
 */
function buildAppMenu(ctx: SiteOpenCtx): Menu {
  return Menu.buildFromTemplate(ownServerMenuTemplate({ platform: process.platform,
    recents: existingRecentSiteDirs(ctx.statePath, { workspace: sharedSites }), settings: desktopUpdateSettingsMenu(),
    openNewSite: () => void serializer.run("__open_new__", () => promptAndOpenNewSite(ctx)),
    openRecent: ({ dir }) => void serializer.run(dir, () => adoptAndOpenSite(dir, ctx)) }));
}

function refreshAppMenu(ctx: SiteOpenCtx): void {
  Menu.setApplicationMenu(buildAppMenu(ctx));
}

/** Report a boot failure where the user can actually see it — see `boot-failure.ts`. */
function reportBootFailure(error: Error): Promise<void> {
  return reportBootFailureIn({ error, ports: { isSelectionCancelled: (candidate) => candidate instanceof SiteDirSelectionCancelled, selftest: SELFTEST,
    isUnattended: isUnattendedSiteLaunch, showInfo: (options) => dialog.showMessageBox(options),
    showError: ({ title, content }) => dialog.showErrorBox(title, content), logError: (message) => console.error(message),
    setExitCode: (code) => { process.exitCode = code; }, openSiteCount: () => openSites.size, quit: () => app.quit(), exit: (code) => app.exit(code) } });
}

/** `selftest-tracker.ts`'s completion tracking, bound to this process's logging and exit. */
function buildSelftestTracker(expectedCount: number): SelftestTracker {
  return buildSelftestTrackerIn({ expectedCount, log: (message) => console.log(message), logError: (message) => console.error(message),
    setExitCode: (code) => { process.exitCode = code; }, quit: () => app.quit() });
}

/** `null` outside SELFTEST mode; otherwise created once, before any window opens, and consulted by
 *  `createWindow` for every window this launch creates — see `selftest-tracker.ts`'s `createSelftestTracker`'s own
 *  doc for why registration must happen per-window, at creation time. */
let selftestTracker: SelftestTracker | null = null;

/** The site dir(s) own-server mode opens at launch — see `own-server-boot.ts`'s `resolveStartupSiteDirs`. */
function resolveStartupSiteDirs(ctx: SiteOpenCtx): Promise<string[]> {
  return resolveStartupSiteDirsIn({ ctx, ports: { env: process.env, repoRoot: PAYLOAD_ROOT, devFallbackDir: DEV_FALLBACK_SITE_DIR,
    resolveOrInitSiteDir, resolveSiteDir: (input) => resolveSiteDir({ ...input, sharedSites }), pickDir: promptForSiteDir } });
}

/** The Tovu mark on the macOS dock tile — see `dock-icon.ts`. */
function applyDockIcon(): void { applyDockIconWith({ dock: app.dock, iconPath: APP_ICON_PATH, log: (message) => console.log(message) }); }

/** Reap every `tovu serve` a PREVIOUS launch left running, above the boot-mode split — see
 *  `own-server-boot.ts`'s `reconcileOrphansOnBoot` for why every mode runs it. */
function reconcileOrphansOnBoot(): Promise<void> {
  return reconcileOrphansOnBootIn({ registryPath: registryDirPath(app.getPath("userData")), reconcileOrphans: (registryPath) => reconcileOrphans(registryPath), log: (message) => console.log(message) });
}

/** Boot mode 2 — own server — see `own-server-boot.ts`. */
async function bootOwnServerMode(): Promise<void> {
  const ctx: SiteOpenCtx = { cliMode: resolveCliMode(), statePath: stateFilePath(app.getPath("userData")), registryPath: registryDirPath(app.getPath("userData")) };
  await bootOwnServerModeIn({ ctx, ports: { sitesConfigWarning: () => sharedSites.config({}).warning, warn: (message) => console.warn(message),
    refreshAppMenu, resolveStartupSiteDirs, selftest: SELFTEST,
    installSelftestTracker: ({ expectedCount }) => { selftestTracker = buildSelftestTracker(expectedCount); },
    runSerialized: (siteDir, work) => serializer.run(siteDir, work),
    openSiteWindow: ({ siteDir, ctx: openCtx }, options) => openSiteWindow(siteDir, openCtx, options),
    onActivate: (listener) => { app.on("activate", listener); },
    windowCount: () => BrowserWindow.getAllWindows().length, quitPhase: () => quitPhase,
    openSiteDirs: () => [...openSites.values()].map((entry) => entry.siteDir), promptAndOpenNewSite,
    reportOpenFailure: (error) => dialog.showErrorBox("Tovu could not open that site", error.message) } });
}

function currentUpdaterSkipReason(): string | null {
  return desktopUpdaterSkipReason({ isPackaged: app.isPackaged, windowsStore: process.windowsStore, platform: process.platform, env: process.env, selftest: SELFTEST });
}

/**
 * Settings › Check for updates…, from any open copy: the check runs in this process, through the
 * native updater the controller listens to — see `update-check-now.ts`.
 */
const updateCheck = createUpdateCheckNow({
  isPackaged: app.isPackaged,
  currentVersion: () => app.getVersion(),
  skipReason: currentUpdaterSkipReason,
  automaticUpdates: () => readAutomaticUpdates({ preferencePath: desktopPreferencesPath() }),
  readyVersion: desktopUpdater.readyVersion,
  loadUpdater: desktopUpdater.loadUpdaterForCheck,
  showReadyPrompt: desktopUpdater.showReadyPrompt,
  notify: showDesktopNotice,
  log: ({ message }) => console.log(`[tovu-desktop] ${message}`),
});

/** One native message box: the update check's notices and the legacy shared-key import notice. */
function showDesktopNotice(notice: DesktopNotice): void { showNativeNotice({ dialog, windows: BrowserWindow, notice }); }

function desktopPreferencesPath(): string {
  return preferencesPathIn({ userData: app.getPath("userData") });
}

/** Loaded sites, from the native menu or the shell's stepper: persist (clamped 1–5), push the saved
 *  value to every shell, and check the matching native radio. Answers with the saved value. */
function saveMaximumLiveSiteViews({ maximumLiveSiteViews }: { maximumLiveSiteViews: number }): number {
  const saved = writeMaximumLiveSiteViews({ preferencePath: desktopPreferencesPath(), maximumLiveSiteViews });
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && window.webContents.getURL() === pathToFileURL(SITES_RENDERER_PATH).href)
      window.webContents.send(SITE_VIEW_PREFERENCE_CHANNELS.changed, saved);
  }
  refreshMaximumLiveSiteViewsMenu({ menu: Menu, maximumLiveSiteViews: saved });
  return saved;
}

/** Settings: Automatic updates, plus the sharing checkboxes once product telemetry booted. */
function desktopUpdateSettingsMenu(): MenuItemConstructorOptions {
  return desktopSettingsMenu({ locale: app.getLocale(), preferencePath: desktopPreferencesPath(), product: productState.product,
    setAutomaticUpdates: desktopUpdater.setAutomaticUpdates,
    setMaximumLiveSiteViews: saveMaximumLiveSiteViews,
    showErrorBox: (title, content) => dialog.showErrorBox(title, content) });
}

/**
 * Route termination signals into `app.quit()`'s graceful drain — see `boot-sequence.ts`'s
 * `runDesktopBoot` for why this runs first and not at module load.
 * The Electron 43/macOS probe reproduced duplicate SIGTERM delivery from npm/electron launchers.
 * SIG_DFL on the second copy killed the drain while detached children survived. Persistent
 * listeners absorb duplicates; the deadline leaves remaining registry rows for orphan recovery.
 */
function armQuitSignals(): void {
  routeQuitSignals({
    processLike: { on: ({ signal, listener }) => process.on(signal, listener) },
    quit: () => app.quit(),
    forceExit: () => app.exit(1),
    deadlineMs: QUIT_DEADLINE_MS,
  });
}

/** The IPC every boot mode's windows may call, registered before the mode split. */
function registerAppWideIpc(): void {
  // Registered before either boot-mode branch so a window's very first `isAvailable()`
  // call (fired from the preload the instant the page mounts) never races an unregistered
  // channel — see `SPEECH_PRELOAD_PATH`'s own doc for why this and the preload path are both
  // needed for `window.tovuVoice` to exist at all.
  registerSpeechIpc({ ipcMain, isTrustedSender: isShellPage });
  // General, not sites-home-only: registered here for the same reason `registerSpeechIpc` is —
  // resolves its target from `event.sender` at call time, so it needs no per-window setup and is
  // harmless to register even for a boot mode whose window never calls it (no preload exposes
  // these channels outside the sites home window today). See `find-in-page-ipc.ts`.
  registerFindInPageIpc({ ipcMain, browserWindow: BrowserWindow });
  registerSiteViewPreferenceIpc({ ipcMain,
    allowed: (sender: WebContents) => !sender.isDestroyed() && sender.getURL() === pathToFileURL(SITES_RENDERER_PATH).href,
    read: () => readMaximumLiveSiteViews({ preferencePath: desktopPreferencesPath() }),
    write: saveMaximumLiveSiteViews,
  });
  registerSiteThemePreviewIpc({ ipcMain, subscriptions: siteThemePreviews,
    allowed: (sender) => !sender.isDestroyed() && sender.getURL() === pathToFileURL(SITES_RENDERER_PATH).href,
  });
}

/** The sites-home menus plus Settings — see `boot-sequence.ts`'s `appWideMenuTemplate`. */
function installAppWideMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(appWideMenuTemplate({ platform: process.platform, settings: desktopUpdateSettingsMenu })));
}

/** `nested-sites-migration.ts`'s move, bound to this launch's workspace and userData. */
async function migrateSitesHomeOnBoot(): Promise<void> {
  await migrateNestedSitesHome({ workspace: sharedSites, repoRoot: PAYLOAD_ROOT, cliMode: resolveCliMode(),
    projectsPath: sitesFilePath(app.getPath("userData")),
  });
}

/** The per-launch paths sites home mode reads and writes. */
function sitesHomeCtx() {
  return {
    cliMode: resolveCliMode(),
    statePath: stateFilePath(app.getPath("userData")),
    registryPath: registryDirPath(app.getPath("userData")),
    projectsPath: sitesFilePath(app.getPath("userData")),
  };
}
type SitesHomeCtx = ReturnType<typeof sitesHomeCtx>;

/** `project-ipc.ts`'s deps bag — built once, see `runSitesHomeBoot`. */
function buildProjectDeps(sitesCtx: SitesHomeCtx) {
  return {
    ipcMain,
    dialog,
    shell,
    openSites,
    // The other half of what a card reads as a site's status: `openSites` says whether its
    // server is alive, this says whether a start or a stop is in flight on it. Without it here
    // the Stop button the card just showed would report `running` for the whole drain.
    transitions: siteTransitions,
    pendingTeardowns,
    serializer,
    projectsPath: sitesCtx.projectsPath,
    registryPath: sitesCtx.registryPath,
    repoRoot: PAYLOAD_ROOT,
    statePath: sitesCtx.statePath,
    cliMode: sitesCtx.cliMode,
    readSiteName,
    // The write counterpart of `readSiteName` right above: validating and atomic, because a
    // torn or empty `config.json.name` does not break the running site — it stops the NEXT
    // boot, with an error naming a file the operator never edited. See `site-config.ts`.
    writeSiteName,
    // The preview cache's three operations, bound to THIS launch's userData at the same call
    // site every other consumer resolves it from — an independently-resolved userData here
    // would write E2E previews into the real operator's profile (see `site-preview-store.ts`'s
    // own header, and `applyUserDataDir`'s doc on `TOVU_DESKTOP_USER_DATA_DIR`).
    readPreviewVersion: (siteDir: string) => readPreviewVersion(app.getPath("userData"), siteDir),
    readPreviewDataUrl: (siteDir: string) => readPreviewDataUrl(app.getPath("userData"), siteDir),
    deletePreview: (siteDir: string) => deletePreview(app.getPath("userData"), siteDir),
    requestPreviewCapture: requestListedSitePreview,
    cancelPreviewCapture: ({ siteDir }: { siteDir: string }, _optional = {}) => {
      sitePreviewScheduler.cancel({ siteDir }, {});
      siteThemePreviews.stop({ siteDir }, {});
    },
    sharedSites,
    // The card's Stop for a site `npm run dev` (or another instance) serves — owner 2026-10-13.
    // Signals dev.mjs, never the lease pid's watcher-held server; see `external-site-stop.ts`.
    externalSites: createExternalSiteStopper({}),
    adoptSiteDir: (input: Parameters<typeof adoptSiteDir>[0]) => adoptSiteDir({ ...input, sharedSites }),
    // `handleCreate` classifies the picked folder BEFORE adopting it, so a project's row records
    // whether this app CREATED the directory or merely adopted one that already existed — the
    // fact `project-delete-guard.ts` needs before any delete may erase anything.
    //
    // The SAFE form, because `rescanSites` scans with this same value (D-01). `handleCreate`
    // is unaffected: an unreadable pick classifies `"unreadable"` rather than `"empty"`, so the
    // row would be `adopted` — and it never gets written, because `adoptSiteDir` re-classifies
    // with the throwing form one line later and refuses the folder with its own message.
    classifySiteDir: classifySiteDirSafely,
    // "Add Tovu Website" — pointer-only, and deliberately NOT `adoptSiteDir`, which inits an
    // empty folder. See `add-site-pointer.ts`'s header and `handleAddSite`.
    addSitePointer,
    openSiteServer: (siteDir: string, ctx: SitesHomeCtx) => siteBackend.openSiteServer({ siteDir, ctx }),
    recordSiteClosed,
    // How `handleDelete` sees a SIBLING app instance's open sites before erasing a directory —
    // `openSites` above is this process's own memory and cannot (D-08). See
    // `project-ipc.ts`'s `liveForeignServers`.
    readRegistry,
    isLiveServeRow,
    siteScanRoots: SITE_SCAN_ROOTS,
    discoverSites: siteDiscovery.discoverSites,
    siteFolders: createSiteFolders({
      statePath: sitesCtx.statePath,
      defaultRoots: SITE_SCAN_ROOTS,
      home: () => sharedSites.home({}),
      workspace: sharedSites,
      createdSiteDirs: () => readTrackedSites(sitesCtx.projectsPath)
        .filter((row) => row.origin === "created").map((row) => row.siteDir),
    }),
    // A thunk, not the list: read fresh on every scan, so a site opened during this session is
    // found by a later rescan instead of being frozen out by a snapshot taken at boot.
    recentSiteDirs: () => existingRecentSiteDirs(sitesCtx.statePath, { workspace: sharedSites }),
    ctx: sitesCtx,
  };
}
type ProjectDeps = ReturnType<typeof buildProjectDeps>;

/** Rescan, then sweep stale previews — see `site-discovery.ts`'s `startDesktopSiteDiscovery`. */
function startSitesHomeDiscovery(projectDeps: ProjectDeps): void {
  void startDesktopSiteDiscovery({
    scan: () => rescanSites(projectDeps),
    report: (failure) => console.warn(`tovu desktop: ${failure instanceof Error ? failure.message : String(failure)}`),
    // Hygiene runs after discovery settles, so it sees the fullest tracked list; cleanup,
    // never correctness. See sweepSitePreviewsOnBoot's own doc.
    sweep: () => sweepSitePreviewsOnBootIn({ projectsPath: projectDeps.ctx.projectsPath, readTrackedSites,
      sweepOrphanedPreviews: ({ trackedDirs }) => sweepOrphanedPreviews(app.getPath("userData"), trackedDirs), warn: (message) => console.warn(message) }),
  });
}

/** A Dock-reopenable single window opened by `openSingleWindow` — see `boot-sequence.ts`. */
function singleWindowPorts(openWindow: () => void): SingleWindowPorts {
  return { selftest: SELFTEST, installSelftestTracker: ({ expectedCount }) => { selftestTracker = buildSelftestTracker(expectedCount); },
    openWindow, onActivate: (listener) => { app.on("activate", listener); },
    windowCount: () => BrowserWindow.getAllWindows().length, quitPhase: () => quitPhase };
}

/** Boot mode 1 — sites home — see `boot-sequence.ts`'s `runSitesHomeBoot` for the step order. */
function bootSitesHomeMode(): void {
  const sitesCtx = sitesHomeCtx();
  runSitesHomeBoot({ ports: {
    settleDevFallbackRows: () => settleDevFallbackRows({ projectsPath: sitesCtx.projectsPath, devFallbackDir: DEV_FALLBACK_SITE_DIR,
      classifySiteDir: classifySiteDirSafely, migrateLegacyDismissals, seedDevFallbackSite, retireDevFallbackSite }),
    buildProjectDeps: () => buildProjectDeps(sitesCtx),
    registerSiteIpcHandlers: (projectDeps) => registerSiteIpcHandlers(projectDeps),
    startSiteDiscovery: startSitesHomeDiscovery,
    registerAppVersionIpc: () => registerAppVersionIpc({ ipcMain, app }, { repoRoot: REPO_ROOT }),
    registerResourcesIpc: () => registerResourcesIpc({ ipcMain,
      allowed: (url) => url === pathToFileURL(SITES_RENDERER_PATH).href,
      monitor: desktopResources,
    }),
    registerOwnerStoreIpc: () => registerOwnerStoreIpc({ ipcMain,
      allowed: (url) => url === pathToFileURL(SITES_RENDERER_PATH).href,
      controller: ownerStore,
    }),
    settleLegacyOwnerStore: settleLegacyOwnerStoreOnStart,
    registerUpdateCheckIpc: () => registerUpdateCheckIpc({ ipcMain, checkNow: updateCheck.checkNow }),
    registerRunnerIpcStubs: () => registerRunnerIpcStubs({ ipcMain }),
    registerGuestNavigationPolicy,
    installMenu: installAppWideMenu,
    ...singleWindowPorts(() => { openSitesHomeWindow(); }),
  } });
}

/** Boot mode 3 — attach to an already-running site at `TOVU_DESKTOP_URL`. Always exactly one window. */
function bootAttachMode({ url }: { url: string }): void {
  openSingleWindow({ ports: singleWindowPorts(() => { createWindow(url, "Tovu"); }) });
}

/** The launch, in order — see `boot-sequence.ts`'s `runDesktopBoot` for why each step sits where it does. */
function bootDesktop(): Promise<void> {
  return runDesktopBoot({ ports: {
    armQuitSignals,
    initializeProductTelemetry: initializeDesktopProductTelemetry,
    registerAppWideIpc,
    applyDockIcon,
    installAppWideMenu,
    startUpdaterInBackground: () => desktopUpdater.startInBackground(),
    reconcileOrphansOnBoot,
    migrateNestedSitesHome: migrateSitesHomeOnBoot,
    chooseBootMode: () => chooseBootMode({ env: process.env }),
    bootSitesHomeMode,
    bootAttachMode,
    bootOwnServerMode,
  } });
}

/**
 * Offers to move a packaged macOS copy launched from outside Applications (a disk image, Downloads)
 * into it, once per version — every rule is in `move-to-applications.ts`; this only supplies
 * Electron. Runs before the updater and any site server, so a successful move (Electron relaunches
 * from Applications and quits this process) leaves nothing behind. Its caller logs any throw (an
 * unwritable `userData` on "Not Now") and boots on.
 */
// Owner 2026-10-06: DMG window already shows drag-to-Applications; prompt redundant.
// The disabled helper is recoverable with its imports and call from git history.

app.whenReady().then(bootDesktop).catch(reportBootFailure);

/**
 * Every spawned `tovu serve` must not outlive the app, and each must be given the chance to shut
 * down properly rather than being cut off.
 *
 * `will-quit` cannot be used for this: it is synchronous, so it can send a signal but cannot wait
 * for the child to act on it, and Electron would exit while `serve.ts`'s BR-07 drain — close the
 * listener, finish in-flight requests, stop the agent daemon, close the sqlite handle — was still
 * running. Deferring the quit here is what makes every open site's database close cleanly on an
 * ordinary exit.
 *
 * A hard kill of Electron itself (SIGKILL, a crash, a logout) still bypasses this and can strand
 * every open site's child at once. `site-process-registry.ts`'s `reconcileOrphans()` — run before any
 * window opens on the NEXT launch — is what answers that now (see this file's own header).
 */
app.on("before-quit", (event) => {
  siteDiscovery.abortAll();
  // Discovery can still be in flight even with no open sites; include its disposal in the same
  // awaited drain. Repeated quit attempts must not start another disposal while that drain runs.
  if (quitPhase === "idle") {
    for (const dispose of productState.disposers) dispose();
    pendingTeardowns.track({ promise: productState.product.dispose() });
    pendingTeardowns.track({ promise: desktopAgentRuntime.dispose({}) });
    pendingTeardowns.track({ promise: desktopMcpHttp.close({}) });
  }
  // `pendingTeardowns` as well as `openSites` (D-09). A window's `closed` handler removes its entry
  // from `openSites` synchronously and only THEN starts stopping the child, so closing the last
  // window left this reading "nothing open" while a `tovu serve` was still alive — and it is spawned
  // `detached`, so it outlives the app. See `shutdown-tracker.ts`'s own header.
  const action = decideBeforeQuit({ phase: quitPhase, nothingToDrain: openSites.size === 0 && pendingTeardowns.size === 0 });
  if (action === "proceed") {
    if (finalQuitHeldForUpdate()) event.preventDefault();
    return;
  }
  event.preventDefault();
  // A second Cmd+Q, menu Quit, signal or `app.quit()` during the drain: prevented and dropped, so
  // only the drain's own closing `app.quit()` below ends the app. See `quit-drain-gate.ts`.
  if (action === "hold") return;
  quitPhase = "draining";
  // Holding removed a repeat quit's escape from a hung drain, so every route gets the deadline here,
  // not only a termination signal. See `QUIT_DEADLINE_MS`. Cleared once the drain is done: it bounds
  // the DRAIN, and must not cut off a macOS update being handed to Squirrel after it (the updater
  // bounds that step itself, Jini desktop-host's `defaultUpdateTiming.stageTimeoutMs`).
  const drainDeadline = setTimeout(() => app.exit(1), QUIT_DEADLINE_MS);
  drainDeadline.unref();
  siteThemePreviews.dispose({}, {});
  const stops = [...openSites.values()].map((entry) => entry.server.stop()
    .catch((error) => console.error(`[tovu-desktop] site shutdown failed: ${error.message}`)));
  Promise.all(stops)
    .then(() => pendingTeardowns.drain())
    .finally(() => {
      clearTimeout(drainDeadline);
      quitPhase = "drained";
      app.quit();
    });
});

/**
 * The quit that actually ends the app, once nothing is left to drain. A downloaded update installs
 * here, and only when no other instance of the app is running (`update-policy.ts`'s
 * `decideFinalQuit`). When the install takes over (macOS staging, or Restart to update) it quits the
 * app itself, so this quit is held.
 */
function finalQuitHeldForUpdate(): boolean {
  return desktopUpdater.finalQuitHeldForUpdate();
}

app.on("will-quit", () => {
  desktopUpdater.willQuit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
