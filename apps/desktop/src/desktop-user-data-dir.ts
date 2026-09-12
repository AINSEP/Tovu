/**
 * @file Where this app's `userData` directory is, computed WITHOUT Electron.
 *
 * `main.js` never needs this — it has `app.getPath("userData")`. The CLI does: `tovu-desktop
 * add-site` is a plain Node process that must edit the very same `desktop-projects.json` the running
 * app renders, and the MCP bridge is handed the path on argv precisely so it does not have to guess.
 * So this exists for exactly one caller, and its correctness is the CLI's whole correctness.
 *
 * **This MIRRORS Electron rather than deriving from it, and that is a real, named risk.** If
 * Electron's path convention ever changes, or the app's name changes, this drifts and the CLI
 * silently edits a registry nobody reads. Three things hold it down:
 *
 * 1. The app name is `tovu-desktop` because `package.json`'s `"name"` is — Electron's `app.getName()`
 *    reads the manifest, and `electron-builder.yml`'s `productName: Tovu` names only the packaged
 *    BUNDLE, not this path. Verified against the live signed app: every helper process carries
 *    `--user-data-dir=.../tovu-desktop`, in dev and packaged alike.
 * 2. {@link DESKTOP_APP_NAME} is asserted against `package.json` by this module's own test, so a
 *    rename of the package cannot leave this constant behind.
 * 3. The CLI PRINTS the directory it resolved on every run (`bin/tovu-desktop.mjs`), so a wrong
 *    answer is visible to the operator immediately instead of being discovered as a missing card.
 *
 * `TOVU_DESKTOP_USER_DATA_DIR` is honoured first, which is the same override `main.js:139-141`
 * applies via `app.setPath` — reused rather than reinvented so the app and the CLI cannot be pointed
 * at two different directories by the same environment.
 */
import os from "node:os";
import path from "node:path";

/** Electron's `app.getName()` for this app: `package.json`'s `"name"`. See this file's header, and
 *  the test that pins it to the manifest. */
const DESKTOP_APP_NAME = "tovu-desktop";

/**
 * The platform's per-user application-data root — Electron's `appData` path, which `userData` is one
 * named directory inside.
 *
 * A table so each platform's rule is visible and independently correctable. Linux honours
 * `XDG_CONFIG_HOME` because Electron does; Windows uses `APPDATA` for the same reason, with the
 * conventional fallback for a stripped environment.
 *
 * @complexity O(1).
 */
const APP_DATA_ROOTS = Object.freeze({
  darwin: (env, home) => path.join(home, "Library", "Application Support"),
  win32: (env, home) => env.APPDATA?.trim() || path.join(home, "AppData", "Roaming"),
  linux: (env, home) => env.XDG_CONFIG_HOME?.trim() || path.join(home, ".config"),
});

/**
 * This app's `userData` directory.
 *
 * @param options.env environment to read (`process.env` by default), for the override and the
 *   platform roots.
 * @param options.platform `process.platform` by default.
 * @param options.homedir `os.homedir()` by default.
 * @returns an absolute path. Not created, and not checked for existence — a caller that cares
 *   (the CLI does) reports on that itself, since "the app has never run" and "this resolver is
 *   wrong" look identical from here and only the caller can say which matters.
 * @throws {Error} on a platform with no known convention, rather than guessing one.
 * @complexity O(1).
 */
function resolveDesktopUserDataDir(options = {}) {
  const env = options.env ?? process.env;
  const override = env.TOVU_DESKTOP_USER_DATA_DIR?.trim();
  if (override) return path.resolve(override);

  const platform = options.platform ?? process.platform;
  const root = APP_DATA_ROOTS[platform];
  if (root === undefined) {
    throw new Error(
      `tovu-desktop: no known userData location for platform '${platform}'. Set TOVU_DESKTOP_USER_DATA_DIR to the app's data directory.`,
    );
  }
  return path.join(root(env, options.homedir ?? os.homedir()), DESKTOP_APP_NAME);
}

export { APP_DATA_ROOTS, DESKTOP_APP_NAME, resolveDesktopUserDataDir };
