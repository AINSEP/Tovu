import assert from 'node:assert/strict';
import test from 'node:test';
import { runAgentPluginConnect } from '../../connect-tool.js';
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

test('connecting an off plugin refuses before resolving its connection instructions or saving anything', async () => {
  const h = harness();
  let resolved = false;
  await assert.rejects(runAgentPluginConnect({
    pluginId: 'higgsfield', ctx: context({ pluginId: 'higgsfield' }), surfaces: { surfaceExchanges: h.surfaceExchanges },
    routeDeps: { workspaceId: 'workspace-1', agentPluginLayout: h.deps.agentPluginLayout,
      authorize: async () => ({ allowed: true, reason: 'matched' }), credentials: credentialTestPort({}),
      mcp: { repo: new InMemoryExternalMcpServerRepo(), applyAccess: async () => assert.fail('OFF must not grant'), saveServer: async () => assert.fail('OFF must not save') },
      isPluginEnabled: async () => false,
      resolveInstalledPlugin: async () => { resolved = true; return { servers: {} }; },
    },
  }), /plugins_set_enabled/);
  assert.equal(resolved, false);
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
