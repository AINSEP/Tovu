import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('npm test readers see selected package plugins before importing any test fixture', () => {
  const { scripts } = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> };
  for (const name of ['test', 'test:ci', 'test:cov', 'test:cov:server', 'test:cov:server:unit', 'test:cov:server:integration']) {
    assert.match(scripts[name]!, /--import \.\/development\/test-support\/composed-bundle-env\.ts/, name);
  }
  const env = { ...process.env };
  delete env.TOVU_BUNDLED_AGENT_PLUGINS_DIR;
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--import', './development/test-support/composed-bundle-env.ts', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { existsSync } from 'node:fs';
    import path from 'node:path';
    import { bundledAgentPluginsDir } from './apps/website/src/platform/site-dir/product-root.ts';
    import { SELECTED_AGENT_PLUGIN_PACKAGES } from './apps/website/src/features/agent-plugins/bundled-catalog.ts';
    const root = bundledAgentPluginsDir();
    for (const id of SELECTED_AGENT_PLUGIN_PACKAGES.keys()) assert.ok(existsSync(path.join(root, id, 'plugin.json')), id);
    assert.ok(existsSync(path.join(root, 'tovu-theme', 'plugin.json')));
  `], { env, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
});

test('a test child keeps an explicitly supplied bundled plugin root', () => {
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--import', './development/test-support/composed-bundle-env.ts', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    assert.equal(process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR, '/test/explicit-bundle');
  `], { env: { ...process.env, TOVU_BUNDLED_AGENT_PLUGINS_DIR: '/test/explicit-bundle' }, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
});
