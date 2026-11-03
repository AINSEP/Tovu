/**
 * The desktop's auto-updater lifecycle: start it when this launch may run one, stop it when the
 * Settings checkbox turns it off, say whether the final quit installs an update, and serve
 * Settings › Check for updates…. The updater's own rules live in `../../auto-update-controller.ts`
 * and Jini; this file owns only the state `main.ts` kept in four module variables.
 */
import { createAutoUpdateController } from "../../auto-update-controller.ts";
import { updaterSkipReason } from "../../update-policy.ts";
import type { AutoUpdateController, AutoUpdateControllerDeps } from "../../auto-update-controller.ts";
import type { CheckableUpdater } from "../../update-check-now.ts";

/** electron-updater's `autoUpdater`, as both the controller and a manual check use it. */
export type NativeUpdater = AutoUpdateControllerDeps["updater"] & CheckableUpdater;

/** What `main.ts` held in `autoUpdate`, `nativeAutoUpdater`, `autoUpdaterStarting`, `updateReadyVersion`. */
export interface DesktopUpdaterState {
  /** The auto-updater, or `null` when this launch does not run one (dev, the Microsoft Store build, a
   *  self-test, or the checkbox is off). `before-quit` asks it whether the final quit installs an update. */
  controller: AutoUpdateController | null;
  native: NativeUpdater | null;
  starting: boolean;
  /** The version `controller` downloaded and prompted for; Check for updates… shows that prompt again. */
  readyVersion: string | null;
}

export interface DesktopUpdaterPorts {
  /** The persisted Settings › Automatic updates choice, read fresh each time. */
  automaticUpdates: () => boolean;
  saveAutomaticUpdates: (args: { enabled: boolean }) => void;
  skipReason: () => string | null;
  /** `(await import("electron-updater")).default.autoUpdater`. Imported by the caller at call time,
   *  not at the top of `main.ts`, so a dev launch never loads it. */
  loadNativeUpdater: () => Promise<NativeUpdater>;
  /** `quitPhase === "idle"`: no quit drain has begun. */
  quitIdle: () => boolean;
  /** Controller inputs the host supplies (platform, pid, presence dir, clock, quit, log, explainOthersOpen).
   *  Read when a controller is created, not when this updater is: `userData` may still move before then. */
  controllerDeps: () => Omit<AutoUpdateControllerDeps, "updater" | "promptUpdateReady">;
  promptUpdateReady: (args: { version: string }) => Promise<boolean>;
  log: (message: string) => void;
  logError: (message: string) => void;
}

export interface DesktopUpdater {
  state: DesktopUpdaterState;
  start(): Promise<void>;
  startInBackground(): void;
  setAutomaticUpdates(args: { enabled: boolean }): void;
  finalQuitHeldForUpdate(): boolean;
  willQuit(): void;
  readyVersion(): string | null;
  loadUpdaterForCheck(): Promise<NativeUpdater>;
  showReadyPrompt(args: { version: string }): Promise<void>;
}

/** Nothing started yet. */
export function createDesktopUpdaterState(_requiredArgs = {}, _optionalArgs = {}): DesktopUpdaterState {
  return { controller: null, native: null, starting: false, readyVersion: null };
}

/** One gate shared by launch and Settings › Check for updates…, so the two can never disagree. */
export function desktopUpdaterSkipReason({ isPackaged, windowsStore, platform, env, selftest }: {
  isPackaged: boolean; windowsStore: boolean | undefined; platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv; selftest: boolean;
}, _optionalArgs = {}): string | null {
  return updaterSkipReason({
    isPackaged,
    windowsStore: windowsStore === true,
    platform,
    disabledByEnv: env.TOVU_DESKTOP_DISABLE_UPDATER === "1",
    selftest,
  });
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Binds the updater lifecycle to injected preference, Electron and controller ports.
 * @complexity O(1) per call beyond the injected ports.
 */
export function createDesktopUpdater({ ports }: { ports: DesktopUpdaterPorts }, {
  state = createDesktopUpdaterState(),
  createController = createAutoUpdateController,
}: { state?: DesktopUpdaterState; createController?: typeof createAutoUpdateController } = {}): DesktopUpdater {
  let startup: Promise<void> | null = null;
  /** May this launch start a controller now? Logs the policy reason when it may not. */
  function eligible(): boolean {
    const skip = ports.skipReason();
    if (skip === null) return true;
    ports.log(`auto-update off: ${skip}`);
    return false;
  }

  function bind(updater: NativeUpdater): void {
    state.native = updater;
    state.readyVersion = null;
    state.controller = createController({
      ...ports.controllerDeps(),
      updater,
      promptUpdateReady: (version) => {
        state.readyVersion = version;
        return ports.promptUpdateReady({ version });
      },
    });
    state.controller.start();
  }

  /**
   * Starts the auto-updater (`electron-updater`, GitHub releases of this repo) unless this launch must
   * not run one — see `update-policy.ts`'s `updaterSkipReason`.
   */
  function start(): Promise<void> {
    if (startup) return startup;
    if (state.controller || !ports.automaticUpdates()) return Promise.resolve();
    state.starting = true;
    // A manual check must await the same lazy import and listener binding as background start.
    startup = loadController().finally(() => {
      state.starting = false;
      startup = null;
    });
    return startup;
  }

  async function loadController(): Promise<void> {
    if (!eligible()) return;
    const updater = await ports.loadNativeUpdater();
    // The operator may turn updates off while the lazy import is resolving.
    if (!ports.automaticUpdates() || !ports.quitIdle()) return;
    bind(updater);
  }

  // Not awaited: the updater's first check waits on its own timer, and a failure to load it must
  // never block or fail the boot.
  function startInBackground(): void {
    start().catch((error: unknown) => ports.logError(`auto-update not started: ${messageOf(error)}`));
  }

  function stop(): void {
    state.controller?.willQuit();
    state.controller = null;
    // A download already in flight may finish, but its stopped controller cannot prompt/install.
    // Electron-updater's Windows quit listener also reads this flag before installing.
    if (state.native) {
      state.native.autoDownload = false;
      state.native.autoInstallOnAppQuit = false;
    }
  }

  /** Persist first: a failed write must leave the actual updater and the checkbox unchanged. */
  function setAutomaticUpdates({ enabled }: { enabled: boolean }): void {
    ports.saveAutomaticUpdates({ enabled });
    if (enabled) startInBackground();
    else stop();
  }

  /**
   * The quit that actually ends the app, once nothing is left to drain. A downloaded update installs
   * here, and only when no other instance of the app is running (`update-policy.ts`'s
   * `decideFinalQuit`). When the install takes over (macOS staging, or Restart to update) it quits the
   * app itself, so this quit is held.
   */
  function finalQuitHeldForUpdate(): boolean {
    if (!ports.automaticUpdates()) {
      if (state.native) state.native.autoInstallOnAppQuit = false;
      return false;
    }
    return state.controller?.beforeFinalQuit() ?? false;
  }

  /** Settings › Check for updates…: the same native updater the controller listens to. */
  async function loadUpdaterForCheck(): Promise<NativeUpdater> {
    // With updates on, the controller must be listening before a download can start.
    if (ports.automaticUpdates()) await start();
    const updater = await ports.loadNativeUpdater();
    state.native ??= updater;
    return updater;
  }

  return {
    state,
    start,
    startInBackground,
    setAutomaticUpdates,
    finalQuitHeldForUpdate,
    // `will-quit`: removes this instance's presence record.
    willQuit: () => state.controller?.willQuit(),
    readyVersion: () => (state.controller ? state.readyVersion : null),
    loadUpdaterForCheck,
    async showReadyPrompt({ version }) {
      if (await ports.promptUpdateReady({ version })) state.controller?.requestRestart();
    },
  };
}
