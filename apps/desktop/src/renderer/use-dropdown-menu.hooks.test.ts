/**
 * @file `menuFocusIndex` and `settingsControlHandlers` run against the real functions. Moved from
 * `App.hooks.test.ts` with the split; the two hooks are rendered in
 * `use-dropdown-menu.hooks.render.test.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { SetStateAction } from 'react';
import { menuFocusIndex, settingsControlHandlers } from './use-dropdown-menu.hooks.js';

test('menu arrow keys wrap at both ends, Home/End jump, and other keys are left alone', () => {
  const at = (key: string, current: number) => menuFocusIndex({ key, current, count: 5 });
  assert.equal(at('ArrowDown', -1), 0);
  assert.equal(at('ArrowDown', 1), 2);
  assert.equal(at('ArrowDown', 4), 0);
  assert.equal(at('ArrowUp', 0), 4);
  assert.equal(at('ArrowUp', -1), 4);
  assert.equal(at('ArrowUp', 3), 2);
  assert.equal(at('Home', 3), 0);
  assert.equal(at('End', 0), 4);
  assert.equal(at('Enter', 2), null);
  assert.equal(at('Tab', 2), null);
  assert.equal(menuFocusIndex({ key: 'ArrowDown', current: -1, count: 0 }), null);
});

test('a one-entry menu keeps focus on its only entry whichever way the arrows go', () => {
  for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
    assert.equal(menuFocusIndex({ key, current: 0, count: 1 }), 0, key);
  }
});

/** `settingsControlHandlers` over a live open flag, recording every effect in order. */
function recordingSettings(disabled: boolean) {
  const calls: string[] = [];
  let open = false;
  const handlers = settingsControlHandlers({
    disabled,
    setOpen: (next: SetStateAction<boolean>) => {
      open = typeof next === 'function' ? next(open) : next;
      calls.push(`open:${open}`);
    },
    onThemeChange: (theme) => calls.push(`theme:${theme}`),
    onOpenAppearance: () => calls.push('appearance'),
  });
  return { calls, handlers };
}

test('the Settings gear flips its dropdown open, then shut', () => {
  const { calls, handlers } = recordingSettings(false);
  handlers.toggleOpen();
  handlers.toggleOpen();
  assert.deepEqual(calls, ['open:true', 'open:false']);
});

test('a disabled Settings gear never opens its dropdown', () => {
  const { calls, handlers } = recordingSettings(true);
  handlers.toggleOpen();
  assert.equal(calls.length, 0);
});

test('picking a theme applies it FIRST, then closes the dropdown', () => {
  const { calls, handlers } = recordingSettings(false);
  handlers.chooseTheme('dark');
  assert.deepEqual(calls, ['theme:dark', 'open:false']);
});

test('the Appearance link closes the dropdown FIRST, then opens the page', () => {
  const { calls, handlers } = recordingSettings(false);
  handlers.openAppearancePage();
  assert.deepEqual(calls, ['open:false', 'appearance']);
});

test('a disabled control still runs its dropdown entries (they are unreachable, not guarded)', () => {
  const { calls, handlers } = recordingSettings(true);
  handlers.chooseTheme('light');
  handlers.openAppearancePage();
  assert.deepEqual(calls, ['theme:light', 'open:false', 'open:false', 'appearance']);
});
