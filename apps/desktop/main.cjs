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
 * 0. **Fleet UI** — the DEFAULT since 2026-09-06. Opens Tovu-Runner's ported renderer
 *    (`src/renderer/`, built to `dist/renderer/index.html`) instead of any site's admin — its
 *    Projects screen, now the app's actual front page. `list`/`create`/`delete`/`open-external`/
 *    `open-window` are real (`src/project-ipc.cjs`), routing a card click through the same
 *    `openSiteWindow`/`serializer` path own-server mode uses below; `start`/`stop` stay throwing
 *    stubs on purpose — see `RUNNER_PROJECT_CHANNELS.openWindow`'s own doc on why the N-window
 *    model never needs them. See `fleetUiRequested`'s own doc for exactly which env vars bypass
 *    this default and fall through to modes 1/2 instead.
 *
 * 1. **Attach** (`TOVU_DESKTOP_URL` set). The window loads a stack someone else already started —
 *    normally the `npm run dev` pair (API on :3000, admin Vite on :5173). Nothing is spawned, so
 *    web mode and desktop mode run side by side against the same server. Single-site only — there
 *    is exactly one URL to attach to — and unrelated to everything else below. Bypasses the fleet
 *    UI unconditionally: an automation/dev workflow that already names its one destination has no
 *    use for a project picker.
 *
 * 2. **Own server** (`TOVU_DESKTOP_SITE_DIR` or `TOVU_DESKTOP_SITE_DIRS` set). Spawns Tovu's OWN
 *    `tovu serve <dir>` CLI as a child per open site and loads the port each one reports. `tovu
 *    serve` is already the packaged single-site entry point — it boots the site dir, opens
 *    `<dir>/content.db`, wires the admin SPA and starts the agent daemon
 *    (`apps/website/src/cli/commands/serve.ts`). The shell therefore needs no Tovu-side change to
 *    open a second, third, or Nth site: `src/tovu-server.cjs`'s `startTovuServer` was already a
 *    pure `{repoRoot, siteDir, port} -> handle` function with no single-instance assumption
 *    anywhere in it. Also bypasses the fleet UI unconditionally, same reasoning as attach mode —
 *    this is what keeps every `TOVU_DESKTOP_SITE_DIR`-driven E2E spec and any other automation
 *    byte-for-byte unaffected by the fleet UI becoming the default.
 *
 * **Multi-site, concretely:**
 * - `openSites` (a `Map<siteDir, {server, window}>`) replaces the old single `tovuServer` variable.
 * - Each open site gets its own `BrowserWindow`, titled with the site's own name — Electron's native
 *   `role: "windowMenu"` (macOS) then lists every open window and switches between them for free.
 *   That IS the site switcher: no custom panel was needed, every open site is just another window.
 * - "Open Site…" (File menu) runs the folder picker for a NEW site, independent of whichever sites
 *   are already open. "Open Recent" lists `site-dir-store.cjs`'s existing MRU.
 * - `keyed-serializer.cjs` serializes opens PER SITE DIR, so a fast double-click on the same recent-
 *   site menu entry cannot double-spawn a `tovu serve` for it (Tovu-Runner's `serializeByProject`
 *   pattern, generalized).
 *
 * **Crash-safety**, now in scope (`site-registry.cjs`): every open site's `{siteDir, port,
 * workspaceId, pid}` is persisted to a small JSON registry the moment its `tovu serve` reports ready,
 * and removed the moment it is stopped deliberately (a window closed, or the app quit cleanly). If
 * Electron itself is hard-killed (SIGKILL, a crash, a forced logout) before that removal runs, the
 * NEXT launch's `reconcileOrphans()` finds the stale row, proves the pid is STILL that row's own
 * `tovu serve` (identity-before-kill — see that file's own header), and terminates it before any
 * window opens. This was `main.cjs`'s own prior comment's deferred item: "that machinery belongs
 * with the fleet supervisor... reported rather than ported." It is now built, sized to what this
 * shell actually needs (not Tovu-Runner's full fleet registry). That reconciliation runs for EVERY
 * boot mode ({@link reconcileOrphansOnBoot}, above the mode split); it lived inside own-server mode
 * alone until 2026-09-06, which left the fleet UI — the default, and the mode that actually produces
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
 * without touching the build or the Jini links. See `tovu-server.cjs`'s `buildCliSpawnPlan` for the
 * mode's own default (unchanged, `"compiled"`, so every existing test keeps its exact prior
 * behavior) versus this file's production default (`"source"`, set here via the env var).
 *
 * `TOVU_DESKTOP_SELFTEST=1` makes the shell prove itself and exit instead of staying open: it
 * reports every opened window's URL and title, then quits 0 once all have loaded (1 on any failure).
 *
 * Environment:
 * - `TOVU_DESKTOP_UI`        — `"runner"` opens the ported fleet renderer explicitly (redundant
 *   with the default now, kept for anyone who has it set); any other non-empty value forces the
 *   pre-flip behavior even with no site-selecting env var set. See `fleetUiRequested`.
 * - `TOVU_DESKTOP_URL`       — attach to this origin instead of spawning any server (single-site);
 *   also bypasses the fleet UI default.
 * - `TOVU_DESKTOP_SITE_DIR`  — force a single site dir for own-server mode, skipping the picker;
 *   also bypasses the fleet UI default.
 * - `TOVU_DESKTOP_SITE_DIRS` — comma-separated site dirs to open at launch, one window each —
 *   bypasses the picker/MRU/dev-fallback precedence entirely, and the fleet UI default. Chiefly
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
const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, dialog, shell, Menu, ipcMain, net, session } = require("electron");

const { startTovuServer } = require("./src/tovu-server.cjs");
const { resolveSiteDir, resolveOrInitSiteDir, adoptSiteDir, classifySiteDir, stateFilePath, existingRecentSiteDirs, SiteDirSelectionCancelled } = require("./src/site-dir-store.cjs");
const { registryFilePath, reconcileOrphans, recordSiteOpened, recordSiteClosed } = require("./src/site-registry.cjs");
const { createKeyedSerializer } = require("./src/keyed-serializer.cjs");
const { createSelftestTracker } = require("./src/selftest-tracker.cjs");
const { registerSpeechIpc } = require("./src/speech/speech-ipc.cjs");
const { registerRunnerIpcStubs } = require("./src/runner-ipc-stubs.cjs");
const { redeemBootSession, sitePartition, hasActiveSessionCookie, endSiteSession } = require("./src/desktop-auth.cjs");
const { projectsFilePath, seedDevFallbackProject } = require("./src/project-registry.cjs");
const { registerProjectIpcHandlers } = require("./src/project-ipc.cjs");

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
 *  `speech-ipc.cjs`'s own headers for the wiring gap this closes (both were built and tested with
 *  neither this path nor {@link registerSpeechIpc} ever called from here). */
const SPEECH_PRELOAD_PATH = path.join(__dirname, "src", "speech", "preload-speech.cjs");

/** The built fleet renderer. `npm run build:renderer` produces it; `openFleetWindow` reports its
 *  absence rather than opening a blank window on a source-only checkout. */
const FLEET_RENDERER_PATH = path.join(__dirname, "dist", "renderer", "index.html");

/** Preload for the FLEET window only. A native-ESM preload, which Electron 43 supports solely in an
 *  unsandboxed renderer — hence `sandbox: false` in {@link openFleetWindow}, and hence site-admin
 *  windows keeping {@link SPEECH_PRELOAD_PATH} and `sandbox: true` untouched. It exposes BOTH
 *  `window.tovuRunner` and `window.tovuVoice`; see its own header on why the mic bridge had to be
 *  duplicated rather than shared. */
const FLEET_PRELOAD_PATH = path.join(__dirname, "dist", "preload", "preload.mjs");

/** The Tovu mark for the macOS dock tile — see {@link applyDockIcon}. Copied into this directory
 *  from the tovu-com theme rather than referenced out of `sites/tovu-com/`, which is a user's live
 *  site folder and not an asset source this app may depend on. */
const APP_ICON_PATH = path.join(__dirname, "src", "renderer", "public", "brand", "tovu-app-icon.png");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SELFTEST = process.env.TOVU_DESKTOP_SELFTEST === "1";

/**
 * `true` when this launch should open the fleet Projects screen (boot mode 0) rather than a site
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
 * above, historically to force the fleet UI over a pinned site dir — that ordering is preserved:
 * explicit `runner` is checked, and returns, before any bypass condition below).
 */
function fleetUiRequested() {
  if (process.env.TOVU_DESKTOP_UI?.trim() === "runner") return true;
  const bypassesFrontPage =
    Boolean(process.env.TOVU_DESKTOP_URL?.trim()) ||
    Boolean(process.env.TOVU_DESKTOP_SITE_DIR?.trim()) ||
    explicitStartupSiteDirs() !== null;
  return !bypassesFrontPage;
}

/** `siteDir -> { server, window }` for every site this process currently has open. Replaces the
 *  single-site `tovuServer` variable the shell used before multi-site. */
const openSites = new Map();

/** Serializes site opens PER SITE DIR — see this file's own header on why. */
const serializer = createKeyedSerializer();

/** Guards `before-quit` against re-entering once the graceful multi-site shutdown is already under
 *  way — mirrors the single-site shell's own prior `shuttingDown` variable. */
let shuttingDown = false;

/** `"source"` (default) or `"compiled"` — see this file's own header. Read once at module load,
 *  same convention as every other `TOVU_DESKTOP_*` env var below (parsed here, passed down as a
 *  plain argument, never read directly by `tovu-server.cjs`/`site-dir-store.cjs`). */
function resolveCliMode() {
  return process.env.TOVU_DESKTOP_CLI_MODE?.trim() === "compiled" ? "compiled" : "source";
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
      // the default session it always used. See `desktop-auth.cjs`'s header, property 2.
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
 * Open the ported Tovu-Runner fleet UI (the Projects screen). Boot mode 0 — see this file's header.
 *
 * Only one webPreference differs from {@link createWindow}, forced by the renderer rather than
 * chosen: `sandbox: false`, because {@link FLEET_PRELOAD_PATH} is a native-ESM preload and Electron
 * 43 loads one only in an unsandboxed renderer.
 *
 * No `webviewTag` and no `will-attach-webview` hardening — Tovu-Runner's own `main.ts` needs both
 * because it embeds each project's `tovu serve` output in a `<webview>` inside this one window.
 * `apps/desktop` opens each project in its OWN `BrowserWindow` instead (`openSiteWindow`, via
 * `project-ipc.cjs`'s `runner:projects:open-window` handler), so there is no guest to attach and no
 * page-controlled `webPreferences` to harden against — not having that attack surface beats hardening
 * it. See `2026-09-06-runner-ui-port-manifest-v2.md` §3 for the full ledger.
 *
 * @returns the window, or `null` when the renderer has not been built yet.
 * @complexity O(1).
 */
function openFleetWindow() {
  if (!fs.existsSync(FLEET_RENDERER_PATH)) {
    const message = `The fleet UI is not built. Run \`npm run build\` in apps/desktop, or unset TOVU_DESKTOP_UI to launch a site instead.\n\nExpected: ${FLEET_RENDERER_PATH}`;
    console.error(`tovu desktop: ${message}`);
    process.exitCode = 1;
    if (!SELFTEST) dialog.showErrorBox("Tovu could not start", message);
    app.quit();
    return null;
  }

  const window = new BrowserWindow({
    width: 1360,
    height: 900,
    title: "Tovu",
    show: !SELFTEST,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: FLEET_PRELOAD_PATH,
    },
  });

  if (selftestTracker) selftestTracker.add(window);
  window.on("page-title-updated", (event) => event.preventDefault());

  void window.loadFile(FLEET_RENDERER_PATH);
  return window;
}

/**
 * Put a valid admin session in `partition`'s cookie jar before its window loads, so the operator
 * lands in the admin instead of on a login form.
 *
 * The credential is the single-use boot token the child minted at boot and printed on its own
 * stdout — never a password, never anything stored. See `desktop-auth.cjs`'s header for why the
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
 * Open one site: spawn its own `tovu serve` (own-server mode only — attach mode never reaches this),
 * or just focus its window if it is already open. Records the new child to the crash-safety
 * registry the moment it is confirmed ready, and gives its window a distinct title so the native
 * Window menu doubles as the switcher (see this file's own header).
 *
 * The registry row and the in-memory `openSites` entry are made or unmade TOGETHER, never one
 * without the other. Recording the row before `createWindow` runs (rather than after) is
 * deliberate — a row must exist for the whole time the server is actually alive, since that is
 * exactly the window `reconcileOrphans()` on the NEXT launch needs to find it if this process is
 * killed before either commits — but if `createWindow` itself throws, this attempt failed as a
 * whole: no window means no way for THIS process to reach or stop that server again (no `openSites`
 * entry, no `closed` listener), so leaving its row behind would strand it silently — recorded but
 * untracked, both here and (should this same siteDir be tried again) unreachable through
 * `already.window` either. The `catch` below stops the just-spawned server and drops the row rather
 * than leaving either half of that inconsistent, then rethrows so the caller still reports the
 * failure.
 *
 * Callers MUST run this through `serializer.run(siteDir, ...)` — this function itself does not
 * serialize, so two concurrent calls for the same `siteDir` (a fast double-click) could otherwise
 * both see "not open yet" and spawn two children for the same site.
 *
 * @param options.port pin this site's port (only ever passed for the startup call honoring
 *   `TOVU_DESKTOP_PORT` — see `resolveStartupSiteDirs`); every other call self-allocates so two
 *   sites opened in the same launch can never collide.
 * @returns the site's `BrowserWindow`.
 * @complexity O(1) beyond `startTovuServer`'s own cost.
 */
async function openSiteWindow(siteDir, ctx, options = {}) {
  const already = openSites.get(siteDir);
  if (already) {
    already.window.show();
    already.window.focus();
    return already.window;
  }

  const partition = sitePartition(siteDir);

  // A site already authenticated from a previous launch keeps its session cookie in this
  // `persist:`-prefixed partition (see `desktop-auth.cjs`'s header, property 2) across app restarts.
  // Minting and redeeming a fresh boot token here TOO was the defect: a brand-new 30-day session on
  // every open, one per launch, none of them ever revoked — 713 live rows found in one site's own
  // database. Skipping the mint when a session cookie is already present is what stops that
  // accumulation at its source; `window.on("closed", ...)` below is the other half — giving a
  // session a real end instead of leaving it to expire on its own.
  const alreadyAuthenticated = await hasActiveSessionCookie({ session: session.fromPartition(partition) });

  // `emitBootToken` is what makes `server.bootToken` non-null below — see `desktop-auth.cjs`'s
  // header for why this replaced a shell-minted, shell-stored password entirely. Omitted when a
  // session cookie already covers this site, so a reused session mints nothing that will just go
  // unredeemed.
  const server = await startTovuServer({
    repoRoot: REPO_ROOT,
    siteDir,
    cliMode: ctx.cliMode,
    port: options.port,
    emitBootToken: !alreadyAuthenticated,
  });
  recordSiteOpened(ctx.registryPath, {
    siteDir,
    port: server.port,
    workspaceId: server.workspaceId,
    pid: server.pid,
    updatedAt: Date.now(),
  });

  if (!alreadyAuthenticated) {
    // Before the window exists, so the cookie is already in the jar when `loadURL` fires and the
    // admin's very first `/api/admin/v1/auth/me` call is authenticated — a session applied after the
    // page had loaded would still show the login form until a reload.
    await authenticateSiteSession(siteDir, server, partition);
  }

  let window;
  try {
    window = createWindow(server.adminUrl, readSiteName(siteDir), partition);
  } catch (error) {
    recordSiteClosed(ctx.registryPath, siteDir);
    await server.stop();
    throw error;
  }

  openSites.set(siteDir, { server, window });
  window.on("closed", () => {
    openSites.delete(siteDir);
    recordSiteClosed(ctx.registryPath, siteDir);
    // Ends this window's session for real instead of leaving it to expire on its own up to 30 days
    // later — the other half of the accumulation fix above. Best-effort and awaited before
    // `server.stop()` so the request actually reaches the child before BR-07's graceful SIGTERM
    // drain tears it down; a failed or no-op logout (nothing left to revoke) never blocks the close.
    void endSiteSession({ net, session: session.fromPartition(partition), adminUrl: server.adminUrl })
      .catch(() => {})
      .finally(() => void server.stop());
  });
  return window;
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
    const adopted = await adoptSiteDir({ dir, repoRoot: REPO_ROOT, statePath: ctx.statePath, cliMode: ctx.cliMode });
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
 * @complexity O(n) in the MRU length (bounded, see `site-dir-store.cjs`'s `MAX_RECENT_SITE_DIRS`).
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
 * Wires `selftest-tracker.cjs`'s pure completion tracking to this process's own reporting/exit
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
      explicit.map((dir) => resolveOrInitSiteDir({ dir, onMissingSite: ENV_SITE_DIR_ON_MISSING, repoRoot: REPO_ROOT, cliMode: ctx.cliMode })),
    );
  }

  const pinnedPort = process.env.TOVU_DESKTOP_PORT?.trim();
  const siteDir = await resolveSiteDir({
    envDir: process.env.TOVU_DESKTOP_SITE_DIR,
    onMissingSite: ENV_SITE_DIR_ON_MISSING,
    statePath: ctx.statePath,
    // Correct for a developer, absent in a packaged app — one tier of a precedence chain rather
    // than a hardcoded default.
    devFallbackDir: path.join(REPO_ROOT, "sites", "tovu-com"),
    repoRoot: REPO_ROOT,
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
 * It used to live inside {@link bootOwnServerMode}, which meant the fleet UI — the DEFAULT since
 * a53c80df — never reconciled anything at all. That is the mode where it matters most: opening a
 * project card calls `openSiteWindow`, which writes a crash-safety row, so the fleet path has always
 * PRODUCED rows and never consumed them. A hard kill of Electron therefore stranded every open
 * site's child, the next launch reaped none of them, and clicking the same card allocated a fresh
 * port and started a SECOND `tovu serve` over the same `content.db`. Two writers on one sqlite file
 * is the part that mattered; the leaked port and memory were the visible symptom.
 *
 * Safe above the split for all three modes. Every mode resolves the same `registryPath` from the
 * same `userData`, so there is one registry to reconcile whichever way this launch goes, and attach
 * mode — which spawns nothing and records nothing — can only ever find rows a previous own-server or
 * fleet launch left behind, exactly the rows that should be reaped. It cannot touch a CONCURRENT
 * instance's children: `reconcileOrphans` proves a row's process has actually been reparented to
 * launchd before terminating it, and retains the rows of any still-supervised sibling (see
 * `site-registry.cjs`'s `isOrphanedProcess`).
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
  // Seeded with the FULL count before any window opens — see `selftest-tracker.cjs`'s own header,
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

    // ABOVE the mode split, deliberately: the fleet UI writes crash-safety rows (every card click
    // goes through `openSiteWindow`) but used to read none back, so a hard kill leaked every open
    // site's `tovu serve` forever. See `reconcileOrphansOnBoot`'s own doc for why running it for all
    // three modes is correct and why it cannot reap a live sibling instance's children.
    await reconcileOrphansOnBoot(registryFilePath(app.getPath("userData")));

    // Checked before every other mode: the fleet UI supersedes both attach and own-server, and it
    // spawns no `tovu serve` of its own at boot — only when a project card is clicked, through the
    // SAME `openSiteWindow`/`serializer` path own-server mode uses below.
    if (fleetUiRequested()) {
      const fleetCtx = {
        cliMode: resolveCliMode(),
        statePath: stateFilePath(app.getPath("userData")),
        registryPath: registryFilePath(app.getPath("userData")),
        projectsPath: projectsFilePath(app.getPath("userData")),
      };
      // A brand-new `userData` tracks nothing, so the Projects screen would otherwise show only
      // the "Add project" card forever until the operator ran "+ Create website" once. Seeding the
      // same dev-fallback site `resolveStartupSiteDirs` already falls back to below (`sites/tovu-
      // com` in a checkout, absent in a packaged app) gives a real card on first launch instead —
      // mirroring that existing precedent rather than fabricating one. See `seedDevFallbackProject`'s
      // own doc for exactly what "first launch" means (file existence, not an empty tracked list) —
      // that distinction is what keeps this from re-adding a site the operator deliberately removed.
      seedDevFallbackProject(fleetCtx.projectsPath, path.join(REPO_ROOT, "sites", "tovu-com"), classifySiteDir);
      // Registered BEFORE the stubs: `ipcMain.handle` throws on a duplicate registration, so these
      // five real handlers must claim their channels first — see `project-ipc.cjs`'s own header.
      registerProjectIpcHandlers({
        ipcMain,
        dialog,
        shell,
        openSites,
        serializer,
        projectsPath: fleetCtx.projectsPath,
        registryPath: fleetCtx.registryPath,
        repoRoot: REPO_ROOT,
        statePath: fleetCtx.statePath,
        cliMode: fleetCtx.cliMode,
        readSiteName,
        adoptSiteDir,
        // `handleCreate` classifies the picked folder BEFORE adopting it, so a project's row records
        // whether this app CREATED the directory or merely adopted one that already existed — the
        // fact `project-delete-guard.cjs` needs before any delete may erase anything.
        classifySiteDir,
        openSiteWindow,
        recordSiteClosed,
        ctx: fleetCtx,
      });
      registerRunnerIpcStubs({ ipcMain });
      if (SELFTEST) selftestTracker = buildSelftestTracker(1);
      openFleetWindow();
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
 * every open site's child at once. `site-registry.cjs`'s `reconcileOrphans()` — run before any
 * window opens on the NEXT launch — is what answers that now (see this file's own header).
 */
app.on("before-quit", (event) => {
  if (openSites.size === 0 || shuttingDown) return;
  event.preventDefault();
  shuttingDown = true;
  const stops = [...openSites.values()].map((entry) => entry.server.stop().catch(() => {}));
  Promise.all(stops).finally(() => app.quit());
});

app.on("window-all-closed", () => {
  app.quit();
});
