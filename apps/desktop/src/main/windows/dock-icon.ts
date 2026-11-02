/**
 * @file The macOS dock tile's icon, extracted from `main.ts`'s `applyDockIcon` so its two decisions —
 * skip where there is no dock, never fail the boot over an icon — are verified without Electron.
 * `main.ts` passes `app.dock` in.
 */

/**
 * Put the Tovu mark on the macOS dock tile.
 *
 * `BrowserWindow`'s own `icon` option is a no-op on macOS — the tile comes from the `.app` bundle,
 * which an unpackaged `electron .` run does not have, so it shows Electron's own default instead.
 * `app.dock.setIcon` is the only thing that changes it for a dev run. Guarded on the API existing
 * rather than on the platform string alone, since `app.dock` is undefined off darwin.
 *
 * Best-effort: a missing or unreadable icon file must not stop the app booting.
 *
 * @param dock `app.dock`; `undefined` off macOS.
 * @param iconPath the Tovu mark's PNG.
 * @param log where a failure is reported.
 * @complexity O(1).
 */
function applyDockIcon(
  { dock, iconPath, log }: { dock: { setIcon(iconPath: string): void } | undefined; iconPath: string; log: (message: string) => void },
  _optional = {},
): void {
  if (!dock) return;
  try {
    dock.setIcon(iconPath);
  } catch (error) {
    log(`tovu desktop: could not set the dock icon (${(error as Error).message}) — using the default.`);
  }
}

export { applyDockIcon };
