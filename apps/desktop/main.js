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
 *    SAME window, in a `<webview>` (`App.tsx`'s `SiteWorkspace`), rather than popping it into its
 *    own `BrowserWindow` — matching Tovu-Runner's own tabbed UI, which is the reference this was
 *    built against. `list`/`create`/`delete`/`open-external`/`start` are real (`src/project-ipc.js`),
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
 *    open a second, third, or Nth site: `src/tovu-server.js`'s `startTovuServer` was already a
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
 *   The sites home UI's own switcher is its tab strip instead (`App.tsx`'s `TabStrip`) — one window, N tabs.
 * - "Open Site…" (File menu) runs the folder picker for a NEW site, independent of whichever sites
 *   are already open. "Open Recent" lists `site-dir-store.js`'s existing MRU.
 * - `keyed-serializer.js` serializes opens PER SITE DIR, so a fast double-click on the same recent-
 *   site menu entry cannot double-spawn a `tovu serve` for it (Tovu-Runner's `serializeByProject`
 *   pattern, generalized).
 *
 * **Crash-safety**, now in scope (`site-process-registry.js`): every open site's `{siteDir, port,
 * workspaceId, pid}` is persisted to a small JSON registry the moment its `tovu serve` reports ready,
 * and removed the moment it is stopped deliberately (a window closed, or the app quit cleanly). If
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
 * without touching the build or the Jini links. See `tovu-server.js`'s `buildCliSpawnPlan` for the
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
import { app, BrowserWindow, dialog, shell, Menu, ipcMain, net, session } from "electron";

import { startTovuServer } from "./src/tovu-server.js";
import { resolveAdminDevProxyUrl } from "./src/admin-dev-proxy.js";
import { resolveSiteDir, resolveOrInitSiteDir, adoptSiteDir, classifySiteDir, classifySiteDirSafely, stateFilePath, existingRecentSiteDirs, SiteDirSelectionCancelled } from "./src/site-dir-store.js";
import { registryFilePath, reconcileOrphans, recordSiteOpened, recordSiteClosed, readRegistry, isLiveServeRow } from "./src/site-process-registry.js";
import { createKeyedSerializer } from "./src/keyed-serializer.js";
import { createSiteSupervisor } from "./src/site-supervisor.js";
import { createShutdownTracker } from "./src/shutdown-tracker.js";
import { applyGuestWebPreferences } from "./src/webview-guest-policy.js";
import { createSelftestTracker } from "./src/selftest-tracker.js";
import { registerSpeechIpc } from "./src/speech/speech-ipc.js";
import { registerRunnerIpcStubs } from "./src/runner-ipc-stubs.js";
import { redeemBootSession, sitePartition, ensureSiteSession, endSiteSession } from "./src/desktop-auth.js";
import { sitesFilePath, seedDevFallbackSite, migrateLegacyDismissals } from "./src/tracked-sites.js";
import { writeSiteName } from "./src/site-config.js";
import { registerSiteIpcHandlers, rescanSites } from "./src/project-ipc.js";
import { addSitePointer } from "./src/add-site-pointer.js";
import { registerSitesMcpServer, writeSitesMcpLauncher } from "./src/sites-mcp-registration.js";
import { fileURLToPath } from "node:url";
import { resolveDesktopRoots } from "./src/packaged-paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * E2E-only override for `app.getPath("userData")`. Must run before `app.whenReady()` — Electron
 * reads `userData` off whatever `setPath` last set, and every consumer in this file (crash
 * registry, MRU state, tracked projects) calls `app.getPath("userData")` lazily from inside the
 * `whenReady` handler, so this only has to win the race against that, not against `require`.
 *
 * This exists because scoping the E2E harness's own `HOME` env var does NOT isolate this app's
 * on-disk state: `app.getPath("userData")` resolves the macOS path independently of `HOME`
 * (Chromium computes it directly), so every launch that only overrode `HOME` was actually reading
 * and writing the operator's real `~/Library/Application Support/tovu-desktop/` — see
 * `development/e2e/desktop-shell.spec.ts`'s own header for how that was found (six stale
 * `tovu-desktop-e2e-*` MRU entries in the real `desktop-state.json`). `app.setPath` is the
 * documented, supported lever Electron gives for this; unset in every real launch.
 */
if (process.env.TOVU_DESKTOP_USER_DATA_DIR?.trim()) {
  app.setPath("userData", process.env.TOVU_DESKTOP_USER_DATA_DIR.trim());
}

/** Preload for every window this shell creates, regardless of boot mode — see `createWindow`. It
 *  is what makes `window.tovuVoice` exist inside Electron at all; see `preload-speech.cjs`'s and
 *  `speech-ipc.js`'s own headers for the wiring gap this closes (both were built and tested with
 *  neither this path nor {@link registerSpeechIpc} ever called from here). */
const SPEECH_PRELOAD_PATH = path.join(__dirname, "src", "speech", "preload-speech.cjs");

/** The built sites home renderer. `npm run build:renderer` produces it; `openSitesHomeWindow` reports its
 *  absence rather than opening a blank window on a source-only checkout. */
const SITES_RENDERER_PATH = path.join(__dirname, "dist", "renderer", "index.html");

/** Preload for the SITES HOME window only. A native-ESM preload, which Electron 43 supports solely in an
 *  unsandboxed renderer — hence `sandbox: false` in {@link openSitesHomeWindow}, and hence site-admin
 *  windows keeping {@link SPEECH_PRELOAD_PATH} and `sandbox: true` untouched. It exposes BOTH
 *  `window.tovuRunner` and `window.tovuVoice`; see its own header on why the mic bridge had to be
 *  duplicated rather than shared. */
const SITES_PRELOAD_PATH = path.join(__dirname, "dist", "preload", "preload.mjs");

/** The Tovu mark for the macOS dock tile — see {@link applyDockIcon}. Copied into this directory
 *  from the tovu-com theme rather than referenced out of `sites/tovu-com/`, which is a user's live
 *  site folder and not an asset source this app may depend on. */
const APP_ICON_PATH = path.join(__dirname, "src", "renderer", "public", "brand", "tovu-app-icon.png");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

/**
 * Every root that differs between a checkout and a packaged `.app`, resolved once. See
 * `packaged-paths.js` for what each one means and why the delete-guard containment boundary rides
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
});

/**
 * The runnable Tovu tree: `dist/`'s CLI, `apps/admin/dist`, `apps/site-chat/dist` and the
 * `node_modules` they resolve against. The checkout itself in dev, `Resources/tovu/` when packaged.
 *
 * Replaces {@link REPO_ROOT} at every site that previously passed it downward. Note this is ALSO
 * what `project-delete-guard.js` receives as its containment root — see `packaged-paths.js`.
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
 * wherever they said. `rescanSites` covers the rest through the recently-opened list.
 */
const SITE_SCAN_ROOTS = DESKTOP_ROOTS.siteScanRoots;

/**
 * `true` when this launch should open the sites home Projects screen (boot mode 0) rather than a site
 * directly. Default since 2026-09-06 — the whole point of the port — but three things must keep
 * bypassing it unconditionally, because they each name a single destination directly and exist
 * specifically for automation/attach workflows that have no use for a project picker:
 *
 * - `TOVU_DESKTOP_URL` (attach mode).
 * - `TOVU_DESKTOP_SITE_DIR` / `TOVU_DESKTOP_SITE_DIRS` (own-server, pinned to specific dir(s)) —
 *   this is what keeps every existing `TOVU_DESKTOP_SITE_DIR`-driven E2E spec and any real
 *   automation untouched by this flip.
 *
 * An explicit `TOVU_DESKTOP_UI=runner` still opts in outright, unconditionally, matching this
 * function's pre-flip behavior exactly (kept for anyone who has that set alongside one of the
 * above, historically to force the sites home UI over a pinned site dir — that ordering is preserved:
 * explicit `runner` is checked, and returns, before any bypass condition below).
 */
function sitesUiRequested() {
  if (process.env.TOVU_DESKTOP_UI?.trim() === "runner") return true;
  const bypassesFrontPage =
    Boolean(process.env.TOVU_DESKTOP_URL?.trim()) ||
    Boolean(process.env.TOVU_DESKTOP_SITE_DIR?.trim()) ||
    explicitStartupSiteDirs() !== null;
  return !bypassesFrontPage;
}

/**
 * `siteDir -> { server, window }` for every site this process currently has open. Replaces the
 * single-site `tovuServer` variable the shell used before multi-site.
 *
 * A `site-supervisor.js` supervisor rather than a bare `Map` since D-06. The `Map` surface is
 * unchanged — every `get`/`set`/`has`/`delete`/`values`/`size` below and in `project-ipc.js` means
 * exactly what it did — but it now also watches each entry's child and REMOVES an entry whose
 * `tovu serve` has died. Without that this map answered "was started", never "is alive": a crashed
 * site stayed `running` for the rest of the session, `openSiteServer` handed its dead handle back
 * to "Start site", and the 4 s renderer poll re-read an answer that could not change.
 */
const openSites = createSiteSupervisor({
  onUnexpectedExit: (siteDir, exit, entry) => {
    // The row exists to let the NEXT launch reap a child this process left running. This one is
    // already gone, so the row is now a lie that `reconcileOrphans` would spend a `ps` call on.
    // Narrowed by pid: a live sibling instance may hold its own row for this same site (D-07).
    recordSiteClosed(registryFilePath(app.getPath("userData")), siteDir, { pid: entry.server.pid });
    console.warn(`tovu desktop: ${siteDir}'s server exited on its own (code ${exit.code ?? "none"}, signal ${exit.signal ?? "none"}). Its tab will show as stopped; Start will spawn a fresh one.`);
  },
});

/** Serializes site opens PER SITE DIR — see this file's own header on why. */
const serializer = createKeyedSerializer();

/** Teardowns a window's `closed` handler has STARTED but not finished, so `before-quit` below can
 *  wait for them — see `shutdown-tracker.js`'s own header for the leak this closes (D-09). */
const pendingTeardowns = createShutdownTracker();

/** Guards `before-quit` against re-entering once the graceful multi-site shutdown is already under
 *  way — mirrors the single-site shell's own prior `shuttingDown` variable. */
let shuttingDown = false;

/** `"source"` (default) or `"compiled"` — see this file's own header. Read once at module load,
 *  same convention as every other `TOVU_DESKTOP_*` env var below (parsed here, passed down as a
 *  plain argument, never read directly by `tovu-server.js`/`site-dir-store.js`). */
function resolveCliMode() {
  const explicit = process.env.TOVU_DESKTOP_CLI_MODE?.trim();
  if (explicit === "compiled") return "compiled";
  if (explicit === "source") return "source";
  // `"source"` in a checkout — unchanged, including for a garbage value, which still falls through
  // to the default exactly as the old ternary did. `"compiled"` when packaged, where no TypeScript
  // source and no `tsx` ship; see `packaged-paths.js`.
  return DESKTOP_ROOTS.defaultCliMode;
}

/** `TOVU_DESKTOP_SITE_DIRS`, split and trimmed — `null` when unset, so callers fall back to the
 *  normal single-site `resolveSiteDir()` precedence untouched. */
function explicitStartupSiteDirs() {
  const raw = process.env.TOVU_DESKTOP_SITE_DIRS?.trim();
  if (!raw) return null;
  return raw.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

/**
 * Ask the user which folder holds their site. Cancelling returns `null`.
 *
 * `createDirectory` is on because the natural gesture for a new site is to make a folder from
 * inside the dialog; an empty one gets `tovu init`.
 *
 * @param rejectedDefault `{ dir, kind, missing? }` naming a candidate already tried and turned down
 *   (only ever non-null for the STARTUP picker, which tries `devFallbackDir` first — see
 *   `resolveSiteDir`), or `null` when there was nothing to try (every other call site).
 */
function describeRejectedDefault(rejectedDefault) {
  if (rejectedDefault.kind === "empty") return "has no site in it yet";
  // Before the `missing` read below: `classifySiteDirSafely` reports a candidate it could not
  // examine at all (EACCES/ENOTDIR/ELOOP — see D-01), and that verdict has no marker list to name,
  // so the generic branch would throw on `undefined.join` while building the very dialog that is
  // supposed to explain the problem.
  if (rejectedDefault.kind === "unreadable") return "could not be read (check its permissions, or whether something replaced it)";
  // "incomplete" and "occupied" both carry `missing` — the exact marker file name(s) `resolveSiteDir`
  // found absent — so the message names the actual reason instead of a generic "not a Tovu site".
  const missing = rejectedDefault.missing.join(" and ");
  return rejectedDefault.kind === "incomplete"
    ? `is missing ${missing} — it looks like a half-initialized site`
    : `is not a Tovu site (missing ${missing})`;
}

async function promptForSiteDir(rejectedDefault) {
  // A modal dialog in a headless self-test would block forever with nothing to click it. Fail with
  // the reason instead, so an unattended run reports rather than hangs.
  if (SELFTEST) {
    throw new Error("no site dir resolved and TOVU_DESKTOP_SELFTEST=1 cannot show a folder picker — set TOVU_DESKTOP_SITE_DIR(S).");
  }
  const askMessage = "Pick a folder that already holds a site, or an empty folder to start a new one.";
  const message =
    rejectedDefault === null
      ? askMessage
      : `${rejectedDefault.dir} was tried first but ${describeRejectedDefault(rejectedDefault)}. ${askMessage}`;
  const result = await dialog.showOpenDialog({
    title: "Choose a folder for your Tovu site",
    message,
    buttonLabel: "Use this folder",
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
}

/** The site's own display name — `config.json`'s `name` field, falling back to the folder's own
 *  basename when that is missing or unreadable. Used only for the window title, which is what makes
 *  Electron's native Window menu double as a site switcher (distinct titles, distinct entries).
 *  @complexity O(1). */
function readSiteName(siteDir) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(siteDir, "config.json"), "utf8"));
    if (typeof config.name === "string" && config.name.trim().length > 0) return config.name;
  } catch {
    // Missing, unreadable, or not JSON — the folder's own name is still a reasonable title.
  }
  return path.basename(siteDir);
}

function createWindow(url, title, partition) {
  const window = new BrowserWindow({
    width: 1360,
    height: 900,
    title: title ?? "Tovu",
    show: !SELFTEST,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: SPEECH_PRELOAD_PATH,
      // One cookie jar per site. Cookies ignore PORT, so without this every own-server site shares
      // `127.0.0.1`'s jar: site A's `tovu_session` would be sent to site B's server, and B's login
      // would overwrite A's. Undefined in attach mode, which is single-site by definition and keeps
      // the default session it always used. See `desktop-auth.js`'s header, property 2.
      ...(partition ? { partition } : {}),
    },
  });

  // Registered BEFORE `loadURL` below, and before this function returns to its caller — see
  // `selftestTracker`'s own doc for why that ordering is load-bearing for a multi-site launch.
  if (selftestTracker) selftestTracker.add(window);

  // Electron adopts the loaded page's own `document.title` by default, overwriting whatever `title`
  // this constructor was given the instant the admin SPA finishes loading — every site's admin page
  // sets the SAME title ("Tovu Admin"), confirmed live: a real 2-site launch reported both windows'
  // titles as "Tovu Admin", indistinguishable from each other. That defeats the whole premise of the
  // native Window menu doubling as a site switcher (see this file's own header) — distinct entries
  // need distinct titles. `preventDefault()` here keeps each window pinned to the title it was given
  // at creation (the site's own name, or "Tovu" for attach mode) instead.
  window.on("page-title-updated", (event) => event.preventDefault());

  // Anything that navigates away from the app's own origin belongs in the OS browser — a
  // "view site ↗" link must not replace the admin shell inside the app window.
  const origin = new URL(url).origin;
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith(origin)) return { action: "allow" };
    void shell.openExternal(target);
    return { action: "deny" };
  });

  void window.loadURL(url);
  return window;
}

/**
 * Open the sites home UI, ported from Tovu-Runner (the Projects screen). Boot mode 0 — see this file's header.
 *
 * Two webPreferences differ from {@link createWindow}. `sandbox: false` is forced by the renderer
 * rather than chosen: {@link SITES_PRELOAD_PATH} is a native-ESM preload and Electron 43 loads one
 * only in an unsandboxed renderer. `webviewTag: true` is what lets a project tab embed that site's
 * own `tovu serve` output in a `<webview>` inside THIS window (`App.tsx`'s `SiteWorkspace`) —
 * matching Tovu-Runner's own `main.ts`, which needs the same tag for the same reason.
 *
 * `webviewTag` on its own lets the PAGE choose the guest's `webPreferences` via attributes. Runner
 * writes those attributes today (partition aside — see `SiteWorkspace`'s own doc on why this
 * shell's guest sets one and Runner's does not), and `will-attach-webview` below is the boundary
 * that keeps that trustworthy: the guest never gets Node, never gets this window's own preload, and
 * can never re-enable either from inside the page. `registerGuestNavigationPolicy` (called once,
 * before this function, from the sites-home boot branch) is the other half — see its own doc.
 *
 * @returns the window, or `null` when the renderer has not been built yet.
 * @complexity O(1).
 */
function openSitesHomeWindow() {
  if (!fs.existsSync(SITES_RENDERER_PATH)) {
    const message = `The sites home UI is not built. Run \`npm run build\` in apps/desktop, or unset TOVU_DESKTOP_UI to launch a site instead.\n\nExpected: ${SITES_RENDERER_PATH}`;
    console.error(`tovu desktop: ${message}`);
    process.exitCode = 1;
    if (!SELFTEST) dialog.showErrorBox("Tovu could not start", message);
    app.quit();
    return null;
  }

  const window = new BrowserWindow({
    width: 1360,
    height: 900,
    /**
     * Floors, not a preference. `app.css` declares exactly ONE width breakpoint — `@media
     * (max-width: 680px)`, which stacks the create-website form and top-aligns `.main__head` —
     * and nothing below that. 680 is therefore the narrowest width the stylesheet has an opinion
     * about, and the honest floor is at or above it rather than a round number.
     *
     * 960 rather than 680 because the operator chat is a grid COLUMN, not an overlay
     * (`.runner-chat-pane`, `width: min(27rem, 40vw)`) — it narrows `.main` instead of covering
     * it, and the 680 breakpoint keys off the VIEWPORT, so it never accounted for the pane. With
     * the pane open at 960 the content column is 576px: `.main__head`'s title plus its three
     * nowrap buttons still fit, and `.grid`'s `minmax(214px, 1fr)` still auto-fills two columns.
     * At 680 with the pane open the content column is 408px and that header row overflows.
     *
     * Derived from the stylesheet's own arithmetic, not measured in a live window.
     */
    minWidth: 960,
    minHeight: 600,
    title: "Tovu",
    show: !SELFTEST,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: SITES_PRELOAD_PATH,
      webviewTag: true,
    },
  });

  if (selftestTracker) selftestTracker.add(window);
  window.on("page-title-updated", (event) => event.preventDefault());

  // The guest gets the shell's OWN speech preload, not none (D-10) — see
  // `webview-guest-policy.js` for why assigning is strictly stronger than the `delete` this
  // replaced, and for the symptom it fixes: the embedded admin telling the operator that voice
  // input needs the desktop app, from inside the desktop app.
  window.webContents.on("will-attach-webview", (_event, webPreferences) => {
    applyGuestWebPreferences(webPreferences, { preloadPath: SPEECH_PRELOAD_PATH });
  });

  void window.loadFile(SITES_RENDERER_PATH);
  return window;
}

/**
 * Put a valid admin session in `partition`'s cookie jar before its window loads, so the operator
 * lands in the admin instead of on a login form.
 *
 * The credential is the single-use boot token the child minted at boot and printed on its own
 * stdout — never a password, never anything stored. See `desktop-auth.js`'s header for why the
 * stored-credential approach, and `safeStorage` with it, was removed entirely.
 *
 * Deliberately best-effort and silent-on-success. Every failure path — a child that minted no
 * token, a token already spent, a route that refused — logs one line and returns, and the caller
 * loads the admin anyway, where the ordinary login screen is waiting. That fallback is the design,
 * not a gap: it must never turn "you have to type a password" into "the window is blank", and it
 * must never fabricate a session.
 *
 * @returns {Promise<boolean>} whether the session was authenticated.
 * @complexity O(1) — one loopback request.
 */
async function authenticateSiteSession(siteDir, server, partition) {
  if (typeof server.bootToken !== "string" || server.bootToken.length === 0) {
    console.log(`tovu desktop: ${siteDir} reported no boot token — the admin will ask for a login.`);
    return false;
  }

  let result;
  try {
    result = await redeemBootSession({
      net,
      session: session.fromPartition(partition),
      adminUrl: server.adminUrl,
      bootToken: server.bootToken,
    });
  } catch (error) {
    // `assertLoopbackAdminUrl` throwing is a wiring bug, not an auth outcome — something handed
    // this a non-loopback origin, which must be loud rather than swallowed.
    console.error(`tovu desktop: desktop sign-in refused for ${siteDir}: ${error.message}`);
    return false;
  }

  if (!result.ok) {
    console.log(`tovu desktop: desktop sign-in did not apply to ${siteDir} (${result.reason}) — the admin will ask for a login.`);
  }
  return result.ok;
}

/**
 * Spawn (or reuse) `siteDir`'s own `tovu serve` and put a valid admin session in its cookie jar —
 * every step both {@link openSiteWindow} (own-server mode, one `BrowserWindow` per site) and
 * {@link openSiteServer} (sites-home mode, one embedded `<webview>` tab per site) need, and NOTHING
 * either of them does with the result: this never touches `openSites`, a `BrowserWindow`, or a
 * `<webview>` — callers own that bookkeeping, so a caller whose next step fails (`createWindow`,
 * say) decides for itself how to unwind the server this just started.
 *
 * A site already authenticated from a previous launch keeps its session cookie in this
 * `persist:`-prefixed partition (see `desktop-auth.js`'s header, property 2) across app restarts.
 * Minting and redeeming a fresh boot token here TOO was the defect: a brand-new 30-day session on
 * every open, one per launch, none of them ever revoked — 713 live rows found in one site's own
 * database. Skipping the mint when a session cookie is already present is what stops that
 * accumulation at its source; ending the session on close (both callers' own cleanup) is the other
 * half.
 *
 * @param options.port pin this site's port (only ever passed for the startup call honoring
 *   `TOVU_DESKTOP_PORT` — see `resolveStartupSiteDirs`); every other call self-allocates so two
 *   sites opened in the same launch can never collide.
 * @returns `{server, partition}` — `partition` is the exact Electron session-partition string the
 *   caller's own `BrowserWindow`/`<webview>` must use, so the cookie this just seeded is visible to it.
 * @complexity O(1) beyond `startTovuServer`'s own cost.
 */
async function startSiteBackend(siteDir, ctx, options = {}) {
  const partition = sitePartition(siteDir);

  // ALWAYS emitted (DS-01). `emitBootToken` is what makes `server.bootToken` non-null below — see
  // `desktop-auth.js`'s header for why this replaced a shell-minted, shell-stored password
  // entirely. It used to be `!alreadyAuthenticated`, decided from the cookie jar BEFORE this spawn,
  // and that ordering is the defect: it is a spawn argument, so there is no server to ask yet, and
  // a wrong guess could never be revised: no token had been minted, so a cookie the server no
  // longer honoured dropped the operator onto a login form for a password this shell never issued
  // (it passes no `desktopCredential` — the SITE's own identity seeding decides, and its default is
  // what actually works, but nothing in this app has ever shown it to them). An unnecessary token is inert (single-use, process-scoped, never
  // written to disk); an unnecessary REDEEM is the 30-day-session pile-up, and that is what
  // `ensureSiteSession` still keeps conditional.

  // Resolved per site-start rather than once at boot: a developer routinely starts `npm run dev`
  // after the shell is already open, and a boot-time answer would stay "no Vite" for the rest of
  // the session. Yields `null` when packaged and when nothing is listening, in which case the child
  // serves `apps/admin/dist` exactly as before — see `admin-dev-proxy.js` for why this is probed
  // rather than set optimistically.
  const adminDevProxyUrl = await resolveAdminDevProxyUrl({ isPackaged: app.isPackaged, env: process.env });

  const server = await startTovuServer({
    repoRoot: PAYLOAD_ROOT,
    siteDir,
    cliMode: ctx.cliMode,
    port: options.port,
    emitBootToken: true,
    adminDevProxyUrl,
  });
  recordSiteOpened(ctx.registryPath, {
    siteDir,
    port: server.port,
    workspaceId: server.workspaceId,
    pid: server.pid,
    updatedAt: Date.now(),
  });

  // Awaited before returning, so the cookie is already in the jar when the caller's window/guest
  // makes its first navigation — a session applied after the page had loaded would still show the
  // login form until a reload. The decision itself lives in `desktop-auth.js` so it can be tested
  // against fakes; this file only supplies the per-site inputs and the redeem it owns.
  await ensureSiteSession({
    net,
    session: session.fromPartition(partition),
    adminUrl: server.adminUrl,
    redeem: () => authenticateSiteSession(siteDir, server, partition),
  });

  announceDesktopToolsToSite(server, partition);

  return { server, partition };
}

/**
 * Register this shell's MCP tool server with the site that just booted, so its assistant can reach
 * the desktop's own capabilities (list the operator's websites, add one, reveal one's folder).
 *
 * **Runs on EVERY site open, and both halves of it are re-asserted rather than created once.** The
 * launcher is regenerated because it embeds an absolute path to the Electron binary inside the
 * `.app` bundle — which goes stale the instant the operator drags the app to `/Applications` or an
 * update replaces it, and a stale one fails at connect with a spawn error naming neither cause.
 * The row is re-PUT because `external-mcp-repo.sqlite.ts` hard-deletes with no tombstone, so an
 * operator who removed the connection in Settings removed it unrecoverably; an idempotent PUT makes
 * both app-moves and that accident self-healing by the same mechanism.
 *
 * Placed immediately after {@link ensureSiteSession} because it depends on it: the PUT authenticates
 * with the session cookie that call just put in this partition's jar.
 *
 * **Fire-and-forget, and never awaited.** A site whose assistant lacks the desktop tools is
 * degraded, not broken, and the operator is mid-launch — so this must not be able to delay or fail
 * opening their window. `registerSitesMcpServer` never rejects for a registration outcome; the
 * `catch` is for a genuinely unexpected fault (an unwritable `userData`, a non-loopback admin URL)
 * and reports rather than propagating, for the same reason.
 *
 * @complexity O(1) — one file write and one request.
 */
function announceDesktopToolsToSite(server, partition) {
  try {
    const launcherPath = writeSitesMcpLauncher({
      userDataDir: app.getPath("userData"),
      // Read live, never persisted as truth — see this function's own note on staleness.
      electronPath: process.execPath,
      bridgePath: path.join(__dirname, "bin", "mcp-bridge.mjs"),
    });
    void registerSitesMcpServer({
      net,
      session: session.fromPartition(partition),
      adminUrl: server.adminUrl,
      // The site's OWN workspace id, from `tovu serve`'s parsed boot line — never a hard-coded
      // `"workspace-local"`. `resolveWorkspace` picks the single or oldest workspace row and
      // `--workspace` can name another, so an assumed id would 404 on exactly the sites that differ.
      workspaceId: server.workspaceId,
      launcherPath,
    }).then((result) => {
      if (!result.ok) console.warn(`tovu-desktop: the assistant's desktop tools are unavailable for this site — ${result.reason}`);
    });
  } catch (error) {
    console.warn(`tovu-desktop: could not register the desktop MCP tools — ${error.message}`);
  }
}

/**
 * Open one site in its own window: spawn its own `tovu serve` (own-server mode only — attach mode
 * never reaches this), or just focus its window if it is already open. Records the new child to the
 * crash-safety registry the moment it is confirmed ready, and gives its window a distinct title so
 * the native Window menu doubles as the switcher (see this file's own header).
 *
 * The registry row and the in-memory `openSites` entry are made or unmade TOGETHER, never one
 * without the other. {@link startSiteBackend} records the row before this returns (rather than
 * after `createWindow` runs) — a row must exist for the whole time the server is actually alive,
 * since that is exactly the window `reconcileOrphans()` on the NEXT launch needs to find it if this
 * process is killed before either commits — but if `createWindow` itself throws, this attempt
 * failed as a whole: no window means no way for THIS process to reach or stop that server again (no
 * `openSites` entry, no `closed` listener), so leaving its row behind would strand it silently —
 * recorded but untracked, both here and (should this same siteDir be tried again) unreachable
 * through `already.window` either. The `catch` below stops the just-spawned server and drops the
 * row rather than leaving either half of that inconsistent, then rethrows so the caller still
 * reports the failure.
 *
 * Callers MUST run this through `serializer.run(siteDir, ...)` — this function itself does not
 * serialize, so two concurrent calls for the same `siteDir` (a fast double-click) could otherwise
 * both see "not open yet" and spawn two children for the same site.
 *
 * @returns the site's `BrowserWindow`.
 * @complexity O(1) beyond `startSiteBackend`'s own cost.
 */
async function openSiteWindow(siteDir, ctx, options = {}) {
  const already = openSites.get(siteDir);
  if (already) {
    already.window.show();
    already.window.focus();
    return already.window;
  }

  const { server, partition } = await startSiteBackend(siteDir, ctx, options);

  let window;
  try {
    window = createWindow(server.adminUrl, readSiteName(siteDir), partition);
  } catch (error) {
    recordSiteClosed(ctx.registryPath, siteDir, { pid: server.pid });
    await server.stop();
    throw error;
  }

  openSites.set(siteDir, { server, window });
  window.on("closed", () => {
    // Only when the current entry is still THIS window's (D-09). `site-supervisor.js` removes an
    // entry whose child died, and the operator can re-open the same site from "Open Recent" while
    // this dead window is still on screen — a second `tovu serve`, a second window, a REPLACEMENT
    // entry under the same key. Deleting by site dir alone then dropped that healthy replacement
    // the moment the old window was closed: `before-quit` no longer stopped it, the Projects screen
    // reported the site as stopped, and "Start" spawned a THIRD child over the same `content.db`.
    // The supervisor's own `handleExit` guards by entry identity for exactly this reason; this is
    // its missing sibling.
    if (openSites.get(siteDir)?.window === window) openSites.delete(siteDir);
    // Ends this window's session for real instead of leaving it to expire on its own up to 30 days
    // later — the other half of the accumulation fix above. Best-effort and awaited before
    // `server.stop()` so the request actually reaches the child before BR-07's graceful SIGTERM
    // drain tears it down; a failed or no-op logout (nothing left to revoke) never blocks the close.
    //
    // TRACKED, and the crash-safety row is dropped only at the END of it. The row exists so the
    // next launch can reap a child this process left running, so it must outlive the child, not the
    // window: dropping it up front — as this did — meant a hard kill during the stop left a
    // `tovu serve` that `reconcileOrphans` could never find. `before-quit` waits on the tracked
    // promise, which is what stops `app.quit()` racing an unfinished `server.stop()` when this is
    // the last window (see `shutdown-tracker.js`).
    pendingTeardowns.track(
      endSiteSession({ net, session: session.fromPartition(partition), adminUrl: server.adminUrl })
        .catch(() => {})
        .then(() => server.stop())
        .catch(() => {})
        .finally(() => recordSiteClosed(ctx.registryPath, siteDir, { pid: server.pid })),
    );
  });
  return window;
}

/**
 * The sites home UI's counterpart to {@link openSiteWindow}: ensure `siteDir`'s own `tovu serve` is
 * running and return its `server` handle, WITHOUT a `BrowserWindow`. The Projects screen embeds the
 * result directly in a `<webview>` tab inside its one window instead (`App.tsx`'s
 * `SiteWorkspace`, reading `port`/`partition` off the `SiteRecord` `project-ipc.js`'s
 * `handleStart` returns). Reused, not re-spawned, when already open — same as `openSiteWindow`.
 *
 * Nothing here ever closes what it opens. Unlike a `BrowserWindow`, a `<webview>` tab has no
 * per-tab lifecycle event to hang a stop on: closing a tab is a renderer-only concern
 * (`App.hooks.ts`'s `closeProjectTab`) and deliberately leaves the site running, the same way
 * Tovu-Runner leaves a project running when its tab closes. `app.on("before-quit")` below still
 * stops every entry in `openSites` on quit, sites-home-opened or not, and `project-ipc.js`'s
 * `handleDelete` still stops one explicitly.
 *
 * Callers MUST run this through `serializer.run(siteDir, ...)`, same requirement as
 * `openSiteWindow` and for the same reason.
 *
 * @returns the started (or reused) server handle.
 * @complexity O(1) beyond `startSiteBackend`'s own cost.
 */
async function openSiteServer(siteDir, ctx, options = {}) {
  const already = openSites.get(siteDir);
  if (already) return already.server;

  const { server } = await startSiteBackend(siteDir, ctx, options);
  openSites.set(siteDir, { server });
  return server;
}

/**
 * Whether `raw` points at a site this launch is currently supervising through the sites home UI's
 * embedded tabs — the boundary {@link registerGuestNavigationPolicy} enforces before ever handing a
 * guest-requested url to the operator's own browser. Scoped to `openSites`' own live ports rather
 * than a separate registry, since `openSites` already IS this shell's registry of what is running.
 *
 * @complexity O(n) in currently open sites.
 */
function isSupervisedGuestUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") return false;
  return [...openSites.values()].some((entry) => entry.server && String(entry.server.port) === url.port);
}

/**
 * Answers navigation/window-open requests an embedded project's `<webview>` guest makes — the same
 * two-part boundary Tovu-Runner's own `registerGuestNavigationPolicy` enforces
 * (`Tovu-Runner/src/main/main.ts`): a same-origin navigation (the site steering itself — a login
 * redirect, an admin route that round-trips the server) is left alone, since the tab IS that
 * project's admin and has to keep working; anything that would leave the guest's own origin is
 * denied INSIDE the guest and, only when it targets a site this launch actually supervises, handed
 * to the operator's own default browser instead. `allowpopups` on the tag (`App.tsx`) is the other
 * half — without it Electron's guest-view manager never lets a `target="_blank"` request reach this
 * process at all, so `setWindowOpenHandler` below would never fire.
 *
 * Registered once, globally, from the sites-home boot branch: `web-contents-created` fires for every
 * guest ANY window's `<webview>` ever attaches, and `contents.getType() !== "webview"` filters out
 * everything else (the sites home window's own top-level content included).
 *
 * @complexity O(1) per event, beyond `isSupervisedGuestUrl`'s own cost.
 */
function registerGuestNavigationPolicy() {
  const openExternally = (url) => {
    if (isSupervisedGuestUrl(url)) void shell.openExternal(url);
  };

  app.on("web-contents-created", (_event, contents) => {
    if (contents.getType() !== "webview") return;

    contents.setWindowOpenHandler(({ url }) => {
      openExternally(url);
      return { action: "deny" };
    });

    contents.on("will-navigate", (event, url) => {
      let target;
      let current;
      try {
        target = new URL(url).origin;
        current = new URL(contents.getURL()).origin;
      } catch {
        return;
      }
      if (target === current) return;
      event.preventDefault();
      openExternally(url);
    });
  });
}

/**
 * Shared by "Open Site…" and "Open Recent": re-classify `dir` through `adoptSiteDir` (never trust a
 * folder blindly, even one from the MRU — it could have been moved or emptied since the menu was
 * built), open it, then refresh the menu so "Open Recent" reflects the new MRU order. Reports a
 * failure where the user can see it instead of the app silently doing nothing.
 * @complexity O(1) beyond `adoptSiteDir`/`openSiteWindow`'s own cost.
 */
async function adoptAndOpenSite(dir, ctx) {
  try {
    const adopted = await adoptSiteDir({ dir, repoRoot: PAYLOAD_ROOT, statePath: ctx.statePath, cliMode: ctx.cliMode });
    await openSiteWindow(adopted, ctx);
  } catch (error) {
    dialog.showErrorBox("Tovu could not open that site", error.message);
    return;
  }
  refreshAppMenu(ctx);
}

/** The "Open Site…" menu action: ask for a folder with no MRU/dev-fallback precedence (those are
 *  startup-only conveniences — see `resolveSiteDir`), then hand it to `adoptAndOpenSite`. */
async function promptAndOpenNewSite(ctx) {
  let dir;
  try {
    dir = await promptForSiteDir(null);
  } catch (error) {
    dialog.showErrorBox("Tovu could not open that folder", error.message);
    return;
  }
  if (dir === null) return;
  await adoptAndOpenSite(dir, ctx);
}

/**
 * The app's menu. The "Window" menu's native `role: "windowMenu"` (macOS) is the site switcher
 * itself — every open site is a distinctly-titled window, and macOS lists and switches between them
 * for free; nothing custom was built for this. "Open Recent" is rebuilt on every call (see
 * `refreshAppMenu`) so a just-opened site appears there next time.
 * @complexity O(n) in the MRU length (bounded, see `site-dir-store.js`'s `MAX_RECENT_SITE_DIRS`).
 */
function buildAppMenu(ctx) {
  const recents = existingRecentSiteDirs(ctx.statePath);
  const template = [
    ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
    {
      label: "File",
      submenu: [
        { label: "Open Site…", accelerator: "CmdOrCtrl+O", click: () => void serializer.run("__open_new__", () => promptAndOpenNewSite(ctx)) },
        {
          label: "Open Recent",
          submenu:
            recents.length === 0
              ? [{ label: "No recent sites", enabled: false }]
              : recents.map((dir) => ({ label: dir, click: () => void serializer.run(dir, () => adoptAndOpenSite(dir, ctx)) })),
        },
        { type: "separator" },
        { role: "close" },
      ],
    },
    { role: "editMenu" },
    { role: "windowMenu" },
  ];
  return Menu.buildFromTemplate(template);
}

function refreshAppMenu(ctx) {
  Menu.setApplicationMenu(buildAppMenu(ctx));
}

/**
 * Report a boot failure where the user can actually see it.
 *
 * A packaged `.app` launched from Finder has no terminal attached, so `console.error` alone means
 * the app vanishes with no explanation. Cancelling the folder picker is still not a failure — it is
 * the user declining to start, so this still exits 0 — but it no longer says NOTHING: the picker
 * itself has no window behind it (see `promptForSiteDir`), so a silent quit after it is
 * indistinguishable from the app being broken. A short info dialog closes that gap without turning a
 * legitimate decline into an error.
 */
/**
 * `true` when this launch named its site dir(s) directly via env var rather than through the
 * interactive picker — `TOVU_DESKTOP_SITE_DIR`/`TOVU_DESKTOP_SITE_DIRS`, documented at the top of
 * this file as "chiefly for verification/automation". {@link reportBootFailure} uses this to decide
 * whether a boot failure may show a blocking native dialog at all: measured live (2026-09-06), a
 * `dialog.showErrorBox` shown from one of these launches — no interactive user to dismiss it — left
 * the whole Electron process hung indefinitely rather than exiting, defeating the entire point of a
 * "fail fast" policy for an automation-facing arm. An interactive picker failure still gets the
 * dialog, because a human is at the keyboard there to see and dismiss it.
 */
function isUnattendedSiteLaunch() {
  return Boolean(process.env.TOVU_DESKTOP_SITE_DIR?.trim()) || explicitStartupSiteDirs() !== null;
}

async function reportBootFailure(error) {
  if (error instanceof SiteDirSelectionCancelled) {
    if (!SELFTEST) {
      await dialog.showMessageBox({
        type: "info",
        title: "Tovu",
        message: "No site folder was chosen.",
        detail: "Tovu needs a folder to store your site before it can start. Launch again to choose one.",
      });
    }
    app.quit();
    return;
  }
  console.error(`tovu desktop: ${error.message}`);
  process.exitCode = 1;
  if (!SELFTEST && !isUnattendedSiteLaunch()) dialog.showErrorBox("Tovu could not start", error.message);
  // `app.exit(1)` ONLY when nothing is open — a boot failure this early (resolving which site
  // dir(s) to serve, before any window exists) always has `openSites` empty, so there is nothing
  // for the graceful `before-quit` drain to do, and `app.exit` guarantees the process actually
  // exits with `1` rather than depending on `app.quit()`'s normal shutdown to have honored
  // `process.exitCode` (measured live, 2026-09-06: it did not — the process reported `exitCode=0`
  // to its parent despite this same line running). When a site IS already open (a later site in a
  // multi-dir launch failing after an earlier one succeeded), `app.quit()` stays exactly as before
  // so `before-quit` still gets the chance to stop that child gracefully; that path's exit code is
  // unchanged pre-existing behavior, not something this fix touches.
  if (openSites.size === 0) app.exit(1);
  else app.quit();
}

/**
 * Wires `selftest-tracker.js`'s pure completion tracking to this process's own reporting/exit
 * effects — the only Electron/process-specific glue that module deliberately leaves out so its own
 * logic is testable without Electron. See that file's own header for the two ordering hazards its
 * `expectedCount`-seeded design closes.
 */
function buildSelftestTracker(expectedCount) {
  return createSelftestTracker(expectedCount, {
    onWindowLoaded: ({ url, title }) => {
      console.log(`tovu desktop: loaded ${url}`);
      console.log(`tovu desktop: title=${JSON.stringify(title)}`);
    },
    onWindowFailed: ({ url, code, description }) => {
      console.error(`tovu desktop: FAILED to load ${url} (${code} ${description})`);
      process.exitCode = 1;
    },
    onAllSettled: () => app.quit(),
  });
}

/** `null` outside SELFTEST mode; otherwise created once, before any window opens, and consulted by
 *  `createWindow` for every window this launch creates — see {@link createSelftestTracker}'s own
 *  doc for why registration must happen per-window, at creation time. */
let selftestTracker = null;

/**
 * The policy BOTH env-var arms below declare for a folder they name that turns out to be empty.
 *
 * `"fail"`, not `"init"`: `resolveSiteDir`'s own doc calls an env override "taken as given" — the
 * operator is asserting a site already lives there, not asking Tovu to invent one. These vars are
 * also named as chiefly for verification/automation (see this file's header), where a typo'd or
 * stale path silently becoming a brand-new, empty site is a worse failure than a loud, specific error:
 * it would hide the mistake behind a window that opens showing nothing, rather than naming the exact
 * folder and reason immediately. The interactive picker is the one place `"init"` is right, because a
 * human just chose that empty folder on purpose, in the moment (see `adoptSiteDir`'s own doc).
 */
const ENV_SITE_DIR_ON_MISSING = "fail";

/** Resolves the site dir(s) to open at launch: `TOVU_DESKTOP_SITE_DIRS` (plural) wins outright when
 *  set — chiefly for verification/automation — otherwise the existing single-site precedence chain
 *  (`resolveSiteDir`) picks exactly one. Both env-var arms route through the same
 *  `resolveOrInitSiteDir`/`resolveSiteDir` chokepoint the picker uses, under the explicit policy
 *  {@link ENV_SITE_DIR_ON_MISSING} declares — see that constant's own doc for why.
 *  @complexity O(n) in the explicit-dirs count, plus `resolveSiteDir`'s own cost in the single-site case. */
async function resolveStartupSiteDirs(ctx) {
  const explicit = explicitStartupSiteDirs();
  if (explicit) {
    return await Promise.all(
      explicit.map((dir) => resolveOrInitSiteDir({ dir, onMissingSite: ENV_SITE_DIR_ON_MISSING, repoRoot: PAYLOAD_ROOT, cliMode: ctx.cliMode })),
    );
  }

  const pinnedPort = process.env.TOVU_DESKTOP_PORT?.trim();
  const siteDir = await resolveSiteDir({
    envDir: process.env.TOVU_DESKTOP_SITE_DIR,
    onMissingSite: ENV_SITE_DIR_ON_MISSING,
    statePath: ctx.statePath,
    // Correct for a developer, absent in a packaged app — one tier of a precedence chain rather
    // than a hardcoded default.
    devFallbackDir: DEV_FALLBACK_SITE_DIR,
    repoRoot: PAYLOAD_ROOT,
    cliMode: ctx.cliMode,
    // No `name`: `initSite` defaults it to the chosen folder's basename (BR-03).
    pickDir: promptForSiteDir,
  });
  // Only the FIRST/only site honors a pinned port; every other open site still self-allocates so two
  // sites opened in the same launch never collide.
  ctx.firstSitePort = pinnedPort ? Number(pinnedPort) : undefined;
  return [siteDir];
}

/**
 * Put the Tovu mark on the macOS dock tile.
 *
 * `BrowserWindow`'s own `icon` option is a no-op on macOS — the tile comes from the `.app` bundle,
 * which an unpackaged `electron .` run does not have, so it shows Electron's own default instead.
 * `app.dock.setIcon` is the only thing that changes it for a dev run. Guarded on the API existing
 * rather than on the platform string alone, since `app.dock` is undefined off darwin.
 *
 * Best-effort: a missing or unreadable icon file must not stop the app booting.
 * @complexity O(1).
 */
function applyDockIcon() {
  if (!app.dock) return;
  try {
    app.dock.setIcon(APP_ICON_PATH);
  } catch (error) {
    console.log(`tovu desktop: could not set the dock icon (${error.message}) — using the default.`);
  }
}

/**
 * Reap every `tovu serve` a PREVIOUS launch left running, and say so. Called once per launch, ABOVE
 * the boot-mode split, before any window exists.
 *
 * It used to live inside {@link bootOwnServerMode}, which meant the sites home UI — the DEFAULT since
 * a53c80df — never reconciled anything at all. That is the mode where it matters most: opening a
 * project card calls `openSiteWindow`, which writes a crash-safety row, so the sites-home path has always
 * PRODUCED rows and never consumed them. A hard kill of Electron therefore stranded every open
 * site's child, the next launch reaped none of them, and clicking the same card allocated a fresh
 * port and started a SECOND `tovu serve` over the same `content.db`. Two writers on one sqlite file
 * is the part that mattered; the leaked port and memory were the visible symptom.
 *
 * Safe above the split for all three modes. Every mode resolves the same `registryPath` from the
 * same `userData`, so there is one registry to reconcile whichever way this launch goes, and attach
 * mode — which spawns nothing and records nothing — can only ever find rows a previous own-server or
 * sites-home launch left behind, exactly the rows that should be reaped. It cannot touch a CONCURRENT
 * instance's children: `reconcileOrphans` proves a row's process has actually been reparented to
 * launchd before terminating it, and retains the rows of any still-supervised sibling (see
 * `site-process-registry.js`'s `isOrphanedProcess`).
 *
 * @complexity O(n) in persisted row count; each row's own cost is `terminateOrphan`'s bounded poll,
 *   so a launch can be delayed by up to that grace window per genuine orphan.
 */
async function reconcileOrphansOnBoot(registryPath) {
  const reconciled = await reconcileOrphans(registryPath);
  if (reconciled.length === 0) return;
  console.log(
    `tovu desktop: reconciled ${reconciled.length} orphaned site process(es) left running by a previous crash: ${reconciled.map((row) => row.siteDir).join(", ")}`,
  );
}

/**
 * Boot mode 2 — own server. Build the menu, then open every startup site.
 *
 * Extracted from the `whenReady` handler rather than left inline: with a third boot mode added,
 * that one arrow carried every branch of all three and measured cyclomatic complexity 10 against
 * this repo's ceiling of 9. Splitting on the mode boundary is the natural cut — the three modes are
 * now three symmetric named things — and it is a pure move: no statement, order, or condition
 * below differs from what was inline.
 *
 * @complexity O(n) in the number of startup site dirs, beyond each site's own boot cost.
 */
async function bootOwnServerMode() {
  const ctx = {
    cliMode: resolveCliMode(),
    statePath: stateFilePath(app.getPath("userData")),
    registryPath: registryFilePath(app.getPath("userData")),
  };

  refreshAppMenu(ctx);

  const siteDirs = await resolveStartupSiteDirs(ctx);
  // Seeded with the FULL count before any window opens — see `selftest-tracker.js`'s own header,
  // hazard 2, for why an incrementally-built count would settle early on a multi-site launch.
  if (SELFTEST) selftestTracker = buildSelftestTracker(siteDirs.length);
  for (const [index, siteDir] of siteDirs.entries()) {
    // Only the FIRST site in this launch's list ever honors a pinned port — see
    // `resolveStartupSiteDirs` and `openSiteWindow`'s own doc on why.
    const port = index === 0 ? ctx.firstSitePort : undefined;
    await serializer.run(siteDir, () => openSiteWindow(siteDir, ctx, { port }));
  }
  refreshAppMenu(ctx);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void promptAndOpenNewSite(ctx);
  });
}

app
  .whenReady()
  .then(async () => {
    // Registered before either boot-mode branch below so a window's very first `isAvailable()`
    // call (fired from the preload the instant the page mounts) never races an unregistered
    // channel — see `SPEECH_PRELOAD_PATH`'s own doc for why this and the preload path are both
    // needed for `window.tovuVoice` to exist at all.
    registerSpeechIpc({ ipcMain });
    applyDockIcon();

    // ABOVE the mode split, deliberately: the sites home UI writes crash-safety rows (every project tab's
    // first open goes through `openSiteServer`) but used to read none back, so a hard kill leaked
    // every open site's `tovu serve` forever. See `reconcileOrphansOnBoot`'s own doc for why running
    // it for all three modes is correct and why it cannot reap a live sibling instance's children.
    await reconcileOrphansOnBoot(registryFilePath(app.getPath("userData")));

    // Checked before every other mode: the sites home UI supersedes both attach and own-server, and it
    // spawns no `tovu serve` of its own at boot — only when a project tab is first opened, through
    // `openSiteServer`'s own `serializer`-guarded spawn-or-reuse (the sites-home counterpart of the
    // `openSiteWindow` own-server mode uses below).
    if (sitesUiRequested()) {
      const sitesCtx = {
        cliMode: resolveCliMode(),
        statePath: stateFilePath(app.getPath("userData")),
        registryPath: registryFilePath(app.getPath("userData")),
        projectsPath: sitesFilePath(app.getPath("userData")),
      };
      // Once, before the seed reads the file: a registry written before removals were RECORDED
      // cannot say whether the dev fallback below is absent because it was never seeded or because
      // the operator deleted its card, and the seed is about to ask exactly that. See
      // `migrateLegacyDismissals`' own doc for why this is the narrow, one-directory conversion it
      // is, and `main-project-wiring.test.js` for the test that pins this call ahead of the seed.
      // Both dev-fallback calls are skipped outright when there is no dev fallback (a packaged
      // app). `migrateLegacyDismissals` in particular takes a DIRECTORY and would otherwise record
      // a literal `null` into the `dismissed` array — a corrupt row, not a no-op.
      if (DEV_FALLBACK_SITE_DIR) {
        migrateLegacyDismissals(sitesCtx.projectsPath, DEV_FALLBACK_SITE_DIR);
      // A brand-new `userData` tracks nothing, so the Projects screen would otherwise show only
      // the "Add project" card forever until the operator ran "+ Create website" once. Seeding the
      // same dev-fallback site `resolveStartupSiteDirs` already falls back to below (`sites/tovu-
      // com` in a checkout, absent in a packaged app) gives a real card on first launch instead —
      // mirroring that existing precedent rather than fabricating one. The guard is per-DIRECTORY
      // now, not the old "has this file ever been written": that one also blocked every legitimate
      // case, so nothing could ever be seeded or discovered again after the first write. A project
      // the operator removed still stays removed, from the recorded dismissal rather than from the
      // file's mere existence — see `seedDevFallbackSite`'s own doc.
      // `classifySiteDirSafely`, not `classifySiteDir`: this line and `rescanSites` below both
      // run inside this `whenReady()` chain, whose only handler is `reportBootFailure`, and both
      // run BEFORE `openSitesHomeWindow()`. The throwing form is for the folder PICKER, where the
      // dialog shows the operator the error; here one unreadable candidate quit the app before any
      // window existed, leaving no renderer for the Rescan button to live in (D-01).
        seedDevFallbackSite(sitesCtx.projectsPath, DEV_FALLBACK_SITE_DIR, classifySiteDirSafely);
      }
      // Built once and shared: `rescanSites` below needs the same `deps` the handlers get, and a
      // second literal would be free to drift from this one in exactly the fields (`projectsPath`,
      // `classifySiteDir`, the scan inputs) where drift is invisible until a site fails to appear.
      const projectDeps = {
        ipcMain,
        dialog,
        shell,
        openSites,
        serializer,
        projectsPath: sitesCtx.projectsPath,
        registryPath: sitesCtx.registryPath,
        repoRoot: PAYLOAD_ROOT,
        statePath: sitesCtx.statePath,
        cliMode: sitesCtx.cliMode,
        readSiteName,
        // The write counterpart of `readSiteName` right above: validating and atomic, because a
        // torn or empty `config.json.name` does not break the running site — it stops the NEXT
        // boot, with an error naming a file the operator never edited. See `site-config.js`.
        writeSiteName,
        adoptSiteDir,
        // `handleCreate` classifies the picked folder BEFORE adopting it, so a project's row records
        // whether this app CREATED the directory or merely adopted one that already existed — the
        // fact `project-delete-guard.js` needs before any delete may erase anything.
        //
        // The SAFE form, because `rescanSites` scans with this same value (D-01). `handleCreate`
        // is unaffected: an unreadable pick classifies `"unreadable"` rather than `"empty"`, so the
        // row would be `adopted` — and it never gets written, because `adoptSiteDir` re-classifies
        // with the throwing form one line later and refuses the folder with its own message.
        classifySiteDir: classifySiteDirSafely,
        // "Add Tovu Website" — pointer-only, and deliberately NOT `adoptSiteDir`, which inits an
        // empty folder. See `add-site-pointer.js`'s header and `handleAddSite`.
        addSitePointer,
        openSiteServer,
        recordSiteClosed,
        // How `handleDelete` sees a SIBLING app instance's open sites before erasing a directory —
        // `openSites` above is this process's own memory and cannot (D-08). See
        // `project-ipc.js`'s `liveForeignServers`.
        readRegistry,
        isLiveServeRow,
        siteScanRoots: SITE_SCAN_ROOTS,
        // A thunk, not the list: read fresh on every scan, so a site opened during this session is
        // found by a later rescan instead of being frozen out by a snapshot taken at boot.
        recentSiteDirs: () => existingRecentSiteDirs(sitesCtx.statePath),
        ctx: sitesCtx,
      };
      // Registered BEFORE the stubs: `ipcMain.handle` throws on a duplicate registration, so these
      // real handlers must claim their channels first — see `project-ipc.js`'s own header.
      registerSiteIpcHandlers(projectDeps);
      // The boot discovery pass, and the answer to "a site created by `tovu init` outside the shell
      // never appears": until this existed the Projects screen rendered `desktop-projects.json` and
      // nothing else. Runs before `openSitesHomeWindow` so the first render already shows what is
      // really on disk rather than a list that fills in on the next 4s poll.
      rescanSites(projectDeps);
      registerRunnerIpcStubs({ ipcMain });
      // Global, not per-window: see `registerGuestNavigationPolicy`'s own doc for why one
      // registration covers every project tab's `<webview>` guest.
      registerGuestNavigationPolicy();
      if (SELFTEST) selftestTracker = buildSelftestTracker(1);
      openSitesHomeWindow();
      return;
    }

    const attachUrl = process.env.TOVU_DESKTOP_URL?.trim();
    if (attachUrl) {
      // Attach mode is always exactly one window.
      if (SELFTEST) selftestTracker = buildSelftestTracker(1);
      createWindow(attachUrl, "Tovu");
      return;
    }

    await bootOwnServerMode();
  })
  .catch(reportBootFailure);

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
 * every open site's child at once. `site-process-registry.js`'s `reconcileOrphans()` — run before any
 * window opens on the NEXT launch — is what answers that now (see this file's own header).
 */
app.on("before-quit", (event) => {
  // `pendingTeardowns` as well as `openSites` (D-09). A window's `closed` handler removes its entry
  // from `openSites` synchronously and only THEN starts stopping the child, so closing the last
  // window left this reading "nothing open" while a `tovu serve` was still alive — and it is spawned
  // `detached`, so it outlives the app. See `shutdown-tracker.js`'s own header.
  if ((openSites.size === 0 && pendingTeardowns.size === 0) || shuttingDown) return;
  event.preventDefault();
  shuttingDown = true;
  const stops = [...openSites.values()].map((entry) => entry.server.stop().catch(() => {}));
  Promise.all(stops)
    .then(() => pendingTeardowns.drain())
    .finally(() => app.quit());
});

app.on("window-all-closed", () => {
  app.quit();
});
