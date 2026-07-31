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
    // `executionSettingsReady`/`settingsUiTabsReady` belong in this list for exactly the reason
    // the paragraph above describes, and their absence was not theoretical — it shipped a real
    // defect. `content.db` currently holds TWO `status='active'` rows for `core.execution.mode`,
    // distinct `setting_id`s, both `version=1`, created 12ms apart, which violates the
    // one-active-row-per-slot invariant. Mechanism: the daemon was spawned while this process's
    // `ensureExecutionSettingDefinitions` was still mid-flight, so both processes ran the same
    // check-then-act (`resolveDefinitionRaw` -> absent -> register) against the same slot. Only
    // `mode` duplicated because it is the FIRST entry in `EXECUTION_DEFINITIONS` — by key 2 the
    // loser could already see the winner's rows. Awaiting both closes the window.
    Promise.all([
      deps.identityReady,
      deps.settingsReady,
      deps.seoReady,
      deps.commentsReady,
      deps.commentsSettingsReady,
      deps.executionSettingsReady,
      deps.settingsUiTabsReady,
    ])
      .then(() => spawnAgentDaemon())
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
 */
function spawnAgentDaemon(): void {
  const isCompiled = __filename.endsWith(".js");
  const daemonPath = path.join(__dirname, "assistant", isCompiled ? "agent-daemon-server.js" : "agent-daemon-server.ts");
  const child = isCompiled
    ? spawn(process.execPath, [daemonPath], { stdio: "inherit" })
    : spawn("npx", ["tsx", daemonPath], { stdio: "inherit" });

  child.on("error", (error) => {
    console.error("[index] failed to start the agent daemon — the assistant will be unavailable", error);
  });
  child.on("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(`[index] agent daemon exited unexpectedly (code ${code}, signal ${signal ?? "none"})`);
    }
  });
  process.on("exit", () => {
    if (!child.killed) child.kill();
  });
}

void main();
