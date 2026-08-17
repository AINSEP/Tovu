import { createApp, createRouteDeps } from "./server/app";
import { createSqliteRouteDeps, defaultContentDbPath } from "./server/deps";
import { CAPABILITY_INVENTORY } from "./server/capability-inventory";
import { runProductionReadinessGate } from "./server/production-readiness-gate";
import { DEFAULT_OWNER_PASSWORD } from "./identity/wiring";
import { resolveRuntimeMode } from "#src/core/runtime-mode";
import { runBootLifecycle } from "./server/boot-lifecycle";
import { buildBootModules } from "./server/bootstrap";
import { setReadinessSnapshot } from "./server/readiness-state";
import { registerPluginSdkResolver } from "./server/boot/plugin-sdk-resolver";
import { installUnhandledRejectionGuard } from "./server/boot/process-error-guards";
import { startAssistantDaemon } from "./server/agent-daemon";
import { ensureAgentDaemonToken } from "./assistant";

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
 * the OLD process first (already handled by the `SIGINT`/`SIGTERM`/`SIGHUP` handlers
 * `startAssistantDaemon` registers — see `daemon-supervisor.ts`), and each fresh incarnation of
 * this file gets its own fresh `bootPpid`/interval at module load — no state carries over from the
 * process being replaced.
 *
 * Windows: not verified. Playwright's own `attemptToGracefullyClose()` throws unconditionally on
 * `win32` for this exact family of behavior (root-cause doc, quoting `playwright/lib/runner/
 * index.js`) — this inherits that same "not supported" posture rather than assuming parity.
 *
 * `process.exit()` from inside this function's interval callback fires the existing
 * `process.on("exit", ...)` listener `startAssistantDaemon` registers (a standard Node guarantee
 * already relied on by this file's own SIGINT/SIGTERM/SIGHUP handlers), so a self-exit here cleans
 * up the agent daemon exactly like every other termination path already does — no separate call
 * needed here.
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
 * `envSnapshot`'s four checks are a disclosed, best-effort implementation, not exhaustively
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
 * - `hasDefaultOwnerPassword` (§4.2): true when `TOVU_ADMIN_PASSWORD` is unset or still equal to
 *   `DEFAULT_OWNER_PASSWORD` — the exact literal `identity/wiring.ts`'s `buildIdentityRouteDeps()`
 *   falls back to when seeding the owner account. Imported from that module rather than
 *   re-declared here so the gate can never drift out of sync with what the seeder actually did.
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
      hasDefaultOwnerPassword: (process.env.TOVU_ADMIN_PASSWORD ?? DEFAULT_OWNER_PASSWORD) === DEFAULT_OWNER_PASSWORD,
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
  // Fixes a live-found crash (2026-08-16, `process-error-guards.ts`'s own header has the full
  // account): an unhandled async rejection anywhere beneath an Express 4 route handler used to take
  // down this ENTIRE process, not just the one request that triggered it. Placed first — before any
  // boot step below has a chance to reject unguarded — so the guard covers boot itself, not only
  // requests served after `app.listen()`.
  installUnhandledRejectionGuard();

  // Mints `TOVU_AGENT_DAEMON_TOKEN` (unless the operator already set one) into this process's env
  // so `startAssistantDaemon()` — called much later, from inside `app.listen()`'s callback — hands
  // it to the daemon child (and every respawn after it) through the inherited env, and so
  // `server/modules/assistant.ts`'s proxy
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
  const server = app.listen(port, () => {
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
      .then(() => startAssistantDaemon({ workspaceId: deps.workspaceId }))
      .catch((error: unknown) => {
        console.error("[index] a boot-readiness promise rejected — not starting the agent daemon", error);
      });
  });

  // WHY THIS EXISTS: without it, a listen failure is an unhandled `'error'` event on the Server,
  // which Node re-throws — so the process dies with a raw stack trace and no statement of what is
  // wrong. Measured 2026-08-15: `tsx watch` restarted this process on a source edit, force-killed
  // the previous one after its 5s grace period ("Process didn't exit in 5s"), and the replacement
  // hit the still-held port. What the operator saw was a dead server and a login page that would
  // not authenticate; what they needed to see was "port 3000 is already in use".
  //
  // EADDRINUSE gets a named, actionable message because it is the one failure here with an obvious
  // operator fix. Everything else re-raises rather than being swallowed into a generic line — an
  // unknown listen failure should still surface its own error, just not as an unhandled event.
  //
  // `exit(1)` rather than a retry loop: a port collision in dev means another Tovu is already
  // serving, and silently retrying would make two processes race for the port on every restart.
  // `dev.mjs` already preflights ports and names the holder; `dev:server` alone does not, which is
  // exactly the path this was hit on.
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `Refusing to start: port ${port} is already in use.\n` +
          `  Another Tovu (or an orphan from a previous run) is still holding it.\n` +
          `  Find it with:  lsof -ti :${port} -sTCP:LISTEN\n` +
          `  Then stop that process, or set PORT to a free port.`,
      );
      process.exit(1);
    }
    throw error;
  });
}

// ADR-049 (process-shape correction) — Tovu never spawns a coding-agent CLI itself; that lives
// entirely in `src/assistant/agent-daemon-server.ts`, a separate OS process. `startAssistantDaemon`
// (called above, inside `app.listen()`'s callback, after the boot-readiness promises settle) now
// owns the full spawn-and-supervise lifecycle — including automatic respawn with backoff, a
// crash-loop cap, and the manual restart seam a future admin action can call — in
// `src/assistant/daemon-supervisor.ts`. Moved out of this file because `index.ts` self-invokes
// `main()` at module load (see this file's own header), so it can never be imported by a test;
// `daemon-supervisor.ts` carries the same env-propagation (`TOVU_WORKSPACE`, `TOVU_PARENT_PID`),
// process-group-detachment, and stdio-piping behavior this function used to, unchanged — see that
// file's own header for the full rationale on each.

void main();
