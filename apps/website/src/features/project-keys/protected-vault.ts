import { ToolInputError } from "@jini-ai/core";
import type { VaultRecord, VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import type { KeyAttachments, ProjectKeyTransaction } from "./attachments.js";

/** The project mutation boundary protects shared users and repairs unattached default promotions.
 * Repairs join the mutation transaction; CAS failures roll back with it. O(ops) indexed lookups
 * plus attachment users; legacy ports without findDefault scan the affected provider group.
 */
export function protectProjectKeyDeletes({ vault, attachments, siteId, transaction }: {
  vault: VaultRepoPort; attachments: KeyAttachments; siteId: string;
  transaction: ProjectKeyTransaction;
}, _optional = {}): VaultRepoPort {
  async function allowed({ keyId }: { keyId: string }) {
    const others = (await attachments.usersOf({ keyId })).filter(user => user.siteId !== siteId);
    if (others.length) throw new ToolInputError({ message: `Used by ${others.map(user => user.siteName).join(", ")} too. To stop using it here, choose 'Stop using it on this site'.` });
  }
  /** Jini cannot see site attachments: a delete/move may promote an inert project row.
   * Clear only that promotion, preserving defaults attached to any site in this shared scope.
   */
  async function repairPromotion({ before, after }: { before: VaultRecord | null; after?: { provider: string | null } }, _optional = {}) {
    if (!before?.isDefault || after?.provider === before.provider) return;
    const promoted = vault.findDefault ? await vault.findDefault(before) : (await vault.list(before)).find(row => row.isDefault);
    if (!promoted || (await attachments.usersOf({ keyId: promoted.id })).length) return;
    await vault.put({ record: { ...promoted, isDefault: false, revision: promoted.revision + 1 }, expectedRevision: promoted.revision });
  }
  return {
    find: (input, options) => vault.find(input, options), list: (input, options) => vault.list(input, options),
    put: (input, options) => transaction({ run: async () => {
      const before = await vault.find(input.record);
      const stored = await vault.put(input, options);
      await repairPromotion({ before, after: stored });
      return stored;
    } }),
    patchMeta: (input, options) => vault.patchMeta(input, options),
    ...(vault.findOne ? { findOne: (input, options) => vault.findOne!(input, options) } satisfies Pick<VaultRepoPort, "findOne"> : {}),
    ...(vault.findDefault ? { findDefault: (input, options) => vault.findDefault!(input, options) } satisfies Pick<VaultRepoPort, "findDefault"> : {}),
    delete: (input, options) => transaction({ run: async () => {
      await allowed({ keyId: input.id });
      const before = await vault.find(input);
      const removed = await vault.delete(input, options);
      if (removed) {
        await attachments.removeKey({ keyId: input.id });
        await repairPromotion({ before });
      }
      return removed;
    } }),
    ...(vault.applyBatch ? { applyBatch: (input, options) => transaction({ run: async () => {
      const deletes = input.ops.flatMap(op => "delete" in op ? [op.delete] : []);
      for (const row of deletes) await allowed({ keyId: row.id });
      const before = await Promise.all(input.ops.map(op => "patchMeta" in op ? null : vault.find("put" in op ? op.put.record : op.delete)));
      const results = await vault.applyBatch!(input, options);
      for (const [index, op] of input.ops.entries()) {
        if ("delete" in op && results[index] === true) {
          await attachments.removeKey({ keyId: op.delete.id });
          await repairPromotion({ before: before[index]! });
        }
        if ("put" in op) await repairPromotion({ before: before[index]!, after: op.put.record });
      }
      return results;
    } }) } satisfies Pick<VaultRepoPort, "applyBatch"> : {}),
  };
}
