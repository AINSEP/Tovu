/**
 * @file `useUpdateCheck` rendered from its real module under jsdom, bridge injected (no module
 * mocks). The controller's own rules (one check at a time, `onDone` on success and failure) are
 * tested in `@jini-ai/desktop-host`; this pins the Tovu binding: the row is unavailable on a stale
 * preload, an inline `onDone` that changes every render neither rebuilds the controller nor is
 * called stale, and a broken channel is logged under Tovu's own prefix.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
import { deferred, renderHookWithView as renderHook, settle } from './app-hooks.test-support.js';
import { useUpdateCheck } from './use-update-check.hooks.js';

test('useUpdateCheck: a preload without the method leaves the row unavailable and a click does nothing', async (t) => {
  let done = 0;
  const hook = renderHook(t, () => useUpdateCheck({ onDone: () => { done++; } }, { bridge: {} }));
  assert.equal(hook.current().available, false);
  await act(() => hook.current().checkForUpdates());
  assert.equal(done, 0);
});

test('useUpdateCheck: reads Checking… until main answers, survives a re-render with a fresh onDone, and calls the latest one', async (t) => {
  const reply = deferred<void>();
  let calls = 0;
  const bridge = { checkForUpdates: () => { calls++; return reply.promise; } };
  const done: string[] = [];
  let label = 'first';
  const hook = renderHook(t, () => useUpdateCheck({ onDone: () => { done.push(label); } }, { bridge }));
  assert.deepEqual({ available: hook.current().available, checking: hook.current().checking }, { available: true, checking: false });
  let pending!: Promise<void>;
  act(() => { pending = hook.current().checkForUpdates(); });
  assert.equal(hook.current().checking, true);
  label = 'latest';
  hook.rerender();
  assert.equal(hook.current().checking, true, 'a fresh inline onDone does not rebuild the controller and drop the running check');
  await act(() => hook.current().checkForUpdates());
  assert.equal(calls, 1, 'one check at a time');
  reply.resolve();
  await act(async () => { await pending; });
  assert.equal(hook.current().checking, false);
  assert.deepEqual(done, ['latest']);
});

test('useUpdateCheck: a broken IPC channel is logged with the desktop prefix and still closes the menu', async (t) => {
  const logged: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logged.push(args); });
  let done = 0;
  const bridge = { checkForUpdates: async () => { throw new Error('channel closed'); } };
  const hook = renderHook(t, () => useUpdateCheck({ onDone: () => { done++; } }, { bridge }));
  await act(() => hook.current().checkForUpdates());
  await settle();
  assert.deepEqual(logged, [['[tovu-desktop] check for updates: channel closed']]);
  assert.equal(done, 1);
  assert.equal(hook.current().checking, false);
});
