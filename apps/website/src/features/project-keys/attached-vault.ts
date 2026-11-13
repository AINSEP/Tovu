import { ToolInputError } from '@jini-ai/core';
import { isInVaultQueryScope, type VaultRecord, type VaultRepoPort } from '@jini-ai/platform/secrets/credential-sets';
import type { KeyAttachments } from './attachments.js';

export type SiteGrantedVault = VaultRepoPort & { findByLabel?: (input: { workspaceId: string; label: string }, options?: Record<string, never>) => Promise<VaultRecord | null> };

/** Site consumption adapter over CMS site grants. Never reads ungranted envelopes or forwards writes.
 * Each lookup rechecks the grant; inventory reads at most 100 selected rows, never the owner vault.
 * @returns A read-only vault with the existing repository ABI.
 * @complexity O(g) indexed reads/time/space for g granted keys (at most 100).
 */
export function attachedOnlyVault({ vault, siteId, attachments }: {
  vault: VaultRepoPort; siteId: string; attachments: KeyAttachments;
}, _optional = {}): SiteGrantedVault {
  const find: VaultRepoPort['find'] = async (input, options) => {
    try {
      if (!await attachments.isAttached({ siteId, keyId: input.id })) return null;
      return await vault.find(input, options);
    } catch {
      console.warn('[shared-keys] A granted key could not be read. Local keys remain available; retry Shared Keys. Details: P25_SHARED_READ_FAILED; secret values omitted.');
      return null;
    }
  };
  async function granted({ workspaceId }: { workspaceId: string }): Promise<VaultRecord[]> {
    const rows: VaultRecord[] = [];
    for (const id of await attachments.keysFor({ siteId }).catch(() => {
      console.warn('[shared-keys] Grants could not be read. Retry Shared Keys. Details: P25_GRANTS_READ_FAILED; secret values omitted.');
      return [];
    })) {
      const row = await find({ workspaceId, id });
      if (row) rows.push(row);
    }
    return rows;
  }
  const list: VaultRepoPort['list'] = async input =>
    (await granted(input)).filter(record => isInVaultQueryScope({ record, query: input }));
  const refuse = async (): Promise<never> => {
    throw new ToolInputError({ message: 'Change this saved key in Shared Keys. To stop using it here, revoke its grant on this site.' });
  };
  return {
    find, list,
    ...(attachments.keyForLabel ? { findByLabel: async (input: { workspaceId: string; label: string }) => {
      try {
        const id = await attachments.keyForLabel!({ siteId, label: input.label });
        return id ? await find({ workspaceId: input.workspaceId, id }) : null;
      } catch {
        console.warn('[shared-keys] A granted key label could not be resolved. Reopen Use a saved key and retry. Details: P25_SHARED_LABEL_READ_FAILED; secret values omitted.');
        return null;
      }
    } } : {}),
    findOne: async input => (await granted(input)).find(row => row.kind === input.kind
      && (input.ownerKey === undefined || row.ownerKey === input.ownerKey)
      && (input.principalId === undefined || row.principalId === input.principalId)) ?? null,
    findDefault: async input => {
      const rows = await list(input);
      return rows.find(row => row.isDefault) ?? (rows.length === 1 ? rows[0]! : null);
    },
    put: refuse, patchMeta: refuse, delete: refuse, applyBatch: refuse,
  };
}
