/** Plugin extraction plan §5/T4: stage selected npm assets without changing the active catalog. */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { listAgentPluginPackageFiles, stageSelectedAgentPluginAssets } from '../stage-selected-agent-plugin-assets.js';

/** Isolated installed-package fixture; npm selection is a port, filesystem effects stay real. */
function fixture(t: TestContext) {
  const repoRoot = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'tovu-agent-assets-')));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const packageName = '@jini-ai/plugin-ui-ux-design';
  const packageRoot = path.join(repoRoot, 'node_modules', packageName);
  const files = ['package.json', 'README.md', 'ui-ux-design/plugin.json', 'ui-ux-design/skills/design/SKILL.md'];
  const write = (relative: string, bytes: string) => {
    const target = path.join(repoRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  };
  write(`node_modules/${packageName}/package.json`, JSON.stringify({ name: packageName, exports: {
    './package.json': './package.json', './plugin.json': './ui-ux-design/plugin.json',
  } }));
  write(`node_modules/${packageName}/ui-ux-design/plugin.json`, JSON.stringify({ name: 'ui-ux-design' }));
  write(`node_modules/${packageName}/ui-ux-design/skills/design/SKILL.md`, '# Portable design');
  write(`node_modules/${packageName}/ui-ux-design/ignored.txt`, 'excluded by npm');
  write(`node_modules/${packageName}/README.md`, 'package documentation');
  write('node_modules/@jini-ai/plugin-unused/other/plugin.json', '{}');
  write('content/agent-plugins/ui-ux-design/skills/design/SKILL.md', '# Tovu restrictions');
  const input = { repoRoot, packageNames: [packageName], outputRoot: path.join(repoRoot, 'staged-agent-assets') };
  const options = { listPackageFiles: ({ packageRoot: resolved }: { packageRoot: string }) => {
    assert.equal(resolved, packageRoot);
    return files;
  } };
  return { input, options, packageRoot, files, write };
}

test('T4 stages exactly npm-selected payload bytes, preserves Tovu wording, and repeats identically', t => {
  const f = fixture(t);
  const first = stageSelectedAgentPluginAssets(f.input, f.options);
  assert.deepEqual(first, { sourceRoot: f.input.outputRoot, pluginIds: ['ui-ux-design'] });
  assert.deepEqual(fs.readdirSync(f.input.outputRoot, { recursive: true }).sort(), [
    'ui-ux-design', 'ui-ux-design/plugin.json', 'ui-ux-design/skills',
    'ui-ux-design/skills/design', 'ui-ux-design/skills/design/SKILL.md',
  ].map(value => value.split('/').join(path.sep)).sort());
  const skill = path.join(first.sourceRoot, 'ui-ux-design/skills/design/SKILL.md');
  assert.equal(fs.readFileSync(skill, 'utf8'), '# Portable design');
  assert.deepEqual(stageSelectedAgentPluginAssets({ ...f.input, packageNames: [...f.input.packageNames, ...f.input.packageNames] }, f.options), first);
  assert.equal(fs.readFileSync(path.join(f.input.repoRoot, 'content/agent-plugins/ui-ux-design/skills/design/SKILL.md'), 'utf8'), '# Tovu restrictions');
});

test('T4 empty selection resolves and installs nothing', t => {
  const f = fixture(t);
  assert.deepEqual(stageSelectedAgentPluginAssets({ ...f.input, packageNames: [] }, {
    listPackageFiles: () => { throw new Error('must not inspect unselected packages'); },
  }).pluginIds, []);
  assert.deepEqual(fs.readdirSync(f.input.outputRoot), []);
});

for (const [relative, bytes] of [
  ['staged-agent-assets/ui-ux-design/skills/design/SKILL.md', '# Operator edit'],
  ['staged-agent-assets/uploaded/plugin.json', '{"name":"uploaded"}'],
] as const) {
  test(`T4 preserves conflicting output and refuses selection: ${relative}`, t => {
    const f = fixture(t);
    stageSelectedAgentPluginAssets(f.input, f.options);
    f.write(relative, bytes);
    assert.throws(() => stageSelectedAgentPluginAssets(f.input, f.options), /preserved.*differs/i);
    assert.equal(fs.readFileSync(path.join(f.input.repoRoot, relative), 'utf8'), bytes);
  });
}

test('T4 a missing later package leaves the previous output unchanged and removes scratch files', t => {
  const f = fixture(t);
  stageSelectedAgentPluginAssets(f.input, f.options);
  assert.throws(() => stageSelectedAgentPluginAssets({ ...f.input, packageNames: [...f.input.packageNames, '@jini-ai/plugin-zz-missing'] }, f.options));
  assert.equal(fs.readFileSync(path.join(f.input.outputRoot, 'ui-ux-design/skills/design/SKILL.md'), 'utf8'), '# Portable design');
  assert.equal(fs.readdirSync(f.input.repoRoot).some(name => name.startsWith('.agent-assets-')), false);
});

for (const badFile of ['../escape', '/absolute', 'ui-ux-design/../../escape', 'ui-ux-design\\escape']) {
  test(`T4 rejects unsafe npm file paths: ${badFile}`, t => {
    const f = fixture(t);
    assert.throws(() => stageSelectedAgentPluginAssets(f.input, { listPackageFiles: () => [...f.files, badFile] }), /unsafe/i);
    assert.equal(fs.existsSync(f.input.outputRoot), false);
  });
}

test('T4 refuses missing npm manifests, duplicate identities and symlinked payload files', t => {
  const f = fixture(t);
  assert.throws(() => stageSelectedAgentPluginAssets(f.input, { listPackageFiles: () => f.files.slice(0, 2) }), /manifest/i);
  f.write('node_modules/@jini-ai/plugin-other/package.json', JSON.stringify({ name: '@jini-ai/plugin-other', exports: {
    './package.json': './package.json', './plugin.json': './ui-ux-design/plugin.json',
  } }));
  f.write('node_modules/@jini-ai/plugin-other/ui-ux-design/plugin.json', '{"name":"ui-ux-design"}');
  assert.throws(() => stageSelectedAgentPluginAssets({ ...f.input, packageNames: [...f.input.packageNames, '@jini-ai/plugin-other'] }, { listPackageFiles: () => ['ui-ux-design/plugin.json'] }), /duplicate/i);
  const skill = path.join(f.packageRoot, 'ui-ux-design/skills/design/SKILL.md');
  fs.unlinkSync(skill);
  fs.symlinkSync(path.join(f.input.repoRoot, 'content/agent-plugins/ui-ux-design/skills/design/SKILL.md'), skill);
  assert.throws(() => stageSelectedAgentPluginAssets(f.input, f.options), /regular|symlink/i);
  assert.equal(fs.existsSync(f.input.outputRoot), false);
});

test('T4 asks npm for an offline dry-run file list with lifecycle scripts disabled', t => {
  const f = fixture(t);
  const npmCli = path.join(f.input.repoRoot, 'npm-cli.cjs');
  f.write('npm-cli.cjs', `
    require('node:assert/strict').deepEqual(process.argv.slice(2), ['pack', '--dry-run', '--json', '--offline', '--ignore-scripts', '--workspaces=false']);
    require('node:assert/strict').equal(process.cwd(), ${JSON.stringify(f.packageRoot)});
    process.stdout.write(JSON.stringify([{files: ${JSON.stringify(f.files.map(filename => ({ path: filename })))}}]));
  `);
  assert.deepEqual(listAgentPluginPackageFiles({ packageRoot: f.packageRoot }, { npmCli }), f.files);
  const staged = stageSelectedAgentPluginAssets(f.input, { npmCli });
  assert.equal(fs.readFileSync(path.join(staged.sourceRoot, 'ui-ux-design/skills/design/SKILL.md'), 'utf8'), '# Portable design');
  assert.throws(() => listAgentPluginPackageFiles({ packageRoot: f.packageRoot }, { npmCli: '' }), /npmCli/);
  const failure = new Error('npm listing failed');
  assert.throws(() => listAgentPluginPackageFiles({ packageRoot: f.packageRoot }, {
    npmCli, runNode: () => { throw failure; },
  }), error => error === failure);
});

test('T4 partial copy failures never publish a partial selection or remove existing output', t => {
  const f = fixture(t);
  stageSelectedAgentPluginAssets(f.input, f.options);
  let copies = 0;
  assert.throws(() => stageSelectedAgentPluginAssets(f.input, { ...f.options, filesystem: {
    ...fs, copyFileSync: (...args: Parameters<typeof fs.copyFileSync>) => {
      if (++copies === 2) throw new Error('disk full');
      fs.copyFileSync(...args);
    },
  } }), /disk full/);
  assert.equal(fs.readFileSync(path.join(f.input.outputRoot, 'ui-ux-design/skills/design/SKILL.md'), 'utf8'), '# Portable design');
  assert.equal(fs.readdirSync(f.input.repoRoot).some(name => name.startsWith('.agent-assets-')), false);
});

test('T4 multiple selected packages produce sorted identities independent of input and npm order', t => {
  const f = fixture(t);
  const second = '@jini-ai/plugin-zebra';
  f.write(`node_modules/${second}/package.json`, JSON.stringify({ name: second, exports: {
    './package.json': './package.json', './plugin.json': './payload/plugin.json',
  } }));
  f.write(`node_modules/${second}/payload/plugin.json`, '{"name":"zebra"}');
  const listPackageFiles = ({ packageRoot }: { packageRoot: string }) => packageRoot === f.packageRoot
    ? [...f.files].reverse() : ['payload/plugin.json'];
  const first = stageSelectedAgentPluginAssets({ ...f.input, packageNames: [second, ...f.input.packageNames] }, { listPackageFiles });
  assert.deepEqual(first.pluginIds, ['ui-ux-design', 'zebra']);
  assert.equal(fs.readFileSync(path.join(first.sourceRoot, 'zebra/plugin.json'), 'utf8'), '{"name":"zebra"}');
  assert.deepEqual(stageSelectedAgentPluginAssets({ ...f.input, packageNames: [...f.input.packageNames, second] }, { listPackageFiles }), first);
});

test('T4 resolves locally linked Jini packages without copying their unshipped files', t => {
  const f = fixture(t);
  const linkedRoot = path.join(f.input.repoRoot, 'linked-jini-design');
  fs.renameSync(f.packageRoot, linkedRoot);
  fs.symlinkSync(linkedRoot, f.packageRoot, 'junction');
  const staged = stageSelectedAgentPluginAssets(f.input, { listPackageFiles: ({ packageRoot }) => {
    assert.equal(packageRoot, linkedRoot);
    return f.files;
  } });
  assert.equal(fs.readFileSync(path.join(staged.sourceRoot, 'ui-ux-design/skills/design/SKILL.md'), 'utf8'), '# Portable design');
  assert.equal(fs.existsSync(path.join(staged.sourceRoot, 'ui-ux-design/ignored.txt')), false);
});
