import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createTovuAgentPluginLifecycle } from '../../../../apps/website/src/features/agent-plugins/lifecycle.ts';
import { resolveAgentPluginLayout } from '../../../../apps/website/src/features/agent-plugins/layout.ts';
import { loadInstalledAgentPluginToolSources } from '../../../../apps/website/src/features/agent-plugins/tool-registrations.ts';
import { forceRemove } from '../../../../apps/website/src/features/agent-plugins/__tests__/fixtures/force-remove.ts';

const packageRoot = path.resolve(import.meta.dirname, '..');

test('seeding exposes both skills through the installed plugin guidance tool', async (t) => {
  const siteDir = await mkdtemp(path.join(tmpdir(), 'plugin-authoring-'));
  t.after(() => forceRemove(siteDir));
  const sourceRoot = path.join(siteDir, 'bundled');
  await cp(packageRoot, path.join(sourceRoot, 'how-tovu-works'), { recursive: true });
  const layout = resolveAgentPluginLayout({ siteDir, env: {} });
  const lifecycle = createTovuAgentPluginLifecycle({ layout });
  const seeded = await lifecycle.seedBundledAgentPlugins({ layout, workspaceId: 'workspace-local', sourceRoot });
  const outcome = seeded.outcomes.find(item => item.pluginId === 'how-tovu-works');
  assert.equal(outcome?.status, 'seeded');
  assert.equal(seeded.ledgerFailure, undefined);
  const sources = await loadInstalledAgentPluginToolSources({ workspaceId: 'workspace-local', agentPluginLayout: layout });
  const source = sources.find(item => item.pluginId === 'how-tovu-works');
  assert.ok(source);
  assert.equal(source.id, 'agent_plugin_how_tovu_works');
  assert.equal(source.defaultSkillName, 'how-tovu-works');
  assert.deepEqual(source.skills.map(skill => skill.name).sort(), ['build-agent-plugin', 'how-tovu-works']);
  assert.equal(source.archiveDigest, outcome.archiveDigest);
  const authoring = source.skills.find(skill => skill.name === 'build-agent-plugin');
  assert.match(authoring.markdown, /kind:"plugin-provider"/);
  assert.match(authoring.markdown, /Never use Bash/);
});

test('the site guide contributions point to packaged explanations', async () => {
  const guide = JSON.parse(await readFile(path.join(packageRoot, 'tovu-site-guide.json'), 'utf8'));
  assert.equal(guide.version, 1);
  assert.ok(guide.topics.length > 0);
  for (const topic of guide.topics) assert.ok(topic.id && topic.title);
});
