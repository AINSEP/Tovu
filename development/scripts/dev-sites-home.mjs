/** Dev uses the same Jini resolver, registry and default selection as the server/desktop. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createNodeDirectoryWorkspace, selectWorkspaceDirectory } from "@jini-ai/platform/fs";

export function devSitesHome({ repoRoot }, { env = process.env, homeDir = os.homedir() } = {}) {
  const workspace = createNodeDirectoryWorkspace({ homeDir, defaultFolder: "Tovu", envName: "TOVU_SITES_HOME",
    settingsFile: path.join(homeDir, ".tovu", "sites-home.json"), registryName: "sites.json", runningName: ".tovu-running.json",
    userConfig: { appName: "Tovu", rootsEnvName: "TOVU_SITE_ROOTS", sourceRoots: [path.join(repoRoot, "sites")],
      legacyDefaultFolder: "Tovu Sites", legacySettingsFile: path.join(homeDir, ".tovu", "sites-home.json") },
  }, { env, cwd: repoRoot });
  const dir = env.TOVU_SITE_DIR !== undefined ? path.resolve(env.TOVU_SITE_DIR) : env.TOVU_SITE === undefined ? path.join(repoRoot, "sites", "tovu-dev") : selectWorkspaceDirectory({
    home: workspace.home({}), roots: workspace.roots({}), entries: workspace.registry({}).list({}), selected: env.TOVU_SITE, fallback: path.join(repoRoot, "sites", "tovu-dev"),
    listDirectories: ({ root }) => {
      try { return fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => path.join(root, entry.name)); }
      catch (error) { if (error.code === "ENOENT") return []; throw error; }
    },
    isInitialized: ({ path: dir }) => fs.existsSync(path.join(dir, "config.json")) && fs.existsSync(path.join(dir, ".site-meta.json")),
  });
  const warning = workspace.config({}).warning;
  return { dir, warning, running: workspace.running({ path: dir }).peek({}) };
}
