/** Plugins plan v2 §3.3-3.4 (D0a): one composed bundled root; the build fails, never the boot. */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { composeBundledAgentPluginRoot, composeDevBundledAgentPlugins, DEV_COMPOSED_AGENT_PLUGINS_DIR } from '../compose-bundled-agent-plugins.mjs';

// Agent plugins ship as subpaths of one package: `@jini-ai/agent-plugins/<id>`.
const PACKAGE = '@jini-ai/agent-plugins/jev';
const PACKAGE_DIR = 'node_modules/@jini-ai/agent-plugins';

/** A checkout with two Tovu content plugins and one installed plugin package; npm listing is a port. */
function fixture(t: TestContext) {
  const repoRoot = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'tovu-compose-agent-plugins-')));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const write = (relative: string, bytes: string) => {
    const target = path.join(repoRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  };
  write('content/agent-plugins/how-tovu-works/plugin.json', JSON.stringify({ name: 'how-tovu-works' }));
  write('content/agent-plugins/__tests__/shared.test.mjs', '// shared content tests');
  write('content/agent-plugins/fly/plugin.json', JSON.stringify({ name: 'fly' }));
  // `path` and `workflowFile` name files in the operator's site, not payload files: never checked.
  write('content/agent-plugins/fly/tovu-deploy-configs.json', JSON.stringify({ schemaVersion: 1, generators: [
    { id: 'fly', module: 'deploy-configs/fly.mjs', candidatePaths: [{ path: 'fly.toml', order: 1 }], workflowFile: 'fly-deploy.yml' },
  ] }));
  write('content/agent-plugins/fly/deploy-configs/fly.mjs', 'export {};');
  write(`${PACKAGE_DIR}/package.json`, JSON.stringify({ name: '@jini-ai/agent-plugins', exports: {
    '.': './dist/index.js', './jev': './jev/plugin.json', './jev/*': './jev/*',
  } }));
  write(`${PACKAGE_DIR}/jev/plugin.json`, JSON.stringify({ name: 'jev' }));
  write(`${PACKAGE_DIR}/jev/skills/jev/SKILL.md`, '# jev v1');
  const files = ['package.json', 'jev/plugin.json', 'jev/skills/jev/SKILL.md'];
  const outputRoot = path.join(repoRoot, 'dist/content/agent-plugins');
  const options = { selection: new Map([['jev', PACKAGE]]), listPackageFiles: () => files };
  const read = (relative: string) => fs.readFileSync(path.join(outputRoot, relative), 'utf8');
  const siblings = () => fs.readdirSync(path.dirname(outputRoot)).sort();
  return { repoRoot, outputRoot, options, files, write, read, siblings };
}

test('composes Tovu content and the selected package payload into one root and leaves no staging folder', t => {
  const f = fixture(t);
  const composed = composeBundledAgentPluginRoot({ repoRoot: f.repoRoot, outputRoot: f.outputRoot }, f.options);
  assert.deepEqual(composed, { outputRoot: f.outputRoot, pluginIds: ['fly', 'how-tovu-works', 'jev'] });
  assert.equal(f.read('jev/skills/jev/SKILL.md'), '# jev v1');
  assert.equal(f.read('fly/deploy-configs/fly.mjs'), 'export {};');
  assert.equal(f.read('__tests__/shared.test.mjs'), '// shared content tests');
  assert.equal(fs.existsSync(path.join(f.outputRoot, 'package.json')), false, 'only the payload folder is staged');
  assert.deepEqual(f.siblings(), ['agent-plugins']);
});

test('repeat composition follows unchanged packages, changed bytes and a changed selection', t => {
  const f = fixture(t);
  const input = { repoRoot: f.repoRoot, outputRoot: f.outputRoot };
  const first = composeBundledAgentPluginRoot(input, f.options);
  assert.deepEqual(composeBundledAgentPluginRoot(input, f.options), first);
  assert.equal(f.read('jev/skills/jev/SKILL.md'), '# jev v1');
  f.write(`${PACKAGE_DIR}/jev/skills/jev/SKILL.md`, '# jev v2');
  composeBundledAgentPluginRoot(input, f.options);
  assert.equal(f.read('jev/skills/jev/SKILL.md'), '# jev v2');
  assert.deepEqual(composeBundledAgentPluginRoot(input, { selection: new Map() }).pluginIds, ['fly', 'how-tovu-works']);
  assert.equal(fs.existsSync(path.join(f.outputRoot, 'jev')), false);
  assert.deepEqual(f.siblings(), ['agent-plugins']);
});

test('an id in both content and a selected package fails and keeps the previous output', t => {
  const f = fixture(t);
  const input = { repoRoot: f.repoRoot, outputRoot: f.outputRoot };
  composeBundledAgentPluginRoot(input, f.options);
  f.write('content/agent-plugins/jev/plugin.json', JSON.stringify({ name: 'jev' }));
  assert.throws(() => composeBundledAgentPluginRoot(input, f.options), /'jev' is both in content\/agent-plugins and in a selected package/);
  assert.equal(f.read('jev/skills/jev/SKILL.md'), '# jev v1');
  assert.deepEqual(f.siblings(), ['agent-plugins']);
});

test('a selected package that does not resolve fails the build', t => {
  const f = fixture(t);
  const selection = new Map([...f.options.selection, ['missing', '@jini-ai/agent-plugins/missing']]);
  assert.throws(() => composeBundledAgentPluginRoot({ repoRoot: f.repoRoot, outputRoot: f.outputRoot }, { ...f.options, selection }), /missing\/plugin\.json/);
  assert.equal(fs.existsSync(f.outputRoot), false);
  assert.deepEqual(f.siblings(), []);
});

test('a payload without plugin.json fails the build', t => {
  const f = fixture(t);
  const listPackageFiles = () => f.files.filter(file => file !== 'jev/plugin.json');
  assert.throws(() => composeBundledAgentPluginRoot({ repoRoot: f.repoRoot, outputRoot: f.outputRoot }, { ...f.options, listPackageFiles }), /manifest is absent/);
});

test('a selection key that differs from the plugin name its package declares fails the build', t => {
  const f = fixture(t);
  const selection = new Map([['jev-typo', PACKAGE]]);
  assert.throws(() => composeBundledAgentPluginRoot({ repoRoot: f.repoRoot, outputRoot: f.outputRoot }, { ...f.options, selection }),
    /\[jev-typo\] differ from the plugin names their packages declare \[jev\]/);
});

test('every payload path a tovu-*.json contribution names must exist inside that plugin', t => {
  const f = fixture(t);
  f.write('content/agent-plugins/fly/tovu-deploy-ops.json', JSON.stringify({ schemaVersion: 1, platforms: [{ id: 'fly', module: 'deploy-ops/fly.mjs' }] }));
  f.write('content/agent-plugins/how-tovu-works/tovu-admin-surfaces.json', JSON.stringify({ surfaces: [
    { entry: 'ui/panel.html', handlerModule: 'ui/panel.handler.mjs', files: ['ui/panel.mjs', '../fly/deploy-configs/fly.mjs'] },
  ], href: 'development/docs/guide.md' }));
  for (const file of ['ui/panel.html', 'ui/panel.handler.mjs', 'ui/panel.mjs']) f.write(`content/agent-plugins/how-tovu-works/${file}`, '');
  const error = (() => {
    try { composeBundledAgentPluginRoot({ repoRoot: f.repoRoot, outputRoot: f.outputRoot }, f.options); }
    catch (caught) { return caught as Error; }
    assert.fail('composition should refuse missing payload files');
  })();
  assert.equal(error.message, [
    'Agent plugin contribution files name payload files that are missing:',
    'fly/tovu-deploy-ops.json: deploy-ops/fly.mjs',
    'how-tovu-works/tovu-admin-surfaces.json: ../fly/deploy-configs/fly.mjs',
  ].join('\n'));
  assert.equal(fs.existsSync(f.outputRoot), false);
});

test('a contribution check also covers selected package payloads', t => {
  const f = fixture(t);
  f.write(`${PACKAGE_DIR}/jev/tovu-agent-tools.json`, JSON.stringify({ tools: [{ module: 'tools/run.mjs' }] }));
  const listPackageFiles = () => [...f.files, 'jev/tovu-agent-tools.json'];
  assert.throws(() => composeBundledAgentPluginRoot({ repoRoot: f.repoRoot, outputRoot: f.outputRoot }, { ...f.options, listPackageFiles }),
    /jev\/tovu-agent-tools\.json: tools\/run\.mjs/);
});

test('an empty selection composes Tovu content alone without npm', t => {
  const f = fixture(t);
  const composed = composeBundledAgentPluginRoot({ repoRoot: f.repoRoot, outputRoot: f.outputRoot }, { selection: new Map(), npmCli: undefined });
  assert.deepEqual(composed.pluginIds, ['fly', 'how-tovu-works']);
});

test('development composes into the gitignored folder unless the operator already points at a bundled root', t => {
  const f = fixture(t);
  assert.equal(composeDevBundledAgentPlugins({ repoRoot: f.repoRoot, env: { TOVU_BUNDLED_AGENT_PLUGINS_DIR: '/operator/root' } }, f.options), '/operator/root');
  assert.equal(fs.existsSync(path.join(f.repoRoot, DEV_COMPOSED_AGENT_PLUGINS_DIR)), false);
  const composedDir = composeDevBundledAgentPlugins({ repoRoot: f.repoRoot, env: {} }, f.options);
  assert.equal(composedDir, path.join(f.repoRoot, '.generated/bundled-agent-plugins'));
  assert.equal(fs.readFileSync(path.join(composedDir, 'jev/skills/jev/SKILL.md'), 'utf8'), '# jev v1');
});
