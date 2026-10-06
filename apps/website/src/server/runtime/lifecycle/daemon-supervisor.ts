/**
 * Tovu daemon wiring over @jini-ai/sidecar/supervisor and its /node process adapter.
 * Tovu owns environment,
 * workspace identity, readiness, log wording and process signal handlers; Jini owns retries,
 * single-flight replacement, terminal shutdown and production process-tree cleanup.
 *
 * Keep this assembly separate from the entrypoint, whose module-load boot prevents direct
 * unit imports. Register signals once in the singleton wrapper: installing them per respawn
 * would accumulate process listeners. Terminal shutdown must refuse manual recovery, while
 * a tripped crash cap must permit it. On-demand recovery also covers missing-script spawn
 * failures and old trips; the host's 30s cooldown prevents request traffic from becoming a
 * respawn storm. The package publishes each child synchronously to keep recovery single-flight.
 *
 * Identity proof before killing: daemon argv carries --workspace so a future reconciler
 * can verify an instance from its live command line, without reading an environment dump
 * that might expose secrets. Registry ownership and production tree cleanup belong to the
 * Node adapter; this host supplies the site-scoped registry path and launch identity.
 */
import { isDaemonLifecycleLogQuiet } from "./daemon-lifecycle-log.js";
import { execFileSync } from "node:child_process";
import {
  createNodeDaemonProcessAdapter,
  createNodeSupervisorScheduler,
} from "@jini-ai/sidecar/supervisor/node";
import { createDaemonSupervisor as createSidecarSupervisor } from "@jini-ai/sidecar/supervisor";
import type { DaemonSupervisorRequired, SpawnedDaemonProcess as SidecarDaemonProcess, SupervisorScheduler } from "@jini-ai/sidecar/supervisor";
import path from "node:path";

import { clearAssistantDaemonFailure, recordAssistantDaemonFailure } from "./readiness-state.js";
import { getAgentDaemonPortForSpawnEnv } from "./agent-daemon-port.js";
import { createAssistantDaemonRegistry } from "./assistant-daemon-registry.js";
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
  /** Caller-owned Node child factory. The production singleton uses Jini's Node adapter instead. */
  spawnDaemonProcess: () => SpawnedDaemonProcess;
  /** Defaults to a fresh {@link createRespawnPolicy} instance with production settings — pass an
   *  override in tests to shrink the backoff/cap thresholds so retries happen in milliseconds. */
  policy?: RespawnPolicy;
  /** Timer port for the package retry loop; defaults to the Node scheduler. */
  scheduler?: SupervisorScheduler;
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
  /** Platform for the injected Node-child termination seam. */
  // The platform seam makes the Windows tree-kill branch assertable on any test host.
  platform?: NodeJS.Platform;
  /** win32-only tree-kill for the injected Node-child seam instead of the POSIX process-group signal
   *  (`process.kill(-pid, "SIGTERM")`), which Windows has no equivalent for. Defaults to
   *  {@link taskkillTree} (`taskkill /pid <pid> /T /F`); never called on POSIX. */
  killTree?: (pid: number) => void;
  /** When `true`, the ROUTINE lifecycle lines — the first spawn and a deliberate (shutdown/restart)
   *  exit — are not printed; an unexpected exit and every respawn still are, since those are what an
   *  operator correlates a dead chat against. Defaults to {@link isDaemonLifecycleLogQuiet} (`TOVU_DAEMON_LIFECYCLE_LOG=off`),
   *  which `npm start` (`development/scripts/start.mjs`) sets so its output is one URL line. */
  quietRoutineLifecycle?: boolean;
  /** Where lifecycle breadcrumbs go. Defaults to `console.log`; injected in tests. */
  log?: (line: string) => void;
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

/**
 * Default Windows tree-kill for the caller-owned Node-child seam; production tree-stop is Jini's.
 * Windows has no POSIX process groups. Killing only the npx/tsx launcher would orphan the
 * daemon beneath it, so taskkill /T walks its descendants instead.
 *
 * @param pid the child's own pid (never negated — there is no process-group id to negate on win32).
 * @complexity One OS command; the OS walks the process tree.
 */
function taskkillTree(pid: number): void {
  execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
}

/** Same reasoning `index.ts` used for EADDRINUSE specifically: naming the real cause here is what
 *  turns an unexplained "exited unexpectedly (code 1)" into something an operator can act on. */
function computeExitReasonCode(code: number | null, signal: NodeJS.Signals | null, daemonPort: string): string {
  if (code === AGENT_DAEMON_EXIT_CODE.PORT_IN_USE) {
    return `agent daemon could not bind 127.0.0.1:${daemonPort} — address already in use`;
  }
  return `agent daemon exited unexpectedly (code ${code}, signal ${signal ?? "none"})`;
}

/** Tovu's final readiness wording distinguishes repeated bind failures from general crash loops. */
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
 * Translate a host Node child (including existing injected doubles) into Jini's process port.
 * @complexity O(1) wrapping; subscriptions and signals delegate directly to the child.
 */
function adaptDaemonProcess({ child }: { child: SpawnedDaemonProcess }): SidecarDaemonProcess {
  return {
    get pid() { return child.pid; },
    on(input) {
      if (input.event === "exit") child.on("exit", (code, signal) => input.listener({ code, signal }));
      else child.on("error", (error) => input.listener({ error }));
    },
    kill(_required, { signal } = {}) { return child.kill(signal); },
  };
}

/** Bind the package's spawn-failure wording to Tovu's existing readiness message. */
function formatFailureReason(reason: string): string {
  const prefix = "failed to start daemon: ";
  if (reason.startsWith(prefix)) {
    return `failed to start the agent daemon — the assistant will be unavailable: ${reason.slice(prefix.length)}`;
  }
  return reason;
}

type DaemonProcessPorts = Pick<DaemonSupervisorRequired, "spawnDaemonProcess" | "terminateProcess">;
type DaemonHostOptions = Omit<DaemonSupervisorDeps, "spawnDaemonProcess">;

/**
 * Supply Tovu's readiness and wording ports to Jini's supervisor without reproducing its state.
 * @param ports Explicit spawn and termination effects, owned by the host assembly.
 * @param options Tovu clock, retry profile, cooldown, scheduler and log settings.
 * @returns Lifecycle methods with Tovu's existing action-result wording.
 * @throws RangeError for invalid retry/cooldown budgets.
 * @complexity O(1) assembly/event formatting, excluding the injected policy and process ports.
 */
function bindDaemonSupervisor(ports: DaemonProcessPorts, options: DaemonHostOptions = {}): DaemonSupervisor {
  const clock = options.now ?? Date.now;
  const daemonPort = options.daemonPort ?? process.env.JINI_AGENT_DAEMON_PORT ?? "4319";
  const log = options.log ?? ((line: string) => console.log(line));
  const supervisor = createSidecarSupervisor({
    ...ports,
    policy: options.policy ?? createRespawnPolicy({ now: clock }),
    now: clock,
    scheduler: options.scheduler ?? createNodeSupervisorScheduler({}),
    classifyExit: ({ code, signal }) => ({
      isPortConflict: code === AGENT_DAEMON_EXIT_CODE.PORT_IN_USE,
      reason: computeExitReasonCode(code, signal, daemonPort),
    }),
    failureReporter: {
      clear: clearAssistantDaemonFailure,
      record: ({ reason }) => recordAssistantDaemonFailure(formatFailureReason(reason)),
    },
    logger: {
      emit(event) {
        if (event.type === "failure") {
          console.error(`[daemon-supervisor] ${formatFailureReason(event.reason)}`);
          return;
        }
        const at = new Date(event.at).toISOString();
        if (event.type === "spawn") {
          log(`[daemon-supervisor] ${at} spawned agent daemon pid=${event.pid ?? "unknown"}`);
          return;
        }
        log(`[daemon-supervisor] ${at} agent daemon pid=${event.pid ?? "unknown"} exited (code=${String(event.code)}, signal=${String(event.signal)}, deliberate=${event.deliberate}) — any run in flight died with it`);
      },
    },
  }, {
    onDemandCooldownMs: options.onDemandCooldownMs ?? 30_000,
    quietRoutineLifecycle: options.quietRoutineLifecycle ?? isDaemonLifecycleLogQuiet(),
    formatGiveUp: ({ decision, lastReason }) => buildGiveUpReasonCode(decision, lastReason, daemonPort),
  });
  return {
    ...supervisor,
    ensureStarted() {
      const result = supervisor.ensureStarted();
      if (result.reason === "cooling down before trying again") {
        return { ok: false, reason: "an on-demand restart was already attempted recently — cooling down before trying again" };
      }
      return result;
    },
  };
}

/**
 * Keep the existing injected Node-child seam for host callers and lifecycle tests.
 * Production uses Jini's complete Node process-tree adapter below; this seam keeps the caller's
 * platform/tree-kill port and translates subscriptions rather than owning any retry state.
 * @param deps Host child factory and optional policy/platform/log settings.
 * @returns A package supervisor bound to the existing host ports.
 * @complexity O(1) assembly, excluding injected ports and retry-window pruning.
 */
export function createDaemonSupervisor(deps: DaemonSupervisorDeps): DaemonSupervisor {
  const platform = deps.platform ?? process.platform;
  const killTree = deps.killTree ?? taskkillTree;
  return bindDaemonSupervisor({
    spawnDaemonProcess: () => adaptDaemonProcess({ child: deps.spawnDaemonProcess() }),
    terminateProcess({ child }) {
      if (child.pid === undefined) return;
      try {
        if (platform === "win32") killTree(child.pid);
        else process.kill(-child.pid, "SIGTERM");
      } catch {
        try { child.kill({}, { signal: "SIGTERM" }); } catch { /* already gone */ }
      }
    },
  }, deps);
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

/** Host-owned site/workspace identity supplied consistently across daemon respawns. */
export interface DaemonSpawnEnvInput {
  workspaceId: string;
  /** This process's own already-resolved site root (`deps.ts`'s `siteDir()` for `index.ts`, or the
   *  CLI's `<dir>` argument for `cli/commands/serve.ts`) — see {@link buildDaemonSpawnEnvOverrides}. */
  siteDir: string;
  daemonPortOverride: string | undefined;
  /** A PGlite site's owner socket (`SiteStore.pgliteSocketPath`), passed as `TOVU_PG_SOCKET` so the
   *  daemon, a store client, connects to the socket this process serves. Absent on SQLite/Postgres. */
  pgSocketPath?: string;
}

/**
 * Builds the env overrides layered onto `process.env` for every daemon spawn. Pure — no `spawn()`
 * call — specifically so the "does the child agree with the parent" invariant can be asserted
 * directly against `resolveSiteRoot()` in a test, without spawning a real process.
 *
 * `TOVU_SITE_DIR` (2026-08-29 follow-up fix): the child previously inherited only `process.env`
 * unchanged, so it resolved its OWN site via `resolveSiteRoot()`'s cwd-relative fallback
 * (`<cwd>/sites/tovu-dev`) — agreeing with the parent only by the accident of sharing its cwd. Two
 * confirmed live failures: Tovu-Runner's cwd has no `sites/tovu-dev` at all (crash-loop), and this
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
    ...(input.pgSocketPath !== undefined ? { TOVU_PG_SOCKET: input.pgSocketPath } : {}),
  };
}

/**
 * Builds the daemon child's own argv — split out of {@link createRealDaemonProcessPorts} so the
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

/**
 * Bind current Tovu launch settings to the package Node adapter. Each spawn gets a fresh env
 * snapshot, while its registry stays scoped to the resolved site for the whole supervisor boot.
 * The daemon must write this record only after listening (r15 entrypoint wiring).
 * Jini's writer fsyncs the file and directory and preserves destination mode; a directory-sync
 * rejection can occur after replacement is visible. Publication errors belong to that child
 * boot path, rather than triggering a second write here before the daemon has bound its port.
 * @param input Workspace, resolved site, proxy port and optional PGlite socket.
 * @returns Process ports; construction never starts a process or writes a registry record.
 * @complexity O(e) environment copying per spawn for e variables; package tree-stop is O(p) processes.
 */
function createRealDaemonProcessPorts(input: DaemonSpawnEnvInput): DaemonProcessPorts {
  const daemonPath = resolveDaemonScriptPath();
  const args = buildDaemonSpawnArgs({ daemonPath, workspaceId: input.workspaceId });
  const { registryPath, registry } = createAssistantDaemonRegistry({ siteDir: input.siteDir }, {});
  function createProcessAdapter() {
    const isCompiled = daemonPath.endsWith(".js");
    return createNodeDaemonProcessAdapter({
      command: isCompiled ? process.execPath : "npx",
      args: isCompiled ? args : ["tsx", ...args],
      cwd: process.cwd(),
      // Every respawn binds the same workspace and parent pid (D10/watchdog contract),
      // while refreshing process.env so repaired launch configuration can take effect.
      env: {
        ...process.env,
        ...buildDaemonSpawnEnvOverrides(input),
        TOVU_AGENT_DAEMON_REGISTRY_PATH: registryPath,
      },
      registry,
    }, { stdout: process.stdout, stderr: process.stderr, platform: process.platform });
  }
  // Termination uses the same registry identity; launch env is refreshed only when spawning.
  const cleanupAdapter = createProcessAdapter();
  return {
    spawnDaemonProcess: () => createProcessAdapter().spawnDaemonProcess(),
    terminateProcess: ({ child }) => cleanupAdapter.terminateProcess({ child }),
  };
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
   * Test seam only. Overrides the real {@link createRealDaemonProcessPorts} the module-singleton
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
  input: { workspaceId: string; siteDir: string; pgSocketPath?: string },
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
  const spawnEnv: DaemonSpawnEnvInput = {
    workspaceId: input.workspaceId,
    siteDir: input.siteDir,
    daemonPortOverride,
    pgSocketPath: input.pgSocketPath,
  };
  let supervisor: DaemonSupervisor;
  if (options.spawnDaemonProcess !== undefined) {
    const spawnDaemonProcess = options.spawnDaemonProcess;
    supervisor = createDaemonSupervisor({
      spawnDaemonProcess: () => spawnDaemonProcess(spawnEnv),
      daemonPort: daemonPortOverride,
    });
  } else {
    supervisor = bindDaemonSupervisor(createRealDaemonProcessPorts(spawnEnv), { daemonPort: daemonPortOverride });
  }
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
