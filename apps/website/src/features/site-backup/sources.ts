import { excludedSharePath, validateSharePath } from "./share-file-policy.js";
import { checkShareLimits, SiteShareRefusal } from "./share-policy.js";
import { constants as fsConstants, type BigIntStats, type Dirent, type Stats } from "node:fs";
import { lstat, open, readdir, readFile, realpath, stat, unlink } from "node:fs/promises";
import path from "node:path";

import type { DbOpsPort } from "#src/contracts/core/gated-mutations/ports";
import { describeErrorForLog } from "@jini-ai/core/model-facing-tool-errors";
import type { AgentPluginLayout } from "../agent-plugins/layout.js";

/**
 * @file What a site backup is made of, read from this machine: which files on disk each scope switch
 * picks up, the database snapshot, the size limits, re-reading a planned file at push time, and the
 * `tovu-backup.json` manifest a future restore reads first. No network here — the git-host plugin provider (`source-control/provider-module.ts`) owns
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
 * - `agent-plugins/ws/<id>/<plugin>/data/` and the legacy `agent-plugins/ws/<id>/data/` (plugin OAuth
 *   tokens), `staging/` and `packages/superseded-*`.
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

/** This tool's own caps, checked before anything is uploaded, so one call cannot hold an unbounded
 *  number of blob uploads open against the site's own request budget. The host's per-file limit is
 *  not here: the host's plugin declares it ({@link SiteBackupHostLimit}). */
export const SITE_BACKUP_LIMITS = { maxTotalBytes: 1024 * MIB, maxFiles: 3000 } as const;

/** The repository host a backup goes to, as its plugin declares it (`SourceControlHostFacts`): its
 *  name, and the largest single file it accepts in a push (a push with a larger blob is rejected). */
export interface SiteBackupHostLimit {
  readonly label: string;
  readonly maxFileBytes?: number;
}

export interface SiteBackupLimits {
  readonly maxTotalBytes: number;
  readonly maxFiles: number;
}

/** Where the manifest and the database snapshot live inside the backup folder. */
export const SITE_BACKUP_MANIFEST_PATH = "tovu-backup.json";
export const SITE_BACKUP_DATABASE_PATH = "database/content.db";

/** Where each scope's bytes live on this machine — resolved once by the composition root
 *  (`server/runtime/composition/deps.ts`'s `createSiteRouteDeps`), so this file never re-derives a
 *  site path itself. */
export interface SiteBackupSources {
  readonly siteDir: string;
  /** `null` when media lives in object storage (`TOVU_MEDIA_BLOB_STORE=s3`): there is no folder on
   *  this machine to back up, and {@link collectSiteBackupFiles} says so instead of backing up
   *  nothing silently. */
  readonly mediaUploadsDir: string | null;
  /** The effective media provider is remote — read at backup time, since a site-setting choice
   *  (`core.storage.mediaObjectStore`) is not known at boot the way the env override is. When it
   *  answers `true` the uploads folder is not walked (it is not where media lives) and the scope
   *  note is written, exactly as for a `null` {@link mediaUploadsDir}. */
  readonly isMediaRemote?: () => Promise<boolean>;
  readonly themesDir: string;
  /** The installer's own layout (`features/agent-plugins/layout.ts`), never a re-derived path: every
   *  plugin folder the backup reads comes from the same helpers `install.ts` writes through, so a
   *  layout move cannot silently drop installed packages from a backup again. */
  readonly agentPlugins: AgentPluginLayout;
  readonly skillsDir: string;
  readonly tovuVersion: string;
}

/** One file on disk a backup will upload. `bytes`, `mtimeMs` and `identity` are what
 *  {@link readPlannedFile} compares against at push time. */
export interface PlannedDiskFile {
  /** Relative to the backup folder, `/`-separated. */
  readonly path: string;
  readonly bytes: number;
  readonly scope: SiteBackupScope;
  /** The folder the plan's walk started from. {@link readPlannedFile} refuses a link anywhere below it. */
  readonly root: string;
  readonly absPath: string;
  readonly mtimeMs: number;
  /** The planned file's {@link fileIdentity}: the opened handle must be this very file. `null` when
   *  the filesystem reports no inode number, and then only the path checks prove it. */
  readonly identity: string | null;
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

/** Names never backed up wherever they appear. `.publish-staging`/`.publish-previous` are
 *  theme-files publish's own scratch and replaced-tree copies (`features/theme/publish-content.ts`) —
 *  a backup must never capture a half-staged tree. `.storage-secret.json` is a Postgres site's sealed
 *  connection string (`storage-secret.ts`): it lives in the site root, which no scope walks, and is
 *  named here too so a stray copy inside a walked folder never rides along. */
const IGNORED_NAMES = new Set([".DS_Store", ".git", ".publish-staging", ".publish-previous", ".storage-secret.json"]);

const SYMLINK_REASON = "a symbolic link — never followed, so nothing outside the site can ride along";

/** The walk's shared output, appended to in place by every scope. */
interface WalkSink {
  readonly files: PlannedDiskFile[];
  readonly skipped: SkippedSiteBackupFile[];
  readonly fileSystem: SiteBackupWalkFileSystem;
  readonly profile?: "share";
}

/** The filesystem reads used by backup collection, including files removed during the walk. */
export interface SiteBackupWalkFileSystem {
  readonly lstat: (file: string) => Promise<Stats>;
  /** `lstat` with bigint numbers, for {@link fileIdentity}: a 64-bit Windows file id overflows a JS number. */
  readonly lstatBigInt: (file: string) => Promise<Pick<BigIntStats, "dev" | "ino">>;
  readonly readdir: (dir: string) => Promise<Dirent[]>;
}

const WALK_FILE_SYSTEM: SiteBackupWalkFileSystem = {
  lstat,
  lstatBigInt: (file) => lstat(file, { bigint: true }),
  readdir: (dir) => readdir(dir, { withFileTypes: true }),
};

/**
 * `<dev>:<ino>` from bigint stats: the same string means the same file. `null` when the filesystem
 * reports inode 0 (no file id, e.g. some Windows network or FAT volumes), where identity is unprovable.
 *
 * @complexity O(1).
 */
export function fileIdentity(info: Pick<BigIntStats, "dev" | "ino">): string | null {
  return info.ino === 0n ? null : `${info.dev}:${info.ino}`;
}

function isMissing(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "ENOENT";
}

/** `null` when the read fails because the path is gone (removed during the walk); any other failure rejects. */
function unlessMissing<T>(read: Promise<T>): Promise<T | null> {
  return read.catch((err: unknown) => (isMissing(err) ? null : Promise.reject(err)));
}

/** `readdir` that treats a folder that doesn't exist as empty: a site with no themes folder yet has
 *  nothing to back up there, which is not an error. */
async function readdirOrEmpty(dir: string, fileSystem: SiteBackupWalkFileSystem): Promise<Dirent[]> {
  try {
    return await fileSystem.readdir(dir);
  } catch (err) {
    if (isMissing(err)) return [];
    throw err;
  }
}

/**
 * Adds one regular file to the sink, or records why it was left out. `lstat`, never `stat`: a
 * symlink's own metadata, never its target's. A file removed before either `lstat` is left out.
 *
 * @complexity O(1) — two `lstat`s (the second for {@link fileIdentity}).
 */
async function addFile(sink: WalkSink, input: { root: string; absPath: string; relPath: string; scope: SiteBackupScope }): Promise<void> {
  if (sink.profile === "share" && excludedSharePath({ path: input.relPath })) return;
  const info = await unlessMissing(sink.fileSystem.lstat(input.absPath));
  if (info === null) return;
  if (info.isSymbolicLink()) {
    sink.skipped.push({ path: input.relPath, reason: SYMLINK_REASON });
    return;
  }
  if (!info.isFile()) {
    sink.skipped.push({ path: input.relPath, reason: "not a regular file" });
    return;
  }
  if (sink.profile === "share") {
    validateSharePath({ path: input.relPath });
    if (info.nlink > 1) throw new SiteShareRefusal({ code: "UNSAFE_FILE", message: `Share refuses hardlinked file '${input.relPath}'.` });
    checkShareLimits({ files: [...sink.files, { path: input.relPath, bytes: info.size }] });
  }
  const ids = await unlessMissing(sink.fileSystem.lstatBigInt(input.absPath));
  if (ids === null) return;
  sink.files.push({ path: input.relPath, bytes: info.size, scope: input.scope, root: input.root, absPath: input.absPath, mtimeMs: info.mtimeMs, identity: fileIdentity(ids) });
}

/**
 * Recursively adds every regular file under `absDir`. Symlinks (to files or folders) are reported
 * and never entered; {@link IGNORED_NAMES} are dropped silently; `excludeTopLevel` names are dropped
 * at the first level only (`uploads/chat-attachments`). Each file's `root` is `root`, else `absDir`.
 *
 * @complexity O(entries under `absDir`) filesystem calls; recursion depth is the folder depth.
 */
async function walkTree(sink: WalkSink, input: { root?: string; absDir: string; relDir: string; scope: SiteBackupScope; excludeTopLevel?: ReadonlySet<string> }): Promise<void> {
  if (sink.profile === "share" && !(await enterShareDirectory({ sink, absDir: input.absDir, relDir: input.relDir }))) return;
  const entries = await readdirOrEmpty(input.absDir, sink.fileSystem);
  const root = input.root ?? input.absDir;
  for (const entry of entries) {
    if (skippedWalkEntry({ sink, relDir: input.relDir, name: entry.name }, { excludeTopLevel: input.excludeTopLevel })) continue;
    await walkEntry({ sink, entry, root, absDir: input.absDir, relDir: input.relDir, scope: input.scope });
  }
}

/** Share profile: a private folder is not entered, a missing one is empty, a linked or special one refuses. */
async function enterShareDirectory(required: { sink: WalkSink; absDir: string; relDir: string }): Promise<boolean> {
  if (excludedSharePath({ path: required.relDir })) return false;
  const info = await required.sink.fileSystem.lstat(required.absDir).catch(err => isMissing(err) ? null : Promise.reject(err));
  if (!info) return false;
  if (!info.isDirectory() || info.isSymbolicLink()) throw new SiteShareRefusal({ code: "UNSAFE_FILE", message: `Share refuses linked or special directory '${required.relDir}'.` });
  validateSharePath({ path: required.relDir });
  return true;
}

function skippedWalkEntry(required: { sink: WalkSink; relDir: string; name: string }, optional: { excludeTopLevel?: ReadonlySet<string> | undefined }): boolean {
  const { name } = required;
  // Finder writes .DS_Store into any folder it opens; it is junk, never content, so drop it before the share refusal list sees it.
  if (name === ".DS_Store") return true;
  if (required.sink.profile === "share" && excludedSharePath({ path: `${required.relDir}/${name}` })) return true;
  return IGNORED_NAMES.has(name) || optional.excludeTopLevel?.has(name) === true;
}

async function walkEntry(required: { sink: WalkSink; entry: Dirent; root: string; absDir: string; relDir: string; scope: SiteBackupScope }): Promise<void> {
  const { sink, entry, root, scope } = required;
  const absPath = path.join(required.absDir, entry.name);
  const relPath = `${required.relDir}/${entry.name}`;
  if (entry.isSymbolicLink()) {
    sink.skipped.push({ path: relPath, reason: SYMLINK_REASON });
  } else if (entry.isDirectory()) {
    await walkTree(sink, { root, absDir: absPath, relDir: relPath, scope });
  } else {
    await addFile(sink, { root, absPath, relPath, scope });
  }
}

/** The files each installed-plugin workspace keeps that a restore needs. Everything else there is
 *  left out on purpose: `data/` holds plugin OAuth tokens, `staging/` is a half-finished install,
 *  and `packages/superseded-*` are replaced versions. */
const PLUGIN_WORKSPACE_FILES: ReadonlySet<string> = new Set(["activations.json", "bundled-digests.json"]);

/** `agent-plugins/<path under the layout root>`, `/`-separated. */
function agentPluginsRelPath(layout: AgentPluginLayout, absPath: string): string {
  return ["agent-plugins", ...path.relative(layout.root, absPath).split(path.sep)].join("/");
}

/**
 * Walks `absDir` only when it, and every folder between `baseDir` and it, is a real directory: a
 * symlinked `package/` or `memory/` is reported, never entered, and a missing one is nothing to
 * back up.
 *
 * @complexity O(depth from `baseDir`) `lstat`s, plus the walk itself.
 */
async function walkOwnedDir(sink: WalkSink, input: { layout: AgentPluginLayout; baseDir: string; absDir: string }): Promise<void> {
  let current = input.baseDir;
  for (const segment of path.relative(input.baseDir, input.absDir).split(path.sep)) {
    current = path.join(current, segment);
    const info = await sink.fileSystem.lstat(current).catch((err: unknown) => (isMissing(err) ? null : Promise.reject(err)));
    if (info === null) return;
    if (info.isSymbolicLink()) {
      sink.skipped.push({ path: agentPluginsRelPath(input.layout, current), reason: SYMLINK_REASON });
      return;
    }
    if (!info.isDirectory()) return;
  }
  await walkTree(sink, { root: input.layout.workspacesDir, absDir: input.absDir, relDir: agentPluginsRelPath(input.layout, input.absDir), scope: "plugins" });
}

/**
 * The plugins scope's `agent-plugins/` half: per workspace, {@link PLUGIN_WORKSPACE_FILES}, the
 * legacy flat `packages/sha256/**` store (a site not yet migrated to per-plugin folders still has its
 * packages there), and per installed plugin its `package/sha256/**` store and its learned/notes
 * memory — nothing else. Memory is included because it is the site's own record (uninstall offers to
 * keep it); a plugin's `data/` is not, since it holds OAuth tokens. Every path comes from
 * `layout`'s helpers, the same ones the installer writes through.
 *
 * @complexity O(entries under each included folder).
 */
async function walkAgentPlugins(sink: WalkSink, layout: AgentPluginLayout): Promise<void> {
  for (const entry of await readdirOrEmpty(layout.workspacesDir, sink.fileSystem)) {
    const workspace = installerWorkspace({ sink, layout, entry });
    if (workspace) await walkPluginWorkspace({ sink, layout, workspace });
  }
}

type PluginWorkspace = ReturnType<AgentPluginLayout["forWorkspace"]>;

/** The workspace folder `entry` names, or `null` (reported when it is a link or a foreign folder). */
function installerWorkspace(required: { sink: WalkSink; layout: AgentPluginLayout; entry: Dirent }): PluginWorkspace | null {
  const { sink, layout, entry } = required;
  const absWorkspace = path.join(layout.workspacesDir, entry.name);
  if (entry.isSymbolicLink()) {
    sink.skipped.push({ path: agentPluginsRelPath(layout, absWorkspace), reason: SYMLINK_REASON });
    return null;
  }
  if (!entry.isDirectory()) return null;
  let workspace;
  try {
    workspace = layout.forWorkspace(entry.name);
  } catch {
    workspace = null;
  }
  // A folder the installer could never have written (an invalid id, or one that only resolves
  // after case-folding to a different folder) is reported rather than walked under a guessed shape.
  if (workspace === null || workspace.root !== absWorkspace) {
    sink.skipped.push({ path: agentPluginsRelPath(layout, absWorkspace), reason: "not a workspace folder the plugin installer writes" });
    return null;
  }
  return workspace;
}

async function walkPluginWorkspace(required: { sink: WalkSink; layout: AgentPluginLayout; workspace: PluginWorkspace }): Promise<void> {
  const { sink, layout, workspace } = required;
  for (const name of PLUGIN_WORKSPACE_FILES) {
    const absPath = path.join(workspace.root, name);
    await addFile(sink, { root: layout.workspacesDir, absPath, relPath: agentPluginsRelPath(layout, absPath), scope: "plugins" });
  }
  await walkOwnedDir(sink, { layout, baseDir: workspace.root, absDir: workspace.packages });
  for (const pluginEntry of await readdirOrEmpty(workspace.root, sink.fileSystem)) await walkInstalledPlugin({ sink, layout, workspace, pluginEntry });
}

async function walkInstalledPlugin(required: { sink: WalkSink; layout: AgentPluginLayout; workspace: PluginWorkspace; pluginEntry: Dirent }): Promise<void> {
  const { sink, layout, workspace, pluginEntry } = required;
  if (PLUGIN_WORKSPACE_FILES.has(pluginEntry.name) || (!pluginEntry.isDirectory() && !pluginEntry.isSymbolicLink())) return;
  let pluginRoot: string;
  try {
    pluginRoot = workspace.pluginRootDir({ pluginId: pluginEntry.name });
  } catch {
    return; // `staging/`, `packages/`, `data/` and anything not named like a plugin id.
  }
  if (pluginEntry.isSymbolicLink()) {
    sink.skipped.push({ path: agentPluginsRelPath(layout, pluginRoot), reason: SYMLINK_REASON });
    return;
  }
  const pluginId = pluginEntry.name;
  for (const absDir of [
    workspace.pluginPackagesDir({ pluginId }),
    workspace.pluginMemoryDir({ pluginId, kind: "learned" }),
    workspace.pluginMemoryDir({ pluginId, kind: "notes" }),
  ]) {
    await walkOwnedDir(sink, { layout, baseDir: pluginRoot, absDir });
  }
}

/** The one media note a backup can carry, and why: the bytes are not on this machine. */
const MEDIA_IN_OBJECT_STORAGE_NOTE =
  "Media is stored in object storage (TOVU_MEDIA_BLOB_STORE=s3 or the site's media storage setting), not in a folder on this server, so media files are not in this backup. The database still lists every media item.";

/**
 * Every file on disk the switched-on scopes pick up. The database scope is never a disk walk — see
 * {@link captureDatabaseSnapshot}.
 *
 * @returns `files` sorted by path, `skipped` (symlinks and non-regular files, each with its reason),
 *   and `scopeNotes` for a scope whose content could not be collected here at all.
 * @throws Only an unexpected filesystem error (a missing folder is treated as empty).
 * @complexity O(entries under every included scope's folder) filesystem calls, plus O(n log n) to sort.
 */
export async function collectSiteBackupFiles(input: { sources: SiteBackupSources; include: SiteBackupInclude }, optional: { fileSystem?: SiteBackupWalkFileSystem; profile?: "share" } = {}): Promise<CollectedSiteBackupFiles> {
  const { sources, include } = input;
  const sink: WalkSink = { files: [], skipped: [], fileSystem: optional.fileSystem ?? WALK_FILE_SYSTEM, ...(optional.profile ? { profile: optional.profile } : {}) };
  const scopeNotes: Partial<Record<SiteBackupScope, string>> = {};

  if (include.media) await collectMediaScope({ sink, sources, scopeNotes });
  if (include.themes) await walkTree(sink, { absDir: sources.themesDir, relDir: "themes", scope: "themes" });
  if (include.plugins) await collectPluginScope({ sink, sources });
  if (sink.profile === "share") await collectShareOnlyTrees({ sink, sources, include });
  if (include.settings) {
    for (const name of ["config.json", ".site-meta.json"]) {
      await addFile(sink, { root: sources.siteDir, absPath: path.join(sources.siteDir, name), relPath: `settings/${name}`, scope: "settings" });
    }
  }

  sink.files.sort(byPath);
  return { files: sink.files, skipped: sink.skipped, scopeNotes };
}

/** Code-unit order: -1, 0 or 1, the same as `a < b ? -1 : a > b ? 1 : 0`. */
function byPath(a: { path: string }, b: { path: string }): number {
  return Number(a.path > b.path) - Number(a.path < b.path);
}

/** The uploads folder, minus chat attachments; object-storage media is noted, never silently empty. */
async function collectMediaScope(required: { sink: WalkSink; sources: SiteBackupSources; scopeNotes: Partial<Record<SiteBackupScope, string>> }): Promise<void> {
  const { mediaUploadsDir, isMediaRemote } = required.sources;
  if (mediaUploadsDir === null || (await isMediaRemote?.())) required.scopeNotes.media = MEDIA_IN_OBJECT_STORAGE_NOTE;
  else await walkTree(required.sink, { absDir: mediaUploadsDir, relDir: "uploads", scope: "media", excludeTopLevel: new Set(["chat-attachments"]) });
}

/** Installed agent plugins and skills; a share first refuses a linked or special plugin root. */
async function collectPluginScope(required: { sink: WalkSink; sources: SiteBackupSources }): Promise<void> {
  const { sink, sources } = required;
  if (sink.profile === "share") {
    for (const root of [sources.agentPlugins.root, sources.agentPlugins.workspacesDir]) {
      const info = await sink.fileSystem.lstat(root).catch(err => isMissing(err) ? null : Promise.reject(err));
      if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new SiteShareRefusal({ code: "UNSAFE_FILE", message: "Share refuses a linked plugin root." });
    }
  }
  await walkAgentPlugins(sink, sources.agentPlugins);
  await walkTree(sink, { absDir: sources.skillsDir, relDir: "skills", scope: "plugins" });
}

/** Site-local plugin packages and theme overrides travel only in a share. */
async function collectShareOnlyTrees(required: { sink: WalkSink; sources: SiteBackupSources; include: SiteBackupInclude }): Promise<void> {
  const { sink, sources, include } = required;
  if (include.plugins) await walkTree(sink, { absDir: path.join(sources.siteDir, "plugins"), relDir: "plugins", scope: "plugins" });
  if (include.themes) await walkTree(sink, { absDir: path.join(sources.siteDir, "overrides"), relDir: "overrides", scope: "themes" });
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
export async function captureDatabaseSnapshot(input: { dbOps: DbOpsPort; scopeId: string }, optional: { maxBytes?: number } = {}): Promise<DatabaseSnapshotResult> {
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
    return { ok: false, message: "the database snapshot failed; nothing was backed up", logDetail: describeErrorForLog({ err }) };
  }
  try {
    if (optional.maxBytes !== undefined && (await stat(artifactRef)).size > optional.maxBytes) return { ok: false, message: "Database snapshot exceeds the v1 300 MiB share cap." };
    return { ok: true, bytes: await readFile(artifactRef), watermarkAtCapture };
  } catch (err) {
    return { ok: false, message: "the database snapshot could not be read back; nothing was backed up", logDetail: describeErrorForLog({ err }) };
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

/**
 * Leaves out every disk file over the host's per-file limit, each named in `skipped` with its size,
 * so one huge video does not cost the whole backup (2026-10-06: the owner asked for a full backup
 * that just works). The database is not a disk file here: an oversized snapshot still fails the plan
 * in {@link checkSiteBackupLimits}, because a backup without its database is not a backup.
 *
 * @complexity O(n).
 */
export function skipOversizedFiles(files: readonly PlannedDiskFile[], host: SiteBackupHostLimit): { files: PlannedDiskFile[]; skipped: SkippedSiteBackupFile[] } {
  const maxFileBytes = host.maxFileBytes;
  if (maxFileBytes === undefined) return { files: [...files], skipped: [] };
  const skipped = files
    .filter((file) => file.bytes > maxFileBytes)
    .map((file) => ({ path: file.path, reason: `${formatByteSize(file.bytes)}, over ${host.label}'s ${formatByteSize(maxFileBytes)} per-file limit` }));
  return { files: files.filter((file) => file.bytes <= maxFileBytes), skipped };
}

export type SiteBackupLimitsResult = { ok: true; totalBytes: number } | { ok: false; message: string };

/**
 * Checks a backup against {@link SITE_BACKUP_LIMITS} and the host's own per-file limit (when its
 * plugin declares one) before anything is uploaded. A file over the per-file limit is refused, never truncated or split — and EVERY such file is named, so one retry
 * after removing them is enough. The plan runs {@link skipOversizedFiles} over the disk files first,
 * so in practice only an oversized database snapshot reaches this refusal.
 *
 * @complexity O(n) in the file count.
 */
export function checkSiteBackupLimits(
  files: readonly { path: string; bytes: number }[],
  host: SiteBackupHostLimit,
  limits: SiteBackupLimits = SITE_BACKUP_LIMITS,
): SiteBackupLimitsResult {
  const maxFileBytes = host.maxFileBytes;
  const oversized = maxFileBytes === undefined ? [] : files.filter((file) => file.bytes > maxFileBytes);
  if (maxFileBytes !== undefined && oversized.length > 0) {
    // The exact byte count too: a file 1 byte over rounds to the limit's own size.
    const named = oversized.map((file) => `${file.path} (${formatByteSize(file.bytes)}, ${file.bytes} bytes)`).join(", ");
    return {
      ok: false,
      message: `${oversized.length} file(s) exceed ${host.label}'s ${formatByteSize(maxFileBytes)} per-file limit and cannot be backed up: ${named}. Nothing is truncated or split; remove or shrink these, or turn off the scope that holds them.`,
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

/** The opened file's metadata, identity and bytes must all come from the same handle. */
export interface SiteBackupReadHandle {
  stat(): Promise<Pick<Stats, "isFile" | "size" | "mtimeMs">>;
  /** Bigint, for {@link fileIdentity}: a 64-bit Windows file id overflows a JS number. */
  stat(options: { bigint: true }): Promise<Pick<BigIntStats, "dev" | "ino">>;
  readFile(): Promise<Buffer>;
  close(): Promise<void>;
}

/** The filesystem calls a push-time read makes; injectable so the swap races can be staged. */
export interface SiteBackupReadFileSystem {
  readonly open: (file: string, flags: number) => Promise<SiteBackupReadHandle>;
  readonly lstat: (file: string) => Promise<Pick<BigIntStats, "isDirectory" | "isSymbolicLink" | "dev" | "ino">>;
  readonly realpath: (file: string) => Promise<string>;
}

const READ_FILE_SYSTEM: SiteBackupReadFileSystem = { open, lstat: (file) => lstat(file, { bigint: true }), realpath };

/** `O_NOFOLLOW` and `O_NONBLOCK` where the platform has them (Windows has neither). `O_NONBLOCK` so a
 *  FIFO swapped in after the plan opens at once instead of hanging the push waiting for a writer; it
 *  then fails the regular-file check. Regular files ignore it. */
const READ_FLAGS = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_NONBLOCK ?? 0);

/**
 * Reads a planned file at push time, refusing it if it is no longer the file the human reviewed.
 *
 * Opened with `O_NOFOLLOW` and checked through the SAME handle it is read from, so a file swapped for
 * a symlink after the plan cannot be followed, and the size/mtime compared are the bytes actually
 * read. `O_NOFOLLOW` guards only the last name and Node has no `openat`, so no path check can stop an
 * ancestor (or the root) being swapped for a link and back around the open. What closes every such
 * swap, and a hardlink to another file put in the planned file's place, is identity: the opened handle
 * must be the very device+inode the plan recorded ({@link PlannedDiskFile.identity}). After the open,
 * {@link walkPlannedPath} also proves the path still runs through real folders to that same file; on a
 * filesystem with no inode numbers that walk is the only proof left. Anything that cannot be proven
 * fails closed as stale.
 *
 * @complexity O(file size + path depth) — one open, two fstats, one walk of O(depth) `lstat`s and two
 *   `realpath`s, one read.
 */
export async function readPlannedFile(file: PlannedDiskFile, optional: { fileSystem?: SiteBackupReadFileSystem } = {}): Promise<ReadPlannedFileResult> {
  const fileSystem = optional.fileSystem ?? READ_FILE_SYSTEM;
  const stale: ReadPlannedFileResult = { ok: false, message: `'${file.path}' changed since the plan was made. Call site_backup_plan again.` };
  let handle;
  try {
    handle = await fileSystem.open(file.absPath, READ_FLAGS);
  } catch {
    return stale;
  }
  try {
    if (!(await openedIsPlanned({ file, fileSystem, handle }))) return stale;
    const bytes = await handle.readFile();
    return bytes.length === file.bytes ? { ok: true, bytes } : stale;
  } finally {
    await handle.close();
  }
}

/**
 * The handle is a regular file with the plan's size and mtime, it is the planned file itself (when the
 * plan has an identity), and a walk after the open reaches this same file through real folders.
 *
 * @complexity O(path depth) — see {@link walkPlannedPath}.
 */
async function openedIsPlanned(required: { file: PlannedDiskFile; fileSystem: SiteBackupReadFileSystem; handle: SiteBackupReadHandle }): Promise<boolean> {
  const { file, handle } = required;
  const info = await handle.stat();
  if (!info.isFile() || info.size !== file.bytes || info.mtimeMs !== file.mtimeMs) return false;
  const opened = fileIdentity(await handle.stat({ bigint: true }));
  if (file.identity !== null && opened !== file.identity) return false;
  const reached = await walkPlannedPath({ file, fileSystem: required.fileSystem });
  // Both `null` only on a filesystem with no inode numbers: the walk's path proof is all there is.
  return reached !== null && reached.leaf === opened;
}

type PlannedPathProof = { leaf: string | null };

/**
 * Proves `file.absPath` is still a plain path below `file.root`: every folder in between is a real
 * directory (`lstat`, so a symlink or Windows junction is seen as a link), the file itself is no link,
 * and its real path is the root's real path plus those same names. `null` when any of that fails or
 * the filesystem errors. The root itself is the scope folder the plan walked from; a swapped root is
 * caught by the planned identity, not here.
 *
 * @complexity O(depth) `lstat`s and two `realpath`s.
 */
async function walkPlannedPath(required: { file: PlannedDiskFile; fileSystem: SiteBackupReadFileSystem }): Promise<PlannedPathProof | null> {
  const { file, fileSystem } = required;
  const relative = path.relative(file.root, file.absPath);
  if (relative === "" || path.isAbsolute(relative) || relative.split(path.sep)[0] === "..") return null;
  try {
    const leaf = await lstatEachName({ root: file.root, names: relative.split(path.sep), fileSystem });
    if (leaf === null) return null;
    const realPath = path.join(await fileSystem.realpath(file.root), relative);
    return (await fileSystem.realpath(file.absPath)) === realPath ? { leaf: fileIdentity(leaf) } : null;
  } catch {
    return null;
  }
}

/** The last name's `lstat` once no name is a link and every earlier one is a directory; else `null`. O(names). */
async function lstatEachName(required: { root: string; names: readonly string[]; fileSystem: SiteBackupReadFileSystem }): Promise<Pick<BigIntStats, "dev" | "ino"> | null> {
  let current = required.root;
  let info: Pick<BigIntStats, "dev" | "ino"> | null = null;
  for (const [index, name] of required.names.entries()) {
    current = path.join(current, name);
    const entry = await required.fileSystem.lstat(current);
    if (entry.isSymbolicLink() || (index < required.names.length - 1 && !entry.isDirectory())) return null;
    info = entry;
  }
  return info;
}

export interface SiteBackupManifestInput {
  readonly profile?: "share";
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
    ...(input.profile === "share" ? { profile: "share", sanitizationVersion: 1 } : {}),
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
