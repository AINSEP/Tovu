/**
 * The deployed IPC channel names for the sites home's version and update-check bridges. The bridge
 * shapes (`AppVersionBridge`, `UpdateCheckBridge`) are `@jini-ai/desktop-host/app-version`'s; only
 * the channel strings, which the preload and main must agree on, live here.
 */
/** Browser-safe channel for the sites home brand's Electron application version. */
export const RUNNER_APP_VERSION_CHANNEL = 'runner:app:version';

/** Settings › Check for updates…: main runs one check in this copy and shows every notice itself. */
export const RUNNER_APP_CHECK_FOR_UPDATES_CHANNEL = 'runner:app:check-for-updates';
