import path from "node:path";
import type { BlobStorePort } from "#src/features/media/index";
import type { DbOpsPort } from "#src/contracts/core/gated-mutations/ports";
import { runtimeSchemaVersion } from "#src/platform/site-dir/index";
import type { SiteBackupSources } from "./sources.js";
import { checkShareLimits, type ShareDatabaseSanitizer } from "./share-policy.js";
import type { SiteSharePlanContent } from "./plan-store.js";
import { addPortableSettings, bufferReferencedMedia, captureProjectedDatabase, collectShareFiles, type ShareLedger } from "./share-preparation-steps.js";

/**
 * Same consistent snapshot and collector as a repository backup, with a fresh DB projection and
 * regenerated portable settings. Media comes ONLY from snapshot records through the blob-store
 * owner, so object-storage sites work and unreferenced/chat upload bytes cannot ride along.
 * @complexity O(site entries + snapshot + referenced blob bytes), bounded by v1 caps.
 */
export async function prepareShareContent(required: { dbOps: DbOpsPort; sources: SiteBackupSources; sanitize: ShareDatabaseSanitizer; blobStore: Pick<BlobStorePort, "get" | "sizeOf"> }, optional: { signal?: AbortSignal } = {}): Promise<SiteSharePlanContent> {
  optional.signal?.throwIfAborted();
  const { projected, watermarkAtCapture } = await captureProjectedDatabase(required, optional);
  const include = { database: true, media: true, themes: true, plugins: true, settings: true };
  const collected = await collectShareFiles({ sources: required.sources, include });
  const files = collected.files.filter(file => file.scope !== "settings");
  const ledger: ShareLedger = { sizes: [...files.map(file => ({ path: file.path, bytes: file.bytes })), { path: "database/content.db", bytes: projected.bytes.length }], buffered: [] };
  checkShareLimits({ files: ledger.sizes });
  await bufferReferencedMedia({ projected, blobStore: required.blobStore, ledger }, optional);
  const name = await addPortableSettings({ files: collected.files, siteDir: required.sources.siteDir, ledger });
  return { target: { kind: "zip" }, profile: "share", include, database: { bytes: projected.bytes, watermarkAtCapture }, files, bufferedFiles: ledger.buffered, skipped: [], scopeNotes: {}, totalBytes: ledger.sizes.reduce((sum, file) => sum + file.bytes, 0), site: { name, folderName: path.basename(required.sources.siteDir) }, schema: runtimeSchemaVersion(), tovuVersion: required.sources.tovuVersion, createdAt: new Date().toISOString() };
}
