/** Tovu's folder/filenames; generic resolution, locking and registry policy belong to Jini. */
import fs from "node:fs";
import { createHash } from "node:crypto";
import type { DirectoryRecord } from "@jini-ai/platform/fs";
import os from "node:os";
import path from "node:path";
import { readCatalogSite } from "./site-config.ts";
import { createDurableJsonFile, createNodeDirectoryWorkspace, createNodeDurableJsonPorts, type DurableJsonPorts } from "@jini-ai/platform/fs";

export function createSitesWorkspace(_required: Record<string, never>, { homeDir = os.homedir(), env = process.env, cwd = process.cwd(), sourceRoots, catalogRecovery = false, appDataDir, ...directoryOptions }: {
  homeDir?: string; env?: NodeJS.ProcessEnv; cwd?: string; sourceRoots?: readonly string[]; catalogRecovery?: boolean;
  appDataDir?: string;
  ports?: import("@jini-ai/platform/fs").DurableJsonPorts;
  canonicalPath?: (required: { path: string }) => string;
  platform?: NodeJS.Platform; windowsDocuments?: () => string | undefined; readText?: (file: string) => string | undefined;
} = {}) {
  const workspace = createNodeDirectoryWorkspace({ homeDir, defaultFolder: "Tovu", envName: "TOVU_SITES_HOME",
    settingsFile: path.join(homeDir, ".tovu", "sites-home.json"), registryName: "sites.json", runningName: ".tovu-running.json",
    ...(catalogRecovery ? { registryRecovery: { fixtureIdPattern: /^(?:minted-id|new-site-id)-\d+$/ } } : {}),
    userConfig: { appName: "Tovu", rootsEnvName: "TOVU_SITE_ROOTS", legacyDefaultFolder: "Tovu Sites",
      legacySettingsFile: path.join(homeDir, ".tovu", "sites-home.json"),
      sourceRoots: desktopSourceRoots({ cwd, sourceRoots }),
    } }, { env, cwd, ...directoryOptions,
      appDataDir: desktopAppDataDir({ appDataDir, env, cwd, platform: directoryOptions.platform }),
    });
  return { ...workspace, ...nestedSitesCompat({ workspace }, { ports: directoryOptions.ports }), invalidCatalogNotices: new Set<string>() };
}
export type SitesWorkspace = ReturnType<typeof createSitesWorkspace>;

/** Select Tovu checkout discovery roots only when the caller supplied no roots. O(1) disk probe. */
export function desktopSourceRoots(
  { cwd, sourceRoots }: { cwd: string; sourceRoots?: readonly string[] }, _options = {},
): readonly string[] {
  return sourceRoots ?? (fs.existsSync(path.join(cwd, "apps", "website", "src")) ? [path.join(cwd, "sites")] : []);
}

/** Resolve Tovu's inherited profile override before the Jini directory resolver. O(n) path bytes. */
export function desktopAppDataDir(
  { appDataDir, env, cwd, platform }: { appDataDir?: string; env: NodeJS.ProcessEnv; cwd: string; platform?: NodeJS.Platform }, _options = {},
): string | undefined {
  // The inherited override also reaches CLI/MCP callers without an Electron app instance.
  return appDataDir ?? (env.TOVU_DESKTOP_USER_DATA_DIR?.trim() ? (platform === "win32" ? path.win32 : path).resolve(cwd, env.TOVU_DESKTOP_USER_DATA_DIR.trim()) : undefined);
}

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

/** The sites settings file bound to Tovu's own notices; `nestedRoot` only reads it, but a lock taken
 * on it through this handle times out with Tovu wording rather than the platform default.
 * @complexity O(1).
 */
export function sitesSettingsFile({ filePath }: { filePath: string }, { ports = createNodeDurableJsonPorts({}) }: { ports?: DurableJsonPorts } = {}) {
  return createDurableJsonFile({ ...ports, filePath,
    notices: { prefix: "Tovu sites", lockTimeout: () => "Tovu sites settings are locked." },
  });
}

function nestedRoot({ workspace }: { workspace: ReturnType<typeof createNodeDirectoryWorkspace> }, { ports }: { ports: DurableJsonPorts }): string | undefined {
  const config = workspace.config({});
  if (config.overrides.sitesHome) return undefined;
  const saved = sitesSettingsFile({ filePath: config.configPath }, { ports }).read({});
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


type SitesRegistry = ReturnType<SitesWorkspace["registry"]>;

/** Merge one folder into the catalog under its marker identity, relocating a moved record.
 * Throws (ENOENT for an unmounted folder) when the entry must be skipped.
 * @complexity O(1) catalog work plus one metadata read.
 */
function shareOneDirectory(
  { workspace, registry, registered, dir, createdBy, allowRelocation }: { workspace: SitesWorkspace; registry: SitesRegistry; registered: Map<string, DirectoryRecord>; dir: string; createdBy: string; allowRelocation: boolean }, _options = {},
): void {
  // Probe the folder before tolerant config reading erases ENOENT: an unmounted MRU
  // entry must keep its import pending so the original path is retried after remount.
  const canonical = fs.realpathSync(dir);
  const { name, siteId } = readCatalogSite({ siteDir: canonical });
  const id = siteId !== undefined ? siteId : createHash("sha256").update(canonical).digest("hex");
  const previous = registered.get(id);
  if (previous && previous.path !== canonical) relocateRecord({ workspace, registry, from: previous.path, to: canonical, id, allowRelocation });
  const entry = { id, name, path: canonical, createdBy, lastOpened: null };
  registry.merge({ entries: [entry] }); registered.set(id, entry);
}

/** Move a catalog record whose marker identity now lives at `to`, unless that is a copy.
 * @complexity O(1).
 */
function relocateRecord(
  { workspace, registry, from, to, id, allowRelocation }: { workspace: SitesWorkspace; registry: SitesRegistry; from: string; to: string; id: string; allowRelocation: boolean }, _options = {},
): void {
  if (fs.existsSync(from)) throw new Error("Copied identity");
  const database = workspace.databasePath({ dir: to, id, filename: "content.db" });
  const appDataRoot = path.join(workspace.config({}).appData, "databases") + path.sep;
  // An unplugged app-data site's marker can also be a Finder copy: retain its reservation
  // until the operator explicitly uses Locate (or the stopped-site migration owner).
  if (!allowRelocation && database.startsWith(appDataRoot)) throw new Error("App-data identity needs explicit relocation");
  // The existing marker identity is the relocation proof used by Desktop's Locate/scan owner.
  registry.relocate({ from, to });
}

/** Report a skipped catalog entry once per folder, not on every poll. @complexity O(1). */
function noticeSkippedEntry({ notices, dir, report }: { notices: Set<string>; dir: string; report: (message: string) => void }, _options = {}): void {
  if (notices.has(dir)) return;
  notices.add(dir);
  report(`tovu desktop: skipped shared catalog entry ${dir}; its metadata, identity or folder is unavailable/invalid.`);
}

/** Share available Tovu folders independently; report whether a missing volume needs retry.
 * @returns True if any folder failed with ENOENT, even when later siblings succeed.
 * @complexity O(n) metadata reads and O(n * r) registry work for n folders and r records.
 */
export function shareAvailableDirectories(
  { workspace, registry, registered, dirs, createdBy, allowRelocation, notices, report }: {
    workspace: SitesWorkspace; registry: SitesRegistry; registered: Map<string, DirectoryRecord>; dirs: readonly string[];
    createdBy: string; allowRelocation: boolean; notices: Set<string>; report: (message: string) => void;
  }, _options = {},
): boolean {
  let unavailable = false;
  for (const dir of dirs) {
    try {
      shareOneDirectory({ workspace, registry, registered, dir, createdBy, allowRelocation });
      notices.delete(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") unavailable = true;
      noticeSkippedEntry({ notices, dir, report });
    }
  }
  return unavailable;
}

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
    const unavailable = shareAvailableDirectories({ workspace, registry, registered, dirs, createdBy, allowRelocation, notices, report });
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
