import assert from 'node:assert/strict';
import test from 'node:test';
import { bindAgentPluginTools } from '../../agent-plugin-tool-binding.js';
import type { PluginsToolDeps } from '../../tool-registrations.js';

test('OFF installed plugin text prefers its public summary over the description', async () => {
  const deps = {
    workspaceId: 'summary-workspace',
    agentPluginLayout: { forWorkspace: () => ({ root: '/private/plugin-root' }) },
    listInstalledAgentPlugins: async () => [{ pluginId: 'image-maker', displayName: 'Image maker', summary: 'Short public purpose', description: 'Long fallback description', archiveDigest: 'a'.repeat(64), packageRoot: '/private/plugin-root', files: [], skills: [] }],
  } as unknown as PluginsToolDeps;
  const lifecycle = bindAgentPluginTools({ deps });
  const installed = await lifecycle.listInstalled({}, {});
  const visible = lifecycle.searchCandidate({ candidate: { ...installed[0]!, enabled: false, keywords: [], skills: [], mcpServerIds: [] } });
  assert.equal(visible.description, 'installed, off: Image maker: Short public purpose — read guidance; tools unavailable');
});
