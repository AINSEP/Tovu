/**
 * @file P11 ST-18a.T / ST-18b.T — the sites-home Storage sheet rendered against a fake host hook:
 * it shows the main-built view, asks before any removal, offers only capabilities main reported,
 * and with the release flag off there is no entry at all.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createElement, useState } from 'react';
import type { DesktopStorageView } from '@tovu/contracts/desktop-storage';
import { act, fakeSiteSettings, mount, settle, type TestContext } from './component-harness.js';
import { closeHost } from '../app-render-harness.js';
import { StorageSheet, StorageSheetLauncher, type StorageSheetState } from './StorageSheet.js';
import { TopNav } from './TopNav.js';
import { STORAGE_SHEET_COPY, StorageButton, storageSheetSlot } from '../storage-sheet-slot.js';
import { STORAGE_SHEET_ENABLED, type StorageSheetBridge } from '../../contracts/storage-sheet.js';

after(closeHost);

const VIEW: DesktopStorageView = {
  generatedAt: '2026-11-26T00:00:00.000Z',
  sites: [{ id: 's1', label: 'Bakery', totalBytes: 2048, automaticBytes: 1024, files: 3 }],
  signIns: { state: 'ok', items: [{ id: 'g1', label: 'Unknown website', cacheBytes: null }, { id: null, label: 'Kept site', cacheBytes: 5 }] },
  otherFolders: [{ id: 'f1', label: 'Old blog', kind: 'dismissed-site', bytes: 10 }, { id: null, label: 'Backups', kind: 'backups', bytes: null }],
  tidy: { actions: [] },
};

function fakeHook(view: DesktopStorageView, calls: string[]): () => StorageSheetState {
  return () => {
    const [pending, setPending] = useState<StorageSheetState['pending']>(null);
    return {
      view, pending, result: null,
      ask: ({ id, action }) => { calls.push(`ask:${action}:${id}`); setPending({ state: 'ready', confirmationId: `c-${id}`, action, label: 'Unknown website' }); },
      confirm: () => { calls.push(`confirm:${pending?.confirmationId}`); setPending(null); },
      cancel: () => { calls.push('cancel'); setPending(null); },
    };
  };
}

async function renderSheet(t: TestContext, view: DesktopStorageView = VIEW) {
  const calls: string[] = [];
  const mounted = mount({ t, element: createElement(StorageSheet, {
    useStorageSheet: fakeHook(view, calls), copy: STORAGE_SHEET_COPY, components: { Button: StorageButton }, onClose: () => calls.push('close'),
  }) });
  await settle();
  const button = (label: string) => [...mounted.container.querySelectorAll('button')].find((node) => node.textContent === label);
  const click = async (label: string) => { await act(async () => { button(label)!.click(); }); };
  return { ...mounted, calls, button, click };
}

test('the sheet renders the main-built view and removes nothing until the owner confirms', async (t) => {
  const view = await renderSheet(t);
  const text = view.container.textContent ?? '';
  for (const shown of ['Bakery', '2 KB', 'Unknown website', 'Kept site', 'Old blog', 'Backups', 'Unknown size']) assert.ok(text.includes(shown), shown);
  assert.equal(view.container.querySelectorAll('button.storage-sheet__remove').length, 1, 'an item without an id has no remove button');
  assert.equal(view.container.querySelectorAll('button.storage-sheet__trash').length, 1, 'only a dismissed folder with an id can go to the Trash');
  await view.click('Remove sign-in');
  assert.deepEqual(view.calls, ['ask:remove-sign-in:g1'], 'asking is not confirming');
  assert.match(view.container.querySelector('.storage-sheet__confirm')?.textContent ?? '', /Website files are not touched/);
  await view.click('Cancel');
  assert.deepEqual(view.calls, ['ask:remove-sign-in:g1', 'cancel']);
  await view.click('Remove sign-in');
  await view.click('Confirm');
  assert.deepEqual(view.calls, ['ask:remove-sign-in:g1', 'cancel', 'ask:remove-sign-in:g1', 'confirm:c-g1']);
});

test('T-18.7 no capability means no Clean or Compact (renderer)', async (t) => {
  const none = await renderSheet(t);
  assert.equal(none.button('Clean'), undefined);
  assert.equal(none.button('Compact'), undefined);
  const cleanOnly = await renderSheet(t, { ...VIEW, tidy: { actions: ['clean'] } });
  assert.ok(cleanOnly.button('Clean'));
  assert.equal(cleanOnly.button('Compact'), undefined, 'a capability main did not report is never a dead button');
});

test('unknown sign-in state offers no sign-in action', async (t) => {
  const view = await renderSheet(t, { ...VIEW, signIns: { state: 'unknown' } });
  assert.equal(view.button('Remove sign-in'), undefined);
  assert.match(view.container.textContent ?? '', /could not be checked/);
});

test('with the flag off there is no Storage entry on the sites home', async (t) => {
  assert.equal(STORAGE_SHEET_ENABLED, false);
  const bridge = { list: async () => VIEW, preview: async () => ({ state: 'relist' as const }), act: async () => ({ state: 'relist' as const }) };
  assert.equal(storageSheetSlot({ enabled: STORAGE_SHEET_ENABLED, bridge }), undefined);
  assert.equal(storageSheetSlot({ enabled: false, bridge }), undefined);
  assert.equal(storageSheetSlot({ enabled: true, bridge: undefined }), undefined, 'no bridge, no entry');
  const nav = (storageSheet: ReturnType<typeof storageSheetSlot>) => mount({ t, element: createElement(TopNav, {
    activeId: 'projects', onSitesHome: true, runningCount: 0, theme: 'system', onThemeChange: () => {}, onOpenAppearance: () => {},
    onSelectSection: () => {}, useSiteSettings: fakeSiteSettings().useSiteSettings, useAppVersionHook: () => ({ version: null, error: null }), storageSheet,
  }) });
  const dark = nav(storageSheetSlot({ enabled: STORAGE_SHEET_ENABLED, bridge }));
  await settle();
  assert.equal(dark.container.querySelector('.topnav__storage'), null);
  const lit = nav(storageSheetSlot({ enabled: true, bridge }));
  await settle();
  assert.ok(lit.container.querySelector('.topnav__storage'), 'the entry exists only when the flag is on');
});

test('the real Storage slot loads on open, waits for confirmation, and displays the refreshed list', async (t) => {
  const calls: unknown[][] = [];
  let removed = false;
  const bridge: StorageSheetBridge = {
    list: async () => {
      calls.push(['list']);
      return removed ? { ...VIEW, signIns: { state: 'ok', items: [] } } : VIEW;
    },
    preview: async (input) => {
      calls.push(['preview', input]);
      return { state: 'ready', confirmationId: 'remove-g1', action: 'remove-sign-in', label: 'Unknown website' };
    },
    act: async (input) => {
      calls.push(['act', input]);
      removed = input.confirmationId === 'remove-g1';
      return { state: 'done' };
    },
  };
  const slot = storageSheetSlot({ enabled: true, bridge });
  assert.ok(slot);
  const view = mount({ t, element: createElement(StorageSheetLauncher, { slot }) });
  const sheet = () => view.container.querySelector('section[aria-label="Storage"]');
  const click = async (label: string) => {
    const button = [...view.container.querySelectorAll('button')].find((node) => node.textContent === label);
    assert.ok(button, label);
    await view.click({ el: button });
  };

  assert.equal(sheet(), null);
  assert.deepEqual(calls, []);
  await click('Storage');
  await settle();
  assert.equal(sheet()?.querySelector('h2')?.textContent, 'Storage');
  assert.match(sheet()?.textContent ?? '', /Unknown website/);
  await click('Remove sign-in');
  await settle();
  assert.match(sheet()?.querySelector('.storage-sheet__confirm')?.textContent ?? '', /Remove the saved sign-in for Unknown website\?/);
  assert.deepEqual(calls, [['list'], ['preview', { id: 'g1', action: 'remove-sign-in' }]]);
  await click('Cancel');
  assert.equal(sheet()?.querySelector('.storage-sheet__confirm'), null);
  assert.equal(removed, false);
  await click('Remove sign-in');
  await settle();
  await click('Confirm');
  await settle();
  assert.deepEqual(calls, [['list'], ['preview', { id: 'g1', action: 'remove-sign-in' }],
    ['preview', { id: 'g1', action: 'remove-sign-in' }], ['act', { confirmationId: 'remove-g1' }], ['list']]);
  assert.equal(sheet()?.querySelector('[role="status"]')?.textContent, 'Done.');
  assert.doesNotMatch(sheet()?.textContent ?? '', /Unknown website/);
  await click('Close');
  assert.equal(sheet(), null);
});

test('Storage reports failed preview and act as refreshed lists without exposing rejection details', async (t) => {
  let listings = 0, previews = 0;
  const actions: unknown[] = [];
  const bridge: StorageSheetBridge = {
    list: async () => ({ ...VIEW, sites: [{ ...VIEW.sites[0]!, label: `Bakery revision ${++listings}` }] }),
    preview: async () => {
      if (++previews === 1) throw new Error('internal preview failure');
      return { state: 'ready', confirmationId: 'reviewed', action: 'remove-sign-in', label: 'Unknown website' };
    },
    act: async (input) => { actions.push(input); throw new Error('internal act failure'); },
  };
  const slot = storageSheetSlot({ enabled: true, bridge });
  assert.ok(slot);
  const view = mount({ t, element: createElement(StorageSheet, { ...slot, onClose: () => {} }) });
  const click = async (label: string) => {
    const button = [...view.container.querySelectorAll('button')].find((node) => node.textContent === label);
    assert.ok(button, label);
    await view.click({ el: button });
    await settle();
  };
  await settle();
  assert.match(view.container.textContent ?? '', /Bakery revision 1/);
  await click('Remove sign-in');
  assert.equal(view.container.querySelector('.storage-sheet__confirm'), null);
  assert.match(view.container.textContent ?? '', /Bakery revision 2/);
  assert.equal(view.container.querySelector('[role="status"]')?.textContent, 'The list changed. It has been refreshed.');
  assert.deepEqual(actions, []);
  await click('Remove sign-in');
  await click('Confirm');
  assert.deepEqual(actions, [{ confirmationId: 'reviewed' }]);
  assert.equal(view.container.querySelector('.storage-sheet__confirm'), null);
  assert.match(view.container.textContent ?? '', /Bakery revision 3/);
  assert.equal(view.container.querySelector('[role="status"]')?.textContent, 'The list changed. It has been refreshed.');
  assert.doesNotMatch(view.container.textContent ?? '', /internal (preview|act) failure/);
});
