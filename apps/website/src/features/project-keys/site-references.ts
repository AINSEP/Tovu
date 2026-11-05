import { ToolInputError } from '@jini-ai/core';
import { createHash } from 'node:crypto';
import type { SecretsVaultService, VaultRepoPort } from '@jini-ai/platform/secrets/credential-sets';
import { apiConnectionVaultScope, PLUGIN_STATE_FORMAT } from '../api-connections/vault-stores.js';

/** Site storage contains references only. Grants and secrets remain in the owner database. */
export interface SiteKeyReferences {
  set(input: { credentialId: string }, options?: Record<string, never>): Promise<void>;
  has(input: { credentialId: string }, options?: Record<string, never>): Promise<boolean>;
  remove(input: { credentialId: string }, options?: Record<string, never>): Promise<void>;
}

/** Reuse the non-exported plugin-state row format without a new table or migration.
 * One reference is one selected row; no inventories, timers or owner key material enter this store.
 * @returns Reference persistence for this server-bound workspace.
 * @complexity O(1) selected row I/O per operation; payload is only {credentialId}, with an id of at most 512 characters.
 */
export function createSiteKeyReferences({ vault, repo, workspaceId }: {
  vault: SecretsVaultService; repo: VaultRepoPort; workspaceId: string;
}, _options = {}): SiteKeyReferences {
  const scope = apiConnectionVaultScope({ workspaceId });
  const identity = ({ credentialId }: { credentialId: string }) => {
    if (!credentialId || credentialId.length > 512) throw new ToolInputError({ message: 'Choose an existing Shared Key with an id of at most 512 characters.' });
    return { ...scope, id: `plugin-state:tovu-key-references:${createHash('sha256').update(credentialId).digest('hex')}` };
  };
  return {
    set: async input => {
      const key = identity(input);
      const current = await repo.find(key);
      await vault.put({ ...key, expectedRevision: current?.revision ?? null, provider: null, label: key.id,
        meta: { credentialFormat: PLUGIN_STATE_FORMAT }, payload: { value: { credentialId: input.credentialId } } });
    },
    has: async input => {
      const found = await vault.get(identity(input));
      const value = found?.payload?.value as { credentialId?: unknown } | undefined;
      return value?.credentialId === input.credentialId;
    },
    remove: async input => {
      const key = identity(input);
      const current = await repo.find(key);
      if (current) await vault.delete({ ...key, expectedRevision: current.revision });
    },
  };
}
