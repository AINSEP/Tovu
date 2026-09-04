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
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Load `.env` from the repo root, if one exists, before anything reads `process.env`.
 *
 * `.gitignore` has ignored `.env` and `.env.*` since long before this file existed, so the repo has
 * always LOOKED like it reads one — but nothing did. Every local secret therefore had to be
 * exported by hand in the shell that ran `npm run dev`, and the failure mode was silent: a missing
 * `TOVU_INTEGRATIONS_ROOT_KEY` surfaces much later as a `503 SECRET_STORE_UNCONFIGURED` on the AI
 * Assistant screen's save, which reads as a broken feature rather than as unset config.
 *
 * `process.loadEnvFile` is Node's own (v20.12+, no dependency). It runs HERE rather than in
 * `apps/website/src/index.ts` on purpose: this is the developer-machine entry point, and a `.env` that silently
 * overrode real environment variables on a production boot is a different and much worse thing.
 * Deployments set real env vars; `npm start` is untouched.
 *
 * Anything already exported in the shell is deliberately re-read from the file — Node's own
 * semantics — so a value here is the one source of truth for a dev boot rather than a value that
 * mysteriously depends on which terminal you used.
 */
const ENV_FILE = path.join(REPO_ROOT, ".env");
if (existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE);
  console.log("tovu dev: loaded .env");
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
 * Whether this boot's two dev servers will terminate TLS themselves — the same decision
 * `dev-tls.ts`'s `resolveDevTls` and `vite.config.ts`'s inline gate make independently, duplicated
 * here (not imported) because this file, `apps/website/src/index.ts`, and `apps/admin/vite.config.ts`
 * are three separately-loaded runtimes (a bare Node script, `tsx`-run TypeScript, and Vite's own
 * config loader) with no existing shared-module boundary between them.
 *
 * Pure decision logic, `existsSync` injected so a test can assert on it without touching the real
 * filesystem.
 *
 * @param {{certPath: string, keyPath: string, disableFlag: string | undefined}} input
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

/** @returns {{pid: string, command: string}[]} processes listening on `port`. */
function listenersOn(port) {
  const out = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-F", "pc"], {
    encoding: "utf8",
  });
  if (out.status !== 0 || !out.stdout) return [];
  const found = [];
  let pid = null;
  for (const line of out.stdout.split("\n")) {
    if (line.startsWith("p")) pid = line.slice(1);
    else if (line.startsWith("c") && pid) {
      found.push({ pid, command: line.slice(1) });
      pid = null;
    }
  }
  return found;
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
      "If it is a daemon holding infra/content.db, killing it also releases the database.\n"
  );
  process.exit(1);
}

const children = [];
let shuttingDown = false;

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
    if (shuttingDown) return;
    console.error(
      `\ntovu dev: ${name} exited (code ${code ?? "none"}, signal ${signal ?? "none"}) — ` +
        "shutting the other half down so you don't get a half-running stack.\n"
    );
    shutdown(code === 0 ? 1 : (code ?? 1));
  });
  children.push(child);
  return child;
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

async function main() {
  preflight();

  const tlsActive = resolveDevTlsActive({ certPath: CERT_PATH, keyPath: KEY_PATH, disableFlag: process.env.TOVU_DISABLE_DEV_TLS });
  const scheme = deriveDevScheme(tlsActive);

  // NODE_EXTRA_CA_CERTS: mkcert installs its CA into the OS trust store, which Node does NOT
  // consult — it uses its own bundled CA list. So the moment either dev server speaks TLS with an
  // mkcert cert, any server-side Node `fetch`/`https.request` to that origin fails
  // UNABLE_TO_VERIFY_LEAF_SIGNATURE, even though the identical URL works fine in a browser tab.
  // Pointing this at mkcert's own root CA fixes that for the whole process tree spawned below,
  // without touching `NODE_TLS_REJECT_UNAUTHORIZED` — that variable disables certificate
  // verification process-wide, including for real outbound calls this repo makes to third-party
  // provider APIs, which is a materially worse trade than a narrowly-scoped extra trusted root.
  //
  // Best-effort: `mkcert` is already a hard requirement to have GENERATED the certs found above, so
  // it is expected to be on PATH here too, but a boot must never hard-fail over a CA-trust nicety —
  // the two servers themselves come up either way. A missing/failed CAROOT only affects server-side
  // Node callers that verify certs by default (documented in the handoff report; today that is only
  // `development/scripts/agent-run-probe.mjs`, run by hand, never by this script).
  let extraCaCerts;
  if (tlsActive) {
    const caRoot = spawnSync("mkcert", ["-CAROOT"], { encoding: "utf8" });
    const rootCaPath = caRoot.status === 0 ? path.join(caRoot.stdout.trim(), "rootCA.pem") : undefined;
    if (rootCaPath && existsSync(rootCaPath)) {
      extraCaCerts = rootCaPath;
    } else {
      console.warn(
        "tovu dev: TLS is active but mkcert's root CA could not be located (`mkcert -CAROOT` failed, or rootCA.pem " +
          "is missing) — a server-side Node caller (e.g. development/scripts/agent-run-probe.mjs run against " +
          `https://localhost:${API_PORT}) will fail TLS verification until NODE_EXTRA_CA_CERTS is set by hand.\n`
      );
    }
  }

  console.log(
    `tovu dev: starting API on ${scheme}://localhost:${API_PORT} (compiling TypeScript, ~5-10s)…\n` +
      `tovu dev: admin will open on ${scheme}://localhost:${VITE_PORT}/admin/ once the API is up.\n` +
      `tovu dev: Ctrl-C stops everything.\n`
  );

  const apiEnv = {
    // Makes the API's own /admin/ proxy to Vite instead of serving the built dist, so :3000/admin/
    // and :5173/admin/ agree in dev. Scheme-matched to `scheme`: this is a browser 302 redirect
    // (`admin-static.ts`), not a server-side fetch, but a redirect to the wrong scheme still breaks
    // — a plain-HTTP redirect at an origin now speaking TLS-only fails the same way a browser
    // hitting any other TLS port with a raw HTTP request would.
    TOVU_ADMIN_DEV_PROXY_URL: `${scheme}://localhost:${VITE_PORT}`,
    PORT: String(API_PORT),
    // Backs `apps/website/src/index.ts`'s own parent watchdog (see that file's `startOwnParentWatchdog()` for the
    // full rationale). Deliberately this process's own pid, not left for the child to infer via its
    // OS `ppid`: `tsx watch` is a Node-based wrapper that does not exec-replace, so the API's real
    // ppid resolves to the `tsx watch` supervisor two hops below THIS process, and that supervisor
    // survives even if this process dies — confirmed live (`ADS-memory/reports/analysis/
    // 2026-08-05-symmetric-watchdog.md`): killing only this process left the API and its own spawned
    // agent daemon fully alive and bound, unchanged, 2s later. This env var closes that gap the same
    // way `TOVU_PARENT_PID` already closes the analogous one for the agent daemon.
    TOVU_DEV_SUPERVISOR_PID: String(process.pid),
  };
  if (extraCaCerts) apiEnv.NODE_EXTRA_CA_CERTS = extraCaCerts;
  start("api server", "npx", ["tsx", "watch", "apps/website/src/index.ts"], apiEnv);

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
    console.log(`tovu dev: API is up. Open ${scheme}://localhost:${VITE_PORT}/admin/\n`);
    const adminViteEnv = buildAdminViteEnv({ apiPort: API_PORT, vitePort: VITE_PORT, apiScheme: scheme });
    // Not load-bearing for Vite's own proxy today — `apps/admin/vite.config.ts`'s `secure: false` on
    // every proxy entry is what makes THAT client accept the API's self-signed cert. Passed through
    // anyway for the same "whole process tree" reasoning as the API child above: anything this admin
    // Vite process spawns or imports that makes its own standards-compliant Node TLS call to the API
    // gets the same trusted root without a second place to configure it.
    if (extraCaCerts) adminViteEnv.NODE_EXTRA_CA_CERTS = extraCaCerts;
    start("admin vite", "npm", ["--prefix", "apps/admin", "run", "dev"], adminViteEnv);
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
