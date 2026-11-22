/**
 * @file Where this app's `userData` directory is, computed WITHOUT Electron.
 *
 * `main.ts` never needs this — it has `app.getPath("userData")`. The CLI does: `tovu-desktop
 * add-site` is a plain Node process that must edit the very same `desktop-projects.json` the running
 * app renders, and the MCP bridge is handed the path on argv precisely so it does not have to guess.
 * So this exists for exactly one caller, and its correctness is the CLI's whole correctness.
 *
 * **This MIRRORS Electron rather than deriving from it, and that is a real, named risk.** If
 * Electron's path convention ever changes, or the app's name changes, this drifts and the CLI
 * silently edits a registry nobody reads. Three things hold it down:
 *
 * 1. This is the DEV app's folder: `main.ts` sets `userData` to `<appData>/tovu-desktop` from this
 *    same constant (via `packaged-paths.ts`). A packaged build uses its own `Tovu` folder, which this
 *    checkout CLI does not target — pass `--user-data-dir` for that.
 * 2. {@link DESKTOP_APP_NAME} is asserted against `package.json` by this module's own test, so a
 *    rename of the package cannot leave this constant behind.
 * 3. The CLI PRINTS the directory it resolved on every run (`bin/tovu-desktop.ts`), so a wrong
 *    answer is visible to the operator immediately instead of being discovered as a missing card.
 *
 * `TOVU_DESKTOP_USER_DATA_DIR` is honoured first, which is the same override `main.ts`'s userData
 * `app.setPath` applies — reused rather than reinvented so the app and the CLI cannot be pointed
 * at two different directories by the same environment.
 */
import os from "node:os";
import path from "node:path";
import { resolveElectronUserDataDir } from "@jini-ai/platform/fs";

/** Electron's `app.getName()` for this app: `package.json`'s `"name"`. See this file's header, and
 *  the test that pins it to the manifest. */
const DESKTOP_APP_NAME = "tovu-desktop";

/** {@link resolveDesktopUserDataDir}'s options. Each one defaults to the real process's value. */
interface ResolveDesktopUserDataDirOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homedir?: string;
}

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
function resolveDesktopUserDataDir(options: ResolveDesktopUserDataDirOptions = {}): string {
  const env = options.env ?? process.env;
  const override = env.TOVU_DESKTOP_USER_DATA_DIR?.trim();
  if (override) return path.resolve(override);

  const platform = options.platform ?? process.platform;
  const dir = resolveElectronUserDataDir({ platform, env, homeDir: options.homedir ?? os.homedir(), appName: DESKTOP_APP_NAME });
  if (dir === undefined) {
    throw new Error(
      `tovu-desktop: no known userData location for platform '${platform}'. Set TOVU_DESKTOP_USER_DATA_DIR to the app's data directory.`,
    );
  }
  return dir;
}

export { DESKTOP_APP_NAME, resolveDesktopUserDataDir };
export type { ResolveDesktopUserDataDirOptions };
