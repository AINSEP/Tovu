/** Tovu's folder/filenames; generic resolution, locking and registry policy belong to Jini. */
import fs from "node:fs";
import { createHash } from "node:crypto";
import type { DirectoryRecord } from "@jini-ai/platform/fs";
import os from "node:os";
import path from "node:path";
import { readCatalogSite } from "./site-config.ts";
import { createNodeDirectoryWorkspace } from "@jini-ai/platform/fs";

export function createSitesWorkspace(_required: Record<string, never>, { homeDir = os.homedir(), env = process.env, cwd = process.cwd(), sourceRoots, catalogRecovery = false, appDataDir, ...directoryOptions }: {
  homeDir?: string; env?: NodeJS.ProcessEnv; cwd?: string; sourceRoots?: readonly string[]; catalogRecovery?: boolean;
  appDataDir?: string;
  platform?: NodeJS.Platform; windowsDocuments?: () => string | undefined; readText?: (file: string) => string | undefined;
} = {}) {
  const workspace = createNodeDirectoryWorkspace({ homeDir, defaultFolder: "Tovu", envName: "TOVU_SITES_HOME",
    settingsFile: path.join(homeDir, ".tovu", "sites-home.json"), registryName: "sites.json", runningName: ".tovu-running.json",
    ...(catalogRecovery ? { registryRecovery: { fixtureIdPattern: /^(?:minted-id|new-site-id)-\d+$/ } } : {}),
    userConfig: { appName: "Tovu", defaultSubfolder: "sites", rootsEnvName: "TOVU_SITE_ROOTS", legacyDefaultFolder: "Tovu Sites",
      legacySettingsFile: path.join(homeDir, ".tovu", "sites-home.json"),
      sourceRoots: sourceRoots ?? (fs.existsSync(path.join(cwd, "apps", "website", "src")) ? [path.join(cwd, "sites")] : []),
    } }, { env, cwd, ...directoryOptions,
      // The inherited override also reaches CLI/MCP callers without an Electron app instance.
      appDataDir: appDataDir ?? (env.TOVU_DESKTOP_USER_DATA_DIR?.trim() ? (directoryOptions.platform === "win32" ? path.win32 : path).resolve(cwd, env.TOVU_DESKTOP_USER_DATA_DIR.trim()) : undefined),
    });
  return { ...workspace, invalidCatalogNotices: new Set<string>() };
}
export type SitesWorkspace = ReturnType<typeof createSitesWorkspace>;


/** Desktop keeps deletion authority/aliases locally; this catalog only owns discoverability.
 * A record for an unavailable volume retains its saved path and metadata.
 * @complexity O(n) metadata reads and O(n * r) catalog work for n directories and r records.
 */
export function shareSiteDirectories(
  { workspace, dirs, createdBy, migration, allowRelocation = false }: { workspace: SitesWorkspace; dirs: readonly string[]; createdBy: string; migration?: string; allowRelocation?: boolean }, { report = console.warn }: { report?: (message: string) => void } = {},
): DirectoryRecord[] {
  const notices = workspace.invalidCatalogNotices;
  try {
    const registry = workspace.registry({});
    if (migration && registry.hasMigration({ migration })) return registry.list({});
    const registered = new Map(registry.list({}).map((entry) => [entry.id, entry]));
    let unavailable = false;
    for (const dir of dirs) {
      try {
        // Probe the folder before tolerant config reading erases ENOENT: an unmounted MRU
        // entry must keep its import pending so the original path is retried after remount.
        const canonical = fs.realpathSync(dir);
        const { name, siteId } = readCatalogSite({ siteDir: canonical });
        const id = siteId !== undefined ? siteId : createHash("sha256").update(canonical).digest("hex");
        const previous = registered.get(id);
        if (previous && previous.path !== canonical) {
          if (fs.existsSync(previous.path)) throw new Error("Copied identity");
          const database = workspace.databasePath({ dir: canonical, id, filename: "content.db" });
          const appDataRoot = path.join(workspace.config({}).appData, "databases") + path.sep;
          // An unplugged app-data site's marker can also be a Finder copy: retain its reservation
          // until the operator explicitly uses Locate (or the stopped-site migration owner).
          if (!allowRelocation && database.startsWith(appDataRoot)) throw new Error("App-data identity needs explicit relocation");
          // The existing marker identity is the relocation proof used by Desktop's Locate/scan owner.
          registry.relocate({ from: previous.path, to: canonical });
        }
        const entry = { id, name, path: canonical, createdBy, lastOpened: null };
        registry.merge({ entries: [entry] }); registered.set(id, entry); notices.delete(dir);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") unavailable = true;
        if (!notices.has(dir)) {
          notices.add(dir);
          report(`tovu desktop: skipped shared catalog entry ${dir}; its metadata, identity or folder is unavailable/invalid.`);
        }
      }
    }
    // Missing-volume MRU entries are retried after remount; do not certify an incomplete import.
    if (migration && !unavailable) registry.merge({ entries: [], migration });
    return registry.list({});
  } catch {
    report("tovu desktop: shared catalog bookkeeping is unavailable; local websites remain usable.");
    return [];
  }
}

/** Attach to an existing local server without acquiring process ownership. Stop only withdraws
 * this observer; it must never signal the other application's process or enter its crash registry.
 * @complexity O(1) per liveness poll.
 */
export function attachRunningSite({ workspace, dir }: { workspace: SitesWorkspace; dir: string }, _options = {}) {
  const running = workspace.running({ path: dir }).read({});
  if (!running) return null;
  if (!["http", "https"].includes(running.scheme) || !Number.isInteger(running.port) || running.port < 0 || running.port > 65535) throw new Error("Invalid running site address. Stop the owning app and repair its lease before attaching.");
  if (!running.port) throw new Error(`Running in ${running.app} (starting). Wait for this site to finish starting.`);
  const origin = `${running.scheme}://localhost:${running.port}`;
  const timers = new Set<ReturnType<typeof setInterval>>();
  return { external: true as const, pid: running.pid, port: running.port, origin, adminUrl: `${origin}/admin/`,
    workspaceId: "", schemaVersion: 0, bootToken: null,
    async stop() { for (const timer of timers) clearInterval(timer); timers.clear(); },
    onExit(listener: (exit: { code: number | null; signal: NodeJS.Signals | null }) => void) {
      const timer = setInterval(() => {
        const current = workspace.running({ path: dir }).read({});
        if (current?.token === running.token) return;
        clearInterval(timer); timers.delete(timer); listener({ code: null, signal: null });
      }, 2000);
      timer.unref(); timers.add(timer);
    },
  };
}

/** Shared discovery/MRU is best-effort after a successful open, never server ownership. */
export function rememberSharedSiteOpen({ workspace, dir }: { workspace: SitesWorkspace; dir: string }, _options = {}): void {
  shareSiteDirectories({ workspace, dirs: [dir], createdBy: "Desktop" });
  try { workspace.registry({}).opened({ path: dir, at: new Date().toISOString() }); }
  catch { console.warn("tovu desktop: could not remember the opened website in the shared catalog."); }
}
