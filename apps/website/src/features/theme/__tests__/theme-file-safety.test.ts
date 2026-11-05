import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { syncBuiltinESMExports } from 'node:module';
import type { ToolExecutionContext } from '@jini-ai/core';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createSystemClock } from '@jini-ai/core/primitives';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { discoverAllBuiltInThemes } from '../theme.js';
import { buildThemesRegistrations } from '../tool-registrations.js';
import { buildImportThemeFileRegistrations, type ImportThemeFileToolDeps } from '../import-theme-file-tool.js';
import { listThemeFiles, writeThemeFile } from '../theme-files.js';
import { originalPathFromTrashedPath } from '../file-identity-lock.js';
import { applyBatchInputs } from '../../../assistant/batch-tool-inputs.js';
import { applyToolApprovalPolicy } from '../../../assistant/tool-approval-policy.js';
import { THEME_CONTENT_REPLACEMENT_TOOL_IDS, toolMetadata } from '../../../contracts/core/tool-metadata/theme.js';

const font = Buffer.from([0x77, 0x4f, 0x46, 0x32, 0, 255]);

function fixture(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-file-safety-'));
  const themeDir = path.join(root, 'copy');
  fs.mkdirSync(themeDir);
  fs.writeFileSync(path.join(themeDir, 'theme.json'), JSON.stringify({ id: 'copy', name: 'Copy', version: '1.0.0', tier: 'static', engine: 1 }));
  for (const file of ['a.css', 'b.css']) fs.writeFileSync(path.join(themeDir, file), 'old');
  fs.writeFileSync(path.join(themeDir, 'a.woff2'), font);
  fs.writeFileSync(path.join(themeDir, 'b.woff2'), font);
  fs.writeFileSync(path.join(root, 'source.woff2'), Buffer.concat([font, Buffer.from('new')]));
  const originalDir = path.join(root, '__original-themes__', 'static', 'copy');
  fs.mkdirSync(originalDir, { recursive: true });
  fs.copyFileSync(path.join(themeDir, 'theme.json'), path.join(originalDir, 'theme.json'));
  for (const file of ['a.css', 'b.css']) fs.writeFileSync(path.join(originalDir, file), 'original');
  const deps: ImportThemeFileToolDeps = {
    workspaceId: 'ws', themesDir: root, themes: discoverAllBuiltInThemes({ dir: root, source: 'built-in' }),
    resolveActiveThemeId: async () => 'copy', authorize: async () => ({ allowed: true, reason: 'matched' }),
    siteBinding: { dir: root }, resolveRoots: () => ({ repo: undefined, site: root, custom: root }),
    mediaImportHttpClient: { send: async () => ({ status: 200, headers: {}, bodyText: '', bodyBytes: Buffer.concat([font, Buffer.from('new')]), bodyTruncated: false }) },
  };
  const controller = new AbortController();
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(),
    idGenerator: { newId: () => 'approval' }, defaultChannel: 'mcp-ui' });
  t.after(() => { controller.abort(); fs.rmSync(root, { recursive: true, force: true }); });
  const registrations = applyBatchInputs({ registrations: [
    ...buildThemesRegistrations(deps, { surfaceExchanges: store }),
    ...buildImportThemeFileRegistrations(deps, { surfaceExchanges: store }),
  ].map(registration => applyToolApprovalPolicy({ registration, surfaces: { surfaceExchanges: store } })) });
  const run = (toolId: string, input: unknown, emitSurface?: () => Promise<void>) => {
    const ctx: ToolExecutionContext = { executionId: 'exec', run: { id: 'run' }, principal: { id: 'owner' }, input, signal: controller.signal };
    return registrations.find(r => r.descriptor.id === toolId)!.handler(ctx, { emitSurface });
  };
  const revisions = () => listThemeFiles({ themeDir, themesRoot: root }).filter(file => file.startsWith('.trash/revisions/'));
  return { deps, root, themeDir, run, revisions };
}

const cases = [
  { toolId: 'theme_write_file', ext: 'css', fields: { content: 'new' }, expected: Buffer.from('new') },
  { toolId: 'theme_edit_file', ext: 'css', fields: { oldString: 'old', newString: 'new' }, expected: Buffer.from('new') },
  { toolId: 'theme_reset_file', ext: 'css', fields: {}, expected: Buffer.from('original') },
  { toolId: 'theme_import_file_from_url', ext: 'woff2', fields: { url: 'https://example.com/font.woff2' }, expected: Buffer.concat([font, Buffer.from('new')]) },
  { toolId: 'theme_import_local_file', ext: 'woff2', fields: { root: 'custom', sourcePath: 'source.woff2' }, expected: Buffer.concat([font, Buffer.from('new')]) },
];

test('all revision-backed theme replacement tools are covered and classified direct', () => {
  assert.deepEqual(cases.map(item => item.toolId), [...THEME_CONTENT_REPLACEMENT_TOOL_IDS]);
  for (const toolId of THEME_CONTENT_REPLACEMENT_TOOL_IDS) {
    assert.equal(toolMetadata[toolId].approval.confirmation, 'direct', toolId);
  }
});

for (const { toolId, ext, fields, expected } of cases) {
  test(`${toolId}: replacing two theme files emits no confirmation and keeps both previous files restorable`, async t => {
    const f = fixture(t);
    let cards = 0;
    const before = fs.readFileSync(path.join(f.themeDir, `a.${ext}`));
    const result = await f.run(toolId, { items: ['a', 'b'].map(name => ({ themeId: 'copy', path: `${name}.${ext}`, ...fields })) }, async () => {
      cards++;
      assert.fail('reversible replacements must not emit a confirmation surface');
    }) as { batch: boolean; total: number };
    assert.equal(result.batch, true);
    assert.equal(result.total, 2);
    assert.equal(cards, 0);
    for (const name of ['a', 'b']) assert.deepEqual(fs.readFileSync(path.join(f.themeDir, `${name}.${ext}`)), expected);
    assert.equal(f.revisions().length, 2);
    for (const revision of f.revisions()) {
      assert.match(originalPathFromTrashedPath(revision)!, new RegExp(`^[ab]\\.${ext}$`));
      assert.deepEqual(fs.readFileSync(path.join(f.themeDir, revision)), before);
    }
  });

  for (const withSurface of [true, false]) {
    test(`${toolId}: a single overwrite ${withSurface ? 'with' : 'without'} a surface channel runs directly and saves the old bytes`, async t => {
      const f = fixture(t);
      const before = fs.readFileSync(path.join(f.themeDir, `a.${ext}`));
      let cards = 0;
      const emitSurface = async () => {
        cards++;
        assert.fail('reversible replacements must not emit a confirmation surface');
      };
      await f.run(toolId, { themeId: 'copy', path: `a.${ext}`, ...fields }, withSurface ? emitSurface : undefined);
      assert.equal(cards, 0);
      assert.deepEqual(fs.readFileSync(path.join(f.themeDir, `a.${ext}`)), expected);
      const revisions = f.revisions();
      assert.equal(revisions.length, 1);
      assert.equal(originalPathFromTrashedPath(revisions[0]!), `a.${ext}`);
      assert.deepEqual(fs.readFileSync(path.join(f.themeDir, revisions[0]!)), before);
    });
  }
}

test('a newly created theme file needs no replacement card or revision', async t => {
  const f = fixture(t);
  await f.run('theme_write_file', { themeId: 'copy', path: 'new.css', content: 'new' }, async () => assert.fail('new file needs no card'));
  assert.equal(fs.readFileSync(path.join(f.themeDir, 'new.css'), 'utf8'), 'new');
  assert.deepEqual(f.revisions(), []);
});

test('the previous theme revision can be restored through the existing restore tool', async t => {
  const f = fixture(t);
  await f.run('theme_write_file', { themeId: 'copy', path: 'a.css', content: 'new' });
  const [revision] = f.revisions();
  assert.ok(revision);
  await f.run('theme_restore_trashed_file', { themeId: 'copy', trashedPath: revision, restoreTo: 'restored.css' });
  assert.equal(fs.readFileSync(path.join(f.themeDir, 'restored.css'), 'utf8'), 'old');
  assert.equal(fs.readFileSync(path.join(f.themeDir, 'a.css'), 'utf8'), 'new');
});

test('a later invalid theme destination prevents both earlier writes and a confirmation card', async t => {
  const f = fixture(t);
  await assert.rejects(f.run('theme_write_file', { items: [
    { themeId: 'copy', path: 'a.css', content: 'new' }, { themeId: 'copy', path: '../escape.css', content: 'bad' },
  ] }, async () => assert.fail('invalid batch must not open a card')), /outside the theme folder/);
  assert.equal(fs.readFileSync(path.join(f.themeDir, 'a.css'), 'utf8'), 'old');
  assert.deepEqual(f.revisions(), []);
});

test('theme revisions refuse a trash symlink escaping the theme before replacing any bytes', t => {
  const f = fixture(t);
  const outside = path.join(f.root, 'outside'); fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(f.themeDir, '.trash'));
  assert.throws(() => writeThemeFile({ themeDir: f.themeDir, themesRoot: f.root, relativePath: 'a.css', content: 'new' }), /outside|escape/i);
  assert.equal(fs.readFileSync(path.join(f.themeDir, 'a.css'), 'utf8'), 'old');
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('a file changed while authorization yields is never overwritten', async t => {
  const f = fixture(t);
  let authorizations = 0;
  f.deps.authorize = async () => {
    authorizations++;
    if (authorizations === 2) fs.writeFileSync(path.join(f.themeDir, 'a.css'), 'someone else');
    return { allowed: true, reason: 'matched' };
  };
  await assert.rejects(f.run('theme_write_file', { themeId: 'copy', path: 'a.css', content: 'new' }), /changed.*review|changed.*retry/i);
  assert.equal(fs.readFileSync(path.join(f.themeDir, 'a.css'), 'utf8'), 'someone else');
  assert.deepEqual(f.revisions(), []);
});

test('theme replacement retains the newest 20 revisions per file and never prunes manual trash', t => {
  const f = fixture(t);
  const manual = path.join(f.themeDir, '.trash', '123', 'keep.css');
  fs.mkdirSync(path.dirname(manual), { recursive: true }); fs.writeFileSync(manual, 'manual trash');
  for (const relativePath of ['a.css', 'b.css']) {
    for (let i = 0; i < 25; i++) writeThemeFile({ themeDir: f.themeDir, themesRoot: f.root, relativePath, content: String(i) }, { now: () => 5_000 });
    const revisions = f.revisions().filter(file => originalPathFromTrashedPath(file) === relativePath);
    const values = revisions.map(file => fs.readFileSync(path.join(f.themeDir, file), 'utf8'));
    assert.equal(values.length, 20, 'retention is bounded independently for each file');
    assert.deepEqual(values.sort((a, b) => Number(a) - Number(b)), Array.from({ length: 20 }, (_, i) => String(i + 4)));
    assert.equal(fs.readFileSync(path.join(f.themeDir, relativePath), 'utf8'), '24');
  }
  assert.equal(f.revisions().length, 40, 'editing another file cannot consume the first file’s retention budget');
  assert.equal(fs.readFileSync(manual, 'utf8'), 'manual trash');
});

test('theme revision numbers increase across repeated timestamps and backward clock steps', t => {
  const f = fixture(t);
  for (const at of [5_000, 5_000, 1_000]) {
    writeThemeFile({ themeDir: f.themeDir, themesRoot: f.root, relativePath: 'a.css', content: String(at) }, { now: () => at });
  }
  assert.deepEqual(f.revisions().map(file => Number(file.split('/')[2])).sort((a, b) => a - b), [5_000, 5_001, 5_002]);
});

for (const existed of [false, true]) {
  test(`a URL import preserves a destination ${existed ? 'changed' : 'created'} while its download waits`, async t => {
    const f = fixture(t);
    const destination = path.join(f.themeDir, 'race.woff2');
    if (existed) fs.writeFileSync(destination, font);
    let downloaded!: () => void;
    let started!: () => void;
    const sourceStarted = new Promise<void>(resolve => { started = resolve; });
    const sourceReady = new Promise<void>(resolve => { downloaded = resolve; });
    f.deps.mediaImportHttpClient.send = async () => {
      started(); await sourceReady;
      return { status: 200, headers: {}, bodyText: '', bodyBytes: font, bodyTruncated: false };
    };
    const pending = f.run('theme_import_file_from_url', { themeId: 'copy', path: 'race.woff2', url: 'https://example.com/font.woff2' });
    const rejected = assert.rejects(pending, /changed.*review|changed.*retry/i);
    await sourceStarted;
    fs.writeFileSync(destination, 'someone else');
    downloaded();
    await rejected;
    assert.equal(fs.readFileSync(destination, 'utf8'), 'someone else');
    assert.deepEqual(f.revisions(), []);
  });
}

test('a committed theme replacement reloads despite pruning failure and retries retention next time', async t => {
  const f = fixture(t);
  for (let i = 0; i < 20; i++) writeThemeFile({ themeDir: f.themeDir, themesRoot: f.root, relativePath: 'a.css', content: String(i) });
  const remove = fs.rmSync;
  const warnings: unknown[][] = [];
  const warn = t.mock.method(console, 'warn', (...args: unknown[]) => { warnings.push(args); });
  const pruning = t.mock.method(fs, 'rmSync', ((file, options) => {
    if (String(file).includes(`${path.sep}revisions${path.sep}`)) throw new Error('EPERM: revision held open');
    return remove(file, options);
  }) as typeof fs.rmSync);
  syncBuiltinESMExports();
  t.after(() => { pruning.mock.restore(); warn.mock.restore(); syncBuiltinESMExports(); });
  const content = JSON.stringify({ id: 'copy', name: 'Reloaded', version: '1.0.0', tier: 'static', engine: 1 });
  for (let i = 0; i < 20; i++) writeThemeFile({ themeDir: f.themeDir, themesRoot: f.root, relativePath: 'theme.json', content });
  await f.run('theme_write_file', { themeId: 'copy', path: 'theme.json', content });
  assert.equal(fs.readFileSync(path.join(f.themeDir, 'theme.json'), 'utf8'), content);
  assert.equal(f.deps.themes.find(theme => theme.manifest.id === 'copy')?.manifest.name, 'Reloaded');
  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0]?.[0]), /File saved; revision cleanup failed/);
  pruning.mock.restore(); syncBuiltinESMExports();
  writeThemeFile({ themeDir: f.themeDir, themesRoot: f.root, relativePath: 'theme.json', content });
  assert.equal(f.revisions().filter(file => originalPathFromTrashedPath(file) === 'theme.json').length, 20);
  assert.equal(f.revisions().filter(file => originalPathFromTrashedPath(file) === 'a.css').length, 20);
});
