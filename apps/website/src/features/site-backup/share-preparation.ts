import path from "node:path";
import { SAVED_KEYS_PATH, ENCRYPTED_KEYS_DESCRIPTOR, type SiteSavedKeysPort } from "./saved-keys-port.js";
import { addBuffered } from "./share-preparation-steps.js";
import type { BlobStorePort, ImageTransformerPort } from "#src/features/media/index";
import type { DbOpsPort } from "#src/contracts/core/gated-mutations/ports";
import { runtimeSchemaVersion } from "#src/platform/site-dir/index";
import type { SiteBackupSources } from "./sources.js";
import { checkShareLimits, type ShareDatabaseSanitizer } from "./share-policy.js";
import { bufferArchiveMedia, type ArchiveMediaRewriter } from "./archive-media.js";
import { prepareArchiveExtensions } from "./archive-extensions.js";
import { SiteShareRefusal } from "./share-policy.js";
import type { SiteSharePlanContent } from "./plan-store.js";
import { addPortableSettings, captureProjectedDatabase, collectShareFiles, type ShareLedger } from "./share-preparation-steps.js";

/**
 * Same consistent snapshot and collector as a repository backup, with a fresh DB projection and
 * regenerated portable settings. Media comes ONLY from snapshot records through the blob-store
 * owner, so object-storage sites work and unreferenced/chat upload bytes cannot ride along.
 * `snapshotRoot` is the injected private folder the database snapshot lands in (never the source site).
 * @complexity O(site entries + snapshot + referenced blob bytes), bounded by archive caps.
 */
export async function prepareShareContent(required: { dbOps: DbOpsPort; snapshotRoot: string; sources: SiteBackupSources; sanitize: ShareDatabaseSanitizer; blobStore: Pick<BlobStorePort, "get" | "sizeOf">; imageTransformer: ImageTransformerPort; rewriteMedia: ArchiveMediaRewriter; savedKeys?: Pick<SiteSavedKeysPort, "capture">; shareId?: string; workspaceId?: string; includeSavedKeys?: boolean }, optional: { signal?: AbortSignal; packageThemesRoot?: string } = {}): Promise<SiteSharePlanContent> {
  optional.signal?.throwIfAborted();
  const { projected, watermarkAtCapture, savedKeys } = await captureProjectedDatabase(required, optional);
  const include = { database: true, media: true, themes: true, plugins: true, settings: true };
  const collected = await collectShareFiles({ sources: required.sources, include });
  const extensions = await prepareArchiveExtensions({ sources: required.sources, files: collected.files.filter(file => file.scope !== "settings") }, optional);
  const files = extensions.files;
  const notices = preparationNotices({ projected, collected, savedKeys });
  notices.push(...(extensions.notices ?? []));
  const ledger: ShareLedger = { notices, sizes: [...files.map(file => ({ path: file.path, bytes: file.bytes })), { path: "content.db", bytes: projected.bytes.length }], buffered: [] };
  checkShareLimits({ files: ledger.sizes });
  if (!projected.archiveMedia && projected.media.length) throw new SiteShareRefusal({ code: "INVALID_MEDIA", message: "Share projection has no archive media metadata." });
  const copies = await bufferArchiveMedia({ sources: projected.archiveMedia ?? [], blobStore: required.blobStore, imageTransformer: required.imageTransformer, ledger }, optional);
  const bytes = await required.rewriteMedia({ bytes: projected.bytes, copies }, optional);
  ledger.sizes.find(file => file.path === "content.db")!.bytes = bytes.length;
  checkShareLimits({ files: ledger.sizes });
  if (savedKeys) addBuffered({ ledger, file: { path: SAVED_KEYS_PATH, content: savedKeys.encryptedKeys } });
  const name = await addPortableSettings({ files: collected.files, siteDir: required.sources.siteDir, ledger });
  return { target: { kind: "zip" }, profile: "share", include, notices, credentialWarnings: projected.credentialWarnings ?? [], ...(savedKeys ? { encryptedKeys: ENCRYPTED_KEYS_DESCRIPTOR, sealedPassword: savedKeys.sealedPassword } : {}), media: copies.map(({ id, slug, path, sha256 }) => ({ id, slug, path, sha256 })), plugins: extensions.plugins, database: { bytes, watermarkAtCapture }, files, bufferedFiles: ledger.buffered, skipped: [], scopeNotes: collected.scopeNotes, totalBytes: ledger.sizes.reduce((sum, file) => sum + file.bytes, 0), site: { name, folderName: path.basename(required.sources.siteDir) }, schema: runtimeSchemaVersion(), tovuVersion: required.sources.tovuVersion, createdAt: new Date().toISOString() };
}

/** Boundaries return independent notice lists; assembly owns the combined operation-local list. */
function preparationNotices(required: { projected: { notices?: readonly string[] }; collected: { notices?: readonly string[] }; savedKeys?: { notices: readonly string[] } }, _options = {}): string[] {
  return [...(required.projected.notices ?? []), ...(required.collected.notices ?? []), ...(required.savedKeys?.notices ?? [])];
}
