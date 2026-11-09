import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createTovuAgentPluginLifecycle } from '../../lifecycle.js';
import { resolveAgentPluginLayout } from '../../layout.js';
import { forceRemove } from '../fixtures/force-remove.js';

test('identity deprecations warn once per package across repeated indexes and host bindings', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'tovu-identity-warning-'));
  t.after(() => forceRemove(root));
  const layout = resolveAgentPluginLayout({ siteDir: root });
  const first = createTovuAgentPluginLifecycle({ layout });
  const second = createTovuAgentPluginLifecycle({ layout });
  const warnings: string[] = [];
  t.mock.method(console, 'warn', (message: string) => warnings.push(message));
  for (const pluginId of ['warning-dedupe-a', 'warning-dedupe-b']) {
    const packageRoot = path.join(root, pluginId);
    await mkdir(packageRoot);
    await writeFile(path.join(packageRoot, 'plugin.json'), JSON.stringify({
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: pluginId,
      extensions: { tovu: { id: `test/${pluginId}`, provides: [] } },
    }));
    await first.indexInstalledRoot(packageRoot, 'a'.repeat(64));
    await first.indexInstalledRoot(packageRoot, 'a'.repeat(64));
    await second.indexInstalledRoot(packageRoot, 'a'.repeat(64));
  }
  assert.equal(warnings.length, 2);
  assert.ok(warnings.every(message => message.startsWith('Legacy extensions.tovu agent-plugin metadata is deprecated;')));
});
