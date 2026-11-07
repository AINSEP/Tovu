/**
 * @file The Import page's live-address source and its helpers, from the real module under jsdom:
 * the new site is made first and opened on the Import tab with the address; a bad address or a
 * failed create keeps what was typed and says what happened in plain words, with details to copy.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
import { renderHookWithView as renderHook, settle } from './app-hooks.test-support.js';
import { importPageError, useCopyDetails, useImportWebsite } from './use-import-website.hooks.js';
import { copyableDetails } from './import-error-details.js';
import { site } from './app-render-harness.js';
import type { SiteAdminPage } from './import-site-entry.js';

function setup(t: { after: (fn: () => void) => void }, createSite: (input: { displayName: string }) => Promise<ReturnType<typeof site> | undefined>) {
  const opened: Array<{ id: string; adminPage: SiteAdminPage }> = [];
  const hook = renderHook(t, () => useImportWebsite({ createSite, openSite: (input) => { opened.push(input); }, onArchiveImported: () => {}, onFailureWhileClosed: () => {} }));
  return { hook, opened };
}

test('useImportWebsite: a good address makes the site named for the host, then opens it on the Import tab with the address', async (t) => {
  const made: string[] = [];
  const { hook, opened } = setup(t, async ({ displayName }) => { made.push(displayName); return site('new'); });
  act(() => hook.current().setAddress('www.example.com/shop'));
  await act(async () => { await hook.current().importLive(); });
  assert.deepEqual(made, ['example.com']);
  assert.deepEqual(opened, [{ id: 'new', adminPage: { page: 'import', liveAddress: 'https://www.example.com/shop' } }]);
  assert.equal(hook.current().address, '', 'the field empties once the site exists');
  assert.equal(hook.current().importing, false);
});

test('useImportWebsite: a bad address creates nothing and says how to type one', async (t) => {
  const made: string[] = [];
  const { hook, opened } = setup(t, async ({ displayName }) => { made.push(displayName); return site('new'); });
  act(() => hook.current().setAddress('not an address'));
  await act(async () => { await hook.current().importLive(); });
  assert.deepEqual(made, []);
  assert.deepEqual(opened, []);
  assert.match(hook.current().failure?.message ?? '', /full website address/);
  assert.equal(hook.current().address, 'not an address', 'what was typed stays');
  act(() => hook.current().setAddress('example.com'));
  assert.equal(hook.current().failure, null, 'typing again clears the message');
});

test('useImportWebsite: a failed create keeps the address, speaks plainly and keeps redacted details, opening nothing', async (t) => {
  const { hook, opened } = setup(t, async () => { throw new Error("Error invoking remote method 'sites:create': Error: EACCES at /Users/jo/Sites/example-com"); });
  act(() => hook.current().setAddress('https://example.com'));
  await act(async () => { await hook.current().importLive(); });
  assert.deepEqual(opened, []);
  assert.equal(hook.current().address, 'https://example.com');
  assert.equal(hook.current().failure?.message, "Couldn't create a website for that address.", 'a path never reaches the sentence');
  assert.match(hook.current().failure?.details ?? '', /EACCES at ~\/Sites\/example-com/);
  assert.doesNotMatch(hook.current().failure?.details ?? '', /\/Users\/jo/);
});

/** The archive source with a bridge the test settles by hand. */
function archiveSetup(t: { after: (fn: () => void) => void }) {
  const opened: string[] = [], toasts: Array<{ message: string; note?: string }> = [], cancels: number[] = [];
  let finish!: (value: unknown) => void, fail!: (error: Error) => void;
  const bridge = {
    importSiteArchive: () => new Promise((resolve, reject) => { finish = resolve; fail = reject; }),
    cancelSiteImport: async () => { cancels.push(1); },
  };
  const hook = renderHook(t, () => useImportWebsite(
    { createSite: async () => undefined, openSite: () => {}, onArchiveImported: (made) => { opened.push(made.id); }, onFailureWhileClosed: (toast) => { toasts.push(toast); } },
    { getBridge: () => bridge as never },
  ));
  return { hook, opened, toasts, cancels, finish: (value: unknown) => finish(value), fail: (error: Error) => fail(error) };
}

test('useImportWebsite: a failure with the page open shows on the page, not as a toast', async (t) => {
  const h = archiveSetup(t);
  const close = h.hook.current().pageOpened();
  let run!: Promise<void>;
  act(() => { run = h.hook.current().importArchive({ file: '/a.zip' }); });
  assert.equal(h.hook.current().archiveRun, 'running');
  await act(async () => { h.fail(new Error('That file is over the 300 MiB import limit. No website was created.')); await run; });
  assert.match(h.hook.current().failure?.message ?? '', /over the 300 MiB/);
  assert.deepEqual(h.toasts, []);
  assert.equal(h.hook.current().archiveRun, 'none');
  close();
});

test('useImportWebsite: a failure after leaving the page reaches the person as a toast with its details', async (t) => {
  const h = archiveSetup(t);
  const close = h.hook.current().pageOpened();
  let run!: Promise<void>;
  act(() => { run = h.hook.current().importArchive({ file: '/a.zip' }); });
  close();
  await act(async () => { h.fail(new Error("Error invoking remote method 'x': Error: Details: EACCES at /Users/jo/Sites/a")); await run; });
  assert.equal(h.toasts.length, 1);
  assert.equal(h.toasts[0]!.message, "Couldn't import that website. No website was created.");
  assert.match(h.toasts[0]!.note ?? '', /EACCES at ~\/Sites\/a/);
  assert.doesNotMatch(h.toasts[0]!.note ?? '', /\/Users\/jo/);
  assert.equal(h.hook.current().failure, null, 'reopening the page starts clean');
});

test('useImportWebsite: a live-address failure after leaving the page is also a toast', async (t) => {
  const toasts: Array<{ message: string }> = [];
  let refuse!: (error: Error) => void;
  const hook = renderHook(t, () => useImportWebsite({ createSite: () => new Promise((_resolve, reject) => { refuse = reject; }), openSite: () => {}, onArchiveImported: () => {}, onFailureWhileClosed: (toast) => { toasts.push(toast); } }));
  act(() => hook.current().setAddress('example.com'));
  const close = hook.current().pageOpened();
  let run!: Promise<void>;
  act(() => { run = hook.current().importLive(); });
  close();
  await act(async () => { refuse(new Error('EACCES at /Users/jo/Sites/a')); await run; });
  assert.equal(toasts[0]?.message, "Couldn't create a website for that address.");
});

test('useImportWebsite: a bad address is said on the page: the person is looking at it', async (t) => {
  const toasts: unknown[] = [];
  const hook = renderHook(t, () => useImportWebsite({ createSite: async () => undefined, openSite: () => {}, onArchiveImported: () => {}, onFailureWhileClosed: (toast) => { toasts.push(toast); } }));
  act(() => hook.current().setAddress('not an address'));
  await act(async () => { await hook.current().importLive(); });
  assert.match(hook.current().failure?.message ?? '', /full website address/);
  assert.deepEqual(toasts, []);
});

test('useImportWebsite: Cancel asks main to stop, says it is stopping, and a stopped import ends quietly', async (t) => {
  const h = archiveSetup(t);
  const close = h.hook.current().pageOpened();
  let run!: Promise<void>;
  act(() => { run = h.hook.current().importArchive({ file: '/a.zip' }); });
  await act(async () => { await h.hook.current().cancelArchive(); });
  assert.deepEqual(h.cancels, [1]);
  assert.equal(h.hook.current().archiveRun, 'cancelling');
  assert.equal(h.hook.current().importing, true, 'still busy until the child has stopped');
  await act(async () => { h.finish(null); await run; });
  assert.equal(h.hook.current().archiveRun, 'none');
  assert.equal(h.hook.current().importing, false);
  assert.equal(h.hook.current().failure, null);
  assert.deepEqual(h.opened, []);
  close();
});

test('useImportWebsite: a site that finished as Cancel arrived still opens: it exists', async (t) => {
  const h = archiveSetup(t);
  let run!: Promise<void>;
  act(() => { run = h.hook.current().importArchive({ file: '/a.zip' }); });
  await act(async () => { await h.hook.current().cancelArchive(); });
  await act(async () => { h.finish({ ...site('made'), warnings: [] }); await run; });
  assert.deepEqual(h.opened, ['made']);
});

test('useImportWebsite: Cancel against a preload with no stop call leaves the import running', async (t) => {
  let finish!: (value: unknown) => void;
  const hook = renderHook(t, () => useImportWebsite({ createSite: async () => undefined, openSite: () => {}, onArchiveImported: () => {}, onFailureWhileClosed: () => {} },
    { getBridge: () => ({ importSiteArchive: () => new Promise((resolve) => { finish = resolve; }) }) as never }));
  let run!: Promise<void>;
  act(() => { run = hook.current().importArchive({ file: '/a.zip' }); });
  await act(async () => { await hook.current().cancelArchive(); });
  assert.equal(hook.current().archiveRun, 'running');
  await act(async () => { finish(null); await run; });
});

test('copyableDetails: strips the Electron prefix and user folders on every platform', () => {
  assert.equal(copyableDetails({ error: new Error("Error invoking remote method 'x': boom in /home/ann/a and C:\\Users\\Bo\\b") }), 'boom in ~/a and ~\\b');
});

test('importPageError: the address error wins, else the folder error with its details, else none', () => {
  assert.deepEqual(importPageError({ failure: { message: 'a', details: 'd' }, addError: 'b', addDetails: 'e' }), { message: 'a', details: 'd' });
  assert.deepEqual(importPageError({ failure: null, addError: 'b', addDetails: 'e' }), { message: 'b', details: 'e' });
  assert.deepEqual(importPageError({ failure: null, addError: 'b', addDetails: null }), { message: 'b', details: '' });
  assert.equal(importPageError({ failure: null, addError: null, addDetails: null }), null);
});

test('useCopyDetails: shows Copied only when the clipboard took the text', async (t) => {
  const written: string[] = [];
  const ok = renderHook(t, () => useCopyDetails({}, { getClipboard: () => ({ writeText: async (text: string) => { written.push(text); } }) }));
  await act(async () => { await ok.current().copy('the details'); });
  assert.deepEqual(written, ['the details']);
  assert.equal(ok.current().copied, true);
  const refused = renderHook(t, () => useCopyDetails({}, { getClipboard: () => ({ writeText: async () => { throw new Error('denied'); } }) }));
  await act(async () => { await refused.current().copy('x'); });
  await settle();
  assert.equal(refused.current().copied, false);
});

test('useImportWebsite: a changed .tovu.zip says it looks damaged and offers a fresh export, with the importer\'s own words in the details', async (t) => {
  const hook = renderHook(t, () => useImportWebsite(
    { createSite: async () => undefined, openSite: () => {}, onArchiveImported: () => {}, onFailureWhileClosed: () => {} },
    { getBridge: () => ({ importSiteArchive: async () => { throw new Error("Error invoking remote method 'runner:sites:import-archive': Error: ZIP size or SHA-256 mismatch."); } }) as never },
  ));
  await act(async () => { await hook.current().importArchive({ file: '/Users/jo/x.tovu.zip' }); });
  const failure = hook.current().failure;
  assert.match(failure?.message ?? '', /damaged or changed/);
  assert.match(failure?.message ?? '', /Export it again/);
  assert.doesNotMatch(failure?.message ?? '', /SHA-256/);
  assert.match(failure?.details ?? '', /ZIP size or SHA-256 mismatch\./);
});
