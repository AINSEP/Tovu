import { createHash } from 'node:crypto';
import type { Clock } from '@jini-ai/core/primitives';
import { ApiConnectionError, type ApiConnectionClientKind, type ApiConnectionDescriptor, type SharedOAuthConnection } from '@jini-ai/integrations/api-connections';
import type { OAuthClient } from '@jini-ai/oauth';
import type { SecretsVaultService, VaultMeta } from '@jini-ai/platform/secrets/credential-sets';
import type { ProjectVaultScope } from '../../server/runtime/composition/project-store.js';
import { apiConnectionVaultScope, createApiConnectionVault, createApiConnectionVaultRecordStore, createApiConnectionVaultTokenStore, PLUGIN_STATE_FORMAT } from './vault-stores.js';

/** Issuing configuration is sealed in the owner store; a consuming site's client cannot replace it. */
export interface SharedOAuthIssuingContext {
  readonly credentialId: string;
  readonly identity: SharedOAuthConnection['identity'];
  readonly client: OAuthClient;
  readonly clientKind: ApiConnectionClientKind;
  readonly descriptor: ApiConnectionDescriptor;
}

const contextId = (credentialId: string) => `plugin-state:tovu-shared-oauth:${createHash('sha256').update(credentialId).digest('hex')}`;
const unavailable = () => new ApiConnectionError({ code: 'connection-not-found', message: 'This saved connection is no longer available. Choose a saved connection again or sign in.' });

/** Opens one sealed issuing context, refusing a copied context or mismatched issuing client.
 * @complexity One selected owner-vault read; no inventory or polling.
 */
export async function readSharedOAuthContext(required: { vault: SecretsVaultService; credentialId: string }, _optional = {}): Promise<SharedOAuthIssuingContext | null> {
  const found = await required.vault.get({ ...apiConnectionVaultScope({ workspaceId: 'project' }), id: contextId(required.credentialId) });
  if (!found) return null;
  const context = found.payload?.value as unknown as SharedOAuthIssuingContext | undefined;
  if (!context || context.credentialId !== required.credentialId || !context.identity || !context.client || !context.descriptor) throw unavailable();
  if (context.client.clientId !== context.identity.clientId || context.descriptor.tokenEndpoint !== context.identity.tokenEndpoint
    || context.descriptor.pluginId !== context.identity.pluginId || context.descriptor.connectionId !== context.identity.connectionId) throw unavailable();
  return context;
}

/** Reuses owner records, vault sealing and durable token leases. Sites receive only access tokens.
 * @complexity O(1) construction; every operation reads/writes selected rows only.
 */
export function createSharedOAuthOwnerStorage(required: { scope: ProjectVaultScope; clock: Clock }, _optional = {}) {
  const { scope, clock } = required;
  if (scope.workspaceId !== 'project') throw unavailable();
  const vault = createApiConnectionVault({ ...scope, clock });
  const records = createApiConnectionVaultRecordStore({ vault, workspaceId: 'project', clock });
  const readContext = ({ credentialId }: { credentialId: string }) => readSharedOAuthContext({ vault, credentialId });
  return {
    vault, records, readContext,
    async saveContext({ credentialId, context }: { credentialId: string; context: SharedOAuthIssuingContext }) {
      if (context.credentialId !== credentialId || context.client.clientId !== context.identity.clientId) throw unavailable();
      const existing = await readContext({ credentialId });
      // An existing account keeps its issuing identity even if a later site's BYO client differs.
      if (existing) {
        if (JSON.stringify(existing) !== JSON.stringify(context)) throw new ApiConnectionError({ code: 'account-changed', message: 'This shared connection uses its original sign-in client. Use that saved connection or create a separate local connection.' });
        return;
      }
      const id = contextId(credentialId);
      await vault.put({ ...apiConnectionVaultScope({ workspaceId: 'project' }), id, expectedRevision: null, provider: null, label: id,
        meta: { credentialFormat: PLUGIN_STATE_FORMAT }, payload: { value: context as unknown as VaultMeta } });
    },
    tokensFor({ context }: { context: SharedOAuthIssuingContext }) {
      return createApiConnectionVaultTokenStore({ vault, records, clock, owner: { workspaceId: 'project', pluginId: context.identity.pluginId,
        connectionId: context.identity.connectionId, clientId: context.client.clientId } });
    },
    async readConnection({ credentialId }: { credentialId: string }): Promise<SharedOAuthConnection | null> {
      const [context, record] = await Promise.all([readContext({ credentialId }), records.read({ key: credentialId })]);
      if (!context || !record) return null;
      if (record.key !== credentialId || record.workspaceId !== 'project' || record.pluginId !== context.identity.pluginId || record.connectionId !== context.identity.connectionId) throw unavailable();
      return { credentialId, identity: context.identity, generation: record.generation, status: record.status, account: record.account, grantedScopes: record.grantedScopes };
    },
  };
}
export type SharedOAuthOwnerStorage = ReturnType<typeof createSharedOAuthOwnerStorage>;
