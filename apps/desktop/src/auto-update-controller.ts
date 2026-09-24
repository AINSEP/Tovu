/**
 * @file The auto-updater's state and wiring: checks GitHub at launch and every few hours, downloads
 * quietly, offers "Restart to update" once per downloaded version, and installs on quit, but only
 * from the last running instance. The rules live in `update-policy.ts`; sibling instances are seen
 * through `instance-presence.ts`.
 *
 * `main.ts` builds one of these only when `updaterSkipReason` returns `null` (a packaged, non-Store
 * build), passes `electron-updater`'s `autoUpdater` in as {@link UpdaterLike}, and calls
 * {@link AutoUpdateController.beforeFinalQuit} from `before-quit` once its site drain is done.
 * Everything Electron-specific (the dialog, `app.quit`) comes in through
 * {@link AutoUpdateControllerDeps}, so this file runs under plain `node --test`.
 */
import { readLiveInstances, removeInstanceRecord, writeInstanceRecord, isPidAlive } from "./instance-presence.ts";
import { FIRST_CHECK_DELAY_MS, UPDATER_TICK_MS, decideFinalQuit, decideRestartClick, electUpdaterOwner, shouldCheckNow } from "./update-policy.ts";

/** How long a macOS quit waits for Squirrel to take the update before quitting without it. */
const STAGE_TIMEOUT_MS = 2 * 60 * 1000;

/** The part of `electron-updater`'s `AppUpdater` this uses. */
interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  autoRunAppAfterInstall: boolean;
  checkForUpdates(): Promise<{ downloadPromise?: Promise<unknown> | null } | null>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(event: "update-downloaded" | "error", listener: (payload: never) => void): unknown;
}

/** {@link createAutoUpdateController}'s inputs. */
interface AutoUpdateControllerDeps {
  updater: UpdaterLike;
  platform: NodeJS.Platform;
  pid: number;
  /** `presenceDirPath(app.getPath("userData"))`. */
  presenceDir: string;
  now: () => number;
  isAlive?: (pid: number) => boolean;
  /** Shows the "Update ready" prompt. Resolves `true` when the operator chose Restart. */
  promptUpdateReady: (version: string) => Promise<boolean>;
  /** Tells the operator the update waits until the other `count` copies of the app are closed. */
  explainOthersOpen: (count: number) => void;
  /** `app.quit()`: the normal quit, drain included. */
  quit: () => void;
  log: (message: string) => void;
  stageTimeoutMs?: number;
}

/** What {@link createAutoUpdateController} returns. */
interface AutoUpdateController {
  /** Records this instance, then runs the first tick after `FIRST_CHECK_DELAY_MS` and one every
   *  `UPDATER_TICK_MS` after that. */
  start(): void;
  /** One tick: refresh this instance's heartbeat and, if it owns the updater, check when due. */
  tick(): void;
  /** The Restart to update choice. */
  requestRestart(): void;
  /**
   * Called from `before-quit` once the drain is finished. Returns `true` when the quit must be held
   * (`event.preventDefault()`) because an install was started and will quit the app itself.
   */
  beforeFinalQuit(): boolean;
  /** Called from `will-quit`: removes this instance's presence record and stops the timers. */
  willQuit(): void;
}

/**
 * @param deps see {@link AutoUpdateControllerDeps}.
 * @returns the controller. Nothing runs until {@link AutoUpdateController.start}.
 * @complexity O(1) to build; each tick is O(n) in running instances.
 */
function createAutoUpdateController(deps: AutoUpdateControllerDeps): AutoUpdateController {
  const { updater, platform, pid, presenceDir, now, log } = deps;
  const isAlive = deps.isAlive ?? isPidAlive;
  const startedAt = now();
  const timers: ReturnType<typeof setTimeout>[] = [];
  let lastCheckAt: number | null = null;
  let checking = false;
  let readyVersion: string | null = null;
  let promptedVersion: string | null = null;
  let restartRequested = false;
  let installStarted = false;

  updater.autoDownload = true;
  // Windows installs through electron-updater's own `quit` handler, which is only registered when
  // this is true at download time; `beforeFinalQuit` then sets it per quit. macOS keeps it false so
  // Squirrel is not fed until the final quit (see `update-policy.ts`'s `FinalQuitAction`).
  updater.autoInstallOnAppQuit = platform === "win32";
  updater.on("update-downloaded", ((info: { version: string }) => {
    readyVersion = info.version;
    log(`auto-update: ${info.version} downloaded`);
    maybePrompt();
  }) as (payload: never) => void);
  updater.on("error", ((error: Error) => {
    log(`auto-update: ${error.message}`);
    // A failed Squirrel hand-off must not leave a held quit hanging.
    if (installStarted) deps.quit();
  }) as (payload: never) => void);

  function otherInstances(): number {
    return readLiveInstances(presenceDir, isAlive).filter((record) => record.pid !== pid).length;
  }

  function maybePrompt(): void {
    if (readyVersion === null || promptedVersion === readyVersion) return;
    promptedVersion = readyVersion;
    deps.promptUpdateReady(readyVersion).then(
      (restart) => {
        if (restart) requestRestart();
      },
      (error: Error) => log(`auto-update: prompt failed: ${error.message}`),
    );
  }

  function check(): void {
    lastCheckAt = now();
    checking = true;
    updater
      .checkForUpdates()
      .then((result) => result?.downloadPromise ?? null)
      .catch((error: Error) => log(`auto-update: check failed: ${error.message}`))
      .finally(() => {
        checking = false;
      });
  }

  function heartbeat(): void {
    try {
      writeInstanceRecord(presenceDir, { pid, startedAt, heartbeatAt: now() });
    } catch (error) {
      log(`auto-update: presence write failed: ${(error as Error).message}`);
    }
  }

  function tick(): void {
    heartbeat();
    const isOwner = electUpdaterOwner(readLiveInstances(presenceDir, isAlive), now()) === pid;
    if (shouldCheckNow({ isOwner, lastCheckAt, now: now(), busy: checking || readyVersion !== null })) check();
  }

  function requestRestart(): void {
    const action = decideRestartClick(readyVersion !== null, otherInstances());
    if (action === "others-open") deps.explainOthersOpen(otherInstances());
    if (action !== "restart") return;
    restartRequested = true;
    deps.quit();
  }

  function startInstall(silent: boolean, relaunch: boolean): true {
    installStarted = true;
    updater.autoRunAppAfterInstall = relaunch;
    updater.quitAndInstall(silent, relaunch);
    const fallback = setTimeout(() => deps.quit(), deps.stageTimeoutMs ?? STAGE_TIMEOUT_MS);
    fallback.unref?.();
    return true;
  }

  function beforeFinalQuit(): boolean {
    const updateReady = readyVersion !== null;
    const action = decideFinalQuit({
      platform,
      updateReady,
      otherInstances: updateReady && !installStarted ? otherInstances() : 0,
      restartRequested,
      installStarted,
    });
    if (platform === "win32" && !installStarted) updater.autoInstallOnAppQuit = action === "install-on-quit";
    if (action === "stage-then-quit") return startInstall(false, false);
    if (action === "install-and-relaunch") return startInstall(true, true);
    return false;
  }

  return {
    start() {
      // Recorded at once so siblings see this instance from the start; the first CHECK waits.
      heartbeat();
      const first = setTimeout(tick, FIRST_CHECK_DELAY_MS);
      const every = setInterval(tick, UPDATER_TICK_MS);
      first.unref?.();
      every.unref?.();
      timers.push(first, every);
    },
    tick,
    requestRestart,
    beforeFinalQuit,
    willQuit() {
      for (const timer of timers) clearTimeout(timer);
      removeInstanceRecord(presenceDir, pid);
    },
  };
}

export { STAGE_TIMEOUT_MS, createAutoUpdateController };
export type { AutoUpdateController, AutoUpdateControllerDeps, UpdaterLike };
