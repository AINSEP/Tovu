import { createHash } from "node:crypto";
import type { AgentPluginArchiveEntry, AgentPluginArchiveReaderPort } from "@jini-ai/agent-plugins/lifecycle";
import { checkShareLimits, SHARE_LIMITS, SiteShareRefusal } from "./share-policy.js";
import { validateSharePath, excludedSharePath, requireShareSecretFree, claimSharePath, sharePathAlias, type PackageFileInventory } from "./share-file-policy.js";
import { ARCHIVE_MANIFEST_PATH as SITE_BACKUP_MANIFEST_PATH, ARCHIVE_DATABASE_PATH as SITE_BACKUP_DATABASE_PATH, parseArchiveManifest, requireArchiveFileRecord, type ArchiveManifest } from "./archive-manifest.js";
import { archiveCodeUnit, archiveSecretScanPath } from "./archive-paths.js";

/**
 * @file The archive half of `verifySiteImport`: the metadata-only first pass, the manifest contract,
 * the manifest inventory, and the bounded, hash-checked second pass. Every refusal here is
 * `INVALID_ARCHIVE` unless a shared share policy (path, limits, secrets) refuses first.
 */

type FileEntry = Extract<AgentPluginArchiveEntry, { kind: "file" }>;

/** One manifest file record after validation: the exact bytes and hash the archive must match. */
export interface InventoryRecord { readonly path: string; readonly bytes: number; readonly sha256: string }

/** A manifest that passed the share identity contract; only the fields later steps read are typed. */
export type SupportedShareManifest = ArchiveManifest;

/** What the metadata pass learned, before any listed content is read. */
export interface ArchiveScan {
  readonly manifestBytes: Buffer;
  readonly wrapper: string;
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

const SHARE_INVENTORY_ROOTS = /^(?:media|themes|plugins|agent-plugins|skills)\/.+/;
const SHARE_SETTINGS_FILES = ["settings.json"];

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
  const entries: AgentPluginArchiveEntry[] = [];
  let manifestBytes: Buffer | undefined;
  let wrapper = "";
  let count = 0;
  for await (const entry of required.reader.entries({ archive: required.archive })) {
    optional.signal?.throwIfAborted();
    if (++count > SHARE_LIMITS.maxFiles) refuseArchive("Import exceeds the 2,000-entry cap.");
    const name = entry.entryPath.replace(/\/$/, "");
    validateRawEntry({ entry, name });
    if (ignoredArchivePath({ path: name })) continue;
    entries.push(entry);
    if (isManifestEntry({ entry, name })) {
      if (manifestBytes) refuseArchive("Exactly one v2 manifest is required.");
      wrapper = name.slice(0, -SITE_BACKUP_MANIFEST_PATH.length);
      manifestBytes = await readBounded({ entry: entry as FileEntry, maxBytes: SHARE_LIMITS.maxManifestBytes, signal: optional.signal });
    }
  }
  if (!manifestBytes) refuseArchive("A v2 manifest.json at root or inside one wrapper folder is required.");
  claimNormalizedEntries({ entries, claims, wrapper });
  return { manifestBytes, wrapper, fileAliases: claims.fileAliases, directories: claims.directories };
}

/** Finder metadata is discarded identically in both passes, without decompressing it. */
export function ignoredArchivePath(required: { path: string }, _optional = {}): boolean {
  return required.path.split("/").some(part => part === "__MACOSX" || part === ".DS_Store");
}
function stripArchiveWrapper(required: { path: string; wrapper: string }): string {
  if (!required.path.startsWith(required.wrapper)) refuseArchive("Files outside the single wrapper folder are forbidden.");
  const path = required.path.slice(required.wrapper.length);
  validateSharePath({ path: path.replace(/\/$/, "") });
  return path;
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
  return parseArchiveManifest({ bytes: required.manifestBytes, schema: required.schema });
}

/**
 * Validates every manifest record and keys it by exact path. Only the projected database and the
 * recognised portable roots/settings files may be listed; known private paths refuse.
 * @throws SiteShareRefusal (INVALID_ARCHIVE, UNSAFE_PATH, UNSAFE_FILE).
 * @complexity O(records × path length).
 */
export function buildManifestInventory(required: { files: readonly unknown[] }): Map<string, InventoryRecord> {
  const inventory = new Map<string, InventoryRecord>();
  for (const record of required.files) {
    const file = requireArchiveFileRecord({ file: record });
    validateSharePath({ path: file.path });
    if (inventory.has(file.path) || file.path === SITE_BACKUP_MANIFEST_PATH) refuseArchive("Duplicate manifest file.");
    if (refusedInventoryPath(file.path)) refuseArchive("Unrecognized or private file in share inventory.");
    inventory.set(file.path, file);
  }
  return inventory;
}

function refusedInventoryPath(path: string): boolean {
  if (path === SITE_BACKUP_DATABASE_PATH) return false;
  return excludedSharePath({ path: archiveSecretScanPath({ path, plugins: [] }) }) || !SHARE_INVENTORY_ROOTS.test(path) && !SHARE_SETTINGS_FILES.includes(path);
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
export async function readListedFiles(required: { archive: Buffer; reader: AgentPluginArchiveReaderPort; inventory: ReadonlyMap<string, InventoryRecord>; manifestBytes: Buffer; wrapper?: string; manifest?: ArchiveManifest; modified?: Set<string> }, optional: { signal?: AbortSignal; packageFiles?: PackageFileInventory } = {}): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  let expanded = required.manifestBytes.length;
  for await (const entry of required.reader.entries({ archive: required.archive })) {
    if (entry.kind !== "file" || ignoredArchivePath({ path: entry.entryPath })) continue;
    const entryPath = stripArchiveWrapper({ path: entry.entryPath, wrapper: required.wrapper ?? "" });
    if (entryPath === SITE_BACKUP_MANIFEST_PATH) continue;
    const content = await readListedFile({ entry: { ...entry, entryPath }, inventory: required.inventory, remainingBytes: SHARE_LIMITS.maxExpandedBytes - expanded, manifest: required.manifest, modified: required.modified }, optional);
    expanded += content.length;
    files.set(entryPath, content);
  }
  return files;
}

async function readListedFile(required: { entry: FileEntry; inventory: ReadonlyMap<string, InventoryRecord>; remainingBytes: number; manifest?: ArchiveManifest | undefined; modified?: Set<string> | undefined }, optional: { signal?: AbortSignal | undefined; packageFiles?: PackageFileInventory | undefined }): Promise<Buffer> {
  const { entry } = required;
  const expected = required.inventory.get(entry.entryPath);
  if (!expected) refuseArchive("Unlisted ZIP file.");
  const unit = archiveCodeUnit({ path: entry.entryPath });
  if (!unit && expected.bytes !== entry.declaredSize) refuseArchive("ZIP size mismatch.");
  const content = await readBounded({ entry, maxBytes: Math.min(entry.declaredSize!, required.remainingBytes), signal: optional.signal });
  verifyListedIntegrity({ content, expected, unit, modified: required.modified });
  if (entry.entryPath !== SITE_BACKUP_DATABASE_PATH) requireShareSecretFree({ path: archiveSecretScanPath({ path: entry.entryPath, plugins: required.manifest?.plugins ?? [] }), bytes: content }, { packageFiles: optional.packageFiles });
  return content;
}

/** Count decompressed bytes before retaining each chunk; metadata is never a memory budget. */
async function readBounded(required: { entry: FileEntry; maxBytes: number; signal?: AbortSignal | undefined }): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of required.entry.openReadStream({})) {
    required.signal?.throwIfAborted();
    size += chunk.length;
    if (size > required.maxBytes) refuseArchive("Expanded ZIP bytes exceed the manifest or archive cap (possible ZIP bomb).");
    chunks.push(Buffer.from(chunk));
  }
  if (size !== required.entry.declaredSize) refuseArchive("ZIP declared and actual size differ.");
  return Buffer.concat(chunks, size);
}

function validateRawEntry(required: { entry: AgentPluginArchiveEntry; name: string }): void {
  // Validate traversal/aliases even on ignored metadata. Its known OS name and the database
  // extension are placeholders only during the pre-strip path check, never extraction paths.
  validateSharePath({ path: required.name.split("/").map(part => part === ".DS_Store" ? "finder-metadata" : part).join("/").replace(/(^|\/)content\.db$/, "$1content-database") });
  if (required.entry.kind !== "file" && required.entry.kind !== "directory") refuseArchive("ZIP links and special entries are forbidden.");
}
function isManifestEntry(required: { entry: AgentPluginArchiveEntry; name: string }): boolean {
  return required.entry.kind === "file" && /^(?:[^/]+\/)?manifest\.json$/.test(required.name);
}

function claimNormalizedEntries(required: { entries: readonly AgentPluginArchiveEntry[]; claims: EntryClaims; wrapper: string }): void {
  const { entries, claims, wrapper } = required;
  for (const entry of entries) {
    if (entry.kind === "directory" && entry.entryPath.replace(/\/$/, "") === wrapper.slice(0, -1)) continue;
    const entryPath = stripArchiveWrapper({ path: entry.entryPath, wrapper });
    claimEntry({ claims, entry: { ...entry, entryPath } });
  }
}

/** Editable code changes disable their entire unit; data integrity failures always refuse. */
function verifyListedIntegrity(required: { content: Buffer; expected: InventoryRecord; unit: string | undefined; modified: Set<string> | undefined }): void {
  if (required.content.length === required.expected.bytes && sha256Hex(required.content) === required.expected.sha256) return;
  if (!required.unit || !required.modified) refuseArchive("ZIP size or SHA-256 mismatch.");
  required.modified.add(required.unit);
}
