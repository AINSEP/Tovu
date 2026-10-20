/** Pure option resolution for createSitesWorkspace; no settings, catalog or database I/O. */
import fs from "node:fs";
import path from "node:path";

/** Ambient and explicit storage overrides the test-home guard must see before any settings/catalog read.
 * Blank entries are dropped; the rest are trimmed and resolved against cwd. O(n) in TOVU_SITE_ROOTS + sourceRoots.
 */
export function ownerStorageOverrides(
  { env, cwd }: { env: NodeJS.ProcessEnv; cwd: string },
  { appDataDir, sourceRoots = [] }: { appDataDir?: string; sourceRoots?: readonly string[] } = {},
): string[] {
  const underEnv = (name: "APPDATA" | "XDG_DATA_HOME" | "XDG_CONFIG_HOME") => env[name] && path.join(env[name], "Tovu");
  return [appDataDir, env.TOVU_DESKTOP_USER_DATA_DIR, env.TOVU_SITES_HOME, underEnv("APPDATA"), underEnv("XDG_DATA_HOME"), underEnv("XDG_CONFIG_HOME"),
    ...(env.TOVU_SITE_ROOTS?.split(",") ?? []), ...sourceRoots]
    .filter((value): value is string => !!value?.trim()).map((value) => path.resolve(cwd, value.trim()));
}

/** A Tovu checkout keeps its legacy `sites` folder discoverable; any other cwd adds no source root. */
export function defaultSourceRoots({ cwd }: { cwd: string }): string[] {
  return fs.existsSync(path.join(cwd, "apps", "website", "src")) ? [path.join(cwd, "sites")] : [];
}

/** The app-data folder handed to the directory workspace. An explicit appDataDir wins; otherwise a
 * non-blank TOVU_DESKTOP_USER_DATA_DIR resolves against cwd with the target platform's path rules,
 * and a blank one leaves the platform default (undefined).
 */
export function desktopProfileDir(
  { env, cwd }: { env: NodeJS.ProcessEnv; cwd: string },
  { appDataDir, platform }: { appDataDir?: string; platform?: NodeJS.Platform } = {},
): string | undefined {
  if (appDataDir !== undefined) return appDataDir;
  const profile = env.TOVU_DESKTOP_USER_DATA_DIR?.trim();
  if (!profile) return undefined;
  return (platform === "win32" ? path.win32 : path).resolve(cwd, profile);
}
