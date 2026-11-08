/** Corrected session-2 G-card: six real credential_save paths, without production changes. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import test, { after } from 'node:test';
import type { SurfaceEmission, ToolExecutionContext, ToolHandler } from '@jini-ai/core';
import { createSystemClock } from '@jini-ai/core/primitives';
import { createSurfaceExchangeStore, SURFACE_DISMISSED_PARAM } from '@jini-ai/daemon/surface-exchanges';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import type { UIResource } from '@jini-ai/ui/mcp-ui/surfaces';
import { createTempSiteLayoutFixture, testSiteLayoutContext } from '../../__tests__/fixtures/site-layout-context.js';
import { credentialSaveFixtureRegistrations } from '../../__tests__/support/credential-save.js';
import type { PluginCredentialCard } from '../../contracts/core/plugin-credential-card.js';
import { buildApiCredentialSaveHandlers, type CustomCredentialsToolDeps } from '../../features/custom-credentials/tool-registrations.js';
import { InMemoryCustomCredentialSetRepo } from '../../features/custom-credentials/repo.memory.js';
import { createCustomCredential } from '../../features/custom-credentials/store.js';
import { loadFixtureAuthSchemes } from '../../features/custom-credentials/__tests__/fixture-auth-schemes.fixture.js';
import { buildPublishHostCredentialHandler, type StaticPublishToolDeps } from '../../features/deployments/publish-agent-tools.js';
import { InMemoryVendorCredentialSetRepo } from '../../features/deployments/publish-credentials/repo.memory.js';
import { buildSourceControlCredentialHandler } from '../../features/source-control/tool-registrations.js';
import type { SourceControlCredentialSetupDeps } from '../../features/source-control/credential-setup.js';
import { InMemorySourceControlCredentialSetRepo } from '../../features/source-control/repo.memory.js';
import { githubFromSource } from '../../features/source-control/__tests__/fixtures/github-from-source.js';
import { saveAgentPluginToken, type AgentPluginAccessTokenToolDeps } from '../../features/agent-plugins/access-token-tool.js';
import { mcpTestPort, credentialTestPort } from '../../features/agent-plugins/__tests__/fixtures/connection-service-ports.js';
import { InMemoryExternalMcpServerRepo } from '../../features/external-mcp/external-mcp-store.memory.js';
import { saveExternalMcpServer } from '../../features/external-mcp/external-mcp-store.js';
import { InMemoryKeyring } from '../../features/webhooks/keyring.memory.js';
import { AesGcmSecretSealer } from '../../features/webhooks/secret-sealer.aesgcm.js';
import type { HttpRequest } from '../../platform/http/index.js';

const GOLDEN = new URL('./fixtures/moved-tools.credential-cards.golden.json', import.meta.url);
const SECRET = 'gcard_secret_never_echoed_1234';
const WORKSPACE = 'ws-gcard', PRINCIPAL = 'owner', TOOL = 'credential_save';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const layouts = createTempSiteLayoutFixture({});
after(layouts.cleanup);
type Path = 'rotation' | 'pluginProvider' | 'plainCreate' | 'publishHost' | 'sourceControl' | 'agentPluginToken';
const paths: Path[] = ['rotation', 'pluginProvider', 'plainCreate', 'publishHost', 'sourceControl', 'agentPluginToken'];

const card: PluginCredentialCard = {
  pluginId: 'acme', providerId: 'acme', label: 'Acme API', ownedApiLabel: 'Acme API', category: 'ops',
  baseUrl: 'https://api.acme.test', title: 'Connect Acme secure key', intro: 'Acme needs a scoped key.',
  helpUrl: 'https://acme.test/keys', helpLabel: 'Create a scoped key', keyHint: 'Use a read-write key.',
  usedFor: ['Read records', 'Write records'], fields: [{ name: 'region', label: 'Region', required: true }],
  probeUrl: 'https://api.acme.test/user', saveKind: 'api',
};

function normalized(value: unknown): unknown { return JSON.parse(JSON.stringify(value).replace(UUID, '<uuid>')); }

/** Full-text hash pins scripts/styles too; markup exposes title, details, fields and visible copy. */
function emittedCard(emission: SurfaceEmission) {
  const resource = (emission.payload as { resource: UIResource }).resource;
  const { text, ...identity } = resource.resource;
  const stable = text.replace(UUID, '<uuid>');
  const app = stable.match(/var APP_INFO = (\{[^\n]+\});/);
  assert.ok(app, 'the real emitted card has app identity');
  return {
    channel: emission.channel, type: resource.type, ...identity,
    app: JSON.parse(app[1]!), frameSize: Object.entries(resource.resource._meta ?? {}).find(([key]) => key.endsWith('preferred-frame-size'))?.[1] ?? null,
    sha256: createHash('sha256').update(stable).digest('hex'),
    markup: stable.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '').replace(/<style[^>]*>[\s\S]*?<\/style>/g, '').replace(/\n\s*\n/g, '\n').trim(),
  };
}

async function setup(path: Path) {
  const keyring = new InMemoryKeyring(), sealer = new AesGcmSecretSealer(keyring);
  const clock = { nowMs: () => Date.parse('2026-11-07T00:00:00.000Z'), nowIso: () => '2026-11-07T00:00:00.000Z' };
  const idGen = { newId: () => 'credential-1' };
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => 'exchange-1' }, defaultChannel: 'mcp-ui' });
  const requests: { method: string; url: string }[] = [];
  let cardLoads = 0;
  const selectedCard = { ...card, ...(path === 'publishHost' ? { providerId: 'acme-host', saveKind: 'publish-host' as const, saveTarget: 'acme-host' } : {}),
    ...(path === 'sourceControl' ? { providerId: 'github', saveKind: 'source-control' as const, saveTarget: 'github' } : {}),
    ...(path === 'agentPluginToken' ? { saveKind: 'agent-plugin-token' as const, saveTarget: 'acme' } : {}) };
  const loadCards = async () => { cardLoads++; return [selectedCard]; };
  const authorize = async () => ({ allowed: true, reason: 'matched' });
  const http = { send: async (request: HttpRequest) => { requests.push({ method: request.method, url: request.url }); return { status: 200, headers: {}, bodyText: '[]' }; } };
  const fetchFn: typeof fetch = async input => { requests.push({ method: 'GET', url: String(input) }); return new Response('{"login":"gcard-owner"}', { status: 200 }); };
  const common = { workspaceId: WORKSPACE, clock, idGen, authorize, siteAssistantSecretKeyring: keyring, siteAssistantSecretSealer: sealer, loadPluginCredentialCards: loadCards, fetchFn };
  let handler: ToolHandler, input: Record<string, unknown>, values: Record<string, unknown> = { token: SECRET };
  if (path === 'rotation' || path === 'pluginProvider' || path === 'plainCreate') {
    const repo = new InMemoryCustomCredentialSetRepo();
    if (path === 'rotation') await createCustomCredential({ repo, sealer, keyring, clock, idGen }, { workspaceId: WORKSPACE, label: card.label, category: 'ops', baseUrl: card.baseUrl, connection: { token: 'previous_gcard_key_5678' } });
    const deps: CustomCredentialsToolDeps = { ...common, customCredentialSetRepo: repo, customCredentialsHttpClient: http,
      loadAuthSchemes: loadFixtureAuthSchemes, loadSourceControlProviders: async () => ({ list: () => [], get: () => undefined, refusals: [] }) };
    const handlers = buildApiCredentialSaveHandlers({ routeDeps: deps, surfaces: { surfaceExchanges } });
    handler = path === 'rotation' ? handlers.rotate : path === 'pluginProvider' ? handlers.pluginProvider : handlers.create;
    input = path === 'rotation' ? { kind: 'api', target: card.label } : path === 'pluginProvider' ? { kind: 'plugin-provider', target: 'acme' } : { kind: 'api', label: 'Generic API', baseUrl: card.baseUrl, category: 'ops' };
    values = path === 'plainCreate' ? { token: SECRET, label: 'Generic API', baseUrl: card.baseUrl, category: 'ops', worksFor: [] } : { token: SECRET, region: 'eu' };
  } else if (path === 'publishHost') {
    const host = { pluginId: 'acme', descriptor: { id: 'acme-host', label: 'Acme Host', module: 'host.mjs', configFields: [],
      credential: { vendorId: 'acme-host', tokenField: 'token', fields: [{ name: 'token', label: 'Token', required: true, secret: true }] } }, module: { create: () => assert.fail('credential save must not publish') } };
    const deps = { ...common, vendorCredentialSetRepo: new InMemoryVendorCredentialSetRepo(),
      loadDeployTargets: async () => ({ get: (id: string) => id === 'acme-host' ? host : undefined, list: () => [host], refusals: [] }) } as unknown as StaticPublishToolDeps;
    handler = buildPublishHostCredentialHandler({ deps, surfaces: { surfaceExchanges } });
    input = { kind: 'publish-host', target: 'acme-host' };
  } else if (path === 'sourceControl') {
    const deps = { ...common, sourceControlCredentialSetRepo: new InMemorySourceControlCredentialSetRepo(), loadSourceControlProviders: githubFromSource } satisfies SourceControlCredentialSetupDeps;
    handler = buildSourceControlCredentialHandler({ deps, surfaces: { surfaceExchanges } });
    input = { kind: 'source-control', target: 'github', label: 'Backup connection' };
    values = { token: SECRET, label: 'Backup connection' };
  } else {
    const repo = new InMemoryExternalMcpServerRepo();
    await saveExternalMcpServer({ repo, sealer, keyring, clock }, { workspaceId: WORKSPACE, serverId: 'acme', transport: 'streamable_http', authMode: 'oauth', enabled: false, command: '',
      url: 'https://mcp.acme.test/mcp', args: '', allowedToolNames: '', writeAllowedToolNames: '', principalId: PRINCIPAL, provisionedByPluginId: 'acme' });
    const deps: AgentPluginAccessTokenToolDeps = testSiteLayoutContext({ ...layouts.deps, workspaceId: WORKSPACE, authorize, clock,
      mcp: mcpTestPort({ repo, sealer, keyring, clock }), credentials: credentialTestPort({ httpClient: http, loadCards }), preferences: { locale: async () => 'en' },
      resolveInstalledPlugin: async () => ({ servers: { acme: { type: 'streamable-http', url: 'https://mcp.acme.test/mcp', authMode: 'oauth', tokenAuth: { helpUrl: card.helpUrl!, probeUrl: card.probeUrl! } } } }),
      notifyRosterChanged: async () => {}, onConnected: async () => {}, isPluginOffByOperator: async () => false, switchPluginOn: async () => true,
    });
    handler = (ctx, optional = {}) => saveAgentPluginToken({ ctx, routeDeps: deps, surfaces: { surfaceExchanges } }, optional);
    input = { kind: 'agent-plugin-token', target: 'acme' };
  }
  const adapter = path === 'rotation' ? 'apiRotate' : path === 'plainCreate' ? 'apiCreate' : path;
  const registration = credentialSaveFixtureRegistrations({ adapters: { [adapter]: handler } })[0]!;
  return { registration, surfaceExchanges, requests, cardLoads: () => cardLoads, input, values };
}

async function answered(path: Path, dismissed: boolean) {
  const env = await setup(path), emissions: SurfaceEmission[] = [];
  const ready = Promise.withResolvers<void>();
  const controller = new AbortController();
  const ctx: ToolExecutionContext = { executionId: 'exec-gcard', principal: { id: PRINCIPAL }, run: { id: 'run-gcard' }, input: env.input, signal: controller.signal };
  const pending = env.registration.handler(ctx, { emitSurface: async emission => { emissions.push(emission); ready.resolve(); } });
  try {
    await Promise.race([ready.promise, pending.then(() => assert.fail(`${path} returned without raising its real card`))]);
    assert.equal(emissions.length, 1);
    const openBefore = env.surfaceExchanges.size();
    assert.deepEqual(env.surfaceExchanges.deliver({ exchangeId: 'exchange-1', principalId: PRINCIPAL, params: dismissed ? { [SURFACE_DISMISSED_PARAM]: true } : env.values }, { toolId: TOOL }), { ok: true });
    const result = await pending as { saved?: boolean; created?: boolean };
    assert.equal(result.saved ?? result.created, !dismissed, `${path} actually ${dismissed ? 'dismissed' : 'saved'}`);
    assert.equal(env.surfaceExchanges.size(), 0);
    assert.ok(!JSON.stringify([result, emissions]).includes(SECRET), 'secret never reaches model results or cards');
    return normalized({ cards: emissions.map(emittedCard), outcome: emissions.length > 1 ? emittedCard(emissions[1]!) : null, result,
      counters: { cards: emissions.length, probeRequests: env.requests, cardLoads: env.cardLoads(), openExchangesBefore: openBefore, openExchangesAfter: env.surfaceExchanges.size() } });
  } finally {
    controller.abort();
    await pending.catch(() => undefined);
  }
}

test('six real credential_save card paths retain saved/dismissed resources, frames and counters', async () => {
  const snapshot: Record<string, unknown> = {};
  for (const path of paths) snapshot[path] = { saved: await answered(path, false), dismissed: await answered(path, true) };
  const json = JSON.stringify(snapshot, null, 2) + '\n';
  if (process.env.MOVED_TOOLS_CREDENTIAL_CARDS_GOLDEN_WRITE === '1') writeFileSync(GOLDEN, json);
  assert.deepEqual(JSON.parse(json), JSON.parse(readFileSync(GOLDEN, 'utf8')));
});
