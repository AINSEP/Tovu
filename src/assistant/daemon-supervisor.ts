/**
 * @file Owns the agent daemon's OS process lifecycle for the whole boot: the one real
 * `child_process.spawn` (moved here from `index.ts`'s old `spawnAgentDaemon`, same env vars,
 * process-group detachment, and stdio-piping behavior — see `spawnRealDaemonProcessFor`'s own
 * comments for why each of those exists) plus automatic respawn on an unexpected exit.
 *
 * Split out of `index.ts` rather than made recursive in place, for two independent reasons:
 * 1. `index.ts` can never be imported by a test (`void main()` runs at module load — see that
 *    file's own header), so any logic that needs direct unit coverage has to live somewhere else.
 *    This is the same reason `boot-lifecycle.ts`/`bootstrap.ts` were already split out of it.
 * 2. The old `spawnAgentDaemon` registered `process.on(SIGINT/SIGTERM/SIGHUP/"exit", reap)`
 *    INSIDE itself. That was fine called once; it would leak a fresh set of process-level signal
 *    handlers on every single automatic respawn if the same function were simply made recursive.
 *    Here, the real `process.on(...)` wiring happens exactly once, in the module-singleton
 *    wrapper at the bottom of this file — {@link createDaemonSupervisor}'s factory itself never
 *    touches `process.on`, which is also what makes it safe to unit test directly.
 *
 * Retry/backoff/crash-loop DECISIONS live in `daemon-respawn-policy.ts`, kept deliberately pure
 * (no timers, no child_process) so those rules are provable without orchestrating real delays or a
 * real daemon process. This file's job is narrower: wire that policy's decisions to an actual spawn
 * loop, and know how to describe an exit in the same human-readable, specific-reason style
 * `index.ts`'s original code already established (`agent daemon could not bind ... address already
 * in use` instead of a bare "exited with code 1").
 */
import { spawn } from "node:child_process";
import path from "node:path";

import { clearAssistantDaemonFailure, recordAssistantDaemonFailure } from "../server/readiness-state";
import { AGENT_DAEMON_EXIT_CODE } from "./daemon-exit-codes";
import { createRespawnPolicy } from "./daemon-respawn-policy";
import type { RespawnDecision, RespawnPolicy } from "./daemon-respawn-policy";

/**
 * The minimal shape this module needs from a spawned daemon process. Node's real `ChildProcess`
 * satisfies this structurally with no adapter needed; tests pass a lightweight `EventEmitter`-based
 * double instead so no real OS process is ever spawned in a unit test (see this file's own test).
 */
export interface SpawnedDaemonProcess {
  // Optional, matching Node's own `ChildProcess.pid` shape exactly (not `pid: number | undefined`)
  // — a required property typed `T | undefined` and an optional `pid?: T` are NOT structurally
  // interchangeable to the type checker, and the real `spawn()` return value only satisfies the
  // optional form.
  readonly pid?: number;
  on(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

export interface DaemonSupervisorDeps {
  /** Produces one fresh daemon OS process per call. Production default:
   *  {@link spawnRealDaemonProcessFor}; tests inject a double so `createDaemonSupervisor` never
   *  touches `child_process` directly. */
  spawnDaemonProcess: () => SpawnedDaemonProcess;
  /** Defaults to a fresh {@link createRespawnPolicy} instance with production settings — pass an
   *  override in tests to shrink the backoff/cap thresholds so retries happen in milliseconds. */
  policy?: RespawnPolicy;
  /** Only used to compose human-readable failure messages. Defaults to
   *  `JINI_AGENT_DAEMON_PORT ?? "4319"`, matching what the daemon itself resolves
   *  (`agent-daemon-server.ts`). */
  daemonPort?: string;
}

export interface DaemonSupervisor {
  /** Perform the first spawn attempt. Call exactly once per supervisor instance. */
  start(): void;
  /**
   * The manual restart seam — the piece that answers "a human's not gonna know how to restart a
   * Node process": clears the respawn policy, cancels any pending scheduled retry, and spawns a
   * replacement daemon, regardless of whether the crash-loop cap had tripped. If a daemon process
   * is still alive, it is killed first and the replacement is spawned only after it actually
   * exits — spawning immediately alongside a still-live daemon would just collide on the same
   * port and fail with the exact EADDRINUSE this supervisor otherwise guards against.
   */
  restart(): void;
  /** Deliberate shutdown: stops any future automatic respawn, cancels a pending scheduled retry,
   *  and kills the currently-running daemon (process-group kill, falling back to the direct
   *  child). Safe to call even when no daemon is currently running. */
  shutdown(): void;
}

/** Same reasoning `index.ts` used for EADDRINUSE specifically: naming the real cause here is what
 *  turns an unexplained "exited unexpectedly (code 1)" into something an operator can act on. */
function computeExitReasonCode(code: number | null, signal: NodeJS.Signals | null, daemonPort: string): string {
  if (code === AGENT_DAEMON_EXIT_CODE.PORT_IN_USE) {
    return `agent daemon could not bind 127.0.0.1:${daemonPort} — address already in use`;
  }
  return `agent daemon exited unexpectedly (code ${code}, signal ${signal ?? "none"})`;
}

/** Composes the final latched reason once the respawn policy has given up — see
 *  `daemon-respawn-policy.ts`'s header for why these two `kind`s exist and get different wording. */
function buildGiveUpReasonCode(decision: Extract<RespawnDecision, { action: "give-up" }>, lastReasonCode: string, daemonPort: string): string {
  if (decision.kind === "port-conflict") {
    return (
      `gave up after ${decision.attempts} attempts trying to bind 127.0.0.1:${daemonPort} — likely a zombie ` +
      `process still holding the port; find it with \`lsof -ti :${daemonPort} -sTCP:LISTEN\`, stop it, then use ` +
      `the manual restart to try again`
    );
  }
  return `gave up after ${decision.attempts} attempts in ${Math.round(decision.windowMs / 1000)}s: ${lastReasonCode}`;
}

/**
 * Create a fresh {@link DaemonSupervisor}. Pure wiring — no `process.on` registration and no real
 * spawning happens until `start()`/`restart()` is called, which is what makes this safe to
 * construct directly inside a unit test.
 *
 * @complexity Each returned method is O(1) aside from the injected `spawnDaemonProcess`/`policy`
 *   calls it delegates to; state is a handful of closed-over variables, not a growing structure.
 */
export function createDaemonSupervisor(deps: DaemonSupervisorDeps): DaemonSupervisor {
  const policy = deps.policy ?? createRespawnPolicy();
  const daemonPort = deps.daemonPort ?? process.env.JINI_AGENT_DAEMON_PORT ?? "4319";

  let currentChild: SpawnedDaemonProcess | undefined;
  let childHasExited = false;
  let pendingRetryTimer: NodeJS.Timeout | undefined;
  // Distinct from `childHasExited`: this means "an exit right now must NOT be treated as a
  // failure that feeds the respawn policy" — true both during a real process shutdown and, briefly,
  // while `restart()` is replacing a still-live child on purpose.
  let shuttingDown = false;

  function cancelPendingRetry(): void {
    if (pendingRetryTimer === undefined) return;
    clearTimeout(pendingRetryTimer);
    pendingRetryTimer = undefined;
  }

  function handleUnexpectedExit(code: number | null, signal: NodeJS.Signals | null): void {
    const reasonCode = computeExitReasonCode(code, signal, daemonPort);
    console.error(`[daemon-supervisor] ${reasonCode}`);
    recordAssistantDaemonFailure(reasonCode);

    const decision = policy.recordFailure({ isPortConflict: code === AGENT_DAEMON_EXIT_CODE.PORT_IN_USE });
    if (decision.action === "retry") {
      pendingRetryTimer = setTimeout(() => {
        pendingRetryTimer = undefined;
        attemptSpawn();
      }, decision.delayMs);
      return;
    }

    const giveUpReasonCode = buildGiveUpReasonCode(decision, reasonCode, daemonPort);
    console.error(`[daemon-supervisor] ${giveUpReasonCode}`);
    recordAssistantDaemonFailure(giveUpReasonCode);
  }

  function attemptSpawn(): void {
    // Mirrors `clearAssistantDaemonFailure`'s own doc: every attempt starts from a clean
    // readiness slate, so a later successful attempt is never stuck behind a stale 503 an earlier,
    // unrelated attempt latched.
    clearAssistantDaemonFailure();
    childHasExited = false;
    const child = deps.spawnDaemonProcess();
    currentChild = child;

    child.on("error", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      const reasonCode = `failed to start the agent daemon — the assistant will be unavailable: ${message}`;
      console.error(`[daemon-supervisor] ${reasonCode}`);
      recordAssistantDaemonFailure(reasonCode);
      // Deliberately NOT fed into the respawn policy: a spawn-level error (e.g. the daemon script
      // itself is missing) is not transient. Retrying the same broken command on a backoff would
      // just repeat the identical failure until the crash-loop cap trips anyway — the manual
      // restart seam is still the correct recovery path once whatever is actually broken is fixed.
    });
    child.on("exit", (code, signal) => {
      childHasExited = true;
      if (shuttingDown) return;
      handleUnexpectedExit(code, signal);
    });
  }

  /** Process-group kill, falling back to the direct child — identical shape to `index.ts`'s
   *  original `reap()`, just reading `currentChild`/`childHasExited` instead of closed-over
   *  `child`/`pid` locals. */
  function killCurrentChild(): void {
    if (currentChild === undefined || childHasExited) return;
    const pid = currentChild.pid;
    if (pid === undefined) return;
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        currentChild.kill("SIGTERM");
      } catch {
        /* already gone */
      }
    }
  }

  return {
    start() {
      attemptSpawn();
    },
    restart() {
      cancelPendingRetry();
      policy.reset();

      if (currentChild !== undefined && !childHasExited) {
        // Suppress the outgoing child's own exit handler (it would otherwise read this
        // deliberate kill as a crash and feed it to the policy) and spawn the replacement only
        // once it has actually released the port, not merely once we asked it to.
        const staleChild = currentChild;
        shuttingDown = true;
        staleChild.on("exit", () => {
          shuttingDown = false;
          attemptSpawn();
        });
        killCurrentChild();
        return;
      }

      shuttingDown = false;
      attemptSpawn();
    },
    shutdown() {
      shuttingDown = true;
      cancelPendingRetry();
      killCurrentChild();
    },
  };
}

/**
 * Resolves the daemon's own script path the same way `index.ts`'s original code did — by
 * swapping this file's extension — so the same code path launches `agent-daemon-server.ts` under
 * `tsx` in dev and the compiled `agent-daemon-server.js` under plain `node` in a built `dist/`.
 * Now co-located in `src/assistant/` with its target (this file's original home was `src/index.ts`,
 * one directory up), the join no longer needs an `"assistant"` path segment.
 */
function resolveDaemonScriptPath(): string {
  const isCompiled = __filename.endsWith(".js");
  return path.join(__dirname, isCompiled ? "agent-daemon-server.js" : "agent-daemon-server.ts");
}

/**
 * The real, production `spawnDaemonProcess` implementation — everything below is carried over
 * unchanged in behavior from `index.ts`'s original `spawnAgentDaemon` (only the call shape changed,
 * to fit {@link DaemonSupervisorDeps}); see that history for the full rationale on each choice:
 *
 * - `TOVU_WORKSPACE`/`TOVU_PARENT_PID` (D10 fix + this file's own watchdog contract): every spawn —
 *   including every automatic respawn — must bind the SAME workspace and report the SAME parent
 *   pid, so this is rebuilt from `process.env` fresh on every call rather than cached once.
 * - `detached: true`: puts the daemon in its own process group so `killCurrentChild` above can
 *   reap the whole group, not just the immediate `npx`/`tsx` hop in dev.
 * - `stdio: ["ignore", "pipe", "pipe"]` plus manual piping, not `"inherit"`: keeps this process's
 *   own stdout/stderr fds from ever being shared with an orphaned daemon (see git history on
 *   `index.ts` for the concrete Playwright-teardown hang this was fixed to prevent).
 */
function spawnRealDaemonProcessFor(workspaceId: string): SpawnedDaemonProcess {
  const daemonPath = resolveDaemonScriptPath();
  const isCompiled = daemonPath.endsWith(".js");
  const env: NodeJS.ProcessEnv = { ...process.env, TOVU_WORKSPACE: workspaceId, TOVU_PARENT_PID: String(process.pid) };

  const child = isCompiled
    ? spawn(process.execPath, [daemonPath], { stdio: ["ignore", "pipe", "pipe"], env, detached: true })
    : spawn("npx", ["tsx", daemonPath], { stdio: ["ignore", "pipe", "pipe"], env, detached: true });

  // Relays the daemon's own output through this process instead of inheriting its fds — preserves
  // the existing `[agent-daemon] ...` log visibility during dev/test without sharing the pipe itself.
  child.stdout?.pipe(process.stdout);
  child.stderr?.pipe(process.stderr);
  return child;
}

// ---------------------------------------------------------------------------------------------
// Module-singleton wrapper — the ONLY place in this file that touches real `process.on`. `index.ts`
// calls `startAssistantDaemon` exactly once, from inside `app.listen()`'s callback (same placement
// as the old `spawnAgentDaemon` call — see that call site's own comment for why it must wait for
// the boot-readiness promises first). A future admin "Restart assistant" action calls
// `restartAssistantDaemon()` — re-exported through `src/assistant/index.ts`'s barrel — and reports
// back whatever `{ ok, reason }` it returns; no other wiring is required on this side.
// ---------------------------------------------------------------------------------------------
let singleton: DaemonSupervisor | undefined;

/**
 * Start the assistant daemon supervisor for this process boot. Safe to call only once — a second
 * call is ignored (logged, not thrown) rather than silently spawning a second supervisor that
 * would fight the first one for the same port and the same `process.on(signal, ...)` slot.
 */
export function startAssistantDaemon(input: { workspaceId: string }): void {
  if (singleton !== undefined) {
    console.error("[daemon-supervisor] startAssistantDaemon called more than once this process boot — ignoring");
    return;
  }

  const supervisor = createDaemonSupervisor({ spawnDaemonProcess: () => spawnRealDaemonProcessFor(input.workspaceId) });
  singleton = supervisor;
  supervisor.start();

  // `"exit"` alone is not enough: it does not run when this process is terminated by a signal,
  // which is how a dev server actually dies (Ctrl-C, or `tsx watch` cycling on a file change).
  process.on("exit", () => supervisor.shutdown());
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => {
      supervisor.shutdown();
      process.exit(0);
    });
  }
}

export interface RestartAssistantDaemonResult {
  ok: boolean;
  /** Present only when `ok` is `false` — e.g. the daemon was never started this boot at all. */
  reason?: string;
}

/**
 * The manual restart seam an admin action calls. Returns a result rather than throwing so a route
 * handler can report it back to the caller directly (`{ ok: true }` or `{ ok: false, reason }`).
 */
export function restartAssistantDaemon(): RestartAssistantDaemonResult {
  if (singleton === undefined) {
    return { ok: false, reason: "the assistant daemon was never started this process boot" };
  }
  singleton.restart();
  return { ok: true };
}
