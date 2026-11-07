import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { agentPluginSourceDir } from '../../../../../../../development/test-support/agent-plugin-source.mjs';
const root = agentPluginSourceDir({ pluginId: 'higgsfield-media' });
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
  // Browser sign-in grants the reviewed setup lists; installation alone does not authorize writes.
  assert.deepEqual(manifest.extensions.jini.mcpServers.higgsfield.defaultTools, {
    allow: ['generate_image', 'generate_video', 'models_explore', 'job_status', 'jobs_wait', 'show_generations', 'reveal_generation', 'show_generation_by_ids'],
    write: ['generate_image', 'generate_video', 'reveal_generation'],
    read: ['models_explore', 'job_status', 'jobs_wait', 'show_generations', 'show_generation_by_ids'],
  });
});
