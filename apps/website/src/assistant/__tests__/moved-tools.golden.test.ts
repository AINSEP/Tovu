/**
 * @file Behavior golden for every tool, card and approval path the portable-fin plan moves into Jini
 * (P1b). Written before any move, from unmoved code: each later batch must keep this green.
 * `tool-metadata.baseline.json` pins metadata projections only; this pins the emitted text, schemas,
 * rendered cards, approval outcomes and the cost counters, so it stays a second, separate check.
 *
 * Sources: static tools from `realToolCatalog()`; `agent_plugin_<id>` and its memory tools from the
 * real installer + registrar (supporting-files fixture plugin); `p_<plugin>__<tool>` from the real
 * executable-tool registrar and approval owner (acme-office fixture). Never regenerate except when the
 * plan's resync rule says so: `MOVED_TOOLS_GOLDEN_WRITE=1` rewrites `fixtures/moved-tools.golden.json`.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { SURFACE_DISMISSED_PARAM, type ToolExecutionContext } from '@jini-ai/core';
import { createToolExecutor } from '@jini-ai/daemon';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createSystemClock } from '@jini-ai/core/primitives';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { buildFormSurface } from '@jini-ai/ui/mcp-ui/surfaces';
import type { SecretCardForm } from '@jini-ai/ui/mcp-ui/secret-card';
import { nativeToolMetadata } from '../../contracts/core/tool-metadata/index.js';
import { TOOL_APPROVAL_POLICY, EXTENSION_TOOL_APPROVAL_POLICY } from '../../contracts/headless/index.js';
import { applyPluginCredentialCard, buildPluginCredentialForm, type PluginCredentialCard } from '../../contracts/core/plugin-credential-card.js';
import { buildAgentPluginAccessTokenForm, buildAgentPluginAccessTokenOutcome, buildAgentPluginConnectCard } from '../../features/agent-plugins/connect-card-ui.js';
import { chooseApiConnectionDestination } from '../../features/agent-plugins/connect-destination.js';
import { APPROVAL_FAMILY_BY_EFFECT } from '../../features/agent-plugins/executable-tools/approval.js';
import { bootFixture, startConfirmingCall } from '../../features/agent-plugins/executable-tools/__tests__/fixtures.js';
import { installSupportingFilesFixture } from '../../features/agent-plugins/__tests__/fixtures/supporting-files.js';
import { InMemoryExternalMcpServerRepo } from '../../features/external-mcp/external-mcp-store.memory.js';
import { listExternalMcpServerViews } from '../../features/external-mcp/external-mcp-store.js';
import { sealExternalMcpVaultPayload } from '../../features/external-mcp/external-mcp-vault.js';
import { InMemoryKeyring } from '../../features/webhooks/keyring.memory.js';
import { AesGcmSecretSealer } from '../../features/webhooks/secret-sealer.aesgcm.js';
import { createAgentPluginStateStore } from '../../features/api-connections/plugin-state.js';
import { realToolCatalog } from './real-tool-catalog.fixture.js';

const GOLDEN_URL = new URL('./fixtures/moved-tools.golden.json', import.meta.url);
const STATIC_IDS = ['search_agent_plugin_local', 'agent_plugin_write_note', 'provider_status', 'credential_save', 'agent_plugin_connect'];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
type Descriptor = { id: string; description?: string; inputSchema?: unknown; sideEffects?: unknown; readOnly?: unknown; timeoutMs?: unknown; metadata?: unknown };
type Resource = { resource: { uri: string; mimeType: string; text: string } };

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const tool = (d: Descriptor) => ({ description: d.description, inputSchema: d.inputSchema, sideEffects: d.sideEffects ?? null, readOnly: d.readOnly ?? null,
  timeoutMs: d.timeoutMs ?? null, metadata: d.metadata ?? null, toolApprovalPolicy: TOOL_APPROVAL_POLICY[d.id] ?? null, nativeMetadata: nativeToolMetadata.byId[d.id] ?? null });
/** Visible markup without the engine's shared script and style; the hash still pins every byte. */
const card = ({ resource }: Resource) => {
  const text = resource.text.replace(UUID, '<uuid>');
  return { uri: resource.uri.replace(UUID, '<uuid>'), mimeType: resource.mimeType, sha256: sha256(text),
    markup: text.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '').replace(/<style[^>]*>[\s\S]*?<\/style>/g, '').replace(/\n\s*\n/g, '\n').trim() };
};
/** How secret-card renders a form (`renderForm` in the engine's secret card), at a fixed exchange id. */
const secretForm = (form: SecretCardForm, toolId: string) => {
  const exchange = { __exchangeId: 'exchange-1' };
  const surface = buildFormSurface({ ...form, uri: `ui://golden/${toolId}`, toolName: toolId, baseParams: exchange,
    cancel: { label: form.cancelLabel ?? 'Cancel', toolName: toolId, params: { ...exchange, [SURFACE_DISMISSED_PARAM]: true } } } as never);
  return { spec: form, rendered: card(surface as unknown as Resource) };
};
const outcome = (result: Record<string, unknown>) => { const { executionId: _id, ...rest } = result; return JSON.parse(JSON.stringify(rest).replace(UUID, '<uuid>')); };
const ACME_CARD: PluginCredentialCard = { pluginId: 'acme-office', providerId: 'acme', label: 'Acme Office', category: 'api', baseUrl: 'https://api.acme.test',
  title: 'Connect Acme Office', intro: 'Acme Office needs a key.', helpUrl: 'https://acme.test/keys', keyHint: 'Use a read-write key.', usedFor: ['Reading tables'],
  fields: [{ name: 'region', label: 'Region', required: true }] };

async function tools() {
  const { registry } = await realToolCatalog();
  const listed = registry.list({}) as Descriptor[];
  const out: Record<string, unknown> = {};
  for (const id of STATIC_IDS) out[id] = tool(listed.find(d => d.id === id) ?? { id });
  const plugin = await installSupportingFilesFixture({});
  try { for (const d of plugin.registry.list({}) as Descriptor[]) out[d.id] = tool(d); } finally { await plugin.cleanup(); }
  const exec = await bootFixture();
  for (const d of exec.registry.list({}) as Descriptor[]) out[d.id] = tool(d);
  const catalogBytes = Buffer.byteLength(JSON.stringify(listed.map(d => ({ id: d.id, description: d.description, inputSchema: d.inputSchema }))));
  const denied = await createToolExecutor({ registry }).execute({ toolId: 'provider_status', principal: { id: 'nobody' }, run: { id: 'run' }, input: {} }, {});
  return { tools: out, catalog: { names: listed.length, bytes: catalogBytes }, staticDenied: outcome(denied as never) };
}

async function cards() {
  const surfaces = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => 'exchange-1' }, defaultChannel: 'mcp-ui' }) };
  let emitted: Resource | undefined;
  const ctx = { principal: { id: 'owner' }, run: { id: 'run' }, input: {}, signal: new AbortController().signal } as unknown as ToolExecutionContext;
  const chosen = chooseApiConnectionDestination({ surfaces, ctx, pluginDisplayName: 'Acme Office', available: true }, {
    emitSurface: async (emission) => { emitted ??= (emission.payload as { resource: Resource }).resource; } });
  while (!emitted) await new Promise(resolve => setImmediate(resolve));
  surfaces.surfaceExchanges.deliver({ exchangeId: 'exchange-1', principalId: 'owner', params: { [SURFACE_DISMISSED_PARAM]: true } }, { toolId: 'agent_plugin_connect' });
  const base = { pluginId: 'acme-office', pluginDisplayName: 'Acme Office' };
  const credentials = { apply: applyPluginCredentialCard };
  return {
    connect: { card: card(emitted), dismissedResult: await chosen },
    signInWaiting: card(buildAgentPluginConnectCard({ ...base, state: 'waiting', signInUrl: 'https://acme.test/sign-in', exchangeId: 'exchange-1' }) as unknown as Resource),
    signInWaitingWithCredentialCard: card(buildAgentPluginConnectCard({ ...base, state: 'waiting', signInUrl: 'https://acme.test/sign-in', credentialCard: ACME_CARD }) as unknown as Resource),
    signInConnected: card(buildAgentPluginConnectCard({ ...base, state: 'connected' }) as unknown as Resource),
    signInSkipped: card(buildAgentPluginConnectCard({ ...base, state: 'skipped' }) as unknown as Resource),
    credential: secretForm(buildPluginCredentialForm({ card: ACME_CARD }), 'credential_save'),
    accessToken: secretForm(buildAgentPluginAccessTokenForm({ credentials, pluginDisplayName: 'Acme Office', helpUrl: 'https://acme.test/tokens' }), 'credential_save'),
    accessTokenWithCredentialCard: secretForm(buildAgentPluginAccessTokenForm({ credentials, pluginDisplayName: 'Acme Office', helpUrl: 'https://acme.test/tokens', credentialCard: ACME_CARD }), 'credential_save'),
    accessTokenOutcome: buildAgentPluginAccessTokenOutcome({ pluginDisplayName: 'Acme Office', state: 'success', title: 'Acme Office connected', message: 'The token was saved.' }),
  };
}

async function approvals() {
  const input = { connectionRef: 'conn-1', table: 'leads', values: ['a'] };
  const fixture = await bootFixture();
  const run = (toolId: string, principal = 'owner') => fixture.executor.execute({ toolId, principal: { id: principal }, run: { id: 'run' }, input }, {
    emitSurface: async () => { throw new Error(`${toolId} must not prompt`); } });
  const read = await run('p_acme_office__read_rows');
  const write = await startConfirmingCall(fixture, 'p_acme_office__append_rows', input);
  write.answer('cancel');
  const writeCancelled = await write.pending;
  const confirmed = await startConfirmingCall(fixture, 'p_acme_office__append_rows', input);
  confirmed.answer('confirm');
  const writeConfirmed = await confirmed.pending;
  const deniedFixture = await bootFixture({ authorize: async () => ({ allowed: false, reason: 'golden-denied' }) });
  const denied = async (toolId: string) => outcome(await deniedFixture.executor.execute({ toolId, principal: { id: 'stranger' }, run: { id: 'run' }, input }, {
    emitSurface: async () => { throw new Error(`${toolId} must not prompt a denied principal`); } }) as never);
  return {
    familyByEffect: APPROVAL_FAMILY_BY_EFFECT,
    families: Object.fromEntries(Object.values(APPROVAL_FAMILY_BY_EFFECT).concat(['installed-guidance', 'plugin-memory-read', 'plugin-memory-write'] as never)
      .map(family => [family, EXTENSION_TOOL_APPROVAL_POLICY[family as keyof typeof EXTENSION_TOOL_APPROVAL_POLICY]])),
    read: { prompted: false, result: outcome(read as never) },
    write: { prompted: true, rows: write.rows, card: card({ resource: { uri: 'ui://approval', mimeType: 'text/html', text: write.html } }),
      cancelled: outcome(writeCancelled as never), confirmed: outcome(writeConfirmed as never), pluginCalls: fixture.calls.length },
    deniedPrincipal: { read: await denied('p_acme_office__read_rows'), write: await denied('p_acme_office__append_rows'), pluginCalls: deniedFixture.calls.length },
  };
}

/** §10 counters that can be driven at baseline without a seeded principal or live provider. */
async function counters() {
  const opens = { calls: 0, bytes: 0 };
  const keyring = new InMemoryKeyring();
  const real = new AesGcmSecretSealer(keyring);
  const sealer = { seal: real.seal.bind(real), open: async (input: Parameters<typeof real.open>[0], optional?: Parameters<typeof real.open>[1]) => {
    opens.calls += 1; opens.bytes += Buffer.byteLength(input.sealed.ciphertext); return real.open(input, optional); } };
  const repo = new InMemoryExternalMcpServerRepo();
  const identity = { workspaceId: 'ws-1', serverId: 'both' };
  const sealedEnv = await sealExternalMcpVaultPayload({ deps: { sealer: real, keyring }, identity, kind: 'mcp-env', payload: { TOKEN: 'golden-env-value' } });
  const sealedOAuth = await sealExternalMcpVaultPayload({ deps: { sealer: real, keyring }, identity, kind: 'mcp-auth', payload: { staticAccessToken: 'golden-access-value' } });
  const blank = { label: null, provisionedByPluginId: null, transport: 'stdio', authMode: 'none', enabled: true, command: 'node', url: null, args: null, allowedToolNames: null,
    writeAllowedToolNames: null, writeGrantsUpdatedByPrincipalId: null, writeGrantsUpdatedAt: null, envNames: null, sealedEnv: null, oauthProviderId: null, oauthGrant: null,
    oauthClientId: null, oauthEndpointsJson: null, oauthScopesJson: null, oauthStatus: null, oauthExpiresAt: null, oauthTokenEnvName: null, oauthRefreshLeaseUntil: null,
    sealedOAuth: null, aadVersion: 1, oauthAadVersion: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  await repo.upsert({ ...blank, workspaceId: 'ws-1', serverId: 'both', envNames: '["TOKEN"]', sealedEnv, sealedOAuth, oauthStatus: 'connected' } as never);
  await repo.upsert({ ...blank, workspaceId: 'ws-1', serverId: 'none' } as never);
  const views = await listExternalMcpServerViews({ repo, sealer } as never, 'ws-1' as never);
  const vault = { lists: 0, rows: 0, bytes: 0, puts: 0 };
  const rows = [{ id: 'other-row', revision: 1 }, { id: 'another-row', revision: 2 }, { id: 'third-row', revision: 3 }];
  const store = createAgentPluginStateStore({ workspaceId: 'ws-1', vault: {
    list: async () => { vault.lists += 1; vault.rows += rows.length; vault.bytes += Buffer.byteLength(JSON.stringify(rows)); return rows; },
    put: async () => { vault.puts += 1; } } as never });
  await store.forPlugin({ workspaceId: 'ws-1', pluginId: 'acme-office' }).set({ key: 'mode', value: 'on' });
  return { mcpList: { rows: views.length, sealerOpens: opens.calls, sealerOpenBytes: opens.bytes },
    pluginStateWrite: { vaultListCalls: vault.lists, vaultListRows: vault.rows, vaultListBytes: vault.bytes, vaultPuts: vault.puts } };
}

test('moved tools, cards, approvals and counters match the golden recorded before any move', async () => {
  const json = `${JSON.stringify({ ...(await tools()), cards: await cards(), approvals: await approvals(), counters: await counters() }, null, 2)}\n`;
  // Compared as serialized JSON: symbol-keyed batch markers on schemas are not emitted to a model.
  const actual = JSON.parse(json) as Record<string, unknown>;
  if (process.env.MOVED_TOOLS_GOLDEN_WRITE === '1') writeFileSync(GOLDEN_URL, json);
  const golden = JSON.parse(readFileSync(GOLDEN_URL, 'utf8'));
  for (const section of Object.keys(golden)) assert.deepEqual(actual[section], golden[section], section);
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(golden).sort());
});
