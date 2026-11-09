import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ToolInputError } from '@jini-ai/core';
import { createSystemClock } from '@jini-ai/core/primitives';
import { InMemoryPluginActivationRepo } from '@jini-ai/plugins/host';
import { InMemoryKeyring } from '../../../webhooks/keyring.memory.js';
import { AesGcmSecretSealer } from '../../../webhooks/secret-sealer.aesgcm.js';
import { InMemoryExternalMcpServerRepo } from '../../../external-mcp/external-mcp-store.memory.js';
import { applyExternalMcpAccess, saveExternalMcpServer } from '../../../external-mcp/external-mcp-store.js';
import { composeAgentPluginMcp, composePluginProviderFaces } from '../../../../server/runtime/composition/agent-plugin-service-ports.js';
import { createTovuPluginHost, type TovuPluginHostDeps } from '../../../../server/runtime/composition/plugin-host.js';
import { agentPluginMcpProjections } from '../../mcp-host-bindings.js';
import { grantDeclaredToolsToSignedInRows } from '../../grant-signed-in-defaults.js';
import { loadAgentPluginConnectionStatuses } from '../../connection-status.js';
import { hasStoredAgentPluginCredential } from '../../connect-tool.js';
import { resolveAgentPluginLayout } from '../../layout.js';
import { createBundledSourceArchiveReader, installAgentPlugin, packAgentPluginDirectory } from '../../lifecycle.js';
import { forceRemove } from '../fixtures/force-remove.js';
import type { AgentPluginMcpProjectionPorts, AgentPluginMcpProjections } from '../../service-ports.js';
import type { McpServerConfig } from '../../mcp-metadata.js';

// S4-0b A7 F1: a second host's projections and classifier must reach every path, never Tovu's.
const servers: Readonly<Record<string, McpServerConfig>> = { media: { type: 'streamable-http', url: 'https://media.example.test/mcp', authMode: 'oauth', defaultTools: { allow: ['models', 'generate'], write: ['generate'] } } };
class HostValidation extends Error {}

/** Distinct functions: same saved meaning, but the snapshot's key order is the host's own. */
function hostPorts(overrides: Partial<AgentPluginMcpProjections> = {}) {
  const calls: string[] = [];
  const projections: AgentPluginMcpProjections = {
    accessSnapshot: input => { calls.push('accessSnapshot'); return Object.fromEntries(Object.entries(agentPluginMcpProjections.accessSnapshot(input)).reverse()) as ReturnType<AgentPluginMcpProjections['accessSnapshot']>; },
    admissionRevision: row => { calls.push('admissionRevision'); return agentPluginMcpProjections.admissionRevision(row); },
    readToolGrants: (row, options) => { calls.push('readToolGrants'); return agentPluginMcpProjections.readToolGrants(row, options); },
    validateToolNames: input => { calls.push('validateToolNames'); return agentPluginMcpProjections.validateToolNames(input); },
    oauthStatus: row => { calls.push('oauthStatus'); return agentPluginMcpProjections.oauthStatus(row); },
    hasStaticAccessToken: row => { calls.push('hasStaticAccessToken'); return agentPluginMcpProjections.hasStaticAccessToken(row); },
    ...overrides,
  };
  const ports: AgentPluginMcpProjectionPorts = { projections, classifyError: ({ error }) => error instanceof HostValidation ? 'validation' : 'other' };
  return { ports, calls };
}

async function store(t: { after(callback: () => unknown): void }, options: { allowed?: string } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'tovu-s4-projection-seam-'));
  t.after(async () => { await forceRemove(path.join(root, 'ws')); await rm(root, { recursive: true, force: true }); });
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const clock = createSystemClock();
  const storeDeps = { repo, keyring, clock, sealer: new AesGcmSecretSealer(keyring) };
  await saveExternalMcpServer(storeDeps, {
    workspaceId: 'site', serverId: 'media', label: 'Media', transport: 'streamable_http', url: 'https://media.example.test/mcp',
    authMode: 'oauth', enabled: false, command: '', args: '', allowedToolNames: options.allowed ?? 'existing', writeAllowedToolNames: '',
    principalId: 'owner', provisionedByPluginId: 'images', oauth: { grant: 'authorization_code' },
  });
  return { root, repo, clock, storeDeps, layout: resolveAgentPluginLayout({ siteDir: root }, { env: { TOVU_AGENT_PLUGINS_DIR: root } }) };
}

/** A real installed package, so the grant reads the same declaration the preview displayed. */
async function install(f: Awaited<ReturnType<typeof store>>): Promise<void> {
  const source = path.join(f.root, 'source');
  await mkdir(source);
  await writeFile(path.join(source, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'images', version: '1.0.0' }));
  await writeFile(path.join(source, 'mcp.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    mcpServers: { media: { type: 'streamable-http', url: 'https://media.example.test/mcp', tovuAuthMode: 'oauth', tovuDefaultTools: { allow: ['models', 'generate'], write: ['generate'] } } } }));
  const packed = await packAgentPluginDirectory(source);
  await installAgentPlugin({ archive: packed.bytes, expectedSha256: packed.sha256, archiveReader: createBundledSourceArchiveReader(), layout: f.layout, workspaceId: 'site' });
}

function pluginHost(f: Awaited<ReturnType<typeof store>>, ports: AgentPluginMcpProjectionPorts, optional: { resolveServers?: boolean } = {}) {
  const deps = {
    agentPluginLayout: f.layout, workspaceId: 'site', clock: f.clock,
    authorize: async () => ({ allowed: true, reason: 'matched' }), pluginActivationRepo: new InMemoryPluginActivationRepo(),
    discoverPlugins: async () => [], listInstalledAgentPlugins: async () => [],
    mcp: { ...composeAgentPluginMcp(f.storeDeps), ...ports }, preferences: { locale: async () => 'en' },
    providerFaces: composePluginProviderFaces({ workspaceRoot: () => f.root }),
  } as unknown as TovuPluginHostDeps;
  return createTovuPluginHost({ deps }, { warn: () => {}, ...(optional.resolveServers === false ? {} : { resolveMcpServers: async () => servers }) }).getHostCapability({ capability: 'agent-plugin-lifecycle' })!;
}

test('composition preview and the approved provision grant revalidate with the host projections', async t => {
  const f = await store(t);
  await install(f);
  const { ports, calls } = hostPorts();
  const agentPlugins = pluginHost(f, ports, { resolveServers: false });
  const preview = await agentPlugins.previewEnableAccess!({ pluginId: 'images' });
  assert.deepEqual(Object.keys(JSON.parse(preview.key)[0].expected)[0], 'provisionedByPluginId', 'preview used the host snapshot');
  assert.ok(calls.includes('validateToolNames') && calls.includes('readToolGrants') && calls.includes('admissionRevision'));
  const before = calls.length;
  // A Tovu snapshot here would differ byte-for-byte and refuse the approval ("declaration or access changed").
  await agentPlugins.provisionMcp({ pluginId: 'images', principalId: 'owner' }, { approvedEnable: true, approvedEnableKey: preview.key });
  assert.ok(calls.slice(before).includes('accessSnapshot'), 'the grant re-read the host snapshot');
  const row = (await f.repo.findByServerId({ workspaceId: 'site', serverId: 'media' }))!;
  assert.equal(row.enabled, true);
  assert.deepEqual(JSON.parse(row.allowedToolNames!), ['existing', 'models', 'generate']);
  assert.equal(row.writeGrantsUpdatedByPrincipalId, 'owner');
});

test('the composed classifier keeps host validation identity through the preview', async t => {
  const f = await store(t);
  const failure = new HostValidation('host rejects these tool names');
  const { ports } = hostPorts({ validateToolNames: () => { throw failure; } });
  await assert.rejects(pluginHost(f, ports).previewEnableAccess!({ pluginId: 'images' }), (error: unknown) =>
    error instanceof ToolInputError && error.message === `The plugin's combined tool grant cannot be saved: ${failure.message}. Review its tool selection with external_mcp_save before enabling it.`);
});

test('sign-in eligibility uses the host credential projection, not Tovu default', async t => {
  const f = await store(t, { allowed: '' });
  const recorded: string[] = [];
  const { ports } = hostPorts({ hasStaticAccessToken: () => { recorded.push('hasStaticAccessToken'); return true; } });
  const connected: string[] = [];
  const deps = { workspaceId: 'site', agentPluginLayout: f.layout, repo: f.repo, clock: f.clock,
    applyAccess: (input: Omit<Parameters<typeof applyExternalMcpAccess>[0], 'repo' | 'clock'>) => applyExternalMcpAccess({ ...input, repo: f.repo, clock: f.clock }),
    notifyRosterChanged: async () => {}, onConnected: async (serverId: string) => { connected.push(serverId); } };
  await grantDeclaredToolsToSignedInRows({ deps, pluginId: 'images', servers });
  assert.deepEqual(connected, [], 'control: Tovu sees no stored credential');
  await grantDeclaredToolsToSignedInRows({ deps: { ...deps, ...ports }, pluginId: 'images', servers });
  assert.deepEqual(connected, ['media']);
  assert.ok(recorded.includes('hasStaticAccessToken'));
});

test('status and stored-credential reads use the host pure projections', async () => {
  const row = { provisionedByPluginId: 'images', authMode: 'oauth' as const, oauthStatus: 'connected' as const, sealedOAuth: null };
  const { ports } = hostPorts({ oauthStatus: () => 'needs_reauth', hasStaticAccessToken: () => false });
  const statuses = await loadAgentPluginConnectionStatuses({ workspaceId: 'site', mcp: { listByWorkspaceId: async () => [row] }, ...ports });
  assert.equal(statuses.get('images'), 'needs_reauth');
  const control = await loadAgentPluginConnectionStatuses({ workspaceId: 'site', mcp: { listByWorkspaceId: async () => [row] } });
  assert.equal(control.get('images'), 'connected');
  const unsigned = { authMode: 'oauth' as const, sealedOAuth: null, oauthStatus: null };
  assert.equal(hasStoredAgentPluginCredential(unsigned), false);
  assert.equal(hasStoredAgentPluginCredential(unsigned, hostPorts({ hasStaticAccessToken: () => true }).ports), true);
});
