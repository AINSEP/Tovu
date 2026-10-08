import path from "node:path";

import { createServingApp } from "../../server/runtime/composition/serving-app.js";
import { createSiteRouteDeps } from "../../server/runtime/composition/deps.js";
import { ValidationError, type ConfigJson } from "../../platform/site-dir/index.js";
import { SITE_BINDING_NOT_SWITCHABLE_ENV } from "../../platform/site-dir/site-registry.js";
import { mintBootSessionToken } from "#src/features/identity/boot-session-token";
import { bootSiteDir, closeSiteDirBoot, type BootSiteDirResult } from "../../platform/site-dir/boot-site-dir.js";
import type { SiteStore } from "../../server/runtime/composition/open-site-store.js";
import { awaitBootWorkWithinBound } from "../../server/runtime/lifecycle/await-boot-work.js";
import { closeWithinBound } from "../../server/runtime/lifecycle/close-store-on-shutdown.js";
import { resolveInstallDirTarget } from "../../platform/site-dir/resolve-install-dir-target.js";
import { runtimeSchemaVersion } from "../../platform/site-dir/schema-guard.js";
import { PortInUseError } from "../errors.js";
import { startAssistantDaemon, shutdownAssistantDaemon } from "../../server/inbound/assistant/index.js";
import { ensureAgentDaemonPortResolved } from "../../server/runtime/lifecycle/agent-daemon-port.js";
import { installUnhandledRejectionGuard } from "../../server/runtime/boot/process-error-guards.js";
import { attachServerLogFile, installServerLogCapture, serverLogFilePaths } from "../../platform/server-logs/index.js";
import { registerPluginSdkResolver } from "../../server/runtime/boot/plugin-sdk-resolver.js";
import { ensureAgentDaemonToken } from "../../assistant/index.js";
import { runProductionReadinessGateOrExit } from "../../server/runtime/boot/boot-readiness-gate.js";
import { warnIfNoSiteKeyAtBoot } from "../../server/runtime/boot/site-key-boot-notice.js";
import { ensureSiteKeyForBoot } from "../../features/webhooks/site-key-ensure.js";
import { findSiteKeyDependentData } from "../../platform/site-dir/site-key-dependent-data.js";
import { runBootLifecycle } from "../../server/runtime/lifecycle/boot-lifecycle.js";
import { buildBootModules, logCriticalBootFailures } from "../../server/runtime/boot/bootstrap.js";
import { agentDaemonWanted } from "../../server/runtime/boot/agent-daemon-wanted.js";
import { awaitSiteBootReadiness } from "../../server/runtime/boot/site-boot-readiness.js";
import { resolveBindHost, isLoopbackHost, DEFAULT_LOCAL_BIND_HOST } from "../../server/runtime/boot/bind-host.js";
import { setReadinessSnapshot } from "../../server/runtime/lifecycle/readiness-state.js";
import { registerAdminDevProxyUpgrade } from "../../server/inbound/admin-http/admin-dev-proxy.js";

/**
 * @file SPEC-003 C-002 (`CLI_SERVE`) — boot a site, compose its server and listen (W-002).
 *
 * The CLI owns HTTP listen, port precedence (BR-02), legacy-env warnings (BR-04/EC-08),
 * the boot log and graceful shutdown (BR-07); `site-dir` remains independent of Express.
 * Bind host is loopback by default (BR-02a), with `--host` overriding `TOVU_HOST` and a
 * warning for a non-loopback result. Errors propagate to `cli/main.ts`; `cli/errors.ts`
 * owns exit-code mapping.
 *
 * Daemon startup waits for settings readiness to avoid duplicate settings writes and
 * resolves an instance-specific port before app composition to avoid cross-site collisions.
 * The CLI owns signal handling: a second daemon signal handler could exit before its
 * graceful drain. Mint the daemon token before spawning so the child inherits it;
 * the daemon auth gate fails closed when no token is configured.
 *
 * CIC U-002-B1/ORD1 and ADR-005 require synchronous SDK resolver registration before
 * any route or plugin-import path, with no preceding await. Otherwise a site plugin
 * can shadow `@tovu/sdk` with its own node_modules and defeat the deep-import boundary.
 * See `runtime/boot/plugin-sdk-resolver.ts` for the owner contract.
 *
 * Shared production-readiness and boot lifecycle gates run before listening or daemon
 * startup: crash-interrupted migrations are reconciled and critical settings/SEO failures
 * refuse serving. Lifecycle failures throw here rather than exiting inside the command.
 *
 * Dev-proxy HMR needs `registerAdminDevProxyUpgrade` on the raw HTTP server: WebSocket
 * upgrade events bypass Express, even though ordinary admin requests reach the proxy.
 * The helper gates itself on the dev-proxy env and SEA packaging.
 */

export interface RunServeCommandInput {
  dir: string;
  port?: string;
  workspaceId?: string;
  /**
   * IP address to bind (LAN-bind plan, 2026-09-23). Wins over `TOVU_HOST` — same precedence shape
   * as `--port` over the `PORT` env var, and the same reason: an explicit flag on THIS invocation is
   * a stronger signal than an ambient env var that might be stale or inherited from a parent shell.
   * Unset means "defer to `TOVU_HOST`, then `DEFAULT_LOCAL_BIND_HOST`" — see `resolveBindHost`.
   */
  host?: string;
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
 * Pins `TOVU_DISABLE_DEV_TLS=1` for this process and (by inheritance) the agent daemon it spawns.
 * `tovu serve` always listens on plain HTTP, but `deps.ts`'s `devCapabilityScheme`/
 * `derivedPublicOrigin` — computed in both processes — say `https` whenever the checkout's `.certs/`
 * pair exists, which would hand OAuth providers and emailed links an `https://` URL for an
 * `http://` server. Set unconditionally for the same reason as {@link pinServedSiteDirIntoEnv}:
 * this listener's scheme is a fact, not a preference.
 *
 * @param env - defaults to `process.env`; injectable for tests.
 * @complexity O(1).
 */
export function pinPlainHttpIntoEnv(env: NodeJS.ProcessEnv = process.env): void {
  env.TOVU_DISABLE_DEV_TLS = "1";
}

/**
 * Pins `TOVU_SITE_DIR` to the resolved CLI target before any site-derived read or spawn.
 * API and daemon must share chat, journal, skills, plugin and attachment paths; deriving
 * them from cwd would disagree with explicit `tovu serve <dir>` overrides.
 * The explicit CLI target wins over an existing env value for every path family.
 * Setting the parent env also propagates the same binding to its daemon child.
 *
 * @param target - Already-resolved absolute install-dir target.
 * @param env - Defaults to `process.env`; injectable to avoid mutating the test runner.
 * @complexity O(1) — one assignment.
 */
export function pinServedSiteDirIntoEnv(target: string, env: NodeJS.ProcessEnv = process.env): void {
  env.TOVU_SITE_DIR = target;
  // An explicit CLI target must be unswitchable in the daemon as well as the API.
  // The child reconstructs its binding from env; see SITE_BINDING_NOT_SWITCHABLE_ENV.
  env[SITE_BINDING_NOT_SWITCHABLE_ENV] = "1";
}

export interface RunServeCommandOptional {
  /** Preserve the real boot while allowing per-command resolver and worker lifecycle witnesses. */
  registerPluginSdkResolver?: typeof registerPluginSdkResolver;
  createServingApp?: typeof createServingApp;
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
export async function runServeCommand(input: RunServeCommandInput, optional: RunServeCommandOptional = {}): Promise<void> {
  // Install before boot: detached identity seed promises can reject independently of identityReady.
  // See runtime/boot/process-error-guards.ts for the process-wide guard rationale.
  installUnhandledRejectionGuard();
  // Server log capture (gap A-04): keeps recent console output in memory, redacted, so the admin
  // server-logs route and the `system_read_server_logs` chat tool can show recent errors. Installed
  // right after the rejection guard so boot-time failures are captured too.
  installServerLogCapture();

  // Mints `TOVU_AGENT_DAEMON_TOKEN` (unless the operator already set one) into this process's env
  // so `startAssistantDaemon()` — called later, from inside `app.listen()`'s callback — hands it to
  // the daemon child through the inherited env. See this file's header for the ordering contract.
  ensureAgentDaemonToken({}, {});

  // CIC U-002/ADR-005 (ESCALATE_SECURITY) — see this file's header. Must precede `createApp()`
  // below (and therefore every route it mounts, including the `plugins` module's
  // `PLUGIN_SET_ENABLED`) and every boot step that could lead there; placed here, with no `await`
  // ahead of it, for the same reason `index.ts`'s own call site gives.
  (optional.registerPluginSdkResolver ?? registerPluginSdkResolver)();

  // The shared gate contains unsafe defaults for production CLI boots and is inert locally.
  // See runtime/boot/boot-readiness-gate.ts for the policy.
  await runProductionReadinessGateOrExit();

  // Local boots also need the missing-site-key notice; the readiness gate is production-only.
  // See runtime/boot/site-key-boot-notice.ts.
  warnIfNoSiteKeyAtBoot();

  warnIfLegacyEnvVarsIgnored();

  const target = resolveInstallDirTarget(input.dir);
  // Must precede EVERY `siteDir()`-derived read below (and the daemon spawn much further down) —
  // see {@link pinServedSiteDirIntoEnv} for the divergence this closes.
  pinServedSiteDirIntoEnv(target);
  // Persist captured log lines to `<site>/ops/logs/server.log` (L2), including those buffered since
  // `installServerLogCapture()` above, so errors survive a restart; reads merge the daemon's log too.
  const logFiles = serverLogFilePaths({ siteDir: target });
  attachServerLogFile({ filePath: logFiles.server }, { alsoRead: [logFiles.daemon] });
  pinPlainHttpIntoEnv();
  const bootResult = await bootSiteDir({ dir: target }, { workspaceId: input.workspaceId });
  // From here on this command owns what `bootSiteDir` opened: any failure before the listener is
  // bound (bad port/host, a composition or lifecycle failure, the daemon port, `EADDRINUSE`) stops
  // the workers already started and closes the store before the error reaches `cli/main.ts`, so a
  // refused boot never leaves a PGlite owner lock/socket or a Postgres pool behind.
  const owned: ServeOwnership = { bootResult, composedStore: undefined, workers: [], bootWork: [] };
  try {
    await serveBootedSite(input, target, owned, optional);
  } catch (err) {
    await releaseServeOwnership(owned);
    throw err;
  }
}

/** What a `tovu serve` run holds open once `bootSiteDir` has succeeded. */
interface ServeOwnership {
  readonly bootResult: BootSiteDirResult;
  /** The composition's store (`onStoreOpened`); closing it stops the guest-chat sweep first. */
  composedStore: SiteStore | undefined;
  /** Background loops started by `createServingApp`. */
  readonly workers: Array<{ stop(): Promise<void> }>;
  /** Boot passes the composition started and never awaited, which read the store: the legacy
   *  publish-credential tail and `createApp`'s BYOK pass. See `await-boot-work.ts`. */
  readonly bootWork: Array<Promise<unknown>>;
}

/** Stops every started worker, then closes the store (the composition's, or `bootSiteDir`'s). */
async function releaseServeOwnership(owned: ServeOwnership): Promise<void> {
  await Promise.allSettled(owned.workers.map((worker) => worker.stop()));
  await closeOwnedStore(owned);
}

/** Closes the store once the boot work still reading it has settled (bounded, see
 *  `awaitBootWorkWithinBound`), so a site stopped seconds after boot does not close under it. */
async function closeOwnedStore(owned: ServeOwnership): Promise<void> {
  await awaitBootWorkWithinBound({ work: owned.bootWork });
  await closeSiteDirBoot(owned.bootResult, owned.composedStore);
}

/**
 * {@link runServeCommand} after `bootSiteDir`: compose, run the boot lifecycle, bind the listener and
 * install the BR-07 shutdown. Records what it starts in `owned`, so a rejection can be cleaned up.
 */
async function serveBootedSite(input: RunServeCommandInput, target: string, owned: ServeOwnership, optional: RunServeCommandOptional): Promise<void> {
  const { bootResult } = owned;
  const port = resolveServePort(input, bootResult.config);
  // LAN-bind plan (2026-09-23): loopback-only unless TOVU_HOST opts in. Resolved before the boot
  // lifecycle below, same reasoning as `port` above — a bad value fails fast as VALIDATION rather
  // than after `bootSiteDir`'s migrations/side effects have already run.
  const host = resolveBindHost(input.host ?? process.env.TOVU_HOST, DEFAULT_LOCAL_BIND_HOST);

  // site-key plan §A3a: safe to call on every boot (a valid per-site file is read, not rewritten —
  // see `ensureSiteKeyForBoot`'s own header). Result is discarded — no caller here needs it, same
  // "safe to call on every boot" framing `ensureSiteKey` itself documents. Must precede
  // `createSiteRouteDeps` below, which is what actually resolves the site key this may have just
  // adopted or minted. Must FOLLOW `bootSiteDir` and the port/host checks above: it can write
  // `.site-meta.json`, and a boot those refuse must leave the directory untouched — a refused
  // marker-less dir that gained a `.site-meta.json` here is one `tovu adopt` then refuses as
  // partially adopted.
  await ensureSiteKeyForBoot({ siteDir: target, findSiteKeyDependentData });

  const dbPath = path.join(target, "content.db");
  const deps = await createSiteRouteDeps(dbPath, {
    db: bootResult.db,
    store: bootResult.store,
    workspaceId: bootResult.workspaceId,
    onStoreOpened: (store) => (owned.composedStore = store),
    uploadsDir: path.join(target, "uploads"),
    // Same install-dir-relative reasoning as `uploadsDir` right above (CR-R01): the default themes
    // root is `process.cwd()`-relative, so without this a `<dir>` run would seed and serve a
    // `sites/tovu-dev/themes` beside the operator's shell instead of the site it was given.
    themesDir: path.join(target, "themes"),
    // 2026-09-06 composition-root fix: without this, `RouteDeps.siteBinding` fell back to
    // `describeSiteBinding()`, which re-derives `<process.cwd()>/sites/tovu-dev` — unrelated to
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
  if (deps.legacyPublishCredentialsReady) owned.bootWork.push(deps.legacyPublishCredentialsReady);

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
    // The store is closed by `runServeCommand`'s catch. Never `process.exit()` here (unlike `index.ts`): this file's own header records the
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
  const { app, outboxDrainer, trashSweeper, bootWork } = (optional.createServingApp ?? createServingApp)(deps);
  owned.workers.push(outboxDrainer, { stop: () => trashSweeper.stop({}) });
  owned.bootWork.push(...bootWork);

  await new Promise<void>((resolve, reject) => {
    // Express's own `.listen()` overloads type `hostname` as a required `string`, not
    // `string | undefined` (`@types/express-serve-static-core`) — so `host === undefined` (the
    // "no TOVU_HOST override, use Node's own all-interfaces default" case) is routed to the
    // callback-only overload explicitly, rather than widening the type with a cast.
    const server = host !== undefined ? app.listen(port, host) : app.listen(port);

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
      // AFTER the documented startup line, same ordering reason as the boot token above — a parser
      // treating that line as the ready signal must see it exactly as documented, unwidened by a
      // second line ahead of it. LAN-bind plan (2026-09-23): this is the one place `--host`/
      // `TOVU_HOST` widening a `tovu serve` instance beyond loopback becomes visible to whoever
      // started it.
      if (!isLoopbackHost(host)) {
        process.stderr.write(
          `tovu serve: warning: listening on ${host ?? "all interfaces"}; this site is reachable from other machines on your network (--host/TOVU_HOST)\n`
        );
      }
      resolve();

      // Same readiness-await-then-spawn ordering as `index.ts`'s own `app.listen()` callback, and
      // for the identical reason (see `server/runtime/boot/site-boot-readiness.ts`, the list both
      // boot paths now share): spawning before these settle raced this process's own first-boot identity/settings seeding and
      // shipped a real duplicate-`core.execution.mode`-row defect. `registerProcessSignalHandlers:
      // false` because this command already owns SIGINT/SIGTERM below (BR-07) — see
      // `startAssistantDaemon`'s own option doc for why a second listener here would race it.
      awaitSiteBootReadiness({ deps })
        .then(async () => {
          if (!(await agentDaemonWanted(deps))) return;
          startAssistantDaemon(
            { workspaceId: deps.workspaceId, siteDir: target, pgSocketPath: bootResult.store?.pgliteSocketPath },
            { registerProcessSignalHandlers: false }
          );
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
        const workersStopped = Promise.allSettled([outboxDrainer.stop(), trashSweeper.stop({})]);
        let exited = false;
        // Awaits the store close (PGlite flushes, removes its socket and releases its owner lock),
        // bounded like the default boot's (`closeWithinBound`, 4 s) so a hung close still exits.
        // The close itself first waits (2 s of that) for boot work still reading the store.
        const finish = async (): Promise<void> => {
          if (exited) return;
          exited = true;
          shutdownAssistantDaemon();
          await closeWithinBound(
            async () => {
              await workersStopped;
              await closeOwnedStore(owned);
            },
            { label: "the site store" }
          );
          process.exit(0);
        };
        server.close(() => void finish());
        // Idle keep-alive sockets don't block in-flight requests, but a client-pooled connection
        // that never sends another request WOULD block `server.close()`'s callback indefinitely
        // otherwise — better-sqlite3 is synchronous, so any genuinely in-flight request completes
        // within milliseconds, not seconds; a short grace window is more than enough before this
        // safety net force-closes anything still lingering (BR-07 only promises the current
        // request finishes, not that an idle keep-alive socket outlives shutdown).
        server.closeIdleConnections?.();
        setTimeout(() => {
          server.closeAllConnections?.();
          void finish();
        }, 500).unref();
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    });
  });
}
