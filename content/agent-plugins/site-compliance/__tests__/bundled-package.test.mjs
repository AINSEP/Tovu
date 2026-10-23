import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { packAgentPluginDirectory } from '../../../../apps/website/src/features/agent-plugins/lifecycle.ts';

test('the shipped screening guidance includes every rulepack and preserves evidence limits', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const packed = await packAgentPluginDirectory(root);
  const skill = await readFile(path.join(root, 'skills/site-compliance/SKILL.md'), 'utf8');
  for (const name of ['gdpr-eu-uk', 'ccpa-cpra', 'wcag-2-2']) {
    const ref = `references/${name}.md`;
    assert.ok(packed.files.includes(`skills/site-compliance/${ref}`), ref);
    assert.ok(skill.includes(ref), ref);
  }
  assert.match(skill, /Every finding carries evidence/);
  assert.match(skill, /cannot-determine/);
  assert.match(skill, /Never emit, in any wording/);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'mcp.json'), 'utf8')).mcpServers, {});
});
