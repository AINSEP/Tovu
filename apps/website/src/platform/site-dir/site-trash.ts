import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createSitesWorkspace, type SitesWorkspace } from "./sites-home.js";
import type { ResolveSiteRootOptional } from "./site-root.js";
import { listSites } from "./site-registry.js";
import { readSiteDir } from "./read-site-dir.js";
import {
  classifySiteDatabaseDir, resolveSiteDatabasePaths, withSiteIdentityLock, type SiteDatabaseDirFs, type SiteIdentityLock,
} from "./site-databases.js";
import { assertLocalSiteName, LocalSiteError } from "./local-site-supervisor.js";

/**
 * @file Recoverable site-folder Trash. No schema changes; rename preserves the entire site and its keys.
 * Folder identity/containment uses real paths; symlinked roots or entries are never managed.
 */

export interface TrashedSite { id: string; name: string; displayName: string }
type SiteTrashOptions = Pick<ResolveSiteRootOptional, "env" | "homeDir">;
const TRASH_ID = /^([a-z0-9-]{1,100})--([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** The sites workspace seen from checkout `base`. @complexity O(1) plus the workspace's config read. */
function sitesWorkspace({ base }: { base: string }, optional: SiteTrashOptions = {}) {
  return createSitesWorkspace({}, { ...optional, cwd: base });
}

/** `lstat` that reports a missing entry as `undefined` and rethrows every other error. @complexity O(1). */
function lstatIfPresent({ file }: { file: string }): fs.Stats | undefined {
  try { return fs.lstatSync(file); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** Refuses anything but a real (non-symlinked) directory at `dir`. @complexity O(1) filesystem checks. */
function assertRealDirectory({ dir }: { dir: string }): void {
  if (fs.realpathSync(dir) !== dir || !fs.lstatSync(dir).isDirectory()) throw new LocalSiteError({ code: "SITE_PATH_UNSAFE" });
}

/**
 * The Trash folder, `<real base>/site-trash`, refused when it is a symlink.
 * Trash keeps its existing repo-owned lifecycle and recovery location; this job changes only
 * creation/restore destinations and discoverability, not the desktop/Web lifecycle seam.
 *
 * @param optional.create - Create the folder when missing (every mutation does; listing does not).
 * @complexity O(1) filesystem checks.
 */
function trashRoot({ base }: { base: string }, { create = false, ...optional }: SiteTrashOptions & { create?: boolean } = {}): string {
  // Resolved before any Trash I/O so Trash fails exactly like the sites home does (test-home
  // isolation, an unreadable home setting); the home path itself is not used here.
  sitesWorkspace({ base }, optional).home({});
  const root = path.join(fs.realpathSync(base), "site-trash");
  if (create) fs.mkdirSync(root, { recursive: true });
  if (fs.realpathSync(root) !== root) throw new LocalSiteError({ code: "SITE_PATH_UNSAFE" });
  return root;
}

/** Where restore puts a site: the current sites home, created when missing, as a real path. @complexity O(1). */
function restoreRoot({ base }: { base: string }, optional: SiteTrashOptions = {}): string {
  const home = sitesWorkspace({ base }, optional).home({});
  fs.mkdirSync(home, { recursive: true });
  const root = fs.realpathSync(home);
  assertRealDirectory({ dir: root });
  return root;
}

/** The registry and Trash share the same name/path rule. @complexity O(1) filesystem checks plus one site listing. */
export function assertManagedSiteDirectory(
  { base, name }: { base: string; name: string },
  { listSites: list = listSites, ...optional }: SiteTrashOptions & { listSites?: typeof listSites } = {},
): string {
  assertLocalSiteName({ name });
  const managedParents = [sitesWorkspace({ base }, optional).home({}), path.resolve(base, "sites")];
  for (const parent of managedParents) {
    if (lstatIfPresent({ file: path.join(parent, name) })?.isSymbolicLink()) throw new LocalSiteError({ code: "SITE_PATH_UNSAFE" });
  }
  const site = list({ ...optional, cwd: base }).find((entry) => entry.name === name);
  if (!site) throw new LocalSiteError({ code: "SITE_NOT_FOUND" });
  // Starting an adopted external folder is allowed. Moving it is a separate operator decision;
  // web Trash therefore only manages direct children of the home or the legacy checkout root.
  if (!managedParents.includes(path.dirname(site.dir))) throw new LocalSiteError({ code: "SITE_PATH_UNSAFE" });
  assertRealDirectory({ dir: site.dir });
  return site.dir;
}

/** Validate the opaque Trash identifier before deriving a mutation lock's name. */
export function siteTrashName({ id }: { id: string }, _optional: Record<string, never> = {}): string {
  const match = TRASH_ID.exec(id);
  if (!match?.[1]) throw new LocalSiteError({ code: "VALIDATION_ERROR" });
  return match[1];
}

/** The folder of Trash entry `id` inside an already-checked Trash `root`. @complexity O(1) filesystem checks. */
function trashDir({ root, id }: { root: string; id: string }): string {
  const dir = path.join(root, id);
  if (!fs.existsSync(dir)) throw new LocalSiteError({ code: "SITE_NOT_FOUND" });
  assertRealDirectory({ dir });
  return dir;
}

/** A validated Trash entry for a mutation; the id is checked before the Trash folder is created. */
function trashEntry({ base, id }: { base: string; id: string }, optional: SiteTrashOptions = {}) {
  const name = siteTrashName({ id });
  return { dir: trashDir({ root: trashRoot({ base }, { ...optional, create: true }), id }), name };
}

/** A Trash list exposes only validated site folders. @complexity O(n) in Trash entries. */
export function listSiteTrash({ base }: { base: string }, optional: SiteTrashOptions = {}): TrashedSite[] {
  if (!fs.existsSync(path.join(base, "site-trash"))) return [];
  const root = trashRoot({ base }, optional);
  const rows: TrashedSite[] = [];
  for (const id of fs.readdirSync(root)) {
    const name = TRASH_ID.exec(id)?.[1];
    if (name === undefined) continue;
    try {
      rows.push({ id, name, displayName: readSiteDir({ dir: trashDir({ root, id }) }).config.name });
    } catch { /* A malformed or externally edited Trash entry is never offered for deletion. */ }
  }
  return rows;
}

/** Caller holds the supervisor's stopped-site lane. @complexity O(1), atomic same-filesystem move. */
export function trashSite({ base, name }: { base: string; name: string }, optional: SiteTrashOptions = {}): TrashedSite {
  const dir = assertManagedSiteDirectory({ base, name }, optional);
  const { config } = readSiteDir({ dir });
  const root = trashRoot({ base }, { ...optional, create: true });
  const id = `${name}--${randomUUID()}`;
  fs.renameSync(dir, path.join(root, id));
  sitesWorkspace({ base }, optional).registry({}).remove({ path: dir });
  return { id, name, displayName: config.name };
}

/** Restore never overwrites another site's data. @complexity O(1) plus the identity lock wait. */
export function restoreSite(
  { base, id }: { base: string; id: string },
  { identityLock = withSiteIdentityLock, ...optional }: SiteTrashOptions & { identityLock?: SiteIdentityLock } = {},
): void {
  // Under the identity lock: between the move out of Trash and the catalog merge, neither Trash nor
  // the catalog claims this siteId, so a concurrent permanent delete must not look in that window.
  identityLock({ appData: sitesWorkspace({ base }, optional).config({}).appData, run: () => {
    const { dir, name } = trashEntry({ base, id }, optional);
    readSiteDir({ dir });
    const target = path.join(restoreRoot({ base }, optional), name);
    // lstat catches a dangling symlink too; existsSync alone would allow rename over it.
    if (lstatIfPresent({ file: target })) throw new LocalSiteError({ code: "SITE_ALREADY_EXISTS" });
    fs.renameSync(dir, target);
    const { config, meta } = readSiteDir({ dir: target });
    sitesWorkspace({ base }, optional).registry({}).merge({ entries: [{ id: meta.siteId, name: config.name, path: target, createdBy: "restored", lastOpened: null }] });
  } });
}

/** Injectable seams of a permanent delete: how a trashed folder's database paths resolve, and the fs that removes them. */
type PermanentDeleteOptions = SiteTrashOptions & {
  databasePaths?: (required: { dir: string; workspace: SitesWorkspace }) => { contentDbPath: string; chatDbPath: string };
  databaseFs?: SiteDatabaseDirFs;
  identityLock?: SiteIdentityLock;
};

/** Default resolution: the same lookup boot uses, minus the identity reservation a delete must not write. */
function resolveTrashedDatabasePaths({ dir, workspace }: { dir: string; workspace: SitesWorkspace }) {
  return resolveSiteDatabasePaths({ dir }, { workspace, reserveIdentity: false });
}

/**
 * Whether a Trash entry other than `id` names `siteId` in its metadata. Reads only `.site-meta.json`,
 * not the full site check restore makes: an entry with, say, a broken config.json can be repaired and
 * restored later, and its databases must still be there. Unreadable metadata claims nothing.
 * @complexity O(n) Trash entries.
 */
function otherTrashEntryClaims({ root, id, siteId }: { root: string; id: string; siteId: string }): boolean {
  return fs.readdirSync(root).some((other) => {
    if (other === id || !TRASH_ID.test(other)) return false;
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(trashDir({ root, id: other }), ".site-meta.json"), "utf8")) as { siteId?: unknown; siteKeyId?: unknown };
      return (meta.siteId ?? meta.siteKeyId) === siteId;
    } catch { return false; }
  });
}

/**
 * The `<appData>/databases/<siteId>/` folders a permanent delete must also remove (none for in-folder placement).
 * @throws LocalSiteError SITE_PATH_UNSAFE for any database path outside the site's own app-data folder.
 * @complexity O(n) registry records plus O(1) path checks.
 */
function trashedSiteDatabaseDirs(
  { dir, id, siteId, workspace }: { dir: string; id: string; siteId: string; workspace: SitesWorkspace },
  { databasePaths = resolveTrashedDatabasePaths, databaseFs }: Pick<PermanentDeleteOptions, "databasePaths" | "databaseFs">,
): string[] {
  // App-data DBs are keyed by siteId only. If a live catalog entry claims this id (e.g. a Finder copy
  // that booted after the original went to Trash), the databases are that site's now: keep them.
  if (workspace.registry({}).list({}).some((entry) => entry.id === siteId)) return [];
  // Likewise a second recoverable Trash entry with this id (a trashed copy) would restore without data.
  if (otherTrashEntryClaims({ root: path.dirname(dir), id, siteId })) return [];
  const { contentDbPath, chatDbPath } = databasePaths({ dir, workspace });
  const appData = workspace.config({}).appData;
  const dirs = new Set<string>();
  for (const dbPath of [contentDbPath, chatDbPath]) {
    const where = classifySiteDatabaseDir({ siteDir: dir, siteId, dbPath, appData }, databaseFs ? { fs: databaseFs } : {});
    if (where.kind === "unsafe") throw new LocalSiteError({ code: "SITE_PATH_UNSAFE" });
    if (where.kind === "appData") dirs.add(where.dir);
  }
  return [...dirs];
}

/**
 * Only the Trash route calls permanent removal, after checkbox + confirm. App-data placement keeps the
 * site's databases outside its folder, so their `<appData>/databases/<siteId>/` folder goes too (B229),
 * unless a live site or another Trash entry still claims that siteId.
 * @complexity O(bytes) plus O(n) Trash entries and catalog records, plus the identity lock wait.
 */
export function permanentlyDeleteTrashedSite(
  { base, id, checked, confirmed }: { base: string; id: string; checked: boolean; confirmed: boolean },
  { databasePaths, databaseFs, identityLock = withSiteIdentityLock, ...optional }: PermanentDeleteOptions = {},
): void {
  if (!checked || !confirmed) throw new LocalSiteError({ code: "SITE_CONFIRM_REQUIRED" });
  const workspace = sitesWorkspace({ base }, optional);
  // The ownership check and the removal hold the identity lock that restore and boot-time identity
  // reservation also take, so no claim can appear between "nobody else owns these" and the delete.
  identityLock({ appData: workspace.config({}).appData, run: () => {
    const { dir } = trashEntry({ base, id }, optional);
    const { meta } = readSiteDir({ dir });
    // Resolved and checked before anything is removed, so a refusal deletes nothing.
    const databaseDirs = trashedSiteDatabaseDirs({ dir, id, siteId: meta.siteId, workspace }, { databasePaths, databaseFs });
    // Folder first: if the database removal then fails, orphaned databases stay on disk rather than
    // a still-restorable Trash entry losing its data.
    fs.rmSync(dir, { recursive: true });
    for (const target of databaseDirs) (databaseFs ?? fs).rmSync(target, { recursive: true, force: true });
  } });
}
