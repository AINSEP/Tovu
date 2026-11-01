import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildRegistrations } from '../../install-tool.js';
import { resolveAgentPluginLayout } from '../../layout.js';
import { listInstalledPlugins, readBundledAgentPluginDigests } from '../../lifecycle.js';
import { readPluginInstallRequest, readPluginInstallArchive } from '../../../plugin-runtime/install-source.js';
import { forceRemove } from '../fixtures/force-remove.js';

const context = (input: unknown) => ({ executionId: 'customize', principal: { id: 'owner' }, run: { id: 'chat' }, input, signal: new AbortController().signal });

test('H1: owner customizes bundled tovu-theme through chat into a saved site copy, preserving bundled bytes and trust', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'tovu-customize-'));
  t.after(() => forceRemove(root));
  const sourceRoot = path.join(root, 'bundled');
  const source = path.join(sourceRoot, 'tovu-theme');
  await mkdir(path.join(source, 'skills', 'theme'), { recursive: true });
  const manifest = JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'tovu-theme', version: '1.0.0', extensions: { tovu: { id: 'tovu/tovu-theme' } } });
  await writeFile(path.join(source, 'plugin.json'), manifest);
  await writeFile(path.join(source, 'skills/theme/SKILL.md'), '# Theme\nUse blue.\n');
  const binary = Buffer.from([0x89, 0, 0xff, 0x80]);
  await writeFile(path.join(source, 'logo.png'), binary);
  const layout = resolveAgentPluginLayout({ siteDir: root }, { env: { TOVU_AGENT_PLUGINS_DIR: path.join(root, 'installed') } });
  const deps = { workspaceId: 'site', authorize: async () => ({ allowed: true as const, reason: 'matched' as const }), agentPluginLayout: layout, bundledAgentPluginsSourceRoot: sourceRoot,
    pluginInstallSource: { readRequest: readPluginInstallRequest, readArchive: readPluginInstallArchive } };
  const tools = buildRegistrations(deps);
  await tools.find(tool => tool.descriptor.id === 'agent_plugins_install')!.handler(context({ source: { kind: 'bundled', bundledId: 'tovu-theme' } }), {});
  const tool = tools.find(tool => tool.descriptor.id === 'agent_plugins_customize');
  assert.ok(tool, 'chat must offer an automatic editable copy instead of manual copying');
  const input = { pluginId: 'tovu-theme', newId: 'my-theme', path: 'skills/theme/SKILL.md', oldString: 'Use blue.', newString: 'Use green.' };
  const result = await tool.handler(context(input), {}) as { installed: boolean; enabled: boolean; plugin: { id: string } };
  assert.equal(result.installed, true);
  assert.equal(result.enabled, false);
  assert.equal(result.plugin.id, 'my-theme');
  const workspaceRoot = layout.forWorkspace('site').root;
  const installed = await listInstalledPlugins(workspaceRoot);
  const copy = installed.find(plugin => plugin.pluginId === 'my-theme')!;
  assert.equal(await readFile(path.join(copy.packageRoot, input.path), 'utf8'), '# Theme\nUse green.\n');
  assert.deepEqual(await readFile(path.join(copy.packageRoot, 'logo.png')), binary);
  assert.equal(JSON.parse(await readFile(path.join(copy.packageRoot, 'plugin.json'), 'utf8')).extensions.tovu.id, 'local/my-theme');
  const original = installed.find(plugin => plugin.pluginId === 'tovu-theme')!;
  assert.equal(await readFile(path.join(original.packageRoot, input.path), 'utf8'), '# Theme\nUse blue.\n');
  assert.equal(await readFile(path.join(source, 'plugin.json'), 'utf8'), manifest);
  assert.equal((await readBundledAgentPluginDigests(workspaceRoot)).has('my-theme'), false);
  const activation = JSON.parse(await readFile(path.join(workspaceRoot, 'activations.json'), 'utf8')).plugins['my-theme'];
  assert.equal(activation.origin, 'operator-installed');
  // Repeat customization is idempotent; a denied call cannot create another copy.
  assert.equal((await tool.handler(context(input), {}) as { alreadyInstalled: boolean }).alreadyInstalled, true);
  const denied = buildRegistrations({ ...deps, authorize: async () => ({ allowed: false as const, reason: 'insufficient_permission' as const }) }).find(entry => entry.descriptor.id === tool.descriptor.id)!;
  await assert.rejects(denied.handler(context({ ...input, newId: 'denied' }), {}));
  assert.equal((await listInstalledPlugins(workspaceRoot)).some(plugin => plugin.pluginId === 'denied'), false);
  // A malformed edit must not leave a half-installed copy behind.
  await assert.rejects(tool.handler(context({ ...input, newId: 'bad-edit', oldString: 'absent' }), {}), /exactly once/);
  assert.equal((await listInstalledPlugins(workspaceRoot)).some(plugin => plugin.pluginId === 'bad-edit'), false);
});
