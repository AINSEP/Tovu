/** Recoverable site-folder Trash. No schema changes; rename preserves the entire site and its keys.
 * Folder identity/containment uses real paths; symlinked roots or entries are never managed.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readSiteDir } from "./read-site-dir.js";
import { assertLocalSiteName, LocalSiteError } from "./local-site-supervisor.js";
export interface TrashedSite { id: string; name: string; displayName: string }
const TRASH_ID = /^([a-z0-9-]{1,100})--([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

function containedRoot(base: string, folder: string, create: boolean) {
  const canonicalBase = fs.realpathSync(base);
  const root = path.join(canonicalBase, folder);
  if (create) fs.mkdirSync(root, { recursive: true });
  if (fs.realpathSync(root) !== root) throw new LocalSiteError("SITE_PATH_UNSAFE");
  return root;
}

/** The registry and Trash share the same name/path rule. @complexity O(1) filesystem checks. */
export function assertManagedSiteDirectory({ base, name }: { base: string; name: string }, _optional = {}): string {
  assertLocalSiteName({ name });
  const root = containedRoot(base, "sites", false);
  const dir = path.join(root, name);
  if (!fs.existsSync(dir)) throw new LocalSiteError("SITE_NOT_FOUND");
  if (fs.realpathSync(dir) !== dir || !fs.lstatSync(dir).isDirectory()) throw new LocalSiteError("SITE_PATH_UNSAFE");
  return dir;
}

/** Validate the opaque Trash identifier before deriving a mutation lock's name. */
export function siteTrashName({ id }: { id: string }, _optional = {}): string {
  const match = TRASH_ID.exec(id);
  if (!match) throw new LocalSiteError("VALIDATION_ERROR");
  return match[1];
}

function trashEntry(base: string, id: string) {
  const match = TRASH_ID.exec(id);
  if (!match) throw new LocalSiteError("VALIDATION_ERROR");
  const root = containedRoot(base, "site-trash", true);
  const dir = path.join(root, id);
  if (!fs.existsSync(dir)) throw new LocalSiteError("SITE_NOT_FOUND");
  if (fs.realpathSync(dir) !== dir || !fs.lstatSync(dir).isDirectory()) throw new LocalSiteError("SITE_PATH_UNSAFE");
  return { dir, name: match[1] };
}

/** A Trash list exposes only validated site folders. @complexity O(n) in Trash entries. */
export function listSiteTrash({ base }: { base: string }, _optional = {}): TrashedSite[] {
  if (!fs.existsSync(path.join(base, "site-trash"))) return [];
  const root = containedRoot(base, "site-trash", false);
  const rows: TrashedSite[] = [];
  for (const id of fs.readdirSync(root)) {
    if (!TRASH_ID.test(id)) continue;
    try {
      const { dir, name } = trashEntry(base, id);
      rows.push({ id, name, displayName: readSiteDir({ dir }).config.name });
    } catch { /* A malformed or externally edited Trash entry is never offered for deletion. */ }
  }
  return rows;
}

/** Caller holds the supervisor's stopped-site lane. @complexity O(1), atomic same-filesystem move. */
export function trashSite({ base, name }: { base: string; name: string }, _optional = {}): TrashedSite {
  const dir = assertManagedSiteDirectory({ base, name });
  const { config } = readSiteDir({ dir });
  const root = containedRoot(base, "site-trash", true);
  const id = `${name}--${randomUUID()}`;
  fs.renameSync(dir, path.join(root, id));
  return { id, name, displayName: config.name };
}

/** Restore never overwrites another site's data. @complexity O(1). */
export function restoreSite({ base, id }: { base: string; id: string }, _optional = {}): void {
  const { dir, name } = trashEntry(base, id);
  readSiteDir({ dir });
  const root = containedRoot(base, "sites", true);
  const target = path.join(root, name);
  // lstat catches a dangling symlink too; existsSync alone would allow rename over it.
  try { fs.lstatSync(target); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") { fs.renameSync(dir, target); return; }
    throw error;
  }
  throw new LocalSiteError("SITE_ALREADY_EXISTS");
}

/** Only the Trash route calls permanent removal, after checkbox + confirm. @complexity O(bytes). */
export function permanentlyDeleteTrashedSite(
  { base, id, checked, confirmed }: { base: string; id: string; checked: boolean; confirmed: boolean }, _optional = {},
): void {
  if (!checked || !confirmed) throw new LocalSiteError("SITE_CONFIRM_REQUIRED");
  const { dir } = trashEntry(base, id);
  readSiteDir({ dir });
  fs.rmSync(dir, { recursive: true });
}
