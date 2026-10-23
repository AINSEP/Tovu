/** Execute the settings hook and component with injected bridge/actions; no module mocks. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { elements, hookHarness, sourceFunction } from './source-test-harness.js';
import { humanSiteError } from './site-shell-policy.js';
import { useSitesFoldersDialog } from './use-sites-folders-dialog.hooks.js';
import type { SiteFolders } from '../contracts/project.js';

const hookSource = fs.readFileSync(new URL('./use-site-folders.hooks.ts', import.meta.url), 'utf8');
const componentSource = fs.readFileSync(new URL('./SitesFolders.tsx', import.meta.url), 'utf8');
const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

test('sync warning keeps its DOM, remedy actions and disabled states in either dialog location', () => {
  const component = sourceFunction(componentSource, 'SitesFoldersDialog', {
    useSitesFoldersDialog, SitesFoldersWarning: sourceFunction(componentSource, 'SitesFoldersWarning'),
    SettingsDialogShell: ({ tabs }: any) => tabs[0].panel,
  });
  for (const open of [false, true]) for (const showTrigger of [false, true]) {
    const calls: string[] = [];
    const settings = {
      open, folders: { roots: [], extraRoots: [], warning: { message: 'Sync warning' }, overrides: { sitesHome: true } },
      busy: false, warningError: 'Remedy failed', useAppData: () => calls.push('app-data'), useLocalHome: () => calls.push('local'),
    };
    const nodes = elements(component({ settings, showTrigger }));
    const warnings = nodes.filter((node) => node.props.className === 'sites-settings__warning');
    assert.equal(warnings.length, open || showTrigger ? 1 : 0);
    if (warnings.length === 0) continue;
    const warning = warnings[0];
    assert.equal(warning.type, 'div');
    assert.equal(warning.props.role, 'alert');
    const children = elements(warning);
    assert.deepEqual(children.filter((node) => node.type === 'p').map((node) => node.props.children), ['Sync warning', 'Remedy failed']);
    const buttons = children.filter((node) => node.type === 'button');
    assert.deepEqual(buttons.map((node) => [node.props.children, node.props.disabled]), [
      ['Store databases in app-data', false], ['Choose a local folder', true],
    ]);
    buttons[0].props.onClick(); buttons[1].props.onClick();
    assert.deepEqual(calls, ['app-data', 'local']);
    const form = nodes.find((node) => node.type === 'form');
    assert.equal(Boolean(form && elements(form).some((node) => node.props.className === 'sites-settings__warning')), open);
  }
});

/** Inject the public action contract; tests never depend on Jini's internal build layout. */
function settingsHook(harness: ReturnType<typeof hookHarness>) {
  const useAction = () => {
    const [saving, setSaving] = harness.bindings.useState(false);
    const [error, setError] = harness.bindings.useState(null);
    return { saving, error, setError, run: async ({ action, describeError }: {
      action: () => Promise<void>; describeError: (failure: unknown) => string;
    }) => {
      setSaving(true); setError(null);
      try { await action(); }
      catch (failure) { setError(describeError(failure)); }
      finally { setSaving(false); }
    } };
  };
  const hook = sourceFunction(hookSource, 'useSiteFolders', { ...harness.bindings, humanSiteError });
  return (required: {}, options: Record<string, unknown>) => hook(required, { ...options, useAction });
}

test('settings Add rescans the saved root once; cancel and Remove do not rescan', async () => {
  const harness = hookHarness();
  const initial: SiteFolders = { roots: ['/repo/sites'], extraRoots: [] };
  const added: SiteFolders = { roots: ['/repo/sites', '/extra'], extraRoots: ['/extra'] };
  let cancel = false;
  let scans = 0;
  const removed: string[] = [];
  const getBridge = () => ({
    listSiteFolders: async () => initial,
    addSiteFolder: async () => cancel ? null : added,
    rescanSites: async () => { scans++; return []; },
    removeSiteFolder: async ({ root }: { root: string }) => { removed.push(root); return initial; },
  });
  const hook = settingsHook(harness);
  const render = () => harness.render(() => hook({}, { getBridge }));
  assert.equal(render().busy, true);
  await nextTurn();
  assert.deepEqual(render().folders, initial);
  assert.equal(render().busy, false);
  const adding = render().addFolder();
  assert.equal(render().busy, true);
  await adding;
  assert.equal(scans, 1);
  assert.deepEqual(render().folders, added);
  cancel = true;
  await render().addFolder();
  assert.equal(scans, 1);
  assert.deepEqual(render().folders, added);
  await render().removeFolder({ root: '/extra' });
  assert.deepEqual(removed, ['/extra']);
  assert.deepEqual(render().folders, initial);
  assert.equal(scans, 1);
  assert.equal(render().error, null);
  harness.cleanup();
});

test('a failed automatic scan keeps the added folder and shows its exact remedy', async () => {
  const harness = hookHarness();
  const added = { roots: ['/extra'], extraRoots: ['/extra'] };
  const message = 'Sites discovery timed out. Disconnect unavailable volumes or choose smaller sites folders and try again.';
  const getBridge = () => ({ listSiteFolders: async () => ({ roots: [], extraRoots: [] }),
    addSiteFolder: async () => added, rescanSites: async () => { throw new Error(message); },
  });
  const hook = settingsHook(harness), render = () => harness.render(() => hook({}, { getBridge }));
  render(); await nextTurn(); await render().addFolder();
  assert.deepEqual(render().folders, added);
  assert.equal(render().error, message); assert.equal(render().busy, false);
  harness.cleanup();
});

test('settings failures keep the saved roots and show the exact filesystem error', async () => {
  const harness = hookHarness();
  const initial = { roots: ['/repo/sites'], extraRoots: [] };
  const getBridge = () => ({
    listSiteFolders: async () => initial,
    addSiteFolder: async () => { throw new Error('EACCES: permission denied, realpath /external'); },
    removeSiteFolder: async () => { throw new Error('Could not save sites folders settings.'); },
  });
  const hook = settingsHook(harness);
  const render = () => harness.render(() => hook({}, { getBridge }));
  render();
  await nextTurn();
  await render().addFolder();
  assert.equal(render().error, 'EACCES: permission denied, realpath /external');
  assert.deepEqual(render().folders, initial);
  assert.equal(render().busy, false);
  await render().removeFolder({ root: '/extra' });
  assert.equal(render().error, 'Could not save sites folders settings.');
  assert.deepEqual(render().folders, initial);
});

test('an older preload reports unavailable settings and a late load cannot update an unmounted panel', async () => {
  const unavailable = hookHarness();
  const hook = settingsHook(unavailable);
  const getBridge = () => undefined;
  const state = unavailable.render(() => hook({}, { getBridge }));
  assert.equal(state.error, 'Sites folders settings are unavailable in this desktop version.');
  assert.equal(state.busy, false);
  await state.addFolder();
  assert.equal(unavailable.render(() => hook({}, { getBridge })).error, 'Sites folders settings are unavailable in this desktop version.');

  const harness = hookHarness();
  let resolve!: (folders: SiteFolders) => void;
  const pendingBridge = () => ({ listSiteFolders: () => new Promise<SiteFolders>((done) => { resolve = done; }) });
  const pendingHook = settingsHook(harness);
  harness.render(() => pendingHook({}, { getBridge: pendingBridge }));
  harness.cleanup();
  resolve({ roots: ['/late'], extraRoots: [] });
  await nextTurn();
  assert.deepEqual(harness.render(() => pendingHook({}, { getBridge: pendingBridge })).folders.roots, []);
});

test('the shared settings dialog lists roots, only extra roots get Remove, and picker buttons invoke hooks', () => {
  let added = 0, homeChanged = 0, saved = 0;
  const removed: string[] = [];
  const placements: string[] = [];
  const component = sourceFunction(componentSource, 'SitesFoldersDialog', { useSitesFoldersDialog, SitesFoldersWarning: sourceFunction(componentSource, 'SitesFoldersWarning'), SettingsDialogShell: ({ tabs }: any) => tabs[0].panel });
  const nodes = elements(component({ settings: {
    folders: { home: '/home', roots: ['/repo/sites', '/extra'], extraRoots: ['/extra'] }, busy: false,
    error: 'Actual save error', open: true, databases: 'inSite', show() {}, close() {}, setDatabases(value: string) { placements.push(value); },
    chooseHome: () => { homeChanged++; }, save: () => { saved++; },
    addFolder: async () => { added++; }, removeFolder: async ({ root }: { root: string }) => { removed.push(root); },
  } }));
  assert.equal(nodes.find((node) => node.props.role === 'alert')?.props.children, 'Actual save error');
  const buttons = nodes.filter((node) => node.type === 'button');
  buttons.find((node) => node.props.children === 'Choose folder').props.onClick();
  assert.equal(homeChanged, 1);
  buttons.find((node) => node.props.children === 'Remove').props.onClick();
  buttons.find((node) => node.props.children === 'Add sites folder').props.onClick();
  assert.deepEqual(removed, ['/extra']); assert.equal(added, 1);
  nodes.find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(saved, 1); assert.equal(nodes.find((node) => node.type === 'select')?.props.value, 'inSite');
  nodes.find((node) => node.type === 'select').props.onChange({ target: { value: 'appData' } });
  assert.deepEqual(placements, ['appData']);
  assert.equal(nodes.filter((node) => node.type === 'input' || node.type === 'textarea').length, 0);
});

// Wiring assertions now execute the registered IPC callbacks in project-ipc-dispatch.test.ts.

test('changing sites home uses the native settings port and applies its returned path', async () => {
  const harness = hookHarness(); let calls = 0;
  const initial: SiteFolders = { home: '/old', roots: ['/old'], extraRoots: [] };
  const changed: SiteFolders = { home: '/new', roots: ['/new', '/old'], extraRoots: [] };
  const getBridge = () => ({ listSiteFolders: async () => initial, setSitesHome: async () => { calls++; return changed; } });
  const hook = settingsHook(harness), render = () => harness.render(() => hook({}, { getBridge }));
  render(); await nextTurn();
  await render().setHome();
  assert.equal(calls, 1); assert.deepEqual(render().folders, changed); assert.equal(render().error, null);
  harness.cleanup();
});

test('saving all settings uses the shared preload action and surfaces exact rejection', async () => {
  const harness = hookHarness(); const calls: unknown[] = [];
  const initial: SiteFolders = { home: '/old', roots: ['/old'], extraRoots: [], databases: 'inSite' };
  let fail = false;
  const getBridge = () => ({ listSiteFolders: async () => initial, saveSiteSettings: async (patch: unknown) => {
    calls.push(patch); if (fail) throw new Error('TOVU_SITE_ROOTS overrides this setting.');
    return { ...initial, databases: 'appData' as const };
  } });
  const hook = settingsHook(harness), render = () => harness.render(() => hook({}, { getBridge }));
  render(); await nextTurn(); await render().saveSettings({ databases: 'appData' });
  assert.deepEqual(calls, [{ databases: 'appData' }]); assert.equal(render().folders.databases, 'appData');
  fail = true; await render().saveSettings({ databases: 'inSite' });
  assert.equal(render().error, 'TOVU_SITE_ROOTS overrides this setting.'); assert.equal(render().folders.databases, 'appData');
  harness.cleanup();
});

test('storage drafts omit env overrides and both startup-warning remedies use the settings owner', async () => {
  const source = fs.readFileSync(new URL('./use-site-storage-settings.hooks.ts', import.meta.url), 'utf8');
  const harness = hookHarness(), calls: unknown[] = [];
  const state = { folders: { home: '/env-home', roots: ['/env-home'], extraRoots: ['/env-root'], databases: 'inSite', overrides: { sitesHome: true, siteRoots: true },
    warning: { provider: 'OneDrive', message: 'Exact warning', localHome: '/user/Tovu' } },
    busy: false, error: null, clearError() {}, setHome: async () => { calls.push("native-picker"); }, saveSettings: async (patch: unknown) => { calls.push(patch); },
  };
  const useFolders = () => state;
  const hook = sourceFunction(source, 'useSiteStorageSettings', harness.bindings);
  const render = () => harness.render(() => hook({}, { useFolders }));
  assert.equal(render().home, '/env-home'); assert.equal(render().roots, '/env-root');
  render().setDatabases('appData'); await render().save();
  await render().useAppData(); await render().useLocalHome();
  assert.deepEqual(calls, [{ databases: 'appData' }, { databases: 'appData' }, 'native-picker']);
  render().show(); assert.equal(render().open, true); render().close(); assert.equal(render().open, false);
  harness.cleanup();
});

test('closing the settings dropdown leaves the sites dialog and its placement draft mounted outside the menu', () => {
  const source = fs.readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  let menuOpen = true;
  const settings = { open: false, databases: 'appData', show() { this.open = true; } };
  const component = sourceFunction(source, 'SettingsControl', {
    useDismissibleDropdown: () => ({ open: menuOpen, setOpen: (value: boolean) => { menuOpen = value; }, containerRef: {} }),
    useSiteStorageSettings: () => settings, navAvailability: () => ({}),
    settingsControlHandlers: () => ({ toggleOpen() {}, chooseTheme() {}, openAppearancePage() {} }),
    GearIcon: () => null, ThemeControl: () => null, MenuIcon: () => null,
    useMenuKeyboard: () => ({ menuRef: {}, triggerRef: {}, onMenuKeyDown() {} }),
    useUpdateCheck: () => ({ available: false, checking: false, async checkForUpdates() {} }),
    SitesFoldersDialog: ({ settings: state }: any) => state.open ? createElement('div', { role: 'dialog', 'data-placement': state.databases }) : null,
  });
  const props = { theme: 'system', onThemeChange() {}, onOpenAppearance() {} };
  const initial = elements(component(props));
  const label = (node: any) => [node.props.children].flat().find((child: any) => child?.props?.className === 'settings__label')?.props.children;
  initial.find((node) => node.props.role === 'menuitem' && label(node) === 'Sites settings…').props.onClick();
  assert.equal(menuOpen, false);
  const next = elements(component(props));
  assert.equal(next.some((node) => node.props.role === 'menu'), false);
  assert.equal(next.find((node) => node.props.role === 'dialog')?.props['data-placement'], 'appData');
});


test("deskfx S5: IPC wrappers are stripped, close clears the action, and errors stay inside the dialog", async () => {
  const harness = hookHarness();
  const getBridge = () => ({ listSiteFolders: async () => ({ roots: [], extraRoots: [] }),
    addSiteFolder: async () => { throw new Error("Error invoking remote method 'runner:sites:folders:add': Error: Choose a smaller folder."); },
  });
  const foldersHook = settingsHook(harness);
  const storageSource = fs.readFileSync(new URL('./use-site-storage-settings.hooks.ts', import.meta.url), 'utf8');
  const storageHook = sourceFunction(storageSource, 'useSiteStorageSettings', harness.bindings);
  const render = () => harness.render(() => storageHook({}, { useFolders: () => foldersHook({}, { getBridge }) }));
  render(); await nextTurn(); render().show(); await render().addFolder();
  assert.equal(render().error, "Choose a smaller folder.");
  const component = sourceFunction(componentSource, 'SitesFoldersDialog', { useSitesFoldersDialog, SitesFoldersWarning: sourceFunction(componentSource, 'SitesFoldersWarning'), SettingsDialogShell: ({ tabs }: any) => tabs[0].panel });
  assert.equal(elements(component({ settings: render() })).filter((node) => node.props.role === 'alert').length, 1);
  // Closing is a real hook action, not an unmount that would accidentally hide stale state.
  render().close(); assert.equal(render().open, false); assert.equal(render().error, null);
  assert.equal(elements(component({ settings: { ...render(), error: 'late stale transport error' } })).filter((node) => node.props.role === 'alert').length, 0);
  render().show(); assert.equal(render().error, null);
  harness.cleanup();
});

test("deskfx S2: the home row has no Remove even with an old persisted extra-root entry", () => {
  const component = sourceFunction(componentSource, 'SitesFoldersDialog', { useSitesFoldersDialog, SitesFoldersWarning: sourceFunction(componentSource, 'SitesFoldersWarning'), SettingsDialogShell: ({ tabs }: any) => tabs[0].panel });
  const nodes = elements(component({ settings: { open: true, folders: { home: '/home/Tovu', roots: ['/home/Tovu', '/extra'], extraRoots: ['/home/Tovu', '/extra'] },
    databases: 'inSite', show() {}, close() {}, busy: false, error: null } }));
  const removes = nodes.filter((node) => node.type === 'button' && node.props.children === 'Remove');
  assert.deepEqual(removes.map((node) => node.props['aria-label']), ['Remove sites folder /extra']);
});


test("deskfx2 SHOULD-2: both warning remedies show their failures outside the closed dialog", async () => {
  for (const action of ['useAppData', 'useLocalHome'] as const) {
    const harness = hookHarness();
    const warning = { provider: 'OneDrive', message: 'Sync warning', localHome: '/local' };
    const getBridge = () => ({ listSiteFolders: async () => ({ home: '/sync', roots: ['/sync'], extraRoots: [], warning }),
      saveSiteSettings: async () => { throw new Error('Settings write failed.'); },
      setSitesHome: async () => { throw new Error('Folder change failed.'); },
    });
    const foldersHook = settingsHook(harness);
    const storageSource = fs.readFileSync(new URL('./use-site-storage-settings.hooks.ts', import.meta.url), 'utf8');
    const storageHook = sourceFunction(storageSource, 'useSiteStorageSettings', harness.bindings);
    const render = () => harness.render(() => storageHook({}, { useFolders: () => foldersHook({}, { getBridge }) }));
    render(); await nextTurn(); await render()[action]();
    assert.equal(render().open, false);
    const message = action === 'useAppData' ? 'Settings write failed.' : 'Folder change failed.';
    assert.equal(render().warningError, message);
    const component = sourceFunction(componentSource, 'SitesFoldersDialog', { useSitesFoldersDialog, SitesFoldersWarning: sourceFunction(componentSource, 'SitesFoldersWarning'), SettingsDialogShell: ({ tabs }: any) => tabs[0].panel });
    const nodes = elements(component({ settings: render() }));
    assert.equal(nodes.some((node) => node.type === 'p' && node.props.children === message), true);
    render().show(); assert.equal(render().warningError, null); assert.equal(render().error, null);
    harness.cleanup();
  }
});
