// Moved from core's apps/website/src/features/agent-plugins/__tests__/unit/cloudflare-contribution-migration.unit.test.ts (types stripped): vendor tests live with
// the vendor plugin; the host kits and fixtures it drives are still core's real ones, imported by path.
import "../../../../apps/website/src/platform/site-dir/__tests__/helpers/isolated-catalog-home.ts";
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createTovuAgentPluginLifecycle } from '../../../../apps/website/src/features/agent-plugins/lifecycle.ts';
import { resolveAgentPluginLayout } from '../../../../apps/website/src/features/agent-plugins/layout.ts';
import { loadDeployTargetRegistry } from '../../../../apps/website/src/features/deployments/deploy-targets/registry.ts';
import { forceRemove } from '../../../../apps/website/src/features/agent-plugins/__tests__/fixtures/force-remove.ts';

/** Real trusted-package and contribution owners, simulating seed/retirement failures on disk. */
function entry(entryPath, content) {
  const bytes = Buffer.from(content);
  return { kind: 'file', entryPath, declaredSize: bytes.length, executable: false,
    async *openReadStream() { yield bytes; } };
}
async function install(required) {
  const { owner, layout, workspaceId, pluginId, trusted, enabled } = required;
  const archive = Buffer.from(`fixture-${pluginId}`);
  const entries = [entry('plugin.json', JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: pluginId, version: '1.0.0' })),
    entry(`skills/${pluginId}/SKILL.md`, `---\nname: ${pluginId}\n---\n# ${pluginId}\n`),
    entry('tovu-deploy-targets.json', JSON.stringify({ schemaVersion: 1, targets: [{ id: 'cloudflare-pages', label: 'Pages', module: 'target.mjs' }] })),
    entry('target.mjs', 'export default { create: (required, optional = {}) => ({ id: "cloudflare-pages" }) };'),
  ];
  const installed = await owner.installAgentPlugin({ layout, workspaceId, archive, expectedSha256: createHash('sha256').update(archive).digest('hex'), archiveReader: { async *entries() { yield* entries; } } });
  const workspaceRoot = layout.forWorkspace(workspaceId).root;
  await owner.setAgentPluginActivation({ workspaceRoot, pluginId, enabled, actor: 'test:operator' }, { origin: 'bundled' });
  if (trusted) await owner.recordBundledAgentPluginDigests({ workspaceRoot, seeded: [{ pluginId, archiveDigest: installed.archiveDigest }] });
}

for (const oldId of ['cloudflare-pages', 'deploy']) for (const state of ['trusted', 'untrusted', 'disabled', 'absent']) test(`${oldId} retained after failed retirement; successor ${state} yields at most one Pages owner`, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cloudflare-contribution-'));
  try {
    const layout = resolveAgentPluginLayout({ siteDir: root }, { env: {} });
    const owner = createTovuAgentPluginLifecycle({ layout });
    const workspaceId = 'workspace';
    await install({ owner, layout, workspaceId, pluginId: oldId, trusted: true, enabled: true });
    if (state !== 'absent') await install({ owner, layout, workspaceId, pluginId: 'cloudflare', trusted: state !== 'untrusted', enabled: state !== 'disabled' });
    const registry = await loadDeployTargetRegistry({ workspaceId }, { loadContributions: owner.loadPluginContributions });
    if (state === 'disabled') assert.deepEqual(registry.list(), []);
    else {
      assert.equal(registry.list().length, 1);
      assert.equal(registry.get('cloudflare-pages')?.pluginId, state === 'trusted' ? 'cloudflare' : oldId);
    }
    assert.ok((await owner.listInstalledPlugins(layout.forWorkspace(workspaceId).root)).some(plugin => plugin.pluginId === oldId), 'selection must not delete a retained package');
  } finally { await forceRemove(root); }
});
