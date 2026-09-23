import { constants as fsConstants, type Dirent } from "node:fs";
import { lstat, open, readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";

import type { DbOpsPort } from "#src/contracts/core/gated-mutations/ports";
import { describeErrorForLog } from "../../contracts/core/model-facing-tool-errors.js";

/**
 * @file What a site backup is made of, read from this machine: which files on disk each scope switch
 * picks up, the database snapshot, the size limits, re-reading a planned file at push time, and the
 * `tovu-backup.json` manifest a future restore reads first. No network here — `github-push.ts` owns
 * GitHub, `tool-registrations.ts` owns the order these run in.
 *
 * The backup folder's layout (paths relative to the folder root):
 * - `tovu-backup.json` — the manifest ({@link buildSiteBackupManifest}).
 * - `database/content.db` — the snapshot ({@link captureDatabaseSnapshot}). NEVER the live
 *   `content.db` file: a plain read of a WAL-mode database can miss committed pages still in
 *   `content.db-wal`. The snapshot comes only from `DbOpsPort.captureRestorePoint` (SQLite's online
 *   backup API), the same consistent copy the gated-mutation restore points use.
 * - `uploads/**` (media), `themes/**` (themes), `agent-plugins/**` and `skills/**` (plugins),
 *   `settings/config.json` and `settings/.site-meta.json` (settings).
 *
 * Deliberately never included, by construction (each scope walks only its own subtree):
 * - `chat.db` and `uploads/chat-attachments/` — chat history, not site content.
 * - `ops/` (the database journal), `out/` (the rendered export, which `source_control_execute_commit`
 *   already pushes), `content.seed.db` and stray `restore-point-*.db` files.
 * - `.mcp.*.json` (MCP server env, can hold tokens) and `.fs-custom-root.json` (a local path).
 * - `agent-plugins/ws/<id>/data/` (plugin OAuth tokens), `staging/` and `packages/superseded-*`.
 * - `.DS_Store` and any `.git` segment.
 * - Symbolic links, never followed: a link to `~/.ssh` inside `themes/` must not ride along. Each
 *   one is reported in `skipped` so the human sees it was left out.
 */

/** One switch in a backup's `include`. */
export type SiteBackupScope = "database" | "media" | "themes" | "plugins" | "settings";

/** Every scope, in the fixed order the manifest and the confirmation dialog list them. */
export const SITE_BACKUP_SCOPES: readonly SiteBackupScope[] = ["database", "media", "themes", "plugins", "settings"];

/** Which scopes a backup includes. */
export type SiteBackupInclude = Record<SiteBackupScope, boolean>;

const MIB = 1024 * 1024;

/** The caps every backup is checked against before anything is uploaded.
 *  - `maxFileBytes`: GitHub's own hard per-file limit (a push with a larger blob is rejected).
 *  - `maxTotalBytes`, `maxFiles`: this tool's bounds, so one call cannot hold an unbounded number of
 *    blob uploads open against the site's own request budget. */
export const SITE_BACKUP_LIMITS = { maxFileBytes: 100 * MIB, maxTotalBytes: 1024 * MIB, maxFiles: 3000 } as const;

export interface SiteBackupLimits {
  readonly maxFileBytes: number;
  readonly maxTotalBytes: number;
  readonly maxFiles: number;
}

/** Where the manifest and the database snapshot live inside the backup folder. */
export const SITE_BACKUP_MANIFEST_PATH = "tovu-backup.json";
export const SITE_BACKUP_DATABASE_PATH = "database/content.db";

/** Where each scope's bytes live on this machine — resolved once by the composition root
 *  (`server/runtime/composition/deps.ts`'s `createSqliteRouteDeps`), so this file never re-derives a
 *  site path itself. */
export interface SiteBackupSources {
  readonly siteDir: string;
  /** `null` when media lives in object storage (`TOVU_MEDIA_BLOB_STORE=s3`): there is no folder on
   *  this machine to back up, and {@link collectSiteBackupFiles} says so instead of backing up
   *  nothing silently. */
  readonly mediaUploadsDir: string | null;
  readonly themesDir: string;
  readonly agentPluginsDir: string;
  readonly skillsDir: string;
  readonly tovuVersion: string;
}

/** One file on disk a backup will upload. `bytes` and `mtimeMs` are what {@link readPlannedFile}
 *  compares against at push time. */
export interface PlannedDiskFile {
  /** Relative to the backup folder, `/`-separated. */
  readonly path: string;
  readonly bytes: number;
  readonly scope: SiteBackupScope;
  readonly absPath: string;
  readonly mtimeMs: number;
}

export interface SkippedSiteBackupFile {
  readonly path: string;
  readonly reason: string;
}

export interface CollectedSiteBackupFiles {
  readonly files: PlannedDiskFile[];
  readonly skipped: SkippedSiteBackupFile[];
  readonly scopeNotes: Partial<Record<SiteBackupScope, string>>;
}

/** Names never backed up wherever they appear. */
const IGNORED_NAMES = new Set([".DS_Store", ".git"]);

const SYMLINK_REASON = "a symbolic link — never followed, so nothing outside the site can ride along";

/** The walk's shared output, appended to in place by every scope. */
interface WalkSink {
  readonly files: PlannedDiskFile[];
  readonly skipped: SkippedSiteBackupFile[];
}

function isMissing(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "ENOENT";
}

/** `readdir` that treats a folder that doesn't exist as empty: a site with no themes folder yet has
 *  nothing to back up there, which is not an error. */
async function readdirOrEmpty(dir: string): Promise<Dirent[]> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (isMissing(err)) return [];
    throw err;
  }
}

/**
 * Adds one regular file to the sink, or records why it was left out. `lstat`, never `stat`: a
 * symlink's own metadata, never its target's.
 *
 * @complexity O(1) — one `lstat`.
 */
async function addFile(sink: WalkSink, input: { absPath: string; relPath: string; scope: SiteBackupScope }): Promise<void> {
  let info;
  try {
    info = await lstat(input.absPath);
  } catch (err) {
    if (isMissing(err)) return;
    throw err;
  }
  if (info.isSymbolicLink()) {
    sink.skipped.push({ path: input.relPath, reason: SYMLINK_REASON });
    return;
  }
  if (!info.isFile()) {
    sink.skipped.push({ path: input.relPath, reason: "not a regular file" });
    return;
  }
  sink.files.push({ path: input.relPath, bytes: info.size, scope: input.scope, absPath: input.absPath, mtimeMs: info.mtimeMs });
}

/**
 * Recursively adds every regular file under `absDir`. Symlinks (to files or folders) are reported
 * and never entered; {@link IGNORED_NAMES} are dropped silently; `excludeTopLevel` names are dropped
 * at the first level only (`uploads/chat-attachments`).
 *
 * @complexity O(entries under `absDir`) filesystem calls; recursion depth is the folder depth.
 */
async function walkTree(sink: WalkSink, input: { absDir: string; relDir: string; scope: SiteBackupScope; excludeTopLevel?: ReadonlySet<string> }): Promise<void> {
  const entries = await readdirOrEmpty(input.absDir);
  for (const entry of entries) {
    if (IGNORED_NAMES.has(entry.name) || input.excludeTopLevel?.has(entry.name)) continue;
    const absPath = path.join(input.absDir, entry.name);
    const relPath = `${input.relDir}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      sink.skipped.push({ path: relPath, reason: SYMLINK_REASON });
    } else if (entry.isDirectory()) {
      await walkTree(sink, { absDir: absPath, relDir: relPath, scope: input.scope });
    } else {
      await addFile(sink, { absPath, relPath, scope: input.scope });
    }
  }
}

/** The files each installed-plugin workspace keeps that a restore needs. Everything else there is
 *  left out on purpose: `data/` holds plugin OAuth tokens, `staging/` is a half-finished install,
 *  and `packages/superseded-*` are replaced versions. */
const PLUGIN_WORKSPACE_FILES = ["activations.json", "bundled-digests.json"] as const;

/**
 * The plugins scope's `agent-plugins/` half: per workspace, {@link PLUGIN_WORKSPACE_FILES} plus the
 * content-addressed `packages/sha256/**` store, and nothing else.
 *
 * @complexity O(entries under each workspace's `packages/sha256`).
 */
async function walkAgentPlugins(sink: WalkSink, agentPluginsDir: string): Promise<void> {
  const wsDir = path.join(agentPluginsDir, "ws");
  for (const entry of await readdirOrEmpty(wsDir)) {
    const relWorkspace = `agent-plugins/ws/${entry.name}`;
    if (entry.isSymbolicLink()) {
      sink.skipped.push({ path: relWorkspace, reason: SYMLINK_REASON });
      continue;
    }
    if (!entry.isDirectory()) continue;
    const absWorkspace = path.join(wsDir, entry.name);
    for (const name of PLUGIN_WORKSPACE_FILES) {
      await addFile(sink, { absPath: path.join(absWorkspace, name), relPath: `${relWorkspace}/${name}`, scope: "plugins" });
    }
    const packagesDir = path.join(absWorkspace, "packages", "sha256");
    const packagesInfo = await lstat(packagesDir).catch((err: unknown) => (isMissing(err) ? null : Promise.reject(err)));
    if (packagesInfo?.isSymbolicLink()) {
      sink.skipped.push({ path: `${relWorkspace}/packages/sha256`, reason: SYMLINK_REASON });
    } else if (packagesInfo?.isDirectory()) {
      await walkTree(sink, { absDir: packagesDir, relDir: `${relWorkspace}/packages/sha256`, scope: "plugins" });
    }
  }
}

/** The one media note a backup can carry, and why: the bytes are not on this machine. */
const MEDIA_IN_OBJECT_STORAGE_NOTE =
  "Media is stored in object storage (TOVU_MEDIA_BLOB_STORE=s3), not in a folder on this server, so media files are not in this backup. The database still lists every media item.";

/**
 * Every file on disk the switched-on scopes pick up. The database scope is never a disk walk — see
 * {@link captureDatabaseSnapshot}.
 *
 * @returns `files` sorted by path, `skipped` (symlinks and non-regular files, each with its reason),
 *   and `scopeNotes` for a scope whose content could not be collected here at all.
 * @throws Only an unexpected filesystem error (a missing folder is treated as empty).
 * @complexity O(entries under every included scope's folder) filesystem calls, plus O(n log n) to sort.
 */
export async function collectSiteBackupFiles(input: { sources: SiteBackupSources; include: SiteBackupInclude }): Promise<CollectedSiteBackupFiles> {
  const { sources, include } = input;
  const sink: WalkSink = { files: [], skipped: [] };
  const scopeNotes: Partial<Record<SiteBackupScope, string>> = {};

  if (include.media) {
    if (sources.mediaUploadsDir === null) scopeNotes.media = MEDIA_IN_OBJECT_STORAGE_NOTE;
    else await walkTree(sink, { absDir: sources.mediaUploadsDir, relDir: "uploads", scope: "media", excludeTopLevel: new Set(["chat-attachments"]) });
  }
  if (include.themes) await walkTree(sink, { absDir: sources.themesDir, relDir: "themes", scope: "themes" });
  if (include.plugins) {
    await walkAgentPlugins(sink, sources.agentPluginsDir);
    await walkTree(sink, { absDir: sources.skillsDir, relDir: "skills", scope: "plugins" });
  }
  if (include.settings) {
    for (const name of ["config.json", ".site-meta.json"]) {
      await addFile(sink, { absPath: path.join(sources.siteDir, name), relPath: `settings/${name}`, scope: "settings" });
    }
  }

  sink.files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files: sink.files, skipped: sink.skipped, scopeNotes };
}

export type DatabaseSnapshotResult = { ok: true; bytes: Buffer; watermarkAtCapture: number } | { ok: false; message: string; logDetail?: string };

/**
 * A consistent copy of the whole site database, held in memory.
 *
 * Only a cheap file snapshot (SQLite) is accepted: that is the only restore mechanism whose artifact
 * is a single file this process can read back. Anything else is refused BEFORE a capture is attempted.
 * The restore-point file `captureRestorePoint` writes beside `content.db` is deleted as soon as it is
 * read, success or not, so a backup never leaves one behind.
 *
 * @returns The snapshot bytes and the watermark stamped at capture, or a caller-safe `message` (a
 *   capture failure's own text stays in `logDetail`, which is for the server log only).
 * @complexity O(database size) — one full copy, one read, one unlink.
 */
export async function captureDatabaseSnapshot(input: { dbOps: DbOpsPort; scopeId: string }): Promise<DatabaseSnapshotResult> {
  const { restorePoint } = await input.dbOps.getCapabilities();
  if (restorePoint.costClass !== "cheap" || restorePoint.kind !== "file-snapshot") {
    return {
      ok: false,
      message: `this site's database cannot be snapshotted into a backup file: only SQLite sites are supported (this database reports a '${restorePoint.kind}' restore mechanism)`,
    };
  }

  let artifactRef: string;
  let watermarkAtCapture: number;
  try {
    ({ artifactRef, watermarkAtCapture } = await input.dbOps.captureRestorePoint({ scopeId: input.scopeId }));
  } catch (err) {
    return { ok: false, message: "the database snapshot failed; nothing was backed up", logDetail: describeErrorForLog(err) };
  }
  try {
    return { ok: true, bytes: await readFile(artifactRef), watermarkAtCapture };
  } catch (err) {
    return { ok: false, message: "the database snapshot could not be read back; nothing was backed up", logDetail: describeErrorForLog(err) };
  } finally {
    await unlink(artifactRef).catch(() => undefined);
  }
}

/** One decimal place, dropped when it is `.0` (`100 MiB`, not `100.0 MiB`). */
function oneDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

/** `123 B`, `4.2 KiB`, `12.5 MiB`, `1 GiB` — for messages and the confirmation dialog. */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MIB) return `${oneDecimal(bytes / 1024)} KiB`;
  if (bytes < 1024 * MIB) return `${oneDecimal(bytes / MIB)} MiB`;
  return `${oneDecimal(bytes / (1024 * MIB))} GiB`;
}

export type SiteBackupLimitsResult = { ok: true; totalBytes: number } | { ok: false; message: string };

/**
 * Checks a backup against {@link SITE_BACKUP_LIMITS} before anything is uploaded. A file over the
 * per-file limit is refused, never truncated or split — and EVERY such file is named, so one retry
 * after removing them is enough.
 *
 * @complexity O(n) in the file count.
 */
export function checkSiteBackupLimits(files: readonly { path: string; bytes: number }[], limits: SiteBackupLimits = SITE_BACKUP_LIMITS): SiteBackupLimitsResult {
  const oversized = files.filter((file) => file.bytes > limits.maxFileBytes);
  if (oversized.length > 0) {
    // The exact byte count too: a file 1 byte over rounds to the limit's own size.
    const named = oversized.map((file) => `${file.path} (${formatByteSize(file.bytes)}, ${file.bytes} bytes)`).join(", ");
    return {
      ok: false,
      message: `${oversized.length} file(s) exceed GitHub's ${formatByteSize(limits.maxFileBytes)} per-file limit and cannot be backed up: ${named}. Nothing is truncated or split; remove or shrink these, or turn off the scope that holds them.`,
    };
  }
  if (files.length > limits.maxFiles) {
    return { ok: false, message: `the backup has ${files.length} files, over the ${limits.maxFiles}-file cap. Turn off a scope (media usually holds the most files) and plan again.` };
  }
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  if (totalBytes > limits.maxTotalBytes) {
    return { ok: false, message: `the backup totals ${formatByteSize(totalBytes)}, over the ${formatByteSize(limits.maxTotalBytes)} cap. Turn off a scope (media usually holds the most bytes) and plan again.` };
  }
  return { ok: true, totalBytes };
}

export type ReadPlannedFileResult = { ok: true; bytes: Buffer } | { ok: false; message: string };

/**
 * Reads a planned file at push time, refusing it if it is no longer the file the human reviewed.
 *
 * Opened with `O_NOFOLLOW` and checked through the SAME handle it is read from, so a file swapped
 * for a symlink after the plan cannot be followed, and the size/mtime compared are the bytes
 * actually read.
 *
 * @complexity O(file size) — one open, one fstat, one read.
 */
export async function readPlannedFile(file: PlannedDiskFile): Promise<ReadPlannedFileResult> {
  const stale: ReadPlannedFileResult = { ok: false, message: `'${file.path}' changed since the plan was made. Call site_backup_plan again.` };
  let handle;
  try {
    handle = await open(file.absPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  } catch {
    return stale;
  }
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size !== file.bytes || info.mtimeMs !== file.mtimeMs) return stale;
    const bytes = await handle.readFile();
    return bytes.length === file.bytes ? { ok: true, bytes } : stale;
  } finally {
    await handle.close();
  }
}

export interface SiteBackupManifestInput {
  readonly createdAt: string;
  readonly tovuVersion: string;
  readonly schema: { readonly index: number; readonly tag: string };
  readonly site: { readonly name: string; readonly folderName: string };
  /** `null` when the database scope is off. */
  readonly database: { readonly watermarkAtCapture: number } | null;
  readonly include: SiteBackupInclude;
  readonly scopeNotes: Partial<Record<SiteBackupScope, string>>;
  readonly files: readonly { readonly path: string; readonly bytes: number; readonly sha256: string }[];
}

/**
 * The backup's `tovu-backup.json`: what produced it (Tovu version, migration schema), when, which
 * scopes it holds and why any is incomplete, and every file with its sha256 — what a future restore
 * checks before touching anything.
 *
 * @complexity O(n) in the file count.
 */
export function buildSiteBackupManifest(input: SiteBackupManifestInput): string {
  const scopes = Object.fromEntries(
    SITE_BACKUP_SCOPES.map((scope) => {
      const note = input.scopeNotes[scope];
      return [scope, { included: input.include[scope], ...(note !== undefined ? { note } : {}) }];
    })
  );
  const manifest = {
    format: "tovu-site-backup",
    formatVersion: 1,
    createdAt: input.createdAt,
    tovu: { version: input.tovuVersion },
    schema: { index: input.schema.index, tag: input.schema.tag },
    site: { name: input.site.name, folderName: input.site.folderName },
    database: input.database === null ? null : { path: SITE_BACKUP_DATABASE_PATH, engine: "sqlite", watermarkAtCapture: input.database.watermarkAtCapture },
    scopes,
    files: input.files.map((file) => ({ path: file.path, bytes: file.bytes, sha256: file.sha256 })),
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
