import { runFind, type FindableGuest } from './use-find-in-page.hooks.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { siteNameError, namePasteHandler } from '../contracts/site-name.js';
import { humanSiteError, siteOperationError, tabAfterClose, readyNoticeStillTrue, dismissOnEscape } from './site-shell-policy.js';
import { createFindQueryScheduler, FIND_QUERY_SETTLE_MS } from './find-query-scheduler.js';
import { revealActiveTab, tabOverflow } from './use-tab-strip.hooks.js';
import { canSubmitRename } from './use-site-rename.hooks.js';
import { deleteActionCopy } from './SiteGrid.hooks.js';
import { describeAddFailure } from './use-add-site.hooks.js';
import type { SiteRecord, CreatedSiteRecord } from '../contracts/project.js';

const site = (fields: Partial<SiteRecord> = {}) => ({ id: '/site', displayName: 'My website', status: 'stopped', folderMissing: false, ...fields }) as SiteRecord;

// The menu and Rename hooks run this rule (rendered in `use-dropdown-menu.hooks.render.test.ts`
// and `use-site-rename.hooks.render.test.ts`); its own guards are asserted here.
test('D-12: Escape dismisses, but not while busy or mid IME composition, and no other key does', () => {
  let dismissed = 0;
  dismissOnEscape({ event: { key: 'Enter' }, dismiss: () => { dismissed++; } });
  dismissOnEscape({ event: { key: 'Escape' }, dismiss: () => { dismissed++; }, busy: true });
  dismissOnEscape({ event: { key: 'Escape', isComposing: true }, dismiss: () => { dismissed++; } });
  assert.equal(dismissed, 0);
  dismissOnEscape({ event: { key: 'Escape' }, dismiss: () => { dismissed++; } });
  assert.equal(dismissed, 1);
});

test('D-14: closing the active tab picks right, else left, and preserves an unrelated selection', () => {
  const tabs = ['a', 'b', 'c'];
  assert.equal(tabAfterClose({ tabs, active: 'b', closing: 'b' }), 'c');
  assert.equal(tabAfterClose({ tabs, active: 'c', closing: 'c' }), 'b');
  assert.equal(tabAfterClose({ tabs, active: 'a', closing: 'a' }), 'b');
  assert.equal(tabAfterClose({ tabs: ['a'], active: 'a', closing: 'a' }), null);
  assert.equal(tabAfterClose({ tabs, active: 'b', closing: 'a' }), 'b');
  assert.equal(tabAfterClose({ tabs, active: null, closing: 'a' }), null);
});

test('D-18: a missing website keeps its name in truthful Remove copy', () => {
  const copy = deleteActionCopy(site({ folderMissing: true, deleteErasesFiles: false }));
  assert.equal(copy.confirmTitle, 'Remove My website from Projects?');
  assert.equal(copy.confirmBody, 'Removes this website from your list. Its folder is missing, so there are no files here to delete.');
  assert.equal(copy.confirmButtonLabel, 'Remove');
});

test('D-19: the ready notice disappears on start, missing folder, or removal and uses no stale status', () => {
  const created = site() as CreatedSiteRecord;
  assert.equal(readyNoticeStillTrue({ created, projects: [site()] }), true);
  for (const status of ['starting', 'running', 'stopping', 'blocked'] as const) {
    assert.equal(readyNoticeStillTrue({ created, projects: [site({ status })] }), false);
  }
  assert.equal(readyNoticeStillTrue({ created, projects: [site({ folderMissing: true })] }), false);
  assert.equal(readyNoticeStillTrue({ created, projects: [] }), false);
  assert.equal(readyNoticeStillTrue({ created, projects: [site({ displayName: 'Renamed' })] }), false);
  assert.equal(readyNoticeStillTrue({ created: null, projects: [site()] }), false);
});

test('D-20: fast typing issues one search for the complete exact query; clear/close cancels it and Enter flushes it', () => {
  const timers = new Map<number, () => void>();
  let next = 0;
  const scheduler = createFindQueryScheduler({}, { clock: {
    schedule: (callback, delay) => { assert.equal(delay, FIND_QUERY_SETTLE_MS); timers.set(++next, callback); return next; },
    cancel: (timer) => { timers.delete(timer as number); },
  } });
  const finds: string[] = [];
  const guest: FindableGuest = {
    findInPage: (text) => { finds.push(text); return 1; },
    stopFindInPage() {}, addEventListener() {}, removeEventListener() {},
  };
  for (let length = 1; length <= 'Plugin API'.length; length++) {
    const text = 'Plugin API'.slice(0, length);
    scheduler.schedule({ run: () => runFind({ kind: 'guest', element: guest }, undefined, text, { forward: true, findNext: true }, null) });
    assert.deepEqual(finds, []);
    assert.equal(timers.size, 1);
  }
  for (const callback of [...timers.values()]) callback();
  assert.deepEqual(finds, ['Plugin API']);
  scheduler.schedule({ run: () => finds.push('cancelled') }); scheduler.cancel();
  assert.equal(timers.size, 0);
  assert.equal(scheduler.flush(), false);
  scheduler.schedule({ run: () => finds.push('Enter') });
  assert.equal(scheduler.flush(), true);
  assert.deepEqual(finds, ['Plugin API', 'Enter']);
  assert.equal(timers.size, 0);
});

test('D-24: IPC and AddSitePointerError class prefixes never reach the operator', () => {
  assert.equal(describeAddFailure(new Error("Error invoking remote method 'runner:sites:add-site': AddSitePointerError: This folder is not a Tovu website.")), 'This folder is not a Tovu website.');
  assert.equal(humanSiteError({ error: "Error invoking remote method 'runner:sites:create': Error: Could not create website.", fallback: 'unknown' }), 'Could not create website.');
});

test('D-26: the active tab scrolls into view and overflow buttons expose the hidden direction', () => {
  const calls: unknown[] = [];
  revealActiveTab({ strip: { querySelector: <T extends Element>(selector: string) => {
    assert.equal(selector, '.is-active');
    return { scrollIntoView: (options: unknown) => calls.push(options) } as unknown as T;
  } } });
  assert.deepEqual(calls, [{ block: 'nearest', inline: 'nearest' }]);
  assert.deepEqual(tabOverflow({ strip: { scrollWidth: 700, clientWidth: 500, scrollLeft: 0 } }), { left: false, right: true });
  assert.deepEqual(tabOverflow({ strip: { scrollWidth: 700, clientWidth: 500, scrollLeft: 200 } }), { left: true, right: false });
});

test('D-02/D-17: oversized paste preserves the full draft for validation instead of silently saving 200 characters', () => {
  let draft = '';
  let prevented = false;
  const name = 'x'.repeat(248);
  namePasteHandler({ setName: (next) => { draft = next; } })({
    clipboardData: { getData: () => name }, currentTarget: { value: 'old', selectionStart: 0, selectionEnd: 3 },
    preventDefault: () => { prevented = true; },
  });
  assert.equal(prevented, true);
  assert.equal(draft, name);
  assert.equal(siteNameError({ name: draft }), 'A name must be 1 to 200 characters, not counting spaces at either end.');
  assert.equal(canSubmitRename(draft, false), false);
});

test('tabAfterClose: closing the active tab that is not in the strip leaves no active tab', () => {
  assert.equal(tabAfterClose({ tabs: ['a', 'b'], active: 'gone', closing: 'gone' }), null);
});

test('siteOperationError falls back to English copy in a host with no navigator', (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: undefined });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor); });
  assert.equal(typeof navigator, 'undefined');
  assert.equal(siteOperationError({ error: 'Error: /tmp/x has no Tovu site in it yet.', operation: 'add' }),
    'No Tovu website was found in this folder. Choose an existing website or use Create website.');
  assert.equal(siteOperationError({ error: new Error('Port 4300 is busy.'), operation: 'start' }), 'Port 4300 is busy.');
});

