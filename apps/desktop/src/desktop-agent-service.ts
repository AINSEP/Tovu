/** One cold Jini supervisor per desktop instance. Sites retain tools and durable authority. */
import { spawn as nodeSpawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { redactSecrets } from "@jini-ai/core";
import { createRedactedOutputSink } from "../../website/src/platform/server-logs/console-tee.ts";
import { redactLocalText } from "../../website/src/platform/server-logs/redact-local-text.ts";
import { createDaemonSupervisor, type DaemonSupervisorRequired } from "@jini-ai/sidecar/supervisor";
import { createRespawnPolicy } from "@jini-ai/sidecar/respawn-policy";
import { createNodeDaemonProcessAdapter, createNodeIpcChannel, createNodeSupervisorScheduler, createSupervisorRegistry,
  type NodeDaemonProcessOptions, type SupervisorRegistry } from "@jini-ai/sidecar/supervisor/node";
import { daemonControlRequest, daemonEndpoint, siteIdleStopReply, type DaemonSiteRegistration } from "../../website/src/server/runtime/lifecycle/assistant-daemon-connection.ts";
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

/** Only known control failures cross the site IPC boundary; never echo credentials or payloads. */
function siteControlRefusal({ error }: { error: unknown }, _options = {}): string | undefined {
  const reasons: Record<string, string> = {
    "site scope belongs to another server boot": "The assistant service still holds an older copy of this site. Restart the site or the app.",
    "site scope already belongs to another directory": "The assistant service has this site key assigned to another directory. Restart the app.",
    "site directory mismatch": "The assistant service received a different site directory. Restart the site.",
    "site identity is not bound": "The site is still starting. Try your message again in a moment.",
    "desktop agent service is stopping": "The assistant service is shutting down. Restart the app.",
    "site scope was withdrawn": "The site stopped while its assistant was starting. Restart the site and send again.",
    "daemon IPC unavailable": "The assistant service lost its connection. Restart the site or the app.",
  };
  if (!(error instanceof Error)) return undefined;
  return Object.hasOwn(reasons, error.message) ? reasons[error.message] : undefined;
}

/** The shared daemon's routing key for one launched site server: its directory, canonicalized.
 * Not the workspace id — every local site is `workspace-local`, so keying by it let only the first
 * running site own a scope. Not `.site-meta.json`'s siteId either: a copied site carries the same one.
 * Hashed so the key is bounded and the URL path never carries the owner's directory.
 * @complexity O(n) in directory path length; one realpath call.
 */
export function siteScopeKey({ siteDir }: { siteDir: string }, _options = {}): string {
  let canonical = path.resolve(siteDir);
  try { canonical = fs.realpathSync.native(canonical); } catch { /* an absent dir still has one resolved spelling */ }
  // Windows paths are case-insensitive; one site must not get two scopes from two spellings.
  if (process.platform === "win32") canonical = canonical.toLowerCase();
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
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
    "--optimize-for-size",
    "--import", `${pathToFileURL(path.join(repoRoot, "development/scripts/prune-tsx-cache.mjs")).href}?prune`,
    "--import", pathToFileURL(path.join(repoRoot, "development/scripts/dev-tsx-loader.mjs")).href,
    "--import", pathToFileURL(path.join(repoRoot, "development/scripts/dev-source-maps-off.mjs")).href, entry,
  ] : ["--optimize-for-size", entry];
  let channel: ReturnType<typeof createNodeIpcChannel> | undefined;
  let daemonPid: number | undefined;
  let stopWork: Promise<void> = Promise.resolve();
  let stopping = false;
  type ScopedSite = DaemonSiteRegistration & { scopeKey: string };
  type Site = { config: ScopedSite; token: string; server?: ChildProcess; host?: typeof channel; ready?: Promise<{ url: string; pid: number; token: string }> };
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

  /** An equal scope key is not permission to replace another bound server's configuration. */
  function assertSiteBinding({ site, config }: { site: Site | undefined; config: ScopedSite }, { allowDifferentBoot = false } = {}): void {
    if (!site) return;
    if (path.resolve(site.config.env.TOVU_SITE_DIR ?? "") !== path.resolve(config.env.TOVU_SITE_DIR ?? "")) throw new Error("site scope already belongs to another directory");
    if (!allowDifferentBoot && site.config.token !== config.token) throw new Error("site scope belongs to another server boot");
  }
  /** Node exit facts, rather than IPC connectivity or a sent signal, establish boot death. */
  function hasServerExited({ server }: { server: ChildProcess }, _options = {}): boolean {
    return server.exitCode != null || server.signalCode != null;
  }
  /** Do not create a scope for a boot that exited while earlier withdrawals were draining. */
  function assertDemandAllowed({ server }: { server?: ChildProcess }, _options = {}): void {
    if (stopping) throw new Error("desktop agent service is stopping");
    if (server && hasServerExited({ server })) throw new Error("site scope was withdrawn");
  }
  /** Recover a missed exit only for the same directory and a child confirmed dead. Disconnect and
   * a requested kill do not prove death. Await remote disposal before sending a replacement config.
   * @complexity O(n) in directory length; one bounded IPC withdrawal.
   */
  async function withdrawStaleBinding({ config }: { config: ScopedSite }, _options = {}): Promise<void> {
    const site = sites.get(config.scopeKey);
    if (!site?.server || site.config.token === config.token) return;
    assertSiteBinding({ site, config }, { allowDifferentBoot: true });
    const server = site.server;
    if (hasServerExited({ server })) {
      await withdraw({ scopeKey: config.scopeKey }, { server });
    }
  }
  /** Rotate a site's callback capability when its daemon channel changes.
   * @complexity O(1) time and space.
   */
  function refreshSiteHost({ site }: { site: Site }, _options = {}): void {
    if (site.host !== channel) { site.host = channel; site.token = randomUUID(); delete site.ready; }
  }
  /** Sites are keyed by `scopeKey`; `siteId` travels unchanged as the scope's workspace id. */
  async function demand(config: ScopedSite, { server }: { server?: ChildProcess } = {}) {
    assertDemandAllowed({ server });
    await withdrawStaleBinding({ config });
    await withdrawals.get(config.scopeKey);
    assertDemandAllowed({ server });
    let site = sites.get(config.scopeKey);
    assertSiteBinding({ site, config });
    if (!site) {
      site = { config: { ...config, env: { ...config.env } }, token: randomUUID(), server };
      sites.set(config.scopeKey, site);
    }
    await supervisor.ensureReady({}, {});
    if (stopping || sites.get(config.scopeKey) !== site) throw new Error("site scope was withdrawn");
    if (!channel || !daemonPid) throw new Error("daemon IPC unavailable");
    refreshSiteHost({ site });
    if (!site.ready) {
      const owned = site;
      const host = channel;
      const request = { operation: "register", ...site.config, env: { ...site.config.env, TOVU_AGENT_DAEMON_TOKEN: site.token } };
      site.ready = channel.request({ payload: request }, {}).then(value => {
        const endpoint = daemonEndpoint.parse(value);
        if (stopping || sites.get(config.scopeKey) !== owned || channel !== host || endpoint.pid !== daemonPid) throw new Error("stale daemon readiness");
        return { ...endpoint, token: owned.token };
      }).catch((error: unknown) => { delete owned.ready; throw error; });
    }
    return site.ready;
  }

  /** Remove only the requesting boot's scope; a late exit must never evict a replacement.
   * @complexity O(1) local work and one bounded daemon request.
   */
  async function withdraw({ scopeKey }: { scopeKey: string }, { server }: { server?: ChildProcess } = {}): Promise<void> {
    const site = sites.get(scopeKey);
    if (!site) return;
    if (server && site.server !== server) return;
    sites.delete(scopeKey);
    if (!channel || !supervisor.isReady()) return;
    const work = channel.request({ payload: { operation: "withdraw", siteId: site.config.siteId, scopeKey } }, {}).then(() => {});
    withdrawals.set(scopeKey, work);
    try { await work; } finally { if (withdrawals.get(scopeKey) === work) withdrawals.delete(scopeKey); }
  }

  /** Bind control to an actual owned server; readiness supplies its authenticated workspace ID.
   * Attached handles never enter here, so attachment keeps using the owner's daemon binding.
   * The scope key comes from the directory this desktop launched, so a server cannot pick another's. */
  function bindServer({ child, siteDir }: { child: ChildProcess; siteDir: string }, _optional = {}) {
    const scopeKey = siteScopeKey({ siteDir });
    let workspaceId: string | undefined;
    let closed = false;
    async function handleControl(payload: unknown) {
      if (closed) throw new Error("site server disconnected");
      const request = daemonControlRequest.parse(payload);
      if (request.operation === "parking") { supervisor.markParking({ pid: request.pid }, {}); return {}; }
      if (request.operation === "ready" || request.operation === "unavailable" || request.operation === "stopIfIdle") throw new Error("unexpected site control");
      if (!workspaceId || request.siteId !== workspaceId) throw new Error("site identity is not bound");
      if (request.operation === "withdraw") { await withdraw({ scopeKey }, { server: child }); return {}; }
      assertSiteDirectory({ directory: request.env.TOVU_SITE_DIR, siteDir });
      return demand({ ...request, scopeKey }, { server: child });
    }
    const control = createNodeIpcChannel({ peer: child }, { handle: async payload => {
      try { return await handleControl(payload); }
      catch (error) {
        const refusalReason = siteControlRefusal({ error });
        if (!refusalReason) throw error;
        // Only the explicit public reason crosses Jini's refusal transport; the control call fails.
        throw Object.assign(new Error(refusalReason), { refusalReason });
      }
    } });
    const notify = (pid: number) => { void control.request({ payload: { operation: "unavailable", pid } }, {}).catch(() => {}); };
    notices.add(notify);
    function dispose(): void {
      if (closed) return;
      closed = true; control.dispose({}); bindings.delete(dispose); notices.delete(notify);
    }
    // The main process owns exit cleanup for stops AND crashes. The site supervisor intentionally
    // suppresses deliberate-stop notices, and a dying server may never deliver its own withdrawal.
    child.once("exit", () => {
      dispose();
      void withdraw({ scopeKey }, { server: child }).catch(error => console.warn(`[desktop-agent-service] scope withdrawal failed: ${String(error)}`));
    });
    bindings.add(dispose); child.once("disconnect", dispose);
    return { setIdentity({ siteId }: { siteId: string }, _options = {}) { workspaceId = siteId; }, dispose,
      /** Ask on this boot's existing channel. A timeout, refusal or disposed channel is busy.
       * This never withdraws: only the P0 child-exit path has proof the scope can be removed.
       * @complexity O(1), one bounded IPC request.
       */
      async stopIfIdle(_required = {}, _options = {}): Promise<boolean> {
        if (closed) return false;
        try {
          const reply = await control.request({ payload: { operation: "stopIfIdle" } }, {});
          return siteIdleStopReply.parse(reply).idle;
        } catch { return false; }
      },
    };
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
