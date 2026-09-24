/**
 * @file The auto-updater's decisions, as pure functions: whether this launch runs the updater at
 * all, which of several running instances owns it, when to check, and what a quit does with a
 * downloaded update. `auto-update-controller.ts` is the only caller; it holds the state and the
 * `electron-updater` object, this file holds every rule.
 *
 * **Why a quit is the hard part.** The owner runs several instances of the app at once, all from
 * the same installed bundle, and there is deliberately no single-instance lock. Installing an update
 * replaces that bundle: on macOS Squirrel swaps `Tovu.app` when the staging process exits, and on
 * Windows the NSIS installer kills every running `Tovu.exe` before it writes. Either one, run while
 * a sibling instance is still open, breaks or kills that sibling. So an update is only ever
 * installed by the LAST instance to quit, and only after `main.ts`'s `before-quit` drain has stopped
 * every site server this instance owns (see {@link decideFinalQuit}).
 *
 * No `electron` import, so it runs under plain `node --test`.
 */

/** How often the owning instance asks GitHub for a new release. */
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/** How often every instance re-reads who owns the updater and, if it is the owner, whether a check
 *  is due. Short enough that a new owner takes over within minutes of the old one quitting. */
const UPDATER_TICK_MS = 15 * 60 * 1000;

/** The first check after launch waits this long, so it never competes with the boot itself. */
const FIRST_CHECK_DELAY_MS = 30 * 1000;

/** A presence heartbeat older than this does not count for owner election. Three missed ticks:
 *  one late tick (a busy event loop, a sleep/wake) must not hand ownership away. */
const PRESENCE_STALE_MS = 3 * UPDATER_TICK_MS;

/** {@link updaterSkipReason}'s input: everything about this launch that decides whether the
 *  updater may run. */
interface UpdaterEnvironment {
  isPackaged: boolean;
  /** Electron's `process.windowsStore`: `true` inside an MSIX/APPX package. */
  windowsStore: boolean;
  platform: NodeJS.Platform;
  /** `TOVU_DESKTOP_DISABLE_UPDATER=1`. */
  disabledByEnv: boolean;
  /** `TOVU_DESKTOP_SELFTEST=1`: a headless self-test must never download or prompt. */
  selftest: boolean;
}

/**
 * @returns why this launch must NOT run the updater, or `null` when it may.
 *
 * - Dev (`electron .`): there is no release to update to, and `electron-updater` would read the
 *   repo's own version against the public release.
 * - A Microsoft Store (MSIX) build: the Store installs updates itself. `electron-updater` would
 *   download the NSIS installer and run it over a package it cannot write to.
 * - Anything but macOS or Windows: no Linux build is published.
 * @complexity O(1).
 */
function updaterSkipReason(env: UpdaterEnvironment): string | null {
  if (!env.isPackaged) return "not packaged (dev launch)";
  if (env.windowsStore) return "Microsoft Store build (the Store updates it)";
  if (env.platform !== "darwin" && env.platform !== "win32") return `no published build for ${env.platform}`;
  if (env.disabledByEnv) return "TOVU_DESKTOP_DISABLE_UPDATER=1";
  if (env.selftest) return "self-test launch";
  return null;
}

/** One running instance, as `instance-presence.ts` records it. */
interface InstanceRecord {
  pid: number;
  startedAt: number;
  heartbeatAt: number;
}

/**
 * The instance that checks for and downloads updates: the longest-running one with a fresh
 * heartbeat, ties broken by lowest pid. Only one instance downloads, so several open copies never
 * race each other into the shared update cache.
 *
 * @param instances live instances (dead pids already removed by the caller).
 * @param now the current time.
 * @param staleMs a heartbeat older than this is ignored; a hung or suspended instance must not keep
 *   ownership while nobody checks.
 * @returns the owner's pid, or `null` when no instance qualifies.
 * @complexity O(n) in instances.
 */
function electUpdaterOwner(instances: readonly InstanceRecord[], now: number, staleMs: number = PRESENCE_STALE_MS): number | null {
  let owner: InstanceRecord | null = null;
  for (const instance of instances) {
    if (now - instance.heartbeatAt > staleMs) continue;
    if (owner === null || startedBefore(instance, owner)) owner = instance;
  }
  return owner === null ? null : owner.pid;
}

/** Election order: earlier start first, then lower pid. @complexity O(1). */
function startedBefore(a: InstanceRecord, b: InstanceRecord): boolean {
  return a.startedAt === b.startedAt ? a.pid < b.pid : a.startedAt < b.startedAt;
}

/** {@link shouldCheckNow}'s input. */
interface CheckInput {
  isOwner: boolean;
  /** When this instance last started a check, or `null` if never. */
  lastCheckAt: number | null;
  now: number;
  /** A check is already running, or an update is already downloaded. */
  busy: boolean;
  intervalMs?: number;
}

/**
 * @returns whether this tick should ask GitHub for a new release.
 * @complexity O(1).
 */
function shouldCheckNow(input: CheckInput): boolean {
  if (!input.isOwner || input.busy) return false;
  if (input.lastCheckAt === null) return true;
  return input.now - input.lastCheckAt >= (input.intervalMs ?? UPDATE_CHECK_INTERVAL_MS);
}

/**
 * What the last step of a quit does, once `main.ts`'s drain has finished:
 *
 * - `"proceed"`: quit, install nothing.
 * - `"install-on-quit"` (Windows): quit; `electron-updater`'s own quit handler runs the installer
 *   silently and does not relaunch.
 * - `"stage-then-quit"` (macOS): hold the quit, hand the update to Squirrel, then quit; Squirrel
 *   swaps the bundle once this process exits. Squirrel is not fed at download time on purpose: once
 *   fed it installs on ANY exit, including the exit of an instance whose siblings are still open.
 * - `"install-and-relaunch"`: the operator clicked Restart to update.
 */
type FinalQuitAction = "proceed" | "install-on-quit" | "stage-then-quit" | "install-and-relaunch";

/** {@link decideFinalQuit}'s input. */
interface FinalQuitInput {
  platform: NodeJS.Platform;
  updateReady: boolean;
  /** Other live instances of this app. Any at all means no install. */
  otherInstances: number;
  restartRequested: boolean;
  /** An install was already started by an earlier pass through this decision. */
  installStarted: boolean;
}

/**
 * @returns the action for the final quit. See {@link FinalQuitAction}.
 * @complexity O(1).
 */
function decideFinalQuit(input: FinalQuitInput): FinalQuitAction {
  if (input.installStarted || !input.updateReady || input.otherInstances > 0) return "proceed";
  if (input.restartRequested) return "install-and-relaunch";
  return input.platform === "darwin" ? "stage-then-quit" : "install-on-quit";
}

/** What clicking Restart to update does. */
type RestartClickAction = "restart" | "others-open" | "not-ready";

/**
 * @param updateReady an update is downloaded.
 * @param otherInstances other live instances of this app.
 * @returns `"restart"` to quit through the normal drain and install; `"others-open"` to tell the
 *   operator the update waits for the other copies to close; `"not-ready"` when there is nothing to
 *   install.
 * @complexity O(1).
 */
function decideRestartClick(updateReady: boolean, otherInstances: number): RestartClickAction {
  if (!updateReady) return "not-ready";
  return otherInstances > 0 ? "others-open" : "restart";
}

export {
  FIRST_CHECK_DELAY_MS,
  PRESENCE_STALE_MS,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATER_TICK_MS,
  decideFinalQuit,
  decideRestartClick,
  electUpdaterOwner,
  shouldCheckNow,
  updaterSkipReason,
};
export type { CheckInput, FinalQuitAction, FinalQuitInput, InstanceRecord, RestartClickAction, UpdaterEnvironment };
