import { createHash } from "node:crypto";
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
  const stem = required.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "site";
  const file = `${stem}.tovu.zip`;
  if (!SHARE_FILE.test(file)) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Invalid share file name." });
  const key = `_share/${identity.token}/${file}`;
  const row = await receiveSiteShareArtifact({ ...required, token: identity.token, file }, { ...(optional.delivery ? { storage: { provider: optional.delivery.provider, key, ...(optional.delivery.binding ? { binding: optional.delivery.binding } : {}) } } : {}) });
  if (optional.signal?.aborted) {
    await required.registry.disable({ shareId: row.shareId, site: row.site });
    await required.registry.deleteArtifact({ shareId: row.shareId });
    throw new SiteShareRefusal({ code: "CANCELLED", message: "Share export was cancelled." });
  }
  if (!optional.delivery) return row;
  let uploadedUrl: string | null = null;
  try {
    optional.signal?.throwIfAborted();
    const { url } = await optional.delivery.store.upload({ key, bytes: required.archive, headers: { ...SHARE_DOWNLOAD_HEADERS, "Content-Disposition": `attachment; filename="${file}"` } }, { signal: optional.signal });
    uploadedUrl = url;
    await required.registry.put({ record: { ...row, storage: { ...row.storage, provider: optional.delivery.provider, key, url } } });
    if (!await optional.delivery.store.verify({ key, url, present: true, bytes: row.bytes }, { signal: optional.signal })) throw new SiteShareRefusal({ code: "DELIVERY_FAILED", message: "Storage upload could not be verified anonymously with the required download headers. Configure public object access and download headers." });
    const current = await required.registry.get({ shareId: row.shareId });
    if (current?.status === "revoked") throw new SiteShareRefusal({ code: "REVOKED", message: "Share was revoked during upload." });
    const delivered = { ...row, url };
    await required.registry.put({ record: delivered });
    return delivered;
  } catch (error) {
    // A failed public upload must be removed too. Keep its locator if deletion fails, so revoke
    // can retry; the failure is never reported as a successful link.
    await required.registry.put({ record: { ...row, status: "failed", storage: { ...row.storage, provider: optional.delivery.provider, key, ...(uploadedUrl ? { url: uploadedUrl } : {}) } } });
    try {
      if (optional.delivery.provider !== "tovu-server" || optional.delivery.binding !== required.registry.directory) {
        await optional.delivery.store.delete({ key });
        if (uploadedUrl && !await optional.delivery.store.verify({ key, url: uploadedUrl, present: false })) throw new Error("purge unverified");
      }
    }
    catch { throw new SiteShareRefusal({ code: "DELIVERY_CLEANUP_FAILED", message: `Share ${row.shareId} delivery failed and remote deletion/purge could not be verified. Retry site_share_revoke.` }); }
    if (error instanceof SiteShareRefusal) throw error;
    throw new SiteShareRefusal({ code: "DELIVERY_FAILED", message: `Share ${row.shareId} delivery failed. Download the ZIP or configure storage and retry.` });
  }
}

/** Disable locally first, then delete remotely and verify disappearance; failed cleanup is retryable. */
export async function revokeSiteShare(required: { registry: SiteShareRegistry; site: string; shareId: string }, optional: { delivery?: ShareDelivery } = {}): Promise<SiteShareRecord> {
  const row = await required.registry.disable(required);
  if (!row) throw new SiteShareRefusal({ code: "NOT_FOUND", message: "Share not found for this site." });
  try { await required.registry.deleteArtifact({ shareId: row.shareId }); }
  catch { throw new SiteShareRefusal({ code: "DELETE_FAILED", message: "Share token is disabled but its ZIP could not be deleted. Retry revoke." }); }
  if (row.storage && !(row.storage.provider === "tovu-server" && row.storage.binding === required.registry.directory)) {
    if (!optional.delivery || optional.delivery.provider !== row.storage.provider || row.storage.binding !== optional.delivery.binding) throw new SiteShareRefusal({ code: "DELETE_FAILED", message: "Share is disabled locally; configure its original storage to delete the remote artifact." });
    try {
      await optional.delivery.store.delete({ key: row.storage.key });
      const url = row.url ?? row.storage.url;
      if (url && !await optional.delivery.store.verify({ key: row.storage.key, url, present: false })) throw new Error("purge unverified");
    } catch { throw new SiteShareRefusal({ code: "DELETE_FAILED", message: "Share is disabled locally but remote deletion/purge is not verified. Retry revoke." }); }
  }
  return row;
}
