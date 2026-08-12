import { spawn } from "node:child_process";
import path from "node:path";

import { createApp, createRouteDeps } from "./server/app";
import { createSqliteRouteDeps, defaultContentDbPath } from "./server/deps";
import { CAPABILITY_INVENTORY } from "./server/capability-inventory";
import { runProductionReadinessGate } from "./server/production-readiness-gate";
import { resolveRuntimeMode } from "#src/core/runtime-mode";
import { runBootLifecycle } from "./server/boot-lifecycle";
import { buildBootModules } from "./server/bootstrap";
import { clearAssistantDaemonFailure, recordAssistantDaemonFailure, setReadinessSnapshot } from "./server/readiness-state";
import { registerPluginSdkResolver } from "./server/boot/plugin-sdk-resolver";
import { ensureAgentDaemonToken } from "./assistant/daemon-auth";
import { AGENT_DAEMON_EXIT_CODE } from "./assistant/daemon-exit-codes";

/**
 * @file Process entrypoint.
 *
 * Starts the HTTP server for the local runtime.
 *
 * Storage: SQLite content.db by default (persists across restarts). Set
 * `TOVU_DB=memory` for an ephemeral in-memory store (re-seeded every boot).
 * Override the db location with `TOVU_CONTENT_DB=/path/to/content.db`.
 *
 * SPIKE: on the SQLite runtime, the sample Tier-3 store plugin is activated at boot — it declares
 * its own table through the never-brick dataModule seam, seeds products, and surfaces them at /store.
 */
const port = Number(process.env.PORT ?? 3000);
const useMemory = process.env.TOVU_DB === "memory";

/**
 * Self-termination watchdog, symmetric to `agent-daemon-server.ts`'s own `startParentWatchdog()`
 * one level up (`ADS-memory/reports/analysis/2026-08-05-symmetric-watchdog.md` has the full
 * measurement trail this comment summarizes).
 *
 * That daemon watchdog closes "the daemon becomes an orphan when THIS process dies without
 * running `reap()`". This is the other half: THIS process becomes the orphan when whatever was
 * supposed to be driving it dies without ever sending it a catchable signal — measured three times
 * independently for one concrete trigger (an external kill of Playwright's own top-level CLI
 * process bypasses its `teardown()`/`gracefulShutdown` entirely; see the root-cause doc's Round
 * 2/4) and confirmed live for every agent that kills its own runs, which this repo's own traps say
 * is routine, not a corner case.
 *
 * Two independent checks, because measurement showed one pid source does not cover every real
 * launch context:
 *
 * 1. **`process.ppid` liveness (always on, no env var).** Node does not cache `process.ppid` at
 *    startup — it re-reads the OS's current parent pid on every access, and flips the moment this
 *    process is reparented (POSIX: to pid 1 on macOS/most Linux; to the nearest registered
 *    subreaper where one exists — comparing against the value recorded at boot, rather than
 *    testing `=== 1`, is what makes this correct in both cases without needing to know which one
 *    applies). Verified directly, twice: a child spawned the same way Playwright spawns its
 *    `webServer` (`shell: true`, per `playwright/lib/runner/index.js:841`) logged its own
 *    `process.ppid` flipping from the real parent's pid to the reparent target within ~300ms of
 *    the parent dying — once via a plain `process.exit()`, once via an actual external `kill -9`
 *    on the parent (the literal shape of the still-open gap). No ambiguous-error case exists here
 *    the way `EPERM` vs `ESRCH` is ambiguous for `kill(pid, 0)` below: reading `process.ppid` never
 *    fails or needs a permission check, and reparenting is never transient (the original parent
 *    cannot come back to life under the same pid), so there is no false-positive path — every
 *    observed change is a real, permanent parent death. It also has no PID-reuse blind spot the
 *    way `kill(pid, 0)` does: this never probes an external pid's continued existence at all, it
 *    only compares the kernel's own live record of THIS process's parent against what was recorded
 *    at boot, so a coincidental pid reuse elsewhere cannot spoof it either direction.
 *
 *    Measured, this check's DIRECT OS parent is the real driving process in three of the four
 *    launch contexts investigated: Playwright's `webServer` (confirmed via `ps` — `shell: true`
 *    plus a single trailing simple command makes the shell exec-replace itself into `node`, so
 *    this process's ppid IS Playwright's own top-level CLI process directly, no intermediate `sh`
 *    hop); a bare/manual `node --import tsx src/index.ts` from an interactive shell (same one-hop
 *    shape — the shell IS the parent); and CI, where this repository's own `.github/workflows/
 *    ci.yml` never boots this file at all today (`npm test` is the plain unit-test runner, no
 *    Playwright/e2e step exists in CI), so there is nothing to verify there yet, not merely
 *    something unverified.
 *
 * 2. **`TOVU_DEV_SUPERVISOR_PID` (opt-in, mirrors the daemon's own `TOVU_PARENT_PID` exactly).**
 *    The one launch context measured to need it: `npm run dev`'s `tsx watch`. Confirmed via `ps`
 *    that `npx`/`tsx watch` are themselves Node-based CLI wrappers that do NOT exec-replace, so
 *    this process's real OS ppid there is the `tsx watch` supervisor two hops below `dev.mjs`, not
 *    `dev.mjs` itself — and that supervisor does not die just because `dev.mjs` does. Reproduced
 *    the resulting gap directly, isolated: booted the real `dev.mjs` tree, `kill -9`'d only
 *    `dev.mjs`'s own pid, and the API and daemon were both still alive and bound, unchanged, 2s
 *    later — the exact same shape as the Playwright gap, one supervisor layer up. `dev.mjs` now
 *    sets this var to its own pid for exactly this check; same `ESRCH`-confirms-death,
 *    everything-else-is-inconclusive logic as the daemon's own watchdog, including its accepted
 *    PID-reuse limitation — not closed here for the same reason it was not closed there: no
 *    portable, cheap Node API exists to read an arbitrary pid's start time, for a benefit that is
 *    marginal given the short poll window and low pid churn on a single dev machine.
 *
 * `TOVU_DISABLE_PARENT_WATCHDOG=1` is an escape hatch for a launch shape neither this file nor the
 * analysis doc enumerated: intentional daemonization (e.g. `nohup ... &` followed by logout, or any
 * double-fork pattern) deliberately arranges for this process to outlive the parent that started
 * it — that is that operator's explicit intent, not an orphan to clean up, and check #1 above
 * cannot tell the two apart on its own. Checked this repo for an existing such launch path before
 * relying on that distinction mattering here: no Dockerfile, docker-compose, systemd `.service`,
 * launchd `.plist`, Procfile, or deploy script exists in this repository, and nothing greps for
 * `nohup`/`daemonize`/`setsid` applied TO this file (only this file and `dev.mjs` daemonizing their
 * OWN children, which is a different relationship). Production boots via `npm start` -> bare `node
 * dist/src/index.js`, no wrapper. That rules out what is committed here; it says nothing about how
 * an operator might run this on a bare VM outside this repo, which is exactly why the escape hatch
 * exists unconditionally rather than being gated on what this search did or didn't find.
 *
 * Does not fight `tsx watch`'s own restart-on-save cycle: that delivers a real, catchable signal to
 * the OLD process first (already handled by the existing `SIGINT`/`SIGTERM`/`SIGHUP` handlers in
 * `spawnAgentDaemon()` below), and each fresh incarnation of this file gets its own fresh
 * `bootPpid`/interval at module load — no state carries over from the process being replaced.
 *
 * Windows: not verified. Playwright's own `attemptToGracefullyClose()` throws unconditionally on
 * `win32` for this exact family of behavior (root-cause doc, quoting `playwright/lib/runner/
 * index.js`) — this inherits that same "not supported" posture rather than assuming parity.
 *
 * `process.exit()` from inside this function's interval callback fires the existing
 * `process.on("exit", reap)` listener `spawnAgentDaemon()` registers below (a standard Node
 * guarantee already relied on by this file's own SIGINT/SIGTERM/SIGHUP handlers), so a self-exit
 * here cleans up the agent daemon exactly like every other termination path already does — no
 * separate reap call needed.
 */
function startOwnParentWatchdog(): void {
  if (process.env.TOVU_DISABLE_PARENT_WATCHDOG === "1") {
    console.log("[index] TOVU_DISABLE_PARENT_WATCHDOG=1 — parent watchdog disabled");
    return;
  }

  const bootPpid = process.ppid;

  // Confirms the recorded parent was actually alive at the instant we captured it — closes a real
  // race, found by probe rather than reasoned about: `node --import tsx` takes several real
  // seconds to finish transforming/loading this module before ANY of this file's own code runs
  // (measured live: ~4-8s), and no JS on earth can run earlier than that. If the real parent dies
  // during that window, `process.ppid` already reads the reparent target by the time this line
  // executes, and adopting THAT as the "normal" baseline would mean the comparison below can never
  // fire again — silently defeating the whole watchdog for exactly the boot-time version of the
  // failure it exists to catch. Same ESRCH-confirms-death, everything-else-is-inconclusive logic as
  // every other check in this family: only a confirmed absence is treated as death.
  try {
    process.kill(bootPpid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") {
      console.error(`[index] parent process ${bootPpid} was already gone before this process finished booting — self-terminating`);
      process.exit(1);
      return;
    }
  }

  let devSupervisorPid: number | undefined;
  const rawSupervisorPid = process.env.TOVU_DEV_SUPERVISOR_PID;
  if (rawSupervisorPid !== undefined) {
    const parsed = Number(rawSupervisorPid);
    if (Number.isInteger(parsed) && parsed > 0) {
      devSupervisorPid = parsed;
    } else {
      console.error(`[index] TOVU_DEV_SUPERVISOR_PID="${rawSupervisorPid}" is not a valid pid — that check is disabled`);
    }
  }

  // Same 3s interval as the daemon's own watchdog, same rationale: fast enough that a leaked
  // process closes long before it could collide with a later boot attempt, slow enough to cost
  // nothing meaningful against a process spending most of its time idle between real requests.
  // Not `.unref()`'d, for the same reason as the daemon's own timer: this interval's entire job is
  // to keep watching for as long as its parent is, and letting it fall out of the event loop early
  // would undermine that.
  const POLL_INTERVAL_MS = 3_000;
  setInterval(() => {
    if (process.ppid !== bootPpid) {
      console.error(`[index] parent process ${bootPpid} is gone (reparented to ${process.ppid}) — self-terminating`);
      process.exit(1);
      return;
    }
    if (devSupervisorPid !== undefined) {
      try {
        // See this function's own doc: signal 0 has no side effect, it only answers "does this pid
        // still exist".
        process.kill(devSupervisorPid, 0);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ESRCH") {
          // Anything other than "no such process" (e.g. a transient EPERM) is inconclusive, not a
          // confirmed death — skip this poll rather than risk a false-positive self-kill on a
          // supervisor that is actually still alive. Mirrors the daemon watchdog's own logic.
          return;
        }
        console.error(`[index] dev supervisor process ${devSupervisorPid} is gone — self-terminating`);
        process.exit(1);
      }
    }
  }, POLL_INTERVAL_MS);
}
// Armed as early as possible, before any of the slower boot work in `main()` below — so a parent
// death during this process's own boot is caught too, not only once it has reached steady state.
// Same placement rationale as the daemon's own `startParentWatchdog()` call.
startOwnParentWatchdog();

/**
 * SPEC-022 REQ-03/W-001 — must run and pass before any composition/route-registration work
 * starts. Deliberately placed here (the actual process entrypoint), not inside `deps.ts`'s
 * `createSqliteRouteDeps()` / `app.ts`'s `createApp()`: both of those are synchronous functions
 * called from hundreds of existing hermetic tests, and forcing them async (or awaiting a gate
 * before they can return) would be a wide, risky, untested signature change to every one of
 * those call sites — INV-06 forbids exactly that kind of collateral behavior change. `index.ts`
 * is the one real top-level boot path (never imported by a test), so it is the safe place to
 * enforce "never bind the listening socket" without touching any tested surface.
 *
 * `envSnapshot`'s three checks are a disclosed, best-effort implementation, not exhaustively
 * specified by SPEC-022 (no test exercises the real heuristics, only injected fixture values):
 * - `hasDevSecretPlaceholder`: true when `ANALYTICS_ROOT_KEY_SEED` is unset, since
 *   `registerAnalyticsIngestRoute`'s wiring in `app.ts` falls back to the literal dev placeholder
 *   `"dev-only-insecure-seed"` whenever that env var is absent.
 * - `hasLocalhostEgressAllowance`: not yet detectable here — `deps.ts` seeds a hardcoded
 *   `localhost`/`example.com` origin+egress-allowlist unconditionally, with no env-var escape
 *   hatch, so this check cannot yet distinguish a real deploy from a dev one. Flagged as a real
 *   gap for whoever scopes the origin-seed-becomes-configurable follow-up; not fixed here.
 * - `hasAlwaysOnAnalyticsStub`: false as of ADR-046 Phase 1's analytics slice (2026-07-16) —
 *   `deps.ts`'s `createSqliteRouteDeps()` now unconditionally wires the durable `SqliteBufferSink`,
 *   mirroring the "analytics" capability-inventory entry's `hasDurableAdapter: true`.
 */
async function runBootGateOrExit(): Promise<void> {
  const mode = resolveRuntimeMode();
  if (mode !== "production") return;

  const result = await runProductionReadinessGate({
    mode,
    inventory: CAPABILITY_INVENTORY,
    envSnapshot: {
      hasDevSecretPlaceholder: !process.env.ANALYTICS_ROOT_KEY_SEED,
      hasLocalhostEgressAllowance: false,
      hasAlwaysOnAnalyticsStub: false,
    },
  });

  if (!result.ok) {
    for (const failure of result.failures) {
      console.error(`[production-readiness-gate] ${failure.code}: ${failure.message}`);
    }
    console.error("Refusing to boot in production mode — see failures above.");
    process.exit(1);
  }
}

async function main(): Promise<void> {
  // Mints `TOVU_AGENT_DAEMON_TOKEN` (unless the operator already set one) into this process's env
  // so `spawnAgentDaemon()` — called much later, from inside `app.listen()`'s callback — hands it
  // to the daemon child through the inherited env, and so `server/modules/assistant.ts`'s proxy
  // can read it at request time. Must precede the spawn; placed first because it is the one boot
  // step with no dependency on anything at all. It is a single synchronous env assignment (no
  // import, no await, no I/O), so it does not weaken `registerPluginSdkResolver`'s ordering
  // guarantee documented immediately below — there is still no `await` point ahead of it.
  ensureAgentDaemonToken();

  // SPEC-005 (ADR-005-ARCH, CIC U-002, ESCALATE_SECURITY): must run synchronously, before any
  // other boot step, and unconditionally before `createApp(deps)` wires any route or before any
  // code path could reach `loadPlugin()`'s dynamic `import()`. Placed first in `main()` — even
  // before `runBootGateOrExit()` — so no `await` point exists between process start and this
  // registration where a plugin import could theoretically become reachable first. Mirrors this
  // file's own `runBootGateOrExit` placement rationale: `index.ts` is the one real top-level boot
  // path (never imported by a test), so it is the safe place to enforce this ordering without
  // touching `app.ts`/`deps.ts`'s synchronous, widely-tested call signatures (W-001).
  registerPluginSdkResolver();

  await runBootGateOrExit();

  const deps = useMemory ? createRouteDeps() : createSqliteRouteDeps();

  // ADR-046 Phase 3 (SPEC-031): the boot-module composition itself now lives in
  // `server/bootstrap.ts` (unit-testable, unlike this file — see the note above on why
  // boot-only enforcement stays here while the composable logic does not).
  const bootResult = await runBootLifecycle(buildBootModules(deps, { useMemory, defaultContentDbPath }));
  setReadinessSnapshot(bootResult);
  if (!bootResult.ok) {
    for (const module of bootResult.modules) {
      if (module.criticality === "critical" && module.lifecycle.status !== "ready") {
        console.error(`[boot-lifecycle] critical module "${module.name}" (${module.owner}) is ${module.lifecycle.status}: ${module.lifecycle.reasonCode}`);
      }
    }
    console.error("Refusing to boot — a critical module failed. See failures above.");
    process.exit(1);
  }

  const app = createApp(deps);
  app.listen(port, () => {
    const store = useMemory ? "in-memory" : `sqlite (${defaultContentDbPath()})`;
    console.log(`tovu server running on http://localhost:${port} — store: ${store}`);

    // `runBootLifecycle` above does not cover these: `identityReady`/`settingsReady`/etc. are
    // fired directly by `createSqliteRouteDeps()` as independent, un-awaited side effects (see
    // each field's own doc in `server/routes/types.ts`), not part of `buildBootModules`'s set.
    // `app.listen()`'s callback firing says nothing about whether they've settled — reproduced
    // directly: spawning the daemon here unconditionally raced this process's own first-boot
    // identity seed and crashed both processes on a `UNIQUE constraint failed` (two concurrent
    // `createSqliteRouteDeps()` calls, one per process, both trying to seed the same row).
    // Awaiting them first, then spawning, closes that window.
    // `executionSettingsReady`/`settingsUiTabsReady`/`analyticsSettingsReady` belong in this list
    // for exactly the reason the paragraph above describes, and their absence was not theoretical —
    // it shipped a real defect. `content.db` currently holds TWO `status='active'` rows for
    // `core.execution.mode`, distinct `setting_id`s, both `version=1`, created 12ms apart, which
    // violates the one-active-row-per-slot invariant. Mechanism: the daemon was spawned while this
    // process's `ensureExecutionSettingDefinitions` was still mid-flight, so both processes ran the
    // same check-then-act (`resolveDefinitionRaw` -> absent -> register) against the same slot. Only
    // `mode` duplicated because it is the FIRST entry in `EXECUTION_DEFINITIONS` — by key 2 the
    // loser could already see the winner's rows. Awaiting all three closes the window for every
    // boot-time settings registrar, including the newer `ensureAnalyticsSettingDefinitions`.
    Promise.all([
      deps.identityReady,
      deps.settingsReady,
      deps.seoReady,
      deps.commentsReady,
      deps.commentsSettingsReady,
      deps.executionSettingsReady,
      deps.settingsUiTabsReady,
      deps.analyticsSettingsReady,
    ])
      .then(() => spawnAgentDaemon(deps.workspaceId))
      .catch((error: unknown) => {
        console.error("[index] a boot-readiness promise rejected — not starting the agent daemon", error);
      });
  });
}

/**
 * ADR-049 (process-shape correction) — Tovu never spawns a coding-agent CLI itself; that lives
 * entirely in `src/assistant/agent-daemon-server.ts`, a separate OS process. Started only after
 * `app.listen()`'s callback fires (i.e. after this process's own boot/migrations have fully
 * completed), so the daemon's own `createSqliteRouteDeps()` call — a second connection to the
 * same `content.db` — never races Tovu's first-boot schema setup. Inherits this process's full
 * env (`TOVU_DB`, `TOVU_CONTENT_DB`, `TOVU_AGENT_CWD`, `TOVU_AGENT_PERMISSION_MODE`,
 * `JINI_AGENT_DAEMON_PORT`), no filtering needed here — the daemon process applies its own
 * deny-by-default env allowlist to whatever it, in turn, spawns.
 *
 * `TOVU_AGENT_DAEMON_TOKEN` rides that same inherited env: `main()` mints it as its very first
 * statement (see `ensureAgentDaemonToken`), so it is always present by the time this runs. The
 * daemon refuses to serve any request without it (`assistant/daemon-auth.ts`), which is what stops
 * an unrelated local process from driving agent runs against `content.db`.
 *
 * Resolves the sibling script by swapping this file's own extension, so the same code path
 * launches `agent-daemon-server.ts` under `tsx` in dev and the compiled
 * `agent-daemon-server.js` under plain `node` in a built `dist/` — whichever this process itself
 * is running as.
 *
 * D10 fix: `workspaceId` is this process's own already-resolved `deps.workspaceId` (`main()`'s
 * `createSqliteRouteDeps()`/`createRouteDeps()` call, above), passed through the child's env as
 * `TOVU_WORKSPACE` so the daemon binds to the SAME workspace instead of independently
 * re-resolving `resolveWorkspace`'s default on its own connection — the two processes agreeing
 * today relies on that default being time-invariant (a newly created workspace can never become
 * "the oldest"), which is true but not something either process was ever told to rely on. Added
 * to an explicit `env: {...process.env, ...}` object rather than mutating `process.env` before
 * the call, so the propagation is visible in a diff/grep the same way the doc comment above
 * already lists every other inherited variable.
 */
function spawnAgentDaemon(workspaceId: string): void {
  // There is no retry path today (this function is called exactly once per process boot), so this
  // is a no-op on a fresh boot — nothing has latched a failure yet. It exists for a FUTURE retry:
  // each new spawn attempt must start from a clean slate, or a later successful attempt would stay
  // stuck behind a stale 503 an earlier, unrelated attempt latched. See `clearAssistantDaemonFailure`'s
  // own doc.
  clearAssistantDaemonFailure();

  const isCompiled = __filename.endsWith(".js");
  const daemonPath = path.join(__dirname, "assistant", isCompiled ? "agent-daemon-server.js" : "agent-daemon-server.ts");
  // `TOVU_PARENT_PID` backs `agent-daemon-server.ts`'s own watchdog (see that file's
  // `startParentWatchdog()` for the full rationale) — it is NOT redundant with the OS's own
  // `ppid`. In dev mode this spawn is a 3-hop `npx -> tsx -> node` chain where none of the three
  // exec-replaces itself (confirmed live via `ps`: all three stay alive for the run's whole
  // lifetime), so the daemon's actual `process.ppid` resolves to the middle `tsx` hop, not to
  // THIS process. `process.pid`, read here, is captured fresh for this exact spawn call/instance.
  const env = { ...process.env, TOVU_WORKSPACE: workspaceId, TOVU_PARENT_PID: String(process.pid) };
  // `detached: true` puts the daemon in its OWN process group so it can be reaped as a group.
  // This matters specifically in dev: the non-compiled branch is an `npx -> tsx -> node` chain, so
  // `child.kill()` only ever killed `npx`. The real daemon — the `node` grandchild that binds
  // JINI_AGENT_DAEMON_PORT and opens `infra/content.db` — survived, reparented to PID 1, and
  // squatted both indefinitely. A later boot then collided with it, and because the collision
  // surfaces as "the assistant is unavailable" rather than an error, it read as a mystery. Measured
  // 2026-08-04: an orphan from 11:01 was still holding 4319 and the content DB hours later.
  //
  // This separate process group has a real cost: it also shields the daemon from anything that
  // kills THIS process by process-group signal instead of by delivering us a catchable one.
  // Confirmed 2026-08-05: Playwright's default `webServer` teardown does exactly that — no
  // catchable signal at all, straight to `process.kill(-webServerPid, "SIGKILL")` on ITS OWN
  // group, which (by construction, per this comment) never reaches the daemon's group. `reap()`
  // below never gets a chance to run, so the orphaned daemon keeps Playwright's inherited
  // stdout/stderr pipe open and Playwright's own teardown hangs forever waiting for it to close.
  // Fixed at the source by opting in to `webServer.gracefulShutdown` in
  // `development/playwright.admin.config.ts`, which makes Playwright send a real SIGTERM first —
  // that reaches this process normally (it isn't itself in a detached group), letting `reap()`
  // run and group-kill the daemon exactly as it does for every other termination path below.
  //
  // Defense in depth, 2026-08-05: `stdio` is deliberately NOT `"inherit"` here (it was, until this
  // change). `"inherit"` means the daemon subtree shares this process's actual stdout/stderr file
  // descriptors — under Playwright those ARE the pipe `launchProcess()` reads to detect readiness
  // and to know when the webServer child has fully closed. If this process ever dies WITHOUT
  // `reap()` having run first (confirmed reproducible: an external SIGTERM straight to
  // Playwright's own top-level CLI process — not its webServer child — bypasses Playwright's
  // `teardown()` entirely, so `gracefulShutdown` above never even gets a chance to apply), the
  // orphaned daemon would keep holding that pipe's write end open indefinitely. Any FUTURE,
  // unrelated process waiting on that same pipe to close would then hang too — not just this run.
  // Piping explicitly and relaying ourselves means the daemon's own fd is never shared outside
  // this process, so an orphaned daemon can no longer wedge anyone else's teardown, no matter what
  // killed us or how. This does NOT stop the daemon from becoming an orphan in the first place —
  // that still requires whatever killed this process to have gone through `reap()` — so the
  // EADDRINUSE-on-next-boot leak from that same external-kill scenario is a real, separate,
  // still-open gap (see the analysis doc for the write-up); this only stops that leak from also
  // being able to hang an unrelated process's teardown the way the original bug did.
  const child = isCompiled
    ? spawn(process.execPath, [daemonPath], { stdio: ["ignore", "pipe", "pipe"], env, detached: true })
    : spawn("npx", ["tsx", daemonPath], { stdio: ["ignore", "pipe", "pipe"], env, detached: true });
  // Relay the daemon's own output through this process instead of inheriting its fds (see above) —
  // preserves the existing `[agent-daemon] ...` log visibility during dev/test without sharing
  // the pipe itself.
  child.stdout?.pipe(process.stdout);
  child.stderr?.pipe(process.stderr);
  // Captured once, right after spawn: `child.pid` is `number | undefined` only in the narrow
  // window where `spawn()` itself failed to allocate a process (surfaced via the `"error"`
  // handler below) — TS18048 was a real defect (not cosmetic), since `-child.pid` below would
  // have computed `-undefined` = `NaN` and thrown inside `reap()`'s `try`, silently falling
  // through to the single-process `child.kill()` fallback instead of the group kill. Narrowing
  // once here (rather than casting) makes `reap()` correctly no-op instead in that case — there
  // is no process to reap.
  const pid = child.pid;

  // Set ONLY by `reap()`, at the point it actually issues a kill — never inferred from the exit
  // code itself. The degraded-boot defect this whole block exists to close was previously reading
  // intent FROM the code (`code !== 0 && code !== null`), which silently treated a spontaneous
  // clean exit (code 0, e.g. the daemon crashing during `start()`'s own async setup and resolving
  // its process normally on the way down) as if it were fine. A clean code does not mean we asked
  // for it — only this flag does. Left `false` (never flipped) when `reap()`'s own early-return
  // fires because the child had ALREADY exited before we tried to shut it down — that path must
  // still count as a failure, not a deliberate shutdown.
  let shuttingDownDeliberately = false;

  // Matches what `agent-daemon-server.ts` itself resolves the port from (`JINI_AGENT_DAEMON_PORT ??
  // 4319`) — read again here, independently, so the parent's own failure message can name the exact
  // port without needing the child to have survived long enough to report it back.
  const daemonPort = process.env.JINI_AGENT_DAEMON_PORT ?? "4319";

  child.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    const reasonCode = `failed to start the agent daemon — the assistant will be unavailable: ${message}`;
    console.error(`[index] ${reasonCode}`);
    recordAssistantDaemonFailure(reasonCode);
  });
  child.on("exit", (code, signal) => {
    if (shuttingDownDeliberately) return;
    // `AGENT_DAEMON_EXIT_CODE.PORT_IN_USE` is `agent-daemon-server.ts`'s own `server.on("error")`
    // handler reporting EADDRINUSE specifically (`daemon-exit-codes.ts`) — naming the real reason
    // here instead of the generic message below is the fix for the degraded-boot defect: a leaked
    // port used to read as unexplained "exited unexpectedly (code 1)" flake.
    const reasonCode =
      code === AGENT_DAEMON_EXIT_CODE.PORT_IN_USE
        ? `agent daemon could not bind 127.0.0.1:${daemonPort} — address already in use`
        : `agent daemon exited unexpectedly (code ${code}, signal ${signal ?? "none"})`;
    console.error(`[index] ${reasonCode}`);
    recordAssistantDaemonFailure(reasonCode);
  });

  /** Kill the daemon's whole process group, falling back to the direct child if the group is gone. */
  const reap = () => {
    if (pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
    shuttingDownDeliberately = true;
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {
        /* already gone */
      }
    }
  };

  // `exit` alone was not enough: it does not run when this process is terminated by a signal, which
  // is how a dev server actually dies (Ctrl-C, or `tsx watch` cycling on a file change — the latter
  // otherwise leaks a fresh orphan on EVERY save).
  process.on("exit", reap);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => {
      reap();
      process.exit(0);
    });
  }
}

void main();
