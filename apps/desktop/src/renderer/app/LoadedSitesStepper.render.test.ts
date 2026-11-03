/**
 * @file Settings › Loaded sites, as the operator meets it: the − / number / + stepper on the row under
 * Theme in the gear's menu, rendered inside the real `SettingsControl` over a fake desktop bridge.
 * Every step and every typed digit saves through `setMaximumLiveSiteViews` at once, clamped 1 to 5;
 * the native Settings menu's own choice arrives through the change event.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createElement } from 'react';
import { act, dom, fakeSiteSettings, installBridge, mount, settle, type TestContext } from './component-harness.js';
import { closeHost } from '../app-render-harness.js';
import { SettingsControl } from './SettingsControl.js';
import type { RunnerInventoryBridge } from '../runner-api.js';

after(closeHost);

const TIP = 'Each loaded site stays in memory (~300 MB each). Higher = instant switching between sites, more memory. Other open tabs reload when you switch to them.';

async function renderLoadedSites(t: TestContext, { saved = 1, fail = false, setter = true }: { saved?: number; fail?: boolean; setter?: boolean } = {}) {
  const writes: number[] = [];
  let changed: ((maximum: number) => void) | undefined;
  const bridge: Partial<RunnerInventoryBridge> = {
    getMaximumLiveSiteViews: async () => saved,
    onMaximumLiveSiteViewsChanged: (listener) => { changed = listener; return () => { changed = undefined; }; },
  };
  if (setter) bridge.setMaximumLiveSiteViews = async (maximum) => {
    if (fail) throw new Error('disk full');
    writes.push(maximum);
    return Math.min(maximum, 5);
  };
  installBridge({ t, bridge });
  const settings = fakeSiteSettings();
  const view = mount({ t, element: createElement(SettingsControl, {
    theme: 'system', onThemeChange: () => {}, onOpenAppearance: () => {}, useSiteSettings: settings.useSiteSettings,
  }) });
  await settle();
  await view.click(view.byLabel('Settings'));
  const input = () => view.byLabel('Loaded sites') as HTMLInputElement | null;
  const key = async (name: string) => {
    await act(async () => { input()!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })); });
    await settle();
  };
  const blur = async () => {
    await act(async () => { input()!.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true })); });
    await settle();
  };
  const typeIn = async (value: string) => { await view.type(input()!, value); await settle(); };
  return { ...view, writes, input, key, blur, typeIn, change: async (value: number) => { await act(async () => { changed!(value); }); await settle(); } };
}

test('Loaded sites: a labelled 1-to-5 spinbutton under Theme, showing the saved value, with the memory tip on the control', async (t) => {
  const view = await renderLoadedSites(t, { saved: 3 });
  const input = view.input()!;
  assert.ok(input, 'the stepper has the accessible name "Loaded sites"');
  assert.deepEqual(['role', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'inputmode'].map((name) => input.getAttribute(name)),
    ['spinbutton', '1', '5', '3', 'numeric']);
  assert.equal(input.value, '3');
  assert.deepEqual(view.all('.settings__row > .settings__label').map((label) => label.textContent), ['Theme', 'Loaded sites']);
  const group = input.closest('[role="group"]')!;
  assert.equal(document.getElementById(group.getAttribute('aria-labelledby')!)?.textContent, 'Loaded sites');
  // The tip sits on the field as well as the whole control: a tap focuses the field, and a focused
  // text field is :focus-visible, which is what makes Jini's TooltipLayer show it on touch.
  for (const host of [group, input]) {
    assert.ok(host.classList.contains('jini-tooltip'));
    assert.equal(host.getAttribute('data-tooltip'), TIP);
  }
  assert.equal(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent, TIP, 'screen readers hear the tip too');
});

test('Loaded sites: + and − step by one, save each step at once, and stop at 1 and 5', async (t) => {
  const view = await renderLoadedSites(t, { saved: 4 });
  const more = () => view.byLabel('More loaded sites') as HTMLButtonElement;
  const fewer = () => view.byLabel('Fewer loaded sites') as HTMLButtonElement;
  assert.equal(more().disabled, false);
  await view.click(more());
  assert.deepEqual(view.writes, [5]);
  assert.equal(view.input()!.value, '5');
  assert.equal(view.input()!.getAttribute('aria-valuenow'), '5');
  assert.equal(more().disabled, true, 'five is the most');
  await view.click(fewer());
  assert.deepEqual(view.writes, [5, 4]);
  assert.ok(view.container.querySelector('[role="menu"]'), 'a step keeps the menu open');
});

test('Loaded sites: − is off at one loaded site', async (t) => {
  const view = await renderLoadedSites(t, { saved: 1 });
  assert.equal((view.byLabel('Fewer loaded sites') as HTMLButtonElement).disabled, true);
  assert.equal((view.byLabel('More loaded sites') as HTMLButtonElement).disabled, false);
});

test('Loaded sites: a typed digit saves at once, clamped to 1-5; a cleared field shows the saved value again on leaving it', async (t) => {
  const view = await renderLoadedSites(t, { saved: 2 });
  await view.typeIn('4');
  assert.deepEqual(view.writes, [4]);
  await view.typeIn('9');
  assert.equal(view.input()!.value, '5');
  await view.typeIn('0');
  assert.equal(view.input()!.value, '1');
  await view.typeIn('13');
  assert.equal(view.input()!.value, '3', 'typing after the digit already there means the new digit');
  assert.deepEqual(view.writes, [4, 5, 1, 3]);
  await view.typeIn('');
  assert.equal(view.input()!.value, '', 'a cleared field is not saved while it is being edited');
  await view.typeIn('x');
  assert.equal(view.input()!.value, '');
  await view.blur();
  assert.equal(view.input()!.value, '3');
  assert.deepEqual(view.writes, [4, 5, 1, 3]);
});

test('Loaded sites: Up, Down, Home and End change the value and keep focus in the field instead of moving through the menu', async (t) => {
  const view = await renderLoadedSites(t, { saved: 2 });
  await act(async () => { view.input()!.focus(); });
  await view.key('ArrowUp');
  assert.equal(document.activeElement, view.input(), 'the menu did not take the arrow key');
  await view.key('ArrowDown');
  await view.key('End');
  await view.key('Home');
  await view.key('ArrowDown');
  assert.deepEqual(view.writes, [3, 2, 5, 1], 'Down at one saves nothing');
  assert.equal(document.activeElement, view.input());
});

test('Loaded sites: a choice from the native Settings menu shows at once', async (t) => {
  const view = await renderLoadedSites(t, { saved: 2 });
  await view.change(4);
  assert.equal(view.input()!.value, '4');
  assert.deepEqual(view.writes, [], 'showing main\'s choice saves nothing back');
});

test('Loaded sites: a failed save puts the saved value back and says so', async (t) => {
  const errors: unknown[] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { errors.push(args); });
  const view = await renderLoadedSites(t, { saved: 2, fail: true });
  await view.click(view.byLabel('More loaded sites'));
  assert.equal(view.input()!.value, '2');
  assert.equal(view.container.querySelector('[role="alert"]')?.textContent, 'Loaded sites could not be saved.');
  assert.ok(errors.some((args) => String((args as unknown[])[0]).includes('save loaded sites: disk full')), 'the failure is logged');
});

test('Loaded sites: an older preload with no save channel leaves the row out', async (t) => {
  const view = await renderLoadedSites(t, { setter: false });
  assert.equal(view.input(), null);
  assert.deepEqual(view.all('.settings__row > .settings__label').map((label) => label.textContent), ['Theme']);
});
