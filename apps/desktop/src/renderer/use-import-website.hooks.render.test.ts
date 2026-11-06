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
  const hook = renderHook(t, () => useImportWebsite({ createSite, openSite: (input) => { opened.push(input); }, onArchiveImported: () => {} }));
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
    { createSite: async () => undefined, openSite: () => {}, onArchiveImported: () => {} },
    { getBridge: () => ({ importSiteArchive: async () => { throw new Error("Error invoking remote method 'runner:sites:import-archive': Error: ZIP size or SHA-256 mismatch."); } }) as never },
  ));
  await act(async () => { await hook.current().importArchive({ file: '/Users/jo/x.tovu.zip' }); });
  const failure = hook.current().failure;
  assert.match(failure?.message ?? '', /damaged or changed/);
  assert.match(failure?.message ?? '', /Export it again/);
  assert.doesNotMatch(failure?.message ?? '', /SHA-256/);
  assert.match(failure?.details ?? '', /ZIP size or SHA-256 mismatch\./);
});
