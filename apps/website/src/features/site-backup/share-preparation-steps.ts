import { createHash } from "node:crypto";
import path from "node:path";
import type { SiteSavedKeysPort } from "./saved-keys-port.js";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";
import { requireShareSecretFree } from "./share-file-policy.js";
import type { ArchiveMediaCopy } from "./archive-media.js";
import { MAX_DOCUMENT_BYTES, type BlobStorePort } from "#src/features/media/index";
import type { DbOpsPort } from "#src/contracts/core/gated-mutations/ports";
import { captureDatabaseSnapshot, collectSiteBackupFiles, readPlannedFile, type CollectedSiteBackupFiles, type PlannedDiskFile, type SiteBackupInclude, type SiteBackupSources } from "./sources.js";
import { checkShareLimits, SHARE_LIMITS, SiteShareRefusal, type ShareDatabaseProjection, type ShareDatabaseSanitizer, addShareOmission } from "./share-policy.js";

/**
 * @file The steps of `prepareShareContent`: the projected database, the collected site files, the
 * referenced media read through the blob store, and the regenerated portable settings.
 */

type ShareBlobStore = Pick<BlobStorePort, "get" | "sizeOf">;

/** Every byte the share will carry, checked against the archive caps on each addition. */
export interface ShareLedger {
  readonly sizes: { path: string; bytes: number }[];
  readonly buffered: { path: string; content: Buffer }[];
  readonly notices?: string[];
}

const PROVENANCE_KEYS = ["templateId", "templateVersion", "schemaVersion", "schemaTag"];
const PROVENANCE_TEXT = /^[a-z\d_.+-]{1,128}$/i;

/** Adds one buffered file after re-checking the caps with it counted. */
export function addBuffered(required: { ledger: ShareLedger; file: { path: string; content: Buffer } }): void {
  required.ledger.sizes.push({ path: required.file.path, bytes: required.file.content.length });
  checkShareLimits({ files: required.ledger.sizes });
  required.ledger.buffered.push(required.file);
}

/** Media omissions must use the database owner too: never emit dangling media or sidecars.
 * Rebuild only when a file was omitted, so removed rows leave no free-page copies in the ZIP.
 * Mutates the operation's ledger; O(buffered bytes + a bounded projection when needed).
 */
export async function retainSafeArchiveMedia(required: { ledger: ShareLedger; projected: ShareDatabaseProjection; copies: readonly ArchiveMediaCopy[]; sanitize: ShareDatabaseSanitizer }, optional: { signal?: AbortSignal } = {}): Promise<{ projected: ShareDatabaseProjection; copies: readonly ArchiveMediaCopy[] }> {
  const omitted = new Set<string>();
  for (const file of required.ledger.buffered) {
    if (!requireShareSecretFree({ path: file.path, bytes: file.content }, { notices: required.ledger.notices })) omitted.add(file.path);
  }
  if (!omitted.size) return { projected: required.projected, copies: required.copies };
  const omittedMediaIds = required.copies.filter(copy => omitted.has(copy.path)).map(copy => copy.id);
  const projected = await required.sanitize({ snapshot: required.projected.bytes, omittedMediaIds }, optional);
  const keep = <T extends { path: string }>(files: T[]): T[] => files.filter(file => !omitted.has(file.path));
  required.ledger.buffered.splice(0, required.ledger.buffered.length, ...keep(required.ledger.buffered));
  required.ledger.sizes.splice(0, required.ledger.sizes.length, ...keep(required.ledger.sizes));
  return { projected, copies: required.copies.filter(copy => !omitted.has(copy.path)) };
}

/**
 * Snapshots the site database and returns only the sanitizer's fresh projection.
 * Release the private snapshot before buffering media and assembling the public ZIP: the snapshot
 * is scoped to this helper, so it is released before the caller does either.
 * `snapshotRoot` is a private folder outside the source site: Export never writes into site storage.
 * @throws SiteShareRefusal DATABASE_SNAPSHOT_FAILED with the snapshot's caller-safe message.
 */
export async function captureProjectedDatabase(required: { dbOps: DbOpsPort; sanitize: ShareDatabaseSanitizer; snapshotRoot: string; savedKeys?: Pick<SiteSavedKeysPort, "capture">; shareId?: string; workspaceId?: string; includeSavedKeys?: boolean }, optional: { signal?: AbortSignal } = {}): Promise<{ projected: ShareDatabaseProjection; watermarkAtCapture: number; savedKeys?: Awaited<ReturnType<SiteSavedKeysPort["capture"]>> }> {
  const snapshot = await captureDatabaseSnapshot({ dbOps: required.dbOps, scopeId: "site-share" }, { maxBytes: SHARE_LIMITS.maxExpandedBytes, snapshotRoot: required.snapshotRoot });
  if (!snapshot.ok) throw new SiteShareRefusal({ code: "DATABASE_SNAPSHOT_FAILED", message: snapshot.message });
  const projected = await required.sanitize({ snapshot: snapshot.bytes }, { signal: optional.signal });
  let savedKeys: Awaited<ReturnType<SiteSavedKeysPort["capture"]>> | undefined;
  if (required.includeSavedKeys) {
    if (!required.savedKeys || !required.shareId || !required.workspaceId) throw new SiteShareRefusal({ code: "UNAVAILABLE", message: "Saved keys export is unavailable." });
    savedKeys = await required.savedKeys.capture({ snapshot: snapshot.bytes, shareId: required.shareId, workspaceId: required.workspaceId }, optional);
  }
  return { projected, watermarkAtCapture: snapshot.watermarkAtCapture, savedKeys };
}

/** Collects the share profile's files (never the media folder); any skipped file refuses by name. */
export async function collectShareFiles(required: { sources: SiteBackupSources; include: SiteBackupInclude }): Promise<CollectedSiteBackupFiles> {
  const collected = await collectSiteBackupFiles({ sources: required.sources, include: { ...required.include, media: false } }, { profile: "share" });
  if (collected.skipped.length) throw new SiteShareRefusal({ code: "UNSAFE_FILE", message: `Cannot share '${collected.skipped[0]!.path}': ${collected.skipped[0]!.reason}. Remove it or replace it with a regular file.` });
  return collected;
}

export async function reportedBlobSize(required: { blobStore: ShareBlobStore; storageKey: string; document: boolean }): Promise<number> {
  if (!required.blobStore.sizeOf) throw new SiteShareRefusal({ code: "UNBOUNDED_MEDIA", message: "This media store cannot report blob sizes. Configure a size-aware blob store before sharing." });
  const size = await required.blobStore.sizeOf({ storageKey: required.storageKey });
  if (size === null) throw new SiteShareRefusal({ code: "MISSING_MEDIA", message: `Share media '${required.storageKey}' is missing from the blob store.` });
  if (!Number.isSafeInteger(size) || size < 0) throw new SiteShareRefusal({ code: "UNBOUNDED_MEDIA", message: "Media storage returned an invalid byte count; nothing was shared." });
  if (required.document && (size === 0 || size > MAX_DOCUMENT_BYTES)) throw new SiteShareRefusal({ code: "INVALID_DOCUMENT", message: "Library document blobs must be non-empty and at most 10 MiB; nothing was shared." });
  checkShareLimits({ files: [{ path: "media/blob", bytes: size }] });
  return size;
}

export async function fetchVerifiedBlob(required: { blobStore: ShareBlobStore; media: ShareDatabaseProjection["media"][number]; size: number }): Promise<Buffer> {
  const { media } = required;
  const content = Buffer.from(await required.blobStore.get({ storageKey: media.storageKey }));
  if (content.length !== required.size || (media.sha256 && createHash("sha256").update(content).digest("hex") !== media.sha256)) throw new SiteShareRefusal({ code: "MEDIA_CHANGED", message: `Share media '${media.storageKey}' changed or failed its checksum.` });
  return content;
}

/**
 * Regenerates root `settings.json` with name and named template provenance, never host configuration.
 * @returns the shared site name: the config's string `name`, else the site folder name.
 */
export async function addPortableSettings(required: { files: readonly PlannedDiskFile[]; siteDir: string; ledger: ShareLedger }): Promise<string> {
  const config = await readPortableJson({ file: required.files.find(file => file.path === "settings/config.json") });
  let name = typeof config.name === "string" ? config.name : path.basename(required.siteDir);
  if (redactSecretShapes({ text: name }).redactions > 0) {
    if (required.ledger.notices) addShareOmission({ notices: required.ledger.notices, location: "settings.json name" });
    name = "Shared site";
  }
  const meta = await readPortableJson({ file: required.files.find(file => file.path === "settings/.site-meta.json") });
  addBuffered({ ledger: required.ledger, file: { path: "settings.json", content: Buffer.from(JSON.stringify({ name, template: pickProvenance({ meta, notices: required.ledger.notices }) })) } });
  return name;
}

function pickProvenance(required: { meta: Record<string, unknown>; notices?: string[] }): Record<string, unknown> {
  const provenance: Record<string, unknown> = {};
  // Pick named provenance fields; never spread site identity, paths, fingerprints or storage.
  for (const key of PROVENANCE_KEYS) {
    const value = required.meta[key];
    const validText = typeof value === "string" && PROVENANCE_TEXT.test(value);
    const validNumber = typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
    if (redactSecretShapes({ text: String(value) }).redactions > 0) {
      if (required.notices) addShareOmission({ notices: required.notices, location: `settings.json template.${key}` });
      continue;
    }
    if (validText || validNumber) provenance[key] = value;
  }
  return provenance;
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
