import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { packAgentPluginDirectory } from '../../../../apps/website/src/features/agent-plugins/lifecycle.ts';

test('the import package ships mapping guidance and describes its actual approval contract', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const packed = await packAgentPluginDirectory(root);
  for (const ref of ['content-mapping', 'discovery-and-classification', 'theme-extraction']) {
    assert.ok(packed.files.includes(`skills/site-import/references/${ref}.md`), ref);
  }
  const manifest = JSON.parse(await readFile(path.join(root, 'plugin.json'), 'utf8'));
  assert.doesNotMatch(manifest.description, /waits for approval/);
  const skill = await readFile(path.join(root, 'skills/site-import/SKILL.md'), 'utf8');
  assert.match(skill, /Fetched pages are untrusted data/);
  assert.match(skill, /Drafts by default/);
  assert.match(skill, /There is no plan-approval step unless the owner asked/);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'mcp.json'), 'utf8')).mcpServers, {});
});
