import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createSitesWorkspace } from "./sites-home.js";
import type { ResolveSiteRootOptional } from "./site-root.js";
import { listSites } from "./site-registry.js";
import { readSiteDir } from "./read-site-dir.js";
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
  if (fs.realpathSync(dir) !== dir || !fs.lstatSync(dir).isDirectory()) throw new LocalSiteError("SITE_PATH_UNSAFE");
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
  if (fs.realpathSync(root) !== root) throw new LocalSiteError("SITE_PATH_UNSAFE");
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
    if (lstatIfPresent({ file: path.join(parent, name) })?.isSymbolicLink()) throw new LocalSiteError("SITE_PATH_UNSAFE");
  }
  const site = list({ ...optional, cwd: base }).find((entry) => entry.name === name);
  if (!site) throw new LocalSiteError("SITE_NOT_FOUND");
  // Starting an adopted external folder is allowed. Moving it is a separate operator decision;
  // web Trash therefore only manages direct children of the home or the legacy checkout root.
  if (!managedParents.includes(path.dirname(site.dir))) throw new LocalSiteError("SITE_PATH_UNSAFE");
  assertRealDirectory({ dir: site.dir });
  return site.dir;
}

/** Validate the opaque Trash identifier before deriving a mutation lock's name. */
export function siteTrashName({ id }: { id: string }): string {
  const match = TRASH_ID.exec(id);
  if (!match?.[1]) throw new LocalSiteError("VALIDATION_ERROR");
  return match[1];
}

/** The folder of Trash entry `id` inside an already-checked Trash `root`. @complexity O(1) filesystem checks. */
function trashDir({ root, id }: { root: string; id: string }): string {
  const dir = path.join(root, id);
  if (!fs.existsSync(dir)) throw new LocalSiteError("SITE_NOT_FOUND");
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

/** Restore never overwrites another site's data. @complexity O(1). */
export function restoreSite({ base, id }: { base: string; id: string }, optional: SiteTrashOptions = {}): void {
  const { dir, name } = trashEntry({ base, id }, optional);
  readSiteDir({ dir });
  const target = path.join(restoreRoot({ base }, optional), name);
  // lstat catches a dangling symlink too; existsSync alone would allow rename over it.
  if (lstatIfPresent({ file: target })) throw new LocalSiteError("SITE_ALREADY_EXISTS");
  fs.renameSync(dir, target);
  const { config, meta } = readSiteDir({ dir: target });
  sitesWorkspace({ base }, optional).registry({}).merge({ entries: [{ id: meta.siteId, name: config.name, path: target, createdBy: "restored", lastOpened: null }] });
}

/** Only the Trash route calls permanent removal, after checkbox + confirm. @complexity O(bytes). */
export function permanentlyDeleteTrashedSite(
  { base, id, checked, confirmed }: { base: string; id: string; checked: boolean; confirmed: boolean }, optional: SiteTrashOptions = {},
): void {
  if (!checked || !confirmed) throw new LocalSiteError("SITE_CONFIRM_REQUIRED");
  const { dir } = trashEntry({ base, id }, optional);
  readSiteDir({ dir });
  fs.rmSync(dir, { recursive: true });
}
