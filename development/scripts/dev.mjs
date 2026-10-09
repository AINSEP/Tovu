#!/usr/bin/env node
/**
 * @file `npm run dev` — the one command that brings up a working local Tovu.
 *
 * Replaces the previous `npm run dev:server & npm run admin:dev & wait`, which had three failure
 * modes that between them cost a full session:
 *
 * 1. **Half-dead boots.** `&`-backgrounding meant either half could die while the other kept
 *    running. The common shape was the API dying while Vite stayed up on 5173 — so the admin SPA
 *    loads, every `/api` call is ECONNREFUSED, and the symptom reads as "login is broken" rather
 *    than "the backend is not running." Here, either child exiting tears down the other.
 *
 * 2. **Orphaned daemons.** `apps/website/src/index.ts` spawns the agent daemon, which under `tsx` is an
 *    `npx -> tsx -> node` chain. Killing the direct child killed `npx`, leaving the real `node`
 *    daemon reparented to PID 1, still holding port 4319 and an open handle on `infra/content.db`.
 *    The next `npm run dev` then collided with it. Every child here is spawned `detached` into its
 *    own process group and torn down with `process.kill(-pid)`, which reaps grandchildren.
 *
 * 3. **Silent port collisions.** Nothing checked whether a port was already taken, so a stale
 *    process turned into a mystery instead of an error. Preflight below names the PID and command
 *    holding each port and refuses to start.
 *
 * Deliberately NOT a process manager. No restart-on-crash, no log multiplexing beyond inherited
 * stdio. If a child dies, we tear down and exit non-zero so the failure is visible.
 *
 * One exception, restart-on-REQUEST (owner decision OD-S1, 2026-10-05): after a site switch the
 * server writes a request file (`TOVU_DEV_RESTART_REQUEST_FILE`, see `createApiRestarter` below and
 * `apps/website/src/platform/dev-supervisor/dev-restart.ts`), and this script restarts ONLY the API
 * child onto the newly persisted `TOVU_SITE`; admin Vite keeps running. The server still never kills
 * itself. A crash is still a crash: an exit nobody asked for tears everything down exactly as before.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, unwatchFile, watchFile } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

import { loadRepoRootEnvFile } from "./load-repo-root-env.mjs";
import { localDevPluginInstallEnv } from "./local-dev-plugin-install.mjs";
import { listenersOn } from "./port-listeners.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Load `.env` from the repo root, if one exists, before anything below reads `process.env` — see
// `load-repo-root-env.mjs` for the full mechanism and precedence rule (shell exports win; `.env` only
// fills gaps). `development/scripts/dev-desktop.mjs` (`npm run desktop`) calls the same loader for the
// same reason: without it, a desktop-launched site server never sees a secret like
// `TOVU_SITE_KEY`, and a stored OAuth MCP server silently fails to decrypt instead of
// surfacing as unset config.
// Captured BEFORE `.env` loads: a `TOVU_SITE` exported in the shell wins over `.env` (see
// `load-repo-root-env.mjs`), so a restart after a site switch must keep it — see `siteEnvForRestart`.
const SHELL_TOVU_SITE = process.env.TOVU_SITE;

if (loadRepoRootEnvFile(REPO_ROOT)) {
  console.log("tovu dev: loaded .env");
}

/** Explain inherited deployment credentials at startup without disclosing their value. @complexity O(1). */
export function warnInheritedAdminPassword({ env }, { warn = console.warn } = {}) {
  if (env.TOVU_ADMIN_PASSWORD !== undefined) {
    warn("tovu dev: TOVU_ADMIN_PASSWORD is ignored for newly created sites; it still applies to the serving site's first-boot owner seeding when no owner exists.");
  }
}

const API_PORT = Number(process.env.PORT ?? 3000);
const VITE_PORT = Number(process.env.TOVU_ADMIN_DEV_PORT ?? 5173);
// Mirrors apps/website/src/index.ts's own default. Checked here so a squatter is reported by name at startup
// rather than surfacing later as "the assistant is unavailable".
const DAEMON_PORT = Number(process.env.JINI_AGENT_DAEMON_PORT ?? 4319);

// Same repo-root cert pair both dev servers gate their own TLS on
// (`apps/website/src/server/runtime/boot/dev-tls.ts`, `apps/admin/vite.config.ts`). Computed once
// here so every printed URL and every child env var below agrees with what those two gates will
// independently decide for themselves.
const CERT_PATH = path.join(REPO_ROOT, ".certs", "localhost.pem");
const KEY_PATH = path.join(REPO_ROOT, ".certs", "localhost-key.pem");

/**
 * Parses `TOVU_DISABLE_DEV_TLS` the same way `apps/website/src/server/runtime/boot/dev-tls.ts`'s
 * (unexported) `isDevTlsExplicitlyDisabled` and `apps/admin/vite.config.ts`'s
 * `isDevTlsExplicitlyDisabled` do: trim + lowercase, `"1"`/`"true"` only — NOT a bare truthy check on
 * the raw string, which treated ANY non-empty value, including the literal `"false"` or `"0"`, as
 * "disable", silently inverting an operator who explicitly set `TOVU_DISABLE_DEV_TLS=false` meaning
 * "do not disable TLS" (2026-09-05 audit finding, CONFIRMED against this exact check).
 *
 * A fourth shared module was considered and rejected: this file runs via bare `node` (see
 * `package.json`'s `"dev"` script) with no TypeScript transform at all, so it cannot import a `.ts`
 * leaf module the other two copies could share, and neither of those two (both `tsc`-checked, both
 * with `allowJs` off) can cleanly import a plain `.js`/`.mjs` file back. Three small copies, each
 * commented to point at the other two, beat one shared module none of the three runtimes can all
 * reach. If you change this parse, change the other two copies too.
 *
 * @param {string | undefined} raw
 * @returns {boolean}
 */
export function isDevTlsExplicitlyDisabled(raw) {
  const normalized = raw?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

/**
 * Whether this boot's two dev servers will terminate TLS themselves — the same decision
 * `dev-tls.ts`'s `resolveDevTls` and `vite.config.ts`'s inline gate make independently, duplicated
 * here (not imported) because this file, `apps/website/src/index.ts`, and `apps/admin/vite.config.ts`
 * are three separately-loaded runtimes (a bare Node script, `tsx`-run TypeScript, and Vite's own
 * config loader) with no existing shared-module boundary between them.
 *
 * Pure decision logic, `existsSync` injected so a test can assert on it without touching the real
 * filesystem. `disableFlag` must already be a parsed boolean (see `isDevTlsExplicitlyDisabled`,
 * called at this function's one call site in `main()`) — this function does a bare boolean check,
 * not string parsing, on purpose: the previous bug was exactly a raw string reaching this check.
 *
 * @param {{certPath: string, keyPath: string, disableFlag: boolean}} input
 * @param {{existsSync?: (path: string) => boolean}} [deps]
 * @returns {boolean}
 */
export function resolveDevTlsActive({ certPath, keyPath, disableFlag }, deps = {}) {
  const checkExists = deps.existsSync ?? existsSync;
  if (disableFlag) return false;
  return checkExists(certPath) && checkExists(keyPath);
}

/**
 * Pure scheme derivation for every URL this script prints or hands to a child — the thing this file
 * got wrong before this change (every printed URL hardcoded `http://` regardless of whether TLS was
 * actually active).
 *
 * @param {boolean} tlsActive
 * @returns {"https" | "http"}
 */
export function deriveDevScheme(tlsActive) {
  return tlsActive ? "https" : "http";
}

function preflight() {
  const conflicts = [];
  for (const [label, port] of [
    ["API server", API_PORT],
    ["admin Vite", VITE_PORT],
    ["agent daemon", DAEMON_PORT],
  ]) {
    for (const proc of listenersOn(port)) {
      conflicts.push(`  ${label} port ${port} is held by PID ${proc.pid} (${proc.command})`);
    }
  }
  if (conflicts.length === 0) return;

  console.error("\ntovu dev: cannot start — required ports are already in use.\n");
  console.error(conflicts.join("\n"));
  console.error(
    "\nThis is usually an orphaned process from an earlier run. Inspect it first, then:\n" +
      `  kill ${conflicts.map((c) => c.match(/PID (\d+)/)?.[1]).filter(Boolean).join(" ")}\n\n` +
      "If it is a daemon holding infra/content.db, killing it also releases the database.\n" +
      "`npm run desktop` puts its admin Vite on 5273+ now, never 5173; a desktop holding 5173 was launched\n" +
      "before that change and frees it on its next restart.\n" +
      "To run alongside whatever holds them instead, pick other ports (each one threads through on its own):\n" +
      "  PORT=3001 TOVU_ADMIN_DEV_PORT=5174 JINI_AGENT_DAEMON_PORT=4320 npm run dev\n"
  );
  process.exit(1);
}

const children = [];
let shuttingDown = false;
/** Children whose next exit is a requested restart, not a crash (see `createApiRestarter`). */
const plannedExits = new WeakSet();

/** Kill a child's whole process group, so `npx -> tsx -> node` chains die with it. */
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

/**
 * Resolve once something is accepting TCP connections on `port`, or after `timeoutMs`.
 *
 * Exists to order Vite AFTER the API, which is the whole of the first boot race. Vite is ready in
 * ~240ms; the API takes 5-10s because `tsx` compiles TypeScript on the way up. Any browser tab
 * already open on :5173 starts polling `/api/*` immediately, and Vite's proxy answers every one with
 * a multi-line `AggregateError [ECONNREFUSED]` — pages of alarming output describing nothing wrong.
 *
 * Resolves rather than rejects on timeout: a slow API should still get a Vite, so a bad guess here
 * degrades to today's behaviour instead of refusing to start the admin at all.
 */
function waitForPort(port, timeoutMs = 30_000) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const attempt = () => {
      const socket = net.connect({ port, host: "127.0.0.1" });
      // `once` on all three: a socket that errors AND closes must not resolve twice.
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline) return resolve(false);
        setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

/**
 * What a child's exit means. Only a restart this script asked for (`createApiRestarter`) is
 * `planned`; every other exit outside shutdown is a `crash`, which tears the stack down as it always
 * has — restart-on-request adds no restart-on-crash.
 *
 * @param {{shuttingDown: boolean, planned: boolean}} input
 * @returns {"ignore" | "planned" | "crash"}
 */
export function classifyChildExit({ shuttingDown, planned }) {
  if (shuttingDown) return "ignore";
  return planned ? "planned" : "crash";
}

function start(name, command, args, env) {
  const child = spawn(command, args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    detached: true, // own process group — required for killGroup to reap grandchildren
    env: { ...process.env, ...env },
  });
  child.on("error", (error) => {
    console.error(`\ntovu dev: failed to start ${name}:`, error.message);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    const kind = classifyChildExit({ shuttingDown, planned: plannedExits.has(child) });
    if (kind === "ignore") return;
    if (kind === "planned") {
      children.splice(children.indexOf(child), 1);
      return;
    }
    console.error(
      `\ntovu dev: ${name} exited (code ${code ?? "none"}, signal ${signal ?? "none"}) — ` +
        "shutting the other half down so you don't get a half-running stack.\n"
    );
    shutdown(code === 0 ? 1 : (code ?? 1));
  });
  children.push(child);
  return child;
}

/** Mirrors `apps/website/src/platform/dev-supervisor/dev-restart.ts`'s constant of the same name
 *  (that file is TypeScript; this one runs under bare `node` and cannot import it). */
export const DEV_RESTART_REQUEST_FILE_ENV = "TOVU_DEV_RESTART_REQUEST_FILE";

/**
 * The `TOVU_SITE` a restarted API child should get. `.env` is re-read because a site switch just
 * rewrote it; this process's own `process.env` still holds the value from boot. A shell-exported
 * `TOVU_SITE` wins over `.env` (the same precedence a human restart would see), so the switch is
 * inert and `warning` says so.
 *
 * @param {{shellSite: string | undefined, envFileText: string | null}} input
 * @returns {{env: Record<string, string>, warning?: string}}
 */
export function siteEnvForRestart({ shellSite, envFileText }) {
  if (shellSite !== undefined) {
    return {
      env: {},
      warning: `tovu dev: TOVU_SITE=${shellSite} is exported in your shell, so it wins over .env — the API restarts on that same site. Unset it to let a site switch take effect.`,
    };
  }
  const site = envFileText === null ? undefined : parseEnv(envFileText).TOVU_SITE;
  return { env: site ? { TOVU_SITE: site } : {} };
}

/**
 * Restart-on-request state machine for the API child. Every effect is injected, so a test drives it
 * with fakes (`development/scripts/__tests__/dev-api-restart.test.mjs`).
 *
 * `restart()` marks the running child as a PLANNED exit (so `start()`'s exit handler does not treat
 * it as a crash and tear the stack down), stops it, waits for its ports to free up (the API's own
 * SIGTERM handler shuts its agent daemon down; starting before :4319 is free would collide), then
 * starts a fresh child with `envForRestart()`. Concurrent requests share one restart. A Ctrl-C that
 * lands mid-restart wins: nothing new is started once `isShuttingDown()` is true.
 *
 * @param {{
 *   startApi: (env: Record<string, string>) => any,
 *   stopChild: (child: any) => Promise<void>,
 *   markPlanned: (child: any) => void,
 *   waitForPortsFree: () => Promise<unknown>,
 *   envForRestart: () => Record<string, string>,
 *   isShuttingDown: () => boolean,
 *   log: (message: string) => void,
 * }} deps
 */
export function createApiRestarter(deps) {
  let child = null;
  let inFlight = null;
  async function run(reason) {
    deps.log(`\ntovu dev: restarting the API (${reason}) — admin Vite keeps running…\n`);
    if (child) {
      deps.markPlanned(child);
      await deps.stopChild(child);
    }
    await deps.waitForPortsFree();
    if (deps.isShuttingDown()) return false;
    child = deps.startApi(deps.envForRestart());
    return true;
  }
  return {
    start(env) {
      child = deps.startApi(env);
      return child;
    },
    current: () => child,
    /** @returns {Promise<boolean>} whether a new child was started. */
    restart(reason) {
      if (!inFlight) inFlight = run(reason).finally(() => (inFlight = null));
      return inFlight;
    },
  };
}

/** Resolves once `child` has exited; SIGTERMs its group, then SIGKILLs it after `graceMs`. */
function stopChildGroup(child, graceMs = 8000) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* gone */
      }
    }, graceMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    killGroup(child);
  });
}

/** Resolves once nothing listens on any of `ports`, or after `timeoutMs` (then starts anyway). */
async function waitForPortsFree(ports, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (ports.some((port) => listenersOn(port).length > 0)) {
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return true;
}

/** Reads the repo-root `.env`, or `null` when there is none. */
function readRepoEnvFile() {
  try {
    return readFileSync(path.join(REPO_ROOT, ".env"), "utf8");
  } catch {
    return null;
  }
}

/**
 * Polls `requestFile` and calls `onRequest(reason)` each time the server writes it. The file is
 * deleted on sight so one request is one restart. Polling (500ms), not `fs.watch`: it behaves the
 * same on every platform and the file may not exist yet.
 */
function watchRestartRequests(requestFile, onRequest) {
  watchFile(requestFile, { interval: 500 }, (current) => {
    if (current.mtimeMs === 0) return; // missing — including right after we deleted it
    let reason = "requested by the server";
    try {
      reason = JSON.parse(readFileSync(requestFile, "utf8")).reason ?? reason;
    } catch {
      /* unreadable — still a request */
    }
    try {
      unlinkSync(requestFile);
    } catch {
      /* already gone */
    }
    onRequest(reason);
  });
  return () => unwatchFile(requestFile);
}

/**
 * Env for the admin Vite child — the other half of the API/Vite pair `start("api server", ...)`
 * above already gets right.
 *
 * Both entries mirror the SAME preflight-checked ports `TOVU_API_URL` (`apps/admin/vite.config.ts`'s
 * `/api` proxy target) and `TOVU_ADMIN_DEV_PORT` (that same file's own dev-server `server.port`) —
 * back to the child that actually needs them. Before this function existed, the admin vite child was
 * started with no env at all (`{}`), so it silently fell back to those two vars' hardcoded defaults
 * (`http://localhost:3000`, `5173`) regardless of what `API_PORT`/`VITE_PORT` this script had
 * actually computed and preflight-checked. That is invisible the moment a second `npm run dev` on
 * this machine sets `PORT`/`TOVU_ADMIN_DEV_PORT` to get past preflight's port-collision check (the
 * whole point of overriding them): preflight passes, both children start, but the SECOND instance's
 * admin silently proxies `/api` to the FIRST instance's API on :3000 — so a developer edits one
 * site's content while the admin UI reads and writes another site's data, with no error anywhere.
 * Extracted as a pure function (rather than inlined into the `start(...)` call below) specifically so
 * a test can assert on the exact env object without spawning anything — see this file's own test for
 * the regression this closes.
 *
 * `apiScheme` defaults to `"http"` so an existing caller that omits it (none left in this file, but
 * the exported function is also imported directly by this file's own test) keeps producing exactly
 * the pre-TLS-support default this function has always returned.
 *
 * @param {{apiPort: number, vitePort: number, apiScheme?: "https" | "http"}} ports
 * @returns {{TOVU_API_URL: string, TOVU_ADMIN_DEV_PORT: string}}
 */
export function buildAdminViteEnv({ apiPort, vitePort, apiScheme = "http" }) {
  return {
    TOVU_API_URL: `${apiScheme}://localhost:${apiPort}`,
    TOVU_ADMIN_DEV_PORT: String(vitePort),
  };
}

/**
 * Env for the API child, layered over this process's own `process.env` by `start(...)`. Extracted
 * (like {@link buildAdminViteEnv}) so a test can assert on it without spawning anything.
 *
 * @param {{scheme: "https" | "http", apiPort: number, vitePort: number, supervisorPid: number}} required
 * @param {{env?: Readonly<Record<string, string | undefined>>}} [optional] - defaults to `process.env`;
 *   read for the "explicit always wins" flags below.
 * @returns {Record<string, string>}
 */
export function buildApiEnv({ scheme, apiPort, vitePort, supervisorPid }, { env = process.env } = {}) {
  return {
    // Makes the API's own /admin/ proxy to Vite instead of serving the built dist, so :3000/admin/
    // and :5173/admin/ agree in dev. Scheme-matched to `scheme`: this is a browser 302 redirect
    // (`admin-static.ts`), not a server-side fetch, but a redirect to the wrong scheme still breaks
    // — a plain-HTTP redirect at an origin now speaking TLS-only fails the same way a browser
    // hitting any other TLS port with a raw HTTP request would.
    TOVU_ADMIN_DEV_PROXY_URL: `${scheme}://localhost:${vitePort}`,
    PORT: String(apiPort),
    // Backs `apps/website/src/index.ts`'s own parent watchdog (see that file's `startOwnParentWatchdog()` for the
    // full rationale). Deliberately this process's own pid, not left for the child to infer via its
    // OS `ppid`: `tsx watch` is a Node-based wrapper that does not exec-replace, so the API's real
    // ppid resolves to the `tsx watch` supervisor two hops below THIS process, and that supervisor
    // survives even if this process dies — confirmed live (`ADS-memory/reports/analysis/
    // 2026-08-05-symmetric-watchdog.md`): killing only this process left the API and its own spawned
    // agent daemon fully alive and bound, unchanged, 2s later. This env var closes that gap the same
    // way `TOVU_PARENT_PID` already closes the analogous one for the agent daemon.
    TOVU_DEV_SUPERVISOR_PID: String(supervisorPid),
    // Admin "Sites" switcher capability flag (2026-09-04 sites-switcher decision) — default ON for
    // every local `npm run dev` boot, same "explicit always wins" precedence this file's other env
    // overrides already follow: an operator's own `TOVU_ENABLE_SITE_SWITCHER` (exported in the
    // shell, or set in `.env`) is never overridden. `apps/website/src/server/runtime/composition/
    // site-switcher-enabled.ts` owns the flag's own default-OFF-elsewhere polarity and full
    // rationale (Tovu-Runner/hosted never set this var, so both stay OFF without this file's help).
    TOVU_ENABLE_SITE_SWITCHER: env.TOVU_ENABLE_SITE_SWITCHER ?? "1",
    // Local plugin installs, on for local dev the same way — see `local-dev-plugin-install.mjs`.
    ...localDevPluginInstallEnv(env),
  };
}

/** Starts the admin child with the ports and scheme this stack has already checked. */
export function startAdminVite({ apiPort, vitePort, apiScheme, extraCaCerts }, startChild = start) {
  const env = buildAdminViteEnv({ apiPort, vitePort, apiScheme });
  if (extraCaCerts) env.NODE_EXTRA_CA_CERTS = extraCaCerts;
  return startChild("admin vite", "npm", ["--prefix", "apps/admin", "run", "dev"], env);
}

/**
 * NODE_EXTRA_CA_CERTS resolution — split out of `main()` (no logic change) purely to bring that
 * function's complexity under the repo's ceiling of 9 (`.mjs` files sit outside the ESLint gate
 * that would otherwise enforce this, so nothing catches it growing here).
 *
 * mkcert installs its CA into the OS trust store, which Node does NOT consult — it uses its own
 * bundled CA list. So the moment either dev server speaks TLS with an mkcert cert, any server-side
 * Node `fetch`/`https.request` to that origin fails UNABLE_TO_VERIFY_LEAF_SIGNATURE, even though the
 * identical URL works fine in a browser tab. Pointing `NODE_EXTRA_CA_CERTS` at mkcert's own root CA
 * fixes that for the whole process tree spawned below, without touching
 * `NODE_TLS_REJECT_UNAUTHORIZED` — that variable disables certificate verification process-wide,
 * including for real outbound calls this repo makes to third-party provider APIs, which is a
 * materially worse trade than a narrowly-scoped extra trusted root.
 *
 * Best-effort: `mkcert` is already a hard requirement to have GENERATED the certs `main()` found
 * before calling this, so it is expected to be on PATH here too, but a boot must never hard-fail
 * over a CA-trust nicety — the two servers themselves come up either way. A missing/failed CAROOT
 * only affects server-side Node callers that verify certs by default (documented in the handoff
 * report; today that is only `development/scripts/agent-run-probe.mjs`, run by hand, never by this
 * script).
 *
 * @param {boolean} tlsActive
 * @returns {string | undefined} mkcert's `rootCA.pem` path, or `undefined` when TLS is inactive or
 *   the root CA could not be located.
 */
function resolveMkcertRootCaPath(tlsActive) {
  if (!tlsActive) return undefined;

  const caRoot = spawnSync("mkcert", ["-CAROOT"], { encoding: "utf8" });
  const rootCaPath = caRoot.status === 0 ? path.join(caRoot.stdout.trim(), "rootCA.pem") : undefined;
  if (rootCaPath && existsSync(rootCaPath)) {
    return rootCaPath;
  }

  console.warn(
    "tovu dev: TLS is active but mkcert's root CA could not be located (`mkcert -CAROOT` failed, or rootCA.pem " +
      "is missing) — a server-side Node caller (e.g. development/scripts/agent-run-probe.mjs run against " +
      `https://localhost:${API_PORT}) will fail TLS verification until NODE_EXTRA_CA_CERTS is set by hand.\n`
  );
  return undefined;
}

async function main() {
  warnInheritedAdminPassword({ env: process.env });
  preflight();

  const tlsActive = resolveDevTlsActive({
    certPath: CERT_PATH,
    keyPath: KEY_PATH,
    disableFlag: isDevTlsExplicitlyDisabled(process.env.TOVU_DISABLE_DEV_TLS),
  });
  const scheme = deriveDevScheme(tlsActive);
  const extraCaCerts = resolveMkcertRootCaPath(tlsActive);

  console.log(
    `tovu dev: starting API on ${scheme}://localhost:${API_PORT} (compiling TypeScript, ~5-10s)…\n` +
      `tovu dev: admin will be served at ${scheme}://localhost:${API_PORT}/admin/ once the API is up ` +
      `(same-origin proxy to Vite; Vite itself stays directly reachable at ${scheme}://localhost:${VITE_PORT}/admin/).\n` +
      `tovu dev: Ctrl-C stops everything.\n`
  );

  const apiEnv = buildApiEnv({ scheme, apiPort: API_PORT, vitePort: VITE_PORT, supervisorPid: process.pid });
  if (extraCaCerts) apiEnv.NODE_EXTRA_CA_CERTS = extraCaCerts;
  // Per-supervisor request file (OD-S1): two `npm run dev`s on different ports never cross.
  const restartRequestFile = path.join(os.tmpdir(), `tovu-dev-restart-${process.pid}.json`);
  try {
    unlinkSync(restartRequestFile);
  } catch {
    /* no stale request */
  }
  apiEnv[DEV_RESTART_REQUEST_FILE_ENV] = restartRequestFile;
  apiEnv.TOVU_DEV_SITE_PINNED = SHELL_TOVU_SITE === undefined ? "0" : "1";
  const apiRestarter = createApiRestarter({
    startApi: (env) => start("api server", "npx", ["tsx", "watch", "apps/website/src/index.ts"], env),
    stopChild: (child) => stopChildGroup(child),
    markPlanned: (child) => plannedExits.add(child),
    waitForPortsFree: () => waitForPortsFree([API_PORT, DAEMON_PORT]),
    envForRestart: () => {
      const site = siteEnvForRestart({ shellSite: SHELL_TOVU_SITE, envFileText: readRepoEnvFile() });
      if (site.warning) console.warn(site.warning);
      return { ...apiEnv, ...site.env };
    },
    isShuttingDown: () => shuttingDown,
    log: (message) => console.log(message),
  });
  apiRestarter.start(apiEnv);
  watchRestartRequests(restartRequestFile, (reason) => {
    if (!shuttingDown) void apiRestarter.restart(reason);
  });

  /**
   * Vite starts only once the API is accepting connections.
   *
   * Both used to start together, which meant Vite was serving ~9 seconds before anything could answer
   * the requests it proxies. A browser tab already open on :5173 would reconnect the moment Vite came
   * up and immediately fire `/api/agents`, `/api/admin/v1/.../settings/events` and the frontend-session
   * SSE stream — each answered with a multi-line `AggregateError [ECONNREFUSED]` stack. Pages of
   * alarming output for a stack that was simply still booting, and indistinguishable at a glance from
   * the real "the API died" failure this script exists to make obvious.
   *
   * Ordering them removes the window rather than muting the symptom. The cost is that :5173 is not
   * live for the first few seconds — which is honest, because until the API is up the admin cannot do
   * anything anyway.
   *
   * NOTE: this closes the Vite→API race only. A second, narrower one remains by design: `apps/website/src/index.ts`
   * spawns the agent daemon from INSIDE `app.listen()`'s callback, so the API accepts requests a few
   * seconds before the daemon binds :4319. That one is handled where it belongs, in
   * `server/modules/assistant.ts`'s proxy — see its retry note.
   */
  if (!(await waitForPort(API_PORT))) {
    console.warn(
      `\ntovu dev: API did not come up within 30s — starting the admin anyway.\n` +
        `tovu dev: expect proxy errors on :${VITE_PORT} until it does.\n`
    );
  }
  if (!shuttingDown) {
    console.log(
      `tovu dev: API is up. Open ${scheme}://localhost:${API_PORT}/admin/` +
        ` (Vite direct: ${scheme}://localhost:${VITE_PORT}/admin/)\n`
    );
    startAdminVite({ apiPort: API_PORT, vitePort: VITE_PORT, apiScheme: scheme, extraCaCerts });
  }

  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(sig, () => {
      console.log("\ntovu dev: stopping…");
      shutdown(0);
    });
  }
}

// Only run the real boot sequence when this file is executed directly (`node dev.mjs` / `npm run
// dev`), not when a test imports it for `buildAdminViteEnv` — same guard `emit-dist-package-json.mjs`
// already uses for the identical reason: importing must never preflight real ports or spawn real
// child processes.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
