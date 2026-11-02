/**
 * @file `useDeleteConfirmation` rendered from its real module under jsdom. The first test drives
 * the default port (the jsdom `document`), moved from `App.hooks.render.test.ts`; the second injects
 * a counting document so the Escape listener's lifetime is asserted too.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
import { countingTarget, deferred, renderHookWithView as renderHook } from './app-hooks.test-support.js';
import { installDom } from './dom-hook-harness.js';
import { useDeleteConfirmation } from './use-delete-confirmation.hooks.js';

const window = installDom();

test('useDeleteConfirmation: request, Escape cancels unless a delete is in flight, success clears, failure explains', async (t) => {
  const outcomes: Promise<void>[] = [];
  const hook = renderHook(t, () => useDeleteConfirmation(() => outcomes.shift()!));
  const escape = () => act(() => { document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })); });
  act(() => hook.current().requestDelete('a'));
  assert.equal(hook.current().pendingId, 'a');
  escape();
  assert.equal(hook.current().pendingId, null);

  act(() => hook.current().requestDelete('a'));
  const slow = deferred<void>();
  outcomes.push(slow.promise);
  let done!: Promise<void>;
  act(() => { done = hook.current().confirmDelete('a'); });
  assert.equal(hook.current().deletingId, 'a');
  escape();
  assert.equal(hook.current().pendingId, 'a', 'Escape cannot cancel a delete that is already running');
  slow.resolve();
  await act(() => done);
  assert.deepEqual([hook.current().pendingId, hook.current().deletingId, hook.current().deleteError], [null, null, null]);

  act(() => hook.current().requestDelete('b'));
  outcomes.push(Promise.reject(new Error("Error invoking remote method 'site:delete': Error: folder is locked")));
  await act(() => hook.current().confirmDelete('b'));
  assert.equal(hook.current().deleteError, 'folder is locked');
  assert.equal(hook.current().pendingId, 'b', 'the card stays so the operator can retry');
  act(() => hook.current().cancelDelete());
  act(() => hook.current().requestDelete('b'));
  assert.equal(hook.current().deleteError, null, 'a new request starts without the old error');
});

test('useDeleteConfirmation: an empty rejection falls back to the keep-your-card message', async (t) => {
  const hook = renderHook(t, () => useDeleteConfirmation(() => Promise.reject(new Error(''))));
  act(() => hook.current().requestDelete('a'));
  await act(() => hook.current().confirmDelete('a'));
  assert.equal(hook.current().deleteError, 'Could not delete this website. Its card has been kept so you can try again.');
});

test('useDeleteConfirmation: listens for Escape only while a card is pending, and releases it on cancel and unmount', (t) => {
  const doc = countingTarget<Pick<Document, 'addEventListener' | 'removeEventListener'>>();
  const hook = renderHook(t, () => useDeleteConfirmation(async () => {}, { doc: doc.port }));
  assert.equal(doc.live(), 0);
  act(() => hook.current().requestDelete('a'));
  assert.equal(doc.live(), 1);
  doc.dispatch('keydown', { key: 'Enter' });
  assert.equal(hook.current().pendingId, 'a', 'only Escape cancels');
  doc.dispatch('keydown', { key: 'Escape' });
  assert.deepEqual([hook.current().pendingId, doc.live()], [null, 0]);
  act(() => hook.current().requestDelete('b'));
  hook.unmount();
  assert.equal(doc.live(), 0);
});
