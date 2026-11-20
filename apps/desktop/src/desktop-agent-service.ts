import { describeErrorForLog } from "@jini-ai/core/model-facing-tool-errors";
import { orFallbackSync } from "@jini-ai/core/errors/idioms";
/** One cold Jini supervisor per desktop instance. Sites retain tools and durable authority. */
import { spawn as nodeSpawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import type { Writable } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { createPrivateKeyLineRedactor, redactSecrets } from "@jini-ai/core";
import type { SiteScopeKey } from "@tovu/contracts/site-scope-key";
import { maskLocalPaths } from "@jini-ai/diagnostics";
import { createRedactedOutputSink } from "@jini-ai/diagnostics/console-tee";
import { redactLocalText } from "@jini-ai/diagnostics/local-text";
import { createDaemonSupervisor, type DaemonSupervisorRequired } from "@jini-ai/sidecar/supervisor";
import { createRespawnPolicy } from "@jini-ai/sidecar/respawn-policy";
import { createNodeDaemonProcessAdapter, createNodeIpcChannel, createNodeSupervisorScheduler, createSupervisorRegistry,
  type NodeDaemonProcessOptions, type SupervisorRegistry } from "@jini-ai/sidecar/supervisor/node";
import { daemonControlRequest, daemonEndpoint, siteIdleStopReply, type DaemonSiteRegistration } from "@tovu/contracts/daemon-connection";
import { AGENT_DAEMON_EXIT_CODE } from "@tovu/contracts/daemon-exit-codes";
import type { CliMode } from "./startup-env.ts";

export interface DesktopAgentServiceOptions {
  readonly spawn?: NodeDaemonProcessOptions["spawn"];
  readonly registry?: SupervisorRegistry;
  readonly terminate?: DaemonSupervisorRequired["terminateProcess"];
  readonly stdout?: NodeDaemonProcessOptions["stdout"];
  readonly stderr?: NodeDaemonProcessOptions["stderr"];
}

/** Bind Jini's per-stream PEM state to framed child output; EOF flush precedes reset.
 * @complexity O(n) in output characters plus the injected policy; bounded by the existing framer.
 */
function daemonOutputSink({ sink, redact }: {
  sink: Pick<Writable, "write">; redact: (input: { text: string }, options?: Record<string, never>) => string;
}, _options = {}): Writable {
  const privateKeys = createPrivateKeyLineRedactor({}, {});
  const output = createRedactedOutputSink({ sink, redact: ({ text }, _optional = {}) => redact({ text: privateKeys.redact({ text }, {}) }) });
  output.on("unpipe", () => privateKeys.reset({}, {}));
  return output;
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
export function siteScopeKey({ siteDir }: { siteDir: string }, _options = {}): SiteScopeKey {
  let canonical = path.resolve(siteDir);
  /* an absent dir still has one resolved spelling */
  canonical = orFallbackSync({ work: () => fs.realpathSync.native(canonical), fallback: canonical, step: "Resolve desktop site scope path" });
  // Windows paths are case-insensitive; one site must not get two scopes from two spellings.
  if (process.platform === "win32") canonical = canonical.toLowerCase();
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32) as SiteScopeKey;
}

type ScopedSite = DaemonSiteRegistration & { scopeKey: SiteScopeKey };
type Channel = ReturnType<typeof createNodeIpcChannel>;
type Site = { config: ScopedSite; token: string; server?: ChildProcess; host?: Channel; ready?: Promise<{ url: string; pid: number; token: string }> };
type Supervisor = ReturnType<typeof createDaemonSupervisor>;

/** The service's mutable facts, shared by reference with every helper below. */
interface ServiceState {
  channel: Channel | undefined;
  daemonPid: number | undefined;
  stopWork: Promise<void>;
  stopping: boolean;
  readonly sites: Map<SiteScopeKey, Site>;
  readonly bindings: Set<() => void>;
  readonly notices: Set<(input: { pid: number }, options?: Record<string, never>) => void>;
  readonly withdrawals: Map<SiteScopeKey, Promise<void>>;
}
type ServiceContext = { state: ServiceState; supervisor: Supervisor };
/** One owned child's control binding: the workspace it proved and whether it is gone. */
type SiteBinding = { workspaceId: string | undefined; closed: boolean };

function daemonLaunch({ repoRoot, cliMode }: { repoRoot: string; cliMode: CliMode }, _options = {}) {
  const entry = path.join(repoRoot, cliMode === "source" ? "apps/website/src/server/inbound/assistant/agent-daemon-server.ts" : "dist/src/server/inbound/assistant/agent-daemon-server.js");
  return cliMode === "source" ? [
    "--optimize-for-size",
    "--import", `${pathToFileURL(path.join(repoRoot, "development/scripts/prune-tsx-cache.mjs")).href}?prune`,
    "--import", pathToFileURL(path.join(repoRoot, "development/scripts/dev-tsx-loader.mjs")).href,
    "--import", pathToFileURL(path.join(repoRoot, "development/scripts/dev-source-maps-off.mjs")).href, entry,
  ] : ["--optimize-for-size", entry];
}

/** Frame first, then use the existing redactors. Site capabilities have no recognizable
 * shape; cover their exact values too. Mask local paths before credential replacement. Work is bounded by a framed line and the registered sites; no registry I/O. */
function createSiteRedactor({ state }: { state: ServiceState }, _options = {}) {
  return ({ text }: { text: string }, _redactOptions = {}) => {
    const exactSecrets: string[] = [];
    for (const site of state.sites.values()) {
      exactSecrets.push(site.token, site.config.token);
    }
    return redactLocalText({ text: redactSecrets({ input: maskLocalPaths({ text }) }, { exactSecrets, redactPii: false }) });
  };
}

function createDaemonPorts(
  { state, repoRoot, registry, spawnEnv, args, redact }: { state: ServiceState; repoRoot: string; registry: SupervisorRegistry; spawnEnv: NodeJS.ProcessEnv; args: string[]; redact: ReturnType<typeof createSiteRedactor> },
  optional: DesktopAgentServiceOptions,
) {
  return createNodeDaemonProcessAdapter({ command: process.execPath, args, cwd: repoRoot, env: spawnEnv, registry }, {
    ipc: true,
    stdout: daemonOutputSink({ sink: optional.stdout ?? process.stdout, redact }),
    stderr: daemonOutputSink({ sink: optional.stderr ?? process.stderr, redact }),
    spawn(input) {
      const child = optional.spawn ? optional.spawn(input, {}) : nodeSpawn(input.command, input.args, input.options);
      state.channel?.dispose({});
      state.channel = createNodeIpcChannel({ peer: child }); state.daemonPid = child.pid;
      child.once("exit", () => {
        if (state.daemonPid !== child.pid) return;
        state.channel?.dispose({}); state.daemonPid = undefined;
        if (child.pid !== undefined) for (const notify of state.notices) notify({ pid: child.pid });
      });
      return child;
    },
  });
}

function createDesktopSupervisor(
  { state, processPorts, registry }: { state: ServiceState; processPorts: ReturnType<typeof createDaemonPorts>; registry: SupervisorRegistry },
  optional: DesktopAgentServiceOptions,
): Supervisor {
  return createDaemonSupervisor({ ...processPorts,
    terminateProcess(input) { state.stopWork = Promise.resolve((optional.terminate ?? processPorts.terminateProcess)(input)); return state.stopWork; },
    policy: createRespawnPolicy({ now: Date.now }), now: Date.now, scheduler: createNodeSupervisorScheduler({}),
    classifyExit: ({ code }) => ({ isPortConflict: code === AGENT_DAEMON_EXIT_CODE.PORT_IN_USE, reason: "desktop agent daemon exited" }),
    failureReporter: { clear() {}, record() { console.warn("[desktop-agent-service] daemon unavailable"); } },
    logger: { emit(event) { console.log(`[desktop-agent-service] ${event.type}`); } },
    readiness: { async isReady({ pid }) {
      if (!state.channel || state.daemonPid !== pid) return false;
      // Publication follows listener/control initialization. Reuse Jini's atomic discovery before
      // sending the first request, including source boots whose imports are still loading.
      if ((await registry.readLive())?.pid !== pid) return false;
      const endpoint = daemonEndpoint.parse(await state.channel.request({ payload: { operation: "ready" } }, {}));
      return endpoint.pid === pid;
    } },
  }, { parkedExitCodes: [AGENT_DAEMON_EXIT_CODE.IDLE_PARK] });
}

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
function assertDemandAllowed({ state, server }: { state: ServiceState; server?: ChildProcess }, _options = {}): void {
  if (state.stopping) throw new Error("desktop agent service is stopping");
  if (server && hasServerExited({ server })) throw new Error("site scope was withdrawn");
}
/** Recover a missed exit only for the same directory and a child confirmed dead. Disconnect and
 * a requested kill do not prove death. Await remote disposal before sending a replacement config.
 * @complexity O(n) in directory length; one bounded IPC withdrawal.
 */
async function withdrawStaleBinding({ ctx, config }: { ctx: ServiceContext; config: ScopedSite }, _options = {}): Promise<void> {
  const site = ctx.state.sites.get(config.scopeKey);
  if (!site?.server || site.config.token === config.token) return;
  assertSiteBinding({ site, config }, { allowDifferentBoot: true });
  const server = site.server;
  if (hasServerExited({ server })) {
    await withdrawSite({ ctx, scopeKey: config.scopeKey }, { server });
  }
}
/** Rotate a site's callback capability when its daemon channel changes.
 * @complexity O(1) time and space.
 */
function refreshSiteHost({ state, site }: { state: ServiceState; site: Site }, _options = {}): void {
  if (site.host !== state.channel) { site.host = state.channel; site.token = randomUUID(); delete site.ready; }
}
/** The scope's existing site (after its binding check), or a fresh one registered under it. */
function ensureSite({ state, config, server }: { state: ServiceState; config: ScopedSite; server?: ChildProcess }, _options = {}): Site {
  let site = state.sites.get(config.scopeKey);
  assertSiteBinding({ site, config });
  if (!site) {
    site = { config: { ...config, env: { ...config.env } }, token: randomUUID(), server };
    state.sites.set(config.scopeKey, site);
  }
  return site;
}
/** Register the site with the daemon once per channel; a stale answer is refused, a failure clears `ready`. */
function ensureSiteReady({ state, site, channel }: { state: ServiceState; site: Site; channel: Channel }, _options = {}) {
  if (site.ready) return site.ready;
  const owned = site;
  const request = { operation: "register", ...site.config, env: { ...site.config.env, TOVU_AGENT_DAEMON_TOKEN: site.token } };
  site.ready = channel.request({ payload: request }, {}).then(value => {
    const endpoint = daemonEndpoint.parse(value);
    if (state.stopping || state.sites.get(site.config.scopeKey) !== owned || state.channel !== channel || endpoint.pid !== state.daemonPid) throw new Error("stale daemon readiness");
    return { ...endpoint, token: owned.token };
  }).catch((error: unknown) => { delete owned.ready; throw error; });
  return site.ready;
}
/** Sites are keyed by `scopeKey`; `siteId` travels unchanged as the scope's workspace id. */
async function demandSite({ ctx, config }: { ctx: ServiceContext; config: ScopedSite }, { server }: { server?: ChildProcess } = {}) {
  const { state, supervisor } = ctx;
  assertDemandAllowed({ state, server });
  await withdrawStaleBinding({ ctx, config });
  await state.withdrawals.get(config.scopeKey);
  assertDemandAllowed({ state, server });
  const site = ensureSite({ state, config, server });
  await supervisor.ensureReady({}, {});
  if (state.stopping || state.sites.get(config.scopeKey) !== site) throw new Error("site scope was withdrawn");
  if (!state.channel || !state.daemonPid) throw new Error("daemon IPC unavailable");
  refreshSiteHost({ state, site });
  return ensureSiteReady({ state, site, channel: state.channel });
}

/** Remove only the requesting boot's scope; a late exit must never evict a replacement.
 * @complexity O(1) local work and one bounded daemon request.
 */
async function withdrawSite({ ctx, scopeKey }: { ctx: ServiceContext; scopeKey: SiteScopeKey }, { server }: { server?: ChildProcess } = {}): Promise<void> {
  const { state, supervisor } = ctx;
  const site = state.sites.get(scopeKey);
  if (!site) return;
  if (server && site.server !== server) return;
  state.sites.delete(scopeKey);
  if (!state.channel || !supervisor.isReady()) return;
  const work = state.channel.request({ payload: { operation: "withdraw", siteId: site.config.siteId, scopeKey } }, {}).then(() => {});
  state.withdrawals.set(scopeKey, work);
  try { await work; } finally { if (state.withdrawals.get(scopeKey) === work) state.withdrawals.delete(scopeKey); }
}

type ControlArgs = { ctx: ServiceContext; binding: SiteBinding; scopeKey: SiteScopeKey; child: ChildProcess; siteDir: string; payload: unknown };

/** The two requests a site makes about itself: register (demand its daemon scope) and withdraw. */
type BoundSiteRequest = Extract<ReturnType<typeof daemonControlRequest.parse>, { siteId: string }>;

/** Serves a register or withdraw, once the site proved it is the one this server was bound to.
 * @throws when the server has no authenticated workspace yet, names another site, or registers a
 *   directory other than the one this desktop launched.
 * @complexity O(1) local work and one bounded daemon request.
 */
async function handleBoundSiteControl({ ctx, binding, scopeKey, child, siteDir, request }: Omit<ControlArgs, "payload"> & { request: BoundSiteRequest }, _options = {}) {
  if (!binding.workspaceId || request.siteId !== binding.workspaceId) throw new Error("site identity is not bound");
  if (request.operation === "withdraw") { await withdrawSite({ ctx, scopeKey }, { server: child }); return {}; }
  assertSiteDirectory({ directory: request.env.TOVU_SITE_DIR, siteDir });
  return demandSite({ ctx, config: { ...request, scopeKey } }, { server: child });
}

async function handleSiteControl({ ctx, binding, scopeKey, child, siteDir, payload }: ControlArgs, _options = {}) {
  if (binding.closed) throw new Error("site server disconnected");
  const request = daemonControlRequest.parse(payload);
  if (request.operation === "parking") { ctx.supervisor.markParking({ pid: request.pid }, {}); return {}; }
  if (request.operation === "ready" || request.operation === "unavailable" || request.operation === "stopIfIdle") throw new Error("unexpected site control");
  return handleBoundSiteControl({ ctx, binding, scopeKey, child, siteDir, request });
}

async function handleSiteControlOrRefuse(args: ControlArgs, _options = {}) {
  try { return await handleSiteControl(args); }
  catch (error) {
    const refusalReason = siteControlRefusal({ error });
    if (!refusalReason) throw error;
    // Only the explicit public reason crosses Jini's refusal transport; the control call fails.
    throw Object.assign(new Error(refusalReason), { refusalReason });
  }
}

/** Ask on this boot's existing channel. A timeout, refusal or disposed channel is busy.
 * This never withdraws: only the P0 child-exit path has proof the scope can be removed.
 * @complexity O(1), one bounded IPC request.
 */
async function stopSiteIfIdle({ control, binding }: { control: Channel; binding: SiteBinding }, _options = {}): Promise<boolean> {
  if (binding.closed) return false;
  try {
    const reply = await control.request({ payload: { operation: "stopIfIdle" } }, {});
    return siteIdleStopReply.parse(reply).idle;
  } catch { return false; }
}

/** Bind control to an actual owned server; readiness supplies its authenticated workspace ID.
 * Attached handles never enter here, so attachment keeps using the owner's daemon binding.
 * The scope key comes from the directory this desktop launched, so a server cannot pick another's. */
function bindOwnedServer({ ctx, child, siteDir }: { ctx: ServiceContext; child: ChildProcess; siteDir: string }, _optional = {}) {
  const { state } = ctx;
  const scopeKey = siteScopeKey({ siteDir });
  const binding: SiteBinding = { workspaceId: undefined, closed: false };
  const control = createNodeIpcChannel({ peer: child }, { handle: async payload => handleSiteControlOrRefuse({ ctx, binding, scopeKey, child, siteDir, payload }) });
  const notify = ({ pid }: { pid: number }, _options = {}) => { void control.request({ payload: { operation: "unavailable", pid } }, {}).catch((error: unknown) => console.error("[desktop-agent-service] Could not notify the site that the daemon is unavailable", describeErrorForLog({ err: error }))); };
  state.notices.add(notify);
  function dispose(): void {
    if (binding.closed) return;
    binding.closed = true; control.dispose({}); state.bindings.delete(dispose); state.notices.delete(notify);
  }
  // The main process owns exit cleanup for stops AND crashes. The site supervisor intentionally
  // suppresses deliberate-stop notices, and a dying server may never deliver its own withdrawal.
  child.once("exit", () => {
    dispose();
    void withdrawSite({ ctx, scopeKey }, { server: child }).catch(error => console.warn(`[desktop-agent-service] scope withdrawal failed: ${String(error)}`));
  });
  state.bindings.add(dispose); child.once("disconnect", dispose);
  return { setIdentity({ siteId }: { siteId: string }, _options = {}) { binding.workspaceId = siteId; }, dispose,
    stopIfIdle(_required = {}, _options = {}): Promise<boolean> { return stopSiteIfIdle({ control, binding }); },
  };
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
  const state: ServiceState = {
    channel: undefined, daemonPid: undefined, stopWork: Promise.resolve(), stopping: false,
    sites: new Map(), bindings: new Set(), notices: new Set(), withdrawals: new Map(),
  };
  const redact = createSiteRedactor({ state });
  const processPorts = createDaemonPorts({ state, repoRoot, registry, spawnEnv, args: daemonLaunch({ repoRoot, cliMode }), redact }, optional);
  const ctx: ServiceContext = { state, supervisor: createDesktopSupervisor({ state, processPorts, registry }, optional) };

  return {
    demand: (config: ScopedSite, { server }: { server?: ChildProcess } = {}) => demandSite({ ctx, config }, { server }),
    withdraw: ({ scopeKey }: { scopeKey: SiteScopeKey }, { server }: { server?: ChildProcess } = {}): Promise<void> => withdrawSite({ ctx, scopeKey }, { server }),
    bindServer: ({ child, siteDir }: { child: ChildProcess; siteDir: string }, _optional = {}) => bindOwnedServer({ ctx, child, siteDir }),
    async shutdown(_required: Record<string, never>, _optional = {}): Promise<void> {
      state.stopping = true;
      for (const dispose of state.bindings) dispose();
      ctx.supervisor.shutdown(); await state.stopWork; state.channel?.dispose({}); state.sites.clear();
    },
  };
}
export type DesktopAgentService = ReturnType<typeof createDesktopAgentService>;
