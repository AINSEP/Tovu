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
 * 2. **Orphaned daemons.** `src/index.ts` spawns the agent daemon, which under `tsx` is an
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
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const API_PORT = Number(process.env.PORT ?? 3000);
const VITE_PORT = Number(process.env.TOVU_ADMIN_DEV_PORT ?? 5173);
// Mirrors src/index.ts's own default. Checked here so a squatter is reported by name at startup
// rather than surfacing later as "the assistant is unavailable".
const DAEMON_PORT = Number(process.env.JINI_AGENT_DAEMON_PORT ?? 4319);

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

preflight();

console.log(
  `tovu dev: API on http://localhost:${API_PORT}, admin on http://localhost:${VITE_PORT}/admin/\n` +
    `tovu dev: open http://localhost:${VITE_PORT}/admin/ — Ctrl-C stops everything.\n`
);

start("api server", "npx", ["tsx", "watch", "src/index.ts"], {
  // Makes the API's own /admin/ proxy to Vite instead of serving the built dist, so :3000/admin/
  // and :5173/admin/ agree in dev.
  TOVU_ADMIN_DEV_PROXY_URL: `http://localhost:${VITE_PORT}`,
  PORT: String(API_PORT),
});
start("admin vite", "npm", ["--prefix", "apps/admin", "run", "dev"], {});

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    console.log("\ntovu dev: stopping…");
    shutdown(0);
  });
}
