/**
 * Plugins plan v2 §3.4 (D0a): the composed bundled id set is pinned, so a typo in the selection or a
 * package that does not resolve fails in CI instead of silently seeding nothing at boot. Reads the real
 * selection and installed packages; needs no composition step and no npm.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { SELECTED_AGENT_PLUGIN_PACKAGES } from '../../../apps/website/src/features/agent-plugins/bundled-catalog.ts';
import { agentPluginSourceDir } from '../../test-support/agent-plugin-source.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Every plugin id Tovu ships: Tovu's own `content/agent-plugins` plus `SELECTED_AGENT_PLUGIN_PACKAGES`.
 * Each cutover (D-W*, D-charts) edits this list in the same commit as its selection rows and deletions.
 * 0.6.19: jev, site-compliance, site-import, wordpress (D-W1) and the charts-recharts face (D-charts)
 * come from packages; the provider faces posthog/sentry/opentelemetry leave at D-W7 (not selected, §3.1).
 */
const EXPECTED_BUNDLED_AGENT_PLUGIN_IDS = [
  'charts-recharts', 'cloudflare', 'composio', 'fly', 'github', 'github-pages', 'google-login', 'google-workspace',
  'higgsfield-media', 'how-tovu-works', 'jev', 'meilisearch', 'netlify', 'opentelemetry', 'posthog',
  'railway', 'render', 'resend', 's3-compatible', 'sentry', 'site-compliance', 'site-import', 'supabase',
  'tovu-theme', 'ui-ux-design', 'vercel', 'wordpress',
];

function contentPluginIds(): string[] {
  const root = path.join(REPO_ROOT, 'content/agent-plugins');
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, 'plugin.json')))
    .map(entry => entry.name);
}

test('the composed bundled id set is pinned, and no id ships from both content and a package', () => {
  const contentIds = contentPluginIds();
  assert.deepEqual(contentIds.filter(id => SELECTED_AGENT_PLUGIN_PACKAGES.has(id)), []);
  assert.deepEqual([...contentIds, ...SELECTED_AGENT_PLUGIN_PACKAGES.keys()].sort(), EXPECTED_BUNDLED_AGENT_PLUGIN_IDS);
});

test('every selected package resolves to a payload whose plugin.json names its selection key', () => {
  for (const [pluginId, packageName] of SELECTED_AGENT_PLUGIN_PACKAGES) {
    const sourceDir = agentPluginSourceDir({ pluginId });
    const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, 'plugin.json'), 'utf8')) as { name?: unknown };
    assert.equal(manifest.name, pluginId, `${packageName} declares '${String(manifest.name)}'`);
  }
});

test('the source helper reads a selected plugin from its package payload and any other id from content', t => {
  const repoRoot = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'tovu-agent-plugin-source-')));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const packageRoot = path.join(repoRoot, 'node_modules/@jini-ai/plugin-jev');
  fs.mkdirSync(path.join(packageRoot, 'jev'), { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name: '@jini-ai/plugin-jev', exports: { './plugin.json': './jev/plugin.json' } }));
  fs.writeFileSync(path.join(packageRoot, 'jev/plugin.json'), JSON.stringify({ name: 'jev' }));
  const selection = new Map([['jev', '@jini-ai/plugin-jev'], ['gone', '@jini-ai/plugin-gone']]);
  assert.equal(agentPluginSourceDir({ pluginId: 'jev' }, { selection, repoRoot }), path.join(packageRoot, 'jev'));
  assert.equal(agentPluginSourceDir({ pluginId: 'tovu-theme' }, { selection, repoRoot }), path.join(repoRoot, 'content/agent-plugins/tovu-theme'));
  assert.throws(() => agentPluginSourceDir({ pluginId: 'gone' }, { selection, repoRoot }), /plugin-gone/);
});
