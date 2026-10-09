/** CMS local-site lifecycle policy. Effects stay behind the host process port; no spawn on import.
 * Capacity and folder mutations share one lane so concurrent requests cannot trash a starting site.
 */
import { SITE_NAME_PATTERN } from "./site-registry.js";

export type LocalSiteStatus = "starting" | "running" | "stopped" | "crashed";
export interface LocalSiteState {
  name: string; status: LocalSiteStatus; pid: number | null; port: number | null;
  daemonPort: number | null; adminUrl: string | null;
}
export class LocalSiteError extends Error {
  constructor(readonly code: string) { super(code); this.name = "LocalSiteError"; }
}
export interface LocalSiteProcess {
  pid: number;
  onExit(required: { listener: () => void }): void;
  ready(): Promise<boolean>;
  /** Resolve only after the whole tree (including a detached daemon) has exited. */
  terminate(): Promise<void>;
  /** Synchronous signal path for host exit; async stop still verifies completion. */
  killNow(): void;
}
export interface LocalSiteProcessPort {
  isPortFree(required: { port: number }): Promise<boolean>;
  launch(required: { name: string; port: number; daemonPort: number }): Promise<LocalSiteProcess>;
  schedule(required: { run: () => void; delayMs: number }): () => void;
  dispose?(): Promise<void>;
}
export interface LocalSiteSupervisorPort {
  start(required: { name: string }, optional?: Record<string, never>): Promise<LocalSiteState>;
  stop(required: { name: string }, optional?: Record<string, never>): Promise<LocalSiteState>;
  list(): LocalSiteState[];
  withStoppedSite<T>(required: { name: string; task: () => Promise<T> }, optional?: Record<string, never>): Promise<T>;
  shutdown(): Promise<void>;
  killNow(): void;
}
interface Entry { state: LocalSiteState; child?: LocalSiteProcess; cancel?: () => void; probes: number; misses: number }

/** Validate before a name reaches a path or command. @complexity O(n), bounded to 100 chars. */
export function assertLocalSiteName({ name }: { name: string }, _optional = {}): void {
  if (name.length < 1 || name.length > 100 || !SITE_NAME_PATTERN.test(name)) throw new LocalSiteError("VALIDATION_ERROR");
}

/** Create a host-owned lifecycle with a bounded scan and DI effects. @complexity O(s) per list/cap. */
export function createLocalSiteSupervisor(
  { processPort, servingName, scheme }: { processPort: LocalSiteProcessPort; servingName: string; scheme: "http" | "https" },
  { maxConcurrent = 3, excludedPorts = [], readyAttempts = 240 }: { maxConcurrent?: number; excludedPorts?: readonly number[]; readyAttempts?: number } = {},
): LocalSiteSupervisorPort {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 20) throw new LocalSiteError("INVALID_SITE_LIMIT");
  const entries = new Map<string, Entry>();
  const reserved = new Set([3000, 5173, 4319, ...excludedPorts]);
  let closed = false;
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
  async function allocate(): Promise<number> {
    for (let port = 3101; port < 4101; port++) {
      if (reserved.has(port)) continue;
      if (!(await processPort.isPortFree({ port }))) continue;
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
    if (entry.state.port !== null) reserved.delete(entry.state.port);
    if (entry.state.daemonPort !== null) reserved.delete(entry.state.daemonPort);
    entry.child = undefined;
    entry.state = { ...entry.state, status, pid: null, port: null, daemonPort: null, adminUrl: null };
  }
  function crash(entry: Entry) {
    entry.state.status = "crashed";
    entry.cancel?.();
    void serial(() => reap(entry, "crashed")).catch(() => {});
  }
  function canProbe(entry: Entry) {
    return !closed && (entry.state.status === "starting" || entry.state.status === "running");
  }
  async function probe(entry: Entry) {
    const child = entry.child;
    if (!child || !canProbe(entry)) return;
    let ready = false;
    try { ready = await child.ready(); } catch { /* Retry bounded local readiness failures. */ }
    if (entry.child !== child || !canProbe(entry)) return;
    entry.probes++;
    if (ready) { entry.state.status = "running"; entry.misses = 0; }
    else entry.misses++;
    if (entry.state.status === "starting" && entry.probes >= readyAttempts) { crash(entry); return; }
    if (entry.state.status === "running" && entry.misses >= 3) { crash(entry); return; }
    scheduleProbe(entry);
  }
  function scheduleProbe(entry: Entry) {
    entry.cancel = processPort.schedule({ run: () => { void probe(entry); }, delayMs: entry.state.status === "starting" ? 500 : 5000 });
  }
  async function start(name: string): Promise<LocalSiteState> {
    checkName(name);
    const previous = entries.get(name);
    if (previous?.child) {
      if (previous.state.status === "crashed") throw new LocalSiteError("SITE_STOP_FAILED");
      return { ...previous.state };
    }
    if ([...entries.values()].filter((entry) => entry.child || entry.state.status === "starting").length >= maxConcurrent) throw new LocalSiteError("SITE_LIMIT");
    const entry: Entry = { state: { name, status: "starting", pid: null, port: null, daemonPort: null, adminUrl: null }, probes: 0, misses: 0 };
    entries.set(name, entry);
    try {
      entry.state.port = await allocate();
      entry.state.daemonPort = await allocate();
      if (closed) throw new LocalSiteError("SITE_HOST_STOPPING");
      entry.child = await processPort.launch({ name, port: entry.state.port, daemonPort: entry.state.daemonPort });
      entry.state.pid = entry.child.pid;
      entry.state.adminUrl = `${scheme}://localhost:${entry.state.port}/admin/`;
      entry.child.onExit({ listener: () => { if (entries.get(name) === entry && entry.child && entry.state.status !== "stopped") crash(entry); } });
      if (closed) { await reap(entry, "stopped"); throw new LocalSiteError("SITE_HOST_STOPPING"); }
      scheduleProbe(entry);
      return { ...entry.state };
    } catch (error) {
      await reap(entry, "crashed");
      if (error instanceof LocalSiteError) throw error;
      throw new LocalSiteError("SITE_START_FAILED");
    }
  }
  const supervisor: LocalSiteSupervisorPort = {
    start: ({ name }) => serial(() => start(name)),
    stop: ({ name }) => serial(async () => {
      checkName(name);
      const entry = entries.get(name);
      if (!entry) return { name, status: "stopped", pid: null, port: null, daemonPort: null, adminUrl: null };
      // Withdraw exit observation before signalling, so a deliberate stop never becomes a crash.
      entry.state.status = "stopped";
      try { await reap(entry, "stopped"); } catch (error) { entry.state.status = "crashed"; throw error; }
      return { ...entry.state };
    }),
    list: () => [...entries.values()].map((entry) => ({ ...entry.state })),
    withStoppedSite: ({ name, task }) => serial(async () => {
      checkName(name);
      const entry = entries.get(name);
      if (entry?.child || entry?.state.status === "starting") throw new LocalSiteError("SITE_RUNNING");
      return task();
    }),
    killNow() { closed = true; for (const entry of entries.values()) { entry.cancel?.(); entry.state.status = "stopped"; entry.child?.killNow(); } },
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
