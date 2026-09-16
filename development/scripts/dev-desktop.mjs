#!/usr/bin/env node
/**
 * @file `npm run desktop` — one command for the Tovu desktop app dev loop.
 *
 * Before this, iterating on the desktop app needed three things known by hand:
 *
 * 1. `cd apps/desktop && npm run dev` (just `electron .`).
 * 2. A renderer edit does not show up until `npm run build:renderer` runs — the Projects window
 *    loads the BUILT `dist/renderer/index.html` (`main.ts`'s `FLEET_RENDERER_PATH`), not a Vite dev
 *    server. A live loop needed `vite build --watch` running by hand in a second terminal.
 * 3. A first run with no `dist/` yet fails hard: `main.ts`'s `openFleetWindow` shows "The fleet UI
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
 * Preload and main-process edits (`main.ts`, `src/tovu-server.ts`) are hand-written TS with no watch
 * step — those still need this script restarted, same as before. Only the Vite/React renderer gets
 * a live-rebuild loop.
 *
 * It also starts the ADMIN Vite (`apps/admin`), which is a different app from the renderer above:
 * the `/admin` UI inside each site window. `apps/desktop/main.ts` probes for a running admin Vite on
 * every site spawn and has the site server proxy `/admin/*` to it when one answers
 * (`apps/website/src/server/inbound/admin-http/admin-static.ts`), but until now nothing on this path
 * ever started one — so `npm run desktop` silently served whatever `apps/admin/dist` last held,
 * with no signal that it was days old. Specifics:
 *
 * - **Reused, not restarted, when one is already up.** A Vite that answers the HTTP probe is
 *   somebody else's child (usually `npm run dev`'s) and is deliberately NOT adopted into `children`,
 *   so Ctrl-C here never kills a browser developer's stack.
 * - **Non-fatal.** Unlike the renderer watch, a dead or unstartable admin Vite does not tear the
 *   stack down: the desktop app is fully functional without it, falling back to the built bundle. A
 *   missing `apps/admin/node_modules` must not turn into "the desktop won't launch". When it goes
 *   away the fallback is announced loudly, with `apps/admin/dist/index.html`'s mtime, because the
 *   silence is what cost a session.
 * - **Opt out with `TOVU_DESKTOP_DISABLE_ADMIN_VITE=1`** (e.g. to test a real `npm run admin:build`
 *   bundle). An env var rather than a CLI flag, like every other dev toggle here.
 * - **Sets no `TOVU_ADMIN_DEV_PROXY_URL`.** `apps/desktop/src/admin-dev-proxy.ts` honors an explicit
 *   value verbatim AND alone, which would delete its two-scheme probe fallback (dev TLS is decided
 *   by cert files this process does not read) and bypass the probe, turning a site opened before
 *   Vite answers into a 502 instead of the static fallback.
 *
 * Loads `.env` from the repo root, same as `development/scripts/dev.mjs` (`npm run dev`) does, via the
 * shared `load-repo-root-env.mjs` helper — before this, `npm run desktop` passed `process.env` straight
 * through with no `.env` read at all, so a repo-root secret like `TOVU_INTEGRATIONS_ROOT_KEY` never
 * reached a site server this app spawns (`tovu serve` inherits `process.env`), and a stored OAuth MCP
 * server (e.g. Higgsfield) silently failed to decrypt instead of surfacing as unset config.
 *
 * Deliberately does NOT set `TOVU_AGENT_CWD`. A packaged-app bug (`3ff568e3`) once ran the agent
 * daemon with cwd `/`, killing every assistant run with `EROFS .../.mcp.jini-<runId>.json`. Plain
 * `electron .` already runs with a writable cwd, so leaving this unset is what lets a future
 * regression of that same bug reproduce here in dev instead of being silently masked by this script.
 * Do not add it back.
 *
 * Process-group discipline follows `development/scripts/dev.mjs`: every child is spawned detached
 * into its own process group and torn down with `process.kill(-pid)`, so an `npm -> vite` or
 * `npm -> electron` chain dies as a whole instead of reparenting an orphan to PID 1. That covers
 * only what stays in the group. Each `tovu serve` the app opens is spawned `detached` into a group of
 * its own, so the group kill never reaches it. Electron's `before-quit` drain stops it, which is why
 * `main.ts` routes the signal into that drain (`apps/desktop/src/quit-signals.ts`) and why the
 * SIGKILL escalation waits {@link HARD_KILL_GRACE_MS}. Not a process
 * manager: no restart-on-crash. If a child dies unexpectedly, the other is torn down too and this
 * script exits non-zero so the failure is visible.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadRepoRootEnvFile } from "./load-repo-root-env.mjs";
import { listenersOn } from "./port-listeners.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DESKTOP_DIR = path.join(REPO_ROOT, "apps/desktop");
const RENDERER_ENTRY = path.join(DESKTOP_DIR, "dist/renderer/index.html");
const ADMIN_DIST_INDEX = path.join(REPO_ROOT, "apps/admin/dist/index.html");

/**
 * The port the admin Vite binds. Same expression `development/scripts/dev.mjs`,
 * `apps/admin/vite.config.ts` and `apps/desktop/src/admin-dev-proxy.ts` each use for their own copy
 * of this decision, so all four agree on which port the desktop's probe will look at.
 */
const ADMIN_VITE_PORT = Number(process.env.TOVU_ADMIN_DEV_PORT ?? 5173);

/** How long one probe request may take before it counts as "nothing there". */
const ADMIN_PROBE_TIMEOUT_MS = 1_500;

// Before anything below reads `process.env` (including the `env: process.env` passthrough in `start()`)
// — see this file's header comment and `load-repo-root-env.mjs` for why.
if (loadRepoRootEnvFile(REPO_ROOT)) {
  console.log("tovu desktop: loaded .env");
}

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
 * Resolves once `filePath` exists, was written at or after `sinceMs`, and its mtime has stopped
 * changing across `stableChecks` consecutive polls (or after `timeoutMs`) — the file-based
 * counterpart of `development/scripts/dev.mjs`'s `waitForPort`. A single existence check is not
 * enough: `vite build --watch`'s initial build empties `dist/renderer/` and then writes several
 * files across the build, so `index.html` can exist (from a previous run) or reappear while later
 * assets are still being written.
 *
 * `sinceMs` closes a real bug: on a second (or later) launch, `index.html` from the PREVIOUS run is
 * already sitting on disk, already stable. Without a freshness floor, two back-to-back "unchanged"
 * polls (~`pollMs * stableChecks`, well under vite's ~2.7s first-build time) resolve this promise
 * before vite's new watch build has written anything — so Electron boots against the stale bundle
 * from the last run, not the one just requested. A stat older than `sinceMs` is treated the same as
 * "does not exist yet": it resets `stableCount` and cannot satisfy the wait on its own. Only a stat
 * written at or after `sinceMs` — i.e. produced by THIS run's build — can.
 *
 * Resolves rather than rejects on timeout, same reasoning as `waitForPort`: a broken build should
 * still let Electron start, so the owner sees the same "fleet UI is not built" failure `main.ts`
 * already reports, rather than this script hanging forever.
 *
 * @param {string} filePath - absolute path to the file the build is expected to (re)produce.
 * @param {{timeoutMs?: number, pollMs?: number, stableChecks?: number, sinceMs?: number}} [options]
 *   - `sinceMs` - epoch ms; stats older than this are treated as not-yet-built-this-run. Defaults to
 *     `0` (any existing file counts), which is only safe when the caller knows no stale file from a
 *     prior run can be sitting at `filePath`.
 * @returns {Promise<boolean>} true once a fresh, stable file is observed; false on timeout.
 * @complexity O(timeoutMs / pollMs) polls, O(1) work per poll.
 */
function waitForFileStable(filePath, { timeoutMs = 30_000, pollMs = 150, stableChecks = 2, sinceMs = 0 } = {}) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    let lastMtimeMs = null;
    let stableCount = 0;
    const tick = () => {
      const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
      const isFreshThisRun = stat !== null && stat.mtimeMs >= sinceMs;
      if (isFreshThisRun && stat.mtimeMs === lastMtimeMs) {
        stableCount += 1;
      } else {
        stableCount = 0;
      }
      lastMtimeMs = isFreshThisRun ? stat.mtimeMs : null;
      if (isFreshThisRun && stableCount >= stableChecks) return resolve(true);
      if (Date.now() > deadline) return resolve(false);
      setTimeout(tick, pollMs);
    };
    tick();
  });
}

/**
 * Whether an env-var flag is explicitly on.
 *
 * Trim + lowercase, `"1"`/`"true"` only — never a bare truthy check on the raw string. That exact
 * inversion (a literal `"false"` reading as "enabled") was a confirmed 2026-09-05 audit finding
 * against `TOVU_DISABLE_DEV_TLS`; `dev.mjs`'s `isDevTlsExplicitlyDisabled`,
 * `apps/admin/dev-tls-disable-flag.ts` and `apps/website/src/server/runtime/boot/dev-tls.ts` each
 * carry their own copy of the same parse for their own runtime boundary.
 *
 * @param {unknown} raw
 * @returns {boolean}
 * @complexity O(1).
 */
function isFlagEnabled(raw) {
  const normalized = String(raw ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

/**
 * Whether `origin` has something listening that speaks HTTP. ANY status code counts, 404 included —
 * the question is "is the dev server up", not "does it serve this path".
 *
 * @param {string} origin - e.g. `https://localhost:5173`.
 * @returns {Promise<boolean>}
 * @complexity O(1); one request, abandoned after {@link ADMIN_PROBE_TIMEOUT_MS}.
 */
function probeOrigin(origin) {
  return new Promise((resolve) => {
    let target;
    try {
      target = new URL(origin);
    } catch {
      // A junk `TOVU_ADMIN_DEV_PORT` (non-numeric, out of range) makes this unparseable. Same
      // verdict `apps/desktop/src/admin-dev-proxy.ts` reaches for the same input: no candidate, so
      // no dev proxy — never a crash in the launcher.
      resolve(false);
      return;
    }
    const send = target.protocol === "https:" ? httpsRequest : httpRequest;
    const req = send(
      {
        hostname: target.hostname,
        port: target.port,
        path: "/admin/",
        method: "GET",
        // Vite's mkcert certificate is trusted by the OS and the browser but not by Node's separate
        // bundled CA list. Scoped to this one request; no global TLS setting is touched.
        rejectUnauthorized: false,
        timeout: ADMIN_PROBE_TIMEOUT_MS,
      },
      (res) => {
        res.resume();
        resolve(true);
      }
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(false));
    req.end();
  });
}

/**
 * Whether an admin Vite is answering on `port`, trying https then http.
 *
 * DELIBERATE DUPLICATE of `apps/desktop/src/admin-dev-proxy.ts`'s `probeOrigin`/
 * `adminDevProxyCandidates` pair, across the same `.mjs`/`.ts` runtime boundary that keeps
 * `isDevTlsExplicitlyDisabled` in three copies: this launcher runs under bare `node` before anything
 * TypeScript exists. **If you change the probe semantics in one, change the other** — the whole
 * point of this check is to predict the answer the desktop's own probe will give moments later.
 *
 * Both schemes for the same documented reason that module gives: dev TLS is decided by cert files
 * (`.certs/localhost.pem`) at Vite start, and there is no env-only derivation that is reliably right.
 *
 * An `lsof` check would not do: a port-bound-but-not-answering squatter passes it and then fails as
 * a proxy target, which is exactly the silently-stale-bundle case this whole feature exists to close.
 *
 * @param {number} port
 * @param {{host?: string}} [options] - `host` defaults to `localhost`; tests pass `127.0.0.1` so an
 *   ephemeral server bound to v4 is not missed by a `localhost` that resolves to `::1` first.
 * @returns {Promise<boolean>}
 * @complexity O(1); at most two requests, each bounded by {@link ADMIN_PROBE_TIMEOUT_MS}.
 */
async function probeAdminVite(port, { host = "localhost" } = {}) {
  for (const scheme of ["https", "http"]) {
    if (await probeOrigin(`${scheme}://${host}:${port}`)) return true;
  }
  return false;
}

/**
 * Resolves once an admin Vite answers on `port`, or when the wait gives up.
 *
 * Resolves `false` rather than rejecting on timeout — same contract as {@link waitForFileStable} and
 * `dev.mjs`'s `waitForPort`, and for the same reason: a broken admin Vite should still let Electron
 * start, with the loud fallback warning, rather than hanging this script forever.
 *
 * @param {number} port
 * @param {{timeoutMs?: number, pollMs?: number, host?: string, signal?: AbortSignal}} [options]
 *   - `signal` - fired when the Vite child dies, so a failure to boot costs the ~1s it took rather
 *     than the full deadline.
 * @returns {Promise<boolean>} true once the probe answers; false on timeout or abort.
 * @complexity O(timeoutMs / pollMs) probes.
 */
function waitForAdminVite(port, { timeoutMs = 30_000, pollMs = 250, host = "localhost", signal } = {}) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false);
    const deadline = Date.now() + timeoutMs;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    signal?.addEventListener("abort", () => finish(false), { once: true });
    const attempt = async () => {
      if (settled) return;
      if (await probeAdminVite(port, { host })) return finish(true);
      if (Date.now() > deadline) return finish(false);
      setTimeout(attempt, pollMs);
    };
    void attempt();
  });
}

/**
 * The loud fallback notice. Printing `apps/admin/dist/index.html`'s mtime is the exact signal whose
 * absence cost a session: the desktop was serving a bundle that was days old, silently.
 */
function warnStaleAdminDist() {
  const built = fs.existsSync(ADMIN_DIST_INDEX)
    ? `${fs.statSync(ADMIN_DIST_INDEX).mtime.toISOString()}  <-- may be stale`
    : "never — that file does not exist, so /admin will not load at all";
  console.warn(
    "\ntovu desktop: the admin dev server is NOT running.\n" +
      "tovu desktop: /admin inside the app will be served from apps/admin/dist\n" +
      `tovu desktop:   built ${built}\n` +
      "tovu desktop: fix: npm --prefix apps/admin install, then restart `npm run desktop`\n"
  );
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

/**
 * How long `shutdown` waits after SIGTERM before SIGKILLing every child group. Must exceed
 * `apps/desktop/src/tovu-server.ts`'s `DEFAULT_STOP_GRACE_MS` (5 s): Electron's `before-quit` drain
 * is the only thing that stops a `tovu serve`, spawned `detached` and so outside the group kill, and
 * it escalates to SIGKILL only after that grace. At the old 1.5 s, a server slower than that to drain
 * lost Electron mid-stop and was stranded with PPID 1. The timer is `unref`'d, so a normal quit that
 * finishes sooner never waits this long. `dev-desktop.test.mjs` pins the relationship.
 */
const HARD_KILL_GRACE_MS = 7_000;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) killGroup(c);
  // Give groups a chance to exit cleanly (see HARD_KILL_GRACE_MS), then hard-kill anything left and go.
  setTimeout(() => {
    for (const c of children) {
      try {
        process.kill(-c.pid, "SIGKILL");
      } catch {
        /* gone */
      }
    }
    process.exit(code);
  }, HARD_KILL_GRACE_MS).unref();
}

/**
 * Spawns an `npm` child into its own process group and adopts it into {@link children}.
 *
 * @param {string} name - label used in this script's own log lines.
 * @param {string[]} args - the full npm argv, e.g. `["run", "watch:renderer"]`.
 * @param {{cwd?: string, fatal?: boolean, env?: Record<string, string>, onExit?: (code: number|null, signal: string|null) => void}} [options]
 *   - `fatal` (default true) - whether this child dying should tear the whole stack down. False for
 *     the admin Vite alone: the app works without it, so killing the owner's running desktop because
 *     a dev convenience died is the worse outcome. A non-fatal child's `onExit` owns the recovery.
 */
function start(name, args, { cwd = DESKTOP_DIR, fatal = true, env, onExit } = {}) {
  const child = spawn("npm", args, {
    cwd,
    stdio: "inherit",
    detached: true, // own process group — required for killGroup to reap grandchildren
    env: env ? { ...process.env, ...env } : process.env,
  });
  child.on("error", (error) => {
    console.error(`\ntovu desktop: failed to start ${name}:`, error.message);
    if (!fatal) return onExit?.(null, null);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    if (!fatal) return onExit?.(code, signal);
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

/**
 * Decides what to do about the admin Vite, and says so on stdout.
 *
 * Probe BEFORE `lsof`, not the other way round: the question that matters is "will the desktop's own
 * HTTP probe succeed", and only an HTTP request answers it. `lsof` is consulted solely to name the
 * squatter when the probe missed but the port is held — the one case where starting our own Vite is
 * guaranteed to fail (`strictPort: true` in `apps/admin/vite.config.ts`) and the owner would
 * otherwise be left on the stale bundle with no explanation.
 *
 * @param {number} port
 * @returns {Promise<"disabled" | "reuse" | "blocked" | "start">}
 * @complexity O(1) — at most two probe requests and one `lsof`.
 */
async function planAdminVite(port) {
  if (isFlagEnabled(process.env.TOVU_DESKTOP_DISABLE_ADMIN_VITE)) {
    console.log("tovu desktop: TOVU_DESKTOP_DISABLE_ADMIN_VITE is set — not starting an admin Vite.");
    return "disabled";
  }
  if (await probeAdminVite(port)) {
    console.log(`tovu desktop: an admin Vite is already answering on :${port} — reusing it, and leaving it running on exit.`);
    return "reuse";
  }
  const holders = listenersOn(port);
  if (holders.length > 0) {
    console.error(
      `\ntovu desktop: port ${port} is held by ${holders.map((h) => `PID ${h.pid} (${h.command})`).join(", ")}, ` +
        "but nothing there answers an HTTP probe — not starting an admin Vite.\n"
    );
    return "blocked";
  }
  console.log(`tovu desktop: starting the admin Vite on :${port} so /admin hot-reloads.`);
  return "start";
}

/**
 * Recovery when the admin Vite child goes away mid-session. Re-probes once, because the most likely
 * cause is losing a `strictPort` race to a second `npm run desktop` — in which case the port is now
 * served by somebody else's Vite and everything still works.
 */
async function reportAdminViteGone(code, signal) {
  console.error(`\ntovu desktop: admin vite exited (code ${code ?? "none"}, signal ${signal ?? "none"}).`);
  if (await probeAdminVite(ADMIN_VITE_PORT)) {
    console.log(`tovu desktop: another admin Vite already owns :${ADMIN_VITE_PORT} — using it.\n`);
    return;
  }
  warnStaleAdminDist();
}

async function main() {
  // Preload has no watch step here, so build it once up front — covers a first run with no dist/
  // yet, and any preload edit made since the last build.
  runToCompletion("building preload", "build:preload");

  console.log(
    "tovu desktop: watching the renderer for changes — edit, then reload the window (Cmd+R) to see it.\n" +
      "tovu desktop: Ctrl-C stops everything.\n"
  );
  // Cheap (0-3s worst case) and BEFORE the renderer watch, so a decision to start our own Vite
  // overlaps the renderer's ~2.7s first build instead of adding to it.
  const adminVitePlan = await planAdminVite(ADMIN_VITE_PORT);

  // Captured BEFORE the watcher spawns, so any pre-existing `index.html` from a previous run —
  // already on disk, already stable — reads as older than this run and cannot short-circuit the
  // wait below. See waitForFileStable's doc comment.
  const rendererBuildStartedAt = Date.now();
  start("vite watch", ["run", "watch:renderer"]);

  // Fired when the admin Vite child dies, so `waitForAdminVite` below stops waiting on a server that
  // is never going to answer (e.g. a missing `apps/admin/node_modules`).
  const adminViteGone = new AbortController();
  if (adminVitePlan === "start") {
    start("admin vite", ["--prefix", "apps/admin", "run", "dev"], {
      cwd: REPO_ROOT,
      fatal: false,
      // The port explicitly, for the same reason `dev.mjs`'s `buildAdminViteEnv` passes it: the child
      // must bind the port THIS script preflighted, not re-derive a default.
      //
      // Deliberately NOT `TOVU_API_URL`. Vite's `server.proxy` is never exercised on the desktop
      // path: the browser is on the SITE server's origin, which proxies only `/admin/*` here and
      // answers relative `/api/...`, `/agent-icons`, `/theme-assets`, `/readyz` and `/mcp-ui`
      // requests itself. That is precisely why one Vite serves any number of desktop sites on any
      // number of dynamic ports. Known consequence, accepted: under a bare `npm run desktop`,
      // opening `localhost:5173/admin/` DIRECTLY in a browser is unsupported, because Vite's `/api`
      // proxy still points at `localhost:3000` and there is no API there.
      env: { TOVU_ADMIN_DEV_PORT: String(ADMIN_VITE_PORT) },
      onExit: (code, signal) => {
        adminViteGone.abort();
        void reportAdminViteGone(code, signal);
      },
    });
  } else if (adminVitePlan !== "reuse") {
    warnStaleAdminDist();
  }

  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(sig, () => {
      console.log("\ntovu desktop: stopping…");
      shutdown(0);
    });
  }

  if (!shuttingDown) {
    if (!(await waitForFileStable(RENDERER_ENTRY, { sinceMs: rendererBuildStartedAt }))) {
      console.warn(
        "\ntovu desktop: renderer build did not settle within 30s — starting Electron anyway.\n"
      );
    }
    // Hold Electron until the admin Vite answers, so a site window opened immediately does not miss
    // the probe in `apps/desktop/main.ts` and settle onto the static bundle for its whole lifetime.
    // In the common case this costs ~0s: Vite booted alongside the renderer build above.
    if (adminVitePlan === "start" && !shuttingDown) {
      const up = await waitForAdminVite(ADMIN_VITE_PORT, { signal: adminViteGone.signal });
      // An abort means the child died and `reportAdminViteGone` has already said so, loudly.
      if (!up && !adminViteGone.signal.aborted) {
        console.warn(
          `\ntovu desktop: the admin Vite has not answered on :${ADMIN_VITE_PORT} within 30s — starting Electron anyway.\n` +
            "tovu desktop: any site window opened before it does will serve /admin from apps/admin/dist.\n"
        );
      }
    }
    if (!shuttingDown) start("electron", ["run", "dev"]);
  }
}

// Guarded like `development/scripts/dev.mjs`'s own entrypoint check: importing this module (e.g.
// from a unit test that only wants `waitForFileStable`) must not also boot the real dev stack.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

export { waitForFileStable, HARD_KILL_GRACE_MS, isFlagEnabled, probeAdminVite, waitForAdminVite };
