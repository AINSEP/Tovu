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
  // Why: a client's uploaded image became widget instances, leaving the page editor's HTML and
  // Interactive tabs blank; the skill must say designed pages live in page HTML and are pages, not posts.
  const guidance = source.skills.find(skill => skill.name === 'how-tovu-works');
  assert.match(guidance.markdown, /put the full layout in the page's HTML/);
  assert.match(guidance.markdown, /never make widgets the page's main content/);
  assert.match(guidance.markdown, /A post is a dated article/);
  assert.match(guidance.markdown, /When unsure, use a page/);
});

test('the site guide contributions point to packaged explanations', async () => {
  const guide = JSON.parse(await readFile(path.join(packageRoot, 'tovu-site-guide.json'), 'utf8'));
  assert.equal(guide.version, 1);
  assert.ok(guide.topics.length > 0);
  for (const topic of guide.topics) assert.ok(topic.id && topic.title);
});

test('the site guide says designed pages live in page HTML and complex layouts are pages, not posts', async () => {
  const guide = JSON.parse(await readFile(path.join(packageRoot, 'tovu-site-guide.json'), 'utf8'));
  const topic = id => guide.topics.find(item => item.id === id);
  const content = topic('how-tovu-works-content');
  assert.match(content.explanation, /put the full layout in the page's HTML/);
  assert.match(content.explanation, /A post is a dated article/);
  assert.match(content.explanation, /When unsure, use a page/);
  const widgets = topic('how-tovu-works-widgets');
  assert.doesNotMatch(widgets.summary, /compose pages/);
  assert.match(widgets.explanation, /never make widgets the page's main content/);
  assert.match(topic('how-tovu-works-themes').explanation, /put its layout in the page's HTML/);
});
