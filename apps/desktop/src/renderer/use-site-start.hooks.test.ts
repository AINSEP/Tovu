/**
 * @file `performSiteStart` and `startThenNotify` run against the real functions. Moved from
 * `App.hooks.test.ts` with the split; `useSiteStart` itself is rendered in
 * `use-site-start.hooks.render.test.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { SiteRecord } from '../contracts/project.js';
import { performSiteStart, startThenNotify } from './use-site-start.hooks.js';

test('Start waits for start to settle before notifying the caller', async () => {
  const calls: string[] = [];
  const pending: { finish?: (started: boolean) => void } = {};
  const handleStart = startThenNotify(
    () =>
      new Promise<boolean>((resolve) => {
        calls.push('start');
        pending.finish = resolve;
      }),
    () => calls.push('onStarted'),
  );
  const done = handleStart();
  assert.deepEqual(calls, ['start'], 'onStarted must not run while start is still in flight');
  pending.finish?.(true);
  await done;
  assert.deepEqual(calls, ['start', 'onStarted']);
});

test('Start with no onStarted just runs start', async () => {
  const calls: string[] = [];
  await startThenNotify(async () => {
    calls.push('start');
    return true;
  }, undefined)();
  assert.deepEqual(calls, ['start']);
});

test('a start that rejects skips onStarted, and the SAME rejection reaches the caller', async () => {
  const failure = new Error('bridge gone');
  const calls: string[] = [];
  await assert.rejects(
    startThenNotify(async () => {
      throw failure;
    }, () => calls.push('onStarted')),
    (error) => error === failure,
  );
  assert.equal(calls.length, 0);
});

test("a start that RESOLVES but reports failure (useSiteStart's bridge-missing/caught-error path) skips onStarted", async () => {
  // useSiteStart's `start` never rejects — a missing bridge or a caught `startSite` error both set
  // `error` state and resolve normally, so `startThenNotify` cannot tell success from failure by
  // whether the promise rejected. It must read the resolved value instead.
  const calls: string[] = [];
  await startThenNotify(
    async () => {
      calls.push('start');
      return false;
    },
    () => calls.push('onStarted'),
  )();
  assert.deepEqual(calls, ['start'], 'onStarted must not fire after a failed start');
});

const STARTED_RECORD = { id: '/sites/a', status: 'running', port: 4321 } as unknown as SiteRecord;

test("performSiteStart calls startSite and reports main's own record back", async () => {
  const calls: string[] = [];
  const result = await performSiteStart('/sites/a', {
    startSite: async (id) => {
      calls.push(`start:${id}`);
      return STARTED_RECORD;
    },
  });
  assert.deepEqual(calls, ['start:/sites/a']);
  assert.equal(result.record, STARTED_RECORD, 'the record must be the one main resolved with, not one composed here');
  assert.equal(result.error, undefined);
});

test("performSiteStart surfaces a rejection's Error message verbatim", async () => {
  const result = await performSiteStart('/sites/a', {
    startSite: () => Promise.reject(new Error('tovu serve did not report a port within 60000ms.')),
  });
  assert.equal(result.error, 'tovu serve did not report a port within 60000ms.');
  assert.equal(result.record, undefined);
});

test('performSiteStart coerces a non-Error rejection with String(), not [object Object]', async () => {
  const result = await performSiteStart('/sites/a', { startSite: () => Promise.reject('offline') });
  assert.equal(result.error, 'offline');
});

test('performSiteStart turns a synchronous throw from startSite into a reported error too', async () => {
  const result = await performSiteStart('/sites/a', { startSite: () => { throw new Error('preload gone'); } });
  assert.equal(result.error, 'preload gone');
});

test('performSiteStart with no bridge is an operator-facing message, not a thrown error', async () => {
  const result = await performSiteStart('/sites/a', undefined);
  assert.equal(result.error, 'Tovu desktop connection required to start a website.');
});
