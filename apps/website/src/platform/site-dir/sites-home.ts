/** Tovu's folder/filenames; generic resolution, locking and registry policy belong to Jini. */
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { createNodeDirectoryWorkspace } from "@jini-ai/platform/fs";

export function createSitesWorkspace(_required: Record<string, never>, { homeDir = os.homedir(), env = process.env, cwd = process.cwd(), sourceRoots, ...directoryOptions }: {
  homeDir?: string; env?: NodeJS.ProcessEnv; cwd?: string; sourceRoots?: readonly string[];
  platform?: NodeJS.Platform; windowsDocuments?: () => string | undefined; readText?: (file: string) => string | undefined;
} = {}) {
  return createNodeDirectoryWorkspace({ homeDir, defaultFolder: "Tovu", envName: "TOVU_SITES_HOME",
    settingsFile: path.join(homeDir, ".tovu", "sites-home.json"), registryName: "sites.json", runningName: ".tovu-running.json",
    userConfig: { appName: "Tovu", rootsEnvName: "TOVU_SITE_ROOTS", legacyDefaultFolder: "Tovu Sites",
      legacySettingsFile: path.join(homeDir, ".tovu", "sites-home.json"),
      sourceRoots: sourceRoots ?? (fs.existsSync(path.join(cwd, "apps", "website", "src")) ? [path.join(cwd, "sites")] : []),
    } }, { env, cwd, ...directoryOptions });
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
