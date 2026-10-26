import type { KeyAttachments } from "../attachments.js";
import type { VaultRecord } from "@jini-ai/platform/secrets/credential-sets";

export function fakeAttachments(_required = {}, _optional = {}): KeyAttachments {
  const rows = new Map<string, { siteId: string; siteName: string; keyId: string }>();
  const id = ({ siteId, keyId }: { siteId: string; keyId: string }) => JSON.stringify([siteId, keyId]);
  return {
    async attach(input) { if (!input.siteId) throw new Error("This site has no id yet; restart it."); rows.set(id(input), input); },
    async detach(input) { rows.delete(id(input)); },
    async isAttached(input) { return rows.has(id(input)); },
    async usersOf({ keyId }) { return [...rows.values()].filter(row => row.keyId === keyId).map(({ siteId, siteName }) => ({ siteId, siteName })); },
    async removeKey({ keyId }) { for (const [key, row] of rows) if (row.keyId === keyId) rows.delete(key); },
    async renameSite({ siteId, siteName }) { for (const row of rows.values()) if (row.siteId === siteId) row.siteName = siteName; },
  };
}
export function vaultRow({ id = "key-a", kind = "vendor" }: { id?: string; kind?: VaultRecord["kind"] } = {}, _optional = {}): VaultRecord {
  return { workspaceId: "project", id, kind, ownerKey: "tovu", principalId: null, binding: null,
    provider: kind === "vendor" ? "host" : null, label: "Production", isDefault: true, revision: 1,
    sealed: null, last4: null, tokenLength: null, meta: { credentialType: "custom", worksFor: [] }, createdAt: "2026-01-01", updatedAt: "2026-01-01" };
}
