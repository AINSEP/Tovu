import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { packAgentPluginDirectory } from '../../../../apps/website/src/features/agent-plugins/lifecycle.ts';

test('the design-only package ships its API references without claiming executable chat tools', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const packed = await packAgentPluginDirectory(root);
  for (const name of ['primitives-reference', 'javascript-sdk', 'jaggedness', 'patterns', 'cookbooks']) {
    assert.ok(packed.files.includes(`skills/jev/references/${name}.md`), name);
  }
  const mcp = JSON.parse(await readFile(path.join(root, 'mcp.json'), 'utf8'));
  assert.deepEqual(mcp.mcpServers, {});
  const skill = await readFile(path.join(root, 'skills/jev/SKILL.md'), 'utf8');
  assert.match(skill, /This plugin has no MCP server/);
  assert.match(skill, /TYPESAFE_API_KEY.*never in chat/);
  assert.match(skill, /non-generative/);
});
