import assert from 'node:assert/strict';
import test from 'node:test';
import { pluginApprovalIdentity } from '@jini-ai/plugins/host/tools';
import { bindAgentPluginIdentity } from '../../agent-plugin-tool-binding.js';
import type { PluginsToolDeps } from '../../tool-registrations.js';

const copy = (version: string, digest: string) => ({ pluginId: 'image-maker', version, archiveDigest: digest.repeat(64), packageRoot: '/private/plugin-root', files: [], skills: [] });

test('the enable card names only the copy the host selection owner keeps, while the revision still covers every installed copy', async () => {
  const installed = [copy('0.1.0', 'a'), copy('1.0.0', 'b'), copy('1.0.1', 'c')];
  const capability = {
    listInstalled: async () => installed,
    // The host's selection owner (bundled digest wins) keeps the shipped copy.
    preferInstalled: async ({ installed: offered }: { installed: readonly typeof installed[number][] }) => offered.filter(plugin => plugin.archiveDigest === 'b'.repeat(64)),
  };
  const deps = {
    workspaceId: 'approval-workspace',
    agentPluginLayout: { forWorkspace: () => { throw new Error('the Agent Plugin layout is never read when the host capability is bound'); } },
    pluginHost: { getHostCapability: () => capability },
  } as unknown as PluginsToolDeps;
  const revisions: string[] = [];
  const identity = await pluginApprovalIdentity({ deps: {
    discoverPlugins: async () => [], approvalFingerprint: ({ revision }) => { revisions.push(revision); return 'fingerprint'; },
    agentPlugins: { ...bindAgentPluginIdentity({ deps }), previewEnableAccess: async () => undefined },
  }, request: { family: 'agent-plugin', pluginId: 'image-maker' } });
  assert.equal(identity.version, '1.0.0');
  assert.deepEqual(JSON.parse(revisions[0]!), [['0.1.0', 'a'.repeat(64)], ['1.0.0', 'b'.repeat(64)], ['1.0.1', 'c'.repeat(64)]]);
});
