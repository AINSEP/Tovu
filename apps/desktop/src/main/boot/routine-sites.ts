/**
 * @file Background boot of routine sites (P3-T1b.T): on desktop ready, start (without a window)
 * each REGISTERED site whose bounded routines beacon reports enabled routines, so a recurring job
 * can fire while no window is open. Everything arrives as a port: the registry, the beacon reader,
 * the site opener, the running and withdrawal checks and the logger.
 *
 * Why the inventory is the registry and nothing else: background work must stay limited to sites
 * the owner already chose to manage here. So this never scans folders, never guesses
 * `<siteDir>/content.db` and never opens a content DB. The beacon is a hint, not authority: the
 * site re-checks every routine when it boots, so a stale beacon costs one idle start at worst.
 */
import path from "node:path";
import {
  parseRoutineBeacon, ROUTINE_BEACON_MAX_BYTES, ROUTINES_RELEASE_ENABLED, type RoutineBeacon,
} from "@tovu/contracts/routines";

/** Which sites the background boot may start. `none` turns the boot off without touching the flag. */
export type RoutineBootPolicy = "registered-enabled-except-withdrawn" | "none";

/** One structured log line; the boot never shows a dialog, so these are the only failure surface. */
export type RoutineBootLogEntry = Readonly<{
  event: "routine-beacon-unreadable" | "routine-site-start-failed"; siteDir: string; error: string;
}>;

/** The ports {@link startRoutineSites} drives. */
export interface RoutineSitesDeps {
  /** The shared-sites registry's entries (`sharedSites.registry({}).list({})`), already filtered to this workspace. */
  listSites: () => Promise<ReadonlyArray<Readonly<{ siteDir: string }>>>;
  /** Null when the site has no beacon; throws when one exists but cannot be trusted. See {@link createRoutineBeaconReader}. */
  readBeacon: (input: { siteDir: string }) => Promise<RoutineBeacon | null>;
  /** The no-window site open (`openSiteServer({ siteDir, ctx }, {})`). */
  startSite: (input: { siteDir: string }) => Promise<unknown>;
  isRunning: (input: { siteDir: string }) => boolean;
  /** True once the operator stopped this site during this session. */
  isWithdrawn: (input: { siteDir: string }) => boolean;
  log: (entry: RoutineBootLogEntry) => void;
  policy?: RoutineBootPolicy;
}

/** Why two: a site boot is CPU and disk heavy (migrations, bundle warm-up); two overlaps the I/O
 *  waits without letting a dozen registered sites stall the window the owner is actually using. */
const START_CONCURRENCY = 2;

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * The session's withdrawn-site set. `project-ipc.server.ts`'s Stop records here BEFORE it queues
 * the asynchronous stop, so a background start already past its first check still sees the Stop
 * when it re-checks (see {@link startRoutineSites}). In-memory on purpose: withdrawal lasts for this
 * session only, and an explicit owner start is never blocked by it.
 * @complexity O(1) per call.
 */
export function createRoutineWithdrawals(_optional = {}) {
  const withdrawn = new Set<string>();
  return {
    withdraw: ({ siteDir }: { siteDir: string }): void => { withdrawn.add(siteDir); },
    isWithdrawn: ({ siteDir }: { siteDir: string }): boolean => withdrawn.has(siteDir),
  };
}

/** True when `siteDir` should be started now: not running, not withdrawn, beacon enabled. Logs an
 *  untrustworthy beacon instead of throwing.
 *  @complexity O(1) plus the beacon read. */
async function shouldStart({ siteDir, deps }: { siteDir: string; deps: RoutineSitesDeps }, _optional = {}): Promise<boolean> {
  if (deps.isRunning({ siteDir }) || deps.isWithdrawn({ siteDir })) return false;
  let beacon: RoutineBeacon | null;
  try {
    beacon = await deps.readBeacon({ siteDir });
  } catch (error) {
    deps.log({ event: "routine-beacon-unreadable", siteDir, error: errorText(error) });
    return false;
  }
  if (beacon === null || beacon.enabled <= 0) return false;
  // Re-check after the await: a Stop (or an explicit open) can land while the beacon is read, and
  // the withdrawal must win over this background start (the serialized-start race).
  return !deps.isWithdrawn({ siteDir }) && !deps.isRunning({ siteDir });
}

/** Considers one site and starts it when eligible; a start failure is logged, never thrown.
 *  @complexity O(1) plus the beacon read and the start. */
async function considerSite({ siteDir, deps, started }: { siteDir: string; deps: RoutineSitesDeps; started: string[] }, _optional = {}): Promise<void> {
  if (!(await shouldStart({ siteDir, deps }))) return;
  try {
    await deps.startSite({ siteDir });
    started.push(siteDir);
  } catch (error) {
    deps.log({ event: "routine-site-start-failed", siteDir, error: errorText(error) });
  }
}

/**
 * Starts every registered site with enabled routines, at most {@link START_CONCURRENCY} at a time.
 * Does nothing unless the release flag (default {@link ROUTINES_RELEASE_ENABLED}) is on and the
 * policy is the default `registered-enabled-except-withdrawn`.
 * @returns the site dirs actually started, in completion order.
 * @complexity O(n) in registered sites; each beacon read is bounded to {@link ROUTINE_BEACON_MAX_BYTES}.
 */
export async function startRoutineSites(
  deps: RoutineSitesDeps,
  { releaseEnabled = ROUTINES_RELEASE_ENABLED }: { releaseEnabled?: boolean } = {},
): Promise<{ started: string[] }> {
  const policy = deps.policy ?? "registered-enabled-except-withdrawn";
  const started: string[] = [];
  if (!releaseEnabled || policy !== "registered-enabled-except-withdrawn") return { started };
  const queue = (await deps.listSites()).map((site) => site.siteDir);
  const worker = async (): Promise<void> => {
    for (let siteDir = queue.shift(); siteDir !== undefined; siteDir = queue.shift()) {
      await considerSite({ siteDir, deps, started });
    }
  };
  await Promise.all(Array.from({ length: START_CONCURRENCY }, worker));
  return { started };
}

/** The slice of `node:fs/promises` the beacon reader uses. */
export interface BeaconFs {
  open: (path: string, flags: "r") => Promise<{
    read: (buffer: Buffer, offset: number, length: number, position: number) => Promise<{ bytesRead: number }>;
    close: () => Promise<void>;
  }>;
}

/** Reads at most `buffer.length` bytes from the start of the file. A single `read` may return fewer
 *  bytes than asked, so this loops until the buffer is full or the file ends.
 *  @complexity O(buffer.length). */
async function readPrefix({ handle, buffer }: { handle: Awaited<ReturnType<BeaconFs["open"]>>; buffer: Buffer }, _optional = {}): Promise<number> {
  let total = 0;
  for (;;) {
    const { bytesRead } = await handle.read(buffer, total, buffer.length - total, total);
    total += bytesRead;
    if (bytesRead === 0 || total === buffer.length) return total;
  }
}

/**
 * Builds {@link RoutineSitesDeps.readBeacon}. The content path comes from `resolveContentDbPath`
 * (the same site-metadata policy the child uses), so a site whose content was relocated is read
 * beside its real DB. Reads at most one byte past {@link ROUTINE_BEACON_MAX_BYTES}: the bound holds
 * before the file is read in full, whatever its size, with no stat-then-read gap.
 * @complexity O(ROUTINE_BEACON_MAX_BYTES).
 */
export function createRoutineBeaconReader(
  { resolveContentDbPath, fs }: { resolveContentDbPath: (input: { siteDir: string }) => Promise<string>; fs: BeaconFs },
  _optional = {},
) {
  return async ({ siteDir }: { siteDir: string }): Promise<RoutineBeacon | null> => {
    const beaconPath = path.join(path.dirname(await resolveContentDbPath({ siteDir })), "ops", "routines-beacon.json");
    let handle: Awaited<ReturnType<BeaconFs["open"]>>;
    try {
      handle = await fs.open(beaconPath, "r");
    } catch (error) {
      // No beacon is the normal state of a site that never had a routine: a quiet skip, not a log line.
      if ((error as { code?: unknown }).code === "ENOENT") return null;
      throw error;
    }
    const buffer = Buffer.alloc(ROUTINE_BEACON_MAX_BYTES + 1);
    let length: number;
    try { length = await readPrefix({ handle, buffer }); } finally { await handle.close(); }
    if (length > ROUTINE_BEACON_MAX_BYTES) throw new Error(`routines beacon is larger than ${ROUTINE_BEACON_MAX_BYTES} bytes: ${beaconPath}`);
    const beacon = parseRoutineBeacon({ text: buffer.subarray(0, length).toString("utf8") });
    if (beacon === null) throw new Error(`routines beacon is malformed: ${beaconPath}`);
    return beacon;
  };
}
