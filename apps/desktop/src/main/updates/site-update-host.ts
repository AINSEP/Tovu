/**
 * @file The desktop app's side of a site update: the Jini desktop site-update adapter's host ports (running version,
 * stage, swap, rollback, health), expressed over the app's own electron-updater. The shapes are structural (they match
 * Jini's `DesktopAppUpdaterPort`/`SiteHealthPort`) so the desktop package takes no new dependency. Building the host is
 * inert: nothing is checked, downloaded or relaunched until the owner approves `site_update_apply`'s card.
 */

/** The slice of electron-updater's `autoUpdater` the hand-off uses. */
export interface UpdaterHandoff {
  checkForUpdates(): Promise<{ updateInfo: { version: string } } | null | undefined>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
}

export interface DesktopUpdateHostRequired {
  updater: UpdaterHandoff;
  /** The app version running now (`app.getVersion()`), read live. */
  appVersion: () => string;
  /** Site data side, bound by the site process: run the new version's migrations, or restore the pre-update backup. */
  migrate: {
    migrate(required: { toVersion: string; backupId: string }): Promise<void>;
    restore(required: { backupId: string }): Promise<void>;
  };
}

/**
 * @returns The desktop host ports for the site-update runtime: `stage` downloads only the version on the card,
 *   `applyStaged` hands off to the updater's restart-and-install, and `rollbackTo` is a no-op until a swap happened.
 * @complexity O(1) port calls; the download is the updater's own.
 */
export function createDesktopUpdateHost({ updater, appVersion, migrate }: DesktopUpdateHostRequired, _optional = {}) {
  return {
    kind: "desktop" as const,
    migrate,
    app: {
      currentVersion: async () => appVersion(),
      stage: async ({ version }: { version: string }) => {
        // electron-updater downloads whatever IT found newest: refuse when that is not the version the owner approved.
        const found = (await updater.checkForUpdates())?.updateInfo.version;
        if (found !== version) throw new Error(`The app updater offers ${found ?? "no update"}, not the approved ${version}. Nothing was changed.`);
        await updater.downloadUpdate();
      },
      applyStaged: async () => { updater.quitAndInstall(); },
      rollbackTo: async ({ version }: { version: string }) => {
        if (appVersion() === version) return;
        throw new Error(`The desktop app cannot step back to ${version} by itself. Reinstall ${version} from the release page; your site data was restored.`);
      },
    },
    health: {
      check: async ({ expectedVersion }: { expectedVersion: string }) => appVersion() === expectedVersion
        ? { status: "healthy" as const }
        : { status: "unhealthy" as const, reason: `The app reports ${appVersion()}, not ${expectedVersion}.` },
    },
  };
}
