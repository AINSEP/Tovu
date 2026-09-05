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
 * The boot line this parses (`tovu serve: dir=… port=… schemaVersion=… workspaceId=…`) is the one
 * `serve.ts` documents as its startup contract (api.spec.md §5). Tovu-Runner parses the identical
 * line today (`src/main/tovu-cli.ts`'s `TOVU_BOOT_LINE_PATTERN`), so this is a proven seam rather
 * than a new one being invented here.
 *
 * `TOVU_DESKTOP_SELFTEST=1` makes the shell prove itself and exit instead of staying open: it
 * reports the loaded URL and document title, then quits 0 on success and 1 on any load failure.
 */
const path = require("node:path");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, shell } = require("electron");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SELFTEST = process.env.TOVU_DESKTOP_SELFTEST === "1";

/** Mirrors `apps/website/src/cli/commands/serve.ts`'s documented startup line. */
const BOOT_LINE = /^tovu serve: dir=(.+) port=(\d+) schemaVersion=(\d+) workspaceId=(\S+)$/m;

/**
 * Tovu's own `bin.tovu` entry, read from its `package.json` rather than hardcoded.
 *
 * Same "read the manifest, never the literal path" rule Tovu-Runner adopted after Tovu's `src/`
 * was renamed once already (2026-08-27 restructure) and broke a hardcoded `dist/src/cli/main.js`
 * in two places at once.
 */
function resolveCliEntry() {
  const manifest = require(path.join(REPO_ROOT, "package.json"));
  if (typeof manifest.bin?.tovu !== "string") {
    throw new Error(`${REPO_ROOT}/package.json has no "bin.tovu" field.`);
  }
  return path.join(REPO_ROOT, manifest.bin.tovu);
}

/**
 * Spawn `tovu serve <dir>` and resolve the origin it reports.
 *
 * `ELECTRON_RUN_AS_NODE` is deleted for the same reason Tovu-Runner deletes it: Electron sets it
 * for its own child processes, and inheriting it changes how the spawned runtime behaves.
 */
function startOwnServer(siteDir, port) {
  const child = spawn(process.execPath, [resolveCliEntry(), "serve", siteDir, "--port", String(port)], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  return new Promise((resolve, reject) => {
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
      const match = BOOT_LINE.exec(stdout);
      if (match) resolve({ child, url: `http://127.0.0.1:${match[2]}/admin/` });
    });
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`tovu serve exited (code ${code ?? "none"}) before reporting a port.`)));
  });
}

/** Attach to a running stack, or start our own. Returns `{ child, url }`; `child` is null when attached. */
async function resolveTarget() {
  const attachUrl = process.env.TOVU_DESKTOP_URL?.trim();
  if (attachUrl) return { child: null, url: attachUrl };

  const siteDir = process.env.TOVU_DESKTOP_SITE_DIR?.trim() ?? path.join(REPO_ROOT, "sites", "tovu-com");
  const port = Number(process.env.TOVU_DESKTOP_PORT ?? 3600);
  return startOwnServer(siteDir, port);
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

let serverChild = null;

app.whenReady().then(async () => {
  const target = await resolveTarget();
  serverChild = target.child;
  const window = createWindow(target.url);
  if (SELFTEST) runSelftest(window, target.url);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(target.url);
  });
}).catch((error) => {
  console.error(`tovu desktop: ${error.message}`);
  process.exitCode = 1;
  app.quit();
});

// A spawned `tovu serve` must not outlive the window that owns it. `serve.ts` handles SIGTERM
// with a graceful drain (BR-07), so this is the clean shutdown path, not a kill.
app.on("will-quit", () => {
  serverChild?.kill("SIGTERM");
});

app.on("window-all-closed", () => {
  app.quit();
});
