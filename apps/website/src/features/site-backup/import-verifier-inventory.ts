import { createHash } from "node:crypto";
import type { AgentPluginArchiveEntry, AgentPluginArchiveReaderPort } from "@jini-ai/agent-plugins/lifecycle";
import { checkShareLimits, SHARE_LIMITS, SiteShareRefusal } from "./share-policy.js";
import { validateSharePath, excludedSharePath, requireShareSecretFree, claimSharePath, sharePathAlias, type PackageFileInventory } from "./share-file-policy.js";
import { SITE_BACKUP_MANIFEST_PATH, SITE_BACKUP_DATABASE_PATH } from "./sources.js";

/**
 * @file The archive half of `verifySiteImport`: the metadata-only first pass, the manifest contract,
 * the manifest inventory, and the bounded, hash-checked second pass. Every refusal here is
 * `INVALID_ARCHIVE` unless a shared share policy (path, limits, secrets) refuses first.
 */

type FileEntry = Extract<AgentPluginArchiveEntry, { kind: "file" }>;

/** One manifest file record after validation: the exact bytes and hash the archive must match. */
export interface InventoryRecord { readonly path: string; readonly bytes: number; readonly sha256: string }

/** A manifest that passed the share identity contract; only the fields later steps read are typed. */
export interface SupportedShareManifest { readonly files: unknown[]; readonly site: { readonly name: string } }

/** What the metadata pass learned, before any listed content is read. */
export interface ArchiveScan {
  readonly manifestBytes: Buffer;
  /** Case/Unicode alias of every file entry, the manifest included. */
  readonly fileAliases: Set<string>;
  readonly directories: Set<string>;
}

/** The per-archive claim sets the first pass fills in place. */
interface EntryClaims {
  readonly aliases: Map<string, string>;
  readonly fileAliases: Set<string>;
  readonly directories: Set<string>;
  readonly sizes: { path: string; bytes: number }[];
}

const SHARE_INVENTORY_ROOTS = /^(?:uploads|themes|plugins|agent-plugins|skills|overrides)\/.+/;
const SHARE_SETTINGS_FILES = ["settings/config.json", "settings/.site-meta.json"];
const SHA256_HEX = /^[a-f0-9]{64}$/;

export function refuseArchive(message: string): never { throw new SiteShareRefusal({ code: "INVALID_ARCHIVE", message }); }

/** Hex SHA-256 of a whole buffer. O(bytes). */
export function sha256Hex(bytes: Buffer): string { return createHash("sha256").update(bytes).digest("hex"); }

/**
 * First pass, metadata only: claims every entry path, refuses links/special entries, collisions and
 * invalid declared sizes, enforces the entry and declared-size caps, and reads only the root
 * manifest (bounded). ZIP ordering is never trusted; the manifest may appear anywhere.
 * @throws SiteShareRefusal (INVALID_ARCHIVE, UNSAFE_PATH, LIMIT_EXCEEDED) or the signal's reason.
 * @complexity O(entries × path depth + manifest bytes), at most 2,000 entries.
 */
export async function scanArchiveMetadata(required: { archive: Buffer; reader: AgentPluginArchiveReaderPort }, optional: { signal?: AbortSignal } = {}): Promise<ArchiveScan> {
  const claims: EntryClaims = { aliases: new Map(), fileAliases: new Set(), directories: new Set(), sizes: [] };
  let manifestBytes: Buffer | undefined;
  let count = 0;
  for await (const entry of required.reader.entries({ archive: required.archive })) {
    optional.signal?.throwIfAborted();
    if (++count > SHARE_LIMITS.maxFiles) refuseArchive("Import exceeds the v1 2,000-entry cap.");
    const file = claimEntry({ claims, entry });
    if (file?.entryPath === SITE_BACKUP_MANIFEST_PATH) manifestBytes = await readBounded({ entry: file, maxBytes: SHARE_LIMITS.maxManifestBytes, signal: optional.signal });
  }
  if (!manifestBytes) refuseArchive("Root tovu-backup.json manifest is required.");
  return { manifestBytes, fileAliases: claims.fileAliases, directories: claims.directories };
}

/** Claims one entry; returns it when it is a file, `undefined` for a directory. */
function claimEntry(required: { claims: EntryClaims; entry: AgentPluginArchiveEntry }): FileEntry | undefined {
  const { claims, entry } = required;
  if (entry.kind !== "file" && entry.kind !== "directory") refuseArchive("ZIP links and special entries are forbidden.");
  if (entry.kind === "directory") {
    claimDirectory({ claims, name: entry.entryPath.replace(/\/$/, "") });
    return undefined;
  }
  claimFile({ claims, entry });
  return entry;
}

function claimDirectory(required: { claims: EntryClaims; name: string }): void {
  const { claims, name } = required;
  claimSharePath({ path: name, directory: true, aliases: claims.aliases, files: claims.fileAliases });
  if (claims.directories.has(name) || claims.fileAliases.has(sharePathAlias({ path: name }))) refuseArchive("Duplicate directory or file/directory collision.");
  claims.directories.add(name);
}

function claimFile(required: { claims: EntryClaims; entry: FileEntry }): void {
  const { claims, entry } = required;
  const name = entry.entryPath;
  claimSharePath({ path: name, directory: false, aliases: claims.aliases, files: claims.fileAliases });
  if (claims.directories.has(name)) refuseArchive("ZIP file/directory collision.");
  const size = entry.declaredSize;
  if (!Number.isSafeInteger(size) || size! < 0) refuseArchive("ZIP has an invalid declared size.");
  claims.sizes.push({ path: name, bytes: size! });
  checkShareLimits({ files: claims.sizes });
}

/**
 * Parses the manifest and refuses anything but this build's exact share identity.
 * @throws SiteShareRefusal INVALID_ARCHIVE for invalid JSON or an unsupported identity.
 * @complexity O(manifest bytes).
 */
export function parseShareManifest(required: { manifestBytes: Buffer; schema: { index: number; tag: string } }): SupportedShareManifest {
  let manifest: unknown;
  try { manifest = JSON.parse(required.manifestBytes.toString("utf8")); } catch { refuseArchive("Invalid share manifest JSON."); }
  if (!isSupportedManifest(manifest, required.schema)) refuseArchive("Unsupported share format/profile/version, schema identity, database or site name.");
  return manifest;
}

// The manifest is untrusted JSON of any shape; each predicate reads it exactly as the archive gave it.
function isSupportedManifest(manifest: any, schema: { index: number; tag: string }): manifest is SupportedShareManifest {
  return formatSupported(manifest) && schemaSupported(manifest, schema) && databaseSupported(manifest) && fileListSupported(manifest) && siteNameSupported(manifest);
}
function formatSupported(manifest: any): boolean {
  return manifest?.format === "tovu-site-backup" && manifest.formatVersion === 1 && manifest.profile === "share" && manifest.sanitizationVersion === 1;
}
function schemaSupported(manifest: any, schema: { index: number; tag: string }): boolean {
  // Library added columns, not a new manifest identity. Historical database compatibility
  // belongs to the worker's trusted schema matcher, never invented migration-ID aliases.
  return manifest.schema?.index === schema.index && manifest.schema?.tag === schema.tag;
}
function databaseSupported(manifest: any): boolean {
  return manifest.database?.engine === "sqlite" && manifest.database?.path === SITE_BACKUP_DATABASE_PATH;
}
function fileListSupported(manifest: any): boolean {
  return Array.isArray(manifest.files) && manifest.files.length + 1 <= SHARE_LIMITS.maxFiles;
}
function siteNameSupported(manifest: any): boolean {
  return typeof manifest.site?.name === "string" && Boolean(manifest.site.name.trim()) && manifest.site.name.length <= 200;
}
function isInventoryRecord(file: any): file is InventoryRecord {
  return Boolean(file) && typeof file.path === "string" && Number.isSafeInteger(file.bytes) && file.bytes >= 0 && SHA256_HEX.test(file.sha256);
}

/**
 * Validates every manifest record and keys it by exact path. Only the projected database and the
 * recognised portable roots/settings files may be listed; known private paths refuse.
 * @throws SiteShareRefusal (INVALID_ARCHIVE, UNSAFE_PATH, UNSAFE_FILE).
 * @complexity O(records × path length).
 */
export function buildManifestInventory(required: { files: readonly unknown[] }): Map<string, InventoryRecord> {
  const inventory = new Map<string, InventoryRecord>();
  for (const file of required.files) {
    if (!isInventoryRecord(file)) refuseArchive("Invalid manifest file record.");
    validateSharePath({ path: file.path });
    if (inventory.has(file.path) || file.path === SITE_BACKUP_MANIFEST_PATH) refuseArchive("Duplicate manifest file.");
    if (refusedInventoryPath(file.path)) refuseArchive("Unrecognized or private file in share inventory.");
    inventory.set(file.path, file);
  }
  return inventory;
}

function refusedInventoryPath(path: string): boolean {
  if (path === SITE_BACKUP_DATABASE_PATH) return false;
  return excludedSharePath({ path }) || !SHARE_INVENTORY_ROOTS.test(path) && !SHARE_SETTINGS_FILES.includes(path);
}

/**
 * The archive holds exactly the manifest plus one file per record (counted by alias), the database
 * is listed, and every directory entry has a listed file below it.
 * @complexity O(directories × records).
 */
export function checkArchiveMatchesInventory(required: { inventory: ReadonlyMap<string, InventoryRecord>; fileAliases: ReadonlySet<string>; directories: ReadonlySet<string> }): void {
  const { inventory } = required;
  if (inventory.size + 1 !== required.fileAliases.size || !inventory.has(SITE_BACKUP_DATABASE_PATH)) refuseArchive("ZIP inventory differs from the manifest.");
  for (const dir of required.directories) if (![...inventory.keys()].some(file => file.startsWith(dir + "/"))) refuseArchive("Unlisted ZIP directory.");
}

/**
 * Second pass: reads every listed file under its manifest size and the remaining expanded budget,
 * checks its SHA-256, and secret-scans everything except the database (the sanitizer owns that).
 * @throws SiteShareRefusal (INVALID_ARCHIVE, SECRET_IN_CONTENT) or the signal's reason.
 * @complexity O(payload bytes), at most 300 MiB buffered.
 */
export async function readListedFiles(required: { archive: Buffer; reader: AgentPluginArchiveReaderPort; inventory: ReadonlyMap<string, InventoryRecord>; manifestBytes: Buffer }, optional: { signal?: AbortSignal; packageFiles?: PackageFileInventory } = {}): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  let expanded = required.manifestBytes.length;
  for await (const entry of required.reader.entries({ archive: required.archive })) {
    if (entry.kind !== "file" || entry.entryPath === SITE_BACKUP_MANIFEST_PATH) continue;
    const content = await readListedFile({ entry, inventory: required.inventory, remainingBytes: SHARE_LIMITS.maxExpandedBytes - expanded }, optional);
    expanded += content.length;
    files.set(entry.entryPath, content);
  }
  return files;
}

async function readListedFile(required: { entry: FileEntry; inventory: ReadonlyMap<string, InventoryRecord>; remainingBytes: number }, optional: { signal?: AbortSignal | undefined; packageFiles?: PackageFileInventory | undefined }): Promise<Buffer> {
  const { entry } = required;
  const expected = required.inventory.get(entry.entryPath);
  if (!expected || expected.bytes !== entry.declaredSize) refuseArchive("Unlisted ZIP file or size mismatch.");
  const content = await readBounded({ entry, maxBytes: Math.min(expected.bytes, required.remainingBytes), signal: optional.signal });
  if (content.length !== expected.bytes || sha256Hex(content) !== expected.sha256) refuseArchive("ZIP size or SHA-256 mismatch.");
  if (entry.entryPath !== SITE_BACKUP_DATABASE_PATH) requireShareSecretFree({ path: entry.entryPath, bytes: content }, { packageFiles: optional.packageFiles });
  return content;
}

/** Count decompressed bytes before retaining each chunk; metadata is never a memory budget. */
async function readBounded(required: { entry: FileEntry; maxBytes: number; signal?: AbortSignal | undefined }): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of required.entry.openReadStream({})) {
    required.signal?.throwIfAborted();
    size += chunk.length;
    if (size > required.maxBytes) refuseArchive("Expanded ZIP bytes exceed the manifest or v1 cap (possible ZIP bomb).");
    chunks.push(Buffer.from(chunk));
  }
  if (size !== required.entry.declaredSize) refuseArchive("ZIP declared and actual size differ.");
  return Buffer.concat(chunks, size);
}
