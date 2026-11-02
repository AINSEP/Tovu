/**
 * @file `useWebviewLoadFailure` rendered from its real module under jsdom with its timers injected,
 * so the 8 s stall guess is fired by hand. Moved from `App.hooks.render.test.ts` with the split.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
import { renderHookWithView as renderHook } from './app-hooks.test-support.js';
import { installDom } from './dom-hook-harness.js';
import { useWebviewLoadFailure } from './use-webview-load-failure.hooks.js';

const window = installDom();

function fakeTimers() {
  let next = 1;
  const pending = new Map<number, () => void>();
  return {
    pending,
    timers: {
      setTimeout: ((callback: () => void, ms: number) => { assert.equal(ms, 8000); pending.set(next, callback); return next++; }) as unknown as Window['setTimeout'],
      clearTimeout: ((handle: number) => { pending.delete(handle); }) as Window['clearTimeout'],
    },
    fireAll: () => { const callbacks = [...pending.values()]; pending.clear(); for (const callback of callbacks) callback(); },
  };
}

function loadEvent(type: string, fields: Record<string, unknown> = {}) {
  return Object.assign(new window.Event(type), fields);
}

function guestNode() {
  return document.createElement('div') as unknown as HTMLWebViewElement;
}

test('useWebviewLoadFailure: ignores sub-frame and aborted failures, reports a real one, and a finished load clears both', (t) => {
  const clock = fakeTimers();
  let resetKey = 0;
  const hook = renderHook(t, () => useWebviewLoadFailure(resetKey, { timers: clock.timers }));
  const guest = guestNode();
  assert.equal(clock.pending.size, 0, 'no guest, no stall timer');
  act(() => hook.current().guestRef(guest));
  assert.equal(hook.current().guest, guest);
  assert.equal(clock.pending.size, 1);
  act(() => { guest.dispatchEvent(loadEvent('did-fail-load', { isMainFrame: false, errorCode: -105 })); });
  act(() => { guest.dispatchEvent(loadEvent('did-fail-load', { isMainFrame: true, errorCode: -3 })); });
  assert.deepEqual([hook.current().failed, hook.current().stalled, hook.current().loaded], [false, false, false]);
  act(() => clock.fireAll());
  assert.equal(hook.current().stalled, true);
  act(() => { guest.dispatchEvent(loadEvent('did-fail-load', { isMainFrame: true, errorCode: -102 })); });
  assert.deepEqual([hook.current().failed, hook.current().stalled], [true, false], 'a fact withdraws the guess');

  resetKey = 1;
  hook.rerender();
  assert.deepEqual([hook.current().failed, hook.current().stalled, hook.current().loaded], [false, false, false]);
  assert.equal(clock.pending.size, 1, 'the reset re-arms one fresh stall timer');
  act(() => { guest.dispatchEvent(loadEvent('did-finish-load')); });
  assert.deepEqual([hook.current().failed, hook.current().stalled, hook.current().loaded], [false, false, true]);
  assert.equal(clock.pending.size, 0);

  act(() => hook.current().guestRef(null));
  act(() => { guest.dispatchEvent(loadEvent('did-fail-load', { isMainFrame: true, errorCode: -102 })); });
  assert.equal(hook.current().failed, false, 'a detached guest is no longer listened to');
});

test('useWebviewLoadFailure: a real failure cancels the pending stall guess so it can never fire later', (t) => {
  const clock = fakeTimers();
  const hook = renderHook(t, () => useWebviewLoadFailure('k', { timers: clock.timers }));
  const guest = guestNode();
  act(() => hook.current().guestRef(guest));
  act(() => { guest.dispatchEvent(loadEvent('did-fail-load', { isMainFrame: true, errorCode: -105 })); });
  assert.deepEqual([hook.current().failed, clock.pending.size], [true, 0]);
});

test('useWebviewLoadFailure: a guest that answers clears an earlier failure and marks the admin loaded', (t) => {
  const clock = fakeTimers();
  const hook = renderHook(t, () => useWebviewLoadFailure('k', { timers: clock.timers }));
  const guest = guestNode();
  act(() => hook.current().guestRef(guest));
  act(() => { guest.dispatchEvent(loadEvent('did-fail-load', { isMainFrame: true, errorCode: -102 })); });
  act(() => { guest.dispatchEvent(loadEvent('did-finish-load')); });
  assert.deepEqual([hook.current().failed, hook.current().stalled, hook.current().loaded], [false, false, true]);
});

test('useWebviewLoadFailure: unmounting clears a pending stall timer', (t) => {
  const clock = fakeTimers();
  const hook = renderHook(t, () => useWebviewLoadFailure('k', { timers: clock.timers }));
  act(() => hook.current().guestRef(guestNode()));
  assert.equal(clock.pending.size, 1);
  hook.unmount();
  assert.equal(clock.pending.size, 0);
});
