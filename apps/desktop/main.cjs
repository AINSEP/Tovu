/**
 * @file `apps/desktop` — an Electron shell around the SAME Tovu that `npm run dev` boots, now
 * multi-site: several sites can be open, each in its own window, each spawning its own `tovu serve`.
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
 *    web mode and desktop mode run side by side against the same server. Single-site only — there
 *    is exactly one URL to attach to — and unrelated to everything else below.
 *
 * 2. **Own server** (no `TOVU_DESKTOP_URL`). Spawns Tovu's OWN `tovu serve <dir>` CLI as a child per
 *    open site and loads the port each one reports. `tovu serve` is already the packaged single-site
 *    entry point — it boots the site dir, opens `<dir>/content.db`, wires the admin SPA and starts
 *    the agent daemon (`apps/website/src/cli/commands/serve.ts`). The shell therefore needs no
 *    Tovu-side change to open a second, third, or Nth site: `src/tovu-server.cjs`'s
 *    `startTovuServer` was already a pure `{repoRoot, siteDir, port} -> handle` function with no
 *    single-instance assumption anywhere in it.
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
 * shell actually needs (not Tovu-Runner's full fleet registry).
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
 * - `TOVU_DESKTOP_URL`       — attach to this origin instead of spawning any server (single-site).
 * - `TOVU_DESKTOP_SITE_DIR`  — force a single site dir for own-server mode, skipping the picker.
 * - `TOVU_DESKTOP_SITE_DIRS` — comma-separated site dirs to open at launch, one window each —
 *   bypasses the picker/MRU/dev-fallback precedence entirely. Chiefly for verification/automation
 *   (proving N sites boot concurrently without driving the menu by hand); a real user reaches the
 *   same result through "Open Site…"/"Open Recent" after the first site opens.
 * - `TOVU_DESKTOP_PORT`      — pin the FIRST own-server site's port; every other open site still
 *   self-allocates (two sites must never collide).
 * - `TOVU_DESKTOP_CLI_MODE`  — `"source"` (default) or `"compiled"`; see the schema-skew note above.
 * - `TOVU_DESKTOP_SELFTEST`  — `1` to verify and exit rather than staying open.
 */
const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, dialog, shell, Menu } = require("electron");

const { startTovuServer } = require("./src/tovu-server.cjs");
const { resolveSiteDir, adoptSiteDir, stateFilePath, existingRecentSiteDirs, SiteDirSelectionCancelled } = require("./src/site-dir-store.cjs");
const { registryFilePath, reconcileOrphans, recordSiteOpened, recordSiteClosed } = require("./src/site-registry.cjs");
const { createKeyedSerializer } = require("./src/keyed-serializer.cjs");
const { createSelftestTracker } = require("./src/selftest-tracker.cjs");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SELFTEST = process.env.TOVU_DESKTOP_SELFTEST === "1";

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

function createWindow(url, title) {
  const window = new BrowserWindow({
    width: 1360,
    height: 900,
    title: title ?? "Tovu",
    show: !SELFTEST,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
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

  const server = await startTovuServer({ repoRoot: REPO_ROOT, siteDir, cliMode: ctx.cliMode, port: options.port });
  recordSiteOpened(ctx.registryPath, {
    siteDir,
    port: server.port,
    workspaceId: server.workspaceId,
    pid: server.pid,
    updatedAt: Date.now(),
  });

  let window;
  try {
    window = createWindow(server.adminUrl, readSiteName(siteDir));
  } catch (error) {
    recordSiteClosed(ctx.registryPath, siteDir);
    await server.stop();
    throw error;
  }

  openSites.set(siteDir, { server, window });
  window.on("closed", () => {
    openSites.delete(siteDir);
    recordSiteClosed(ctx.registryPath, siteDir);
    void server.stop();
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

/** Resolves the site dir(s) to open at launch: `TOVU_DESKTOP_SITE_DIRS` (plural) wins outright when
 *  set — chiefly for verification/automation — otherwise the existing single-site precedence chain
 *  (`resolveSiteDir`) picks exactly one.
 *  @complexity O(1) plus `resolveSiteDir`'s own cost in the single-site case. */
async function resolveStartupSiteDirs(ctx) {
  const explicit = explicitStartupSiteDirs();
  if (explicit) return explicit;

  const pinnedPort = process.env.TOVU_DESKTOP_PORT?.trim();
  const siteDir = await resolveSiteDir({
    envDir: process.env.TOVU_DESKTOP_SITE_DIR,
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

app
  .whenReady()
  .then(async () => {
    const attachUrl = process.env.TOVU_DESKTOP_URL?.trim();
    if (attachUrl) {
      // Attach mode is always exactly one window.
      if (SELFTEST) selftestTracker = buildSelftestTracker(1);
      createWindow(attachUrl, "Tovu");
      return;
    }

    const ctx = {
      cliMode: resolveCliMode(),
      statePath: stateFilePath(app.getPath("userData")),
      registryPath: registryFilePath(app.getPath("userData")),
    };

    const reconciled = await reconcileOrphans(ctx.registryPath);
    if (reconciled.length > 0) {
      console.log(
        `tovu desktop: reconciled ${reconciled.length} orphaned site process(es) left running by a previous crash: ${reconciled.map((row) => row.siteDir).join(", ")}`,
      );
    }

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
