import type { AgentPluginArchiveReaderPort } from "@jini-ai/agent-plugins/lifecycle";
import { checkShareLimits, SHARE_LIMITS, type ShareDatabaseSanitizer } from "./share-policy.js";
import { SITE_BACKUP_DATABASE_PATH } from "./sources.js";
import { buildManifestInventory, checkArchiveMatchesInventory, parseShareManifest, readListedFiles, refuseArchive, scanArchiveMetadata } from "./import-verifier-inventory.js";
import { applyShareProjection } from "./import-verifier-projection.js";
import { readBundledPackageFiles } from "./package-file-inventory.js";
import type { PackageFileInventory } from "./share-file-policy.js";

export interface VerifiedSiteImport {
  name: string;
  database: Buffer;
  files: Map<string, Buffer>;
}

/** Read the bounded root manifest in a metadata-only first pass; never trust ZIP ordering.
 * Then verify the exact inventory and hashes, count actual expanded bytes, and ask the isolated
 * database adapter to rebuild through A's SAME sanitizer. No extraction occurs before success.
 * @throws SiteShareRefusal for malformed, unsupported, incomplete or oversized archives.
 * @complexity O(payload bytes + paths²), at most 2,000 paths/300 MiB; buffered v1.
 */
export async function verifySiteImport(required: { archive: Buffer; reader: AgentPluginArchiveReaderPort; sanitize: ShareDatabaseSanitizer; schema: { index: number; tag: string } }, optional: { signal?: AbortSignal; packageFiles?: PackageFileInventory } = {}): Promise<VerifiedSiteImport> {
  const { archive, reader } = required;
  if (archive.length > SHARE_LIMITS.maxArchiveBytes) refuseArchive("Import exceeds the v1 300 MiB archive cap.");
  optional.signal?.throwIfAborted();
  const scan = await scanArchiveMetadata({ archive, reader }, optional);
  const manifest = parseShareManifest({ manifestBytes: scan.manifestBytes, schema: required.schema });
  const inventory = buildManifestInventory({ files: manifest.files });
  checkArchiveMatchesInventory({ inventory, fileAliases: scan.fileAliases, directories: scan.directories });
  // Package files are verified against THIS build's bundled sources, exactly as on export.
  const packageFiles = optional.packageFiles ?? await readBundledPackageFiles();
  const files = await readListedFiles({ archive, reader, inventory, manifestBytes: scan.manifestBytes }, { ...optional, packageFiles });
  const projection = await required.sanitize({ snapshot: files.get(SITE_BACKUP_DATABASE_PATH)! }, { signal: optional.signal });
  await applyShareProjection({ files, projection }, optional);
  files.delete(SITE_BACKUP_DATABASE_PATH);
  checkShareLimits({ files: [...files].map(([path, content]) => ({ path, bytes: content.length })).concat({ path: SITE_BACKUP_DATABASE_PATH, bytes: projection.bytes.length }) });
  return { name: manifest.site.name.trim(), database: projection.bytes, files };
}
