import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { packAgentPluginDirectory } from '../../../../apps/website/src/features/agent-plugins/lifecycle.ts';

test('the WordPress package ships both guides without a deploy target or connection card', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const packed = await packAgentPluginDirectory(root);
  const skillPath = 'skills/wordpress/SKILL.md';
  const skill = await readFile(path.join(root, skillPath), 'utf8');
  assert.ok(packed.files.includes(skillPath));
  for (const name of ['subdomain', 'free-site-redirect']) {
    const ref = `references/${name}.md`;
    assert.ok(packed.files.includes(`skills/wordpress/${ref}`), ref);
    assert.ok(skill.includes(ref), ref);
  }
  const manifest = JSON.parse(await readFile(path.join(root, 'plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'wordpress');
  assert.equal(manifest.extensions.tovu.id, 'tovu/wordpress');
  assert.equal(manifest.extensions.tovu.credentialCards, undefined);
  assert.ok(!packed.files.includes('tovu-deploy-targets.json'));
  assert.ok(!packed.files.includes('mcp.json'));
  assert.ok(!manifest.extensions.tovu.provides.some(value => value.startsWith('deploy-target:')));
});
