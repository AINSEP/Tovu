import { buildArchiveManifest, ARCHIVE_DATABASE_PATH as SITE_BACKUP_DATABASE_PATH, ARCHIVE_MANIFEST_PATH as SITE_BACKUP_MANIFEST_PATH } from "./archive-manifest.js";
import { runtimeToArchivePath, archiveSecretScanPath } from "./archive-paths.js";
import { createHash } from "node:crypto";
import type { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { readPlannedFile, type PlannedDiskFile } from "./sources.js";
import type { SiteSharePlanContent } from "./plan-store.js";
import { checkShareLimits, SHARE_LIMITS, SiteShareRefusal } from "./share-policy.js";
import { requireShareSecretFree, claimSharePath, type PackageFileInventory } from "./share-file-policy.js";
import type { SiteBackupPushProgress } from "./push-engine.js";
import type { StaticSiteCopy } from "./static-copy.js";
import type { StaticExportTheme } from "./static-export-selection.js";
import { staticDownloadLayout } from "./static-download-layout.js";
import { SAVED_KEYS_PATH } from "./saved-keys-port.js";
import type { CredentialWarning } from "./credential-warnings.js";

type ShareZipEntry = { readonly path: string; readonly content: Buffer };
type ShareZipProgressOptions = { signal?: AbortSignal; progress?: SiteBackupPushProgress; notices?: string[]; credentialWarnings?: CredentialWarning[]; bundledImportPluginIds?: ReadonlySet<string> };
/** The picked Files handed to Jini's encoder and the manifest inventory, in the same order. */
interface CollectedShareEntries { readonly plugins: NonNullable<SiteSharePlanContent["plugins"]>; readonly files: File[]; readonly inventory: { path: string; bytes: number; sha256: string }[]; readonly credentialWarnings: CredentialWarning[] }

/** Buffered media/documents first, then the sanitized database projection when the plan has one. O(entries). */
function inMemoryEntries(required: { plan: SiteSharePlanContent }): ShareZipEntry[] {
  const { plan } = required;
  return [...(plan.bufferedFiles ?? []), ...(plan.database ? [{ path: SITE_BACKUP_DATABASE_PATH, content: plan.database.bytes }] : [])];
}

/** Claims every entry in one alias set for ZIPs and commits; only backups reserve the manifest path. */
export function claimArchivePaths(required: { entries: readonly { path: string }[] }, optional: { manifest?: boolean } = {}): void {
  const aliases = new Map<string, string>(), fileAliases = new Set<string>();
  if (optional.manifest !== false) claimSharePath({ path: SITE_BACKUP_MANIFEST_PATH, directory: false, aliases, files: fileAliases });
  for (const file of required.entries) claimSharePath({ path: file.path, directory: false, aliases, files: fileAliases });
}

/** Abort-checks and secret-scans one entry, then records its picked File, inventory row and progress. O(entry bytes). */
function addEntry(required: { entry: ShareZipEntry; collected: CollectedShareEntries }, optional: ShareZipProgressOptions = {}): void {
  const { entry, collected } = required;
  optional.signal?.throwIfAborted();
  // SQLite is rebuilt by the projection owner; ciphertext is authenticated by Job 2 on restore.
  const structured = entry.path === SITE_BACKUP_DATABASE_PATH || entry.path === SAVED_KEYS_PATH;
  if (!structured) requireShareSecretFree({ path: archiveSecretScanPath({ path: entry.path, plugins: collected.plugins }), bytes: entry.content }, { shownPath: entry.path, credentialWarnings: collected.credentialWarnings });
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
  const manifest = Buffer.from(buildArchiveManifest({ schema: required.plan.schema, site: { name: required.plan.site.name }, scopes: required.plan.include, media: required.plan.media ?? [], plugins: retainedPlugins({ plan: required.plan, inventory: required.inventory }), files: required.inventory,
    ...(required.plan.encryptedKeys ? { encryptedKeys: required.plan.encryptedKeys } : {}),
    ...(required.plan.staticSiteOmitted ? { staticSiteOmitted: required.plan.staticSiteOmitted } : {}) }));
  if (manifest.length > SHARE_LIMITS.maxManifestBytes) throw new SiteShareRefusal({ code: "LIMIT_EXCEEDED", message: "Share manifest exceeds 2 MiB." });
  checkShareLimits({ files: [...required.inventory, { path: SITE_BACKUP_MANIFEST_PATH, bytes: manifest.length }] });
  return new File([manifest], SITE_BACKUP_MANIFEST_PATH);
}

function retainedPlugins(required: { plan: SiteSharePlanContent; inventory: CollectedShareEntries["inventory"] }, _options = {}) {
  return (required.plan.plugins ?? []).filter(plugin => required.inventory.some(file => file.path.startsWith(`${plugin.kind === "agent" ? "agent-plugins" : "plugins"}/${plugin.id}/package/`)));
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
 * @throws SiteShareRefusal for stale files, unsafe aliases, cancellation, and archive caps. Credential-looking files are included with warnings.
 * @complexity O(payload bytes + paths²), at most 2,000 paths; O(payload bytes) memory, bounded to 300 MiB.
 */
async function buildShareZipContent(required: { plan: SiteSharePlanContent; zip: typeof zipFolderFiles }, optional: ShareZipProgressOptions & { packageFiles?: PackageFileInventory } = {}): Promise<Buffer> {
  const { plan } = required;
  const memory = inMemoryEntries({ plan });
  const sizes = [...plan.files, ...memory.map(file => ({ path: file.path, bytes: file.content.length }))];
  checkShareLimits({ files: sizes, totalBytes: plan.totalBytes });
  const paths = [...plan.files.flatMap(file => { const path = runtimeToArchivePath({ path: file.path }); return path === null ? [] : [{ path }]; }), ...memory];
  claimArchivePaths({ entries: paths });
  if (optional.progress) Object.assign(optional.progress, { filesTotal: paths.length, bytesTotal: sizes.reduce((sum, file) => sum + file.bytes, 0) });
  const collected: CollectedShareEntries = { files: [], inventory: [], plugins: plan.plugins ?? [], credentialWarnings: optional.credentialWarnings ?? [] };
  for (const entry of memory) addEntry({ entry, collected }, optional);
  await addDiskFiles({ files: plan.files, collected }, optional);
  collected.files.push(buildManifestFile({ plan, inventory: collected.inventory }));
  optional.signal?.throwIfAborted();
  return encodeShareZip({ files: collected.files, zip: required.zip });
}

/** Full Tovu backups contain portable source content only. Legacy callers may still supply a
 * capture for omission diagnostics; its render/scan/size failures must never block the backup.
 * Reuses the existing collector and encoder, including every path, secret and archive limit check. */
export async function buildShareZip(required: { plan: SiteSharePlanContent; zip: typeof zipFolderFiles }, optional: ShareZipProgressOptions & { packageFiles?: PackageFileInventory; staticCopy?: StaticSiteCopy } = {}): Promise<Buffer> {
  const omitted = staticCopyOmission({ copy: optional.staticCopy });
  const plan = omitted ? { ...required.plan, staticSiteOmitted: omitted } : required.plan;
  return buildShareZipContent({ ...required, plan }, optional);
}

/** Preserve older callers' omission explanations without adding any rendered file or inventory row. */
function staticCopyOmission({ copy }: { copy?: StaticSiteCopy }, _options = {}): string | undefined {
  if (!copy) return undefined;
  if ("reason" in copy) return copy.reason;
  return undefined;
}

/** Static-only ZIP uses the same picked-file path/scanning pipeline and Jini encoder, without a backup manifest. */
export async function buildStaticSiteZip(required: { copy: Exclude<StaticSiteCopy, { reason: string }>; copies?: readonly Exclude<StaticSiteCopy, { reason: string }>[]; activeThemeId?: string; themes?: readonly StaticExportTheme[]; zip: typeof zipFolderFiles }, optional: ShareZipProgressOptions = {}): Promise<Buffer> {
  const folder = required.copy.filename.replace(/\.zip$/i, "");
  const entries = staticDownloadLayout(required).map(file => ({ ...file, path: `${folder}/${file.path}` }));
  checkShareLimits({ files: entries.map(file => ({ path: file.path, bytes: file.content.length })) });
  claimArchivePaths({ entries }, { manifest: false });
  if (optional.progress) Object.assign(optional.progress, { filesTotal: entries.length, bytesTotal: entries.reduce((sum, file) => sum + file.content.length, 0) });
  const collected: CollectedShareEntries = { files: [], inventory: [], plugins: [], credentialWarnings: optional.credentialWarnings ?? [] };
  for (const entry of entries) addEntry({ entry, collected }, optional);
  return encodeShareZip({ files: collected.files, zip: required.zip });
}
