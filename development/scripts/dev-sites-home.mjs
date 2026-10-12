/** Dev uses the same Jini resolver, registry and default selection as the server/desktop. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createNodeDirectoryWorkspace, selectWorkspaceDirectory } from "@jini-ai/platform/fs";

/** Resolve the named development site and its live owner without creating folders.
 * @param {{repoRoot: string}} required Checkout root used only for legacy discovery.
 * @param {{env?: NodeJS.ProcessEnv, homeDir?: string}} optional Isolated environment/home ports.
 * @returns Selected directory, sync warning and existing running record.
 * @throws When no complete selected site exists; the launcher must not start a writing API child.
 * @complexity O(n + r) catalog entries and configured roots; O(n + r) candidate space.
 */
export function devSitesHome({ repoRoot }, { env = process.env, homeDir = os.homedir() } = {}) {
  const workspace = createNodeDirectoryWorkspace({ homeDir, defaultFolder: "Tovu", envName: "TOVU_SITES_HOME",
    settingsFile: path.join(homeDir, ".tovu", "sites-home.json"), registryName: "sites.json", runningName: ".tovu-running.json",
    userConfig: { appName: "Tovu", defaultSubfolder: "sites", rootsEnvName: "TOVU_SITE_ROOTS", sourceRoots: [path.join(repoRoot, "sites")],
      legacyDefaultFolder: "Tovu Sites", legacySettingsFile: path.join(homeDir, ".tovu", "sites-home.json") },
  }, { env, cwd: repoRoot });
  const isInitialized = ({ path: dir }) => fs.existsSync(path.join(dir, "config.json")) && fs.existsSync(path.join(dir, ".site-meta.json"));
  // Keep the named dev site, while letting the shared home/catalog find it after a move.
  // An unrelated MRU must never silently become the development site.
  const dir = env.TOVU_SITE_DIR !== undefined ? path.resolve(env.TOVU_SITE_DIR) : selectWorkspaceDirectory({
    home: workspace.home({}), roots: workspace.roots({}), entries: workspace.registry({}).list({}), selected: env.TOVU_SITE ?? "tovu-dev", fallback: path.join(repoRoot, "sites", "tovu-dev"),
    listDirectories: ({ root }) => {
      try { return fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => path.join(root, entry.name)); }
      catch (error) { if (error.code === "ENOENT") return []; throw error; }
    },
    isInitialized,
  });
  // Refuse before the API child can create logs/DB parents or seed themes at a stale default.
  if (!isInitialized({ path: dir })) throw new Error(`Site folder is unavailable: ${dir}. No development server was started.`);
  const warning = workspace.config({}).warning;
  return { dir, warning, running: workspace.running({ path: dir }).peek({}) };
}
