import { ToolInputError } from "@jini-ai/core";
import type { VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import type { KeyAttachments, ProjectKeyTransaction } from "./attachments.js";

/** The project deletion boundary covers domain deletes, batches and permanent-delete alike. */
export function protectProjectKeyDeletes({ vault, attachments, siteId, transaction }: {
  vault: VaultRepoPort; attachments: KeyAttachments; siteId: string;
  transaction: ProjectKeyTransaction;
}, _optional = {}): VaultRepoPort {
  async function allowed({ keyId }: { keyId: string }) {
    const others = (await attachments.usersOf({ keyId })).filter(user => user.siteId !== siteId);
    if (others.length) throw new ToolInputError({ message: `Used by ${others.map(user => user.siteName).join(", ")} too. To stop using it here, choose 'Stop using it on this site'.` });
  }
  return {
    find: (input, options) => vault.find(input, options), list: (input, options) => vault.list(input, options),
    put: (input, options) => vault.put(input, options), patchMeta: (input, options) => vault.patchMeta(input, options),
    ...(vault.findOne ? { findOne: (input, options) => vault.findOne!(input, options) } satisfies Pick<VaultRepoPort, "findOne"> : {}),
    ...(vault.findDefault ? { findDefault: (input, options) => vault.findDefault!(input, options) } satisfies Pick<VaultRepoPort, "findDefault"> : {}),
    delete: (input, options) => transaction({ run: async () => {
      await allowed({ keyId: input.id });
      const removed = await vault.delete(input, options);
      if (removed) await attachments.removeKey({ keyId: input.id });
      return removed;
    } }),
    ...(vault.applyBatch ? { applyBatch: (input, options) => transaction({ run: async () => {
      const deletes = input.ops.flatMap(op => "delete" in op ? [op.delete] : []);
      for (const row of deletes) await allowed({ keyId: row.id });
      const results = await vault.applyBatch!(input, options);
      for (const [index, op] of input.ops.entries()) {
        if ("delete" in op && results[index] === true) await attachments.removeKey({ keyId: op.delete.id });
      }
      return results;
    } }) } satisfies Pick<VaultRepoPort, "applyBatch"> : {}),
  };
}
