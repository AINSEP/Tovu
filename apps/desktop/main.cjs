/**
 * @file `apps/desktop` — an Electron shell around the SAME Tovu that `npm run dev` boots.
 *
 * This directory is deliberately additive and self-contained. Nothing outside it imports it,
 * nothing outside it references it, and `development/scripts/dev.mjs` is untouched — deleting
 * `apps/desktop/` returns the repo to exactly its previous state. That is the whole point: the
 * desktop mode is a second CONSUMER of the existing product, never a fork of it.
 *
 * Two boot modes, one product:
 *
 * 1. **Attach** (`TOVU_DESKTOP_URL` set). The window loads a stack someone else already started —
 *    normally the `npm run dev` pair (API on :3000, admin Vite on :5173). Nothing is spawned, so
 *    web mode and desktop mode run side by side against the same server, which is what "both modes
 *    runnable in parallel for testing" asks for.
 *
 * 2. **Own server** (no `TOVU_DESKTOP_URL`). Spawns Tovu's OWN `tovu serve <dir>` CLI as a child and
 *    loads the port it reports. `tovu serve` is already the packaged single-site entry point — it
 *    boots the site dir, opens `<dir>/content.db`, wires the admin SPA and starts the agent daemon
 *    (`apps/website/src/cli/commands/serve.ts`). The shell therefore needs no Tovu-side change at
 *    all: it consumes a contract that exists and is already exercised.
 *
 * Everything about mode 2 that is not Electron-specific lives in `src/tovu-server.cjs`, which
 * imports no `electron` and is therefore directly testable under plain `node --test`. This file
 * keeps only what genuinely needs `app`/`BrowserWindow`/`shell`.
 *
 * `TOVU_DESKTOP_SELFTEST=1` makes the shell prove itself and exit instead of staying open: it
 * reports the loaded URL and document title, then quits 0 on success and 1 on any load failure.
 *
 * Which site dir own-server mode serves is `src/site-dir-store.cjs`'s decision, not this file's:
 * an explicit override, else the most recent remembered folder, else `<repo>/sites/tovu-com` in a
 * checkout, else a folder picker whose answer is remembered. See that file for why.
 *
 * Environment:
 * - `TOVU_DESKTOP_URL`      — attach to this origin instead of spawning a server.
 * - `TOVU_DESKTOP_SITE_DIR` — force a site dir for own-server mode, skipping the picker entirely.
 * - `TOVU_DESKTOP_PORT`     — pin own-server mode's port; otherwise a free one is allocated.
 * - `TOVU_DESKTOP_SELFTEST` — `1` to verify and exit rather than opening a window.
 */
const path = require("node:path");
const { app, BrowserWindow, dialog, shell } = require("electron");

const { startTovuServer } = require("./src/tovu-server.cjs");
const { resolveSiteDir, stateFilePath, SiteDirSelectionCancelled, SITE_MARKER_FILE } = require("./src/site-dir-store.cjs");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SELFTEST = process.env.TOVU_DESKTOP_SELFTEST === "1";

/**
 * Ask the user which folder holds their site. Cancelling returns `null`.
 *
 * Only ever reached on a first run with no remembered folder and no `sites/` dir in a checkout —
 * `resolveSiteDir` exhausts every cheaper answer first. `createDirectory` is on because the natural
 * gesture for a new site is to make a folder from inside the dialog; an empty one gets `tovu init`.
 *
 * No `BrowserWindow` exists yet at this point (`resolveTarget` is awaited before `createWindow` —
 * see `main.cjs`'s own boot sequence below), so this dialog's `message` is the ONLY thing on screen
 * explaining what is being asked. `rejectedDefault` (from `resolveSiteDir`, non-null exactly when
 * `devFallbackDir` was tried and turned down) is folded into that message so a real candidate —
 * `<repo>/sites/tovu-com` missing its `config.json`, say — is named instead of leaving the user to
 * read a bare native folder picker with no context at all (measured failure: 2026-09-05).
 *
 * @param rejectedDefault `{ dir, kind }` from `resolveSiteDir`, or `null` when there was nothing to
 *   try before asking.
 */
async function promptForSiteDir(rejectedDefault) {
  // A modal dialog in a headless self-test would block forever with nothing to click it. Fail with
  // the reason instead, so an unattended run reports rather than hangs.
  if (SELFTEST) {
    throw new Error("no site dir resolved and TOVU_DESKTOP_SELFTEST=1 cannot show a folder picker — set TOVU_DESKTOP_SITE_DIR.");
  }
  const askMessage = "Pick a folder that already holds a site, or an empty folder to start a new one.";
  const message =
    rejectedDefault === null
      ? askMessage
      : `${rejectedDefault.dir} was tried first but ${
          rejectedDefault.kind === "occupied" ? `is not a Tovu site (no ${SITE_MARKER_FILE})` : "has no site in it yet"
        }. ${askMessage}`;
  const result = await dialog.showOpenDialog({
    title: "Choose a folder for your Tovu site",
    message,
    buttonLabel: "Use this folder",
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
}

/**
 * Attach to a running stack, or start our own.
 *
 * @returns `{ server, url }`; `server` is null in attach mode, and otherwise the handle whose
 *   `stop()` is the only supported shutdown path.
 * @complexity O(1) beyond the child's own boot cost.
 */
async function resolveTarget() {
  const attachUrl = process.env.TOVU_DESKTOP_URL?.trim();
  if (attachUrl) return { server: null, url: attachUrl };

  const siteDir = await resolveSiteDir({
    envDir: process.env.TOVU_DESKTOP_SITE_DIR,
    statePath: stateFilePath(app.getPath("userData")),
    // Correct for a developer, absent in a packaged app — which is exactly why it is one tier of a
    // precedence chain rather than the hardcoded default it used to be. In THIS checkout it is not
    // even valid: `sites/tovu-com` holds a `content.db` but no `config.json`, so `tovu serve` exits
    // 3 with `SITE_DIR_INVALID` (measured). The old hardcoded default was a dead path; the chain
    // classifies the dir and moves on instead of failing on it.
    devFallbackDir: path.join(REPO_ROOT, "sites", "tovu-com"),
    repoRoot: REPO_ROOT,
    // No `name`: `initSite` defaults it to the chosen folder's basename (BR-03), which is what the
    // user just typed, and is a far better site name than this shell's own package name.
    pickDir: promptForSiteDir,
  });

  const pinnedPort = process.env.TOVU_DESKTOP_PORT?.trim();
  const server = await startTovuServer({
    repoRoot: REPO_ROOT,
    siteDir,
    // Unpinned means "ask the OS for a free one" rather than a fixed default: two desktop windows,
    // or a desktop window alongside the `npm run dev` stack on :3000, must not collide.
    port: pinnedPort ? Number(pinnedPort) : undefined,
  });
  return { server, url: server.adminUrl };
}

/**
 * Report a boot failure where the user can actually see it.
 *
 * A packaged `.app` launched from Finder has no terminal attached, so `console.error` alone means
 * the app vanishes with no explanation. Cancelling the folder picker is still not a failure — it is
 * the user declining to start, so this still exits 0 — but it no longer says NOTHING: the picker
 * itself has no window behind it (see `promptForSiteDir`), so a silent quit after it is
 * indistinguishable from the app being broken (measured: a real user watched exactly this and
 * reported "I just saw a folder, nothing else"). A short info dialog closes that gap without turning
 * a legitimate decline into an error.
 */
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
  if (!SELFTEST) dialog.showErrorBox("Tovu could not start", error.message);
  app.quit();
}

function createWindow(url) {
  const window = new BrowserWindow({
    width: 1360,
    height: 900,
    title: "Tovu",
    show: !SELFTEST,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

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
 * Report what actually loaded and exit, so the shell can be verified from a terminal without a
 * human looking at a window. A load failure exits non-zero rather than leaving a blank window up.
 */
function runSelftest(window, url) {
  window.webContents.once("did-fail-load", (_event, code, description) => {
    console.error(`tovu desktop: FAILED to load ${url} (${code} ${description})`);
    process.exitCode = 1;
    app.quit();
  });
  window.webContents.once("did-finish-load", () => {
    console.log(`tovu desktop: loaded ${window.webContents.getURL()}`);
    console.log(`tovu desktop: title=${JSON.stringify(window.webContents.getTitle())}`);
    app.quit();
  });
}

let tovuServer = null;
let shuttingDown = false;

app
  .whenReady()
  .then(async () => {
    const target = await resolveTarget();
    tovuServer = target.server;
    const window = createWindow(target.url);
    if (SELFTEST) runSelftest(window, target.url);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(target.url);
    });
  })
  .catch(reportBootFailure);

/**
 * A spawned `tovu serve` must not outlive the window that owns it, and it must be given the chance
 * to shut down properly rather than being cut off.
 *
 * `will-quit` cannot be used for this: it is synchronous, so it can send a signal but cannot wait
 * for the child to act on it, and Electron would exit while `serve.ts`'s BR-07 drain — close the
 * listener, finish in-flight requests, stop the agent daemon, close the sqlite handle — was still
 * running. Deferring the quit here is what makes the database close cleanly on every ordinary exit.
 *
 * A hard kill of Electron itself (SIGKILL, a crash, a logout) still bypasses this and can strand
 * the child. Tovu-Runner answers that with a pid registry and boot-time orphan reconciliation;
 * that machinery belongs with the fleet supervisor, not here, and is reported rather than ported.
 */
app.on("before-quit", (event) => {
  if (tovuServer === null || shuttingDown) return;
  event.preventDefault();
  shuttingDown = true;
  void tovuServer.stop().finally(() => app.quit());
});

app.on("window-all-closed", () => {
  app.quit();
});
