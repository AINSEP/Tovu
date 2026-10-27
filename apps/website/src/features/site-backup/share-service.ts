import { createHash } from "node:crypto";
import path from "node:path";
import type { ArtifactStorePort } from "@jini-ai/devops/deploy";
import { SiteShareRegistry, newShareIdentity, SHARE_FILE, type SiteShareRecord } from "./share-registry.js";
import { SiteShareRefusal } from "./share-policy.js";

export const SHARE_DOWNLOAD_HEADERS = {
  "Content-Type": "application/zip",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
} as const;
export interface ShareDelivery { readonly provider: string; readonly binding?: string; readonly store: ArtifactStorePort }

/** The one receiver for locally generated and authenticated management-uploaded artifacts. */
export async function receiveSiteShareArtifact(required: { registry: SiteShareRegistry; site: string; token: string; file: string; archive: Buffer }, optional: { storage?: SiteShareRecord["storage"] } = {}): Promise<SiteShareRecord> {
  const row: SiteShareRecord = { shareId: newShareIdentity({}).shareId, token: required.token, site: required.site, file: required.file, bytes: required.archive.length, sha256: createHash("sha256").update(required.archive).digest("hex"), url: null, status: "active", createdAt: new Date().toISOString(), revokedAt: null, ...(optional.storage ? { storage: optional.storage } : {}) };
  if (!SHARE_FILE.test(row.file)) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Invalid share file name." });
  await required.registry.reserveToken(row);
  try {
    await required.registry.writeArtifact({ shareId: row.shareId, bytes: required.archive });
    await required.registry.put({ record: row });
  } catch (error) { await required.registry.deleteArtifact({ shareId: row.shareId }); throw error; }
  return row;
}

/** Persist before delivery; publish a URL only after an anonymous verification succeeds. O(bytes). */
export async function createSiteShare(required: { registry: SiteShareRegistry; site: string; name: string; archive: Buffer }, optional: { delivery?: ShareDelivery; signal?: AbortSignal } = {}): Promise<SiteShareRecord> {
  const identity = newShareIdentity({});
  // The derived stem always satisfies SHARE_FILE; receiveSiteShareArtifact re-checks it before any write.
  const file = `${shareFileStem({ name: required.name })}.tovu.zip`;
  const key = `_share/${identity.token}/${file}`;
  const row = await receiveSiteShareArtifact({ ...required, token: identity.token, file }, optional.delivery ? { storage: deliveryStorage({ delivery: optional.delivery, key }) } : {});
  if (optional.signal?.aborted) await cancelReceivedShare({ registry: required.registry, row });
  if (!optional.delivery) return row;
  return deliverShare({ registry: required.registry, row, delivery: optional.delivery, key, file, archive: required.archive }, { signal: optional.signal });
}

/** A lowercase, dash-separated file stem of at most 80 characters; `site` when nothing is left. */
function shareFileStem(required: { name: string }): string {
  return required.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "site";
}

function deliveryStorage(required: { delivery: ShareDelivery; key: string }): NonNullable<SiteShareRecord["storage"]> {
  return { provider: required.delivery.provider, key: required.key, ...(required.delivery.binding ? { binding: required.delivery.binding } : {}) };
}

/**
 * True when the artifact lives in this server's own share folder, so there is nothing remote. This server's
 * runtime delivery binds a share to its catalog's absolute path; a connected peer binds it to a URL. A record
 * sits in the catalog that made it, and that catalog moves with the site folder, so the path it saved may be
 * stale after a move or rename: only its shape is compared, never its value (design 2026-10-27).
 */
export function isOwnShareFolder(required: { storage: { provider: string; binding?: string | undefined } }): boolean {
  return required.storage.provider === "tovu-server" && required.storage.binding !== undefined && path.isAbsolute(required.storage.binding);
}

async function cancelReceivedShare(required: { registry: SiteShareRegistry; row: SiteShareRecord }): Promise<never> {
  await required.registry.disable({ shareId: required.row.shareId, site: required.row.site });
  await required.registry.deleteArtifact({ shareId: required.row.shareId });
  throw new SiteShareRefusal({ code: "CANCELLED", message: "Share export was cancelled." });
}

async function deliverShare(required: { registry: SiteShareRegistry; row: SiteShareRecord; delivery: ShareDelivery; key: string; file: string; archive: Buffer }, optional: { signal?: AbortSignal | undefined }): Promise<SiteShareRecord> {
  const { registry, row, delivery, key } = required;
  let uploadedUrl: string | null = null;
  try {
    const { url } = await delivery.store.upload({ key, bytes: required.archive, headers: { ...SHARE_DOWNLOAD_HEADERS, "Content-Disposition": `attachment; filename="${required.file}"` } }, { signal: optional.signal });
    uploadedUrl = url;
    await registry.put({ record: { ...row, storage: { ...row.storage, provider: delivery.provider, key, url } } });
    if (!await delivery.store.verify({ key, url, present: true, bytes: row.bytes }, { signal: optional.signal })) throw new SiteShareRefusal({ code: "DELIVERY_FAILED", message: "Storage upload could not be verified anonymously with the required download headers. Configure public object access and download headers." });
    const current = await registry.get({ shareId: row.shareId });
    if (current?.status === "revoked") throw new SiteShareRefusal({ code: "REVOKED", message: "Share was revoked during upload." });
    const delivered = { ...row, url };
    await registry.put({ record: delivered });
    return delivered;
  } catch (error) {
    // A failed public upload must be removed too. Keep its locator if deletion fails, so revoke
    // can retry; the failure is never reported as a successful link.
    await registry.put({ record: { ...row, status: "failed", storage: { ...row.storage, provider: delivery.provider, key, ...(uploadedUrl ? { url: uploadedUrl } : {}) } } });
    await purgeFailedDelivery({ registry, row, delivery, key, uploadedUrl });
    if (error instanceof SiteShareRefusal) throw error;
    throw new SiteShareRefusal({ code: "DELIVERY_FAILED", message: `Share ${row.shareId} delivery failed. Download the ZIP or configure storage and retry.` });
  }
}

async function purgeFailedDelivery(required: { registry: SiteShareRegistry; row: SiteShareRecord; delivery: ShareDelivery; key: string; uploadedUrl: string | null }): Promise<void> {
  const { delivery, key, uploadedUrl } = required;
  try {
    if (!isOwnShareFolder({ storage: delivery })) {
      await delivery.store.delete({ key });
      if (uploadedUrl && !await delivery.store.verify({ key, url: uploadedUrl, present: false })) throw new Error("purge unverified");
    }
  }
  catch { throw new SiteShareRefusal({ code: "DELIVERY_CLEANUP_FAILED", message: `Share ${required.row.shareId} delivery failed and remote deletion/purge could not be verified. Retry site_share_revoke.` }); }
}

/** Disable locally first, then delete remotely and verify disappearance; failed cleanup is retryable. */
export async function revokeSiteShare(required: { registry: SiteShareRegistry; site: string; shareId: string }, optional: { delivery?: ShareDelivery } = {}): Promise<SiteShareRecord> {
  const row = await required.registry.disable(required);
  if (!row) throw new SiteShareRefusal({ code: "NOT_FOUND", message: "Share not found for this site." });
  try { await required.registry.deleteArtifact({ shareId: row.shareId }); }
  catch { throw new SiteShareRefusal({ code: "DELETE_FAILED", message: "Share token is disabled but its ZIP could not be deleted. Retry revoke." }); }
  if (row.storage && !isOwnShareFolder({ storage: row.storage })) await deleteRemoteArtifact({ row, storage: row.storage }, { delivery: optional.delivery });
  return row;
}

async function deleteRemoteArtifact(required: { row: SiteShareRecord; storage: NonNullable<SiteShareRecord["storage"]> }, optional: { delivery?: ShareDelivery | undefined }): Promise<void> {
  const { storage } = required, { delivery } = optional;
  if (!delivery || delivery.provider !== storage.provider || storage.binding !== delivery.binding) throw new SiteShareRefusal({ code: "DELETE_FAILED", message: "Share is disabled locally; configure its original storage to delete the remote artifact." });
  try {
    await delivery.store.delete({ key: storage.key });
    const url = required.row.url ?? storage.url;
    if (url && !await delivery.store.verify({ key: storage.key, url, present: false })) throw new Error("purge unverified");
  } catch { throw new SiteShareRefusal({ code: "DELETE_FAILED", message: "Share is disabled locally but remote deletion/purge is not verified. Retry revoke." }); }
}
