import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { packAgentPluginDirectory } from '../../../../apps/website/src/features/agent-plugins/lifecycle.ts';

test('the theme package ships its v2 contract and teaches native tool authoring', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const packed = await packAgentPluginDirectory(root);
  assert.ok(packed.files.includes('skills/tovu-theme/references/theme-v2-contract.md'));
  assert.ok(packed.files.includes('skills/tovu-theme/references/kuinetic-worked-example.md'));
  assert.ok(packed.files.includes('skills/tovu-theme/references/motion.md'));
  const skill = await readFile(path.join(root, 'skills/tovu-theme/SKILL.md'), 'utf8');
  assert.match(skill, /theme_set_page_published/);
  assert.match(skill, /theme_import_local_file/);
  assert.match(skill, /theme_import_file_from_url/);
  assert.match(skill, /apiVersion 2/);
  assert.match(skill, /never.*Bash|Never.*Bash/);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'mcp.json'), 'utf8')).mcpServers, {});
});
