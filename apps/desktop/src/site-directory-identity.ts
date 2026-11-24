/** Tovu marker policy; Jini continues to own registry uniqueness, locks and atomic writes. */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { copySqliteInto } from "@jini-ai/db/kernel/sqlite";
import { createNodeAtomicFilesystem, readDirectoryIdentity, writeJsonFileAtomic, type AtomicFilesystemPort } from "@jini-ai/platform/fs";
import { commitWithCopiedDatabases, type CopiedDatabaseFilesystem } from "@jini-ai/desktop-host/shell/copied-site-databases";
import { SITE_IDENTITY_MARKER } from "./site-dir-store.ts";
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
  const id = readDirectoryIdentity({ directory: siteDir, ...SITE_IDENTITY_MARKER });
  // Legacy markerless identities belong to the existing admission/boot owner.
  if (id === null) return;
  const workspace = options.workspace ?? createSitesWorkspace({});
  const owner = workspace.registry({}).list({}).find((entry) => entry.id === id);
  if (!owner || !fs.existsSync(owner.path)) return;
  const canonical = fs.realpathSync(siteDir);
  if (fs.realpathSync(owner.path) === canonical) return;

  const marker = path.join(canonical, ".site-meta.json");
  try {
    withFileLock({ filePath: marker, critical: () => replaceCopiedIdentity({ marker, id }, { ...options, workspace }) });
  } catch (error) {
    throw new Error("This copied website could not start because Tovu could not give its folder a separate identity.", { cause: error });
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
 * came with Finder's copy. Tovu owns which databases exist and where they live; `@jini-ai/desktop-host`
 * owns the snapshot, commit and rollback ordering (new app-data DBs kept only when the marker commits,
 * detached links restored on failure so a retry still resolves the source). The original DB is opened read-only.
 * @complexity O(database bytes) plus fixed metadata probes, with SQLite doing the snapshot I/O.
 */
function withCopiedDatabases({ siteDir, id, siteId, workspace, commit }: {
  siteDir: string; id: string; siteId: string; workspace: NonNullable<SiteIdentityOptions['workspace']>; commit: () => void;
}, _options = {}): void {
  const sources = ['content.db', 'chat.db'].map(filename => ({ filename,
    from: workspace.databasePath({ dir: siteDir, id, filename }),
    to: workspace.databasePath({ dir: siteDir, id: siteId, filename, placement: 'appData' }),
  })).filter(row => fs.existsSync(row.from) && !fs.realpathSync(row.from).startsWith(siteDir + path.sep));
  commitWithCopiedDatabases({
    sources,
    pointerPaths: ['data.nosync', 'content.db', 'chat.db', 'data.nosync/content.db', 'data.nosync/chat.db'].map(relative => path.join(siteDir, relative)),
    backupPath: ({ index }) => path.join(siteDir, `.copied-database-${siteId}-${index}`),
    commit,
    filesystem: nodeCopiedDatabaseFilesystem,
    snapshot: snapshotDatabase,
  });
}

const nodeCopiedDatabaseFilesystem: CopiedDatabaseFilesystem = {
  exists: ({ path: target }) => fs.existsSync(target),
  makeDirectory: ({ path: target, recursive }) => { fs.mkdirSync(target, { recursive }); },
  removeTree: ({ path: target }) => { fs.rmSync(target, { recursive: true, force: true }); },
  rename: ({ from, to }) => { fs.renameSync(from, to); },
  unlink: ({ path: target }) => { fs.unlinkSync(target); },
  isSymbolicLink: ({ path: target }) => fs.lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink() === true,
};

/** Bind the built-in SQLite client to Jini's existing snapshot owner, only when a copy needs it.
 * @throws Open/snapshot errors; always closes the read-only source. @complexity O(database bytes).
 */
function snapshotDatabase({ from, to }: { from: string; to: string }, _options = {}): void {
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
  const source = new DatabaseSync(from, { readOnly: true });
  try { copySqliteInto({ source, targetPath: to }); } finally { source.close(); }
}
