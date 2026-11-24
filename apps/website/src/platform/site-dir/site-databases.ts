import fs from "node:fs";
import path from "node:path";
import { resolveSiteRoot } from "./site-root.js";
import { createHash } from "node:crypto";
import { createSitesWorkspace, type SitesWorkspace } from "./sites-home.js";

/** Resolve both legacy and configured DB layouts without opening or relocating a database.
 * A markerless dev folder uses a path identity for in-site DBs until bootstrap writes metadata.
 * App-data folders are not self-contained: transfer their databases too, and give copies new IDs.
 * @throws Unreadable metadata, ambiguous DB copies, or invalid stable identity.
 * Boot-time app-data resolution reserves its catalog identity; move planning disables that write.
 * @complexity O(n) catalog records for app-data, O(1) metadata and fixed DB existence probes.
 */
export function resolveSiteDatabasePaths(
  { dir, siteId }: { dir: string; siteId?: string },
  { workspace = createSitesWorkspace({}), placement, reserveIdentity = true }: { workspace?: SitesWorkspace; placement?: "inSite" | "appData"; reserveIdentity?: boolean } = {},
): { contentDbPath: string; chatDbPath: string; siteId: string } {
  const identity = readDatabaseIdentity({ dir });
  const id = siteId ?? identity.id;
  if (identity.kind && identity.kind !== "sqlite") return { siteId: id, contentDbPath: path.join(dir, "content.db"), chatDbPath: path.join(dir, "chat.db") };
  const contentDbPath = workspace.databasePath({ dir, id, filename: "content.db", placement });
  const chatDbPath = workspace.databasePath({ dir, id, filename: "chat.db", placement });
  const appDataRoot = path.join(workspace.config({}).appData, "databases") + path.sep;
  if (contentDbPath.startsWith(appDataRoot) || chatDbPath.startsWith(appDataRoot)) admitAppDataIdentity({ dir, id, stable: identity.stable, placement, siteId }, { workspace, reserveIdentity });
  return { siteId: id, contentDbPath, chatDbPath };
}

/** App-data databases need a stable identity; boot-time resolution (no explicit placement) also
 * proves this folder owns it. @throws Without a stable identity, or when another folder owns it.
 */
function admitAppDataIdentity(
  { dir, id, stable, placement, siteId }: { dir: string; id: string; stable?: boolean; placement?: "inSite" | "appData"; siteId?: string },
  { workspace, reserveIdentity }: { workspace: SitesWorkspace; reserveIdentity: boolean },
): void {
  // initSite supplies a fresh ID while keeping metadata as its LAST commit marker.
  if (!stable && !(placement && siteId)) throw new Error("App-data databases require .site-meta.json with a stable siteId. Initialize this folder before starting it.");
  if (!placement) admitAppDataOwner({ dir, id }, { workspace, reserveIdentity });
}

/** App-data databases are keyed by siteId, so a Finder copy of a folder must not open the
 * original's databases. Refuse an identity another folder owns; otherwise reserve it.
 * @throws When the catalog records the identity for a different folder.
 * @complexity O(n) catalog records.
 */
function admitAppDataOwner({ dir, id }: { dir: string; id: string }, { workspace, reserveIdentity }: { workspace: SitesWorkspace; reserveIdentity: boolean }): void {
  const canonical = fs.realpathSync(dir);
  const owner = workspace.registry({}).list({}).find((entry) => entry.id === id);
  if (owner && owner.path !== canonical) throw new Error(`This app-data database belongs to ${owner.path}. A copied folder must get a new siteId and its own database before starting.`);
  // Reserve the identity before opening either DB; simultaneous Finder copies serialize on
  // the shared catalog's existing lock instead of acquiring independent path-keyed leases.
  if (reserveIdentity && !owner) workspace.registry({}).merge({ entries: [{ id, path: canonical, name: path.basename(dir), createdBy: "database-owner", lastOpened: null }] });
}
function readDatabaseIdentity({ dir }: { dir: string }): { id: string; kind?: string; stable?: boolean } {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, ".site-meta.json"), "utf8")) as { siteId?: string; siteKeyId?: string; storage?: { kind?: string } };
    const id = meta.siteId ?? meta.siteKeyId;
    if ((meta.siteId || meta.siteKeyId) && id !== undefined) return { id, kind: meta.storage?.kind, stable: true };
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  // Keep the keyless fallback identical to devDatabasePath in development/scripts/dev-sites-home.mjs;
  // these two startup entry points must open the same database. Extract together if a third consumer appears.
  return { id: createHash("sha256").update(path.resolve(dir)).digest("hex") };
}

/** DB placement no longer establishes the site root. Retain the historical explicit DB anchor
 * for arbitrary callers; app-data uses the registry identity, then the boot-pinned selection.
 * @complexity O(n) registry records only for app-data paths; otherwise O(1).
 */
export function resolveSiteDirForDatabase(
  { dbPath, siteDir }: { dbPath: string; siteDir?: string },
  { workspace = createSitesWorkspace({}) }: { workspace?: SitesWorkspace } = {},
): string {
  if (siteDir) return siteDir;
  const parent = path.dirname(dbPath);
  if (path.basename(parent) === "data.nosync") return path.dirname(parent);
  const databasesRoot = path.join(workspace.config({}).appData, "databases");
  if (path.dirname(parent) === databasesRoot) {
    const id = path.basename(parent);
    return workspace.registry({}).list({}).find((row) => row.id === id)?.path ?? resolveSiteRoot();
  }
  return parent;
}

/** The filesystem calls {@link classifySiteDatabaseDir} and its deleting callers use; injectable for tests. */
export type SiteDatabaseDirFs = Pick<typeof fs, "lstatSync" | "rmSync">;

/** Where one of a site's database files lives, as far as deleting that site is concerned. */
export type SiteDatabaseDir =
  | { kind: "inSite" }
  | { kind: "absent" }
  | { kind: "appData"; dir: string }
  | { kind: "unsafe"; dir: string };

/**
 * Classify a site's database path before a delete so the caller removes at most the site's own
 * `<appData>/databases/<siteId>/` folder. Inside the site folder → `inSite` (the folder delete covers it).
 * Anything that is not exactly one real, non-symlinked direct child of `<appData>/databases/` →
 * `unsafe`: that covers a `..` siteId, the shared `databases/` parent itself, deeper nesting and
 * any other folder. A missing per-site folder → `absent`.
 * @complexity O(1) path math plus one lstat.
 */
export function classifySiteDatabaseDir(
  { siteDir, dbPath, appData }: { siteDir: string; dbPath: string; appData: string },
  { fs: io = fs }: { fs?: SiteDatabaseDirFs } = {},
): SiteDatabaseDir {
  const resolved = path.resolve(dbPath);
  if (resolved.startsWith(path.resolve(siteDir) + path.sep)) return { kind: "inSite" };
  // path.resolve has already folded any `..`, so a direct-child test is the whole containment rule.
  const dir = path.dirname(resolved);
  if (path.dirname(dir) !== path.resolve(appData, "databases")) return { kind: "unsafe", dir };
  const stat = io.lstatSync(dir, { throwIfNoEntry: false });
  if (!stat) return { kind: "absent" };
  // A symlink would make the recursive remove act on whatever it points at.
  if (stat.isSymbolicLink() || !stat.isDirectory()) return { kind: "unsafe", dir };
  return { kind: "appData", dir };
}
