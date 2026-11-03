import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readMaximumLiveSiteViews, writeMaximumLiveSiteViews, maximumLiveSiteViewsMenu, registerSiteViewPreferenceIpc } from './site-view-preference.ts';
import { SITE_VIEW_PREFERENCE_CHANNELS } from './contracts/site-view-preference.ts';

test('two live views default persists a menu choice without overwriting other preferences', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-views-'));
  const preferencePath = path.join(dir, 'preferences.json');
  try {
    assert.equal(readMaximumLiveSiteViews({ preferencePath }), 2);
    fs.writeFileSync(preferencePath, JSON.stringify({ automaticUpdates: false }));
    writeMaximumLiveSiteViews({ preferencePath, maximumLiveSiteViews: 3 });
    assert.equal(readMaximumLiveSiteViews({ preferencePath }), 3);
    assert.deepEqual(JSON.parse(fs.readFileSync(preferencePath, 'utf8')), { automaticUpdates: false, maximumLiveSiteViews: 3 });
    for (const invalid of [0, -1, 1.5, '2', null, Number.MAX_SAFE_INTEGER + 1]) {
      fs.writeFileSync(preferencePath, JSON.stringify({ maximumLiveSiteViews: invalid }));
      const warnings: string[] = [];
      assert.equal(readMaximumLiveSiteViews({ preferencePath }, { warn: message => warnings.push(message) }), 2);
      assert.equal(warnings.length, 1);
      assert.throws(() => writeMaximumLiveSiteViews({ preferencePath, maximumLiveSiteViews: invalid as number }));
    }
    for (const invalid of [null, [], 3, 'settings']) {
      fs.writeFileSync(preferencePath, JSON.stringify(invalid));
      const warnings: string[] = [];
      assert.equal(readMaximumLiveSiteViews({ preferencePath }, { warn: message => warnings.push(message) }), 2);
      assert.equal(warnings.length, 1);
    }
    fs.writeFileSync(preferencePath, '{damaged');
    const warnings: string[] = [];
    assert.equal(readMaximumLiveSiteViews({ preferencePath }, { warn: message => warnings.push(message) }), 2);
    assert.equal(warnings.length, 1);
    assert.throws(() => writeMaximumLiveSiteViews({ preferencePath, maximumLiveSiteViews: 1 }), /UNREADABLE/);
    assert.equal(fs.readFileSync(preferencePath, 'utf8'), '{damaged');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the live view menu offers radio 1/2/3/5 and restores the last saved choice after failure', () => {
  const saved: number[] = [];
  const errors: unknown[] = [];
  let fail = false;
  const menu = maximumLiveSiteViewsMenu({ maximumLiveSiteViews: 2,
    setMaximum: ({ maximumLiveSiteViews }) => { if (fail) throw new Error('disk full'); saved.push(maximumLiveSiteViews); },
    onError: ({ error }) => errors.push(error),
  });
  assert.deepEqual(menu.submenu.map(item => [item.label, item.type, item.checked]), [
    ['1', 'radio', false], ['2', 'radio', true], ['3', 'radio', false], ['5', 'radio', false],
  ]);
  menu.submenu[2]!.click({ checked: true });
  fail = true;
  const items = menu.submenu.map(item => ({ ...item, checked: item.label === '1' }));
  menu.submenu[0]!.click({ checked: true, menu: { items } });
  assert.deepEqual(saved, [3]);
  assert.equal(errors.length, 1);
  assert.deepEqual(items.map(item => item.checked), [false, false, true, false]);
});

test('only the shell may read the live view preference and teardown removes the IPC handler', () => {
  const handlers = new Map<string, (event: { sender: string }) => number>();
  const off = registerSiteViewPreferenceIpc({ ipcMain: {
    handle: (channel, handler) => { handlers.set(channel, handler); },
    removeHandler: channel => { handlers.delete(channel); },
  }, allowed: sender => sender === 'shell', read: () => 2 });
  assert.equal(handlers.get(SITE_VIEW_PREFERENCE_CHANNELS.read)!({ sender: 'shell' }), 2);
  assert.throws(() => handlers.get(SITE_VIEW_PREFERENCE_CHANNELS.read)!({ sender: 'guest' }), /UNTRUSTED/);
  off();
  assert.equal(handlers.size, 0);
});
