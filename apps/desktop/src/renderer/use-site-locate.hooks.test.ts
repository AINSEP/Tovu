/** Coverage for the missing-folder Locate button: performLocate's decisions and the real hook's
 * pending, error, retry and record-delivery flow through React and a controlled desktop bridge. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { performLocate, useSiteLocate } from './use-site-locate.hooks.js';
import type { SiteRecord } from '../contracts/project.js';

const FOUND = { id: '/sites/tovu-dev', folderMissing: false } as unknown as SiteRecord;

test('a located folder resolves with main\'s record at its new id', async () => {
  const asked: string[] = [];
  const result = await performLocate('/sites/tovu-com', {
    locateSite: async (id) => {
      asked.push(id);
      return FOUND;
    },
  });
  assert.deepEqual(asked, ['/sites/tovu-com']);
  assert.deepEqual(result, { record: FOUND });
});

test('a refusal containing a filesystem path becomes the card\'s recovery instruction', async () => {
  const result = await performLocate('/sites/x', {
    locateSite: async () => {
      throw new Error('/tmp/y is not a complete Tovu site (empty). Pick the folder that holds this website.');
    },
  });
  assert.deepEqual(result, { error: 'Could not add this website. Check the folder and try again.' });
});

test('a cancelled picker is not an error to show', async () => {
  const result = await performLocate('/sites/x', {
    locateSite: async () => {
      throw new Error("Error invoking remote method 'runner:sites:locate': Error: No folder was chosen.");
    },
  });
  assert.deepEqual(result, {});
});

test('a non-Error rejection is stringified, and a missing bridge says so', async () => {
  assert.deepEqual(await performLocate('/s', { locateSite: () => Promise.reject('boom') }), { error: 'boom' });
  assert.deepEqual(await performLocate('/s', undefined), { error: 'The desktop bridge is unavailable.' });
});

// F2.3/F6.2: run the hook's real state transitions and delivery callback, including a retry.
test('the locate hook shows pending/error state and delivers the found record with the old id on retry', async (t) => {
  const { JSDOM } = createRequire(import.meta.url)('jsdom');
  const dom = new JSDOM('<div id="root"></div>');
  const globals = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
  const saved = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  let settle!: (record: SiteRecord) => void;
  let reject!: (error: Error) => void;
  const asked: string[] = [];
  dom.window.tovuRunner = { locateSite: (id: string) => {
    asked.push(id);
    return new Promise<SiteRecord>((resolve, refuse) => { settle = resolve; reject = refuse; });
  } };
  let latest!: ReturnType<typeof useSiteLocate>;
  const delivered: unknown[] = [];
  const onLocated = (record: SiteRecord, previousId: string) => delivered.push([record, previousId]);
  function Probe() { latest = useSiteLocate(onLocated); return null; }
  const root = createRoot(dom.window.document.getElementById('root')!);
  t.after(() => {
    act(() => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  act(() => root.render(createElement(Probe)));
  let pending!: Promise<void>;
  act(() => { pending = latest.locate('/sites/missing'); });
  assert.equal(latest.locatingId, '/sites/missing');
  await act(async () => { reject(new Error('Folder is incomplete')); await pending; });
  assert.equal(latest.errorOf('/sites/missing'), 'Folder is incomplete');
  assert.equal(latest.locatingId, null);
  assert.deepEqual(delivered, []);
  act(() => { pending = latest.locate('/sites/missing'); });
  await act(async () => { settle(FOUND); await pending; });
  assert.deepEqual(asked, ['/sites/missing', '/sites/missing']);
  assert.deepEqual(delivered, [[FOUND, '/sites/missing']]);
  assert.equal(latest.errorOf('/sites/missing'), null);
  assert.equal(latest.locatingId, null);
});
