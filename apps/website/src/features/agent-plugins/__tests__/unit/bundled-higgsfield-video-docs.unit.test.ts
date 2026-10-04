import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
const root = path.resolve(import.meta.dirname, '../../../../../../../content/agent-plugins/higgsfield-media');
test('Higgsfield setup documents video and its write grant without claiming a deployment-wide ban', async () => {
  const skill = await readFile(path.join(root, 'skills/higgsfield-media/SKILL.md'), 'utf8');
  const gates = await readFile(path.join(root, 'skills/higgsfield-media/references/models-and-plan-gates.md'), 'utf8');
  for (const key of ['allowedToolNames', 'writeAllowedToolNames']) {
    const row = skill.split('\n').find(line => line.startsWith(`| \`${key}\` |`));
    assert.ok(row?.includes('generate_video'), `${key} must include video in the setup recipe`);
  }
  assert.doesNotMatch(gates, /Video is not covered by this plugin|generate_video` is not allowlisted/);
  assert.match(gates, /video\/mp4/);
  assert.match(gates, /video\/webm/);
  const manifest = JSON.parse(await readFile(path.join(root, 'plugin.json'), 'utf8'));
  // The manifest supplies read defaults, so documentation must not imply installation grants writes.
  assert.deepEqual(manifest.extensions.tovu.mcpServers.higgsfield.tovuDefaultTools, { read: ['models_explore', 'job_status'] });
});
