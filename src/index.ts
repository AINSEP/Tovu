import { spawn } from "node:child_process";
import path from "node:path";

import { createApp, createRouteDeps } from "./server/app";
import { createSqliteRouteDeps, defaultContentDbPath } from "./server/deps";
import { CAPABILITY_INVENTORY } from "./server/capability-inventory";
import { runProductionReadinessGate } from "./server/production-readiness-gate";
import { resolveRuntimeMode } from "./server/runtime-mode";
import { runBootLifecycle } from "./server/boot-lifecycle";
import { buildBootModules } from "./server/bootstrap";
import { setReadinessSnapshot } from "./server/readiness-state";
import { registerPluginSdkResolver } from "./server/boot/plugin-sdk-resolver";
import { ensureAgentDaemonToken } from "./assistant/daemon-auth";

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

  child.on("error", (error) => {
    console.error("[index] failed to start the agent daemon — the assistant will be unavailable", error);
  });
  child.on("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(`[index] agent daemon exited unexpectedly (code ${code}, signal ${signal ?? "none"})`);
    }
  });

  /** Kill the daemon's whole process group, falling back to the direct child if the group is gone. */
  const reap = () => {
    if (pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
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
