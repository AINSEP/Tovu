/** Starting a site right after it was imported: the Start button's own call, and a plain failure that keeps the site. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { startImportedSite } from './use-start-imported.hooks.js';
import { site } from './app-render-harness.js';

const imported = { ...site('new'), displayName: 'Shop', status: 'stopped' as const };

test('a new import is started and main\'s refreshed record is applied, with no toast', async () => {
  const applied: string[] = [];
  const started: string[] = [];
  const running = { ...site('new'), status: 'running' as const };
  const toast = await startImportedSite(
    { site: imported, applyRecord: (record) => applied.push(record.status) },
    { getBridge: () => ({ startSite: async (id: string) => { started.push(id); return running; } }) },
  );
  assert.equal(toast, undefined);
  assert.deepEqual(started, ['new']);
  assert.deepEqual(applied, ['starting', 'running'], 'the tab reads Starting from the first moment, never Stopped');
});

test('a failed start keeps the site, speaks plainly and puts the redacted error in the details', async () => {
  const applied: unknown[] = [];
  const toast = await startImportedSite(
    { site: imported, applyRecord: (record) => applied.push(record) },
    { getBridge: () => ({ startSite: async () => { throw new Error("Error invoking remote method 'x': Error: port busy in /Users/jo/Sites/shop"); } }) },
  );
  assert.deepEqual(applied.map((record) => (record as { status: string }).status), ['starting', 'stopped'], 'a failed start puts the old state back');
  assert.match(toast?.message ?? '', /Shop was added, but it didn't start.*press Start site/);
  assert.match(toast?.note ?? '', /^Details: /);
  assert.doesNotMatch(toast?.note ?? '', /\/Users\/jo/);
});

test('a missing desktop connection is a failed start, not a throw', async () => {
  const toast = await startImportedSite({ site: imported, applyRecord: () => {} }, { getBridge: () => undefined });
  assert.match(toast?.message ?? '', /didn't start/);
});

test('a folder already on the list, or already running, is left as it was', async () => {
  const started: string[] = [];
  const bridge = { startSite: async (id: string) => { started.push(id); return site(id); } };
  assert.equal(await startImportedSite({ site: { ...imported, alreadyTracked: true }, applyRecord: () => {} }, { getBridge: () => bridge }), undefined);
  assert.equal(await startImportedSite({ site: { ...imported, status: 'running' }, applyRecord: () => {} }, { getBridge: () => bridge }), undefined);
  assert.deepEqual(started, []);
});
