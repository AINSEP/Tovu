/**
 * Tovu's binding of Jini's desktop updater lifecycle (`createDesktopUpdater` in
 * `@jini-ai/desktop-host/electron/updates`): the release skip policy, the `[tovu-desktop]` log lines
 * and the DT-desktop-1 controller (`@jini-ai/desktop-host/shell/auto-update-controller`) bound to the
 * inputs `main.ts` supplies. The lifecycle rules themselves (start, OFF/ON, final quit, manual check)
 * live and are tested in Jini.
 */
import { createAutoUpdateController } from "@jini-ai/desktop-host/shell/auto-update-controller";
import { createDesktopUpdater as createUpdaterLifecycle } from "@jini-ai/desktop-host/electron/updates";
import { updaterSkipReason } from "../../update-policy.ts";
import type { AutoUpdateControllerDeps } from "@jini-ai/desktop-host/shell/auto-update-controller";
import type { CheckableUpdater, DesktopUpdater } from "@jini-ai/desktop-host/electron/updates";

/** electron-updater's `autoUpdater`, as both the controller and a manual check use it. */
export type NativeUpdater = AutoUpdateControllerDeps["updater"] & CheckableUpdater;

export interface DesktopUpdaterPorts {
  /** The persisted Settings › Automatic updates choice, read fresh each time. */
  automaticUpdates: () => boolean;
  saveAutomaticUpdates: (args: { enabled: boolean }) => void;
  skipReason: () => string | null;
  /** Resolves `electron-updater`'s `autoUpdater` (the entry imports the package statically, as it is a
   *  declared dependency). Called only once the skip gate has passed, so a dev launch never reads it. */
  loadNativeUpdater: () => Promise<NativeUpdater>;
  /** `quitPhase === "idle"`: no quit drain has begun. */
  quitIdle: () => boolean;
  /** Controller inputs the host supplies (platform, pid, presence dir, clock, quit, log, explainOthersOpen).
   *  Read when a controller is created, not when this updater is: `userData` may still move before then. */
  controllerDeps: () => Omit<AutoUpdateControllerDeps, "updater" | "promptUpdateReady">;
  promptUpdateReady: (args: { version: string }) => Promise<boolean>;
  log: (required: { message: string }) => void;
  logError: (required: { message: string }) => void;
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

const messageOf = ({ error }: { error: unknown }, _optional = {}): string => (error instanceof Error ? error.message : String(error));

/**
 * Jini's lifecycle with Tovu's log wording, bound to the DT-desktop-1 controller.
 * @complexity O(1) per call beyond the injected ports.
 */
export function createDesktopUpdater({ ports }: { ports: DesktopUpdaterPorts }, {
  createController = createAutoUpdateController,
}: { createController?: typeof createAutoUpdateController } = {}): DesktopUpdater<NativeUpdater> {
  const { controllerDeps, log, logError, ...lifecycle } = ports;
  return createUpdaterLifecycle({ ports: {
    ...lifecycle,
    createController: ({ updater, promptUpdateReady }) => createController({ ...controllerDeps(), updater, promptUpdateReady }),
    reporter: {
      skipped: ({ reason }) => log({ message: `auto-update off: ${reason}` }),
      startFailed: ({ error }) => logError({ message: `auto-update not started: ${messageOf({ error })}` }),
    },
  } });
}
