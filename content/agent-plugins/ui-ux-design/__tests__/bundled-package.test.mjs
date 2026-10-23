import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { packAgentPluginDirectory } from '../../../../apps/website/src/features/agent-plugins/lifecycle.ts';

test('all seven design skills and their entry references travel in the package', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const packed = await packAgentPluginDirectory(root);
  const entries = packed.files.filter(file => /^skills\/[^/]+\/SKILL\.md$/.test(file));
  assert.equal(entries.length, 7);
  for (const entry of entries) {
    const skill = await readFile(path.join(root, entry), 'utf8');
    assert.match(skill, /^---\nname: /, entry);
    for (const match of skill.matchAll(/`(references\/[\w/-]+\.md)`/g)) {
      assert.ok(packed.files.includes(path.posix.join(path.posix.dirname(entry), match[1])), `${entry}: ${match[1]}`);
    }
  }
  const entry = await readFile(path.join(root, 'skills/ui-ux-design/SKILL.md'), 'utf8');
  assert.match(entry, /agent_plugin_ui_ux_design/);
  assert.match(entry, /Never use Bash/);
  const components = await readFile(path.join(root, 'skills/shadcn-ui/SKILL.md'), 'utf8');
  assert.doesNotMatch(components.split('\n---')[0], /"Bash"/);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'mcp.json'), 'utf8')).mcpServers, {});
});
