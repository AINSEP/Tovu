import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPluginManagementRegistrations, buildPluginInstallRegistrations, buildPluginSourceRegistrations } from '@jini-ai/plugins/host/tools';
import { bindPluginManagementTools, bindPluginSourceTools } from '../../host-tool-binding.js';
import { bindPluginInstallTools } from '../../install-tool-binding.js';
import { harness, context, installedAgentPlugin, PLUGIN_ID } from '../fixtures/plugins-tool-harness.js';
import { resolveAgentPluginLayout } from '../../../agent-plugins/layout.js';
import { PluginInstallError } from '@jini-ai/plugins/host/node';
import { AgentPluginNotInstalledError, AgentPluginHostIncompatibleError, AgentPluginUpdateError, AgentPluginActivationsBusyError, AgentPluginActivationsUnreadableError } from '@jini-ai/agent-plugins/lifecycle';
import type { PluginInstallPreview } from '@jini-ai/plugins/host/node';

function foreign(h = harness()) {
  const bound = bindPluginManagementTools({ deps: h.deps, surfaces: { surfaceExchanges: h.surfaceExchanges } });
  const ids = { list: 'other_inventory', setEnabled: 'other_switch', uninstall: 'other_remove' };
  const renames = new Map([[bound.toolIds.list, ids.list], [bound.toolIds.setEnabled, ids.setEnabled], [bound.toolIds.uninstall, ids.uninstall]]);
  return { h, required: { ...bound, toolIds: ids, permissions: { read: 'other.read', enable: 'other.enable' },
    entityTypes: { plugin: 'other-package', agentPlugin: 'other-guidance', activation: 'other-activation' },
    registration: { domain: 'other-domain', catalogModule: 'other/catalog', metadata: Object.fromEntries(Object.entries(bound.registration.metadata).map(([id, value]) => [renames.get(id) ?? id, value])),
      catalog: bound.registration.catalog.map(tool => ({ ...tool, name: renames.get(tool.name)!, description: 'Other host https://other.invalid/help' })) },
    messages: { ...bound.messages, restartNote: () => 'Other host switch saved.' },
  } };
}
function tool(required: ReturnType<typeof foreign>['required'], id: string) {
  const found = buildPluginManagementRegistrations(required).find(r => r.descriptor.id === id); assert.ok(found); return found;
}

test('foreign ids, catalog copy, permission and inactive public projection flow through list', async () => {
  const { h, required } = foreign();
  const registration = tool(required, required.toolIds.list);
  assert.equal(registration.descriptor.description, 'Other host https://other.invalid/help');
  const out = await registration.handler(context({}), {});
  assert.equal(h.authorizeCalls[0]?.permission, 'other.read');
  assert.equal(JSON.stringify(out).includes('/fake/pkg'), false);
  assert.equal(JSON.stringify(out).includes('skillPath'), false);
  assert.deepEqual(buildPluginManagementRegistrations(required).map(r => r.descriptor.id), Object.values(required.toolIds));
});
for (const family of ['site-runtime', 'agent-plugin'] as const) {
  test(`foreign enable permission/entity and result copy flow through ${family} disable`, async () => {
    const { h, required } = foreign();
    const out = await tool(required, required.toolIds.setEnabled).handler(context({ family, pluginId: family === 'site-runtime' ? PLUGIN_ID : 'higgsfield', enabled: false }), {});
    assert.ok(typeof out === 'object' && out !== null && 'note' in out);
    assert.equal(out.note, 'Other host switch saved.');
    assert.ok(h.authorizeCalls.some(call => call.permission === 'other.enable' && call.entityType === (family === 'site-runtime' ? 'other-package' : 'other-guidance')));
  });
}

test('missing capability keeps the legacy installed-list override, but a switch still refuses lazily', async () => {
  const h = harness({ layout: resolveAgentPluginLayout({ siteDir: '/foreign-host' }), injected: { listInstalledAgentPlugins: async () => [installedAgentPlugin()] } });
  const { required } = foreign({ ...h, deps: { ...h.deps, pluginHost: undefined } });
  const out = await tool(required, required.toolIds.list).handler(context({}), {});
  assert.ok(typeof out === 'object' && out !== null && 'agentPlugins' in out);
  assert.equal(Array.isArray(out.agentPlugins) && out.agentPlugins.length, 1);
  await assert.rejects(() => Promise.resolve(tool(required, required.toolIds.setEnabled).handler(context({ family: 'agent-plugin', pluginId: 'higgsfield', enabled: false }), {})), /The host does not provide agent-plugin lifecycle operations\./);
});

test('host classifier uses canonical classes and unknown errors retain identity', () => {
  const { required } = foreign();
  const samples = [new AgentPluginNotInstalledError({ pluginId: 'x' }), new AgentPluginHostIncompatibleError({ pluginId: 'x' })];
  assert.deepEqual(samples.map(error => required.agentPlugins.classifyError({ error })?.kind), ['not-installed', 'host-incompatible']);
  const unknown = new Error('do not classify by name'); unknown.name = 'AgentPluginNotInstalledError';
  assert.equal(required.agentPlugins.classifyError({ error: unknown }), undefined);
});

const preview: PluginInstallPreview = { id: 'other', name: 'Other package', version: '1.0.0', tier: 'tier-1', capabilities: [], hooks: [], hasCode: false, digest: 'exact-digest', contentTypes: [], conflicts: [] };
test('foreign install input preserves authorize, parse, policy, preview and digest-pinned write order', async () => {
  const events: string[] = [];
  const h = harness();
  const base = bindPluginInstallTools({ ...h.deps, hostSignals: { hosted: false, nativeToolsRestricted: false, labels: [] } });
  const required = { ...base, toolId: 'other_install', permission: 'other.write', entityType: 'other-package',
    registration: { ...base.registration, domain: 'other-install', catalogModule: 'other/install', catalog: base.registration.catalog.map(t => ({ ...t, name: 'other_install' })), metadata: { other_install: {} } },
    authorize: async (input: { permission: string }) => { events.push(input.permission); return { allowed: true, reason: 'yes' }; },
    parseRequest: () => { events.push('parse'); return { opaque: true }; }, localInstallEnabled: () => { events.push('policy'); return true; },
    installInput: async () => ({ sourceDir: 'host-owned-location' }),
    installer: { preview: async () => { events.push('preview'); return preview; }, install: async (input: { expectedDigest: string }) => { events.push(input.expectedDigest); return preview; } },
    riskSentence: () => 'Other host trust warning', messages: { localInstallDisabledNote: 'Other host disabled', installedNote: () => 'Other host installed OFF', retryInstallHint: ' Other host retry' },
  };
  const out = await buildPluginInstallRegistrations(required)[0]!.handler(context({}), {});
  assert.deepEqual(events, ['other.write', 'parse', 'policy', 'preview', 'exact-digest']);
  assert.ok(typeof out === 'object' && out !== null && 'note' in out && 'warning' in out);
  assert.equal(out.note, 'Other host installed OFF'); assert.equal(out.warning, 'Other host trust warning');
});

test('foreign source ids dispatch through catalog permissions and preserve owner results', async () => {
  const h = harness(); const base = bindPluginSourceTools({ deps: h.deps, surfaces: { surfaceExchanges: h.surfaceExchanges } });
  const toolIds = Object.fromEntries(Object.keys(base.toolIds).map(key => [key, `other_${key}`])) as typeof base.toolIds;
  const ids = new Map(Object.entries(base.toolIds).map(([op, id]) => [id, toolIds[op as keyof typeof toolIds]]));
  const returned = { files: [{ path: 'owner-result', bytes: 12 }] };
  const required = { ...base, toolIds, registration: { ...base.registration, domain: 'other-source', catalogModule: 'other/source', catalog: base.registration.catalog.map(t => ({ ...t, name: ids.get(t.name)!, authorization: { permission: 'other.inspect' } })), metadata: {} },
    pluginSource: { ...h.deps.pluginSource!, list: async () => returned } };
  const registration = buildPluginSourceRegistrations(required).find(r => r.descriptor.id === toolIds.list); assert.ok(registration);
  assert.equal(await registration.handler(context({ id: 'other' }), {}), returned);
  assert.equal(h.authorizeCalls[0]?.permission, 'other.inspect');
});

test('approval identity forwards the same sorted revisions to the foreign fingerprint owner', async () => {
  const { pluginApprovalIdentity } = await import('@jini-ai/plugins/host/tools');
  const h = harness({ agentHost: { listInstalled: async () => [installedAgentPlugin({ version: '2.0.0', archiveDigest: 'bb' }), installedAgentPlugin({ version: '1.0.0', archiveDigest: 'aa' })] } });
  const { required } = foreign(h); const inputs: unknown[] = [];
  const identity = await pluginApprovalIdentity({ deps: { ...required, approvalFingerprint: input => { inputs.push(input); return 'other-fingerprint-owner'; } }, request: { family: 'agent-plugin', pluginId: 'higgsfield' } });
  assert.equal(identity.key, 'other-fingerprint-owner');
  assert.deepEqual(inputs, [{ family: 'agent-plugin', pluginId: 'higgsfield', revision: '[["1.0.0","aa"],["2.0.0","bb"]]', schema: {} }]);
});

test('the foreign telemetry callback observes one durable OFF decision after the command owner', async () => {
  const h = harness({ initialRows: [{ pluginId: PLUGIN_ID, workspaceId: '66666666-6666-4666-8666-666666666666', version: '1.0.0', enabled: true, updatedAt: '2026-01-01T00:00:00Z' }] });
  const { required } = foreign(h); const seen: unknown[] = [];
  const portable = { ...required, telemetry: { toggled: (input: { principalId: string; pluginId: string; enabled: boolean }) => { assert.ok(h.events.includes('save:false')); seen.push(input); } } };
  await tool(portable, portable.toolIds.setEnabled).handler(context({ family: 'site-runtime', pluginId: PLUGIN_ID, enabled: false }), {});
  assert.deepEqual(seen, [{ principalId: 'owner-under-test', pluginId: PLUGIN_ID, enabled: false }]);
});
