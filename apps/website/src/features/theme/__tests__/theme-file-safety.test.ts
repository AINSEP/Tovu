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

const font = Buffer.from([0x77, 0x4f, 0x46, 0x32, 0, 255]);
const turn = () => new Promise<void>(resolve => setImmediate(resolve));

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
  ] });
  const run = (toolId: string, input: unknown, emitSurface?: () => Promise<void>) => {
    const ctx: ToolExecutionContext = { executionId: 'exec', run: { id: 'run' }, principal: { id: 'owner' }, input, signal: controller.signal };
    return registrations.find(r => r.descriptor.id === toolId)!.handler(ctx, { emitSurface });
  };
  const answer = (toolId: string, decision = 'confirm') => store.deliver({ exchangeId: 'approval', principalId: 'owner', params: { decision } }, { toolId });
  const revisions = () => listThemeFiles({ themeDir, themesRoot: root }).filter(file => file.startsWith('.trash/revisions/'));
  return { deps, root, themeDir, run, answer, revisions };
}

const cases = [
  { toolId: 'theme_write_file', ext: 'css', fields: { content: 'new' } },
  { toolId: 'theme_edit_file', ext: 'css', fields: { oldString: 'old', newString: 'new' } },
  { toolId: 'theme_reset_file', ext: 'css', fields: {} },
  { toolId: 'theme_import_file_from_url', ext: 'woff2', fields: { url: 'https://example.com/font.woff2' } },
  { toolId: 'theme_import_local_file', ext: 'woff2', fields: { root: 'custom', sourcePath: 'source.woff2' } },
];

for (const { toolId, ext, fields } of cases) {
  test(`${toolId}: replacing two theme files asks once and keeps both previous files restorable`, async t => {
    const f = fixture(t);
    let cards = 0;
    const before = fs.readFileSync(path.join(f.themeDir, `a.${ext}`));
    const pending = f.run(toolId, { items: ['a', 'b'].map(name => ({ themeId: 'copy', path: `${name}.${ext}`, ...fields })) }, async () => { cards++; });
    await turn();
    assert.equal(cards, 1);
    assert.deepEqual(fs.readFileSync(path.join(f.themeDir, `a.${ext}`)), before);
    assert.deepEqual(f.revisions(), []);
    assert.deepEqual(f.answer(toolId), { ok: true });
    const result = await pending as { batch: boolean; total: number };
    assert.equal(result.batch, true);
    assert.equal(result.total, 2);
    assert.equal(cards, 1);
    assert.equal(f.revisions().length, 2);
    for (const revision of f.revisions()) {
      assert.match(originalPathFromTrashedPath(revision)!, new RegExp(`^[ab]\\.${ext}$`));
      assert.deepEqual(fs.readFileSync(path.join(f.themeDir, revision)), before);
    }
  });

  test(`${toolId}: declining a replacement leaves files and revision history untouched`, async t => {
    const f = fixture(t);
    const before = fs.readFileSync(path.join(f.themeDir, `a.${ext}`));
    const pending = f.run(toolId, { themeId: 'copy', path: `a.${ext}`, ...fields }, async () => {});
    await turn();
    assert.deepEqual(f.answer(toolId, 'cancel'), { ok: true });
    assert.equal((await pending as { executed: boolean }).executed, false);
    assert.deepEqual(fs.readFileSync(path.join(f.themeDir, `a.${ext}`)), before);
    assert.deepEqual(f.revisions(), []);
  });
}

test('a newly created theme file needs no replacement card or revision', async t => {
  const f = fixture(t);
  await f.run('theme_write_file', { themeId: 'copy', path: 'new.css', content: 'new' }, async () => assert.fail('new file needs no card'));
  assert.equal(fs.readFileSync(path.join(f.themeDir, 'new.css'), 'utf8'), 'new');
  assert.deepEqual(f.revisions(), []);
});

test('a theme replacement with no confirmation channel leaves current content unchanged', async t => {
  const f = fixture(t);
  await assert.rejects(f.run('theme_write_file', { themeId: 'copy', path: 'a.css', content: 'new' }), /NO_CONFIRMATION_CHANNEL/);
  assert.equal(fs.readFileSync(path.join(f.themeDir, 'a.css'), 'utf8'), 'old');
  assert.deepEqual(f.revisions(), []);
});

test('the previous theme revision can be restored through the existing restore tool', async t => {
  const f = fixture(t);
  const pending = f.run('theme_write_file', { themeId: 'copy', path: 'a.css', content: 'new' }, async () => {});
  await turn(); f.answer('theme_write_file'); await pending;
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

test('a file changed while its confirmation is open is never overwritten', async t => {
  const f = fixture(t);
  const pending = f.run('theme_write_file', { themeId: 'copy', path: 'a.css', content: 'new' }, async () => {});
  await turn();
  fs.writeFileSync(path.join(f.themeDir, 'a.css'), 'someone else');
  assert.deepEqual(f.answer('theme_write_file'), { ok: true });
  await assert.rejects(pending, /changed.*review|changed.*retry/i);
  assert.equal(fs.readFileSync(path.join(f.themeDir, 'a.css'), 'utf8'), 'someone else');
  assert.deepEqual(f.revisions(), []);
});

test('theme replacement history retains the latest 20 revisions without purging manually trashed files', t => {
  const f = fixture(t);
  const manual = path.join(f.themeDir, '.trash', '123', 'keep.css');
  fs.mkdirSync(path.dirname(manual), { recursive: true }); fs.writeFileSync(manual, 'manual trash');
  for (let i = 0; i < 25; i++) writeThemeFile({ themeDir: f.themeDir, themesRoot: f.root, relativePath: 'a.css', content: String(i) });
  const values = f.revisions().map(file => fs.readFileSync(path.join(f.themeDir, file), 'utf8')).sort((a, b) => Number(a) - Number(b));
  assert.deepEqual(values, Array.from({ length: 20 }, (_, i) => String(i + 4)));
  assert.equal(fs.readFileSync(manual, 'utf8'), 'manual trash');
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
    const pending = f.run('theme_import_file_from_url', { themeId: 'copy', path: 'race.woff2', url: 'https://example.com/font.woff2' }, async () => {});
    const rejected = assert.rejects(pending, /changed.*review|changed.*retry/i);
    if (existed) { await turn(); f.answer('theme_import_file_from_url'); }
    await sourceStarted;
    fs.writeFileSync(destination, 'someone else');
    downloaded();
    await rejected;
    assert.equal(fs.readFileSync(destination, 'utf8'), 'someone else');
    assert.deepEqual(f.revisions(), []);
  });
}

test('a committed theme replacement reloads even when an old revision cannot be pruned', async t => {
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
  const pending = f.run('theme_write_file', { themeId: 'copy', path: 'theme.json', content }, async () => {});
  await turn(); f.answer('theme_write_file');
  await pending;
  assert.equal(fs.readFileSync(path.join(f.themeDir, 'theme.json'), 'utf8'), content);
  assert.equal(f.deps.themes.find(theme => theme.manifest.id === 'copy')?.manifest.name, 'Reloaded');
  assert.equal(warnings.length, 1);
  pruning.mock.restore(); syncBuiltinESMExports();
  writeThemeFile({ themeDir: f.themeDir, themesRoot: f.root, relativePath: 'a.css', content: 'retry retention' });
  assert.equal(f.revisions().length, 20);
});
