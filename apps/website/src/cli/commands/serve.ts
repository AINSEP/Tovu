import path from "node:path";

import { createServingApp } from "../../server/runtime/composition/serving-app.js";
import { createSqliteRouteDeps } from "../../server/runtime/composition/deps.js";
import { ValidationError, type ConfigJson } from "../../platform/site-dir/index.js";
import { SITE_BINDING_NOT_SWITCHABLE_ENV } from "../../platform/site-dir/site-registry.js";
import { mintBootSessionToken } from "#src/features/identity/boot-session-token";
import { bootSiteDir } from "../../platform/site-dir/boot-site-dir.js";
import { resolveInstallDirTarget } from "../../platform/site-dir/resolve-install-dir-target.js";
import { runtimeSchemaVersion } from "../../platform/site-dir/schema-guard.js";
import { PortInUseError } from "../errors.js";
import { startAssistantDaemon, shutdownAssistantDaemon } from "../../server/inbound/assistant/index.js";
import { ensureAgentDaemonPortResolved } from "../../server/runtime/lifecycle/agent-daemon-port.js";
import { installUnhandledRejectionGuard } from "../../server/runtime/boot/process-error-guards.js";
import { registerPluginSdkResolver } from "../../server/runtime/boot/plugin-sdk-resolver.js";
import { ensureAgentDaemonToken } from "../../assistant/index.js";
import { runProductionReadinessGateOrExit } from "../../server/runtime/boot/boot-readiness-gate.js";
import { warnIfNoRootKeyAtBoot } from "../../server/runtime/boot/root-key-boot-notice.js";
import { runBootLifecycle } from "../../server/runtime/lifecycle/boot-lifecycle.js";
import { buildBootModules, logCriticalBootFailures } from "../../server/runtime/boot/bootstrap.js";
import { agentDaemonWanted } from "../../server/runtime/boot/agent-daemon-wanted.js";
import { setReadinessSnapshot } from "../../server/runtime/lifecycle/readiness-state.js";
import { registerAdminDevProxyUpgrade } from "../../server/inbound/admin-http/admin-dev-proxy.js";

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
 *
 * `agentDaemonWanted`/`logCriticalBootFailures` (2026-09-06 composition-root fix): both used to be
 * defined again, verbatim, in this file — see `server/runtime/boot/agent-daemon-wanted.ts`'s and
 * `bootstrap.ts`'s own headers for why that duplication (and the comment justifying it) was wrong.
 * Both are imported now, same as every other shared boot-only function this file already used.
 *
 * Admin dev-proxy HMR upgrade (2026-09-11 dispatch): the FIFTH entry in the list above, same shape
 * as the other four. `registerAdminDevProxyUpgrade` had exactly one production call site,
 * `src/index.ts`, so an `upgrade` request never got forwarded on this boot path — `createApp` mounts
 * `registerAdminStatic`, which proxies ordinary `/admin/*` requests to Vite when
 * `TOVU_ADMIN_DEV_PROXY_URL` is set, but a WebSocket handshake arrives as a raw `http.Server`
 * `upgrade` event that Express routing never sees. Measured, same handshake against the same Vite
 * upstream: `index.ts`'s listener answered `101 Switching Protocols`, this one answered nothing.
 * This matters because `apps/desktop` spawns THIS command per site, so a desktop site window using
 * the dev proxy showed current admin source that could never hot-reload. Fixed at the `app.listen`
 * call site below; the function self-gates on the env var and on SEA, so nothing changes for a
 * production or packaged boot.
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
 * Pins this process's `TOVU_SITE_DIR` to the site directory `tovu serve <dir>` was actually given,
 * so every `siteDir()`-derived path in THIS process and in the agent daemon it spawns resolves to
 * the same place.
 *
 * THE DIVERGENCE THIS CLOSES (2026-09-07 audit, claim #5). `runServeCommand` overrides `uploadsDir`,
 * `themesDir` and the content-db path explicitly, but it set no `TOVU_SITE_DIR`, so everything else
 * this process derives from `siteDir()` — `chat.db`, `ops/database-journal.db`, `features/skills`,
 * `features/agent-plugins`, and `chat-attachment-directory.ts`'s staging root — still resolved
 * against `<process.cwd()>/sites/tovu-com`, an unrelated directory whenever this command runs from
 * outside it. The daemon child did NOT share that fate: `daemon-supervisor.ts`'s
 * `buildDaemonSpawnEnvOverrides` sets `TOVU_SITE_DIR: input.siteDir` on the child when the parent
 * has none, and `startAssistantDaemon` below passes `target`. So the two processes disagreed, by
 * construction, on every one of those paths. Measured, before this function existed, for
 * `tovu serve /tmp/client-a`:
 *
 *     API  reads   : <repo>/sites/tovu-com/uploads/chat-attachments
 *     daemon writes: /tmp/client-a/uploads/chat-attachments
 *
 * — the admin's attachment read-back route (`registerAdminChatAttachmentReadRoute`) looking in a
 * directory the daemon never writes.
 *
 * Set unconditionally, overwriting an operator's own `TOVU_SITE_DIR` when one is present: `<dir>` is
 * an explicit argument naming the site this invocation serves, and it already wins for `content.db`,
 * `uploads/` and `themes/`. Leaving one path family pointed somewhere else would be the same
 * split-brain in a quieter form. `buildDaemonSpawnEnvOverrides`'s own "only when the parent has
 * none" guard then leaves the child alone, because the parent now has one — the same value.
 *
 * Same mechanism (and same reason) as `ensureAgentDaemonToken()`: written into THIS
 * process's env so the `spawn()`ed child inherits it, rather than threaded through a second
 * argument every call site in between would have to carry.
 *
 * @param target - the already-resolved absolute install-dir target (`resolveInstallDirTarget`).
 * @param env - defaults to `process.env`; injectable so this is directly testable without mutating
 *   the test runner's own environment.
 * @complexity O(1) — one assignment.
 */
export function pinServedSiteDirIntoEnv(target: string, env: NodeJS.ProcessEnv = process.env): void {
  env.TOVU_SITE_DIR = target;
  // The SECOND half of the same fact, for the same inheritance reason (2026-09-07 audit, claim #4):
  // this boot's site was pinned by an explicit argument, so the Sites switcher's write paths must
  // refuse. The API learns that from its own `siteBinding` override below; the agent daemon — a
  // separate process that rebuilds its own `RouteDeps` through `createSqliteRouteDepsForWorkspace`,
  // and the process where `sites_duplicate_site` actually EXECUTES — falls back to
  // `describeSiteBinding()` and would otherwise reconstruct the binding as switchable, duplicating
  // under whatever `<process.cwd()>/sites` happens to be while the HTTP routes refuse the identical
  // request. See `SITE_BINDING_NOT_SWITCHABLE_ENV`'s own doc.
  env[SITE_BINDING_NOT_SWITCHABLE_ENV] = "1";
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

  // Same pairing as `index.ts`: the gate above is production-only, so a LOCAL `tovu serve` — which
  // is what the desktop shell spawns for every site — said nothing at all about a missing root key
  // until this existed. See `root-key-boot-notice.ts`.
  warnIfNoRootKeyAtBoot();

  warnIfLegacyEnvVarsIgnored();

  const target = resolveInstallDirTarget(input.dir);
  // Must precede EVERY `siteDir()`-derived read below (and the daemon spawn much further down) —
  // see {@link pinServedSiteDirIntoEnv} for the divergence this closes.
  pinServedSiteDirIntoEnv(target);
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
  // `createServingApp`, not bare `createApp`: it also starts the background outbox drainer (after
  // `createApp` has attached every subscriber) and the Trash auto-purge sweeper. Both are stopped
  // in `shutdown` below.
  const { app, outboxDrainer, trashSweeper } = createServingApp(deps);

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(port);

    // Forwards Vite's HMR WebSocket when `TOVU_ADMIN_DEV_PROXY_URL` is set. `registerAdminStatic`
    // (reached via `createApp` above) already proxies ordinary `/admin/*` REQUESTS on this path, but
    // an `upgrade` is a raw `http.Server` event Express's request pipeline never sees — so without
    // this, a dev-proxied `tovu serve` served current admin source that could never hot-reload.
    // Measured before the fix, same handshake against the same Vite: `index.ts`'s server answered
    // `101 Switching Protocols`; this one answered nothing at all.
    //
    // The FIFTH instance of this file's own recurring defect class — see the header above for the
    // other four (agent daemon, daemon token, plugin SDK resolver, readiness gate + boot lifecycle),
    // each of them "`src/index.ts` was the only boot path that did it". `apps/desktop` spawns this
    // command, so every desktop site window was on the wrong side of all five.
    //
    // Self-gating, so production and packaged builds are unaffected: the function returns
    // immediately when `TOVU_ADMIN_DEV_PROXY_URL` is unset or the runtime is a SEA single-binary.
    // Registered on `server`, not `app`, for the same reason `index.ts` does it that way.
    registerAdminDevProxyUpgrade(server);

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
        deps.siteTitleReady,
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
        // First, so no new outbox drain or trash sweep starts while the grace window below runs
        // toward the db close. A sweep caught mid-batch leaves its rows leased, and the next boot
        // re-claims them once the lease expires.
        void outboxDrainer.stop();
        void trashSweeper.stop();
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
