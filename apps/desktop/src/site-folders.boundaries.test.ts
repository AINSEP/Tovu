/** F9 (Stryker L15 site-folders 83.6 %): the stored-settings shape guard one clause at a time (both
 * lists must be arrays; only absolute string roots survive), damaged settings must be preserved
 * before any write, and the shared-workspace path: filtered extra roots, the one-time legacy import
 * (skipped once migrated or when roots are overridden), and rememberCreated's no-op for a known parent. */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSiteFolders } from './site-folders.ts';

function layout(t: { after: (fn: () => void) => void }, stored?: unknown) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tovu-site-folders-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const statePath = path.join(base, 'desktop-state.json');
  const settings = path.join(base, 'desktop-site-folders.json');
  if (stored !== undefined) fs.writeFileSync(settings, typeof stored === 'string' ? stored : JSON.stringify(stored));
  const extra = path.join(base, 'work', 'extra');
  fs.mkdirSync(extra, { recursive: true });
  return { base, statePath, settings, extra };
}

test('stored roots: only absolute strings survive, extra roots are listed separately from creation roots', t => {
  const { statePath, base } = layout(t, { creationRoots: ['/abs/created', 'relative', 5, null], extraRoots: ['/abs/extra', 'rel', {}, '/abs/extra'] });
  const folders = createSiteFolders({ statePath, defaultRoots: [path.join(base, 'default')] }).read({});
  assert.deepEqual(folders.extraRoots, ['/abs/extra']);
  assert.deepEqual(folders.roots, [path.join(base, 'default'), '/abs/created', '/abs/extra']);
});

test('settings with either list missing or not an array are damaged: read ignores them, a write first preserves them', t => {
  for (const stored of [{ creationRoots: [], extraRoots: 'x' }, { creationRoots: 'x', extraRoots: [] }, { extraRoots: [] }, null, 'not json']) {
    const { statePath, extra, settings } = layout(t, stored);
    const quarantined: string[] = [];
    const refuse = createSiteFolders({ statePath, defaultRoots: [] }, { quarantine: ((file: string) => { quarantined.push(file); return false; }) as never });
    assert.deepEqual(refuse.read({}).extraRoots, [], JSON.stringify(stored));
    assert.throws(() => refuse.add({ root: extra }), { message: `Could not preserve damaged sites folders settings at ${settings}. Nothing was saved.` }, JSON.stringify(stored));
    assert.deepEqual(quarantined, [settings]);
  }
  const { statePath, extra } = layout(t);
  let asked = 0;
  createSiteFolders({ statePath, defaultRoots: [] }, { quarantine: (() => { asked++; return true; }) as never }).add({ root: extra });
  assert.equal(asked, 0, 'a missing settings file is not damaged');
});

test('add refuses a broad root and a non-directory; remove and rememberCreated update their own lists', t => {
  const { statePath, extra, base } = layout(t);
  const folders = createSiteFolders({ statePath, defaultRoots: [] });
  assert.throws(() => folders.add({ root: '/' }), /Sites folder is too broad: \//);
  const file = path.join(base, 'work', 'file.txt');
  fs.writeFileSync(file, 'x');
  assert.throws(() => folders.add({ root: file }), { message: `Sites folder is not a directory: ${file}` });
  assert.deepEqual(folders.add({ root: extra }).extraRoots, [extra]);
  assert.deepEqual(folders.remove({ root: extra }).extraRoots, []);
  folders.rememberCreated({ siteDir: path.join(base, 'made', 'site-a') });
  assert.deepEqual(folders.read({}).roots, [path.join(base, 'made')]);
  assert.deepEqual(folders.read({}).extraRoots, []);
});

function workspace({ migrated = false, overridden = false, roots = ['/ws/home'], fail = false } = {}) {
  const updates: unknown[] = [];
  const merges: unknown[] = [];
  return {
    updates, merges,
    homeDir: '/home/u',
    home: () => '/ws/home',
    roots: () => roots,
    config: () => {
      if (fail) throw new Error('config unreadable');
      return { sitesHome: '/ws/home', defaultRoots: ['/ws/default'], extraRoots: ['/ws/home', '/ws/default', '/ws/extra'], databases: [], warning: undefined, configPath: '/ws/c.json', overrides: { siteRoots: overridden } };
    },
    registry: () => ({ hasMigration: () => migrated, merge: (input: unknown) => { merges.push(input); } }),
    updateRoots: (input: unknown) => { updates.push(input); },
  };
}

test('shared workspace: extra roots exclude the sites home and default roots', t => {
  const { statePath } = layout(t);
  const ws = workspace({ migrated: true });
  assert.deepEqual(createSiteFolders({ statePath, defaultRoots: [], workspace: ws as never }).read({}).extraRoots, ['/ws/extra']);
  assert.deepEqual(ws.updates, []);
});

test('shared workspace: the legacy import runs once, in order, and never over overridden roots', t => {
  const legacy = { creationRoots: ['/legacy/created'], extraRoots: ['/legacy/extra'] };
  const fresh = workspace();
  createSiteFolders({ statePath: layout(t, legacy).statePath, defaultRoots: [], createdSiteDirs: () => ['/made/site-a'], workspace: fresh as never });
  assert.deepEqual(fresh.updates, [{ add: ['/legacy/extra', '/legacy/created', '/made'] }]);
  assert.deepEqual(fresh.merges, [{ entries: [], migration: 'desktop-roots-config-v1' }]);
  const empty = workspace();
  createSiteFolders({ statePath: layout(t).statePath, defaultRoots: [], workspace: empty as never });
  assert.deepEqual([empty.updates, empty.merges.length], [[], 1]);
  const overridden = workspace({ overridden: true });
  createSiteFolders({ statePath: layout(t, legacy).statePath, defaultRoots: [], workspace: overridden as never });
  assert.deepEqual([overridden.updates, overridden.merges], [[], []]);
  const migrated = workspace({ migrated: true });
  createSiteFolders({ statePath: layout(t, legacy).statePath, defaultRoots: [], workspace: migrated as never });
  assert.deepEqual([migrated.updates, migrated.merges], [[], []]);
});

test('shared workspace: rememberCreated adds only an unknown parent; a failing import is survivable', t => {
  const { statePath } = layout(t);
  const ws = workspace({ migrated: true, roots: ['/ws/home', '/known'] });
  const folders = createSiteFolders({ statePath, defaultRoots: [], workspace: ws as never });
  folders.rememberCreated({ siteDir: '/known/site' });
  assert.deepEqual(ws.updates, []);
  folders.rememberCreated({ siteDir: '/new/site' });
  assert.deepEqual(ws.updates, [{ add: ['/new'] }]);
  const warned: unknown[] = [];
  t.mock.method(console, 'warn', (message: unknown) => { warned.push(message); });
  assert.doesNotThrow(() => createSiteFolders({ statePath, defaultRoots: [], workspace: workspace({ fail: true }) as never }));
  assert.deepEqual(warned, ['tovu desktop: legacy sites folder import could not complete; using shared settings and retrying next boot.']);
});
