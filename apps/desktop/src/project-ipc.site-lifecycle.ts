/**
 * @file The per-site respawn / idle-sleep / memory-cap engine behind `registerSiteIpcHandlers`
 * (`project-ipc.ts`), split out so that file stays under the size limits. Every function takes the
 * shared {@link SiteLifecycleCtx} instead of closing over `registerSiteIpcHandlers`' locals. The
 * parent's `handleStart`/`handleStop` arrive through {@link LifecyclePorts}, so this file never
 * imports `project-ipc.ts`.
 */
import { redactSecrets } from "@jini-ai/core";
import { createRespawnPolicy } from "@jini-ai/sidecar/respawn-policy";
import { SITE_SLEEP_EXIT_CODE } from "../../website/src/assistant/daemon-exit-codes.ts";
import type { ResourcesSnapshot } from "./contracts/resources.ts";
import { readTrackedSites } from "./tracked-sites.ts";

/** How a site's server exited. Mirrors `site-supervisor.ts`'s own `ServerExit` structurally rather
 *  than importing it — this file's `openSites` contract is a plain duck type on purpose, never
 *  coupled to the concrete supervisor. */
interface ServerExitLike {
  code: number | null;
  signal: string | null;
}

/** One `openSites` entry. Every field is optional: a caller — `project-ipc.ts`'s own tests included — only
 *  ever fills in what the handler under test actually reads. The real production shape
 *  (`main.ts`'s `openSiteServer`) always sets `server.port`/`pid`/`stop` and `window` only for an
 *  own-server-mode entry. */
interface OpenSiteEntry {
  server: {
    port?: number;
    external?: boolean;
    pid?: number;
    origin?: string;
    stop?: () => Promise<unknown>;
    onExit?: (required: { listener: (exit: ServerExitLike) => void }) => void;
    stopIfIdle?: (required?: {}, optional?: {}) => Promise<boolean>;
    outputTail?: (required?: {}, optional?: {}) => string;
  };
  window?: {
    isDestroyed?: () => boolean;
    destroy?: () => void;
    setTitle?: (title: string) => void;
  };
}

/** Per directory retry policy survives readiness. Only manual Start resets its rolling window. */
interface SiteRuntime {
  policy: ReturnType<typeof createRespawnPolicy>;
  failures: number;
  cancelled: boolean;
  cancelRetry?: () => void;
  starting?: Promise<unknown>;
  status?: "starting" | "sleeping" | "failed";
  detail?: string;
  lastPresentAt: number;
  keepAwake?: boolean;
  rss?: { pid: number; since: number };
  restartAfterExit?: OpenSiteEntry["server"];
}

interface SiteLifecycleOptions {
  now?: () => number;
  schedule?: (input: { delayMs: number; run: () => void }) => () => void;
  sleepMinutes?: () => number;
}

/** The slice of the host's `deps` the engine reads. */
interface LifecycleDeps {
  projectsPath: string;
  openSites: { get(siteDir: string): OpenSiteEntry | undefined; has(siteDir: string): boolean };
  serializer: { run<T>(required: { key: string; fn: () => T | PromiseLike<T> }, optional?: {}): T | PromiseLike<T> };
  pendingTeardowns?: { track(required: { promise: PromiseLike<unknown> }): Promise<void> };
  onRestartStopped?: (input: { siteDir: string; detail: string }) => void;
  onServerRestarted?: (input: { siteDir: string }) => Promise<void>;
}

/** `project-ipc.ts`'s Start/Stop handlers, injected so there is no import back into it. */
interface LifecyclePorts<TDeps> {
  handleStart(input: { id: string; deps: TDeps & { siteRuntime: ReadonlyMap<string, SiteRuntime>; startAllowed: () => boolean } }): Promise<unknown>;
  handleStop(input: { id: string; deps: TDeps }): Promise<unknown>;
}

/** Everything one registration's lifecycle shares; `registerSiteIpcHandlers` creates exactly one. */
interface SiteLifecycleCtx<TDeps extends LifecycleDeps> {
  deps: TDeps;
  ports: LifecyclePorts<TDeps>;
  now: () => number;
  schedule: (input: { delayMs: number; run: () => void }) => () => void;
  sleepMinutes: () => number;
  states: Map<string, SiteRuntime>;
  disposed: boolean;
  maintenance: Promise<void> | undefined;
  /** With no window left nothing reports presence, so ten idle minutes would stop the sites the user kept. */
  keptAwake: boolean;
  /** Replaced by the real presence tracker right after it is built; the placeholder never sees a site. */
  presence: { has(required: { siteId: string }): boolean };
}

/** Retry timers are independent of the one fleet maintenance tick, and never keep Quit alive. */
function scheduleSiteRetry({ delayMs, run }: { delayMs: number; run: () => void }, _options = {}): () => void {
  const timer = setTimeout(run, delayMs);
  timer.unref();
  return () => clearTimeout(timer);
}

/** Invalid samples cannot extend a high-RSS observation. */
function isHighSiteRss({ rssBytes }: { rssBytes: number | undefined }): boolean {
  return typeof rssBytes === "number" && Number.isFinite(rssBytes) && rssBytes >= 1_500_000_000;
}

/** Use only the owned root's current OS RSS, independent of the cached footprint display. Totals include grandchildren and cannot enforce this cap.
 * @complexity O(p) for the snapshot's p processes; O(1) retained observation per site.
 */
function siteRssOverTime({ state, server, snapshot, siteDir, at }: {
  state: SiteRuntime; server: OpenSiteEntry["server"]; snapshot: ResourcesSnapshot; siteDir: string; at: number;
}, _options = {}): boolean {
  const root = currentSiteRss({ snapshot, siteDir, pid: server.pid, at });
  const rssBytes = root?.rawRssBytes ?? root?.rssBytes;
  if (!root || !isHighSiteRss({ rssBytes })) {
    state.rss = undefined;
    return false;
  }
  if (state.rss?.pid !== root.pid) state.rss = { pid: root.pid, since: snapshot.sampledAt };
  return snapshot.sampledAt - state.rss.since >= 120_000;
}

/** Cached or failed reads must not extend an RSS observation, nor can another boot's PID. */
function currentSiteRss({ snapshot, siteDir, pid, at }: {
  snapshot: ResourcesSnapshot; siteDir: string; pid: number | undefined; at: number;
}, _options = {}) {
  if (snapshot.status !== "available" || snapshot.sampledAt > at || at - snapshot.sampledAt > 30_000) return;
  return snapshot.sites.find(site => site.siteId === siteDir)?.processes
    .find(row => row.pid === pid && row.role === "site-server");
}

/** Final error is selectable plain text. Redact again at this IPC boundary and retain only a tail. */
function siteFailureDetails({ exit, server, error }: {
  exit?: ServerExitLike; server?: OpenSiteEntry["server"]; error?: unknown;
}, _options = {}): string {
  const reason = exit ? `Exit code: ${exit.code ?? "none"}; signal: ${exit.signal ?? "none"}.` : String(error instanceof Error ? error.message : error);
  return redactSecrets({ input: `${reason}\n${server?.outputTail?.({}, {}) ?? ""}` }, { redactPii: false }).slice(-16_384);
}

/** The context one `registerSiteIpcHandlers` call shares across the functions below. O(1). */
function createSiteLifecycleCtx<TDeps extends LifecycleDeps>(
  { deps, ports, options, sleepMinutes }: {
    deps: TDeps; ports: LifecyclePorts<TDeps>; options: SiteLifecycleOptions; sleepMinutes: () => number;
  },
  _optional = {},
): SiteLifecycleCtx<TDeps> {
  return {
    deps, ports, sleepMinutes: options.sleepMinutes ?? sleepMinutes, now: options.now ?? Date.now,
    schedule: options.schedule ?? scheduleSiteRetry, states: new Map(), disposed: false, maintenance: undefined,
    keptAwake: false, presence: { has: () => false },
  };
}

/** One policy per directory, including quiet periods and successful automatic boots. O(1). */
function stateFor<TDeps extends LifecycleDeps>({ ctx, siteDir }: { ctx: SiteLifecycleCtx<TDeps>; siteDir: string }, _options = {}): SiteRuntime {
  let state = ctx.states.get(siteDir);
  if (!state) {
    state = { policy: createRespawnPolicy({ now: ctx.now }, { backoffScheduleMs: [1000, 5000, 30000],
      crashLoopWindowMs: 300000, crashLoopMaxFailures: 4 }), failures: 0, cancelled: false, lastPresentAt: ctx.now() };
    ctx.states.set(siteDir, state);
  }
  return state;
}

/** Stop/delete/quit revoke queued work before waiting on a serializer or a drain. */
function cancel<TDeps extends LifecycleDeps>(
  { ctx, siteDir, forget = false }: { ctx: SiteLifecycleCtx<TDeps>; siteDir: string; forget?: boolean }, _options = {},
): void {
  const state = ctx.states.get(siteDir);
  if (!state) return;
  state.cancelRetry?.(); state.cancelRetry = undefined; state.cancelled = true;
  state.keepAwake = false;
  state.restartAfterExit = undefined; state.status = undefined; state.detail = undefined;
  if (forget) ctx.states.delete(siteDir);
}

/** Manual recovery clears the trip; automatic starts deliberately never call this. */
function manualStart<TDeps extends LifecycleDeps>({ ctx, siteDir }: { ctx: SiteLifecycleCtx<TDeps>; siteDir: string }, _options = {}): void {
  cancel({ ctx, siteDir });
  const state = stateFor({ ctx, siteDir });
  state.policy.reset();
  // Replacing the intent object revokes starts already queued before this manual action while
  // keeping exactly one policy for the directory. Cancellation alone must not be re-enabled.
  ctx.states.set(siteDir, { ...state, cancelled: false, status: undefined, detail: undefined,
    lastPresentAt: ctx.now(), rss: undefined, starting: undefined });
}

/** Recheck cancellation inside handleStart's serializer as well as before queueing it. */
function startSite<TDeps extends LifecycleDeps>(
  input: { ctx: SiteLifecycleCtx<TDeps>; siteDir: string; state: SiteRuntime }, optional: { manual?: boolean } = {},
) {
  if (input.state.starting) return input.state.starting;
  const work = attemptStart(input, optional).finally(() => {
    if (input.state.starting === work) input.state.starting = undefined;
  });
  input.state.starting = work;
  input.ctx.deps.pendingTeardowns?.track({ promise: work });
  return work;
}

/** Quit waits for an already-started boot, then drains any child it adopted after cancellation. */
async function attemptStart<TDeps extends LifecycleDeps>(
  { ctx, siteDir, state }: { ctx: SiteLifecycleCtx<TDeps>; siteDir: string; state: SiteRuntime }, { manual = false } = {},
) {
  const allowed = () => !ctx.disposed && !state.cancelled && ctx.states.get(siteDir) === state;
  if (!allowed()) return;
  const failures = state.failures;
  state.cancelRetry = undefined;
  try {
    const record = await ctx.ports.handleStart({ id: siteDir, deps: { ...ctx.deps, siteRuntime: ctx.states, startAllowed: allowed } });
    await finishStart({ ctx, siteDir, state, failures, allowed });
    return record;
  } catch (error) {
    // An already-observed post-ready exit counts once, even if adoption also rejects.
    if (allowed() && state.failures === failures) recordFailure({ ctx, siteDir, state, detail: siteFailureDetails({ error }) });
    if (manual) throw error;
  }
}

/** Publish success only for the still-current intent. A new failure observed during boot owns
 * the status; readiness alone must not clear its scheduled retry or the policy's recent failures.
 */
async function finishStart<TDeps extends LifecycleDeps>({ ctx, siteDir, state, failures, allowed }: {
  ctx: SiteLifecycleCtx<TDeps>; siteDir: string; state: SiteRuntime; failures: number; allowed: () => boolean;
}, _options = {}): Promise<void> {
  if (ctx.disposed) { await ctx.ports.handleStop({ id: siteDir, deps: ctx.deps }); return; }
  if (!allowed() || state.failures !== failures) return;
  if (ctx.deps.openSites.has(siteDir)) await ctx.deps.onServerRestarted?.({ siteDir });
  state.status = undefined; state.detail = undefined;
}

/** Jini owns the rolling policy; this owner schedules its decision and supplies site wording. */
function recordFailure<TDeps extends LifecycleDeps>(
  { ctx, siteDir, state, detail }: { ctx: SiteLifecycleCtx<TDeps>; siteDir: string; state: SiteRuntime; detail: string }, _options = {},
): void {
  if (ctx.disposed || state.cancelled) return;
  state.failures++;
  state.cancelRetry?.();
  const decision = state.policy.recordFailure({ isPortConflict: false });
  if (decision.action === "give-up") {
    state.cancelRetry = undefined; state.status = "failed";
    state.detail = "This site couldn’t stay running after three automatic restarts in five minutes. Automatic restart has stopped. Try starting it again.\n\nRedacted details (copy and paste):\n" + detail;
    ctx.deps.onRestartStopped?.({ siteDir, detail: state.detail });
    return;
  }
  state.status = "starting"; state.detail = undefined;
  const cancelScheduled = ctx.schedule({ delayMs: decision.delayMs, run: () => {
    if (state.cancelRetry !== cancelScheduled) return;
    state.cancelRetry = undefined;
    // A post-ready exit may arrive before session adoption settles. Wait for that boot's
    // single-flight result before retrying, without losing this policy decision.
    if (state.starting) {
      void state.starting.then(() => startSite({ ctx, siteDir, state }), () => startSite({ ctx, siteDir, state }));
    } else void startSite({ ctx, siteDir, state });
  } });
  state.cancelRetry = cancelScheduled;
}

/** Main has already removed the exited child and done PID-specific cleanup. Sleep isn't failure. */
function onServerExit<TDeps extends LifecycleDeps>({ ctx, siteDir, exit, server }: {
  ctx: SiteLifecycleCtx<TDeps>; siteDir: string; exit: ServerExitLike; server: OpenSiteEntry["server"];
}, _options = {}): void {
  if (ctx.disposed || server.external) return;
  const state = stateFor({ ctx, siteDir });
  if (state.cancelled) return;
  if (exit.code !== SITE_SLEEP_EXIT_CODE) {
    state.restartAfterExit = undefined;
    recordFailure({ ctx, siteDir, state, detail: siteFailureDetails({ exit, server }) });
    return;
  }
  if (state.restartAfterExit === server) {
    state.restartAfterExit = undefined;
    void startSite({ ctx, siteDir, state });
    return;
  }
  state.status = "sleeping"; state.detail = undefined;
}

/** Server authority runs under the SAME key as Start/Stop. Accepted sleep waits for confirmed
 * exit in the server handle, so a reopen cannot reuse a fenced, still-draining child.
 */
async function parkSite<TDeps extends LifecycleDeps>({ ctx, siteDir, state, server, restart }: {
  ctx: SiteLifecycleCtx<TDeps>; siteDir: string; state: SiteRuntime; server: OpenSiteEntry["server"]; restart: boolean;
}, _options = {}): Promise<void> {
  const stopIfIdle = server.stopIfIdle;
  if (!stopIfIdle) return;
  await ctx.deps.serializer.run({ key: siteDir, fn: async () => {
    if (ctx.disposed || state.cancelled || ctx.deps.openSites.get(siteDir)?.server !== server) return;
    if (!restart && ctx.presence.has({ siteId: siteDir })) return;
    await requestIdleStop({ state, server, restart, stopIfIdle });
  } });
}

/** Fence an RSS restart until confirmed exit; a refused sleep leaves it eligible next tick.
 * @complexity O(1) state, one existing bounded child IPC request; no additional I/O.
 */
async function requestIdleStop({ state, server, restart, stopIfIdle }: {
  state: SiteRuntime; server: OpenSiteEntry["server"]; restart: boolean;
  stopIfIdle: NonNullable<OpenSiteEntry["server"]["stopIfIdle"]>;
}, _options = {}): Promise<void> {
  if (restart) state.restartAfterExit = server;
  try {
    await stopIfIdle({}, {});
  } catch { /* Timeout, rejection and disposed channels are busy; the next tick may retry. */ }
  finally { if (state.restartAfterExit === server) state.restartAfterExit = undefined; }
}

/** Presence events update the absence clock at tab closure, not one sampler tick earlier. */
function notePresence<TDeps extends LifecycleDeps>({ ctx }: { ctx: SiteLifecycleCtx<TDeps> }, _options = {}): void {
  const at = ctx.now();
  for (const [siteDir, state] of ctx.states) if (ctx.presence.has({ siteId: siteDir })) state.lastPresentAt = at;
}

/** One snapshot serves every owned site. Missing/stale samples reset only RSS observations;
 * no suspension-gap special case is needed because the server always rechecks active work.
 * @complexity O(s*p) snapshot lookups for s sites and p process rows; one sampler, no per-site I/O.
 */
async function maintainSites<TDeps extends LifecycleDeps>({ ctx, snapshot }: { ctx: SiteLifecycleCtx<TDeps>; snapshot: ResourcesSnapshot }): Promise<void> {
  const at = ctx.now();
  const minutes = ctx.sleepMinutes();
  const sites = readTrackedSites({ projectsPath: ctx.deps.projectsPath });
  for (const { siteDir } of sites) await maintainSite({ ctx, siteDir, snapshot, at, minutes });
}

/** Decide one site's timer/cap eligibility, then ask its own authority. O(p) snapshot lookup. */
async function maintainSite<TDeps extends LifecycleDeps>(
  { ctx, siteDir, snapshot, at, minutes }: { ctx: SiteLifecycleCtx<TDeps>; siteDir: string; snapshot: ResourcesSnapshot; at: number; minutes: number },
): Promise<void> {
  const entry = ctx.deps.openSites.get(siteDir);
  if (!entry || entry.server.external) return;
  const state = stateFor({ ctx, siteDir });
  if (ctx.presence.has({ siteId: siteDir })) state.lastPresentAt = at;
  const restart = siteRssOverTime({ state, server: entry.server, snapshot, siteDir, at });
  const idle = minutes > 0 && at - state.lastPresentAt >= minutes * 60_000;
  if (restart || idle) await parkSite({ ctx, siteDir, state, server: entry.server, restart });
}

/** The lifecycle surface `registerSiteIpcHandlers` hands to its caller (minus presence and dispose). O(1). */
function createLifecycleApi<TDeps extends LifecycleDeps>({ ctx }: { ctx: SiteLifecycleCtx<TDeps> }, _optional = {}) {
  return {
    keepAwake: () => { ctx.keptAwake = true; },
    onServerExit: (input: { siteDir: string; exit: ServerExitLike; server: OpenSiteEntry["server"] }, _options = {}) => onServerExit({ ctx, ...input }),
    manualStart: ({ siteDir }: { siteDir: string }, _options = {}) => manualStart({ ctx, siteDir }),
    cancel: ({ siteDir, forget }: { siteDir: string; forget?: boolean }, _options = {}) => cancel({ ctx, siteDir, forget }),
    onBootFailure({ siteDir, error }: { siteDir: string; error: unknown }, _options = {}): void {
      recordFailure({ ctx, siteDir, state: stateFor({ ctx, siteDir }), detail: siteFailureDetails({ error }) });
    },
    maintain({ snapshot }: { snapshot: ResourcesSnapshot }, _options = {}): Promise<void> {
      if (ctx.disposed) return Promise.resolve();
      if (!ctx.maintenance) ctx.maintenance = maintainSites({ ctx, snapshot }).finally(() => { ctx.maintenance = undefined; });
      return ctx.maintenance;
    },
    /** Revoke automatic starts and retry timers for every site. */
    cancelAll(): void {
      ctx.disposed = true;
      for (const siteDir of ctx.states.keys()) cancel({ ctx, siteDir });
    },
  };
}

export { cancel, createLifecycleApi, createSiteLifecycleCtx, notePresence, siteFailureDetails, stateFor, startSite, manualStart };
export type { LifecycleDeps, LifecyclePorts, OpenSiteEntry, ServerExitLike, SiteLifecycleCtx, SiteLifecycleOptions, SiteRuntime };
