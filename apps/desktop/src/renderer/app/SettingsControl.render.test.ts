/**
 * @file `SettingsControl` (and its `ThemeControl`) rendered from its own module: the gear opens and
 * closes the menu, each row reaches its own action, the update row exists only with a bridge to
 * check through, and the theme radios mark and report the chosen theme.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createElement } from 'react';
import { act, fakeSiteSettings, installBridge, mount, recordTelemetry, settle, type TestContext } from './component-harness.js';
import { closeHost } from '../app-render-harness.js';
import { SettingsControl } from './SettingsControl.js';
import type { ThemePreference } from '../theme.js';
import type { RunnerInventoryBridge } from '../runner-api.js';
import { useLoadedSites } from '../use-loaded-sites.hooks.js';

after(closeHost);

test('Loaded sites keeps a newer menu preference when the initial read arrives late', async t => {
  let finish!: (value: number) => void;
  let changed!: (value: number) => void;
  const writes: number[] = [];
  const getBridge = () => ({ getMaximumLiveSiteViews: () => new Promise<number>(resolve => { finish = resolve; }),
    onMaximumLiveSiteViewsChanged: (listener: (value: number) => void) => { changed = listener; return () => {}; },
    setMaximumLiveSiteViews: async (value: number) => { writes.push(value); return value; },
  });
  function Setting() {
    const setting = useLoadedSites({}, { getBridge });
    return createElement('button', { onClick: () => setting.save(1) }, String(setting.value));
  }
  const view = mount({ t, element: createElement(Setting) });
  await act(async () => { changed(4); });
  await act(async () => { finish(1); });
  assert.equal(view.container.querySelector('button')?.textContent, '4');
  await view.click(view.container.querySelector('button'));
  assert.deepEqual(writes, [1]);
});

function renderSettings(t: TestContext, { theme = 'system', bridge = {} }: { theme?: ThemePreference; bridge?: Partial<RunnerInventoryBridge> } = {}) {
  installBridge({ t, bridge });
  const settings = fakeSiteSettings();
  const themes: ThemePreference[] = [];
  let appearance = 0;
  const view = mount({ t, element: createElement(SettingsControl, {
    theme, onThemeChange: (next) => { themes.push(next); }, onOpenAppearance: () => { appearance++; },
    useSiteSettings: settings.useSiteSettings,
  }) });
  const menu = () => view.container.querySelector('[role="menu"]');
  return { ...view, menu, themes, appearance: () => appearance, shown: settings.shown, gear: () => view.byLabel('Settings')! };
}

test('SettingsControl: the gear toggles the menu and reports opening it', async (t) => {
  const payloads = recordTelemetry({ t });
  const view = renderSettings(t);
  assert.equal(view.menu(), null, 'closed until asked');
  assert.equal(view.gear().getAttribute('aria-expanded'), 'false');
  await view.click(view.gear());
  assert.ok(view.menu());
  assert.equal(view.gear().getAttribute('aria-expanded'), 'true');
  assert.ok(view.gear().classList.contains('is-active'));
  assert.deepEqual(payloads, [{ kind: 'action', id: 'open_settings' }]);
  await view.click(view.gear());
  assert.equal(view.menu(), null, 'a second press closes it');
});

test('SettingsControl: Sites settings… opens the sites dialog and closes the menu', async (t) => {
  const view = renderSettings(t);
  await view.click(view.gear());
  await view.click(view.byText('Sites settings…', '[role="menuitem"]'));
  assert.equal(view.shown(), 1);
  assert.equal(view.menu(), null);
});

test('SettingsControl: Appearance opens the Appearance page', async (t) => {
  const view = renderSettings(t);
  await view.click(view.gear());
  await view.click(view.all('[role="menuitem"]').find((row) => row.textContent?.includes('Appearance')));
  assert.equal(view.appearance(), 1);
});

test('SettingsControl: the theme radios mark the current theme and report the one picked', async (t) => {
  const view = renderSettings(t, { theme: 'light' });
  await view.click(view.gear());
  const radios = view.all('[role="menuitemradio"]');
  assert.deepEqual(radios.map((radio) => [radio.getAttribute('aria-label'), radio.getAttribute('data-tip'), radio.getAttribute('aria-checked')]),
    [['Light', 'Light', 'true'], ['System', 'System', 'false'], ['Dark', 'Dark', 'false']]);
  assert.ok(radios[0]?.classList.contains('is-on'));
  assert.equal(radios[1]?.classList.contains('is-on'), false);
  await view.click(view.byLabel('Dark'));
  assert.deepEqual(view.themes, ['dark']);
  assert.equal(view.menu(), null, 'picking a theme closes the menu');
});

test('SettingsControl: without checkForUpdates on the bridge there is no update row', async (t) => {
  const view = renderSettings(t);
  await view.click(view.gear());
  assert.equal(view.all('[role="menuitem"]').some((row) => row.textContent?.includes('updates')), false);
});

test('SettingsControl: Check for updates… reads Checking… until main answers, then the menu closes', async (t) => {
  const payloads = recordTelemetry({ t });
  let answer!: () => void;
  const view = renderSettings(t, { bridge: { checkForUpdates: () => new Promise<void>((resolve) => { answer = resolve; }) } });
  await view.click(view.gear());
  const row = () => view.all('[role="menuitem"]').find((item) => /updates…|Checking…/.test(item.textContent ?? ''));
  assert.equal(row()?.textContent?.trim(), 'Check for updates…');
  assert.equal(row()?.getAttribute('aria-disabled'), 'false');
  await view.click(row());
  assert.equal(row()?.textContent?.trim(), 'Checking…');
  assert.equal(row()?.getAttribute('aria-disabled'), 'true');
  assert.deepEqual(payloads.at(-1), { kind: 'action', id: 'check_updates' });
  await act(async () => { answer(); });
  await settle();
  assert.equal(view.menu(), null);
});
