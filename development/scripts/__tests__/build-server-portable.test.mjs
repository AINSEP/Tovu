import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildServer, stageServerRuntimeAssets } from '../build-server.mjs';

test('asset-only refresh replaces stale plugin catalogs without invoking a compiler', () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), 'tovu-plugin-catalog-'));
  try {
    for (const dir of ['templates', 'themes', 'agent-plugins', 'agent-plugin-overlays', 'public']) mkdirSync(path.join(repoRoot, 'content', dir), { recursive: true });
    mkdirSync(path.join(repoRoot, 'apps/website/src/platform/db/drizzle'), { recursive: true });
    mkdirSync(path.join(repoRoot, 'dist/content/agent-plugins/tovuize-site'), { recursive: true });
    writeFileSync(path.join(repoRoot, 'dist/content/agent-plugins/tovuize-site/plugin.json'), 'retired');
    for (const id of ['site-import', 'tovu-theme', 'how-tovu-works', 'ui-ux-design']) {
      mkdirSync(path.join(repoRoot, 'content/agent-plugins', id, 'skills', id), { recursive: true });
      writeFileSync(path.join(repoRoot, 'content/agent-plugins', id, 'plugin.json'), id);
      writeFileSync(path.join(repoRoot, 'content/agent-plugins', id, 'skills', id, 'SKILL.md'), `# ${id}`);
    }
    // content/plugins is gone (D-charts: the Recharts payload comes from @jini-ai/provider-plugins); a
    // checkout without it must still stage, and a stale dist copy must not survive.
    mkdirSync(path.join(repoRoot, 'dist/content/plugins/charts-recharts/0.1.0/client'), { recursive: true });
    writeFileSync(path.join(repoRoot, 'dist/content/plugins/charts-recharts/0.1.0/client/provider.js'), 'stale provider');
    stageServerRuntimeAssets({ repoRoot }, { selection: new Map() });
    assert.equal(existsSync(path.join(repoRoot, 'dist/content/plugins')), false);
    assert.equal(existsSync(path.join(repoRoot, 'dist/content/agent-plugins/tovuize-site')), false);
    for (const id of ['site-import', 'tovu-theme', 'how-tovu-works', 'ui-ux-design']) {
      assert.equal(readFileSync(path.join(repoRoot, 'dist/content/agent-plugins', id, 'plugin.json'), 'utf8'), id);
      assert.equal(readFileSync(path.join(repoRoot, 'dist/content/agent-plugins', id, 'skills', id, 'SKILL.md'), 'utf8'), `# ${id}`);
    }
  } finally { rmSync(repoRoot, { recursive: true, force: true }); }
});

test('portable build clears stale sources, runs compilers in order, and copies hidden content files', () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), 'tovu-build-server-'));
  try {
    for (const dir of ['templates', 'themes', 'agent-plugins', 'agent-plugin-overlays', 'public']) {
      mkdirSync(path.join(repoRoot, 'content', dir), { recursive: true });
      writeFileSync(path.join(repoRoot, 'content', dir, '.asset'), dir);
    }
    mkdirSync(path.join(repoRoot, 'apps/website/src/platform/db/drizzle'), { recursive: true });
    writeFileSync(path.join(repoRoot, 'apps/website/src/platform/db/drizzle/fixture.sql'), '-- fixture only');
    mkdirSync(path.join(repoRoot, 'dist/src'), { recursive: true });
    writeFileSync(path.join(repoRoot, 'dist/src/stale.js'), 'old');
    const calls = [];
    buildServer({ repoRoot }, { npmCli: '/fake/npm-cli.js', tscCli: '/fake/tsc', selection: new Map(), runNode: ({ args }) => {
      calls.push(args);
      if (args[0] === '/fake/tsc') {
        assert.equal(existsSync(path.join(repoRoot, 'dist/src/stale.js')), false);
        mkdirSync(path.join(repoRoot, 'dist/src'), { recursive: true });
        writeFileSync(path.join(repoRoot, 'dist/src/new.js'), 'new');
      }
    } });
    assert.deepEqual(calls, [
      ['/fake/npm-cli.js', 'run', 'build', '--workspace=@tovu/contracts'],
      ['/fake/npm-cli.js', 'run', 'build', '--workspace=@tovu/sdk'],
      ['/fake/tsc', '-p', 'tsconfig.json'],
      [path.join(repoRoot, 'development/scripts/emit-dist-package-json.mjs')],
    ]);
    for (const dir of ['templates', 'themes', 'agent-plugins', 'agent-plugin-overlays', 'public']) {
      assert.equal(readFileSync(path.join(repoRoot, 'dist/content', dir, '.asset'), 'utf8'), dir);
    }
    assert.equal(readFileSync(path.join(repoRoot, 'dist/src/platform/db/drizzle/fixture.sql'), 'utf8'), '-- fixture only');
    assert.equal(existsSync(path.join(repoRoot, 'dist/src/new.js')), true);
  } finally { rmSync(repoRoot, { recursive: true, force: true }); }
});

test('compiler failure stops the build before metadata emission and asset staging', () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), 'tovu-build-fail-'));
  const calls = [];
  try {
    assert.throws(() => buildServer({ repoRoot }, { npmCli: '/fake/npm-cli.js', tscCli: '/fake/tsc', runNode: ({ args }) => {
      calls.push(args); if (args[0] === '/fake/tsc') throw new Error('compiler failed');
    } }), /compiler failed/);
    assert.equal(calls.length, 3);
    assert.equal(existsSync(path.join(repoRoot, 'dist/content')), false);
  } finally { rmSync(repoRoot, { recursive: true, force: true }); }
});

/** Portable content root plus one plugin package; npm's file listing is replaced by `files`. */
function packagedRepo(prefix) {
  const repoRoot = mkdtempSync(path.join(tmpdir(), prefix));
  const write = (relative, bytes) => {
    mkdirSync(path.dirname(path.join(repoRoot, relative)), { recursive: true });
    writeFileSync(path.join(repoRoot, relative), bytes);
  };
  for (const dir of ['templates', 'themes', 'public']) mkdirSync(path.join(repoRoot, 'content', dir), { recursive: true });
  mkdirSync(path.join(repoRoot, 'apps/website/src/platform/db/drizzle'), { recursive: true });
  write('content/agent-plugins/tovu-theme/plugin.json', JSON.stringify({ name: 'tovu-theme' }));
  write('content/agent-plugin-overlays/site-import/GUIDANCE.md', '# Tovu site-import rules');
  write('content/agent-plugin-overlays/site-import/host/content-mapping.md', '# mapping');
  write('node_modules/@jini-ai/agent-plugins/package.json', JSON.stringify({ name: '@jini-ai/agent-plugins', exports: { './site-import': './site-import/plugin.json', './site-import/*': './site-import/*' } }));
  write('node_modules/@jini-ai/agent-plugins/site-import/plugin.json', JSON.stringify({ name: 'site-import' }));
  write('node_modules/@jini-ai/agent-plugins/site-import/skills/site-import/SKILL.md', '# site-import');
  return { repoRoot, write };
}

test('D0a: the runtime assets carry the composed plugin root and the Tovu overlays', () => {
  const { repoRoot } = packagedRepo('tovu-build-compose-');
  try {
    const selection = new Map([['site-import', '@jini-ai/agent-plugins/site-import']]);
    const listPackageFiles = () => ['package.json', 'site-import/plugin.json', 'site-import/skills/site-import/SKILL.md'];
    stageServerRuntimeAssets({ repoRoot }, { selection, npmCli: undefined, listPackageFiles });
    assert.equal(readFileSync(path.join(repoRoot, 'dist/content/agent-plugins/site-import/skills/site-import/SKILL.md'), 'utf8'), '# site-import');
    assert.equal(readFileSync(path.join(repoRoot, 'dist/content/agent-plugins/tovu-theme/plugin.json'), 'utf8'), JSON.stringify({ name: 'tovu-theme' }));
    assert.equal(readFileSync(path.join(repoRoot, 'dist/content/agent-plugin-overlays/site-import/host/content-mapping.md'), 'utf8'), '# mapping');
    assert.deepEqual(readdirSync(path.join(repoRoot, 'dist/content')).sort(), ['agent-plugin-overlays', 'agent-plugins', 'public', 'templates', 'themes']);
  } finally { rmSync(repoRoot, { recursive: true, force: true }); }
});

test('D0a: a composition refusal fails the asset step instead of shipping a partial plugin root', () => {
  const { repoRoot, write } = packagedRepo('tovu-build-compose-fail-');
  try {
    write('content/agent-plugins/tovu-theme/tovu-site-guide.json', JSON.stringify({ module: 'guide/missing.mjs' }));
    assert.throws(() => stageServerRuntimeAssets({ repoRoot }, { selection: new Map() }), /tovu-theme\/tovu-site-guide\.json: guide\/missing\.mjs/);
    assert.equal(existsSync(path.join(repoRoot, 'dist/content/agent-plugins')), false);
  } finally { rmSync(repoRoot, { recursive: true, force: true }); }
});

test('runtime assets leave out __tests__ folders: test fixtures import repo sources the payload never ships', () => {
  const { repoRoot, write } = packagedRepo('tovu-build-no-tests-');
  try {
    write('content/agent-plugins/tovu-theme/__tests__/bundled-package.test.mjs', "import '../../../../apps/website/src/x.ts';");
    write('content/agent-plugin-overlays/site-import/__tests__/fixtures/ops-fixture.mjs', "import '../../../../../apps/website/src/x.ts';");
    write('content/themes/__tests__/theme.test.mjs', '');
    stageServerRuntimeAssets({ repoRoot }, { selection: new Map() });
    const tests = readdirSync(path.join(repoRoot, 'dist/content'), { recursive: true }).filter(entry => String(entry).split(path.sep).includes('__tests__'));
    assert.deepEqual(tests, []);
    assert.equal(readFileSync(path.join(repoRoot, 'dist/content/agent-plugin-overlays/site-import/host/content-mapping.md'), 'utf8'), '# mapping');
    assert.equal(readFileSync(path.join(repoRoot, 'dist/content/agent-plugins/tovu-theme/plugin.json'), 'utf8'), JSON.stringify({ name: 'tovu-theme' }));
  } finally { rmSync(repoRoot, { recursive: true, force: true }); }
});
