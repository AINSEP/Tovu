/** Full-site boot, shared with journeys: same static admin bundle + ordinary index entrypoint.
 * The watchdog runs before bundle work too; a killed host cannot strand a Vite build process.
 */
import { journeyAdminBundle } from "./local-admin-bundle.js";
import { createNodeDaemonProcessAdapter, type NodeDaemonProcessOptions, type SupervisorRegistry } from "@jini-ai/sidecar/supervisor/node";
import type { SpawnedDaemonProcess } from "@jini-ai/sidecar/supervisor";

/** The slice of `process` this entry reads and signals; the real `process` in production. */
export interface LocalSiteChildProcess {
  readonly env: NodeJS.ProcessEnv;
  readonly pid: number;
  /** Read on every probe: a re-parented child sees a different value than it booted with. */
  readonly ppid: number;
  readonly execPath: string;
  cwd(): string;
  kill(pid: number, signal?: NodeJS.Signals | number): unknown;
  exit(code?: number): void;
}

/** A repeating timer whose handle can be unref'd so the watchdog never keeps the process alive. */
export interface WatchdogTimers {
  setInterval(run: () => void, ms: number): WatchdogHandle;
  clearInterval(handle: WatchdogHandle): void;
}
export interface WatchdogHandle { unref(): unknown }

export interface LocalSiteChildOptional {
  proc?: LocalSiteChildProcess;
  /** Stops this process's own tree; resolves once the stop was requested (failures exit 1). */
  reapOwnTree?: () => Promise<void>;
  buildAdminBundle?: typeof journeyAdminBundle;
  /** Module specifier of the ordinary site entrypoint, resolved relative to this module. */
  siteEntry?: string;
  importEntry?: (specifier: string) => Promise<unknown>;
  timers?: WatchdogTimers;
}

const SITE_ENTRY = "../../index.js";
const WATCHDOG_MS = 1000;
const NODE_TIMERS: WatchdogTimers = { setInterval, clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout) };

/** The owner pid the launcher passed, required before any other work.
 * @throws When the variable is absent, non-integer or below 1.
 * @complexity O(1).
 */
export function ownerPidFrom({ env }: { env: NodeJS.ProcessEnv }, _optional: Record<string, never> = {}): number {
  const parentPid = Number(env.TOVU_LOCAL_SITE_OWNER_PID);
  if (!Number.isInteger(parentPid) || parentPid < 1) throw new Error("Local site owner is required");
  return parentPid;
}

/** True once this child was re-parented away from its owner, or the owner pid no longer exists.
 * A permission error (EPERM) proves the pid is alive, so only ESRCH counts as gone.
 * @complexity O(1) — one liveness signal.
 */
export function parentGone({ proc, ownerPid }: { proc: LocalSiteChildProcess; ownerPid: number }, _optional: Record<string, never> = {}): boolean {
  if (proc.ppid !== ownerPid) return true;
  try { proc.kill(ownerPid, 0); return false; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH"; }
}

/** The reaper's registry: it only stops its own tree, so it has no record to read, write or remove. */
export const NO_REGISTRY: SupervisorRegistry = Object.freeze({
  readLive: async () => null,
  write: async () => {},
  removeIfCurrent: async () => {},
});

/** Exit subscriptions are irrelevant to a process stopping itself. */
function ignoreSubscription(): void {}

/** This process presented as the supervisor's child handle, so the tree stop can target it.
 * @complexity O(1).
 */
export function selfAsDaemonProcess({ proc }: { proc: LocalSiteChildProcess }, _optional: Record<string, never> = {}): SpawnedDaemonProcess {
  return {
    pid: proc.pid,
    on: ignoreSubscription,
    kill(_required, optional) { proc.kill(proc.pid, optional?.signal ?? "SIGTERM"); return true; },
  };
}

/** Reaps this process's own tree through Jini's tree stop; a failed stop exits 1.
 * This adapter is used only to reap this process's own tree; it never launches another child.
 * @param optional.adapter - Native effect ports for the tree stop (tests pass fakes).
 * @complexity O(p) process snapshots, as the adapter's tree stop.
 */
export function createOwnTreeReaper(
  { proc }: { proc: LocalSiteChildProcess },
  { adapter = {} }: { adapter?: NodeDaemonProcessOptions } = {},
): () => Promise<void> {
  const reaper = createNodeDaemonProcessAdapter({ command: proc.execPath, args: [], cwd: proc.cwd(), env: proc.env,
    registry: NO_REGISTRY }, adapter);
  return () => reaper.terminateProcess({ child: selfAsDaemonProcess({ proc }) }).catch(() => proc.exit(1));
}

async function importModule(specifier: string): Promise<unknown> { return import(specifier); }

/** Boots one local site as the owner's child: a watchdog reaps this tree once the owner is gone
 * (checked first, then every second), then the shared admin bundle is built when none was supplied,
 * then the ordinary site entrypoint is imported.
 * @throws When the owner pid is missing or invalid (before any timer or build starts).
 * @complexity O(1) besides the bundle build and the site boot.
 */
export async function runLocalSiteChild(
  _required: Record<string, never>,
  { proc = process, reapOwnTree, buildAdminBundle = journeyAdminBundle, siteEntry = SITE_ENTRY,
    importEntry = importModule, timers = NODE_TIMERS }: LocalSiteChildOptional = {},
): Promise<void> {
  const ownerPid = ownerPidFrom({ env: proc.env });
  const reap = reapOwnTree ?? createOwnTreeReaper({ proc });
  const watchdog = timers.setInterval(() => {
    if (!parentGone({ proc, ownerPid })) return;
    timers.clearInterval(watchdog); void reap();
  }, WATCHDOG_MS);
  watchdog.unref();
  if (parentGone({ proc, ownerPid })) { timers.clearInterval(watchdog); await reap(); return; }
  if (!proc.env.TOVU_ADMIN_DIST) {
    proc.env.TOVU_ADMIN_DIST = await buildAdminBundle({
      runtimeDir: proc.env.TOVU_LOCAL_ADMIN_BUILD_ROOT!, repoRoot: proc.env.TOVU_REPO_ROOT!,
    }, { env: proc.env });
  }
  await importEntry(siteEntry);
}

/** A failed boot reports and exits 1, as the uncaught rejection it replaces did, while still running
 * exit hooks (an uncaught rejection skips them). */
function failBoot(error: unknown): void {
  console.error(error);
  process.exit(1);
}

if (import.meta.main) await runLocalSiteChild({}).catch(failBoot);
