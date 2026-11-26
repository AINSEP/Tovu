import { createHash } from 'node:crypto';
import type { Clock } from '@jini-ai/core/primitives';
import { ApiConnectionError } from '@jini-ai/integrations/api-connections';
import { createSharedOAuthOwnerStorage as createWithPorts, createSharedOAuthLabels as labelsWithPorts,
  type SharedOAuthOwnerScope } from '@jini-ai/integrations/api-connections/shared-owner';
import { apiConnectionVaultScope, PLUGIN_STATE_FORMAT } from '#src/platform/secrets/vault-api-connection-meta';
import { createApiConnectionVault, createApiConnectionVaultRecordStore, createApiConnectionVaultTokenStore } from './vault-store-binding.js';

const ownerPolicy = {
  ownerWorkspaceId: 'project', createApiConnectionVault, createApiConnectionVaultRecordStore, createApiConnectionVaultTokenStore,
  apiConnectionVaultScope,
  contextId: ({ credentialId }: { credentialId: string }) => `plugin-state:tovu-shared-oauth:${createHash('sha256').update(credentialId).digest('hex')}`,
  contextMeta: { credentialFormat: PLUGIN_STATE_FORMAT }, contextLabel: ({ id }: { id: string }) => id,
  unavailable: () => new ApiConnectionError({ code: 'connection-not-found', message: 'This saved connection is no longer available. Choose a saved connection again or sign in.' }),
  accountChanged: () => new ApiConnectionError({ code: 'account-changed', message: 'This shared connection uses its original sign-in client. Use that saved connection or create a separate local connection.' }),
};

export function createSharedOAuthOwnerStorage(required: { scope: SharedOAuthOwnerScope; clock: Clock }, _optional = {}) {
  return createWithPorts({ ...required, ...ownerPolicy });
}

export function createSharedOAuthLabels(required: { scope: SharedOAuthOwnerScope; clock: Clock }, _optional = {}) {
  return labelsWithPorts({ ...required, ...ownerPolicy, unavailableLabel: 'Unavailable saved connection (shared on this Mac)',
    accountLabel: ({ context, connection }) => `${context.descriptor.label} — ${connection.account?.displayName ?? connection.account?.accountId ?? 'No connected account'} (shared on this Mac)`,
  });
}
