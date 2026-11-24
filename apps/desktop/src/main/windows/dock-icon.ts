/**
 * @file Host binding for the macOS dock tile's icon: binds the desktop log copy (and the formatting
 * of the raw error Jini hands back) onto Jini `desktop-host/electron/windows`'s best-effort
 * `applyDockIcon`. `main.ts` passes `app.dock` in.
 */
import { applyDockIcon as applyDockIconBestEffort } from "@jini-ai/desktop-host/electron/windows";

/**
 * Put the Tovu mark on the macOS dock tile; a failure is logged and the boot carries on.
 *
 * @param required.dock `app.dock`; `undefined` off macOS.
 * @param required.iconPath the Tovu mark's PNG.
 * @param required.log where a failure is reported.
 * @complexity O(1).
 */
function applyDockIcon(
  { dock, iconPath, log }: { dock: { setIcon(iconPath: string): void } | undefined; iconPath: string; log: (required: { message: string }) => void },
  _optional = {},
): void {
  applyDockIconBestEffort({ dock, iconPath, reportFailure: ({ error }) => {
    const reason = error instanceof Error ? error.message : String(error);
    log({ message: `tovu desktop: could not set the dock icon (${reason}) — using the default.` });
  } });
}

export { applyDockIcon };
