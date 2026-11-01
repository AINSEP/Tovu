/** Tovu marker policy; Jini continues to own registry uniqueness, locks and atomic writes. */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { copySqliteInto } from "@jini-ai/db/kernel/sqlite";
import { createNodeAtomicFilesystem, writeJsonFileAtomic, type AtomicFilesystemPort } from "@jini-ai/platform/fs";
import { readSiteIdentity } from "./project-delete-guard.ts";
import { withFileLock } from "./durable-json-file.ts";
import { createSitesWorkspace, type SitesWorkspace } from "./shared-sites.ts";

export interface SiteIdentityOptions {
  workspace?: Pick<SitesWorkspace, "registry" | "databasePath">;
  filesystem?: AtomicFilesystemPort;
  newIdentity?: () => string;
}

/** Give a Finder copy its own identity and external DB snapshots before admission/start; aliases and moves keep theirs.
 * @param required.siteDir An existing site folder, already admitted by the caller's classifier.
 * @param options Registry/database resolution, atomic filesystem and UUID ports; defaults match Desktop/CLI discovery.
 * @throws A plain sentence if a copy's marker cannot safely be replaced. No original is written.
 * @complexity O(r + m + database bytes) time, O(r + m) JS space for r catalog rows and m marker bytes.
 */
export function ensureIndependentSiteIdentity({ siteDir }: { siteDir: string }, options: SiteIdentityOptions = {}): void {
  const id = readSiteIdentity(siteDir);
  // Legacy markerless identities belong to the existing admission/boot owner.
  if (id === null) return;
  const workspace = options.workspace ?? createSitesWorkspace({});
  const owner = workspace.registry({}).list({}).find((entry) => entry.id === id);
  if (!owner || !fs.existsSync(owner.path)) return;
  const canonical = fs.realpathSync(siteDir);
  if (fs.realpathSync(owner.path) === canonical) return;

  const marker = path.join(canonical, ".site-meta.json");
  try {
    withFileLock(marker, () => replaceCopiedIdentity({ marker, id }, { ...options, workspace }));
  } catch {
    throw new Error("This copied website could not start because Tovu could not give its folder a separate identity.");
  }
}

/** Re-read under the marker lock so concurrent adds cannot assign two identities to one copy.
 * Preserve schema stamps, unknown fields and the source's key identity (including its legacy
 * siteId fallback), as the website's duplicateMeta owner requires for already sealed data.
 * @throws Read/write errors; the caller supplies the user-facing sentence.
 * @complexity O(m) time and space in marker bytes; Jini replaces the marker atomically.
 */
function replaceCopiedIdentity({ marker, id }: { marker: string; id: string },
  { filesystem = createNodeAtomicFilesystem({}), newIdentity = randomUUID, workspace = createSitesWorkspace({}) }: SiteIdentityOptions = {},
): void {
  const meta = JSON.parse(fs.readFileSync(marker, "utf8")) as Record<string, unknown>;
  if (meta.siteId !== id) return;
  const siteId = newIdentity();
  withCopiedDatabases({ siteDir: path.dirname(marker), id, siteId, workspace, commit: () => {
    writeJsonFileAtomic({ filePath: marker, data: { ...meta, siteId, siteKeyId: meta.siteKeyId ?? id }, fs: filesystem }, { refuseSymlink: true });
  } });
}

/** Snapshot externally held content/chat before publishing the copied identity. Local files already
 * came with Finder's copy. Keep the new app-data DBs only when the marker commits; restore detached
 * links on failure so a retry still resolves the source. The original DB is opened read-only.
 * @complexity O(database bytes) plus fixed metadata probes, with SQLite doing the snapshot I/O.
 */
function withCopiedDatabases({ siteDir, id, siteId, workspace, commit }: {
  siteDir: string; id: string; siteId: string; workspace: NonNullable<SiteIdentityOptions['workspace']>; commit: () => void;
}, _options = {}): void {
  const sources = ['content.db', 'chat.db'].map(filename => ({ filename,
    from: workspace.databasePath({ dir: siteDir, id, filename }),
    to: workspace.databasePath({ dir: siteDir, id: siteId, filename, placement: 'appData' }),
  })).filter(row => fs.existsSync(row.from) && !fs.realpathSync(row.from).startsWith(siteDir + path.sep));
  if (sources.length === 0) { commit(); return; }
  const targetDir = path.dirname(sources[0]!.to);
  if (fs.existsSync(targetDir)) throw new Error('Copied database target already exists.');
  const links: { from: string; backup: string }[] = [];
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.mkdirSync(targetDir); // Exclusive creation: rollback must never erase someone else's folder.
  try {
    for (const row of sources) snapshotDatabase({ from: row.from, to: row.to });
    detachDatabaseLinks({ siteDir, siteId, links });
    commit();
  } catch (error) {
    for (const link of links.reverse()) fs.renameSync(link.backup, link.from);
    fs.rmSync(targetDir, { recursive: true, force: true });
    throw error;
  }
  for (const link of links) fs.unlinkSync(link.backup);
}

/** Bind the built-in SQLite client to Jini's existing snapshot owner, only when a copy needs it.
 * @throws Open/snapshot errors; always closes the read-only source. @complexity O(database bytes).
 */
function snapshotDatabase({ from, to }: { from: string; to: string }, _options = {}): void {
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
  const source = new DatabaseSync(from, { readOnly: true });
  try { copySqliteInto({ source, targetPath: to }); } finally { source.close(); }
}

/** Remove copied pointers to the original DB after snapshotting, never their targets. A linked
 * data.nosync directory is detached before probing its children, preserving the source directory.
 * @complexity O(1), five known site-layout paths. Renames remain reversible until marker commit.
 */
function detachDatabaseLinks({ siteDir, siteId, links }: {
  siteDir: string; siteId: string; links: { from: string; backup: string }[];
}, _options = {}): void {
  for (const relative of ['data.nosync', 'content.db', 'chat.db', 'data.nosync/content.db', 'data.nosync/chat.db']) {
    const from = path.join(siteDir, relative);
    if (!fs.lstatSync(from, { throwIfNoEntry: false })?.isSymbolicLink()) continue;
    const backup = path.join(siteDir, `.copied-database-${siteId}-${links.length}`);
    fs.renameSync(from, backup);
    links.push({ from, backup });
  }
}
