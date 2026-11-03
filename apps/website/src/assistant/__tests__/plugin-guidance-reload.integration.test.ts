import assert from 'node:assert/strict';
import test from 'node:test';
import { createToolRegistry } from '@jini-ai/core';
import { InMemoryPluginActivationRepo } from '@jini-ai/plugins/host';
import { createTempSiteLayoutFixture } from '#src/__tests__/fixtures/site-layout-context';
import { InMemoryPostRepo } from '#src/features/post/repo.memory';
import { installSupportingFilesFixture } from '#src/features/agent-plugins/__tests__/fixtures/supporting-files';
import { agentPluginActivations } from '#src/features/agent-plugins/activation-effects';
import { registerInstalledExtensionTools } from '#src/server/runtime/composition/installed-extension-tools';
import { attachAssistantToolExtensions } from '../installed-extension-tools.js';
import { buildToolCatalogQuery } from '../tool-catalog-query.js';

for (const startFederation of [true, false]) {
test(`enabling a plugin mid-session makes its guidance discoverable through reload without a restart (federation started: ${startFederation})`, async t => {
  const fixture = await installSupportingFilesFixture({});
  t.after(fixture.cleanup);
  const site = createTempSiteLayoutFixture({});
  t.after(site.cleanup);
  const { workspaceId, agentPluginLayout } = fixture;
  const activation = { workspaceRoot: agentPluginLayout.forWorkspace(workspaceId).root, pluginId: 'ui-ux-design', actor: 'owner' };
  await agentPluginActivations.setAgentPluginActivation({ ...activation, enabled: false });
  const registry = createToolRegistry({});
  let catalog = buildToolCatalogQuery(registry);
  const extensions = attachAssistantToolExtensions(registry, {
    ...site.deps, workspaceId, agentPluginLayout, postRepo: new InMemoryPostRepo(), pluginActivationRepo: new InMemoryPluginActivationRepo(),
    authorize: async () => ({ allowed: true, reason: 'matched' }), discoverPlugins: async () => [],
    registerInstalled: registerInstalledExtensionTools,
    federation: { deps: { workspaceId, authorize: async () => ({ allowed: true, reason: 'matched' }) },
      resolveConnections: async () => [], onAdmitted: () => { catalog = buildToolCatalogQuery(registry); } },
  }, '[guidance-test]');
  await extensions.installed;
  if (startFederation) await extensions.federation.start();
  assert.equal(registry.has({ toolId: 'agent_plugin_ui_ux_design' }), false);
  await agentPluginActivations.setAgentPluginActivation({ ...activation, enabled: true });
  await extensions.federation.reload();
  assert.ok(catalog.describe({ id: 'agent_plugin_ui_ux_design' }));
  await extensions.federation.reload();
  assert.equal(registry.list({}).filter(tool => tool.id === 'agent_plugin_ui_ux_design').length, 1);
});
}
