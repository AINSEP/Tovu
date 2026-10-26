/** Browser-safe channel for the sites home brand's Electron application version. */
export const RUNNER_APP_VERSION_CHANNEL = 'runner:app:version';

/** Only main reads the installed application version; the renderer sends no arguments. */
export interface RunnerAppVersionBridge {
  /** Resolves app.getVersion() verbatim when packaged, `<nearest desktop-v tag>-dev` in a dev launch, or rejects with the IPC failure. */
  getAppVersion: () => Promise<string>;
}

/** Settings › Check for updates…: main runs one check in this copy and shows every notice itself. */
export const RUNNER_APP_CHECK_FOR_UPDATES_CHANNEL = 'runner:app:check-for-updates';

export interface RunnerUpdateCheckBridge {
  /** Resolves once the check's first notice is shown; never carries renderer input. */
  checkForUpdates: () => Promise<void>;
}
