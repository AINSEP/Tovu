/**
 * @file `SitesFoldersDialog` rendered from its real module (the `app/component-harness.ts` jsdom)
 * with a fake dialog frame: where the synced-folder warning shows for each placement, which of its
 * two fixes an environment override or a running action disables, and that a folder is only ever
 * picked, never typed. The settings object is a plain stub, so each test sets one state directly.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createElement } from 'react';
import type { SettingsDialogShell } from '@jini-ai/ui';
import { mount, type Mounted, type TestContext } from './app/component-harness.js';
import { closeHost } from './app-render-harness.js';
import { SitesFoldersDialog } from './SitesFolders.js';
import type { useSiteStorageSettings } from './use-site-storage-settings.hooks.js';
import type { SiteFolders } from '../contracts/project.js';

after(closeHost);

type Settings = ReturnType<typeof useSiteStorageSettings>;

/** The dialog frame as this module uses it: show the one tab's panel. Jini's own shell cannot run
 *  under this test's React (a linked Jini tree brings its own React copy). */
const Shell: typeof SettingsDialogShell = ({ tabs, className }) => createElement('div', { role: 'dialog', className }, tabs[0]!.panel);

const warned: SiteFolders = {
  home: '/sync', roots: ['/sync'], extraRoots: [],
  warning: { provider: 'OneDrive', message: 'Sync warning', localHome: '/local' },
};

/** A settings stub in one fixed state; the two warning fixes record that they ran. */
function settingsFor(patch: Partial<Settings> = {}): { settings: Settings; calls: string[] } {
  const calls: string[] = [];
  const settings: Settings = {
    folders: warned, busy: false, error: null, warningError: 'Remedy failed',
    open: false, home: '/sync', roots: '', databases: 'inSite',
    clearError() {}, show() {}, close() {}, setHome() {}, setRoots() {}, setDatabases() {},
    addFolder: async () => {}, removeFolder: async () => {}, chooseHome: async () => {},
    saveSettings: async () => {}, save: async () => {},
    useAppData: async () => { calls.push('app-data'); },
    useLocalHome: async () => { calls.push('local'); },
    ...patch,
  };
  return { settings, calls };
}

function renderDialog(t: TestContext, settings: Settings, showTrigger?: boolean) {
  return mount({ t, element: createElement(SitesFoldersDialog, { settings, showTrigger, Shell }) });
}

const fixes = (view: Mounted) => [...view.container.querySelectorAll<HTMLButtonElement>('.sites-settings__warning button')];

test('SitesFoldersDialog: the sync warning shows once — beside a closed trigger, inside an open dialog, nowhere for a closed menu-only dialog', async (t) => {
  for (const [open, showTrigger, where] of [[false, true, 'outside'], [true, true, 'dialog'], [true, false, 'dialog'], [false, false, 'none']] as const) {
    const { settings, calls } = settingsFor({ open });
    const view = renderDialog(t, settings, showTrigger);
    const warnings = view.all('.sites-settings__warning');
    if (where === 'none') {
      assert.deepEqual(warnings, [], 'the Settings menu entry supplies no outside copy');
      continue;
    }
    assert.equal(warnings.length, 1, `open=${open} trigger=${showTrigger}`);
    const warning = warnings[0]!;
    assert.equal(warning.tagName, 'DIV');
    assert.equal(warning.getAttribute('role'), 'alert');
    assert.equal(warning.closest('form') !== null, where === 'dialog', 'inside the form exactly when the dialog is open');
    assert.deepEqual([...warning.querySelectorAll('p')].map((line) => line.textContent), ['Sync warning', 'Remedy failed']);
    for (const fix of fixes(view)) await view.click(fix);
    assert.deepEqual(calls, ['app-data', 'local']);
  }
});

test('SitesFoldersDialog: a TOVU_SITES_HOME override disables only the local-folder fix; a running action disables both', (t) => {
  const overridden = settingsFor({ folders: { ...warned, overrides: { sitesHome: true, siteRoots: false } } });
  const state = (view: Mounted) => fixes(view).map((fix) => [fix.textContent, fix.disabled]);
  assert.deepEqual(state(renderDialog(t, overridden.settings)), [
    ['Store databases in app-data', false], ['Choose a local folder', true],
  ]);
  assert.deepEqual(state(renderDialog(t, settingsFor({ busy: true }).settings)), [
    ['Store databases in app-data', true], ['Choose a local folder', true],
  ]);
});

test('SitesFoldersDialog: folders are only picked through the native picker — the dialog has no field to type a path into', (t) => {
  const { settings } = settingsFor({ open: true, folders: { home: '/home', roots: ['/home', '/extra'], extraRoots: ['/extra'] } });
  const view = renderDialog(t, settings);
  assert.ok(view.container.querySelector('[role="dialog"] form.sites-settings'));
  assert.deepEqual(view.all('input, textarea'), []);
});
