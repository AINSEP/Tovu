/** Tovu's folder/filenames; generic resolution, locking and registry policy belong to Jini. */
import { desktopProjectPaths } from "./sites-project-references.js";
import { nestedSitesCompat } from "./nested-sites-root.js";
import { defaultSourceRoots, desktopProfileDir, ownerStorageOverrides } from "./sites-workspace-options.js";
import { assertTestHomeIsolation } from "../test-home-isolation.js";
export { assertTestHomeIsolation } from "../test-home-isolation.js";
import os from "node:os";
import path from "node:path";
import { createNodeDirectoryWorkspace, type DurableJsonPorts } from "@jini-ai/platform/fs";

/** Fixture catalogs from earlier test runs (minted/new-site ids) may be discarded on desktop startup. */
const CATALOG_RECOVERY = { registryRecovery: { fixtureIdPattern: /^(?:minted-id|new-site-id)-\d+$/ } };

export function createSitesWorkspace(_required: Record<string, never>, { homeDir = os.homedir(), env = process.env, cwd = process.cwd(), sourceRoots, catalogRecovery = false, appDataDir, ...directoryOptions }: {
  homeDir?: string; env?: NodeJS.ProcessEnv; cwd?: string; sourceRoots?: readonly string[]; catalogRecovery?: boolean;
  appDataDir?: string;
  canonicalPath?: (required: { path: string }) => string;
  ports?: DurableJsonPorts;
  platform?: NodeJS.Platform; windowsDocuments?: () => string | undefined; readText?: (file: string) => string | undefined;
} = {}) {
  // Check ambient overrides before the shared resolver can read any settings/catalog files.
  assertTestHomeIsolation({ homeDir }, { paths: ownerStorageOverrides({ env, cwd }, { appDataDir, sourceRoots }) });
  const workspace = createNodeDirectoryWorkspace({ homeDir, defaultFolder: "Tovu", envName: "TOVU_SITES_HOME",
    settingsFile: path.join(homeDir, ".tovu", "sites-home.json"), registryName: "sites.json", runningName: ".tovu-running.json",
    ...(catalogRecovery ? CATALOG_RECOVERY : {}),
    userConfig: { appName: "Tovu", rootsEnvName: "TOVU_SITE_ROOTS", legacyDefaultFolder: "Tovu Sites",
      legacySettingsFile: path.join(homeDir, ".tovu", "sites-home.json"),
      sourceRoots: sourceRoots ?? defaultSourceRoots({ cwd }),
    } }, { env, cwd, ...directoryOptions,
      // Desktop's child CLI must share its parent's profile for settings, catalog and databases.
      appDataDir: desktopProfileDir({ env, cwd }, { appDataDir, platform: directoryOptions.platform }),
    });
  const config = workspace.config({});
  assertTestHomeIsolation({ homeDir }, { paths: [config.appData, config.configPath, config.sitesHome, ...config.siteRoots] });
  return { ...workspace, ...nestedSitesCompat({ workspace }, { ports: directoryOptions.ports }), projectsPaths: desktopProjectPaths({ homeDir, env, platform: directoryOptions.platform ?? process.platform, appData: config.appData }) };
}
export type SitesWorkspace = ReturnType<typeof createSitesWorkspace>;

/** Creation always uses the shared home. Legacy checkout sites remain a discovery source only. */
export function resolveSitesHome(_required: Record<string, never>, options: Parameters<typeof createSitesWorkspace>[1] = {}): string {
  return createSitesWorkspace({}, options).home({});
}

/** Startup notice points at the two supported remedies, without changing live storage. */
export function reportSitesSyncWarning({ workspace = createSitesWorkspace({}) }: { workspace?: SitesWorkspace }, { report = console.warn }: { report?: (message: string) => void } = {}): void {
  const warning = workspace.config({}).warning;
  if (warning) report(`${warning.message} Choose appData in Sites settings or use ${warning.localHome}.`);
}
