import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runAgentPluginConnect, type ResolvedAgentPluginForConnect } from '../../connect-tool.js';
import { installAgentPlugin, removeFrozenPackageTree } from '../../lifecycle.js';
import { resolveAgentPluginLayout } from '../../layout.js';
import { context, harness, installedAgentPlugin, siteRecord } from '../../../plugin-runtime/__tests__/fixtures/plugins-tool-harness.js';
import { credentialTestPort } from '../fixtures/connection-service-ports.js';
import { InMemoryExternalMcpServerRepo } from '../../../external-mcp/external-mcp-store.memory.js';

test('content_read.plugin uses a catalog line for off plugins without skills or exports', async () => {
  const h = harness({ agentHost: {
    listInstalled: async () => [installedAgentPlugin({ summary: 'Create images', skills: [{ name: 'PRIVATE_SKILL', skillPath: 'skills/private/SKILL.md' }] })],
    inactivePluginIds: async () => new Set(['higgsfield']),
  } });
  const response = await h.tool('plugins_list').handler(context({}), {}) as { agentPlugins: unknown[] };
  assert.equal(response.agentPlugins.length, 1);
  const serialized = JSON.stringify(response.agentPlugins);
  assert.match(serialized, /installed, off: higgsfield: Create images/);
  assert.doesNotMatch(serialized, /PRIVATE_SKILL|archiveDigest|exports/);
  const site = response as unknown as { plugins: unknown[] };
  assert.doesNotMatch(JSON.stringify(site.plugins), /capabilities|hooks|manifest|conflicts/);
  assert.match(JSON.stringify(site.plugins), /installed, off: Site rules/);
});

/** Connect an off plugin; nothing may be granted or saved. Its declarations are read only to word the refusal. */
function connectOff(pluginId: string, routeDeps: { agentPluginLayout?: ReturnType<typeof resolveAgentPluginLayout>; resolveInstalledPlugin?: (pluginId: string) => Promise<ResolvedAgentPluginForConnect | null> } = {}) {
  const h = harness();
  return runAgentPluginConnect({
    pluginId, ctx: context({ pluginId }), surfaces: { surfaceExchanges: h.surfaceExchanges },
    routeDeps: { workspaceId: 'workspace-1', agentPluginLayout: h.deps.agentPluginLayout,
      authorize: async () => ({ allowed: true, reason: 'matched' }), credentials: credentialTestPort({}),
      mcp: { repo: new InMemoryExternalMcpServerRepo(), applyAccess: async () => assert.fail('OFF must not grant'), saveServer: async () => assert.fail('OFF must not save') },
      isPluginEnabled: async () => false,
      ...routeDeps,
    },
  });
}

test('connecting an off OAuth plugin refuses without granting or saving anything, and keeps the connect retry', async () => {
  await assert.rejects(connectOff('higgsfield', { resolveInstalledPlugin: async () => ({ servers: { media: { type: 'streamable-http', url: 'https://mcp.example.com/mcp', authMode: 'oauth' } } }) }),
    /plugins_set_enabled\(\{family:"agent-plugin",pluginId:"higgsfield",enabled:true\}\), then retry agent_plugin_connect\.$/);
});

test('connecting an off token plugin points to the key card it declares instead of a connect retry', async () => {
  const workspaceId = 'workspace-1';
  const root = await mkdtemp(path.join(tmpdir(), 'tovu-off-token-plugin-'));
  try {
    const layout = resolveAgentPluginLayout({ siteDir: root });
    const card = { target: 'railway-api', title: 'Connect Railway', label: 'Railway API', category: 'hosting', intro: 'Save a Railway token.', keyHint: 'Create a token in Railway.', saveKind: 'api', baseUrl: 'https://backboard.railway.com/graphql/v2' };
    const manifest = JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'railway', version: '1.0.0', extensions: { jini: { credentialCards: [card] } } });
    const archive = Buffer.from(manifest);
    await installAgentPlugin({ layout, workspaceId, archive, expectedSha256: createHash('sha256').update(archive).digest('hex'), archiveReader: {
      async *entries() { yield { kind: 'file' as const, entryPath: 'plugin.json', declaredSize: archive.length, executable: false, async *openReadStream() { yield archive; } }; },
    } });
    await assert.rejects(connectOff('railway', { agentPluginLayout: layout }), (error: Error) => {
      assert.match(error.message, /plugins_set_enabled\(\{family:"agent-plugin",pluginId:"railway",enabled:true\}\)/);
      assert.match(error.message, /credential_save\(\{kind:"plugin-provider",target:"railway-api"\}\)/);
      assert.doesNotMatch(error.message, /then retry agent_plugin_connect/);
      return true;
    });
  } finally { await removeFrozenPackageTree({ root }); }
});

for (const status of ['invalid', 'incompatible'] as const) {
  test(`an off site plugin retains its ${status} status in the catalog`, async () => {
    const h = harness({ discovery: () => [siteRecord({ status })] });
    const result = await h.tool('plugins_list').handler(context({}), {}) as { plugins: { status: string; enabled: boolean }[] };
    assert.equal(result.plugins[0]!.status, status);
    assert.equal(result.plugins[0]!.enabled, false);
    assert.doesNotMatch(JSON.stringify(result.plugins), /capabilities|manifest|hooks/);
  });
}
