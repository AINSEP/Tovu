/**
 * @file `SitesFolders` / `SitesFoldersDialog` rendered from their REAL module under jsdom.
 *
 * Two ports are injected, both through props the components already expose for this: `useSettings`
 * (the folders hook, so no preload bridge is needed) and `Shell` (the dialog frame — a linked Jini
 * tree brings its own React copy, so its `SettingsDialogShell` cannot run inside this renderer). The
 * fake shell renders the one tab's panel and a close button, which is all of the frame this module
 * relies on. `use-site-folders.hooks.test.ts` covers the same markup through `sourceFunction`; these
 * tests run the module the coverage report measures and press the real buttons.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import * as React from 'react';
import { act, createElement } from 'react';
import type { SettingsDialogShell } from '@jini-ai/ui';

import type { SiteFolders } from '../contracts/project.js';
import { SitesFolders, SitesFoldersDialog } from './SitesFolders.js';
import type { SiteFoldersSettings } from './use-site-folders.hooks.js';

type TestContext = { after: (fn: () => void) => void };

// One jsdom for the whole file: node --test runs each test file in its own process.
const { JSDOM } = createRequire(import.meta.url)('jsdom');
const dom = new JSDOM('<!doctype html><body></body>');
// `React` too: the test run compiles `.tsx` with the classic JSX transform.
Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
// After the globals: react-dom probes `document` when first evaluated.
const { createRoot } = await import('react-dom/client');

/** The dialog frame's contract as this module uses it: show the panel, offer a close. */
const Shell: typeof SettingsDialogShell = ({ tabs, onClose, className }) => createElement('div', { role: 'dialog', className },
  createElement('button', { type: 'button', 'data-shell-close': '', onClick: onClose }, 'Close'),
  tabs[0]!.panel);

/** The folders hook as a fake over a mutable record, recording every action it is asked for. */
function fakeFolders(initial: SiteFolders, extra: Partial<SiteFoldersSettings> = {}) {
  const calls: unknown[] = [];
  const state = { folders: initial, busy: false, error: null as string | null };
  const useSettings = (): SiteFoldersSettings => ({
    folders: state.folders, busy: state.busy, error: state.error,
    clearError: () => { calls.push('clear'); },
    addFolder: async () => { calls.push('add'); },
    setHome: async () => { calls.push('home'); },
    saveSettings: async (patch) => { calls.push(patch); },
    removeFolder: async ({ root }) => { calls.push(`remove ${root}`); },
    ...extra,
  });
  return { calls, state, useSettings };
}

function render(t: TestContext, element: ReturnType<typeof createElement>) {
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  t.after(() => { act(() => root.unmount()); host.remove(); });
  const show = (next = element) => act(() => root.render(next));
  show();
  const button = (label: string) => {
    const found = [...host.querySelectorAll<HTMLButtonElement>('button')].find((node) => node.textContent === label || node.getAttribute('aria-label') === label);
    assert.ok(found, `no button ${label}`);
    return found;
  };
  const click = (node: Element) => act(() => { (node as HTMLElement).click(); });
  return { host, show, button, click };
}

const folders: SiteFolders = {
  roots: ['/Users/me/Tovu', '/Volumes/Work/sites', '/opt/discovered'],
  extraRoots: ['/Volumes/Work/sites'],
  home: '/Users/me/Tovu',
  databases: 'inSite',
  configPath: '/Users/me/.tovu/desktop.json',
};

test('the trigger opens the dialog; every row reflects the folders and its buttons reach the hook', async (t) => {
  const fake = fakeFolders(folders);
  const view = render(t, createElement(SitesFolders, { useSettings: fake.useSettings, Shell }));
  assert.equal(view.host.querySelector('[role="dialog"]'), null, 'closed until asked');
  assert.equal(view.host.querySelector('.sites-settings__warning'), null, 'no provider warning, nothing outside');
  view.click(view.button('Sites settings'));
  const dialog = view.host.querySelector('[role="dialog"]')!;
  assert.equal(dialog.className, 'sites-settings-dialog');

  const rows = [...dialog.querySelectorAll('.sites-settings__root')];
  assert.deepEqual(rows.map((row) => [row.querySelector('.sites-settings__path')!.getAttribute('data-tooltip'),
    row.querySelector('.sites-settings__badge')?.textContent ?? null, row.querySelector('button') !== null]), [
    ['/Users/me/Tovu', 'New sites', false],
    ['/Volumes/Work/sites', null, true],
    ['/opt/discovered', null, false],
  ], 'only a folder the operator added can be removed; the home folder is badged');
  assert.equal(dialog.querySelector('.sites-settings__saved')!.textContent, 'Saved in /Users/me/.tovu/desktop.json');
  assert.equal(dialog.querySelectorAll('.sites-settings__note').length, 0, 'no overrides, in-site databases: no notes');
  assert.equal(dialog.querySelector('[role="alert"]'), null);

  view.click(view.button('Remove sites folder /Volumes/Work/sites'));
  view.click(view.button('Choose folder'));
  view.click(view.button('Add sites folder'));
  const select = dialog.querySelector<HTMLSelectElement>('select')!;
  act(() => { select.value = 'appData'; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  assert.match(dialog.textContent!, /App-data databases live outside the site folder/);
  await act(async () => { dialog.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); });
  assert.deepEqual(fake.calls, ['clear', 'remove /Volumes/Work/sites', 'home', 'add', { databases: 'appData' }]);

  view.click(view.button('Cancel'));
  assert.equal(view.host.querySelector('[role="dialog"]'), null);
  view.click(view.button('Sites settings'));
  view.click(view.host.querySelector('[data-shell-close]')!);
  assert.equal(view.host.querySelector('[role="dialog"]'), null, 'the shell\'s own close closes it too');
});

test('environment overrides disable their rows and say why; busy disables Save; errors are alerts', (t) => {
  const fake = fakeFolders({ ...folders, configPath: undefined, overrides: { sitesHome: true, siteRoots: true } } as SiteFolders);
  fake.state.busy = true;
  fake.state.error = 'Could not save settings.';
  const view = render(t, createElement(SitesFolders, { useSettings: fake.useSettings, Shell }));
  view.click(view.button('Sites settings'));
  const dialog = view.host.querySelector('[role="dialog"]')!;
  const notes = [...dialog.querySelectorAll('.sites-settings__note')].map((note) => note.textContent);
  assert.deepEqual(notes, ['TOVU_SITES_HOME overrides this setting.', 'TOVU_SITE_ROOTS overrides this setting.']);
  assert.equal(view.button('Choose folder').disabled, true);
  assert.equal(view.button('Add sites folder').disabled, true);
  assert.equal(view.button('Save').disabled, true);
  assert.equal(dialog.querySelector('[role="alert"]')!.textContent, 'Could not save settings.');
  assert.equal(dialog.querySelector('.sites-settings__saved'), null, 'no config path, no "Saved in" line');
});

test('a synced-folder warning shows beside the trigger and inside the dialog, with both fixes', (t) => {
  const warned = { ...folders, warning: { provider: 'iCloud', message: 'Your sites folder is synced by iCloud.', localHome: '/Users/me/Local' } } as SiteFolders;
  const fake = fakeFolders(warned);
  fake.state.error = 'Could not move the databases.';
  const view = render(t, createElement(SitesFolders, { useSettings: fake.useSettings, Shell }));
  const outside = view.host.querySelector('.sites-settings__warning')!;
  assert.equal(outside.querySelector('p')!.textContent, 'Your sites folder is synced by iCloud.');
  assert.equal(outside.querySelector('.sites-settings__error')!.textContent, 'Could not move the databases.',
    'while the dialog is closed the warning carries the failure');
  view.click(view.button('Store databases in app-data'));
  view.click(view.button('Choose a local folder'));
  assert.deepEqual(fake.calls, [{ databases: 'appData' }, 'home']);

  view.click(view.button('Sites settings'));
  const warnings = view.host.querySelectorAll('.sites-settings__warning');
  assert.equal(warnings.length, 1, 'open, the warning moves into the dialog rather than showing twice');
  assert.ok(view.host.querySelector('[role="dialog"]')!.contains(warnings[0]!));
  assert.equal(warnings[0]!.querySelector('.sites-settings__error'), null, 'the dialog shows its own error line instead');
});

test('the dialog without a trigger (the Settings menu entry) renders only when its settings say open', (t) => {
  const settings = { open: false } as Parameters<typeof SitesFoldersDialog>[0]['settings'];
  const fake = fakeFolders(folders);
  const live = { ...fake.useSettings(), ...settings, warningError: null, chooseHome: async () => {}, show() {}, close() {},
    home: '', setHome() {}, roots: '', setRoots() {}, databases: 'inSite' as const, setDatabases() {}, save: async () => {},
    useAppData: async () => {}, useLocalHome: async () => {} };
  const view = render(t, createElement(SitesFoldersDialog, { settings: live, showTrigger: false, Shell }));
  assert.equal(view.host.innerHTML, '', 'no trigger, no outside warning, and closed');
  view.show(createElement(SitesFoldersDialog, { settings: { ...live, open: true }, showTrigger: false, Shell }));
  assert.ok(view.host.querySelector('[role="dialog"] form.sites-settings'));
});
