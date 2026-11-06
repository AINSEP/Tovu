/** The new-site toast, from the real hook under jsdom: wording, notices, one at a time, and timing. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
import { renderHookWithView as renderHook } from './app-hooks.test-support.js';
import { site } from './app-render-harness.js';
import { useSiteToast } from './use-site-toast.hooks.js';

const created = (displayName: string) => ({ ...site('c', { displayName }), createdAt: 1 }) as never;
const imported = (displayName: string, warnings: string[]) => ({ ...site('i', { displayName }), warnings }) as never;
const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

test('useSiteToast: a created site announces itself; an import carries its notices as one note', (t) => {
  let lastCreated: ReturnType<typeof created> | null = null;
  const hook = renderHook(t, () => useSiteToast({ lastCreated }));
  assert.equal(hook.current().toast, null);
  lastCreated = created('Bakery');
  hook.rerender();
  assert.deepEqual(hook.current().toast, { message: 'New website created: Bakery' });
  act(() => hook.current().announceImported(imported('Shop', ['A kept off.', 'B left out.'])));
  assert.deepEqual(hook.current().toast, { message: 'New website created: Shop', note: 'A kept off. B left out.' });
  act(() => hook.current().announceImported(imported('Plain', [])));
  assert.deepEqual(hook.current().toast, { message: 'New website created: Plain' }, 'no notices, no note, and only one toast');
});

test('useSiteToast: an added folder is announced, one already on the list is not, and dismiss clears it', (t) => {
  const hook = renderHook(t, () => useSiteToast({ lastCreated: null }));
  act(() => hook.current().announceAdded({ ...site('a', { displayName: 'Old' }), alreadyTracked: true }));
  assert.equal(hook.current().toast, null);
  act(() => hook.current().announceAdded(site('b', { displayName: 'Folder site' })));
  assert.deepEqual(hook.current().toast, { message: 'Website added: Folder site' });
  act(() => hook.current().dismiss());
  assert.equal(hook.current().toast, null);
});

test('useSiteToast: a plain toast hides itself; one with a note stays at least twelve seconds', async (t) => {
  const hook = renderHook(t, () => useSiteToast({ lastCreated: null }, { autoHideMs: 20 }));
  act(() => hook.current().announceAdded(site('b')));
  await wait(60);
  assert.equal(hook.current().toast, null, 'a plain toast went away by itself');
  act(() => hook.current().announceImported(imported('Shop', ['Read me.'])));
  await wait(60);
  assert.notEqual(hook.current().toast, null, 'a toast with a note outlives the short delay');
});
