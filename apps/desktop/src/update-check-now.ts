/**
 * "Check for updates…" in the sites home Settings menu. The Jini controller only checks from the
 * elected owner copy, every four hours, so a copy launched later could sit on an old version for
 * hours. This runs one check in the clicking copy, through the same native updater the controller
 * already listens to: a download it starts ends in the controller's own "Update ready" prompt, and
 * electron-updater reuses a download another copy already cached, so nothing downloads twice.
 */
import { RUNNER_APP_CHECK_FOR_UPDATES_CHANNEL } from './contracts/app-version.ts';

/** The slice of electron-updater's `autoUpdater` a manual check needs. */
export interface CheckableUpdater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<{
    isUpdateAvailable?: boolean;
    updateInfo?: { version: string };
    downloadPromise?: Promise<unknown> | null;
  } | null>;
}

export type UpdateCheckOutcome =
  | { kind: 'unavailable'; reason: string }
  | { kind: 'ready'; version: string }
  | { kind: 'up-to-date'; version: string }
  | { kind: 'downloading'; version: string }
  | { kind: 'available'; version: string }
  | { kind: 'error' };

/** One native message box's text. */
export interface UpdateNotice {
  type: 'info' | 'error';
  message: string;
  detail: string;
}

export interface UpdateCheckNowDeps {
  isPackaged: boolean;
  currentVersion: () => string;
  /** `update-policy.ts`'s reason this launch runs no updater, or null. */
  skipReason: () => string | null;
  automaticUpdates: () => boolean;
  /** The version this copy's controller already downloaded and prompted for, or null. */
  readyVersion: () => string | null;
  loadUpdater: () => Promise<CheckableUpdater>;
  /** The existing "Update ready" prompt; restarts when the operator picks Restart. */
  showReadyPrompt: (args: { version: string }) => Promise<void>;
  notify: (notice: UpdateNotice) => void;
  log: (args: { message: string }) => void;
}

const NETWORK_ERROR = /ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK|ERR_CONNECTION|ERR_TIMED_OUT|ENOTFOUND|ENETUNREACH|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN/;

/** Plain words for electron-updater's technical errors; the raw text goes to the log only. */
export function plainUpdateError({ message }: { message: string }, _optionalArgs = {}): string {
  if (NETWORK_ERROR.test(message)) return 'Tovu couldn’t reach the update server. Check your internet connection and try again.';
  return 'Something went wrong while checking. Try again in a few minutes.';
}

const AUTO_OFF = 'Automatic updates are off.';

/** What the operator reads for each outcome; `ready` reuses the existing prompt instead. */
export function updateCheckNotice(
  { outcome, currentVersion, isPackaged, automaticUpdates, errorMessage = '' }: {
    outcome: UpdateCheckOutcome; currentVersion: string; isPackaged: boolean; automaticUpdates: boolean; errorMessage?: string;
  },
  _optionalArgs = {},
): UpdateNotice | null {
  switch (outcome.kind) {
    case 'ready': return null;
    case 'unavailable': return isPackaged
      ? { type: 'info', message: 'Updates are off for this copy of Tovu', detail: `Reason: ${outcome.reason}.` }
      : { type: 'info', message: 'Updates only work in the installed app', detail: `This is a development copy of Tovu (${currentVersion}).` };
    case 'up-to-date': return {
      type: 'info', message: `You’re up to date (${outcome.version})`,
      detail: automaticUpdates ? 'This is the newest version of Tovu.' : `This is the newest version of Tovu. ${AUTO_OFF}`,
    };
    case 'downloading': return {
      type: 'info', message: `Downloading Tovu ${outcome.version}…`,
      detail: `You have ${currentVersion}. Tovu asks you to restart when the download finishes.`,
    };
    case 'available': return {
      type: 'info', message: `Tovu ${outcome.version} is available`,
      detail: `You have ${currentVersion}. ${AUTO_OFF} Turn on Settings › Automatically update Tovu to download and install it.`,
    };
    case 'error': return { type: 'error', message: 'Couldn’t check for updates', detail: plainUpdateError({ message: errorMessage }) };
  }
}

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);

/**
 * One manual check at a time: a second click while one runs joins it, so no second dialog opens.
 * With automatic updates off it only looks: nothing downloads, and the notice says so.
 * @complexity O(1) per click, plus one network check.
 */
export function createUpdateCheckNow(deps: UpdateCheckNowDeps, _optionalArgs = {}): { checkNow: () => Promise<UpdateCheckOutcome> } {
  let inFlight: Promise<UpdateCheckOutcome> | null = null;

  function report(outcome: UpdateCheckOutcome, errorMessage?: string): UpdateCheckOutcome {
    const notice = updateCheckNotice({
      outcome, currentVersion: deps.currentVersion(), isPackaged: deps.isPackaged,
      automaticUpdates: deps.automaticUpdates(), errorMessage,
    });
    if (notice) deps.notify(notice);
    return outcome;
  }

  async function run(): Promise<UpdateCheckOutcome> {
    const skip = deps.skipReason();
    if (skip !== null) return report({ kind: 'unavailable', reason: skip });
    const automatic = deps.automaticUpdates();
    try {
      const ready = automatic ? deps.readyVersion() : null;
      if (ready !== null) {
        await deps.showReadyPrompt({ version: ready });
        return { kind: 'ready', version: ready };
      }
      const updater = await deps.loadUpdater();
      if (!automatic) {
        // A first import has electron-updater's defaults; the operator asked for a look only.
        updater.autoDownload = false;
        updater.autoInstallOnAppQuit = false;
      }
      const result = await updater.checkForUpdates();
      const version = result?.updateInfo?.version;
      if (!result?.isUpdateAvailable || !version) return report({ kind: 'up-to-date', version: deps.currentVersion() });
      if (!automatic) return report({ kind: 'available', version });
      // The controller's own listener prompts when this finishes; only a failure needs saying here.
      result.downloadPromise?.catch((error: unknown) => {
        deps.log({ message: `update download failed: ${messageOf(error)}` });
        deps.notify({ type: 'error', message: `Couldn’t download Tovu ${version}`, detail: plainUpdateError({ message: messageOf(error) }) });
      });
      return report({ kind: 'downloading', version });
    } catch (error) {
      deps.log({ message: `update check failed: ${messageOf(error)}` });
      return report({ kind: 'error' }, messageOf(error));
    }
  }

  return {
    checkNow() {
      inFlight ??= run().finally(() => { inFlight = null; });
      return inFlight;
    },
  };
}

/** Register once with the sites home IPC. The renderer only awaits; main shows every notice. */
export function registerUpdateCheckIpc(
  { ipcMain, checkNow }: {
    ipcMain: { handle: (channel: string, listener: () => Promise<void>) => void };
    checkNow: () => Promise<UpdateCheckOutcome>;
  },
  _optionalArgs = {},
): void {
  ipcMain.handle(RUNNER_APP_CHECK_FOR_UPDATES_CHANNEL, async () => { await checkNow(); });
}
