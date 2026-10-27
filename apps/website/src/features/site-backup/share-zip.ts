import { buildArchiveManifest, ARCHIVE_DATABASE_PATH as SITE_BACKUP_DATABASE_PATH, ARCHIVE_MANIFEST_PATH as SITE_BACKUP_MANIFEST_PATH } from "./archive-manifest.js";
import { runtimeToArchivePath, archiveSecretScanPath } from "./archive-paths.js";
import { createHash } from "node:crypto";
import type { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { readPlannedFile, type PlannedDiskFile } from "./sources.js";
import type { SiteSharePlanContent } from "./plan-store.js";
import { checkShareLimits, SHARE_LIMITS, SiteShareRefusal } from "./share-policy.js";
import { requireShareSecretFree, claimSharePath, type PackageFileInventory } from "./share-file-policy.js";
import { readBundledPackageFiles } from "./package-file-inventory.js";
import type { SiteBackupPushProgress } from "./push-engine.js";

type ShareZipEntry = { readonly path: string; readonly content: Buffer };
type ShareZipProgressOptions = { signal?: AbortSignal; progress?: SiteBackupPushProgress };
/** The picked Files handed to Jini's encoder and the manifest inventory, in the same order. */
interface CollectedShareEntries { readonly plugins: NonNullable<SiteSharePlanContent["plugins"]>; readonly files: File[]; readonly inventory: { path: string; bytes: number; sha256: string }[]; readonly packageFiles: PackageFileInventory }

/** Buffered media/documents first, then the sanitized database projection when the plan has one. O(entries). */
function inMemoryEntries(required: { plan: SiteSharePlanContent }): ShareZipEntry[] {
  const { plan } = required;
  return [...(plan.bufferedFiles ?? []), ...(plan.database ? [{ path: SITE_BACKUP_DATABASE_PATH, content: plan.database.bytes }] : [])];
}

/** Claims the manifest path and every entry path in one archive-wide alias set before any content is read. */
function claimArchivePaths(required: { entries: readonly { path: string }[] }): void {
  const aliases = new Map<string, string>(), fileAliases = new Set<string>();
  claimSharePath({ path: SITE_BACKUP_MANIFEST_PATH, directory: false, aliases, files: fileAliases });
  for (const file of required.entries) claimSharePath({ path: file.path, directory: false, aliases, files: fileAliases });
}

/** Abort-checks and secret-scans one entry, then records its picked File, inventory row and progress. O(entry bytes). */
function addEntry(required: { entry: ShareZipEntry; collected: CollectedShareEntries }, optional: ShareZipProgressOptions = {}): void {
  const { entry, collected } = required;
  optional.signal?.throwIfAborted();
  requireShareSecretFree({ path: archiveSecretScanPath({ path: entry.path, plugins: collected.plugins }), bytes: entry.content }, { packageFiles: collected.packageFiles, shownPath: entry.path });
  // Node File accepts Buffer directly; the DOM type omits potentially shared-backed views.
  // This assertion preserves the bytes without allocating a second Uint8Array.
  const picked = new File([entry.content as ConstructorParameters<typeof File>[0][number]], entry.path.split("/").at(-1)!);
  // Jini's picker encoder strips the selected folder's name. Supply that same picker contract
  // explicitly so archive paths keep their first scope segment (media/, themes/, plugins/).
  Object.defineProperty(picked, "webkitRelativePath", { value: `share/${entry.path}` });
  collected.files.push(picked);
  collected.inventory.push({ path: entry.path, bytes: entry.content.length, sha256: createHash("sha256").update(entry.content).digest("hex") });
  if (optional.progress) { optional.progress.filesDone++; optional.progress.bytesDone += entry.content.length; }
}

/** Reads each planned disk file in order and adds it; refuses PLAN_STALE when one changed since the plan. */
async function addDiskFiles(required: { files: readonly PlannedDiskFile[]; collected: CollectedShareEntries }, optional: ShareZipProgressOptions = {}): Promise<void> {
  for (const file of required.files) {
    const loaded = await readPlannedFile(file);
    if (!loaded.ok) throw new SiteShareRefusal({ code: "PLAN_STALE", message: loaded.message });
    const archivePath = runtimeToArchivePath({ path: file.path });
    if (archivePath !== null) addEntry({ entry: { path: archivePath, content: loaded.bytes }, collected: required.collected }, optional);
  }
}

/** The manifest File over the final inventory; refused when it exceeds 2 MiB or, counted in, the archive caps. */
function buildManifestFile(required: { plan: SiteSharePlanContent; inventory: CollectedShareEntries["inventory"] }): File {
  // Count the manifest as an entry first: the manifest validator would otherwise refuse a full
  // share as INVALID_ARCHIVE instead of telling the owner it is over the file cap.
  checkShareLimits({ files: [...required.inventory, { path: SITE_BACKUP_MANIFEST_PATH, bytes: 0 }] });
  const manifest = Buffer.from(buildArchiveManifest({ schema: required.plan.schema, site: { name: required.plan.site.name }, scopes: required.plan.include, media: required.plan.media ?? [], plugins: required.plan.plugins ?? [], files: required.inventory }));
  if (manifest.length > SHARE_LIMITS.maxManifestBytes) throw new SiteShareRefusal({ code: "LIMIT_EXCEEDED", message: "Share manifest exceeds 2 MiB." });
  checkShareLimits({ files: [...required.inventory, { path: SITE_BACKUP_MANIFEST_PATH, bytes: manifest.length }] });
  return new File([manifest], SITE_BACKUP_MANIFEST_PATH);
}

/** Encodes the picked Files with Jini, reporting its size/count failures as the archive cap. */
async function encodeShareZip(required: { files: readonly File[]; zip: typeof zipFolderFiles }): Promise<Buffer> {
  // Jini adds ZIP header overhead to the same archive cap before allocating the final File.
  try { return Buffer.from(await (await required.zip({ files: required.files, maxBytes: SHARE_LIMITS.maxArchiveBytes })).arrayBuffer()); }
  catch (error) {
    if (error instanceof Error && /limit|large|many/i.test(error.message)) throw new SiteShareRefusal({ code: "LIMIT_EXCEEDED", message: "Share exceeds the 300 MiB ZIP archive cap." });
    throw error;
  }
}

/**
 * The ZIP target of the common backup content plan. Calls Jini's buffered binary-safe encoder;
 * checks the exact sanitized bytes and builds the v2 ZIP manifest over its exact bytes. The repository target retains its contract.
 * @throws SiteShareRefusal for stale files, unsafe aliases, secrets, cancellation, and archive caps.
 * @complexity O(payload bytes + paths²), at most 2,000 paths; O(payload bytes) memory, bounded to 300 MiB.
 */
export async function buildShareZip(required: { plan: SiteSharePlanContent; zip: typeof zipFolderFiles }, optional: ShareZipProgressOptions & { packageFiles?: PackageFileInventory } = {}): Promise<Buffer> {
  const { plan } = required;
  const memory = inMemoryEntries({ plan });
  const sizes = [...plan.files, ...memory.map(file => ({ path: file.path, bytes: file.content.length }))];
  checkShareLimits({ files: sizes, totalBytes: plan.totalBytes });
  const paths = [...plan.files.flatMap(file => { const path = runtimeToArchivePath({ path: file.path }); return path === null ? [] : [{ path }]; }), ...memory];
  claimArchivePaths({ entries: paths });
  const collected: CollectedShareEntries = { files: [], inventory: [], plugins: plan.plugins ?? [], packageFiles: optional.packageFiles ?? await readBundledPackageFiles() };
  for (const entry of memory) addEntry({ entry, collected }, optional);
  await addDiskFiles({ files: plan.files, collected }, optional);
  collected.files.push(buildManifestFile({ plan, inventory: collected.inventory }));
  optional.signal?.throwIfAborted();
  return encodeShareZip({ files: collected.files, zip: required.zip });
}
