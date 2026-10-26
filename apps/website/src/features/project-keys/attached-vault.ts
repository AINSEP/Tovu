import type { VaultRecord, VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import type { KeyAttachments } from "./attachments.js";

/** A read view only. Writes retain their original CAS contracts, including new unattached rows. */
export function attachedOnlyVault({ vault, siteId, attachments }: {
  vault: VaultRepoPort; siteId: string; attachments: KeyAttachments;
}, _optional = {}): VaultRepoPort {
  const visible = async (row: VaultRecord | null) => row && await attachments.isAttached({ siteId, keyId: row.id }) ? row : null;
  const list: VaultRepoPort["list"] = async (input, options) => {
    const rows = await vault.list(input, options);
    const checked = await Promise.all(rows.map(visible));
    return checked.filter((row): row is VaultRecord => row !== null);
  };
  return {
    find: async (input, options) => visible(await vault.find(input, options)),
    list,
    ...(vault.findOne ? { findOne: async (input, options) => visible(await vault.findOne!(input, options)) } satisfies Pick<VaultRepoPort, "findOne"> : {}),
    ...(vault.findDefault ? { findDefault: async (input, options) => visible(await vault.findDefault!(input, options)) } satisfies Pick<VaultRepoPort, "findDefault"> : {}),
    put: (input, options) => vault.put(input, options),
    patchMeta: (input, options) => vault.patchMeta(input, options),
    delete: (input, options) => vault.delete(input, options),
    ...(vault.applyBatch ? { applyBatch: (input, options) => vault.applyBatch!(input, options) } satisfies Pick<VaultRepoPort, "applyBatch"> : {}),
  };
}
