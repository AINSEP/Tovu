/** CMS local-site lifecycle policy. Effects stay behind the host process port; no spawn on import.
 * Capacity and folder mutations share one lane so concurrent requests cannot trash a starting site.
 */
import { SITE_NAME_PATTERN } from "./site-registry.js";
import type { LocalSiteIntentPort } from "./local-site-intent.js";

export type LocalSiteStatus = "starting" | "running" | "stopped" | "crashed";
export interface LocalSiteState {
  name: string; status: LocalSiteStatus; pid: number | null; port: number | null;
  daemonPort: number | null; adminUrl: string | null;
  app?: string; external?: boolean;
}
export class LocalSiteError extends Error {
  // Desktop loads this module through Node's strip-only TypeScript support.
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = "LocalSiteError";
  }
}
export interface LocalSiteProcess {
  pid: number;
  onExit(required: { listener: () => void }): void;
  ready(): Promise<boolean>;
  /** Resolve only after the whole tree (including a detached daemon) has exited. */
  terminate(): Promise<void>;
  /** Synchronous signal path for host exit; async stop still verifies completion. */
  killNow(): void;
  /** Atomically fence intake and confirm idle. False/absence means eviction is unsafe. */
  tryRetire?(): Promise<boolean>;
  cancelRetirement?(): Promise<void>;
}
export interface LocalSiteProcessPort {
  isPortFree(required: { port: number }): Promise<boolean>;
  launch(required: { name: string; port: number; daemonPort: number }): Promise<LocalSiteProcess>;
  schedule(required: { run: () => void; delayMs: number }): () => void;
  dispose?(): Promise<void>;
  existing?(required: { name: string }): LocalSiteState | null;
  listExisting?(): LocalSiteState[];
}
export interface LocalSiteSupervisorPort {
  start(required: { name: string }, optional?: Record<string, never>): Promise<LocalSiteState>;
  stop(required: { name: string }, optional?: Record<string, never>): Promise<LocalSiteState>;
  list(): LocalSiteState[];
  withStoppedSite<T>(required: { name: string; task: () => Promise<T> }, optional?: Record<string, never>): Promise<T>;
  shutdown(): Promise<void>;
  killNow(): void;
  /** One same-dev-session recovery pass; the host calls this after its boot delay. */
  resume(): Promise<void>;
}
interface Entry { state: LocalSiteState; child?: LocalSiteProcess; cancel?: () => void; probes: number; misses: number; opened: number }

/** Validate before a name reaches a path or command. @complexity O(n), bounded to 100 chars. */
export function assertLocalSiteName({ name }: { name: string }, _optional = {}): void {
  if (name.length < 1 || name.length > 100 || !SITE_NAME_PATTERN.test(name)) throw new LocalSiteError("VALIDATION_ERROR");
}

/** Create a host-owned lifecycle with a bounded scan and DI effects. @complexity O(s) per list/cap. */
export function createLocalSiteSupervisor(
  { processPort, servingName, scheme }: { processPort: LocalSiteProcessPort; servingName: string; scheme: "http" | "https" },
  { maxConcurrent = 3, excludedPorts = [], readyAttempts = 240, devSession, evictIdle = false, intentPort = { read: () => undefined, write: () => {} } }:
  { maxConcurrent?: number; excludedPorts?: readonly number[]; readyAttempts?: number; devSession?: string; evictIdle?: boolean; intentPort?: LocalSiteIntentPort } = {},
): LocalSiteSupervisorPort {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 20) throw new LocalSiteError("INVALID_SITE_LIMIT");
  const entries = new Map<string, Entry>();
  const reserved = new Set([3000, 5173, 4319, ...excludedPorts]);
  const stored = devSession && evictIdle ? intentPort.read() : undefined;
  const apiPorts = new Map<string, number>(stored?.session === devSession
    ? Object.entries(stored?.ports ?? {}).map(([name, site]) => [name, site.port]) : []);
  for (const port of apiPorts.values()) reserved.add(port);
  let closed = false;
  let resumed = false;
  let opened = 0;
  let lane: Promise<unknown> = Promise.resolve();
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const next = lane.then(task);
    lane = next.catch(() => {});
    return next;
  }
  function checkName(name: string) {
    assertLocalSiteName({ name });
    if (name === servingName) throw new LocalSiteError("SITE_SERVING");
    if (closed) throw new LocalSiteError("SITE_HOST_STOPPING");
  }
  async function allocate(preferred?: number): Promise<number> {
    if (preferred !== undefined && !reserved.has(preferred) && await processPort.isPortFree({ port: preferred })) {
      reserved.add(preferred);
      return preferred;
    }
    for (let port = 3101; port < 4101; port++) {
      if (reserved.has(port) || !(await processPort.isPortFree({ port }))) continue;
      reserved.add(port);
      return port;
    }
    throw new LocalSiteError("SITE_PORTS_EXHAUSTED");
  }
  async function reap(entry: Entry, status: "stopped" | "crashed") {
    entry.cancel?.();
    try { await entry.child?.terminate(); }
    catch { throw new LocalSiteError("SITE_STOP_FAILED"); }
    // Reservations survive a failed stop: a still-live child cannot share a replacement's port.
    if (entry.state.port !== null && !evictIdle) reserved.delete(entry.state.port);
    if (entry.state.daemonPort !== null) reserved.delete(entry.state.daemonPort);
    entry.child = undefined;
    entry.state = { ...entry.state, status, pid: null, port: null, daemonPort: null, adminUrl: null };
  }
  function crash(entry: Entry) {
    if (closed) return;
    updateIntent({ name: entry.state.name });
    entry.state.status = "crashed";
    entry.cancel?.();
    const child = entry.child;
    // A Stop queued ahead of this reaper may already have reaped this child: its "stopped" stands.
    void serial(async () => { if (entry.child === child) await reap(entry, "crashed"); }).catch(() => {});
  }
  function canProbe(entry: Entry) {
    return !closed && (entry.state.status === "starting" || entry.state.status === "running");
  }
  async function probe(entry: Entry) {
    const child = entry.child;
    if (!child || !canProbe(entry)) return;
    const ready = await childReady(child);
    if (entry.child !== child || !canProbe(entry)) return;
    if (recordProbe({ entry, ready, readyAttempts }) === "crash") crash(entry);
    else scheduleProbe(entry);
  }
  function scheduleProbe(entry: Entry) {
    entry.cancel = processPort.schedule({ run: () => { void probe(entry); }, delayMs: entry.state.status === "starting" ? 500 : 5000 });
  }
  /** A failed reap still owns a live child and its ports. Reopen intake and resume observation
   * before propagating the admission failure; a later open can retry the same retirement.
   */
  async function reapRetiredSite({ entry }: { entry: Entry }, _options = {}): Promise<void> {
    const previous = entry.state.status;
    entry.state.status = "stopped";
    try { await reap(entry, "stopped"); }
    catch (error) {
      try { await entry.child?.cancelRetirement?.(); }
      finally {
        entry.state.status = previous;
        entry.probes = 0; entry.misses = 0;
        scheduleProbe(entry);
        if (entry.state.port !== null) updateIntent({ name: entry.state.name, port: entry.state.port });
      }
      throw error;
    }
  }
  /** Admission and retirement run in the same lane; only positively idle owned children stop.
   * External leases never become eviction candidates. @complexity O(s log s), bounded by the cap.
   */
  async function makeRoom(): Promise<void> {
    const live = [...entries.values()].filter(entry => entry.child || entry.state.status === "starting");
    if (live.length < maxConcurrent) return;
    if (evictIdle) {
      for (const entry of live.sort((a, b) => a.opened - b.opened)) {
        if (!await entry.child?.tryRetire?.().catch(() => false)) continue;
        try { updateIntent({ name: entry.state.name }); }
        catch (error) { await entry.child?.cancelRetirement?.(); throw error; }
        await reapRetiredSite({ entry });
        return;
      }
    }
    throw new LocalSiteError("SITE_LIMIT");
  }
  async function start(name: string, preferred?: number): Promise<LocalSiteState> {
    checkName(name);
    const current = currentState(name);
    if (current) { const entry = entries.get(name); if (entry) entry.opened = ++opened; return current; }
    try { await makeRoom(); } catch (error) {
      // Admission failures also withdraw a pending request, before there is an Entry to reap.
      updateIntent({ name });
      throw error;
    }
    const entry: Entry = { state: { name, status: "starting", pid: null, port: null, daemonPort: null, adminUrl: null }, probes: 0, misses: 0, opened: ++opened };
    entries.set(name, entry);
    try {
      return await launch(entry, preferred);
    } catch (error) {
      // A watch restart is host teardown, not a failed user start: retain even mid-spawn intent.
      if (!closed) updateIntent({ name });
      await reap(entry, "crashed");
      const foreign = processPort.existing?.({ name });
      if (foreign) return foreign;
      if (error instanceof LocalSiteError) throw error;
      throw new LocalSiteError("SITE_START_FAILED");
    }
  }
  /** A site another app runs, or this host's own live child, answers Start without a new launch. */
  function currentState(name: string): LocalSiteState | undefined {
    const foreign = processPort.existing?.({ name });
    const previous = entries.get(name);
    if (foreign && !previous?.child) return foreign;
    if (!previous?.child) return undefined;
    if (previous.state.status === "crashed") throw new LocalSiteError("SITE_STOP_FAILED");
    return { ...previous.state };
  }
  /** A session's public URLs are identities, not reusable pool slots. An occupied old port
   * refuses the start rather than moving the same site or another site behind that URL.
   * @complexity O(1) for a remembered URL; otherwise the existing bounded port scan.
   */
  async function allocateSitePort({ name, preferred }: { name: string; preferred?: number }): Promise<number> {
    const remembered = apiPorts.get(name);
    if (remembered !== undefined) {
      if (!await processPort.isPortFree({ port: remembered })) throw new LocalSiteError("SITE_PORT_BUSY");
      return remembered;
    }
    const port = await allocate(preferred);
    if (evictIdle) apiPorts.set(name, port);
    return port;
  }
  async function launch(entry: Entry, preferred?: number): Promise<LocalSiteState> {
    const { name } = entry.state;
    const port = await allocateSitePort({ name, preferred });
    entry.state.port = port;
    updateIntent({ name, port });
    const daemonPort = await allocate();
    entry.state.daemonPort = daemonPort;
    if (closed) throw new LocalSiteError("SITE_HOST_STOPPING");
    const child = await processPort.launch({ name, port, daemonPort });
    entry.child = child;
    entry.state.pid = child.pid;
    entry.state.adminUrl = `${scheme}://localhost:${port}/admin/`;
    child.onExit({ listener: () => { if (entries.get(name) === entry && entry.child && entry.state.status !== "stopped") crash(entry); } });
    if (closed) { await reap(entry, "stopped"); throw new LocalSiteError("SITE_HOST_STOPPING"); }
    scheduleProbe(entry);
    return { ...entry.state };
  }
  /** Synchronous snapshot updates cannot interleave; no dev session means no reads or writes.
   * @complexity O(s) time/space per update, for the persisted sites.
   */
  function updateIntent({ name, port }: { name: string; port?: number }) {
    if (!devSession) return;
    const stored = intentPort.read();
    const sites = stored?.session === devSession ? { ...stored.sites } : {};
    if (port === undefined) delete sites[name];
    else sites[name] = { port };
    intentPort.write({ intent: { session: devSession, sites,
      ...(evictIdle ? { ports: Object.fromEntries([...apiPorts].map(([siteName, apiPort]) => [siteName, { port: apiPort }])) } : {}),
    } });
  }
  /** Give the old tree/lease five seconds to disappear before trying a different free port.
   * @complexity O(1): at most 11 probes and ten 500 ms waits.
   */
  async function preferredPort(name: string, port: number): Promise<number | undefined> {
    for (let attempt = 0; attempt <= 10; attempt++) {
      if (closed || (reserved.has(port) && apiPorts.get(name) !== port)) return undefined;
      if (!processPort.existing?.({ name }) && await processPort.isPortFree({ port })) return port;
      if (attempt < 10) await new Promise<void>(resolve => { processPort.schedule({ run: resolve, delayMs: 500 }); });
    }
    return undefined;
  }
  /** Recheck intent inside the lane so an explicit Stop wins over a queued recovery.
   * @complexity O(s + p), persisted snapshot plus the existing bounded port scan.
   */
  async function resumeSite(name: string) {
    if (closed || entries.get(name)?.child) return;
    const stored = intentPort.read();
    const site = stored && stored.session === devSession ? stored.sites[name] : undefined;
    if (!site) return;
    try { await start(name, await preferredPort(name, site.port)); }
    catch { if (!closed) updateIntent({ name }); } // Failed recovery is withdrawn, never retried on the next save.
  }
  const supervisor: LocalSiteSupervisorPort = {
    start: ({ name }) => serial(() => start(name)),
    stop: ({ name }) => serial(async () => {
      checkName(name);
      const entry = entries.get(name);
      // Withdraw the request even if the old host still owns the tree and cannot be signalled here.
      updateIntent({ name });
      if (!entry?.child && processPort.existing?.({ name })) throw new LocalSiteError("SITE_RUNNING_ELSEWHERE");
      if (!entry) return { name, status: "stopped", pid: null, port: null, daemonPort: null, adminUrl: null };
      // Withdraw exit observation before signalling, so a deliberate stop never becomes a crash.
      entry.state.status = "stopped";
      try { await reap(entry, "stopped"); } catch (error) { entry.state.status = "crashed"; throw error; }
      return { ...entry.state };
    }),
    list: () => {
      const known = new Map([...entries.values()].map((entry) => [entry.state.name, { ...entry.state }]));
      for (const state of processPort.listExisting?.() ?? []) if (!entries.get(state.name)?.child) known.set(state.name, state);
      return [...known.values()];
    },
    withStoppedSite: ({ name, task }) => serial(async () => {
      checkName(name);
      const entry = entries.get(name);
      if (processPort.existing?.({ name }) || entry?.child || entry?.state.status === "starting") throw new LocalSiteError("SITE_RUNNING");
      return task();
    }),
    killNow() { closed = true; for (const entry of entries.values()) { entry.cancel?.(); entry.state.status = "stopped"; entry.child?.killNow(); } },
    async resume() {
      if (resumed || closed || !devSession) return;
      resumed = true;
      const stored = intentPort.read();
      if (stored?.session !== devSession) return;
      for (const name of Object.keys(stored.sites)) await serial(() => resumeSite(name));
    },
    shutdown() {
      supervisor.killNow();
      return serial(async () => {
        await Promise.all([...entries.values()].map((entry) => reap(entry, "stopped")));
        await processPort.dispose?.();
      });
    },
  };
  return supervisor;
}

/** Readiness failures are bounded local misses, never a crash on their own. */
async function childReady(child: LocalSiteProcess): Promise<boolean> {
  try { return await child.ready(); } catch { /* Retry bounded local readiness failures. */ return false; }
}

/** Count one probe and decide whether the site has timed out starting or lost a running server.
 * @returns "crash" after `readyAttempts` unready probes while starting or three misses while running.
 */
function recordProbe({ entry, ready, readyAttempts }: { entry: Entry; ready: boolean; readyAttempts: number }): "crash" | "again" {
  entry.probes++;
  if (ready) { entry.state.status = "running"; entry.misses = 0; }
  else entry.misses++;
  if (entry.state.status === "starting" && entry.probes >= readyAttempts) return "crash";
  if (entry.state.status === "running" && entry.misses >= 3) return "crash";
  return "again";
}

/** Start a site and wait until its server answers, so a caller that hands out `adminUrl` (site import's
 * "Open" link) never links to a port that is still booting. Returns the latest state once it leaves
 * `starting`, or the still-starting state after `attempts` waits (callers stay under the admin
 * client's 60 s request timeout; the supervisor keeps probing either way).
 * @complexity O(attempts × s) — one bounded `list()` scan per wait.
 */
export async function startLocalSiteWhenRunning(
  { supervisor, name }: { supervisor: Pick<LocalSiteSupervisorPort, "start" | "list">; name: string },
  { attempts = 90, intervalMs = 500, sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)) }: { attempts?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<LocalSiteState> {
  let state = await supervisor.start({ name });
  for (let waits = 0; state.status === "starting" && waits < attempts; waits++) {
    await sleep(intervalMs);
    state = supervisor.list().find((entry) => entry.name === name) ?? state;
  }
  return state;
}
