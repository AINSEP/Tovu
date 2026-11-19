import { createServingApp } from "../../server/runtime/composition/serving-app.js";
import type { createSiteRouteDeps } from "../../server/runtime/composition/deps.js";
import { pinSiteListenerOrigin } from "../../server/runtime/boot/site-listener-origin.js";
import { startSiteDaemonListener } from "../../server/runtime/boot/site-daemon-listener.js";
import { mintBootSessionToken } from "#src/features/identity/boot-session-token";
import { closeSiteDirBoot } from "../../platform/site-dir/boot-site-dir.js";
import { closeStoreOnShutdown, stopServingWithinGrace } from "../../server/runtime/lifecycle/close-store-on-shutdown.js";
import { runtimeSchemaVersion } from "../../platform/site-dir/schema-guard.js";
import { PortInUseError } from "../errors.js";
import { startAssistantDaemon, shutdownAssistantDaemon } from "../../server/inbound/assistant/index.js";
import { agentDaemonWanted } from "../../server/runtime/boot/agent-daemon-wanted.js";
import { awaitSiteBootReadiness } from "../../server/runtime/boot/site-boot-readiness.js";
import { isLoopbackHost } from "../../server/runtime/boot/bind-host.js";
import { registerAdminDevProxyUpgrade } from "../../server/inbound/admin-http/admin-dev-proxy.js";
import { createConsoleLogger } from "@jini-ai/core/primitives";
import type { RunServeCommandInput, RunServeCommandOptional, ServeOwnership } from "./serve.js";

const consoleLogger = createConsoleLogger({ prefix: "" });

type ServeDeps = Awaited<ReturnType<typeof createSiteRouteDeps>>;
type ServingApp = ReturnType<typeof createServingApp>;
type DaemonCallback = Awaited<ReturnType<typeof startSiteDaemonListener>>;
type StopRef = { requestStop?: (input: { exitCode: number }) => void };
type ServeListenContext = { input: RunServeCommandInput; target: string; owned: ServeOwnership; deps: ServeDeps; serving: ServingApp; stopRef: StopRef; listen: { host: string | undefined; port: number } };

/** Creates the serving app (and its background loops) and records every stoppable worker in `owned`. */
function startServing({ optional, deps, owned, stopRef }: { optional: RunServeCommandOptional; deps: ServeDeps; owned: ServeOwnership; stopRef: StopRef }): ServingApp {
  // `createServingApp`, not bare `createApp`: it also starts the background outbox drainer (after
  // `createApp` has attached every subscriber), Trash auto-purge sweeper, theme watcher, the
  // automatic form pull, the post go-live sweep, the webhook delivery loop, the due-bindings DNS
  // sweep and the site-search maintenance loop. All stop in `shutdown` below.
  const servingOptions = {
    stopForIdle: (input: { exitCode: number }) => {
      if (!stopRef.requestStop) throw new Error("site shutdown is not ready");
      // Reply on the inherited channel before its normal daemon-first teardown withdraws it.
      const stop = stopRef.requestStop;
      setImmediate(() => stop(input));
    },
  };
  const serving = (optional.createServingApp ?? createServingApp)(deps, servingOptions);
  const { outboxDrainer, trashSweeper, themeWatcher, formPullTrigger, postGoLiveSweep, webhookDeliveryWorker, domainBindingSweeper, siteSearchMaintenance, bootWork } = serving;
  owned.workers.push(outboxDrainer, { stop: () => trashSweeper.stop({}) }, themeWatcher, formPullTrigger, postGoLiveSweep, webhookDeliveryWorker, domainBindingSweeper, siteSearchMaintenance);
  owned.bootWork.push(...bootWork);
  return serving;
}

/** The documented startup line, preceded by the boot token and followed by the LAN-bind warning when they apply. */
function announceStartup({ input, target, workspaceId, host, port }: { input: RunServeCommandInput; target: string; workspaceId: string; host: string | undefined; port: number }): void {
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
    consoleLogger.info({ message: `tovu serve: bootToken=${mintBootSessionToken()}` });
  }
  // api.spec.md §5: "one startup line including: dir, resolved port, schemaVersion, workspace id".
  consoleLogger.info({ message: `tovu serve: dir=${target} port=${port} schemaVersion=${runtime.index} workspaceId=${workspaceId}` });
      // AFTER the documented startup line, same ordering reason as the boot token above — a parser
      // treating that line as the ready signal must see it exactly as documented, unwidened by a
      // second line ahead of it. LAN-bind plan (2026-09-23): this is the one place `--host`/
      // `TOVU_HOST` widening a `tovu serve` instance beyond loopback becomes visible to whoever
      // started it.
      if (!isLoopbackHost({ host })) {
    process.stderr.write(
      `tovu serve: warning: listening on ${host ?? "all interfaces"}; this site is reachable from other machines on your network (--host/TOVU_HOST)\n`
    );
  }
}

/** Starts the assistant daemon once the listener is bound. */
function launchAssistantDaemon({ context, siteApiOrigin, daemonCallback }: { context: ServeListenContext; siteApiOrigin: string; daemonCallback: DaemonCallback }): void {
  const { deps, target, owned } = context;
      // Register cold, retaining the readiness-before-spawn gate shared with index.ts, and
      // for the identical reason (see `server/runtime/boot/site-boot-readiness.ts`, the list both
      // boot paths now share): spawning before these settle raced this process's own first-boot identity/settings seeding and
      // shipped a real duplicate-`core.execution.mode`-row defect. `registerProcessSignalHandlers:
      // false` because this command already owns SIGINT/SIGTERM below (BR-07) — see
      // `startAssistantDaemon`'s own option doc for why a second listener here would race it.
  startAssistantDaemon(
    { workspaceId: deps.workspaceId, siteDir: target, pgSocketPath: owned.bootResult.store?.pgliteSocketPath,
      siteApiOrigin, siteCallbackOrigin: daemonCallback.origin },
    { registerProcessSignalHandlers: false, beforeStart: async () => {
      await awaitSiteBootReadiness({ deps });
      if (!(await agentDaemonWanted(deps))) throw new Error("the assistant daemon is disabled for this site");
    } }
  );
}

/** BR-07 shutdown: stop serving within a grace window, then close the store and the daemon. */
function installShutdown({ context, server, daemonCallback }: { context: ServeListenContext; server: import("node:http").Server; daemonCallback: DaemonCallback }): void {
  const { owned, serving, stopRef } = context;
  const { outboxDrainer, trashSweeper, themeWatcher, formPullTrigger, postGoLiveSweep, webhookDeliveryWorker, domainBindingSweeper, siteSearchMaintenance } = serving;
      // BR-07: on SIGINT/SIGTERM, stop accepting new connections, let the current request finish,
      // then close the db handle and exit 0.
      // First, so no new outbox drain or trash sweep starts while the grace window below runs
      // toward the db close. A sweep caught mid-batch leaves its rows leased, and the next boot
      // re-claims them once the lease expires.
      // Awaits the store close (PGlite flushes, removes its socket and releases its owner lock),
      // bounded like the default boot's (`closeWithinBound`, 4 s) so a hung close still exits.
      // The close itself first waits (2 s of that) for boot work still reading the store.
      // Idle keep-alive sockets don't block in-flight requests, but a client-pooled connection
      // that never sends another request WOULD block `server.close()`'s callback indefinitely
      // otherwise — better-sqlite3 is synchronous, so any genuinely in-flight request completes
      // within milliseconds, not seconds; a short grace window is more than enough before the
      // shared helper force-closes anything still lingering (BR-07 only promises the current
      // request finishes, not that an idle keep-alive socket outlives shutdown).
  const stopOutbox = () => outboxDrainer.stop();
  const stopTrash = () => trashSweeper.stop({});
  closeStoreOnShutdown({
    store: { storage: owned.bootResult.storage, close: () => closeSiteDirBoot(owned.bootResult, { composed: owned.composedStore }) },
    onShutdown: shutdownAssistantDaemon,
  }, {
    registerStop: ({ stop }, _optional = {}) => { stopRef.requestStop = stop; },
    bootWork: () => owned.bootWork,
    stopServing: () => stopServingWithinGrace({ server, workers: [
      { stop: () => daemonCallback.close() }, { stop: stopOutbox }, { stop: stopTrash }, themeWatcher, formPullTrigger, postGoLiveSweep, webhookDeliveryWorker, domainBindingSweeper, siteSearchMaintenance,
    ] }),
    // Opt-in (the desktop on Windows): an ignored or terminal stdin must never stop the site.
    stopOnEnd: process.env.TOVU_STOP_ON_STDIN_EOF === "1" ? process.stdin : undefined,
  });
}

/** Everything that happens once the listener is bound; `resolve` fires after the startup line is printed. */
async function onListening({ context, server, resolve, reject }: { context: ServeListenContext; server: import("node:http").Server; resolve: () => void; reject: (error: unknown) => void }): Promise<void> {
  const { input, target, owned, deps, serving, listen } = context;
  const { host, port } = listen;
  const siteApiOrigin = pinSiteListenerOrigin({ scheme: "http", host, port: (server.address() as import("node:net").AddressInfo).port });
  const daemonCallback = await startSiteDaemonListener({ publicOrigin: siteApiOrigin, handler: serving.app });
  owned.workers.push({ stop: () => daemonCallback.close() });
  server.once("close", () => { void daemonCallback.close(); });
  try { owned.runningLease.ready({ port }); }
  catch (error) { server.close(); reject(error); return; }
  announceStartup({ input, target, workspaceId: owned.bootResult.workspaceId, host, port });
  resolve();
  launchAssistantDaemon({ context: { ...context, deps }, siteApiOrigin, daemonCallback });
  installShutdown({ context, server, daemonCallback });
}

/** Binds the listener and resolves once the startup line has been printed; rejects on a bind or startup failure. */
function listenOnce({ context }: { context: ServeListenContext }): Promise<void> {
  const { serving, listen } = context;
  const { host, port } = listen;
  return new Promise<void>((resolve, reject) => {
    // Express's own `.listen()` overloads type `hostname` as a required `string`, not
    // `string | undefined` (`@types/express-serve-static-core`) — so `host === undefined` (the
    // "no TOVU_HOST override, use Node's own all-interfaces default" case) is routed to the
    // callback-only overload explicitly, rather than widening the type with a cast.
    const server = host !== undefined ? serving.app.listen(port, host) : serving.app.listen(port);
    server.once("close", () => { void serving.themeWatcher.stop(); });

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
        reject(new PortInUseError({ message: `Port ${port} is already in use.`, port: port }));
      } else {
        reject(err);
      }
    });

    server.once("listening", () => {
      void onListening({ context, server, resolve, reject }).catch(error => { server.close(); reject(error); });
    });
  });
}

/** Creates the serving app, binds it and installs the shutdown; resolves once the site is listening. */
export async function serveListening({ input, target, owned, optional, deps, listen }: { input: RunServeCommandInput; target: string; owned: ServeOwnership; optional: RunServeCommandOptional; deps: ServeDeps; listen: ServeListenContext["listen"] }): Promise<void> {
  const stopRef: StopRef = {};
  const serving = startServing({ optional, deps, owned, stopRef });
  await listenOnce({ context: { input, target, owned, deps, serving, stopRef, listen } });
}
