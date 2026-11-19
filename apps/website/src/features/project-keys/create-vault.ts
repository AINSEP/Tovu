import { ProjectKeyCreateConflictError } from '../../contracts/core/credential-store.js';
import type { ProjectKeyTransaction } from './attachments.js';
import { ToolInputError } from '@jini-ai/core';
import { VaultError, type VaultRepoPort } from '@jini-ai/core/contracts/vault';

/** Human secret cards create new owner entries. A separate trusted owner-session port may replace
 * granted entries atomically with its grant check. All reads retain the site grant boundary.
 * @returns A create-only port sharing the consumer repository ABI.
 * @complexity O(1) selected CAS insertion per submitted secret card; no owner inventory reads.
 */
export function projectKeyCreateVault({ owner, view }: { owner: VaultRepoPort; view: VaultRepoPort }, { allowReplacement = false, transaction = async ({ run }) => run() }: { allowReplacement?: boolean; transaction?: ProjectKeyTransaction } = {}): VaultRepoPort {
  return { ...view,
    put: async (input, options) => {
      if (input.expectedRevision !== null) {
        return transaction({ run: async () => {
          if (!allowReplacement || !await view.find(input.record)) throw new ToolInputError({ message: 'Replace this shared key from the owner session or Shared Keys. Refresh the site grant before trying again.' });
          return owner.put(input, options);
        } });
      }
      try { return await owner.put(input, options); }
      catch (error) {
        if (error instanceof VaultError && error.code === 'conflict') throw new ProjectKeyCreateConflictError({});
        throw error;
      }
    },
  };
}
