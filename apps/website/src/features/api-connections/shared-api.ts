import { ApiConnectionError, assertSharedOAuthCompatibility, createSharedOAuthConsumer, deriveApiConnectionKey, type ApiConnectionService } from '@jini-ai/integrations/api-connections';
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
    if (!connection || connection.descriptor.tokenEndpoint !== context.identity.tokenEndpoint
      || connection.descriptor.authorizationEndpoint !== context.identity.authorizationEndpoint) throw unavailable();
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
  async function bind({ keyId, use }: { keyId: string; use: boolean }, _options = {}) {
    const context = await storage.readContext({ credentialId: keyId });
    if (!context) throw unavailable();
    const connection = await declared(context);
    if (!use) return;
    const shared = await storage.readConnection({ credentialId: keyId });
    if (shared?.status !== 'connected') throw unavailable();
    assertSharedOAuthCompatibility({ connection: shared, target: await target(connection) });
    await bindings.set({ consumerId: ref(connection), credentialId: keyId });
  }
  async function assertGeneration({ credentialId, generation }: { credentialId: string; generation: number }) {
    if (((await storage.records.read({ key: credentialId }))?.generation ?? 0) !== generation) {
      throw new ApiConnectionError({ code: 'storage-conflict', message: 'This saved connection changed while sign-in was opening. Choose it again to start a new sign-in.' });
    }
  }
  function fencedService({ service, credentialId, generation }: { service: ApiConnectionService; credentialId: string; generation: number }): ApiConnectionService {
    return { ...service, start: (input, options) => required.transaction({ run: async () => {
      // Store the attempt under the same owner transaction as the generation check. A global
      // stop either precedes this start or invalidates its saved attempt before any callback.
      await assertGeneration({ credentialId, generation });
      return service.start(input, options);
    } }) };
  }
  return {
    bind,
    hasBinding: (connection: DeclaredApiConnection, _options = {}) => bindings.read({ consumerId: ref(connection) }).then(Boolean),
    getStatus: async (connection: DeclaredApiConnection, _options = {}) => consumer.getStatus(await target(connection)),
    async readAccount(connection: DeclaredApiConnection, _options = {}) {
      const shared = await consumer.getStatus(await target(connection));
      return shared?.status === 'connected' ? shared.account : null;
    },
    getAccessToken: async (connection: DeclaredApiConnection, options: { expectedAccountId?: string } = {}) => consumer.getAccessToken({ ...await target(connection), ...options }),
    async selectLocal(connection: DeclaredApiConnection, _options = {}) {
      await required.transaction({ run: async () => {
        const binding = await bindings.read({ consumerId: ref(connection) });
        if (binding) await required.attachments.detach({ siteId, keyId: binding.credentialId });
        await bindings.remove({ consumerId: ref(connection) });
      } });
    },
    async stopUsing(connection: DeclaredApiConnection, _options = {}) {
      await required.transaction({ run: async () => {
        const binding = await bindings.read({ consumerId: ref(connection) });
        if (binding) await required.attachments.detach({ siteId, keyId: binding.credentialId });
      } });
    },
    async prepare({ connection, actorId, context, redirectUri }: { connection: DeclaredApiConnection; actorId: string; context: SharedOAuthIssuingContext; redirectUri?: string }, _options = {}) {
      if (!siteId || actorId !== await required.ownerPrincipalId) throw unavailable();
      const generation = (await storage.records.read({ key: context.credentialId }))?.generation ?? 0;
      const liveConnection = await declared(context);
      await storage.saveContext({ credentialId: context.credentialId, context });
      const service = required.createService({ connection: liveConnection, context, redirectUri });
      // The person's explicit choice grants this site before the provider round trip. A stop
      // removes that grant; a late callback only verifies it and can never restore it.
      await required.transaction({ run: async () => {
        await assertGeneration({ credentialId: context.credentialId, generation });
        await bindings.set({ consumerId: ref(liveConnection), credentialId: context.credentialId });
        await required.attachments.attach({ siteId, keyId: context.credentialId, siteName: required.siteName });
      } });
      return { service: fencedService({ service, credentialId: context.credentialId, generation }), workspaceId: 'project', async onCompleted() {
        await required.transaction({ run: async () => {
          const binding = await bindings.read({ consumerId: ref(liveConnection) });
          if (binding?.credentialId !== context.credentialId) throw new ApiConnectionError({ code: 'access-denied',
            message: 'This site stopped using the shared connection while sign-in was open. Choose the shared connection again to allow access.' });
          await consumer.assertAuthorized(await target(liveConnection));
        } });
      } };
    },
  };
}
