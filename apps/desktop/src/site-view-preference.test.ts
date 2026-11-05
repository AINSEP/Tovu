import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readMaximumLiveSiteViews, writeMaximumLiveSiteViews, maximumLiveSiteViewsMenu, refreshMaximumLiveSiteViewsMenu, registerSiteViewPreferenceIpc } from './site-view-preference.ts';
import { LIVE_SITE_VIEWS, SITE_VIEW_PREFERENCE_CHANNELS, clampLiveSiteViews } from './contracts/site-view-preference.ts';
import { readIdleSiteSleepMinutes, writeIdleSiteSleepMinutes, registerIdleSiteSleepIpc } from './site-view-preference.ts';
import { IDLE_SITE_SLEEP_CHANNELS } from './contracts/site-view-preference.ts';

test('idle sites sleep after ten minutes by default; Off/5/10/30 persist beside Loaded sites', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-sleep-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const preferencePath = path.join(dir, 'preferences.json');
  assert.equal(readIdleSiteSleepMinutes({ preferencePath }), 10);
  fs.writeFileSync(preferencePath, JSON.stringify({ maximumLiveSiteViews: 3 }));
  for (const idleSiteSleepMinutes of [0, 5, 10, 30] as const) {
    assert.equal(writeIdleSiteSleepMinutes({ preferencePath, idleSiteSleepMinutes }), idleSiteSleepMinutes);
    assert.equal(readIdleSiteSleepMinutes({ preferencePath }), idleSiteSleepMinutes);
    assert.deepEqual(JSON.parse(fs.readFileSync(preferencePath, 'utf8')), { maximumLiveSiteViews: 3, idleSiteSleepMinutes });
  }
  for (const invalid of [-1, 1, 15, '10', null, undefined, NaN]) {
    const before = fs.readFileSync(preferencePath, 'utf8');
    assert.throws(() => writeIdleSiteSleepMinutes({ preferencePath, idleSiteSleepMinutes: invalid as number }), /INVALID/);
    assert.equal(fs.readFileSync(preferencePath, 'utf8'), before);
    fs.writeFileSync(preferencePath, JSON.stringify({ idleSiteSleepMinutes: invalid }));
    assert.equal(readIdleSiteSleepMinutes({ preferencePath }, { warn: () => {} }), 10);
  }
  fs.writeFileSync(preferencePath, '{damaged');
  assert.equal(readIdleSiteSleepMinutes({ preferencePath }, { warn: () => {} }), 10);
  assert.throws(() => writeIdleSiteSleepMinutes({ preferencePath, idleSiteSleepMinutes: 5 }), /UNREADABLE/);
  assert.equal(fs.readFileSync(preferencePath, 'utf8'), '{damaged');
});

test('sleep IPC validates shell and choices, and failed saves preserve the previous choice', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-sleep-ipc-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const preferencePath = path.join(dir, 'preferences.json');
  const handlers = new Map<string, (event: { sender: string }, value?: unknown) => number>();
  const off = registerIdleSiteSleepIpc({ preferencePath, allowed: (sender: string) => sender === 'shell', ipcMain: {
    handle: (channel, handler) => { handlers.set(channel, handler); },
    removeHandler: channel => { handlers.delete(channel); },
  } });
  const read = handlers.get(IDLE_SITE_SLEEP_CHANNELS.read)!;
  const write = handlers.get(IDLE_SITE_SLEEP_CHANNELS.write)!;
  assert.equal(read({ sender: 'shell' }), 10);
  assert.throws(() => read({ sender: 'guest' }), /UNTRUSTED/);
  assert.throws(() => write({ sender: 'guest' }, 5), /UNTRUSTED/);
  assert.equal(write({ sender: 'shell' }, 5), 5);
  assert.throws(() => write({ sender: 'shell' }, 15), /INVALID/);
  assert.equal(read({ sender: 'shell' }), 5);
  off();
  assert.equal(handlers.size, 0);
});

test('one loaded site by default; a saved choice persists without overwriting other preferences', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-views-'));
  const preferencePath = path.join(dir, 'preferences.json');
  try {
    assert.equal(readMaximumLiveSiteViews({ preferencePath }), 1);
    fs.writeFileSync(preferencePath, JSON.stringify({ automaticUpdates: false }));
    writeMaximumLiveSiteViews({ preferencePath, maximumLiveSiteViews: 3 });
    assert.equal(readMaximumLiveSiteViews({ preferencePath }), 3);
    assert.deepEqual(JSON.parse(fs.readFileSync(preferencePath, 'utf8')), { automaticUpdates: false, maximumLiveSiteViews: 3 });
    for (const invalid of [0, -1, 1.5, '2', null, Number.MAX_SAFE_INTEGER + 1]) {
      fs.writeFileSync(preferencePath, JSON.stringify({ maximumLiveSiteViews: invalid }));
      const warnings: string[] = [];
      assert.equal(readMaximumLiveSiteViews({ preferencePath }, { warn: message => warnings.push(message) }), 1);
      assert.equal(warnings.length, 1);
      assert.throws(() => writeMaximumLiveSiteViews({ preferencePath, maximumLiveSiteViews: invalid as number }));
    }
    for (const invalid of [null, [], 3, 'settings']) {
      fs.writeFileSync(preferencePath, JSON.stringify(invalid));
      const warnings: string[] = [];
      assert.equal(readMaximumLiveSiteViews({ preferencePath }, { warn: message => warnings.push(message) }), 1);
      assert.equal(warnings.length, 1);
    }
    fs.writeFileSync(preferencePath, '{damaged');
    const warnings: string[] = [];
    assert.equal(readMaximumLiveSiteViews({ preferencePath }, { warn: message => warnings.push(message) }), 1);
    assert.equal(warnings.length, 1);
    assert.throws(() => writeMaximumLiveSiteViews({ preferencePath, maximumLiveSiteViews: 1 }), /UNREADABLE/);
    assert.equal(fs.readFileSync(preferencePath, 'utf8'), '{damaged');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('loaded sites are a whole number from 1 to 5: larger saved or chosen values clamp to 5', () => {
  assert.deepEqual(LIVE_SITE_VIEWS, { min: 1, max: 5, fallback: 1 });
  assert.deepEqual([0, 1, 3, 5, 6, 99].map(value => clampLiveSiteViews({ value })), [1, 1, 3, 5, 5, 5]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-views-'));
  const preferencePath = path.join(dir, 'preferences.json');
  try {
    for (const value of [1, 2, 3, 4, 5]) {
      assert.equal(writeMaximumLiveSiteViews({ preferencePath, maximumLiveSiteViews: value }), value);
      assert.equal(readMaximumLiveSiteViews({ preferencePath }), value);
    }
    assert.equal(writeMaximumLiveSiteViews({ preferencePath, maximumLiveSiteViews: 9 }), 5);
    assert.deepEqual(JSON.parse(fs.readFileSync(preferencePath, 'utf8')), { maximumLiveSiteViews: 5 });
    fs.writeFileSync(preferencePath, JSON.stringify({ maximumLiveSiteViews: 7 }));
    const warnings: string[] = [];
    assert.equal(readMaximumLiveSiteViews({ preferencePath }, { warn: message => warnings.push(message) }), 5, 'an older, larger choice reads as the new maximum');
    assert.deepEqual(warnings, []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the Loaded sites menu offers radio 1 to 5 and restores the last saved choice after failure', () => {
  const saved: number[] = [];
  const errors: unknown[] = [];
  let fail = false;
  const menu = maximumLiveSiteViewsMenu({ maximumLiveSiteViews: 2,
    setMaximum: ({ maximumLiveSiteViews }) => { if (fail) throw new Error('disk full'); saved.push(maximumLiveSiteViews); },
    onError: ({ error }) => errors.push(error),
  });
  assert.equal(menu.label, 'Loaded sites');
  assert.deepEqual(menu.submenu.map(item => [item.label, item.type, item.checked]), [
    ['1', 'radio', false], ['2', 'radio', true], ['3', 'radio', false], ['4', 'radio', false], ['5', 'radio', false],
  ]);
  menu.submenu[2]!.click({ checked: true });
  fail = true;
  const items = menu.submenu.map(item => ({ ...item, checked: item.label === '1' }));
  menu.submenu[0]!.click({ checked: true, menu: { items } });
  assert.deepEqual(saved, [3]);
  assert.equal(errors.length, 1);
  assert.deepEqual(items.map(item => item.checked), [false, false, true, false, false]);
});

test('a choice made in the window checks the matching native radio; no installed menu is a no-op', () => {
  const radios = new Map([1, 2, 3, 4, 5].map(value => [`maximum-live-site-views-${value}`, { checked: value === 2 }]));
  refreshMaximumLiveSiteViewsMenu({ menu: { getApplicationMenu: () => ({ getMenuItemById: (id: string) => radios.get(id) ?? null }) }, maximumLiveSiteViews: 4 });
  assert.deepEqual([...radios.values()].map(radio => radio.checked), [false, false, false, true, false]);
  assert.doesNotThrow(() => refreshMaximumLiveSiteViewsMenu({ menu: { getApplicationMenu: () => null }, maximumLiveSiteViews: 1 }));
});

test('only the shell may read or save the loaded-sites preference and teardown removes both IPC handlers', () => {
  const handlers = new Map<string, (event: { sender: string }, value?: unknown) => number>();
  const writes: number[] = [];
  const off = registerSiteViewPreferenceIpc({ ipcMain: {
    handle: (channel, handler) => { handlers.set(channel, handler); },
    removeHandler: channel => { handlers.delete(channel); },
  }, allowed: sender => sender === 'shell', read: () => 2,
  write: ({ maximumLiveSiteViews }) => { writes.push(maximumLiveSiteViews); return Math.min(maximumLiveSiteViews, 5); } });
  assert.equal(handlers.get(SITE_VIEW_PREFERENCE_CHANNELS.read)!({ sender: 'shell' }), 2);
  assert.throws(() => handlers.get(SITE_VIEW_PREFERENCE_CHANNELS.read)!({ sender: 'guest' }), /UNTRUSTED/);
  const save = handlers.get(SITE_VIEW_PREFERENCE_CHANNELS.write)!;
  assert.equal(save({ sender: 'shell' }, 4), 4);
  assert.equal(save({ sender: 'shell' }, 8), 5, 'main answers with the value it saved');
  assert.throws(() => save({ sender: 'guest' }, 3), /UNTRUSTED/);
  for (const invalid of ['3', null, undefined, 2.5, 0]) assert.throws(() => save({ sender: 'shell' }, invalid), /INVALID/, String(invalid));
  assert.deepEqual(writes, [4, 8]);
  off();
  assert.equal(handlers.size, 0);
});
