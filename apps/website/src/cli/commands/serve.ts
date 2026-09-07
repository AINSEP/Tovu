import path from "node:path";

import { createApp } from "../../server/runtime/composition/app.js";
import { createSqliteRouteDeps } from "../../server/runtime/composition/deps.js";
import { ValidationError, type ConfigJson } from "../../platform/site-dir/index.js";
import { mintBootSessionToken } from "#src/features/identity/boot-session-token";
import { bootSiteDir } from "../../platform/site-dir/boot-site-dir.js";
import { resolveInstallDirTarget } from "../../platform/site-dir/resolve-install-dir-target.js";
import { runtimeSchemaVersion } from "../../platform/site-dir/schema-guard.js";
import { PortInUseError } from "../errors.js";
import { startAssistantDaemon, shutdownAssistantDaemon } from "../../server/inbound/assistant/index.js";
import { ensureAgentDaemonPortResolved } from "../../server/runtime/lifecycle/agent-daemon-port.js";
import { isAdminAssistantEnabled } from "../../server/runtime/composition/admin-assistant-enabled.js";
import { installUnhandledRejectionGuard } from "../../server/runtime/boot/process-error-guards.js";
import { registerPluginSdkResolver } from "../../server/runtime/boot/plugin-sdk-resolver.js";
import { ensureAgentDaemonToken } from "../../assistant/index.js";
import { runProductionReadinessGateOrExit } from "../../server/runtime/boot/boot-readiness-gate.js";
import { runBootLifecycle, type BootResult } from "../../server/runtime/lifecycle/boot-lifecycle.js";
import { buildBootModules } from "../../server/runtime/boot/bootstrap.js";
import { setReadinessSnapshot } from "../../server/runtime/lifecycle/readiness-state.js";

/**
 * @file SPEC-003 C-002 (`CLI_SERVE`) — wires a commander action's parsed arguments to
 * `site-dir/boot-site-dir.ts`'s `bootSiteDir`, then `server/deps.ts` + `server/app.ts` +
 * `app.listen` (Wiring Map W-002).
 *
 * Purpose:
 * Owns the one HTTP-listen side effect this feature introduces, isolated from `site-dir` (which
 * has zero Express awareness) — port precedence (BR-02), the legacy-env-var-ignored warning
 * (BR-04/EC-08), the one boot-line log (api.spec.md §5), and graceful shutdown (BR-07).
 *
 * Architectural role:
 * `cli` layer. Never maps errors to exit codes itself (`cli/errors.ts`'s job) — lets `site-dir`
 * errors and `PortInUseError` propagate uncaught to `cli/main.ts`.
 *
 * Agent daemon (2026-08-28 dispatch): this command previously never started the agent daemon at
 * all — `src/index.ts` was the only boot path that did (`startAssistantDaemon`, at the bottom of
 * this file's `app.listen()` callback), so a Tovu instance launched via `tovu serve` (the packaged
 * CLI path, and what the Tovu-Runner desktop app spawns per project) served an admin UI whose
 * assistant could never respond. Fixed by mirroring `index.ts`'s own readiness-await-then-spawn
 * ordering exactly (see that file's own comment on why spawning too early shipped a real
 * duplicate-settings-row defect), plus resolving this instance's own daemon port BEFORE `createApp()`
 * (`ensureAgentDaemonPortResolved()` — see `runtime/lifecycle/agent-daemon-port.ts`'s header for why
 * an unconfigured instance now self-allocates a free port instead of every unconfigured Tovu on the
 * box converging on the same fixed 4319). Shutdown calls `shutdownAssistantDaemon()` directly rather
 * than letting `daemon-supervisor.ts` register its own signal handlers here — see
 * `startAssistantDaemon`'s `registerProcessSignalHandlers` option doc for why a second SIGINT/SIGTERM
 * listener calling `process.exit(0)` would race this command's own BR-07 graceful drain below.
 *
 * Daemon token (2026-09-05 dispatch): this command never minted `TOVU_AGENT_DAEMON_TOKEN` either —
 * only `src/index.ts`'s `main()` did, as its own first statement (see `daemon-auth.ts`'s module
 * doc). So a `tovu serve`-booted daemon always ran with the token env var unset, and
 * `requireAgentDaemonToken`'s fail-closed gate (`daemon-auth.ts`) answered every request — including
 * this same process's own assistant proxy — with 503 `AGENT_DAEMON_UNCONFIGURED`, silently. Fixed by
 * calling `ensureAgentDaemonToken()` here too, immediately after the unhandled-rejection guard and
 * before anything else, mirroring `index.ts`'s exact ordering: it must run before
 * `startAssistantDaemon()` spawns the daemon child below (the child inherits this process's env at
 * spawn time), and — like in `index.ts` — placing it first costs nothing, since it is a single
 * synchronous env assignment with no dependency on any boot step before it.
 *
 * Plugin SDK resolver (2026-09-05 dispatch, CIC U-002/ADR-005, ESCALATE_SECURITY): this command
 * never called `registerPluginSdkResolver()` either — only `src/index.ts`'s `main()` did. CIC
 * U-002-B1/ORD1 requires it registered synchronously, before any route is registered and before any
 * code path that could reach `loadPlugin()`'s dynamic `import()` — `createApp()` below unconditionally
 * mounts the `plugins` module (`PLUGIN_SET_ENABLED`), and `createSqliteRouteDeps()` above always wires
 * a real `installDir`, so a site-installed plugin enabled through this command's own admin route (or
 * the equivalent `plugins_set_enabled` agent tool) reached a real `import()` with the resolution hook
 * never registered — ordinary Node resolution then governs, which a plugin can defeat by planting its
 * own `node_modules/@tovu/sdk` (defeating ADR-005 rule 1's deep-import blocking). Reproduced directly:
 * `cli/__tests__/integration/serve-command-plugin-sdk-resolver.integration.test.ts` planted exactly
 * such a shadow package next to a site-installed plugin and, pre-fix, observed the plugin's
 * `@tovu/sdk` import resolve to the planted copy. Fixed by calling `registerPluginSdkResolver()` here
 * too, mirroring `index.ts`'s exact placement: immediately after `ensureAgentDaemonToken()`, before
 * `warnIfLegacyEnvVarsIgnored()` and every boot step after it — there is no `await` point ahead of it
 * in this function either, so the same "no window exists for a plugin import to become reachable
 * first" guarantee `index.ts`'s own comment describes holds here too.
 *
 * Production-readiness gate + boot lifecycle (2026-09-05 dispatch, boot-path parity): this command
 * ran NEITHER `runProductionReadinessGate` NOR `runBootLifecycle` — both `index.ts`-only until now.
 * Fixed by calling the same shared `runProductionReadinessGateOrExit()` (see that file's own
 * header) right after `registerPluginSdkResolver()`, and by composing+running the same
 * `buildBootModules()` set via `runBootLifecycle()` right after `deps` is built, BEFORE
 * `ensureAgentDaemonPortResolved()`/`createApp()`/`app.listen()` — so a `tovu serve`-booted site now
 * gets the crash-interrupted-migration scan (previously never invoked for this boot path at all)
 * and refuses to serve on a critical `settings`/`seo` failure, exactly like `index.ts`. Unlike
 * `index.ts`, a lifecycle failure here `throw`s rather than `process.exit()`s, per this file's own
 * "never map errors to exit codes" contract above.
 */

export interface RunServeCommandInput {
  dir: string;
  port?: string;
  workspaceId?: string;
  /**
   * Print a single-use loopback boot token on stdout once the listener is up, for a launching
   * process to exchange for an admin session (`features/identity/boot-session-token.ts`). Default
   * OFF: an operator running this by hand must never have a secret appear in their terminal, and a
   * server that mints nothing has the redemption route permanently closed.
   */
  emitBootToken?: boolean;
}

const DEFAULT_PORT = 3000;

/** behavior.spec.md §4: `--port` must be an integer in 1..65535 — out-of-range/non-integer is VALIDATION, not a fall-through. */
function parsePort(raw: string | number): number {
  const str = String(raw).trim();
  if (!/^\d+$/.test(str)) {
    throw new ValidationError(`--port must be an integer between 1 and 65535 (got "${raw}")`);
  }
  const value = Number(str);
  if (value < 1 || value > 65535) {
    throw new ValidationError(`--port must be between 1 and 65535 (got ${value})`);
  }
  return value;
}

/** BR-02: `--port` flag, then `config.json.port`, then `PORT` env, then 3000 — first PRESENT value wins; a present-but-invalid value at any tier is VALIDATION, never a fall-through to the next tier. */
function resolveServePort(input: RunServeCommandInput, config: ConfigJson): number {
  if (input.port !== undefined) return parsePort(input.port);
  if (config.port !== null && config.port !== undefined) return parsePort(config.port);
  if (process.env.PORT !== undefined) return parsePort(process.env.PORT);
  return DEFAULT_PORT;
}

/** BR-04/EC-08: a `dir` argument overrides legacy env vars — logs a warning naming whichever is set, rather than silently ignoring it. */
function warnIfLegacyEnvVarsIgnored(): void {
  if (process.env.TOVU_CONTENT_DB !== undefined) {
    process.stderr.write("tovu: warning: TOVU_CONTENT_DB is ignored when a dir argument is given\n");
  }
  if (process.env.TOVU_DB !== undefined) {
    process.stderr.write("tovu: warning: TOVU_DB is ignored when a dir argument is given\n");
  }
}

/**
 * Run `tovu serve <dir> [--port]`: validate/guard/migrate/stamp/resolve the install dir
 * (`bootSiteDir`), wire the existing composition root's `overrides` branch, and bind a listener.
 *
 * @throws whatever `bootSiteDir` throws (`SiteDirInvalidError`, `SiteNewerThanRuntimeError`,
 *   `SiteCorruptError`), a `ValidationError` (bad `--port`), or a `PortInUseError` (`EADDRINUSE`)
 *   — `cli/main.ts` maps each to the correct exit code.
 * @complexity O(1) beyond `bootSiteDir`'s own bounded cost; the returned promise resolves once
 *   the listener is bound (the process then stays alive on the open socket, not on this promise).
 * @overallScore 100
 */
/** `TOVU_ADMIN_ASSISTANT=off` skips the daemon ONLY when external MCP is also unconfigured — the
 *  daemon owns external-MCP federation too, not just chat (see `admin-assistant-enabled.ts`). */
async function agentDaemonWanted(deps: { workspaceId: string; externalMcpServerRepo: { listByWorkspaceId: (id: string) => Promise<readonly unknown[]> } }): Promise<boolean> {
  if (isAdminAssistantEnabled()) return true;
  const configured = await deps.externalMcpServerRepo.listByWorkspaceId(deps.workspaceId);
  if (configured.length > 0) return true;
  console.log("[assistant] TOVU_ADMIN_ASSISTANT=off and no external MCP configured — not starting the agent daemon");
  return false;
}

/** Logs one line per critical, not-ready module from a failed boot — duplicated verbatim from
 *  `index.ts`'s own helper of the same name (that file's own header explains why its boot-only
 *  logic is never imported by, or shared via import with, a tested module; mirrors this file's
 *  existing duplication of `agentDaemonWanted` above for the identical reason). Called only when
 *  `lifecycleResult.ok` is false. */
function logCriticalBootFailures(lifecycleResult: BootResult): void {
  for (const module of lifecycleResult.modules) {
    if (module.criticality === "critical" && module.lifecycle.status !== "ready") {
      console.error(`[boot-lifecycle] critical module "${module.name}" (${module.owner}) is ${module.lifecycle.status}: ${module.lifecycle.reasonCode}`);
    }
  }
}

export async function runServeCommand(input: RunServeCommandInput): Promise<void> {
  // Unhandled-rejection guard (2026-08-28 dispatch): `index.ts`'s `main()` installs this same guard
  // first, before any boot step (see `process-error-guards.ts`'s own header for the live crash that
  // motivated it) — this command never had it, and it is the one boot path Tovu-Runner actually
  // spawns. Verified live: `features/identity/wiring.ts`'s `ownerPrincipalId` is forked off
  // `seedResult` with no `.catch()` of its own anywhere; when `seedIdentity()` rejects (reproduced
  // with a real `UNIQUE constraint failed: roles.workspace_id, roles.name` from a corrupted
  // identity table), the `Promise.all([...]).catch(...)` below catches `identityReady`'s own
  // rejection fine, but that `ownerPrincipalId` fork is a SEPARATE promise with no handler at all —
  // an unhandled rejection that crashed the entire process a few seconds after boot. Installed as
  // the guard module's own header prescribes: fixed structurally, once, here, rather than chasing
  // down every individual forked promise that lacks a `.catch()` today or might tomorrow.
  installUnhandledRejectionGuard();

  // Mints `TOVU_AGENT_DAEMON_TOKEN` (unless the operator already set one) into this process's env
  // so `startAssistantDaemon()` — called later, from inside `app.listen()`'s callback — hands it to
  // the daemon child through the inherited env. See this file's header for the full incident.
  ensureAgentDaemonToken();

  // CIC U-002/ADR-005 (ESCALATE_SECURITY) — see this file's header. Must precede `createApp()`
  // below (and therefore every route it mounts, including the `plugins` module's
  // `PLUGIN_SET_ENABLED`) and every boot step that could lead there; placed here, with no `await`
  // ahead of it, for the same reason `index.ts`'s own call site gives.
  registerPluginSdkResolver();

  // 2026-09-05 dispatch (boot-path parity): this command never ran the production-readiness gate
  // either — only `src/index.ts`'s `main()` did, gated on `resolveRuntimeMode() === "production"`.
  // That mode is a plain `TOVU_RUNTIME_MODE` env read (see `runtime-mode.ts`), not something only
  // `index.ts`'s own boot path can reach — a self-hosted deployment launched via the packaged
  // `tovu serve` CLI can set it exactly the same way, and until now got zero unsafe-default
  // containment for doing so (dev secret placeholders, the default owner password, undurable
  // "production"-classified capabilities). Inert (an immediate return) whenever
  // `TOVU_RUNTIME_MODE` is not `"production"`, so this costs every ordinary `tovu serve` run
  // nothing. See `boot-readiness-gate.ts`'s own header for why this is now one shared function
  // rather than a second copy of `index.ts`'s original inline gate.
  await runProductionReadinessGateOrExit();

  warnIfLegacyEnvVarsIgnored();

  const target = resolveInstallDirTarget(input.dir);
  const bootResult = bootSiteDir({ dir: target }, { workspaceId: input.workspaceId });
  const port = resolveServePort(input, bootResult.config);

  const dbPath = path.join(target, "content.db");
  const deps = createSqliteRouteDeps(dbPath, {
    db: bootResult.db,
    workspaceId: bootResult.workspaceId,
    uploadsDir: path.join(target, "uploads"),
    // Same install-dir-relative reasoning as `uploadsDir` right above (CR-R01): the default themes
    // root is `process.cwd()`-relative, so without this a `<dir>` run would seed and serve a
    // `sites/tovu-com/themes` beside the operator's shell instead of the site it was given.
    themesDir: path.join(target, "themes"),
    // 2026-09-06 composition-root fix: without this, `RouteDeps.siteBinding` fell back to
    // `describeSiteBinding()`, which re-derives `<process.cwd()>/sites/tovu-com` — unrelated to
    // `target` whenever this command is invoked from outside `target`'s own parent directory. The
    // admin Sites screen then reported the WRONG site as "currently serving", and (had a caller
    // exercised Create/Activate against it) `sites.ts`/`sites_duplicate_site` would have written
    // under that unrelated `<cwd>/sites` tree instead of anywhere near `target`.
    // `switcherCompatible: false` because `target` is an arbitrary install-dir argument with no
    // `{cwd, env}`-relative `sites/`-sibling relationship at all — see `SiteBinding.switcherCompatible`'s
    // own doc. `dirOverridden: true` for the same reason `TOVU_SITE_DIR` reports it: this run's
    // served site was pinned by an explicit argument, so a persisted Activate choice would be inert
    // on a subsequent `tovu serve <dir>` invocation exactly as it already is under `TOVU_SITE_DIR`.
    siteBinding: {
      dir: target,
      name: path.basename(target),
      dirOverridden: true,
      switcherCompatible: false,
    },
  });

  // 2026-09-05 dispatch (boot-path parity): this command never ran `runBootLifecycle` at all —
  // only `src/index.ts`'s `main()` did (ADR-046 Phase 3/SPEC-031). Two concrete gaps that opened:
  // (1) `database-migration-reconciliation` (`reconcile-interrupted-migration.ts`) — the scan that
  // detects a crash-interrupted migration and flips `siteStatusRepo` to `BLOCKED_PENDING_RECOVERY`
  // — never ran for a `tovu serve`-booted site, so `site-serving-gate.ts`'s per-request enforcement
  // (which reads that SAME `siteStatusRepo`, not this function's return value) could never trigger
  // no matter how badly interrupted a real migration was; (2) `settings`/`seo` are CRITICAL exactly
  // because their promise chains have no `.catch()` anywhere (an unhandled-rejection risk), so a
  // failure there must abort boot cleanly rather than serve a half-seeded site. Composed and run
  // BEFORE `ensureAgentDaemonPortResolved()`/`createApp()`/`app.listen()` below — mirroring
  // `index.ts`'s exact ordering — so a critical failure refuses to serve at all, not merely to spawn
  // the daemon. `defaultContentDbPath` is this invocation's OWN resolved `dbPath` (install-dir-
  // relative), not `deps.ts`'s `siteDir()`-based default — passing that default here would point the
  // `store-plugin` boot module at the wrong site entirely whenever `<dir>` differs from the default
  // site root.
  const lifecycleResult = await runBootLifecycle(buildBootModules(deps, { useMemory: false, defaultContentDbPath: () => dbPath }));
  setReadinessSnapshot(lifecycleResult);
  if (!lifecycleResult.ok) {
    logCriticalBootFailures(lifecycleResult);
    bootResult.db.$client.close();
    // Never `process.exit()` here (unlike `index.ts`): this file's own header records the
    // established contract — `cli` layer errors propagate uncaught to `cli/main.ts`, which maps
    // them to an exit code via `errors.ts`. An unrecognized plain `Error` falls through to
    // `mapErrorToCliOutcome`'s `INTERNAL` (exit 1) bucket, matching `index.ts`'s own `process.exit(1)`
    // outcome for the identical failure without inventing a new SPEC-003 error code for it.
    throw new Error("Refusing to boot — a critical module failed. See failures above.");
  }

  // Must resolve — and, when neither `JINI_AGENT_DAEMON_URL` nor `JINI_AGENT_DAEMON_PORT` is set,
  // allocate — this instance's daemon origin BEFORE `createApp()` wires the assistant proxy's
  // routes, so no inbound request can ever reach `getAgentDaemonUrl()` before it has something to
  // return. See this file's own header and `agent-daemon-port.ts`'s for the full contract.
  await ensureAgentDaemonPortResolved();
  const app = createApp(deps);

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(port);

    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(new PortInUseError(`Port ${port} is already in use.`, port));
      } else {
        reject(err);
      }
    });

    server.once("listening", () => {
      const runtime = runtimeSchemaVersion();
      // BEFORE the documented startup line below, on purpose. A launcher treats that line as the
      // ready signal and stops waiting the moment it sees it, so a token printed after it would
      // race the parent's own resolve. Printed first, it is already in the parent's buffer by the
      // time the line it is waiting for arrives — no extra handshake, no timing window.
      //
      // A SEPARATE line, deliberately not a fifth field on the startup line: that line is a
      // documented contract (api.spec.md §5) other readers parse, and widening it would put a
      // secret in front of every consumer of it. Emitted only when explicitly asked for, and only
      // once the listener is bound, so a token can never outlive a boot that failed.
      if (input.emitBootToken === true) {
        // eslint-disable-next-line no-console
        console.log(`tovu serve: bootToken=${mintBootSessionToken()}`);
      }
      // api.spec.md §5: "one startup line including: dir, resolved port, schemaVersion, workspace id".
      // eslint-disable-next-line no-console
      console.log(`tovu serve: dir=${target} port=${port} schemaVersion=${runtime.index} workspaceId=${bootResult.workspaceId}`);
      resolve();

      // Same readiness-await-then-spawn ordering as `index.ts`'s own `app.listen()` callback, and
      // for the identical reason (see that file's comment on the call site this mirrors): spawning
      // before these settle raced this process's own first-boot identity/settings seeding and
      // shipped a real duplicate-`core.execution.mode`-row defect. `registerProcessSignalHandlers:
      // false` because this command already owns SIGINT/SIGTERM below (BR-07) — see
      // `startAssistantDaemon`'s own option doc for why a second listener here would race it.
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
        .then(async () => {
          if (!(await agentDaemonWanted(deps))) return;
          startAssistantDaemon({ workspaceId: deps.workspaceId, siteDir: target }, { registerProcessSignalHandlers: false });
        })
        .catch((error: unknown) => {
          console.error("[cli/serve] a boot-readiness promise rejected — not starting the agent daemon", error);
        });

      // BR-07: on SIGINT/SIGTERM, stop accepting new connections, let the current request finish,
      // then close the db handle and exit 0.
      const shutdown = (): void => {
        let exited = false;
        const finish = (): void => {
          if (exited) return;
          exited = true;
          shutdownAssistantDaemon();
          bootResult.db.$client.close();
          process.exit(0);
        };
        server.close(finish);
        // Idle keep-alive sockets don't block in-flight requests, but a client-pooled connection
        // that never sends another request WOULD block `server.close()`'s callback indefinitely
        // otherwise — better-sqlite3 is synchronous, so any genuinely in-flight request completes
        // within milliseconds, not seconds; a short grace window is more than enough before this
        // safety net force-closes anything still lingering (BR-07 only promises the current
        // request finishes, not that an idle keep-alive socket outlives shutdown).
        server.closeIdleConnections?.();
        setTimeout(() => {
          server.closeAllConnections?.();
          finish();
        }, 500).unref();
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    });
  });
}
