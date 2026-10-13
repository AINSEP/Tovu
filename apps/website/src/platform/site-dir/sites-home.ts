/** Tovu's folder/filenames; generic resolution, locking and registry policy belong to Jini. */
import { desktopProjectPaths } from "./sites-project-references.js";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { createDurableJsonFile, createNodeDirectoryWorkspace, createNodeDurableJsonPorts, type DurableJsonPorts } from "@jini-ai/platform/fs";

export function createSitesWorkspace(_required: Record<string, never>, { homeDir = os.homedir(), env = process.env, cwd = process.cwd(), sourceRoots, catalogRecovery = false, appDataDir, ...directoryOptions }: {
  homeDir?: string; env?: NodeJS.ProcessEnv; cwd?: string; sourceRoots?: readonly string[]; catalogRecovery?: boolean;
  appDataDir?: string;
  canonicalPath?: (required: { path: string }) => string;
  ports?: import("@jini-ai/platform/fs").DurableJsonPorts;
  platform?: NodeJS.Platform; windowsDocuments?: () => string | undefined; readText?: (file: string) => string | undefined;
} = {}) {
  const workspace = createNodeDirectoryWorkspace({ homeDir, defaultFolder: "Tovu", envName: "TOVU_SITES_HOME",
    settingsFile: path.join(homeDir, ".tovu", "sites-home.json"), registryName: "sites.json", runningName: ".tovu-running.json",
    ...(catalogRecovery ? { registryRecovery: { fixtureIdPattern: /^(?:minted-id|new-site-id)-\d+$/ } } : {}),
    userConfig: { appName: "Tovu", rootsEnvName: "TOVU_SITE_ROOTS", legacyDefaultFolder: "Tovu Sites",
      legacySettingsFile: path.join(homeDir, ".tovu", "sites-home.json"),
      sourceRoots: sourceRoots ?? (fs.existsSync(path.join(cwd, "apps", "website", "src")) ? [path.join(cwd, "sites")] : []),
    } }, { env, cwd, ...directoryOptions,
      // Desktop's child CLI must share its parent's profile for settings, catalog and databases.
      appDataDir: appDataDir ?? (env.TOVU_DESKTOP_USER_DATA_DIR?.trim() ? (directoryOptions.platform === "win32" ? path.win32 : path).resolve(cwd, env.TOVU_DESKTOP_USER_DATA_DIR.trim()) : undefined),
    });
  return { ...workspace, ...nestedSitesCompat({ workspace }, { ports: directoryOptions.ports }), projectsPaths: desktopProjectPaths({ homeDir, env, platform: directoryOptions.platform ?? process.platform, appData: workspace.config({}).appData }) };
}
export type SitesWorkspace = ReturnType<typeof createSitesWorkspace>;

/** The released 0.1.14 default nested sites in Documents/Tovu/sites; desktop startup moves them back up.
 * Explicit homes (saved setting or environment override) keep their contracts and never qualify.
 * Sites the move skips (running, locked, name clash) stay discoverable without saving an extra root.
 * @complexity O(n) immediate children of the nested folder; never writes settings.
 */
function nestedSitesCompat({ workspace }: { workspace: ReturnType<typeof createNodeDirectoryWorkspace> }, { ports = createNodeDurableJsonPorts({}) }: { ports?: DurableJsonPorts } = {}) {
  const nestedSitesRoot = (_required: Record<string, never>, _options = {}) => nestedRoot({ workspace }, { ports });
  return { nestedSitesRoot, roots: (_required: Record<string, never>, _options = {}) => {
    const roots = workspace.roots({}), nested = nestedSitesRoot({});
    try {
      return nested && fs.readdirSync(nested).some((name) => fs.existsSync(path.join(nested, name, ".site-meta.json"))) ? [...new Set([...roots, nested])] : roots;
    } catch { return roots; }
  } };
}

function nestedRoot({ workspace }: { workspace: ReturnType<typeof createNodeDirectoryWorkspace> }, { ports }: { ports: DurableJsonPorts }): string | undefined {
  const config = workspace.config({});
  if (config.overrides.sitesHome) return undefined;
  const saved = createDurableJsonFile({ ...ports, filePath: config.configPath,
    notices: { prefix: "Tovu sites", lockTimeout: () => "Tovu sites settings are locked." },
  }).read({});
  // An unreadable setting may contain a custom pointer: discovery must not authorize a move.
  if (saved.state === "unreadable") return undefined;
  if (saved.state === "ok" && (saved.value as { sitesHome?: unknown } | null)?.sitesHome !== undefined) return undefined;
  const root = path.join(workspace.home({}), "sites");
  try {
    if (!fs.lstatSync(root).isDirectory()) return undefined;
    // A real website named "sites" is a website, never a compatibility container.
    if (fs.existsSync(path.join(root, ".site-meta.json"))) return undefined;
    return root;
  } catch { return undefined; }
}

/** Creation always uses the shared home. Legacy checkout sites remain a discovery source only. */
export function resolveSitesHome(_required: Record<string, never>, options: Parameters<typeof createSitesWorkspace>[1] = {}): string {
  return createSitesWorkspace({}, options).home({});
}

/** Startup notice points at the two supported remedies, without changing live storage. */
export function reportSitesSyncWarning({ workspace = createSitesWorkspace({}) }: { workspace?: SitesWorkspace }, { report = console.warn }: { report?: (message: string) => void } = {}): void {
  const warning = workspace.config({}).warning;
  if (warning) report(`${warning.message} Choose appData in Sites settings or use ${warning.localHome}.`);
}
