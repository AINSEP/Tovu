/** One desktop-owned listener, or the same host with one standalone scope (ADR-070). */
import express from "express";
import type { SiteScopeKey } from "@tovu/contracts/site-scope-key";
import { createSupervisorRegistry, createNodeIpcChannel } from "@jini-ai/sidecar/supervisor/node";
import { createSiteScope } from "./agent-daemon-scope.js";
import { createAgentDaemonIdlePark } from "./agent-daemon-idle-park.js";
import { createScopeControl, requireScopeKey } from "./agent-daemon-scope-control.js";
import { isDaemonLifecycleLogQuiet } from "../../runtime/lifecycle/daemon-lifecycle-log.js";
import { closeWithinBound, stopServingWithinGrace } from "../../runtime/lifecycle/close-store-on-shutdown.js";
import { installUnhandledRejectionGuard } from "../../runtime/boot/process-error-guards.js";
import { installServerLogCapture } from "../../../platform/server-logs/index.js";
import { processBuildRelease, telemetryEnvironment } from "../../runtime/composition/build-release.js";
import { AGENT_DAEMON_EXIT_CODE } from "#src/assistant/daemon-exit-codes";
import { TOOL_EXEC_TOKEN_ENV_VAR } from "#src/assistant/daemon-access";
import { initializeStartupSecrets, startupSecretEnvironment } from '../../runtime/boot/startup-secrets.js';
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";

const scopes = new Map<SiteScopeKey, Promise<Awaited<ReturnType<typeof createSiteScope>>>>();
const scopeEnvironments = new Map<SiteScopeKey, string>();
const scopedExchanges = new Map<SiteScopeKey, () => boolean>();
// Standalone launch also has IPC now, solely for startup credentials. It retains its own
// fixed listener/root scope; the desktop's shared host still receives scopes through control.
const sharedHost = Boolean(process.send) && process.env.TOVU_AGENT_DAEMON_STANDALONE !== '1';
let listenerUrl = "";
// A standalone manual daemon has no discovery path; the supervisor supplies the scoped path.
const daemonRegistryPath = process.env.TOVU_AGENT_DAEMON_REGISTRY_PATH;
const daemonRegistry = daemonRegistryPath ? createSupervisorRegistry({ registryPath: daemonRegistryPath }) : undefined;
let registryPublication: Promise<void> = Promise.resolve();
let daemonExiting = false;
let stopIdleMonitor = () => {};
let stopDaemonServing: () => Promise<void> = async () => {};

/** Wait for an in-flight publication before removing our pointer: fsync may reject AFTER rename,
 * so even a failed publication can already be visible. Ownership guarding prevents an old daemon
 * from erasing a replacement daemon's record during a fast restart. The durability and race
 * rationale lives in @jini-ai/sidecar's daemon-registry and json-file implementations. */
async function exitDaemon(exitCode: number): Promise<void> {
  if (daemonExiting) return;
  daemonExiting = true;
  stopIdleMonitor();
  await closeWithinBound(async () => {
    await stopDaemonServing();
    // Before the store closes, which flushes and disposes the provider plugins' sinks.
    await Promise.allSettled([...scopes.values()].map(scope => scope.then(value => value.dispose({}, {}))));
    await registryPublication.catch(() => undefined);
    try {
      await daemonRegistry?.removeIfCurrent({ pid: process.pid });
    } catch (error) {
      console.error("[agent-daemon] failed to remove its discovery record", error);
    }

    // The retained client owns content/chat; process.exit alone leaves WALs. The site server
    // alone owns its ops journal and providers. Drain this daemon before closing its client.

  }, { label: "the agent daemon store" });
  process.exit(exitCode);
}

// Keep the conventional signal exit codes while giving the owned discovery record cleanup.
// Jini's tree-stop signals the group, then each PID. Keep listeners installed so a second
// SIGTERM cannot take Node's default immediate-exit path while the first is closing databases.
process.on("SIGTERM", () => { void exitDaemon(143); });
process.on("SIGINT", () => { void exitDaemon(130); });

// Windows has no graceful signal: Jini's sidecar closes its stdin pipe to run the same disposal.
if (process.env.JINI_STOP_ON_STDIN_EOF === "1") {
  process.stdin.once("end", () => { void exitDaemon(0); });
  // A paused stream never reports EOF.
  process.stdin.resume();
}

/**
 * Self-termination watchdog, 2026-08-05 (`ADS-memory/reports/analysis/2026-08-05-e2e-teardown-root-cause.md`).
 *
 * `daemon-supervisor.ts`'s `spawnRealDaemonProcessFor` puts this process in its own detached
 * process group specifically so it CAN be reaped independently (see that function's own comment) —
 * but that only works if the supervisor gets a chance to run its own shutdown-time kill. Confirmed
 * live, twice, two different ways: Playwright's default `webServer` teardown skips straight to an uncatchable
 * `SIGKILL` unless opted out of (fixed at that source, `development/playwright.admin.config.ts`'s
 * `gracefulShutdown`), and — separately, still unfixed at its own source — an external `SIGTERM`
 * sent straight to Playwright's own top-level CLI process never invokes `teardown()` at all,
 * bypassing `gracefulShutdown` too. Direct repro of the second case: the daemon was still fully
 * alive and bound to its port, completely unchanged, 30+ seconds after that kill, with zero
 * self-cleanup. Any such case — including a plain `kill -9` of `src/index.ts`, or a CI/agent
 * timeout wrapper killing it outside its own signal handlers — leaves this process orphaned with
 * nothing left to reap it. This watchdog is the last line of defense: detect that independently,
 * from inside this process, rather than depending on anything outside it to notice.
 *
 * Why the OS's own `process.ppid` cannot be that signal: `daemon-supervisor.ts`'s dev-mode spawn is
 * a 3-hop `npx -> tsx -> node` chain, and confirmed live via `ps` that none of those three
 * exec-replaces itself — all three stay alive for the whole run. This process's actual `ppid`
 * therefore resolves to the middle `tsx` hop, not to `src/index.ts`'s own process, so watching
 * `ppid` would watch the wrong ancestor. `daemon-supervisor.ts` instead passes the true one
 * explicitly via `TOVU_PARENT_PID`.
 *
 * Opt-in by construction, not by a feature flag: `TOVU_PARENT_PID` is set by exactly one caller
 * (`daemon-supervisor.ts` — confirmed the only spawner of this file). A manual/standalone boot of
 * this file (local debugging, or any test that spawns it directly without that env var) gets no
 * watchdog at all, unchanged from before this existed — there is no ambient "parent" to watch in
 * that case, and none is invented.
 *
 * Does not fight the legitimate long-lived case it might look like it conflicts with: `npm run
 * dev`'s `tsx watch src/index.ts` intentionally kills and restarts the API process on every source
 * change, and a fresh daemon is spawned fresh for the fresh process each time. On a NORMAL
 * restart, the OLD `index.ts` process receives a real, catchable signal, and ITS `reap()` already
 * kills this process directly — this watchdog is redundant on that path, not in conflict with it;
 * a process already mid-exit tolerates an overlapping second kill/self-exit with no ill effect.
 * This function only ever does something on the path `reap()` cannot reach: when it never runs.
 */
function startParentWatchdog(): void {
  const raw = process.env.TOVU_PARENT_PID;
  if (raw === undefined) return;
  const parentPid = Number(raw);
  if (!Number.isInteger(parentPid) || parentPid <= 0) {
    console.error(`[agent-daemon] TOVU_PARENT_PID="${raw}" is not a valid pid — parent watchdog disabled`);
    return;
  }

  // 3s: fast enough that a leaked port closes long before it could collide with a LATER boot
  // attempt (the EADDRINUSE/degraded-boot failure mode this exists to prevent — see this file's
  // module doc), slow enough that a background liveness poll costs nothing meaningful against a
  // process that spends most of its time idle between real requests. Not `.unref()`'d: unlike
  // `development/scripts/dev.mjs`'s own shutdown timer (which legitimately wants to stop blocking
  // an exit already in progress), this interval's entire job is to keep this process alive and
  // watching for as long as its parent is — letting it fall out of the event loop on its own would
  // undermine the one thing it exists to do.
  const POLL_INTERVAL_MS = 3_000;
  setInterval(() => {
    try {
      // Signal `0` sends nothing; it is the standard Node/POSIX idiom for "does this pid still
      // exist", with no side effect on the target process either way.
      process.kill(parentPid, 0);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ESRCH") {
        // Anything other than "no such process" (e.g. a transient EPERM) is inconclusive, not a
        // confirmed death — skip this poll rather than risk a false-positive self-kill on a parent
        // that is actually still alive.
        return;
      }
      console.error(
        `[agent-daemon] parent process ${parentPid} is gone and reap() never reached this process — self-terminating`,
      );
      void exitDaemon(1);
    }
  }, POLL_INTERVAL_MS);
}
// Armed as early as possible — before any of the slower boot work below (SQLite open, MCP
// federation, `createDiskAttachmentStore`) — so a parent death during THIS process's own boot is
// caught too, not only once it has reached steady state.
startParentWatchdog();

// Fixes a live-found crash (2026-08-16, source-control/commit-site.ts's own header has the full
// account): an unhandled async rejection anywhere beneath a route/tool handler in THIS process used
// to take the whole daemon down, not just the one call that triggered it — same Express-4-catches-
// nothing shape `process-error-guards.ts`'s own header documents for `index.ts`'s main process,
// just reached here via a tool handler instead of an HTTP route. Placed immediately after the
// watchdog above, before any real I/O (opening this process's own SQLite connection, federating MCP
// tools) — same "as early as possible" rationale, and the same placement `index.ts`'s `main()` uses
// for its own call to this function.
//
// This process needs its OWN guard, not merely inherited coverage from `index.ts`'s: it is a
// SEPARATE OS process (`daemon-supervisor.ts`'s `child_process.spawn`). CORRECTED 2026-08-16: this
// used to say a crash here has no restart path at all — that stopped being true the day
// `daemon-supervisor.ts` shipped automatic respawn with backoff, so leaving the old claim would
// have been exactly the kind of stale, provably-false comment this codebase has already been
// burned by once (see `verifyPublishCredentialById`'s "never throws" incident). What's still true,
// and is the actual reason this guard remains load-bearing: a crash here is never free. Every
// unhandled rejection still means a real gap in assistant availability while the supervisor's
// backoff runs (escalating up to 30s between attempts), and a REPEATED crash from the same
// unguarded code path will burn through the supervisor's crash-loop cap and give up retrying
// altogether — at which point the assistant stays down for every workspace until an operator uses
// the manual restart seam (`restartAssistantDaemon`) or notices and restarts Tovu by hand. Closing
// today's one known unguarded path (`commit-site.ts`'s `resolveDefaultForSourceControl` call) fixes
// today's incident; this guard is the same "fleet-wide" backstop `process-error-guards.ts`'s header
// argues for on the main process, applied here for the identical reason — this codebase has no lint
// rule or type check that would catch the NEXT unguarded decrypt/async call in some future
// tool-registration handler.
installUnhandledRejectionGuard();

// Server log capture (gap A-04, L2): this process keeps its own console output (true levels — its
// piped stderr cannot tell its `console.error` breadcrumbs from real errors). Shared process
// output belongs to the desktop instance: attaching its console to one site's daemon.log would
// disclose the other sites' diagnostics. Site telemetry/tracing still use each scope's own sinks.
installServerLogCapture({ source: "daemon", release: processBuildRelease({}), environment: telemetryEnvironment({ env: process.env }) });

const app = express();
const idlePark = createAgentDaemonIdlePark({ isBusy: () => [...scopedExchanges.values()].some(isBusy => isBusy()), exit: code => { void exitDaemon(code); } }, { env: process.env });
stopIdleMonitor = () => idlePark.stop({}, {});
// Express removes the mount prefix before the existing scope middleware runs. A forged prefix
// therefore meets that scope's OWN bearer/run-credential gate before parsing or route effects.
// The path segment is the desktop's per-site scope key, never the (shared) workspace id.
app.use("/s/:scopeKey", (req, res, next) => {
  const pending = scopes.get(req.params.scopeKey as SiteScopeKey);
  if (!pending) { res.status(404).end(); return; }
  void pending.then(scope => scope.app(req, res, next)).catch(next);
});

const control = createScopeControl({ tables: { scopes, scopeEnvironments, scopedExchanges },
  createScope: input => createSiteScope(input, { idlePark }), hold: () => idlePark.hold({}, {}),
  listenerUrl: () => listenerUrl, pid: process.pid, isExiting: () => daemonExiting }, {});

async function start(): Promise<void> {
  await initializeStartupSecrets({}, {});
  // Shared hosts bind first so no runtime snapshots port 0 into its bridge injection.
  const port = sharedHost ? 0 : Number(process.env.JINI_AGENT_DAEMON_PORT ?? 4319);
  const server = app.listen(port, "127.0.0.1");
  stopDaemonServing = () => stopServingWithinGrace({ server, workers: [] });
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("daemon has no listening address");
  listenerUrl = `http://127.0.0.1:${address.port}`;
  if (!sharedHost) {
    // Standalone uses exactly the same factory and middleware at its historical root routes.
    const env = startupSecretEnvironment({ env: process.env });
    const siteId = env.TOVU_WORKSPACE;
    const token = env[TOOL_EXEC_TOKEN_ENV_VAR];
    if (!siteId || !token) throw new Error("standalone daemon requires its site binding");
    // A standalone process has one configured site; validate its directory before starting it.
    const scopeKey = requireScopeKey({ scopeKey: env.TOVU_SITE_DIR });
    const scope = createSiteScope({ siteId, env: { ...env, JINI_AGENT_DAEMON_URL: listenerUrl,
      TOVU_SITE_PROCESS_CWD: process.env.TOVU_SITE_PROCESS_CWD ?? process.cwd() }, token }, { idlePark });
    scopes.set(scopeKey, scope);
    const ready = await scope;
    scopedExchanges.set(scopeKey, ready.hasExchanges); app.use(ready.app);
  }
  if (daemonExiting) return;
  registryPublication = daemonRegistry?.write({ record: {
    url: listenerUrl, host: "127.0.0.1", port: address.port, pid: process.pid, startedAt: new Date().toISOString(),
  } }) ?? Promise.resolve();
  await registryPublication;
  idlePark.start({}, {});
  if (!isDaemonLifecycleLogQuiet()) console.log(`[agent-daemon] listening on ${listenerUrl}`);
}
const startup = start();
if (process.send) {
  const channel = sharedHost ? createNodeIpcChannel({ peer: process }, { handle: async payload => { await startup; return control(payload); } }) : undefined;
  process.once("disconnect", () => { channel?.dispose({}); void exitDaemon(0); });
}
void startup.catch(error => {
  // Never forward a bootstrap/control payload (which contains per-site secrets) into diagnostics.
  console.error("[agent-daemon] failed to start", redactSecretShapes({ text: error instanceof Error ? error.message : "startup failed" }).text);
  void exitDaemon((error as NodeJS.ErrnoException).code === "EADDRINUSE" ? AGENT_DAEMON_EXIT_CODE.PORT_IN_USE : 1);
});
