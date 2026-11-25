/**
 * The desktop binding of Jini's profile partition interlock (P11 ST-2a, ALGO §24).
 *
 * This file is the ONLY place in the desktop app that may call `session.fromPartition` (pinned by
 * `T-2a.3`): every managed site session is reached through {@link bindDesktopPartitions}' held set, so
 * a next-start partition pass (or a sibling instance's) can never remove sign-in data this process is
 * about to use. Owner rule (a): a login is never erased or touched for a live site or another
 * instance; tracked or catalog data that cannot be read answers "unknown" (skip), never "empty".
 *
 * Why updater-disabled instances and implicit Electron creators count: an instance with automatic
 * updates switched off writes no updater presence record, yet it still holds partitions — so the
 * holder file this binding registers at startup (independent of the updater) is what makes it
 * visible to a sibling's pass. Likewise Electron creates a session implicitly, without any
 * `fromPartition` call, for `new BrowserWindow({ webPreferences: { partition } })` and for a
 * `<webview partition>` guest; those two creators are guarded by {@link assertPartitionHeld} and
 * {@link admitGuestPartition}, or a window could open a jar a cleanup is renaming away.
 */
import fsModule from "node:fs";
import path from "node:path";
import {
  createPartitionInterlock, partitionDirName, PartitionBusyError, PartitionNotHeldError, PartitionOpenRefusedError,
  type InstanceClaimSource, type PartitionClaimSource, type PartitionFsPort, type PartitionInterlockLogEvent,
  type PartitionProcessPort, type PartitionSchedulerPort, type PartitionWriterContext, type PartitionWriterLockPort,
  type SiteSessionAcquired, type WriterLockOwner,
} from "@jini-ai/desktop-host/electron/partitions";
import { sitePartition } from "./desktop-auth.ts";
import { readProjectsFile } from "./tracked-sites.ts";

/** The partition names this app manages: `sitePartition`'s `tovu-site-` + 32 hex digest. */
const MANAGED = /^tovu-site-[0-9a-f]{32}$/;
const isManaged = (name: string): boolean => MANAGED.test(name);

/**
 * Pending-retirement invalidation (ST-2b). `invalidate` runs at acquisition; `invalidateSync` runs
 * inside the projects-file lock before an added row is published (lock order projects → ledger).
 */
export interface DesktopRetirementPort {
  invalidate(required: { partition: string; subjectDir: string; reason: "reacquired" }): Promise<void>;
  invalidateSync(required: { partition: string; subjectDir: string; reason: "tracked-again" }): void;
}
/**
 * The explicit no-op until the erase arm records retirements (ST-2b.T). With no record ever written
 * there is nothing to invalidate, so this is exact, not a bypass; ST-2b.T replaces it with the ledger.
 */
export const NO_RETIREMENT: DesktopRetirementPort = { invalidate: async () => {}, invalidateSync: () => {} };

/** Platform's async `withFileLock`, which takes the owner token so the fence can name its holder. */
export interface DesktopFileLockPort {
  withFileLock<T>(
    required: { lockPath: string; run: (lock: { assertHeld(required: Record<string, never>): Promise<void> }) => Promise<T> },
    options: { staleMs: number; timeoutMs: number; createParent: boolean; token: () => string },
  ): Promise<T>;
}

export interface DesktopPartitionsRequired<S> {
  app: { getPath(name: "userData" | "sessionData"): string };
  session: { fromPartition(partition: string): S };
  fs: PartitionFsPort;
  fileLock: DesktopFileLockPort;
  clock: { mono(): number; now(): number };
  scheduler: PartitionSchedulerPort;
  process: PartitionProcessPort;
  projectsPath: string;
  /** The shared sites catalog's site folders; a throw is unknown. `undefined` in attach mode (no catalog). */
  catalog: { listSiteDirs(): readonly string[] } | undefined;
  /** Other live instances of this profile (the strict updater presence reader). */
  instances: readonly InstanceClaimSource[];
  retirement: DesktopRetirementPort;
  openMaintenance: (required: { partition: string; subjectDir: string }) => Promise<void>;
  log: (event: PartitionInterlockLogEvent) => void;
}

const MESSAGES = {
  busy: "Tovu is tidying website data. Try opening this website again in a moment.",
  unregistered: ({ directory }: { directory: string }) => `Tovu can't write to its settings folder (${directory}). Free some disk space and restart Tovu.`,
  refused: "Tovu could not confirm this website's sign-in data is safe to open. Try opening it again in a moment.",
};
const UNKNOWN_OPEN_FAILURE = "Tovu could not open this website's sign-in data. Try opening it again; if it keeps happening, restart Tovu.";

/** Why a window could not hold its site's partition: a cleanup is running, safety unconfirmed, or unexpected. */
export type PartitionOpenFailureKind = "busy" | "refused" | "unknown";
export class SitePartitionOpenError extends Error {
  override name = "SitePartitionOpenError";
  readonly kind: PartitionOpenFailureKind;
  constructor(kind: PartitionOpenFailureKind, message: string, options: { cause: unknown }) { super(message, options); this.kind = kind; }
}

/**
 * Plain-words form of a failed acquire. The interlock's own errors already carry owner-facing text;
 * anything else is internal, so the owner sees a fixed sentence and the original rides on `cause`.
 * @complexity O(1).
 */
export function partitionOpenFailure({ error }: { error: unknown }, _optional: Record<string, never> = {}): SitePartitionOpenError {
  if (error instanceof PartitionBusyError) return new SitePartitionOpenError("busy", error.message, { cause: error });
  if (error instanceof PartitionOpenRefusedError) return new SitePartitionOpenError("refused", error.message, { cause: error });
  return new SitePartitionOpenError("unknown", UNKNOWN_OPEN_FAILURE, { cause: error });
}

const errorCode = (error: unknown) => (error as NodeJS.ErrnoException)?.code;
const describe = (error: unknown) => String(errorCode(error) ?? (error as Error)?.message ?? error);

/** Node `fs` as the interlock's port; async writes fsync before resolving. @complexity O(bytes). */
export function nodePartitionFs({ fs }: { fs: typeof fsModule }, _optional: Record<string, never> = {}): PartitionFsPort {
  return {
    mkdirSync: ({ path: dir }, { recursive } = {}) => fs.mkdirSync(dir, { recursive }),
    writeFileSync: ({ path: file, data }) => fs.writeFileSync(file, data),
    renameSync: ({ oldPath, newPath }) => fs.renameSync(oldPath, newPath),
    unlinkSync: ({ path: file }) => fs.unlinkSync(file),
    writeFile: async ({ path: file, data }) => {
      const handle = await fs.promises.open(file, "w");
      try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
    },
    rename: ({ oldPath, newPath }) => fs.promises.rename(oldPath, newPath),
    readFile: ({ path: file }) => fs.promises.readFile(file, "utf8"),
    readdir: ({ path: dir }) => fs.promises.readdir(dir),
    lstat: ({ path: file }) => fs.promises.lstat(file),
    realpath: ({ path: file }) => fs.promises.realpath(file),
  };
}

/** Owner of a platform JSON lock file: live/dead only when it is on this host, else unknown. @complexity O(1). */
function lockOwner(text: string, proc: PartitionProcessPort): WriterLockOwner {
  let row: { pid?: unknown; hostname?: unknown; token?: unknown };
  try { row = JSON.parse(text) as typeof row; } catch { return { state: "unknown", reason: "unreadable lock" }; }
  if (typeof row?.token !== "string" || typeof row.pid !== "number" || typeof row.hostname !== "string") return { state: "unknown", reason: "malformed lock" };
  if (row.hostname !== proc.hostname) return { state: "held", token: row.token, owner: "unknown" };
  return { state: "held", token: row.token, owner: proc.isAlive({ pid: row.pid }) ? "live" : "dead" };
}

/**
 * Platform's `HeldFileLock` carries no token, so the adapter chooses it (`options.token`) and reads it
 * back from the lock file for the fence. @complexity O(1) per call.
 */
export function partitionWriterLock(
  { fileLock, fs, process: proc }: { fileLock: DesktopFileLockPort; fs: PartitionFsPort; process: PartitionProcessPort },
  _optional: Record<string, never> = {},
): PartitionWriterLockPort {
  return {
    withFileLock: ({ lockPath, run }, { staleMs, timeoutMs, createParent }) => {
      const token = proc.newToken();
      return fileLock.withFileLock(
        { lockPath, run: (lock) => run({ token, assertHeld: () => lock.assertHeld({}) }) },
        { staleMs, timeoutMs, createParent, token: () => token },
      );
    },
    readToken: async ({ lockPath }) => {
      try { return lockOwner(await fs.readFile({ path: lockPath }), proc); }
      catch (error) { return errorCode(error) === "ENOENT" ? { state: "free" } : { state: "unknown", reason: describe(error) }; }
    },
  };
}

const dirsToPartitions = (siteDirs: readonly string[]) => siteDirs.map((siteDir) => partitionDirName(sitePartition({ siteDir })));

/** Strict tracked list: only a file this app could have written is an answer; missing or damaged is unknown. */
function trackedClaimSource({ projectsPath }: { projectsPath: string }): PartitionClaimSource {
  return { name: "tracked", read: async () => {
    const file = readProjectsFile({ projectsPath });
    if (file.state !== "ok") return { state: "unknown", reason: `projects list ${file.state}` };
    return { state: "ok", value: dirsToPartitions(file.rows.map((row) => row.siteDir)) };
  } };
}

/** Strict catalog: any throw is unknown; no catalog at all (attach mode) claims nothing. */
function catalogClaimSource({ catalog }: { catalog: DesktopPartitionsRequired<unknown>["catalog"] }): PartitionClaimSource {
  return { name: "catalog", read: async () => {
    if (!catalog) return { state: "ok", value: [] };
    try { return { state: "ok", value: dirsToPartitions(catalog.listSiteDirs()) }; }
    catch (error) { return { state: "unknown", reason: describe(error) }; }
  } };
}

/**
 * Coordination is per profile (`<userData>/partition-interlock`). A `sessionData` outside this
 * profile's `userData` could be the same root another profile uses without seeing this interlock, so
 * automatic maintenance is blocked there; opening sites still works.
 */
function sharesNoForeignRoot({ userData, sessionData }: { userData: string; sessionData: string }): boolean {
  const relative = path.relative(path.resolve(userData), path.resolve(sessionData));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Bind the interlock to this launch. Call after the `userData` override and before `ready`, then
 * `registerHolder()` once. @complexity O(1) to bind; see each method.
 */
export function bindDesktopPartitions<S>(required: DesktopPartitionsRequired<S>, _optional: Record<string, never> = {}) {
  const { app, session, fs, fileLock, clock, scheduler, process: proc, projectsPath, catalog, instances, retirement, openMaintenance, log } = required;
  const userData = app.getPath("userData"), sessionDataDir = app.getPath("sessionData");
  const automaticMaintenance = sharesNoForeignRoot({ userData, sessionData: sessionDataDir });
  if (!automaticMaintenance) log({ event: "maintenance-blocked", detail: sessionDataDir });
  const interlock = createPartitionInterlock<S>({
    paths: { interlockDir: path.join(userData, "partition-interlock"), sessionDataDir },
    fs, lock: partitionWriterLock({ fileLock, fs, process: proc }), process: proc, clock, scheduler,
    fromPartition: ({ partition }) => session.fromPartition(partition), isManaged,
    claimSources: { partitions: [trackedClaimSource({ projectsPath }), catalogClaimSource({ catalog })], instances },
    invalidateRetirement: ({ partition, subjectDir, reason }) => retirement.invalidate({ partition, subjectDir, reason }),
    openMaintenance: (input) => automaticMaintenance ? openMaintenance(input) : Promise.resolve(),
    messages: MESSAGES, log,
  });
  const isHeldManaged = (partition: string) => {
    try { interlock.assertHeld({ partition }); return true; } catch (error) { if (error instanceof PartitionNotHeldError) return false; throw error; }
  };
  return {
    automaticMaintenance,
    registerHolder: () => interlock.registerHolder(),
    unregisterHolder: () => interlock.unregisterHolder(),
    acquireSite: ({ siteDir }: { siteDir: string }, _opt: Record<string, never> = {}): Promise<SiteSessionAcquired> =>
      interlock.acquireSiteSession({ partition: sitePartition({ siteDir }), subjectDir: siteDir }),
    /** A window open's acquire: same hold, refusal in plain words; the caller opens nothing on failure. */
    acquireSiteWindow: ({ siteDir }: { siteDir: string }, _opt: Record<string, never> = {}): Promise<SiteSessionAcquired> =>
      interlock.acquireSiteSession({ partition: sitePartition({ siteDir }), subjectDir: siteDir }).catch((error: unknown) => { throw partitionOpenFailure({ error }); }),
    siteSession: ({ partition }: { partition: string }, _opt: Record<string, never> = {}): S => interlock.siteSession({ partition }),
    /** Before `new BrowserWindow` with a partition: Electron would create an unheld session implicitly. */
    assertPartitionHeld: ({ partition }: { partition: string | undefined }, _opt: Record<string, never> = {}): void => {
      if (partition) interlock.assertHeld({ partition });
    },
    /** `will-attach-webview`: deny an unheld managed guest; anything unmanaged keeps today's navigation policy. */
    admitGuestPartition: ({ partition }: { partition: string | undefined }, _opt: Record<string, never> = {}): boolean => {
      if (!partition || isHeldManaged(partition)) return true;
      log({ event: "guest-refused", partition });
      return false;
    },
    /** The tracked-list writer's required effect: runs inside the projects lock, before the durable write. */
    beforeAddedRows: ({ rows }: { rows: readonly { siteDir: string }[] }, _opt: Record<string, never> = {}): void => {
      for (const { siteDir } of rows) retirement.invalidateSync({ partition: partitionDirName(sitePartition({ siteDir })), subjectDir: siteDir, reason: "tracked-again" });
    },
    withPartitionWriter: <T>({ run }: { run: (context: PartitionWriterContext) => Promise<T> }) => interlock.withPartitionWriter({ run }),
  };
}
export type DesktopPartitions<S> = ReturnType<typeof bindDesktopPartitions<S>>;
