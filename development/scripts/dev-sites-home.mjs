/** Dev uses the same Jini resolver, registry and default selection as the server/desktop. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
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
  }, { env, cwd: repoRoot, ...(env.TOVU_DESKTOP_USER_DATA_DIR ? { appDataDir: path.resolve(repoRoot, env.TOVU_DESKTOP_USER_DATA_DIR) } : {}) });
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
  }, { isAvailable: isInitialized });
  // Refuse before the API child can create logs/DB parents or seed themes at a stale default.
  if (!isInitialized({ path: dir })) throw new Error(`Site folder is unavailable: ${dir}. No development server was started.`);
  const warning = workspace.config({}).warning;
  const meta = JSON.parse(fs.readFileSync(path.join(dir, ".site-meta.json"), "utf8"));
  const dbPath = env.TOVU_CONTENT_DB ?? workspace.databasePath({ dir, id: meta.siteId ?? meta.siteKeyId, filename: "content.db" });
  return { dir, dbPath, warning, running: workspace.running({ path: dir }).peek({}) };
}

/** Create a disposable development site through the existing CLI initializer, never by copying a
 * site's identity or database. The private profile also isolates catalogs and app-data DB placement.
 * @complexity One bounded child invocation; init owns filesystem/database work and cleanup.
 */
function initializeScratchSite({ repoRoot, dir, env }, _options = {}) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "apps/website/src/cli/main.ts", "init", dir, "--name", "Development scratch"], {
    cwd: repoRoot, env, stdio: "inherit", timeout: 120_000, windowsHide: true,
  });
  if (result.error || result.status !== 0) throw new Error("tovu dev: could not initialize the isolated scratch site; no existing site database was selected.");
}

/** A path-derived scratch namespace is distinct for full clones as well as git worktrees.
 * @returns A stable temporary root without creating it. @complexity O(p) checkout path bytes.
 */
function scratchSiteRoot({ repoRoot }, { scratchRoot } = {}) {
  if (scratchRoot !== undefined) return scratchRoot;
  const checkoutId = createHash("sha256").update(fs.realpathSync(repoRoot)).digest("hex").slice(0, 20);
  return path.join(os.tmpdir(), `tovu-dev-${checkoutId}`);
}

/** Initialization failure degrades to memory, never to an existing shared site.
 * @returns Whether the persistent scratch site is available. @complexity One bounded init call.
 */
async function prepareScratchSite({ repoRoot, env }, { initialize = initializeScratchSite, log = console.log } = {}) {
  try {
    fs.mkdirSync(env.TOVU_SITES_HOME, { recursive: true });
    if (!fs.existsSync(path.join(env.TOVU_SITE_DIR, ".site-meta.json"))) await initialize({ repoRoot, dir: env.TOVU_SITE_DIR, env });
    return true;
  } catch {
    log("tovu dev: scratch initialization is unavailable; continuing in memory. Changes will not persist; no existing site database will be migrated.");
    return false;
  }
}

/** Implicit dev starts use a checkout-specific scratch site. There is no reliable distinction
 * between a live checkout and a full clone: only an explicit site selection authorizes using
 * existing site data. Never let a shared home, copied identity or database override choose it.
 * @param {{repoRoot: string}} required Checkout whose dev server will start.
 * @param {{env?: NodeJS.ProcessEnv, homeDir?: string, scratchRoot?: string, initialize?: (input: {repoRoot: string, dir: string, env: NodeJS.ProcessEnv}) => void | Promise<void>, log?: (message: string) => void}} optional Effect seams.
 * @returns Selected site plus the environment that must reach every API child.
 * @complexity O(n) environment entries plus the existing resolver and at most one site init.
 */
export async function prepareDevSitesHome({ repoRoot }, {
  env = process.env, homeDir = os.homedir(), scratchRoot, initialize = initializeScratchSite, log = console.log,
} = {}) {
  const selectedEnv = { ...env };
  const implicit = env.TOVU_SITE === undefined && env.TOVU_SITE_DIR === undefined;
  if (implicit) {
    const root = scratchSiteRoot({ repoRoot }, { scratchRoot });
    const sitesHome = path.join(root, "sites"), dir = path.join(sitesHome, "tovu-scratch");
    Object.assign(selectedEnv, { TOVU_SITE: "tovu-scratch", TOVU_SITE_DIR: dir,
      TOVU_SITE_SELECTION_PINNED: "1", TOVU_SITES_HOME: sitesHome, TOVU_SITE_ROOTS: sitesHome,
      TOVU_DESKTOP_USER_DATA_DIR: path.join(root, "profile"),
      // Explicit undefined entries also mask these inherited overrides when a launcher layers env.
      TOVU_CONTENT_DB: undefined, TOVU_CHAT_DB: undefined, TOVU_DATABASE_JOURNAL_DB: undefined,
    });
    log(`tovu dev: no explicit site selected; using isolated scratch site ${dir}; database to migrate: ${path.join(dir, "content.db")}. Set TOVU_SITE or TOVU_SITE_DIR explicitly to use an existing site.`);
    if (!await prepareScratchSite({ repoRoot, env: selectedEnv }, { initialize, log })) {
      return { dir, dbPath: ":memory:", warning: undefined, running: null, env: { ...selectedEnv, TOVU_DB: "memory" } };
    }
  }
  const selected = devSitesHome({ repoRoot }, { env: selectedEnv, homeDir });
  selectedEnv.TOVU_SITE_DIR = selected.dir;
  if (env.TOVU_SITE_DIR === undefined) selectedEnv.TOVU_SITE_SELECTION_PINNED = "1";
  log(`tovu dev: site ${selected.dir}; database to migrate: ${selected.dbPath}`);
  return { ...selected, env: selectedEnv };
}
