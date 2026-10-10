/** Browser-safe channel for the sites home brand's Electron application version. */
export const RUNNER_APP_VERSION_CHANNEL = 'runner:app:version';

/** Only main reads the installed application version; the renderer sends no arguments. */
export interface RunnerAppVersionBridge {
  /** Resolves app.getVersion() verbatim, or rejects with the IPC failure. */
  getAppVersion: () => Promise<string>;
}
