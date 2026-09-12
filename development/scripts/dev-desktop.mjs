#!/usr/bin/env node
/**
 * @file `npm run desktop` — one command for the Tovu desktop app dev loop.
 *
 * Before this, iterating on the desktop app needed three things known by hand:
 *
 * 1. `cd apps/desktop && npm run dev` (just `electron .`).
 * 2. A renderer edit does not show up until `npm run build:renderer` runs — the Projects window
 *    loads the BUILT `dist/renderer/index.html` (`main.js`'s `FLEET_RENDERER_PATH`), not a Vite dev
 *    server. A live loop needed `vite build --watch` running by hand in a second terminal.
 * 3. A first run with no `dist/` yet fails hard: `main.js`'s `openFleetWindow` shows "The fleet UI
 *    is not built" and quits, instead of building it for you.
 *
 * This script builds the preload once, then starts the renderer's watch build and waits for ITS
 * initial build to settle before starting Electron (closes #3 — the watch's own first build covers
 * "no dist/ yet" — and avoids a real startup race: `vite build --watch`'s first pass empties
 * `dist/renderer/` before repopulating it, so starting Electron at the same time occasionally loses
 * the race and hits `ERR_FILE_NOT_FOUND` — caught by running this script). Once running, both stay up
 * side by side (closes #2 — a renderer edit then needs only a window reload, Cmd+R, not a rebuild
 * command) and are torn down together on exit.
 *
 * Preload and main-process edits (`main.js`, `src/tovu-server.js`) are hand-written JS with no watch
 * step — those still need this script restarted, same as before. Only the Vite/React renderer gets
 * a live-rebuild loop.
 *
 * Deliberately does NOT set `TOVU_AGENT_CWD`. A packaged-app bug (`3ff568e3`) once ran the agent
 * daemon with cwd `/`, killing every assistant run with `EROFS .../.mcp.jini-<runId>.json`. Plain
 * `electron .` already runs with a writable cwd, so leaving this unset is what lets a future
 * regression of that same bug reproduce here in dev instead of being silently masked by this script.
 * Do not add it back.
 *
 * Process-group discipline follows `development/scripts/dev.mjs`: every child is spawned detached
 * into its own process group and torn down with `process.kill(-pid)`, so an `npm -> vite` or
 * `npm -> electron` chain dies as a whole instead of reparenting an orphan to PID 1. Not a process
 * manager: no restart-on-crash. If a child dies unexpectedly, the other is torn down too and this
 * script exits non-zero so the failure is visible.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DESKTOP_DIR = path.join(REPO_ROOT, "apps/desktop");
const RENDERER_ENTRY = path.join(DESKTOP_DIR, "dist/renderer/index.html");

/** Runs an npm script in `apps/desktop` to completion before anything else starts. */
function runToCompletion(label, npmScript) {
  console.log(`tovu desktop: ${label}…`);
  const result = spawnSync("npm", ["run", npmScript], { cwd: DESKTOP_DIR, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(
      `\ntovu desktop: ${label} failed (exit ${result.status ?? result.signal}) — not launching Electron.\n`
    );
    process.exit(result.status ?? 1);
  }
}

/**
 * Resolves once `filePath` exists and its mtime has stopped changing across `stableChecks`
 * consecutive polls (or after `timeoutMs`) — the file-based counterpart of `development/scripts/
 * dev.mjs`'s `waitForPort`. A single existence check is not enough: `vite build --watch`'s initial
 * build empties `dist/renderer/` and then writes several files across the build, so `index.html` can
 * exist (from a previous run) or reappear while later assets are still being written.
 *
 * Resolves rather than rejects on timeout, same reasoning as `waitForPort`: a broken build should
 * still let Electron start, so the owner sees the same "fleet UI is not built" failure `main.js`
 * already reports, rather than this script hanging forever.
 */
function waitForFileStable(filePath, { timeoutMs = 30_000, pollMs = 150, stableChecks = 2 } = {}) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    let lastMtimeMs = null;
    let stableCount = 0;
    const tick = () => {
      const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
      if (stat && stat.mtimeMs === lastMtimeMs) {
        stableCount += 1;
      } else {
        stableCount = 0;
      }
      lastMtimeMs = stat ? stat.mtimeMs : null;
      if (stat && stableCount >= stableChecks) return resolve(true);
      if (Date.now() > deadline) return resolve(false);
      setTimeout(tick, pollMs);
    };
    tick();
  });
}

const children = [];
let shuttingDown = false;

/** Kill a child's whole process group, so an `npm -> vite`/`npm -> electron` chain dies with it. */
function killGroup(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) killGroup(c);
  // Give groups a moment to exit cleanly, then hard-kill anything left and go.
  setTimeout(() => {
    for (const c of children) {
      try {
        process.kill(-c.pid, "SIGKILL");
      } catch {
        /* gone */
      }
    }
    process.exit(code);
  }, 1500).unref();
}

function start(name, npmScript) {
  const child = spawn("npm", ["run", npmScript], {
    cwd: DESKTOP_DIR,
    stdio: "inherit",
    detached: true, // own process group — required for killGroup to reap grandchildren
    env: process.env,
  });
  child.on("error", (error) => {
    console.error(`\ntovu desktop: failed to start ${name}:`, error.message);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    if (name === "electron") {
      // Closing the window / Cmd+Q is the normal end of a dev session, not a crash — stop the
      // watcher quietly and mirror Electron's own exit code.
      console.log(`\ntovu desktop: electron exited (code ${code ?? "none"}, signal ${signal ?? "none"}).\n`);
      shutdown(code ?? 0);
      return;
    }
    console.error(
      `\ntovu desktop: ${name} exited (code ${code ?? "none"}, signal ${signal ?? "none"}) — ` +
        "stopping electron too so you don't keep working against a stale build.\n"
    );
    shutdown(code === 0 ? 1 : (code ?? 1));
  });
  children.push(child);
  return child;
}

async function main() {
  // Preload has no watch step here, so build it once up front — covers a first run with no dist/
  // yet, and any preload edit made since the last build.
  runToCompletion("building preload", "build:preload");

  console.log(
    "tovu desktop: watching the renderer for changes — edit, then reload the window (Cmd+R) to see it.\n" +
      "tovu desktop: Ctrl-C stops everything.\n"
  );
  start("vite watch", "watch:renderer");

  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(sig, () => {
      console.log("\ntovu desktop: stopping…");
      shutdown(0);
    });
  }

  if (!shuttingDown) {
    if (!(await waitForFileStable(RENDERER_ENTRY))) {
      console.warn(
        "\ntovu desktop: renderer build did not settle within 30s — starting Electron anyway.\n"
      );
    }
    if (!shuttingDown) start("electron", "dev");
  }
}

await main();
