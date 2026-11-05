import { ApiConnectionError, createSharedOAuthConsumer, deriveApiConnectionKey, type ApiConnectionService } from '@jini-ai/integrations/api-connections';
import type { KeyAttachments, ProjectKeyTransaction } from '../project-keys/attachments.js';
import type { SiteOAuthBindings } from '../project-keys/site-references.js';
import type { DeclaredApiConnection } from './contribution.js';
import type { SharedOAuthIssuingContext, SharedOAuthOwnerStorage } from './shared-owner.js';

export interface SharedApiConnectionDeps {
  readonly storage: SharedOAuthOwnerStorage;
  readonly bindings: SiteOAuthBindings;
  readonly attachments: KeyAttachments;
  readonly transaction: ProjectKeyTransaction;
  readonly siteId: string;
  readonly siteName: string;
  readonly ownerPrincipalId: Promise<string>;
}
const unavailable = () => new ApiConnectionError({ code: 'connection-not-found', message: 'This shared connection cannot be used here. Choose a compatible saved connection or sign in again.' });

/** Wires the generic consumer to the owner store and this immutable site's binding.
 * @complexity Selected binding/grant/record reads per use, no authorization cache or background work.
 */
export function createSharedApiConnections(required: SharedApiConnectionDeps & {
  readonly workspaceId: string;
  readonly listConnections: (input: { pluginId: string }) => Promise<readonly DeclaredApiConnection[]>;
  readonly requestedScopes: (input: { connection: DeclaredApiConnection; scopeSetIds: readonly string[] }) => Promise<readonly string[]>;
  readonly createService: (input: { connection: DeclaredApiConnection; context: SharedOAuthIssuingContext; redirectUri?: string }) => ApiConnectionService;
}, _optional = {}) {
  const { storage, bindings, siteId } = required;
  const services = new Map<string, ApiConnectionService>();
  const ref = (connection: DeclaredApiConnection) => deriveApiConnectionKey({ workspaceId: required.workspaceId, pluginId: connection.pluginId, connectionId: connection.descriptor.connectionId });
  const declared = async (context: SharedOAuthIssuingContext) => {
    const connection = (await required.listConnections({ pluginId: context.identity.pluginId })).find(item => item.descriptor.connectionId === context.identity.connectionId);
    if (!connection || connection.descriptor.tokenEndpoint !== context.identity.tokenEndpoint) throw unavailable();
    return connection;
  };
  const consumer = createSharedOAuthConsumer({
    bindings: { read: input => input.siteId === siteId ? bindings.read({ consumerId: input.consumerId }) : Promise.resolve(null) },
    grants: { isGranted: input => input.siteId === siteId ? required.attachments.isAttached({ siteId, keyId: input.credentialId }) : Promise.resolve(false) },
    connections: {
      read: storage.readConnection,
      async getAccessToken({ credentialId, expectedGeneration, expectedAccountId }) {
        const context = await storage.readContext({ credentialId });
        const record = await storage.records.read({ key: credentialId });
        if (!context || record?.generation !== expectedGeneration) throw unavailable();
        let service = services.get(credentialId);
        if (!service) { service = required.createService({ connection: await declared(context), context }); services.set(credentialId, service); }
        return service.getAccessToken({ connectionRef: credentialId, workspaceId: 'project' }, { expectedAccountId });
      },
    },
  });
  async function target(connection: DeclaredApiConnection) {
    return { siteId, consumerId: ref(connection), identity: { pluginId: connection.pluginId, connectionId: connection.descriptor.connectionId, tokenEndpoint: connection.descriptor.tokenEndpoint, authorizationEndpoint: connection.descriptor.authorizationEndpoint },
      requiredScopes: await required.requestedScopes({ connection, scopeSetIds: [] }) };
  }
  async function bind({ keyId, use }: { keyId: string; use: boolean }) {
    const context = await storage.readContext({ credentialId: keyId });
    if (!context) throw unavailable();
    const connection = await declared(context);
    if (!use) return;
    const record = await storage.records.read({ key: keyId });
    const scopes = await required.requestedScopes({ connection, scopeSetIds: [] });
    if (record?.status !== 'connected' || !scopes.every(scope => record.grantedScopes.includes(scope))) throw unavailable();
    await bindings.set({ consumerId: ref(connection), credentialId: keyId });
  }
  return {
    bind,
    hasBinding: (connection: DeclaredApiConnection) => bindings.read({ consumerId: ref(connection) }).then(Boolean),
    getStatus: async (connection: DeclaredApiConnection) => consumer.getStatus(await target(connection)),
    getAccessToken: async (connection: DeclaredApiConnection, options: { expectedAccountId?: string } = {}) => consumer.getAccessToken({ ...await target(connection), ...options }),
    async stopUsing(connection: DeclaredApiConnection) {
      const binding = await bindings.read({ consumerId: ref(connection) });
      if (binding) await required.attachments.detach({ siteId, keyId: binding.credentialId });
    },
    async prepare({ connection, actorId, context, redirectUri }: { connection: DeclaredApiConnection; actorId: string; context: SharedOAuthIssuingContext; redirectUri?: string }) {
      if (!siteId || actorId !== await required.ownerPrincipalId) throw unavailable();
      await storage.saveContext({ credentialId: context.credentialId, context });
      const service = required.createService({ connection, context, redirectUri });
      return { service, workspaceId: 'project', async onCompleted() {
        await required.transaction({ run: async () => {
          await bind({ keyId: context.credentialId, use: true });
          await required.attachments.attach({ siteId, keyId: context.credentialId, siteName: required.siteName });
        } });
      } };
    },
  };
}
