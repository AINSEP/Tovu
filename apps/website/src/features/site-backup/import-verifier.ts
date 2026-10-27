import type { AgentPluginArchiveReaderPort } from "@jini-ai/agent-plugins/lifecycle";
import { checkShareLimits, SHARE_LIMITS, type ShareDatabaseSanitizer } from "./share-policy.js";
import { ARCHIVE_DATABASE_PATH as SITE_BACKUP_DATABASE_PATH, type ArchivePlugin } from "./archive-manifest.js";
import { archiveToRuntimePath, editedArchiveWarnings } from "./archive-paths.js";
import { sha256Hex } from "./import-verifier-inventory.js";
import { buildManifestInventory, checkArchiveMatchesInventory, parseShareManifest, readListedFiles, refuseArchive, scanArchiveMetadata } from "./import-verifier-inventory.js";
import { applyShareProjection } from "./import-verifier-projection.js";
import { readBundledPackageFiles } from "./package-file-inventory.js";
import type { PackageFileInventory } from "./share-file-policy.js";

export interface VerifiedSiteImport {
  name: string;
  database: Buffer;
  files: Map<string, Buffer>;
  warnings: string[];
  modified: ReadonlySet<string>;
  plugins: readonly ArchivePlugin[];
  trustedPlugins: readonly ArchivePlugin[];
}

/** Read the bounded root manifest in a metadata-only first pass; never trust ZIP ordering.
 * Then verify the exact inventory and hashes, count actual expanded bytes, and ask the isolated
 * database adapter to rebuild through A's SAME sanitizer. No extraction occurs before success.
 * @throws SiteShareRefusal for malformed, unsupported, incomplete or oversized archives.
 * @complexity O(payload bytes + paths²), at most 2,000 paths/300 MiB; buffered archive.
 */
export async function verifySiteImport(required: { archive: Buffer; reader: AgentPluginArchiveReaderPort; sanitize: ShareDatabaseSanitizer; schema: { index: number; tag: string } }, optional: { signal?: AbortSignal; packageFiles?: PackageFileInventory } = {}): Promise<VerifiedSiteImport> {
  const { archive, reader } = required;
  if (archive.length > SHARE_LIMITS.maxArchiveBytes) refuseArchive("Import exceeds the 300 MiB archive cap.");
  optional.signal?.throwIfAborted();
  const scan = await scanArchiveMetadata({ archive, reader }, optional);
  const manifest = parseShareManifest({ manifestBytes: scan.manifestBytes, schema: required.schema });
  const inventory = buildManifestInventory({ files: manifest.files });
  checkArchiveMatchesInventory({ inventory, fileAliases: scan.fileAliases, directories: scan.directories });
  // Package files are verified against THIS build's bundled sources, exactly as on export.
  const packageFiles = optional.packageFiles ?? await readBundledPackageFiles();
  const modified = new Set<string>();
  const files = await readListedFiles({ archive, reader, inventory, manifestBytes: scan.manifestBytes, wrapper: scan.wrapper, manifest, modified }, { ...optional, packageFiles });
  const trustedPlugins = manifest.plugins.filter(plugin => bundledIdentical({ plugin, files, packageFiles, modified }));
  const projection = await required.sanitize({ snapshot: files.get(SITE_BACKUP_DATABASE_PATH)! }, { signal: optional.signal });
  await applyShareProjection({ files, projection, manifest }, optional);
  files.delete(SITE_BACKUP_DATABASE_PATH);
  checkShareLimits({ files: [...files].map(([path, content]) => ({ path, bytes: content.length })).concat({ path: SITE_BACKUP_DATABASE_PATH, bytes: projection.bytes.length }) });
  const runtimeFiles = new Map([...files].map(([path, bytes]) => [archiveToRuntimePath({ path, files }), bytes]));
  const warnings = editedArchiveWarnings({ units: modified });
  return { name: manifest.site.name.trim(), database: projection.bytes, files: runtimeFiles, warnings, modified, plugins: manifest.plugins, trustedPlugins };
}

/** A manifest digest alone grants nothing: compare the entire shipped package to this build. */
function bundledIdentical(required: { plugin: ArchivePlugin; files: ReadonlyMap<string, Buffer>; packageFiles: PackageFileInventory; modified: ReadonlySet<string> }): boolean {
  const { plugin } = required;
  if (plugin.kind !== "agent" || required.modified.has("agent-plugins/" + plugin.id)) return false;
  const expected = required.packageFiles.get(plugin.digest);
  if (!expected) return false;
  const prefix = `agent-plugins/${plugin.id}/package/`;
  const actual = [...required.files].filter(([path]) => path.startsWith(prefix));
  return actual.length === expected.size && actual.every(([path, bytes]) => expected.get(path.slice(prefix.length)) === sha256Hex(bytes));
}
