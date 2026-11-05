import { randomBytes, randomUUID } from 'node:crypto';
import { ApiConnectionError, assertSharedOAuthCompatibility, createSharedOAuthConsumer, deriveApiConnectionKey, type ApiConnectionRecord } from '@jini-ai/integrations/api-connections';
import { beginAuthorizationCode, beginDeviceAuthorization, completeAuthorizationCode, createSealedAuthorizationState, createTokenRefresher,
  OAuthError, pollDeviceAuthorizationOnce, refreshAccessToken, type OAuthClient, type OAuthProviderDescriptor, type OAuthTokenSet } from '@jini-ai/oauth';
import { formatAad } from '@jini-ai/platform/secrets';
import type { SharedOAuthIssuingContext, SharedOAuthOwnerStorage } from '../api-connections/shared-owner.js';
import type { SiteOAuthBindings } from '../project-keys/site-references.js';
import type { KeyAttachments, ProjectKeyTransaction } from '../project-keys/attachments.js';
import { hostedMcpSignInLink } from '../api-connections/browser-binding.js';
import type { ExternalMcpConnectStart, ExternalMcpOAuthDeps, ExternalMcpServerRecord } from './contracts.js';

export interface SharedExternalMcpOwner {
  readonly owner: SharedOAuthOwnerStorage;
  readonly bindings: SiteOAuthBindings;
  readonly attachments: KeyAttachments;
  readonly transaction: ProjectKeyTransaction;
  readonly siteId: string;
  readonly siteName: string;
  readonly ownerPrincipalId: string | Promise<string>;
  /** Production supplies the existing bounded owner inventory query. */
  readonly inventory?: () => Promise<readonly import('@jini-ai/platform/secrets/credential-sets').VaultRecord[]>;
}
export interface SharedMcpConfiguration {
  readonly record: ExternalMcpServerRecord;
  readonly provider: OAuthProviderDescriptor;
  readonly client: OAuthClient;
  readonly scopes: readonly string[];
  readonly resource?: string;
  readonly issuer?: string;
}
interface SharedMcpContext extends SharedOAuthIssuingContext {
  readonly mcp: { readonly provider: OAuthProviderDescriptor; readonly scopes: readonly string[]; readonly url: string | null; readonly grant: string | null };
}
const unavailable = () => new ApiConnectionError({ code: 'connection-not-found', message: 'This shared MCP connection is unavailable here. Choose a saved connection or sign in explicitly in Settings → External MCP.' });
const MCP_PLUGIN_ID = 'external-mcp';
const consumerId = (serverId: string) => `mcp:${serverId}`;
const invalidState = () => new OAuthError({ code: 'OAUTH_INVALID_STATE', message: 'This shared sign-in was stopped or replaced.', operatorAction: 'Start sign-in again in Settings → External MCP.' });

/** Site-specific bindings over the existing owner vault. Every call checks live grants; no token is copied to the site.
 * @complexity Selected-row reads per call; one cached refresher per selected owner credential, no timers or polling.
 */
export function createSharedExternalMcpOAuth(required: {
  deps: ExternalMcpOAuthDeps;
  shared: SharedExternalMcpOwner;
  resolveProvider: (record: ExternalMcpServerRecord) => OAuthProviderDescriptor;
  configure: (input: { serverId: string; redirectUri?: string }) => Promise<SharedMcpConfiguration>;
}, _optional = {}) {
  const { deps, shared, configure, resolveProvider } = required;
  const { owner, bindings, attachments, siteId } = shared;
  const refreshers = new Map<string, ReturnType<typeof createTokenRefresher>>();
  const deviceKeyFor = (serverId: string, credentialId: string, generation: number) => JSON.stringify(['shared', siteId, serverId, credentialId, generation]);
  const bindingFor = ({ serverId }: { serverId: string }) => bindings.read({ consumerId: consumerId(serverId) });
  async function contextFor(credentialId: string): Promise<SharedMcpContext> {
    const context = await owner.readContext({ credentialId }) as SharedMcpContext | null;
    if (!context?.mcp || context.identity.pluginId !== MCP_PLUGIN_ID || context.identity.connectionId !== 'oauth') throw unavailable();
    return context;
  }
  function target(record: ExternalMcpServerRecord, context: SharedMcpContext) {
    if (record.authMode !== 'oauth' || record.transport === 'stdio' || record.url !== context.mcp.url) throw unavailable();
    const endpoints = JSON.parse(record.oauthEndpointsJson ?? '{}') as { tokenEndpoint?: string; resource?: string; issuer?: string };
    const scopes = JSON.parse(record.oauthScopesJson ?? '[]') as string[];
    const expectedProvider = record.oauthProviderId === null ? undefined : resolveProvider(record);
    const resource = endpoints.resource ?? context.identity.resource;
    const issuer = endpoints.issuer ?? context.identity.issuer;
    return { siteId, consumerId: consumerId(record.serverId), identity: { pluginId: MCP_PLUGIN_ID, connectionId: 'oauth',
      tokenEndpoint: endpoints.tokenEndpoint ?? expectedProvider?.tokenEndpoint ?? context.identity.tokenEndpoint,
      ...(resource === undefined ? {} : { resource }),
      ...(issuer === undefined ? {} : { issuer }) }, requiredScopes: scopes };
  }
  async function refreshFor(credentialId: string) {
    const cached = refreshers.get(credentialId);
    if (cached) return cached;
    const context = await contextFor(credentialId);
    const tokens = owner.tokensFor({ context });
    const refresher = createTokenRefresher({ clock: deps.clock, sleep: ({ ms }) => new Promise(resolve => setTimeout(resolve, ms)), port: {
      ...tokens,
      refresh: ({ refreshToken }) => refreshAccessToken({ ...deps.httpPorts, clock: deps.clock, tokenEndpoint: context.identity.tokenEndpoint,
        client: context.client, refreshToken }, { scopes: context.mcp.scopes, resource: context.identity.resource, timeoutMs: 15_000 }),
    } });
    refreshers.set(credentialId, refresher);
    return refresher;
  }
  const consumer = createSharedOAuthConsumer({
    bindings: { read: ({ consumerId }) => bindings.read({ consumerId }) },
    grants: { isGranted: ({ siteId, credentialId }) => attachments.isAttached({ siteId, keyId: credentialId }) },
    connections: { read: input => owner.readConnection(input), getAccessToken: async ({ credentialId, expectedGeneration }) => {
      const record = await owner.records.read({ key: credentialId });
      if (record?.generation !== expectedGeneration || record.status !== 'connected') throw unavailable();
      try { return await (await refreshFor(credentialId)).getAccessToken({ key: credentialId }); }
      catch (error) {
        if (error instanceof OAuthError && error.code === 'OAUTH_INVALID_GRANT') {
          await owner.records.compareAndSet({ key: credentialId, expectedRevision: record.revision,
            record: { ...record, status: 'reconnect-required', revision: record.revision + 1 } });
        }
        throw error;
      }
    } },
  });
  async function selected(serverId: string) {
    const binding = await bindingFor({ serverId });
    if (!binding) return null;
    const [context, record] = await Promise.all([contextFor(binding.credentialId), deps.repo.findByServerId({ workspaceId: deps.workspaceId, serverId })]);
    if (!record) throw unavailable();
    return { binding, context, record, target: target(record, context) };
  }
  async function assertAttempt(serverId: string, credentialId: string, generation: number) {
    const [binding, record, granted] = await Promise.all([bindingFor({ serverId }), owner.records.read({ key: credentialId }), attachments.isAttached({ siteId, keyId: credentialId })]);
    if (binding?.credentialId !== credentialId || !granted || !record) throw invalidState();
    if (record.generation !== generation || record.status === 'revocation-pending') throw invalidState();
    return record;
  }
  function stateFor(input: { serverId: string; credentialId: string; generation: number; browserBinding?: string }) {
    const aad = formatAad({ kind: 'oauth-redirect-state', version: 'v1', parts: [JSON.stringify(['shared', siteId, input.serverId, input.credentialId, input.generation, input.browserBinding])] });
    return createSealedAuthorizationState({ clock: deps.clock, workspaceId: siteId, serverId: input.serverId, codec: {
      seal: async ({ plaintext }) => Buffer.from(JSON.stringify(await deps.sealer.seal({ plaintext, key: await deps.keyring.activeKey({}), aad }))).toString('base64url'),
      open: async ({ state }) => deps.sealer.open({ sealed: JSON.parse(Buffer.from(state, 'base64url').toString()) }, { aad }),
    } });
  }
  async function assertOwner(actorId: string | undefined) {
    if (actorId !== await shared.ownerPrincipalId) throw new ApiConnectionError({ code: 'access-denied', message: 'Use the installation owner’s signed-in session on this Mac to manage saved connections.' });
  }
  async function createSelection(input: { serverId: string; redirectUri?: string }) {
    const server = await deps.repo.findByServerId({ workspaceId: deps.workspaceId, serverId: input.serverId });
    if (!server || server.transport === 'stdio') throw unavailable();
    const config = await configure(input);
    const credentialId = deriveApiConnectionKey({ workspaceId: 'project', pluginId: MCP_PLUGIN_ID, connectionId: randomUUID() });
    const context: SharedMcpContext = { credentialId, identity: { pluginId: MCP_PLUGIN_ID, connectionId: 'oauth', clientId: config.client.clientId,
      tokenEndpoint: config.provider.tokenEndpoint, ...(config.resource === undefined ? {} : { resource: config.resource }), ...(config.issuer === undefined ? {} : { issuer: config.issuer }) },
      client: config.client, clientKind: 'public', descriptor: { pluginId: MCP_PLUGIN_ID, connectionId: 'oauth', label: config.record.label ?? config.record.serverId,
        authorizationEndpoint: config.provider.authorizationEndpoint ?? config.provider.tokenEndpoint, tokenEndpoint: config.provider.tokenEndpoint,
        authorizationParams: { public: {}, confidential: {} }, forceConsentParams: {}, startParams: [], callbackFields: [] },
      mcp: { provider: config.provider, scopes: config.scopes, url: config.record.url, grant: config.record.oauthGrant } };
    const record: ApiConnectionRecord = { key: credentialId, workspaceId: 'project', pluginId: MCP_PLUGIN_ID, connectionId: 'oauth', status: 'disconnected',
      revision: 1, generation: 0, account: null, grantedScopes: [], staged: null, revocationFailure: null, updatedAt: new Date(deps.clock.nowMs()).toISOString() };
    await owner.saveContext({ credentialId, context });
    if (!await owner.records.compareAndSet({ key: credentialId, expectedRevision: 0, record })) throw unavailable();
    // Reference first. A partial write confers no authority; a later Stop using here removes the grant before completion.
    await shared.transaction({ run: async () => {
      await bindings.set({ consumerId: consumerId(input.serverId), credentialId });
      await attachments.attach({ siteId, keyId: credentialId, siteName: shared.siteName });
    } });
    return { binding: { credentialId }, context };
  }
  async function install(serverId: string, context: SharedMcpContext, generation: number, tokens: OAuthTokenSet) {
    const grantedScopes = tokens.scopes.length ? tokens.scopes : context.mcp.scopes;
    if (context.mcp.scopes.some(scope => !grantedScopes.includes(scope))) throw unavailable();
    const record = await assertAttempt(serverId, context.credentialId, generation);
    const next = { ...record, revision: record.revision + 1, generation: generation + 1, status: 'connected' as const,
      grantedScopes: [...grantedScopes], updatedAt: new Date(deps.clock.nowMs()).toISOString() };
    if (!await owner.records.compareAndSet({ key: record.key, expectedRevision: record.revision, record: next })) throw invalidState();
    await owner.tokensFor({ context }).install({ key: record.key, tokens: { ...tokens, scopes: [...grantedScopes] }, generation: next.generation });
    await assertAttempt(serverId, context.credentialId, next.generation);
  }
  return {
    async list(input: { serverId: string; actorId: string }) {
      await assertOwner(input.actorId);
      const rows = await shared.inventory?.() ?? [];
      const candidates = rows.filter(row => row.meta.credentialFormat === 'oauth-token-set').slice(0, 50);
      const current = await bindingFor(input);
      const record = await deps.repo.findByServerId({ workspaceId: deps.workspaceId, serverId: input.serverId });
      const connections: { credentialId: string; label: string }[] = [];
      for (const row of candidates) {
        const context = await owner.readContext({ credentialId: row.id }) as SharedMcpContext | null;
        if (!context?.mcp || context.mcp.url !== record?.url) continue;
        const connection = await owner.readConnection({ credentialId: row.id });
        if (connection?.status === 'connected') connections.push({ credentialId: row.id, label: context.descriptor.label });
      }
      const status = current ? (await owner.readConnection(current))?.status ?? 'disconnected' : null;
      return { available: true, connections, current: current ? { ...current, status: status ?? 'disconnected', granted: await attachments.isAttached({ siteId, keyId: current.credentialId }) } : null };
    },
    hasBinding: async (input: { serverId: string }) => (await bindingFor(input)) !== null,
    async getAccessToken(input: { serverId: string }) {
      const found = await selected(input.serverId);
      return found ? consumer.getAccessToken(found.target) : undefined;
    },
    async assertAuthorized(input: { serverId: string }) {
      const found = await selected(input.serverId);
      if (!found) return false;
      await consumer.assertAuthorized(found.target);
      return true;
    },
    async useSaved(input: { serverId: string; credentialId: string; actorId: string }) {
      await assertOwner(input.actorId);
      const context = await contextFor(input.credentialId);
      const record = await deps.repo.findByServerId({ workspaceId: deps.workspaceId, serverId: input.serverId });
      if (!record) throw unavailable();
      const wanted = target(record, context);
      await shared.transaction({ run: async () => {
        const connection = await owner.readConnection({ credentialId: input.credentialId });
        if (connection?.status !== 'connected') throw unavailable();
        assertSharedOAuthCompatibility({ connection, target: wanted });
        await bindings.set({ consumerId: consumerId(input.serverId), credentialId: input.credentialId });
        await attachments.attach({ siteId, keyId: input.credentialId, siteName: shared.siteName });
      } });
      await consumer.assertAuthorized(wanted);
    },
    async useLocal(input: { serverId: string; actorId: string }) {
      await assertOwner(input.actorId);
      await shared.transaction({ run: async () => {
        const binding = await bindingFor(input);
        if (binding) await attachments.detach({ siteId, keyId: binding.credentialId });
        await bindings.remove({ consumerId: consumerId(input.serverId) });
      } });
    },
    async beginConnect(input: { serverId: string; redirectUri?: string; delivery?: 'hosted'; browserBinding?: string; actorId?: string; destination?: 'shared' }): Promise<ExternalMcpConnectStart> {
      await assertOwner(input.actorId);
      const found = input.destination === 'shared' ? await createSelection(input) : await selected(input.serverId) ?? await createSelection(input);
      const { context, binding } = found;
      const record = await owner.records.read({ key: binding.credentialId });
      if (!record) throw unavailable();
      await assertAttempt(input.serverId, binding.credentialId, record.generation);
      const provider = context.mcp.provider;
      if (context.mcp.grant === 'device_code') {
        const authorization = await beginDeviceAuthorization({ ...deps.httpPorts, provider, clock: deps.clock, client: context.client },
          { scopes: context.mcp.scopes, resource: context.identity.resource, timeoutMs: 15_000 });
        await assertAttempt(input.serverId, binding.credentialId, record.generation);
        await deps.devices.put(deviceKeyFor(input.serverId, binding.credentialId, record.generation), authorization);
        return { kind: 'device_code', userCode: authorization.userCode, verificationUri: authorization.verificationUri,
          verificationUriComplete: authorization.verificationUriComplete, expiresAt: authorization.expiresAt, intervalSeconds: authorization.intervalSeconds };
      }
      if (!input.redirectUri) throw unavailable();
      if (input.delivery === 'hosted') return { kind: 'redirect_required', authorizationUrl: hostedMcpSignInLink({ callbackUrl: input.redirectUri,
        workspaceId: deps.workspaceId, serverId: input.serverId }), expiresAt: new Date(deps.clock.nowMs() + 600_000).toISOString() };
      const started = await beginAuthorizationCode({ provider, guard: deps.httpPorts.guard, randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
        stateless: stateFor({ ...input, credentialId: binding.credentialId, generation: record.generation }), ownerKey: JSON.stringify([siteId, input.serverId, binding.credentialId]),
        client: context.client, redirectUri: input.redirectUri, options: { clientDisplayName: 'Tovu', softwareId: 'tovu', redirectUris: [input.redirectUri] } },
      { scopes: context.mcp.scopes, resource: context.identity.resource });
      return { kind: 'redirect_required', authorizationUrl: started.authorizationUrl, expiresAt: started.expiresAt };
    },
    async completeAuthorizationCallback(input: Parameters<import('./contracts.js').ExternalMcpOAuthService['completeAuthorizationCallback']>[0]) {
      const found = await selected(input.serverId);
      if (!found) throw invalidState();
      const { context, binding } = found;
      const record = await owner.records.read({ key: binding.credentialId });
      if (!record) throw invalidState();
      await assertAttempt(input.serverId, binding.credentialId, record.generation);
      const tokens = await completeAuthorizationCode({ ...deps.httpPorts, provider: context.mcp.provider, clock: deps.clock,
        stateless: stateFor({ ...input, credentialId: binding.credentialId, generation: record.generation }), redirectUri: input.redirectUri,
        ownerKey: JSON.stringify([siteId, input.serverId, binding.credentialId]), client: context.client, params: input.params }, { timeoutMs: 15_000 });
      await install(input.serverId, context, record.generation, tokens);
    },
    async pollDeviceAuthorization(input: { serverId: string }) {
      const found = await selected(input.serverId);
      if (!found) throw invalidState();
      const { context, binding } = found;
      const record = await owner.records.read({ key: binding.credentialId });
      if (!record) throw invalidState();
      await assertAttempt(input.serverId, binding.credentialId, record.generation);
      const deviceKey = deviceKeyFor(input.serverId, binding.credentialId, record.generation);
      const authorization = await deps.devices.get(deviceKey);
      if (!authorization) throw invalidState();
      try {
        const tokens = await pollDeviceAuthorizationOnce({ ...deps.httpPorts, provider: context.mcp.provider, clock: deps.clock,
          client: context.client, deviceCode: authorization.deviceCode, expiresAt: authorization.expiresAt }, { resource: context.identity.resource, timeoutMs: 15_000 });
        await deps.devices.delete(deviceKey);
        await install(input.serverId, context, record.generation, tokens);
        return { status: 'connected' as const };
      } catch (error) {
        if (error instanceof OAuthError && error.retryable) return { status: 'pending' as const, retryAfterSeconds: error.retryAfterSeconds ?? authorization.intervalSeconds };
        await deps.devices.delete(deviceKey);
        throw error;
      }
    },
    async markNeedsReauth(input: { serverId: string }) {
      const found = await selected(input.serverId);
      if (!found || !await attachments.isAttached({ siteId, keyId: found.binding.credentialId })) return;
      const record = await owner.records.read({ key: found.binding.credentialId });
      if (record?.status !== 'connected') return;
      await owner.records.compareAndSet({ key: record.key, expectedRevision: record.revision,
        record: { ...record, status: 'reconnect-required', revision: record.revision + 1 } });
    },
    async disconnect(input: { serverId: string }) {
      await shared.transaction({ run: async () => {
        const binding = await bindingFor(input);
        if (binding) await attachments.detach({ siteId, keyId: binding.credentialId });
      } });
    },
  };
}
