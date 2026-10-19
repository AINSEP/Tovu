import { createHash } from "node:crypto";
import type { AgentPluginArchiveEntry, AgentPluginArchiveReaderPort } from "@jini-ai/agent-plugins/lifecycle";
import { checkShareLimits, SHARE_LIMITS, SiteShareRefusal, type ShareDatabaseSanitizer } from "./share-policy.js";
import { validateSharePath, excludedSharePath, requireShareSecretFree, claimSharePath, sharePathAlias } from "./share-file-policy.js";
import { SITE_BACKUP_MANIFEST_PATH, SITE_BACKUP_DATABASE_PATH } from "./sources.js";
import { validateDocumentIngress } from "#src/features/media/index";
import { createDocumentArchiveReader } from "#src/features/media/document-archive";

export interface VerifiedSiteImport {
  name: string;
  database: Buffer;
  files: Map<string, Buffer>;
}
function refuse(message: string): never { throw new SiteShareRefusal({ code: "INVALID_ARCHIVE", message }); }

/** Read the bounded root manifest in a metadata-only first pass; never trust ZIP ordering.
 * Then verify the exact inventory and hashes, count actual expanded bytes, and ask the isolated
 * database adapter to rebuild through A's SAME sanitizer. No extraction occurs before success.
 * @throws SiteShareRefusal for malformed, unsupported, incomplete or oversized archives.
 * @complexity O(payload bytes + paths²), at most 2,000 paths/300 MiB; buffered v1.
 */
export async function verifySiteImport(required: { archive: Buffer; reader: AgentPluginArchiveReaderPort; sanitize: ShareDatabaseSanitizer; schema: { index: number; tag: string } }, optional: { signal?: AbortSignal } = {}): Promise<VerifiedSiteImport> {
  const { archive, reader } = required;
  if (archive.length > SHARE_LIMITS.maxArchiveBytes) refuse("Import exceeds the v1 300 MiB archive cap.");
  optional.signal?.throwIfAborted();
  let manifestBytes: Buffer | undefined;
  const aliases = new Map<string, string>(), fileAliases = new Set<string>(), directories = new Set<string>();
  const sizes: { path: string; bytes: number }[] = [];
  let count = 0;
  for await (const entry of reader.entries({ archive })) {
    optional.signal?.throwIfAborted();
    if (++count > SHARE_LIMITS.maxFiles) refuse("Import exceeds the v1 2,000-entry cap.");
    if (entry.kind !== "file" && entry.kind !== "directory") refuse("ZIP links and special entries are forbidden.");
    const directory = entry.kind === "directory";
    const name = directory ? entry.entryPath.replace(/\/$/, "") : entry.entryPath;
    claimSharePath({ path: name, directory, aliases, files: fileAliases });
    if (directory) {
      if (directories.has(name) || fileAliases.has(sharePathAlias({ path: name }))) refuse("Duplicate directory or file/directory collision.");
      directories.add(name);
      continue;
    }
    if (directories.has(name)) refuse("ZIP file/directory collision.");
    const size = entry.declaredSize;
    if (!Number.isSafeInteger(size) || size! < 0) refuse("ZIP has an invalid declared size.");
    sizes.push({ path: name, bytes: size! });
    checkShareLimits({ files: sizes });
    if (name === SITE_BACKUP_MANIFEST_PATH) manifestBytes = await readBounded({ entry, maxBytes: SHARE_LIMITS.maxManifestBytes, signal: optional.signal });
  }
  if (!manifestBytes) refuse("Root tovu-backup.json manifest is required.");
  let manifest: any;
  try { manifest = JSON.parse(manifestBytes.toString("utf8")); } catch { refuse("Invalid share manifest JSON."); }
  const schema = required.schema;
  // Library added columns, not a new manifest identity. Historical database compatibility
  // belongs to the worker's trusted schema matcher, never invented migration-ID aliases.
  const schemaSupported = manifest?.schema?.index === schema.index && manifest?.schema?.tag === schema.tag;
  if (manifest?.format !== "tovu-site-backup" || manifest.formatVersion !== 1 || manifest.profile !== "share" || manifest.sanitizationVersion !== 1 ||
      !schemaSupported ||
      manifest.database?.engine !== "sqlite" || manifest.database?.path !== SITE_BACKUP_DATABASE_PATH ||
      !Array.isArray(manifest.files) || manifest.files.length + 1 > SHARE_LIMITS.maxFiles ||
      typeof manifest.site?.name !== "string" || !manifest.site.name.trim() || manifest.site.name.length > 200) refuse("Unsupported share format/profile/version, schema identity, database or site name.");
  const inventory = new Map<string, { bytes: number; sha256: string }>();
  for (const file of manifest.files) {
    if (!file || typeof file.path !== "string" || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) refuse("Invalid manifest file record.");
    validateSharePath({ path: file.path });
    if (inventory.has(file.path) || file.path === SITE_BACKUP_MANIFEST_PATH) refuse("Duplicate manifest file.");
    if (file.path !== SITE_BACKUP_DATABASE_PATH && (excludedSharePath({ path: file.path }) ||
        !/^(?:uploads|themes|plugins|agent-plugins|skills|overrides)\/.+/.test(file.path) && !["settings/config.json", "settings/.site-meta.json"].includes(file.path))) refuse("Unrecognized or private file in share inventory.");
    inventory.set(file.path, file);
  }
  if (inventory.size + 1 !== fileAliases.size || !inventory.has(SITE_BACKUP_DATABASE_PATH)) refuse("ZIP inventory differs from the manifest.");
  for (const dir of directories) if (![...inventory.keys()].some(file => file.startsWith(dir + "/"))) refuse("Unlisted ZIP directory.");
  const files = new Map<string, Buffer>();
  let expanded = manifestBytes.length;
  for await (const entry of reader.entries({ archive })) {
    if (entry.kind !== "file" || entry.entryPath === SITE_BACKUP_MANIFEST_PATH) continue;
    const expected = inventory.get(entry.entryPath);
    if (!expected || expected.bytes !== entry.declaredSize) refuse("Unlisted ZIP file or size mismatch.");
    const content = await readBounded({ entry, maxBytes: Math.min(expected.bytes, SHARE_LIMITS.maxExpandedBytes - expanded), signal: optional.signal });
    expanded += content.length;
    if (content.length !== expected.bytes || createHash("sha256").update(content).digest("hex") !== expected.sha256) refuse("ZIP size or SHA-256 mismatch.");
    if (entry.entryPath !== SITE_BACKUP_DATABASE_PATH) requireShareSecretFree({ path: entry.entryPath, bytes: content });
    files.set(entry.entryPath, content);
  }
  const projection = await required.sanitize({ snapshot: files.get(SITE_BACKUP_DATABASE_PATH)! }, { signal: optional.signal });
  const referencedMedia = new Set(projection.media.map(media => "uploads/" + media.storageKey));
  const documentKeys = new Set(projection.documents?.map(document => document.storageKey));
  for (const key of projection.excludedBlobKeys ?? []) {
    const file = "uploads/" + key;
    validateSharePath({ path: file });
    if (!referencedMedia.has(file)) files.delete(file);
  }
  for (const file of files.keys()) if (file.startsWith("uploads/") && !referencedMedia.has(file)) refuse("Unreferenced uploads are outside the portable share media policy.");
  for (const media of projection.media) {
    validateSharePath({ path: "uploads/" + media.storageKey });
    const content = files.get("uploads/" + media.storageKey);
    if (!content || media.sha256 && createHash("sha256").update(content).digest("hex") !== media.sha256) refuse(documentKeys.has(media.storageKey) ? "Referenced document blob is missing or corrupt." : "Referenced media is missing or failed its hash.");
  }
  const archiveReader = createDocumentArchiveReader({});
  for (const document of projection.documents ?? []) {
    optional.signal?.throwIfAborted();
    const content = files.get("uploads/" + document.storageKey);
    if (!content || createHash("sha256").update(content).digest("hex") !== document.sha256) refuse("Referenced document blob is missing or corrupt.");
    // A valid outer ZIP checksum cannot grant document admission. Reuse upload policy,
    // including bounded DOCX package validation, before staging or creating the new site.
    try { await validateDocumentIngress({ filename: document.originalFilename, bytes: content }, { archiveReader }); }
    catch (error) { refuse(`Invalid Library document: ${error instanceof Error ? error.message : "document ingress rejected"}`); }
  }
  // The isolated DB owner has already remapped document keys to the new workspace. Move only
  // fully verified bytes, once per source key, and refuse any conflicting destination claim.
  const moves = new Map(projection.media.filter(media => media.destinationStorageKey && media.destinationStorageKey !== media.storageKey).map(media => ["uploads/" + media.storageKey, "uploads/" + media.destinationStorageKey]));
  for (const [source, destination] of moves) {
    validateSharePath({ path: destination });
    const bytes = files.get(source)!;
    if (files.has(destination) && !files.get(destination)!.equals(bytes)) refuse("Conflicting imported document blob keys.");
    files.set(destination, bytes);
    files.delete(source);
  }
  files.delete(SITE_BACKUP_DATABASE_PATH);
  checkShareLimits({ files: [...files].map(([path, content]) => ({ path, bytes: content.length })).concat({ path: SITE_BACKUP_DATABASE_PATH, bytes: projection.bytes.length }) });
  return { name: manifest.site.name.trim(), database: projection.bytes, files };
}

/** Count decompressed bytes before retaining each chunk; metadata is never a memory budget. */
async function readBounded(required: { entry: Extract<AgentPluginArchiveEntry, { kind: "file" }>; maxBytes: number; signal?: AbortSignal }): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of required.entry.openReadStream({})) {
    required.signal?.throwIfAborted();
    size += chunk.length;
    if (size > required.maxBytes) refuse("Expanded ZIP bytes exceed the manifest or v1 cap (possible ZIP bomb).");
    chunks.push(Buffer.from(chunk));
  }
  if (size !== required.entry.declaredSize) refuse("ZIP declared and actual size differ.");
  return Buffer.concat(chunks, size);
}
