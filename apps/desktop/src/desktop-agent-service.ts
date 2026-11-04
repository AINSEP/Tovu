/** One cold Jini supervisor per desktop instance. Sites retain tools and durable authority. */
import { spawn as nodeSpawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { redactSecrets } from "@jini-ai/core";
import { createRedactedOutputSink } from "../../website/src/platform/server-logs/console-tee.ts";
import { redactLocalText } from "../../website/src/platform/server-logs/redact-local-text.ts";
import { createDaemonSupervisor, type DaemonSupervisorRequired } from "@jini-ai/sidecar/supervisor";
import { createRespawnPolicy } from "@jini-ai/sidecar/respawn-policy";
import { createNodeDaemonProcessAdapter, createNodeIpcChannel, createNodeSupervisorScheduler, createSupervisorRegistry,
  type NodeDaemonProcessOptions, type SupervisorRegistry } from "@jini-ai/sidecar/supervisor/node";
import { daemonControlRequest, daemonEndpoint, type DaemonSiteRegistration } from "../../website/src/server/runtime/lifecycle/assistant-daemon-connection.ts";
import { AGENT_DAEMON_EXIT_CODE } from "../../website/src/assistant/daemon-exit-codes.ts";
import type { CliMode } from "./startup-env.ts";

export interface DesktopAgentServiceOptions {
  readonly spawn?: NodeDaemonProcessOptions["spawn"];
  readonly registry?: SupervisorRegistry;
  readonly terminate?: DaemonSupervisorRequired["terminateProcess"];
  readonly stdout?: NodeDaemonProcessOptions["stdout"];
  readonly stderr?: NodeDaemonProcessOptions["stderr"];
}

/** Select only process-wide launch facts for the shared daemon.
 * @complexity O(e) in the fixed environment allowlist; O(e) space.
 */
function buildDaemonSpawnEnv({ env, registryPath }: { env: NodeJS.ProcessEnv; registryPath: string }, _options = {}): NodeJS.ProcessEnv {
  // A process-wide daemon must never inherit any site's configuration or credentials. Site
  // snapshots travel only over the actual child's inherited channel, after bootstrap binding.
  const spawnEnv: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "Path", "HOME", "USERPROFILE", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL", "TOVU_AGENT_DAEMON_IDLE_MINUTES", "TOVU_DAEMON_LIFECYCLE_LOG"]) {
    if (env[key] !== undefined) spawnEnv[key] = env[key];
  }
  Object.assign(spawnEnv, { ELECTRON_RUN_AS_NODE: "1", TOVU_PARENT_PID: String(process.pid), TOVU_AGENT_DAEMON_REGISTRY_PATH: registryPath });
  return spawnEnv;
}

/** Reject a registration for any directory other than the owned server's.
 * @complexity O(n) in directory path length.
 */
function assertSiteDirectory({ directory, siteDir }: { directory: string | undefined; siteDir: string }, _options = {}): void {
  if (path.resolve(directory ?? "") !== path.resolve(siteDir)) throw new Error("site directory mismatch");
}

/** Bind process launch to existing instance discovery and the existing retry/parking owner.
 * @param required Product root, per-instance registry path and launch facts; no site authority.
 * @param optional Native effects for process-count/IPC regression tests.
 * @returns Site demand/withdraw, owned-child binding and terminal shutdown. Construction is cold.
 * @throws On invalid child-bound site identity, failed scope initialization or bounded IPC failure.
 * @complexity O(e) spawn env selection; O(s) scope memory for s owned sites; one daemon child.
 */
export function createDesktopAgentService({ repoRoot, registryPath, cliMode = "compiled", env = process.env }: {
  repoRoot: string; registryPath: string; cliMode?: CliMode; env?: NodeJS.ProcessEnv;
}, optional: DesktopAgentServiceOptions = {}) {
  const registry = optional.registry ?? createSupervisorRegistry({ registryPath });
  const spawnEnv = buildDaemonSpawnEnv({ env, registryPath });
  const entry = path.join(repoRoot, cliMode === "source" ? "apps/website/src/server/inbound/assistant/agent-daemon-server.ts" : "dist/src/server/inbound/assistant/agent-daemon-server.js");
  const args = cliMode === "source" ? [
    "--import", `${pathToFileURL(path.join(repoRoot, "development/scripts/prune-tsx-cache.mjs")).href}?prune`,
    "--import", pathToFileURL(path.join(repoRoot, "development/scripts/dev-tsx-loader.mjs")).href,
    "--import", pathToFileURL(path.join(repoRoot, "development/scripts/dev-source-maps-off.mjs")).href, entry,
  ] : [entry];
  let channel: ReturnType<typeof createNodeIpcChannel> | undefined;
  let daemonPid: number | undefined;
  let stopWork: Promise<void> = Promise.resolve();
  let stopping = false;
  type Site = { config: DaemonSiteRegistration; token: string; host?: typeof channel; ready?: Promise<{ url: string; pid: number; token: string }> };
  const sites = new Map<string, Site>();
  const bindings = new Set<() => void>();
  const notices = new Set<(pid: number) => void>();
  const withdrawals = new Map<string, Promise<void>>();
  // Frame first, then use the existing redactors. Site capabilities have no recognizable shape;
  // cover their exact values too. Work is bounded by a framed line and the registered sites.
  const redact = (text: string) => redactLocalText({ text: redactSecrets({ input: text }, {
    exactSecrets: [...sites.values()].flatMap(site => [site.token, site.config.token]), redactPii: false,
  }) });
  const processPorts = createNodeDaemonProcessAdapter({ command: process.execPath, args, cwd: repoRoot, env: spawnEnv, registry }, {
    ipc: true,
    stdout: createRedactedOutputSink({ sink: optional.stdout ?? process.stdout, redact }),
    stderr: createRedactedOutputSink({ sink: optional.stderr ?? process.stderr, redact }),
    spawn(input) {
      const child = optional.spawn ? optional.spawn(input, {}) : nodeSpawn(input.command, input.args, input.options);
      channel?.dispose({});
      channel = createNodeIpcChannel({ peer: child }); daemonPid = child.pid;
      child.once("exit", () => {
        if (daemonPid !== child.pid) return;
        channel?.dispose({}); daemonPid = undefined;
        if (child.pid !== undefined) for (const notify of notices) notify(child.pid);
      });
      return child;
    },
  });
  const supervisor = createDaemonSupervisor({ ...processPorts,
    terminateProcess(input) { stopWork = Promise.resolve((optional.terminate ?? processPorts.terminateProcess)(input)); return stopWork; },
    policy: createRespawnPolicy({ now: Date.now }), now: Date.now, scheduler: createNodeSupervisorScheduler({}),
    classifyExit: ({ code }) => ({ isPortConflict: code === AGENT_DAEMON_EXIT_CODE.PORT_IN_USE, reason: "desktop agent daemon exited" }),
    failureReporter: { clear() {}, record() { console.warn("[desktop-agent-service] daemon unavailable"); } },
    logger: { emit(event) { console.log(`[desktop-agent-service] ${event.type}`); } },
    readiness: { async isReady({ pid }) {
      if (!channel || daemonPid !== pid) return false;
      // Publication follows listener/control initialization. Reuse Jini's atomic discovery before
      // sending the first request, including source boots whose imports are still loading.
      if ((await registry.readLive())?.pid !== pid) return false;
      const endpoint = daemonEndpoint.parse(await channel.request({ payload: { operation: "ready" } }, {}));
      return endpoint.pid === pid;
    } },
  }, { parkedExitCodes: [AGENT_DAEMON_EXIT_CODE.IDLE_PARK] });

  /** An equal workspace is not permission to replace another bound server's configuration. */
  function assertSiteBinding({ site, config }: { site: Site | undefined; config: DaemonSiteRegistration }): void {
    if (!site) return;
    if (path.resolve(site.config.env.TOVU_SITE_DIR ?? "") !== path.resolve(config.env.TOVU_SITE_DIR ?? "")) throw new Error("workspace already belongs to another directory");
    if (site.config.token !== config.token) throw new Error("site scope belongs to another server boot");
  }
  /** Rotate a site's callback capability when its daemon channel changes.
   * @complexity O(1) time and space.
   */
  function refreshSiteHost({ site }: { site: Site }, _options = {}): void {
    if (site.host !== channel) { site.host = channel; site.token = randomUUID(); delete site.ready; }
  }
  async function demand(config: DaemonSiteRegistration, _optional = {}) {
    if (stopping) throw new Error("desktop agent service is stopping");
    await withdrawals.get(config.siteId);
    let site = sites.get(config.siteId);
    assertSiteBinding({ site, config });
    if (!site) {
      site = { config: { ...config, env: { ...config.env } }, token: randomUUID() };
      sites.set(config.siteId, site);
    }
    await supervisor.ensureReady({}, {});
    if (stopping || sites.get(config.siteId) !== site) throw new Error("site scope was withdrawn");
    if (!channel || !daemonPid) throw new Error("daemon IPC unavailable");
    refreshSiteHost({ site });
    if (!site.ready) {
      const owned = site;
      const host = channel;
      const request = { operation: "register", ...site.config, env: { ...site.config.env, TOVU_AGENT_DAEMON_TOKEN: site.token } };
      site.ready = channel.request({ payload: request }, {}).then(value => {
        const endpoint = daemonEndpoint.parse(value);
        if (stopping || sites.get(config.siteId) !== owned || channel !== host || endpoint.pid !== daemonPid) throw new Error("stale daemon readiness");
        return { ...endpoint, token: owned.token };
      }).catch((error: unknown) => { delete owned.ready; throw error; });
    }
    return site.ready;
  }

  async function withdraw({ siteId }: { siteId: string }, _optional = {}): Promise<void> {
    if (!sites.delete(siteId) || !channel || !supervisor.isReady()) return;
    const work = channel.request({ payload: { operation: "withdraw", siteId } }, {}).then(() => {});
    withdrawals.set(siteId, work);
    try { await work; } finally { if (withdrawals.get(siteId) === work) withdrawals.delete(siteId); }
  }

  /** Bind control to an actual owned server; readiness supplies its authenticated workspace ID.
   * Attached handles never enter here, so attachment keeps using the owner's daemon binding. */
  function bindServer({ child, siteDir }: { child: ChildProcess; siteDir: string }, _optional = {}) {
    let workspaceId: string | undefined;
    let closed = false;
    const control = createNodeIpcChannel({ peer: child }, { handle: async payload => {
      if (closed) throw new Error("site server disconnected");
      const request = daemonControlRequest.parse(payload);
      if (request.operation === "parking") { supervisor.markParking({ pid: request.pid }, {}); return {}; }
      if (request.operation === "ready" || request.operation === "unavailable") throw new Error("unexpected site control");
      if (!workspaceId || request.siteId !== workspaceId) throw new Error("site identity is not bound");
      if (request.operation === "withdraw") { await withdraw({ siteId: workspaceId }); return {}; }
      assertSiteDirectory({ directory: request.env.TOVU_SITE_DIR, siteDir });
      return demand(request, {});
    } });
    const notify = (pid: number) => { void control.request({ payload: { operation: "unavailable", pid } }, {}).catch(() => {}); };
    notices.add(notify);
    function dispose(): void {
      if (closed) return;
      closed = true; control.dispose({}); bindings.delete(dispose); notices.delete(notify);
      if (workspaceId) void withdraw({ siteId: workspaceId }).catch(() => console.warn("[desktop-agent-service] scope withdrawal failed"));
    }
    bindings.add(dispose); child.once("exit", dispose); child.once("disconnect", dispose);
    return { setIdentity({ siteId }: { siteId: string }, _options = {}) { workspaceId = siteId; }, dispose };
  }
  return { demand, withdraw, bindServer,
    async shutdown(_required: Record<string, never>, _optional = {}): Promise<void> {
      stopping = true;
      for (const dispose of bindings) dispose();
      supervisor.shutdown(); await stopWork; channel?.dispose({}); sites.clear();
    },
  };
}
export type DesktopAgentService = ReturnType<typeof createDesktopAgentService>;
