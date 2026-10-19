import { createHash } from "node:crypto";
import path from "node:path";
import { MAX_DOCUMENT_BYTES, type BlobStorePort } from "#src/features/media/index";
import type { DbOpsPort } from "#src/contracts/core/gated-mutations/ports";
import { runtimeSchemaVersion } from "#src/platform/site-dir/index";
import { captureDatabaseSnapshot, collectSiteBackupFiles, readPlannedFile, type PlannedDiskFile, type SiteBackupSources } from "./sources.js";
import { checkShareLimits, SHARE_LIMITS, SiteShareRefusal, type ShareDatabaseSanitizer } from "./share-policy.js";
import { validateSharePath } from "./share-file-policy.js";
import type { SiteSharePlanContent } from "./plan-store.js";

/**
 * Same consistent snapshot and collector as a repository backup, with a fresh DB projection and
 * regenerated portable settings. Media comes ONLY from snapshot records through the blob-store
 * owner, so object-storage sites work and unreferenced/chat upload bytes cannot ride along.
 * @complexity O(site entries + snapshot + referenced blob bytes), bounded by v1 caps.
 */
export async function prepareShareContent(required: { dbOps: DbOpsPort; sources: SiteBackupSources; sanitize: ShareDatabaseSanitizer; blobStore: Pick<BlobStorePort, "get" | "sizeOf"> }, optional: { signal?: AbortSignal } = {}): Promise<SiteSharePlanContent> {
  optional.signal?.throwIfAborted();
  let snapshot: Awaited<ReturnType<typeof captureDatabaseSnapshot>> | undefined = await captureDatabaseSnapshot({ dbOps: required.dbOps, scopeId: "site-share" }, { maxBytes: SHARE_LIMITS.maxExpandedBytes });
  if (!snapshot.ok) throw new SiteShareRefusal({ code: "DATABASE_SNAPSHOT_FAILED", message: snapshot.message });
  const watermarkAtCapture = snapshot.watermarkAtCapture;
  const projected = await required.sanitize({ snapshot: snapshot.bytes }, { signal: optional.signal });
  // Release the private snapshot before buffering media and assembling the public ZIP.
  snapshot = undefined;
  const include = { database: true, media: true, themes: true, plugins: true, settings: true };
  const collected = await collectSiteBackupFiles({ sources: required.sources, include: { ...include, media: false } }, { profile: "share" });
  if (collected.skipped.length) throw new SiteShareRefusal({ code: "UNSAFE_FILE", message: `Cannot share '${collected.skipped[0]!.path}': ${collected.skipped[0]!.reason}. Remove it or replace it with a regular file.` });
  const bufferedFiles: { path: string; content: Buffer }[] = [];
  const files = collected.files.filter(file => file.scope !== "settings");
  const sizes = [...files.map(file => ({ path: file.path, bytes: file.bytes })), { path: "database/content.db", bytes: projected.bytes.length }];
  checkShareLimits({ files: sizes });
  const add = (file: { path: string; content: Buffer }) => {
    sizes.push({ path: file.path, bytes: file.content.length });
    checkShareLimits({ files: sizes });
    bufferedFiles.push(file);
  };
  const seen = new Set<string>();
  const documentKeys = new Set(projected.documents?.map(document => document.storageKey));
  for (const media of projected.media) {
    optional.signal?.throwIfAborted();
    if (seen.has(media.storageKey)) continue;
    seen.add(media.storageKey);
    const entryPath = `uploads/${media.storageKey}`;
    validateSharePath({ path: entryPath });
    if (!required.blobStore.sizeOf) throw new SiteShareRefusal({ code: "UNBOUNDED_MEDIA", message: "This media store cannot report blob sizes. Configure a size-aware blob store before sharing." });
    const size = await required.blobStore.sizeOf({ storageKey: media.storageKey });
    if (size === null) throw new SiteShareRefusal({ code: "MISSING_MEDIA", message: `Share media '${media.storageKey}' is missing from the blob store.` });
    if (!Number.isSafeInteger(size) || size < 0) throw new SiteShareRefusal({ code: "UNBOUNDED_MEDIA", message: "Media storage returned an invalid byte count; nothing was shared." });
    if (documentKeys.has(media.storageKey) && (size === 0 || size > MAX_DOCUMENT_BYTES)) throw new SiteShareRefusal({ code: "INVALID_DOCUMENT", message: "Library document blobs must be non-empty and at most 10 MiB; nothing was shared." });
    checkShareLimits({ files: [...sizes, { path: entryPath, bytes: size }] });
    const content = Buffer.from(await required.blobStore.get({ storageKey: media.storageKey }));
    if (content.length !== size || (media.sha256 && createHash("sha256").update(content).digest("hex") !== media.sha256)) throw new SiteShareRefusal({ code: "MEDIA_CHANGED", message: `Share media '${media.storageKey}' changed or failed its checksum.` });
    add({ path: entryPath, content });
  }
  const config = await readPortableJson({ file: collected.files.find(file => file.path === "settings/config.json") });
  const name = typeof config.name === "string" ? config.name : path.basename(required.sources.siteDir);
  add({ path: "settings/config.json", content: Buffer.from(JSON.stringify({ name, domain: null, port: null })) });
  const provenance: Record<string, unknown> = {};
  {
    const meta = await readPortableJson({ file: collected.files.find(file => file.path === "settings/.site-meta.json") });
    // Pick named provenance fields; never spread site identity, paths, fingerprints or storage.
    for (const key of ["templateId", "templateVersion", "schemaVersion", "schemaTag"]) {
      const value = meta[key];
      if (typeof value === "string" && /^[a-z\d_.+-]{1,128}$/i.test(value) || typeof value === "number" && Number.isSafeInteger(value) && value >= 0) provenance[key] = value;
    }
  }
  add({ path: "settings/.site-meta.json", content: Buffer.from(JSON.stringify(provenance)) });
  return { target: { kind: "zip" }, profile: "share", include, database: { bytes: projected.bytes, watermarkAtCapture }, files, bufferedFiles, skipped: [], scopeNotes: {}, totalBytes: sizes.reduce((sum, file) => sum + file.bytes, 0), site: { name, folderName: path.basename(required.sources.siteDir) }, schema: runtimeSchemaVersion(), tovuVersion: required.sources.tovuVersion, createdAt: new Date().toISOString() };
}

/** Read only the small, no-follow planned settings files; all other metadata is discarded. */
async function readPortableJson(required: { file?: PlannedDiskFile }): Promise<Record<string, unknown>> {
  if (!required.file) return {};
  if (required.file.bytes > SHARE_LIMITS.maxManifestBytes) throw new SiteShareRefusal({ code: "INVALID_SETTINGS", message: `Share settings '${required.file.path}' exceeds 2 MiB.` });
  const read = await readPlannedFile(required.file);
  if (!read.ok) throw new SiteShareRefusal({ code: "PLAN_STALE", message: read.message });
  try {
    const value: unknown = JSON.parse(read.bytes.toString("utf8"));
    if (value !== null && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch { /* A malformed portable setting must not produce a partial share. */ }
  throw new SiteShareRefusal({ code: "INVALID_SETTINGS", message: `Share settings '${required.file.path}' must contain a JSON object.` });
}
