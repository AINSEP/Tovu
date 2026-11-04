/**
 * @file The one Sites-settings case still evaluated from source: `SettingsControl` keeps the sites
 * dialog OUTSIDE its dropdown, so closing the menu never unmounts the dialog or its placement draft.
 *
 * Why not rendered: `SettingsControl` renders `SitesFoldersDialog` with its default frame, Jini's
 * `SettingsDialogShell`, and has no seam to replace it. A linked Jini tree brings its own React
 * copy, so that shell cannot render under a test's React once the dialog is open — which is exactly
 * the state this case needs (see `fakeSiteSettings` in `app/component-harness.ts`). Everything else
 * once here is tested from the real modules: the hooks in `imported-hooks.hooks.test.ts`, the dialog
 * in `SitesFolders.jsdom.test.ts`, `SitesFolders.dialog.render.test.ts` and
 * `use-sites-folders-dialog.hooks.test.ts`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { elements, sourceFunction } from './source-test-harness.js';

test('closing the settings dropdown leaves the sites dialog and its placement draft mounted outside the menu', () => {
  const source = fs.readFileSync(new URL('./app/SettingsControl.tsx', import.meta.url), 'utf8');
  let menuOpen = true;
  const settings = { open: false, databases: 'appData', show() { this.open = true; } };
  const component = sourceFunction(source, 'SettingsControl', {
    useDismissibleDropdown: () => ({ open: menuOpen, setOpen: (value: boolean) => { menuOpen = value; }, containerRef: {} }),
    useSiteStorageSettings: () => settings, navAvailability: () => ({}),
    settingsControlHandlers: () => ({ toggleOpen() {}, chooseTheme() {}, openAppearancePage() {} }),
    GearIcon: () => null, ThemeControl: () => null, MenuIcon: () => null,
    useLoadedSites: () => ({ maximumLiveSiteViews: 1 }), LoadedSitesRow: () => null,
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
