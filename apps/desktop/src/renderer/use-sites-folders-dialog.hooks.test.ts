/** SitesFoldersDialog extraction contract: identical display decisions and settings actions; no module mocks. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { useSitesFoldersDialog } from './use-sites-folders-dialog.hooks.js';
import type { useSiteStorageSettings } from './use-site-storage-settings.hooks.js';

type Settings = ReturnType<typeof useSiteStorageSettings>;

/** In-memory settings port; no renderer, native picker, or Jini lifecycle is needed. */
function settingsFixture(patch: Partial<Settings> = {}): Settings {
  return {
    folders: { roots: [], extraRoots: [] }, busy: false, error: null, warningError: null,
    open: false, home: '', roots: '', databases: 'inSite',
    clearError() {}, show() {}, close() {}, setHome() {}, setRoots() {}, setDatabases() {},
    addFolder: async () => {}, removeFolder: async () => {}, chooseHome: async () => {},
    saveSettings: async () => {}, save: async () => {}, useAppData: async () => {}, useLocalHome: async () => {},
    ...patch,
  };
}

test('dialog hook preserves middle truncation, root order, badges, and home removal protection', () => {
  const settings = settingsFixture({ folders: {
    home: '/parent/home/', roots: ['/extra/one', '/parent/home/', '/managed', '/', 'relative'],
    extraRoots: ['/parent/home/', '/extra/one', 'relative'],
  } });
  const view = useSitesFoldersDialog({ settings });
  assert.deepEqual(view.home, { head: '/parent/', tail: 'home/' });
  assert.deepEqual(view.roots.map(({ root, head, tail, isHome, canRemove, removeLabel }) =>
    ({ root, head, tail, isHome, canRemove, removeLabel })), [
    { root: '/extra/one', head: '/extra/', tail: 'one', isHome: false, canRemove: true, removeLabel: 'Remove sites folder /extra/one' },
    { root: '/parent/home/', head: '/parent/', tail: 'home/', isHome: true, canRemove: false, removeLabel: 'Remove sites folder /parent/home/' },
    { root: '/managed', head: '/', tail: 'managed', isHome: false, canRemove: false, removeLabel: 'Remove sites folder /managed' },
    { root: '/', head: '/', tail: '', isHome: false, canRemove: false, removeLabel: 'Remove sites folder /' },
    { root: 'relative', head: '', tail: 'relative', isHome: false, canRemove: true, removeLabel: 'Remove sites folder relative' },
  ]);
  assert.deepEqual(settings.folders.extraRoots, ['/parent/home/', '/extra/one', 'relative']);
  assert.deepEqual(useSitesFoldersDialog({ settings: settingsFixture() }).home, { head: '', tail: '' });
});

test('dialog hook preserves independent override flags and busy picker disabling', () => {
  for (const [busy, overrides, homeDisabled, rootsDisabled] of [
    [false, undefined, undefined, undefined],
    [true, undefined, true, true],
    [false, { sitesHome: false, siteRoots: false }, false, false],
    [false, { sitesHome: true, siteRoots: false }, true, false],
    [false, { sitesHome: false, siteRoots: true }, false, true],
    [true, { sitesHome: true, siteRoots: true }, true, true],
  ] as const) {
    const view = useSitesFoldersDialog({ settings: settingsFixture({ busy, folders: { roots: [], extraRoots: [], overrides } }) });
    assert.equal(view.homeDisabled, homeDisabled);
    assert.equal(view.rootsDisabled, rootsDisabled);
    assert.equal(view.homeOverridden, overrides?.sitesHome);
    assert.equal(view.rootsOverridden, overrides?.siteRoots);
  }
});

test('dialog hook defaults the trigger and keeps the outside warning out of open/menu-only dialogs', () => {
  const settings = settingsFixture();
  const closed = useSitesFoldersDialog({ settings });
  assert.equal(closed.showTrigger, true);
  assert.equal(closed.showOutsideWarning, true);
  assert.equal(closed.showAppDataNote, false);
  assert.equal(useSitesFoldersDialog({ settings }, { showTrigger: false }).showOutsideWarning, false);
  assert.equal(useSitesFoldersDialog({ settings }, { showTrigger: false }).showTrigger, false);
  const open = useSitesFoldersDialog({ settings: { ...settings, open: true, databases: 'appData' } });
  assert.equal(open.showOutsideWarning, false);
  assert.equal(open.showAppDataNote, true);
});

test('dialog hook forwards exact actions and prevents form submission before saving', () => {
  const calls: unknown[] = [];
  const settings = settingsFixture({
    folders: { roots: ['/extra', '/other'], extraRoots: ['/extra', '/other'] },
    chooseHome: async () => { calls.push('chooseHome'); },
    addFolder: async () => { calls.push('addFolder'); },
    removeFolder: async (input) => { calls.push(input); },
    useAppData: async () => { calls.push('useAppData'); },
    useLocalHome: async () => { calls.push('useLocalHome'); },
    save: async () => { calls.push('save'); },
    setDatabases: (value) => { calls.push(value); },
  });
  const view = useSitesFoldersDialog({ settings });
  assert.equal(calls.length, 0);
  view.onChooseHome(); view.onAddFolder(); view.roots[1]!.onRemove(); view.roots[0]!.onRemove();
  view.onUseAppData(); view.onUseLocalHome();
  view.onDatabasesChange({ target: { value: 'appData' } });
  view.onDatabasesChange({ target: { value: 'inSite' } });
  view.onSubmit({ preventDefault() { calls.push('preventDefault'); } });
  assert.deepEqual(calls, ['chooseHome', 'addFolder', { root: '/other' }, { root: '/extra' },
    'useAppData', 'useLocalHome', 'appData', 'inSite', 'preventDefault', 'save']);
  const latestCalls: string[] = [];
  const next = useSitesFoldersDialog({ settings: { ...settings, chooseHome: async () => { latestCalls.push('new owner'); } } });
  next.onChooseHome();
  assert.deepEqual(latestCalls, ['new owner']);
});
