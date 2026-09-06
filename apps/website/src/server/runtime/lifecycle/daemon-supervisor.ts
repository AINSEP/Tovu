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
 *
 * Two more properties this file owns, added after the first pass shipped:
 *
 * - **`terminating` vs. the crash-loop cap having tripped are different states, and `restart()`
 *   treats them differently on purpose.** A tripped cap means "this supervisor gave up retrying but
 *   the process is still alive" — `restart()` MUST work, that is the whole point of a manual seam.
 *   `terminating` means "this OS process itself is on its way down" (Docker sends SIGTERM to stop
 *   a container; `SIGINT`/`SIGHUP` are the interactive/dev equivalents) — `restart()` MUST refuse,
 *   or a request racing the container's own shutdown could resurrect a daemon the container is
 *   actively trying to kill, leaking exactly the orphan class `killCurrentChild`'s own comment
 *   describes for `tsx watch`. `terminating` is set once, by `shutdown()`, and never cleared —
 *   there is no scenario where a supervisor whose process is terminating should ever run again.
 * - **`ensureStarted()` is the on-demand/lazy-start layer**: automatic respawn only heals a daemon
 *   that died while this supervisor was watching it. It does nothing for a daemon that never
 *   started at all (a `child.on("error")` spawn failure — deliberately NOT retried, see
 *   `attemptSpawn`'s own comment) or one whose crash-loop cap tripped long before anyone showed up.
 *   `server/modules/assistant.ts`'s daemon-proxy call site is expected to call this when it
 *   discovers the daemon is unreachable, rather than only ever surfacing a 503 that nothing will
 *   ever clear on its own. Single-flight falls out of the existing state for free: `attemptSpawn`
 *   sets `currentChild` synchronously, with no `await` between the "is anything already running"
 *   check and that assignment, so two calls arriving in the same or adjacent event-loop turns
 *   cannot both decide to spawn — Node's run-to-completion guarantee is what makes this true, not
 *   an extra lock. What single-flight alone does NOT prevent is a request-volume-driven respawn
 *   storm against a daemon that is durably broken (missing script, bad permissions): every
 *   subsequent request would otherwise see "no child, nothing scheduled" and re-trigger. A cooldown
 *   floor (`onDemandCooldownMs`, default matching the backoff ladder's own 30s ceiling) bounds that
 *   to the same worst-case frequency the internal backoff already accepts as safe — traffic-driven
 *   and time-driven retries end up governed by the same ceiling instead of two different ones.
 */
import { spawn } from "node:child_process";
import path from "node:path";

import { clearAssistantDaemonFailure, recordAssistantDaemonFailure } from "./readiness-state.js";
import { getAgentDaemonPortForSpawnEnv } from "./agent-daemon-port.js";
import { AGENT_DAEMON_EXIT_CODE, createRespawnPolicy } from "#src/assistant/index";
import type { RespawnDecision, RespawnPolicy } from "#src/assistant/index";

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
  /** Injectable clock for `ensureStarted()`'s cooldown — real `Date.now` in production, a
   *  controllable fake in tests. */
  now?: () => number;
  /** Minimum interval between two `ensureStarted()`-triggered re-arms when nothing is currently
   *  running or scheduled (see this file's own header). Defaults to 30s, matching the backoff
   *  ladder's own cap — traffic-driven and time-driven retries then share one worst-case ceiling. */
  onDemandCooldownMs?: number;
}

/** Returned by both `restart()` and `ensureStarted()` — `reason` is present only when `ok` is
 *  `false`. */
export interface DaemonSupervisorActionResult {
  ok: boolean;
  reason?: string;
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
   *
   * Refuses with `{ ok: false, reason: "shutting down" }` once `shutdown()` has run — a manual
   * restart racing the process's own SIGTERM-driven teardown must never resurrect a daemon the
   * process is actively trying to kill. See this file's own header for the terminating-vs-tripped
   * distinction.
   */
  restart(): DaemonSupervisorActionResult;
  /**
   * The on-demand/lazy-start seam — see this file's own header for why automatic respawn alone
   * does not cover every case this closes (a daemon that never started, or a cap that tripped long
   * before anyone showed up). Single-flight and cooldown-guarded; safe to call from a hot request
   * path. Refuses the same way `restart()` does once `shutdown()` has run.
   */
  ensureStarted(): DaemonSupervisorActionResult;
  /** Deliberate shutdown: stops any future automatic respawn AND any future `restart()`/
   *  `ensureStarted()` call, cancels a pending scheduled retry, and kills the currently-running
   *  daemon (process-group kill, falling back to the direct child). Safe to call even when no
   *  daemon is currently running. */
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
  const clock = deps.now ?? Date.now;
  const onDemandCooldownMs = deps.onDemandCooldownMs ?? 30_000;

  let currentChild: SpawnedDaemonProcess | undefined;
  let childHasExited = false;
  let pendingRetryTimer: NodeJS.Timeout | undefined;
  // Distinct from `childHasExited`: this means "an exit right now must NOT be treated as a
  // failure that feeds the respawn policy" — true both during a real process shutdown and, briefly,
  // while `restart()` is replacing a still-live child on purpose.
  let shuttingDown = false;
  // Set once, by `shutdown()`, and never cleared — see this file's own header for why this is a
  // different state than the crash-loop cap tripping, and why `restart()`/`ensureStarted()` must
  // refuse once it is true rather than merely being suppressed like `shuttingDown` above.
  let terminating = false;
  let lastOnDemandAttemptAt: number | undefined;

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
      // Verified directly (not assumed): for a spawn-level failure like ENOENT, Node fires ONLY
      // `"error"` — `"exit"` never follows, and `pid` is `undefined` for the whole lifetime of this
      // child. Without this line, `currentChild` would stay set with `childHasExited` stuck at
      // `false` forever: `restart()`/`ensureStarted()` would then wait indefinitely for an exit
      // event this child can never emit, instead of recognizing "nothing is actually running" and
      // spawning a replacement. Marking it here converges the state to exactly what it already is.
      childHasExited = true;
      const message = error instanceof Error ? error.message : String(error);
      const reasonCode = `failed to start the agent daemon — the assistant will be unavailable: ${message}`;
      console.error(`[daemon-supervisor] ${reasonCode}`);
      recordAssistantDaemonFailure(reasonCode);
      // Still deliberately NOT fed into the respawn policy: a spawn-level error (e.g. the daemon
      // script itself is missing) is not transient. Retrying the same broken command on a backoff
      // would just repeat the identical failure until the crash-loop cap trips anyway — the manual
      // restart seam and `ensureStarted()` are still the correct recovery paths once whatever is
      // actually broken is fixed (or once a request needs the daemon badly enough to try again).
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

  /** Shared by `restart()` and `ensureStarted()`: replace whatever is currently running with a
   *  fresh attempt, waiting out a still-live child's actual exit first (see `restart()`'s own doc
   *  for why spawning alongside it would just collide on the port). */
  function forceFreshSpawn(): void {
    if (currentChild !== undefined && !childHasExited) {
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
  }

  return {
    start() {
      attemptSpawn();
    },
    restart() {
      if (terminating) return { ok: false, reason: "shutting down" };
      cancelPendingRetry();
      policy.reset();
      forceFreshSpawn();
      return { ok: true };
    },
    ensureStarted() {
      if (terminating) return { ok: false, reason: "shutting down" };

      // A daemon is already running, or an attempt is already in flight — single-flight by
      // construction (see this file's own header): nothing more to do.
      if (currentChild !== undefined && !childHasExited) return { ok: true };

      // A retry is already scheduled on its own backoff — let it run rather than accelerating it;
      // the request that called this will simply need to retry once it fires (see header).
      if (pendingRetryTimer !== undefined) return { ok: true };

      // Nothing running, nothing scheduled: either a spawn-level `error` (never retried
      // automatically — see `attemptSpawn`) or the crash-loop/port-conflict cap already tripped.
      // Cooldown-gate re-arming so sustained request volume against a durably broken daemon can't
      // spawn more often than the backoff ladder's own ceiling would ever allow on its own.
      const now = clock();
      if (lastOnDemandAttemptAt !== undefined && now - lastOnDemandAttemptAt < onDemandCooldownMs) {
        return { ok: false, reason: "an on-demand restart was already attempted recently — cooling down before trying again" };
      }
      lastOnDemandAttemptAt = now;
      policy.reset();
      forceFreshSpawn();
      return { ok: true };
    },
    shutdown() {
      terminating = true;
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
 *
 * NOT co-located any more: this file lives in `server/runtime/lifecycle/` (runtime-infrastructure
 * concern), while `agent-daemon-server.ts` moved to `server/inbound/assistant/` (inbound-HTTP-surface
 * concern) in the same `src/server/` split that separated them — a same-directory `path.join` here
 * silently resolved to a nonexistent file the moment that split landed (masked until something
 * actually spawned the daemon and hit `ERR_MODULE_NOT_FOUND`, since nothing type-checks a runtime
 * string path). The `../../inbound/assistant/` offset is symmetric in both trees: `tsc`'s `rootDir`
 * mirrors this whole `server/` subtree unchanged, so `runtime/lifecycle/` -> `inbound/assistant/` is
 * the same two-up-two-down hop under `tsx` and under compiled `dist/`.
 */
export function resolveDaemonScriptPath(): string {
  const isCompiled = import.meta.filename.endsWith(".js");
  return path.join(
    import.meta.dirname,
    "../../inbound/assistant",
    isCompiled ? "agent-daemon-server.js" : "agent-daemon-server.ts",
  );
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
export interface DaemonSpawnEnvInput {
  workspaceId: string;
  /** This process's own already-resolved site root (`deps.ts`'s `siteDir()` for `index.ts`, or the
   *  CLI's `<dir>` argument for `cli/commands/serve.ts`) — see {@link buildDaemonSpawnEnvOverrides}. */
  siteDir: string;
  daemonPortOverride: string | undefined;
}

/**
 * Builds the env overrides layered onto `process.env` for every daemon spawn. Pure — no `spawn()`
 * call — specifically so the "does the child agree with the parent" invariant can be asserted
 * directly against `resolveSiteRoot()` in a test, without spawning a real process.
 *
 * `TOVU_SITE_DIR` (2026-08-29 follow-up fix): the child previously inherited only `process.env`
 * unchanged, so it resolved its OWN site via `resolveSiteRoot()`'s cwd-relative fallback
 * (`<cwd>/sites/tovu-com`) — agreeing with the parent only by the accident of sharing its cwd. Two
 * confirmed live failures: Tovu-Runner's cwd has no `sites/tovu-com` at all (crash-loop), and this
 * repo's own root DOES have one as a fixture, so a `tovu serve <other-dir>` run from here bound its
 * port cleanly while silently attached to the WRONG site's database — the exact wrong-site-data
 * hazard the original port fix closed, just moved one layer down. Omitted (not overridden) whenever
 * the parent's own env already pins `TOVU_SITE_DIR`, same "explicit always wins" discipline as the
 * port override below; `TOVU_CONTENT_DB`/`TOVU_MEDIA_UPLOADS_DIR`/`TOVU_THEMES_DIR` are untouched by
 * this function, so each keeps overriding its own subpath independently regardless (`deps.ts`'s own
 * `?? join(siteDir(), ...)` precedence never even consults `siteDir()` once its own var is set).
 *
 * @complexity O(1).
 */
export function buildDaemonSpawnEnvOverrides(input: DaemonSpawnEnvInput): NodeJS.ProcessEnv {
  return {
    TOVU_WORKSPACE: input.workspaceId,
    TOVU_PARENT_PID: String(process.pid),
    // Self-allocation fix (2026-08-28): when neither `JINI_AGENT_DAEMON_URL` nor
    // `JINI_AGENT_DAEMON_PORT` was set, `agent-daemon-port.ts` picked a free port for THIS process
    // — the child would otherwise fall back to its own module-scope default (4319,
    // `agent-daemon-server.ts:133`) and bind somewhere the proxy above never asked it to listen.
    ...(input.daemonPortOverride !== undefined ? { JINI_AGENT_DAEMON_PORT: input.daemonPortOverride } : {}),
    ...(process.env.TOVU_SITE_DIR === undefined ? { TOVU_SITE_DIR: input.siteDir } : {}),
  };
}

/**
 * Builds the daemon child's own argv — split out of {@link spawnRealDaemonProcessFor} so the
 * discriminating `--workspace <id>` token (see this file's own header, "identity proof before
 * killing") is directly assertable without spawning a real process.
 *
 * The token is inert to the daemon itself: `agent-daemon-server.ts` reads its workspace from
 * `TOVU_WORKSPACE` (`buildDaemonSpawnEnvOverrides`) and never inspects `process.argv` at all
 * (confirmed — no `process.argv` reference anywhere in that file), so appending it changes nothing
 * about how the daemon behaves. Its only job is to give a FUTURE reconciler something to prove
 * identity against, the same way `tovu-server.cjs` already proves a `tovu serve` child's identity
 * from its own `<siteDir> --port <n>` argv — before this token, the daemon's argv was byte-identical
 * across every instance (`[daemonPath]`/`["tsx", daemonPath]`), so an argv-substring proof like
 * Tovu-Runner's `isProjectSidecar` had nothing to match against.
 *
 * @complexity O(1).
 */
export function buildDaemonSpawnArgs(input: { daemonPath: string; workspaceId: string }): string[] {
  return [input.daemonPath, "--workspace", input.workspaceId];
}

/**
 * Proves a live process's argv still belongs to `workspaceId` — an argv-substring match, the same
 * technique as Tovu-Runner's `isProjectSidecar` (`project-provisioner.ts:701-716`), adapted to a seam
 * that has nowhere yet to persist a daemon pid across a restart (see this file's own header). Pure
 * and synchronous: the caller supplies the live command line (e.g. from `ps -o command=`), never an
 * env dump — reading a child's environment via `ps eww`/`pgrep -fl` is banned in this codebase
 * because both can leak another process's live secrets.
 *
 * Checks the token's trailing boundary, not a bare `.includes()`: `--workspace workspace-70` would
 * otherwise satisfy a look-up for `workspace-7` too (a plain substring match), misidentifying a pid
 * that legitimately belongs to a different, similarly-prefixed workspace id.
 *
 * @complexity O(1) — one indexOf plus one boundary check.
 */
export function isDaemonProcessForWorkspace(commandLine: string, workspaceId: string): boolean {
  const token = `--workspace ${workspaceId}`;
  const start = commandLine.indexOf(token);
  if (start === -1) return false;
  const boundaryIndex = start + token.length;
  return boundaryIndex === commandLine.length || /\s/.test(commandLine[boundaryIndex]);
}

function spawnRealDaemonProcessFor(input: DaemonSpawnEnvInput): SpawnedDaemonProcess {
  const daemonPath = resolveDaemonScriptPath();
  const isCompiled = daemonPath.endsWith(".js");
  const env: NodeJS.ProcessEnv = { ...process.env, ...buildDaemonSpawnEnvOverrides(input) };
  const args = buildDaemonSpawnArgs({ daemonPath, workspaceId: input.workspaceId });

  const child = isCompiled
    ? spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"], env, detached: true })
    : spawn("npx", ["tsx", ...args], { stdio: ["ignore", "pipe", "pipe"], env, detached: true });

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
// the boot-readiness promises first). Both `restartAssistantDaemon()` (a future admin "Restart
// assistant" action) and `ensureAssistantDaemonStarted()` (the on-demand/lazy-start seam —
// `server/modules/assistant.ts`'s daemon-proxy call site, once wired) are re-exported through
// `src/assistant/index.ts`'s barrel and report back whatever `{ ok, reason }` they return; no other
// wiring is required on this side.
// ---------------------------------------------------------------------------------------------
let singleton: DaemonSupervisor | undefined;

/**
 * Post-shutdown spawn race fix (2026-08-28 dispatch). `shutdownAssistantDaemon()` used to be exactly
 * `singleton?.shutdown()` — a no-op whenever `singleton` was still `undefined`. `cli/commands/
 * serve.ts` kicks off `startAssistantDaemon()` from inside an un-awaited `Promise.all([...]).then(
 * ...)` chain (waiting on first-boot readiness — see that file's own comment on why), so a SIGTERM
 * arriving before that chain settles could call `shutdownAssistantDaemon()` while `singleton` was
 * still `undefined`, then have the pending `.then()` callback call `startAssistantDaemon()` moments
 * later with nothing left to stop it — spawning a fresh, `registerProcessSignalHandlers: false`
 * (i.e. no signal handlers of its own) daemon child that nothing would ever reap.
 *
 * Lives on the module singleton wrapper, not in `serve.ts` (or any other caller), so every current
 * and future caller of `startAssistantDaemon()`/`shutdownAssistantDaemon()` is protected by
 * construction rather than needing to remember its own guard — the same "fix once, structurally,
 * where the invariant actually lives" reasoning `process-error-guards.ts`'s own header uses for the
 * unhandled-rejection guard. Set exactly once, by `shutdownAssistantDaemon()`, and never cleared for
 * the life of the process — like `terminating` on a `DaemonSupervisor` instance (see this file's own
 * header), there is no scenario where a process that has already been asked to shut down should ever
 * legitimately start a daemon afterward.
 */
let shutdownRequested = false;

/**
 * Test-only reset of this module's singleton state (mirrors `resetToolContributorsForTests` /
 * `resetFederatedMcpPresetsForTests` — same "process-wide module state must not leak between
 * `node:test` cases in the same file" convention). No production caller ever needs this: a real
 * process boots once and either starts the daemon or doesn't.
 */
export function resetAssistantDaemonSingletonForTests(): void {
  singleton = undefined;
  shutdownRequested = false;
}

export interface StartAssistantDaemonOptions {
  /**
   * Default `true` — `index.ts`'s original, unchanged behavior: this call registers its own
   * `process.on(SIGINT/SIGTERM/SIGHUP/"exit", ...)` handlers, and the signal handlers call
   * `process.exit(0)` themselves once the daemon is torn down.
   *
   * `cli/commands/serve.ts` (2026-08-28 dispatch) passes `false`: that command already owns its own
   * BR-07 graceful-shutdown sequence, registered via `process.once(...)` on the SAME two signals.
   * Node invokes every registered listener for a signal, not just the first — a second listener
   * here calling `process.exit(0)` immediately would race `serve.ts`'s graceful drain (finish the
   * in-flight request, close the db, then exit) and could cut it short before it completes. A
   * caller that opts out this way must call {@link shutdownAssistantDaemon} itself from its own
   * shutdown sequence instead, or the daemon child is leaked as an orphan.
   */
  registerProcessSignalHandlers?: boolean;
  /**
   * Test seam only. Overrides the real {@link spawnRealDaemonProcessFor} the module-singleton
   * wrapper otherwise builds internally, so a test can assert whether a spawn attempt happened at
   * all without ever touching `child_process` or spawning a real OS process (this repo's test
   * scripts do not pass `--experimental-test-module-mocks`, so `node:test`'s `mock.module()` is not
   * an available alternative here — see `resolve-test-agent-outcome.ts`'s header for the same
   * constraint). No production caller passes this; mirrors {@link DaemonSupervisorDeps.spawnDaemonProcess}
   * one layer up.
   */
  spawnDaemonProcess?: (input: DaemonSpawnEnvInput) => SpawnedDaemonProcess;
}

/**
 * Start the assistant daemon supervisor for this process boot. Safe to call only once — a second
 * call is ignored (logged, not thrown) rather than silently spawning a second supervisor that
 * would fight the first one for the same port and the same `process.on(signal, ...)` slot.
 */
export function startAssistantDaemon(
  input: { workspaceId: string; siteDir: string },
  options: StartAssistantDaemonOptions = {},
): void {
  if (shutdownRequested) {
    console.error("[daemon-supervisor] startAssistantDaemon called after shutdownAssistantDaemon() already ran this process boot — refusing to spawn a daemon the process is already tearing down");
    return;
  }

  if (singleton !== undefined) {
    console.error("[daemon-supervisor] startAssistantDaemon called more than once this process boot — ignoring");
    return;
  }

  // Resolved once, here, rather than inside `spawnDaemonProcess` — `ensureAgentDaemonPortResolved()`
  // (called by both real boot paths before `createApp()`) has already settled by the time this runs,
  // so the same value this process's own proxy is using is what gets threaded into the child's env
  // and into `daemonPort` (used only for this supervisor's human-readable failure text).
  const daemonPortOverride = getAgentDaemonPortForSpawnEnv();
  const spawnDaemonProcess = options.spawnDaemonProcess ?? spawnRealDaemonProcessFor;
  const supervisor = createDaemonSupervisor({
    spawnDaemonProcess: () => spawnDaemonProcess({ workspaceId: input.workspaceId, siteDir: input.siteDir, daemonPortOverride }),
    daemonPort: daemonPortOverride,
  });
  singleton = supervisor;
  supervisor.start();

  if (options.registerProcessSignalHandlers === false) return;

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

/**
 * The explicit teardown seam for a caller that opted out of this module's own signal handling (see
 * {@link StartAssistantDaemonOptions.registerProcessSignalHandlers}) — `cli/commands/serve.ts`'s
 * BR-07 shutdown calls this instead. A no-op if the daemon was never started this process boot.
 */
export function shutdownAssistantDaemon(): void {
  // Set unconditionally, BEFORE the `singleton?.shutdown()` no-op-when-absent check below — see
  // `shutdownRequested`'s own doc for why this must latch even when no supervisor exists yet.
  shutdownRequested = true;
  singleton?.shutdown();
}

export type RestartAssistantDaemonResult = DaemonSupervisorActionResult;

/**
 * The manual restart seam an admin action calls. Returns a result rather than throwing so a route
 * handler can report it back to the caller directly (`{ ok: true }`, or `{ ok: false, reason }` —
 * either because the daemon was never started this boot, or because the process is currently
 * shutting down; see `DaemonSupervisor.restart()`'s own doc for why that second case must refuse).
 */
export function restartAssistantDaemon(): RestartAssistantDaemonResult {
  if (singleton === undefined) {
    return { ok: false, reason: "the assistant daemon was never started this process boot" };
  }
  return singleton.restart();
}

export type EnsureAssistantDaemonStartedResult = DaemonSupervisorActionResult;

/**
 * The on-demand/lazy-start seam — see this file's own header for the full rationale. Intended
 * caller: `server/modules/assistant.ts`'s daemon-proxy code, at the point it discovers the daemon
 * is unreachable, so a request that needs the assistant can trigger recovery itself instead of the
 * assistant staying down until an operator notices and either restarts Tovu or presses the manual
 * restart action. Single-flight and cooldown-guarded — safe to call on every such request, not
 * just the first one.
 */
export function ensureAssistantDaemonStarted(): EnsureAssistantDaemonStartedResult {
  if (singleton === undefined) {
    return { ok: false, reason: "the assistant daemon was never started this process boot" };
  }
  return singleton.ensureStarted();
}
