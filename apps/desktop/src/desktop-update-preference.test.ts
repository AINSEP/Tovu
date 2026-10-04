import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readAutomaticUpdates, writeAutomaticUpdates, automaticUpdatesMenu } from './desktop-update-preference.ts';

test('updates default ON, persist OFF across reads, and preserve other settings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-updates-'));
  const preferencePath = path.join(dir, 'preferences.json');
  try {
    assert.equal(readAutomaticUpdates({ preferencePath }), true);
    fs.writeFileSync(preferencePath, JSON.stringify({ futureSetting: 42 }));
    writeAutomaticUpdates({ preferencePath, enabled: false });
    assert.equal(readAutomaticUpdates({ preferencePath }), false);
    assert.deepEqual(JSON.parse(fs.readFileSync(preferencePath, 'utf8')), { futureSetting: 42, automaticUpdates: false });
    writeAutomaticUpdates({ preferencePath, enabled: true });
    assert.equal(readAutomaticUpdates({ preferencePath }), true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('bad field values cannot accidentally disable updates', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-updates-'));
  const preferencePath = path.join(dir, 'preferences.json');
  try {
    for (const value of ['false', null, 0]) {
      fs.writeFileSync(preferencePath, JSON.stringify({ automaticUpdates: value }));
      assert.equal(readAutomaticUpdates({ preferencePath }), true);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('native checkbox applies the chosen value, and restores it after a persistence failure', () => {
  const saved: boolean[] = [];
  const errors: unknown[] = [];
  const item = automaticUpdatesMenu({ locale: 'es', enabled: true, setEnabled: ({ enabled }) => saved.push(enabled), onError: ({ error }) => errors.push(error) }).submenu[0];
  assert.ok(item);
  assert.equal(item.type, 'checkbox');
  item.click({ checked: false });
  assert.deepEqual(saved, [false]);
  assert.deepEqual(errors, []);
  const failure = new Error('disk full');
  const broken = automaticUpdatesMenu({ locale: 'en', enabled: true, setEnabled: () => { throw failure; }, onError: ({ error }) => errors.push(error) }).submenu[0];
  assert.ok(broken);
  const checkbox = { checked: false };
  broken.click(checkbox);
  assert.equal(checkbox.checked, true);
  assert.equal(errors[0], failure);
});

test('a corrupt preferences file is preserved rather than overwritten by a toggle', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-updates-'));
  const preferencePath = path.join(dir, 'preferences.json');
  try {
    fs.writeFileSync(preferencePath, '{broken');
    assert.throws(() => writeAutomaticUpdates({ preferencePath, enabled: false }), /DESKTOP_PREFERENCES_UNREADABLE/);
    assert.equal(fs.readFileSync(preferencePath, 'utf8'), '{broken');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a later save failure restores the last successful checkbox value', () => {
  let fail = false;
  const item = automaticUpdatesMenu({ locale: 'en', enabled: true,
    setEnabled: () => { if (fail) throw new Error('disk full'); }, onError: () => {},
  }).submenu[0];
  assert.ok(item);
  item.click({ checked: false });
  fail = true;
  const attempted = { checked: true };
  item.click(attempted);
  assert.equal(attempted.checked, false);
});
