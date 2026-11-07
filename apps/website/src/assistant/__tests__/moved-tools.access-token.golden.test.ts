/**
 * @file P1b gap fill, written before any move, from unmoved code: the `agent_plugin_set_access_token`
 * path, which `moved-tools.golden.test.ts` does not reach (it is no longer a tool id of its own; it
 * runs as `credential_save` with kind `agent-plugin-token`, adapter `agentPluginToken`). Pins the
 * refusal text, the card the REAL tool emits from its form spec (the main golden renders specs
 * itself, at a fixed exchange id), each outcome card and result, and the per-save cost counters
 * (probe requests, emitted surfaces). `moved-tools.golden.json` is not touched: this is a separate
 * golden, `fixtures/moved-tools.access-token.golden.json`.
 *
 * Never regenerate except when the plan's resync rule says so: `MOVED_TOOLS_ACCESS_TOKEN_GOLDEN_WRITE=1`
 * rewrites the fixture.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import test, { after } from 'node:test';
import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from '@jini-ai/core';
import { createSurfaceExchangeStore, SURFACE_DISMISSED_PARAM } from '@jini-ai/daemon/surface-exchanges';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { createSystemClock } from '@jini-ai/core/primitives';
import type { UIResource } from '@jini-ai/ui/mcp-ui/surfaces';
import { createTempSiteLayoutFixture, testSiteLayoutContext } from '../../__tests__/fixtures/site-layout-context.js';
import { credentialSaveFixtureInput, credentialSaveFixtureRegistrations } from '../../__tests__/support/credential-save.js';
import { mcpTestPort, credentialTestPort } from '../../features/agent-plugins/__tests__/fixtures/connection-service-ports.js';
import { saveAgentPluginToken, type AgentPluginAccessTokenToolDeps } from '../../features/agent-plugins/access-token-tool.js';
import type { McpServerConfig } from '../../features/agent-plugins/mcp-metadata.js';
import { InMemoryExternalMcpServerRepo } from '../../features/external-mcp/external-mcp-store.memory.js';
import { saveExternalMcpServer } from '../../features/external-mcp/external-mcp-store.js';
import { AesGcmSecretSealer } from '../../features/webhooks/secret-sealer.aesgcm.js';
import { InMemoryKeyring } from '../../features/webhooks/keyring.memory.js';
import type { HttpRequest, HttpResponse } from '../../platform/http/index.js';

const GOLDEN_URL = new URL('./fixtures/moved-tools.access-token.golden.json', import.meta.url);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const TOOL = 'credential_save';
const WORKSPACE = 'ws-golden';
const PRINCIPAL = 'owner';
const TOKEN = 'golden_access_token_value_never_echoed';
const PROBE_URL = 'https://api.acme.test/v1/projects';
const HELP_URL = 'https://acme.test/account/tokens';
const SERVERS: Readonly<Record<string, McpServerConfig>> = {
  acme: { type: 'streamable-http', url: 'https://mcp.acme.test/mcp', authMode: 'oauth', tokenAuth: { helpUrl: HELP_URL, probeUrl: PROBE_URL } },
};

const layouts = createTempSiteLayoutFixture({});
after(layouts.cleanup);

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
/** Same normalization as `moved-tools.golden.test.ts`'s `card`. */
const card = (resource: UIResource) => {
  const text = resource.resource.text.replace(UUID, '<uuid>');
  return { uri: resource.resource.uri.replace(UUID, '<uuid>'), mimeType: resource.resource.mimeType, sha256: sha256(text),
    markup: text.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '').replace(/<style[^>]*>[\s\S]*?<\/style>/g, '').replace(/\n\s*\n/g, '\n').trim() };
};

async function setup(options: { servers?: Readonly<Record<string, McpServerConfig>> | null; respond?: () => HttpResponse } = {}) {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = { nowMs: () => Date.parse('2026-11-07T00:00:00.000Z'), nowIso: () => '2026-11-07T00:00:00.000Z' };
  const requests: HttpRequest[] = [];
  const http = { send: async (request: HttpRequest): Promise<HttpResponse> => {
    requests.push(request);
    return (options.respond ?? (() => ({ status: 200, headers: {}, bodyText: '[]' })))();
  } };
  await saveExternalMcpServer({ repo, sealer, keyring, clock }, {
    workspaceId: WORKSPACE, serverId: 'acme', transport: 'streamable_http', authMode: 'oauth', enabled: false, command: '',
    url: 'https://mcp.acme.test/mcp', args: '', allowedToolNames: '', writeAllowedToolNames: '', principalId: PRINCIPAL, provisionedByPluginId: 'acme',
  });
  const servers = options.servers === undefined ? SERVERS : options.servers;
  const deps: AgentPluginAccessTokenToolDeps = testSiteLayoutContext({ ...layouts.deps,
    workspaceId: WORKSPACE,
    authorize: (async () => ({ allowed: true, reason: 'matched' })) as unknown as AgentPluginAccessTokenToolDeps['authorize'],
    clock, mcp: mcpTestPort({ repo, sealer, keyring, clock }), notifyRosterChanged: async () => {},
    credentials: credentialTestPort({ httpClient: http, loadCards: async () => [] }),
    preferences: { locale: async () => 'en' },
    resolveInstalledPlugin: async (pluginId: string) => (pluginId === 'acme' && servers !== null ? { servers } : null),
    onConnected: async () => {}, isPluginOffByOperator: async () => false, switchPluginOn: async () => true,
  });
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => 'exchange-1' }, defaultChannel: 'mcp-ui' });
  const tools = new Map(credentialSaveFixtureRegistrations({ adapters: {
    agentPluginToken: (ctx, optional = {}) => saveAgentPluginToken({ ctx, routeDeps: deps, surfaces: { surfaceExchanges } }, optional),
  } }).map((r) => [r.descriptor.id, r]));
  return { tools, surfaceExchanges, requests };
}

type Env = Awaited<ReturnType<typeof setup>>;

function call(env: Env, options: { input?: unknown; emitSurface?: SurfaceEmitter } = {}) {
  const registration = env.tools.get(TOOL) as ToolRegistration;
  const ctx: ToolExecutionContext = { executionId: 'exec-1', principal: { id: PRINCIPAL }, run: { id: 'run-1' },
    input: credentialSaveFixtureInput({ input: options.input ?? { pluginId: 'acme' }, kind: 'agent-plugin-token' }), signal: new AbortController().signal };
  return registration.handler(ctx, options.emitSurface ? { emitSurface: options.emitSurface } : {});
}

async function refusal(env: Env, input?: unknown) {
  const emitted: unknown[] = [];
  const message = await call(env, { input, emitSurface: async (s) => void emitted.push(s) }).then(() => null, (error: unknown) => (error as Error).message);
  return { message, emittedSurfaces: emitted.length, probeRequests: env.requests.length, openExchanges: env.surfaceExchanges.size() };
}

/** Raises the real form, answers it with `params`, and records every emitted card and the result. */
async function answered(env: Env, params: Record<string, unknown>) {
  const emitted: UIResource[] = [];
  const pending = call(env, { emitSurface: async (s) => void emitted.push((s as { payload: { resource: UIResource } }).payload.resource) });
  while (emitted.length === 0) await new Promise((resolve) => setImmediate(resolve));
  env.surfaceExchanges.deliver({ exchangeId: 'exchange-1', principalId: PRINCIPAL, params }, { toolId: TOOL });
  const result = await pending;
  assert.ok(!JSON.stringify([result, emitted.map((r) => r.resource.text)]).includes(TOKEN), 'the token is never echoed');
  return {
    cards: emitted.map(card), result,
    counters: { emittedSurfaces: emitted.length, probeRequests: env.requests.map(({ method, url }) => ({ method, url })), openExchangesAfter: env.surfaceExchanges.size() },
  };
}

async function snapshot() {
  return {
    refusals: {
      notInstalled: await refusal(await setup({ servers: null })),
      noTokenAuth: await refusal(await setup({ servers: { acme: { type: 'streamable-http', url: 'https://mcp.acme.test/mcp', authMode: 'oauth' } } })),
      twoTokenSignIns: await refusal(await setup({ servers: { ...SERVERS, second: { type: 'streamable-http', url: 'https://second.acme.test/mcp', authMode: 'oauth', tokenAuth: { helpUrl: HELP_URL, probeUrl: PROBE_URL } } } })),
      tokenInInput: await refusal(await setup(), { pluginId: 'acme', token: TOKEN }),
      missingPluginId: await refusal(await setup(), { pluginId: '' }),
    },
    saved: await answered(await setup(), { token: TOKEN }),
    rejected401: await answered(await setup({ respond: () => ({ status: 401, headers: {}, bodyText: '{"message":"raw vendor body"}' }) }), { token: TOKEN }),
    unavailable503: await answered(await setup({ respond: () => ({ status: 503, headers: {}, bodyText: 'raw vendor body' }) }), { token: TOKEN }),
    dismissed: await answered(await setup(), { [SURFACE_DISMISSED_PARAM]: true }),
  };
}

test('agent_plugin_set_access_token (credential_save, agent-plugin-token): text, real cards, outcomes and counters match the golden recorded before any move', async () => {
  const json = `${JSON.stringify(await snapshot(), null, 2)}\n`;
  if (process.env.MOVED_TOOLS_ACCESS_TOKEN_GOLDEN_WRITE === '1') writeFileSync(GOLDEN_URL, json);
  const golden = JSON.parse(readFileSync(GOLDEN_URL, 'utf8')) as Record<string, unknown>;
  const actual = JSON.parse(json) as Record<string, unknown>;
  for (const section of Object.keys(golden)) assert.deepEqual(actual[section], golden[section], section);
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(golden).sort());
});
