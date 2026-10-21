/**
 * @file `useSiteRename` rendered from its real module under jsdom (see `dom-hook-harness.ts`), with
 * the bridge injected through its `getBridge` port. The pure decisions have direct tests in
 * `use-site-rename.hooks.test.ts`; this file asserts the flow the hook owns: seeding the draft,
 * Escape dismissal (blocked while saving), refusals that never show a spinner, and save outcomes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { act } from 'react';

import type { RenameSiteInput, SiteRecord } from '../contracts/project.js';
import { installDom, renderHook, settle } from './dom-hook-harness.js';
import type { RunnerInventoryBridge } from './runner-api.js';
import { NO_BRIDGE_RENAME_MESSAGE, useSiteRename } from './use-site-rename.hooks.js';

const SITE = { id: '/sites/a', displayName: 'Alpha' } as unknown as SiteRecord;

/** A bridge whose `renameSite` stays pending until the test settles it. */
function renameBridge() {
  const sent: RenameSiteInput[] = [];
  const pending: { resolve: (record: SiteRecord) => void; reject: (error: unknown) => void }[] = [];
  const bridge = {
    renameSite: (input: RenameSiteInput) => {
      sent.push(input);
      return new Promise<SiteRecord>((resolve, reject) => { pending.push({ resolve, reject }); });
    },
  } as unknown as RunnerInventoryBridge;
  return { getBridge: () => bridge, sent, next: () => pending.shift()! };
}

const pressEscape = () => act(() => {
  const window = installDom();
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
});

test('starting a rename seeds the current name; Escape cancels it', async (t) => {
  const fake = renameBridge();
  const hook = renderHook(t, () => useSiteRename(undefined, { getBridge: fake.getBridge }));
  act(() => hook.current().startRename(SITE));
  assert.equal(hook.current().renamingId, SITE.id);
  assert.equal(hook.current().draft, 'Alpha');
  assert.equal(hook.current().canSave, true);
  pressEscape();
  assert.equal(hook.current().renamingId, null);
  pressEscape();
  assert.equal(hook.current().renamingId, null, 'with nothing open, Escape is ignored');
});

test('a successful save sends the trimmed-as-typed draft, closes the overlay and hands main\'s record over', async (t) => {
  const fake = renameBridge();
  const renamed: SiteRecord[] = [];
  const hook = renderHook(t, () => useSiteRename((record) => renamed.push(record), { getBridge: fake.getBridge }));
  act(() => hook.current().startRename(SITE));
  act(() => hook.current().setDraft('Beta'));
  const saving = hook.current().submitRename(SITE.id);
  await settle();
  assert.equal(hook.current().saving, true);
  assert.equal(hook.current().canSave, false, 'no second save while one is in flight');
  pressEscape();
  assert.equal(hook.current().renamingId, SITE.id, 'Escape cannot dismiss a save in flight');
  assert.deepEqual(fake.sent, [{ id: SITE.id, name: 'Beta' }]);
  const record = { ...SITE, displayName: 'Beta' };
  fake.next().resolve(record);
  await saving;
  await settle();
  assert.equal(hook.current().renamingId, null);
  assert.equal(hook.current().saving, false);
  assert.deepEqual(renamed, [record]);
});

test('a rejected save keeps the overlay open with main\'s sentence and stops the spinner', async (t) => {
  const fake = renameBridge();
  const hook = renderHook(t, () => useSiteRename(undefined, { getBridge: fake.getBridge }));
  act(() => hook.current().startRename(SITE));
  const saving = hook.current().submitRename(SITE.id);
  fake.next().reject(new Error('A site named Alpha already exists.'));
  await saving;
  await settle();
  assert.equal(hook.current().renamingId, SITE.id);
  assert.equal(hook.current().renameError, 'A site named Alpha already exists.');
  assert.equal(hook.current().saving, false);
  act(() => hook.current().startRename(SITE));
  assert.equal(hook.current().renameError, null, 'reopening starts clean');
});

test('refusals never reach the bridge and never show a spinner', async (t) => {
  const fake = renameBridge();
  const invalid = renderHook(t, () => useSiteRename(undefined, { getBridge: fake.getBridge }));
  act(() => invalid.current().startRename(SITE));
  act(() => invalid.current().setDraft('   '));
  await act(() => invalid.current().submitRename(SITE.id));
  assert.ok(invalid.current().renameError);
  assert.equal(invalid.current().saving, false);
  assert.deepEqual(fake.sent, []);

  const unbridged = renderHook(t, () => useSiteRename(undefined, { getBridge: () => undefined }));
  act(() => unbridged.current().startRename(SITE));
  await act(() => unbridged.current().submitRename(SITE.id));
  assert.equal(unbridged.current().renameError, NO_BRIDGE_RENAME_MESSAGE);
  assert.equal(unbridged.current().saving, false);
});
