/** Recoverable site-folder Trash. No schema changes; rename preserves the entire site and its keys.
 * Folder identity/containment uses real paths; symlinked roots or entries are never managed.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createSitesWorkspace } from "./sites-home.js";
import type { ResolveSiteRootOptional } from "./site-root.js";
import { listSites } from "./site-registry.js";
import { readSiteDir } from "./read-site-dir.js";
import { assertLocalSiteName, LocalSiteError } from "./local-site-supervisor.js";
export interface TrashedSite { id: string; name: string; displayName: string }
type SiteTrashOptions = Pick<ResolveSiteRootOptional, "env" | "homeDir">;
const TRASH_ID = /^([a-z0-9-]{1,100})--([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

function containedRoot(base: string, folder: string, create: boolean, optional: SiteTrashOptions = {}) {
  const workspace = createSitesWorkspace({}, { ...optional, cwd: base });
  const home = workspace.home({});
  if (create && folder === "sites") fs.mkdirSync(home, { recursive: true });
  // Trash keeps its existing repo-owned lifecycle and recovery location; this job changes only
  // creation/restore destinations and discoverability, not the desktop/Web lifecycle seam.
  const root = folder === "sites" ? fs.realpathSync(home) : path.join(fs.realpathSync(base), folder);
  if (create) fs.mkdirSync(root, { recursive: true });
  if (fs.realpathSync(root) !== root) throw new LocalSiteError("SITE_PATH_UNSAFE");
  return root;
}

/** The registry and Trash share the same name/path rule. @complexity O(1) filesystem checks. */
export function assertManagedSiteDirectory({ base, name }: { base: string; name: string }, optional: SiteTrashOptions = {}): string {
  assertLocalSiteName({ name });
  const home = createSitesWorkspace({}, { ...optional, cwd: base }).home({});
  for (const root of [home, path.resolve(base, "sites")]) {
    try { if (fs.lstatSync(path.join(root, name)).isSymbolicLink()) throw new LocalSiteError("SITE_PATH_UNSAFE"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  const site = listSites({ ...optional, cwd: base }).find((entry) => entry.name === name);
  if (!site) throw new LocalSiteError("SITE_NOT_FOUND");
  const dir = site.dir;
  // Starting an adopted external folder is allowed. Moving it is a separate operator decision;
  // web Trash therefore only manages direct children of the home or the legacy checkout root.
  if (![home, path.resolve(base, "sites")].includes(path.dirname(dir))) throw new LocalSiteError("SITE_PATH_UNSAFE");
  if (fs.realpathSync(dir) !== dir || !fs.lstatSync(dir).isDirectory()) throw new LocalSiteError("SITE_PATH_UNSAFE");
  return dir;
}

/** Validate the opaque Trash identifier before deriving a mutation lock's name. */
export function siteTrashName({ id }: { id: string }, _optional = {}): string {
  const match = TRASH_ID.exec(id);
  if (!match) throw new LocalSiteError("VALIDATION_ERROR");
  return match[1];
}

function trashEntry(base: string, id: string, optional: SiteTrashOptions = {}) {
  const match = TRASH_ID.exec(id);
  if (!match) throw new LocalSiteError("VALIDATION_ERROR");
  const root = containedRoot(base, "site-trash", true, optional);
  const dir = path.join(root, id);
  if (!fs.existsSync(dir)) throw new LocalSiteError("SITE_NOT_FOUND");
  if (fs.realpathSync(dir) !== dir || !fs.lstatSync(dir).isDirectory()) throw new LocalSiteError("SITE_PATH_UNSAFE");
  return { dir, name: match[1] };
}

/** A Trash list exposes only validated site folders. @complexity O(n) in Trash entries. */
export function listSiteTrash({ base }: { base: string }, optional: SiteTrashOptions = {}): TrashedSite[] {
  if (!fs.existsSync(path.join(base, "site-trash"))) return [];
  const root = containedRoot(base, "site-trash", false, optional);
  const rows: TrashedSite[] = [];
  for (const id of fs.readdirSync(root)) {
    if (!TRASH_ID.test(id)) continue;
    try {
      const { dir, name } = trashEntry(base, id, optional);
      rows.push({ id, name, displayName: readSiteDir({ dir }).config.name });
    } catch { /* A malformed or externally edited Trash entry is never offered for deletion. */ }
  }
  return rows;
}

/** Caller holds the supervisor's stopped-site lane. @complexity O(1), atomic same-filesystem move. */
export function trashSite({ base, name }: { base: string; name: string }, optional: SiteTrashOptions = {}): TrashedSite {
  const dir = assertManagedSiteDirectory({ base, name }, optional);
  const { config } = readSiteDir({ dir });
  const root = containedRoot(base, "site-trash", true, optional);
  const id = `${name}--${randomUUID()}`;
  fs.renameSync(dir, path.join(root, id));
  createSitesWorkspace({}, { ...optional, cwd: base }).registry({}).remove({ path: dir });
  return { id, name, displayName: config.name };
}

/** Restore never overwrites another site's data. @complexity O(1). */
export function restoreSite({ base, id }: { base: string; id: string }, optional: SiteTrashOptions = {}): void {
  const { dir, name } = trashEntry(base, id, optional);
  readSiteDir({ dir });
  const root = containedRoot(base, "sites", true, optional);
  const target = path.join(root, name);
  // lstat catches a dangling symlink too; existsSync alone would allow rename over it.
  try { fs.lstatSync(target); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      fs.renameSync(dir, target);
      const { config, meta } = readSiteDir({ dir: target });
      createSitesWorkspace({}, { ...optional, cwd: base }).registry({}).merge({ entries: [{ id: meta.siteId, name: config.name, path: target, createdBy: "restored", lastOpened: null }] });
      return;
    }
    throw error;
  }
  throw new LocalSiteError("SITE_ALREADY_EXISTS");
}

/** Only the Trash route calls permanent removal, after checkbox + confirm. @complexity O(bytes). */
export function permanentlyDeleteTrashedSite(
  { base, id, checked, confirmed }: { base: string; id: string; checked: boolean; confirmed: boolean }, optional: SiteTrashOptions = {},
): void {
  if (!checked || !confirmed) throw new LocalSiteError("SITE_CONFIRM_REQUIRED");
  const { dir } = trashEntry(base, id, optional);
  readSiteDir({ dir });
  fs.rmSync(dir, { recursive: true });
}
