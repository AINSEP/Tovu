/**
 * @file Coverage for `use-site-locate.hooks.ts` — the missing-folder card's Locate button. As with
 * `use-site-power.hooks.test.ts`, the hook itself needs a React renderer this package does not have,
 * so its one decision (`performLocate`) is a plain function tested directly, and the card's use of
 * it is held by `site-card-actions-wiring.test.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { performLocate } from './use-site-locate.hooks.js';
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

test('main\'s refusal comes back verbatim as the card\'s error', async () => {
  const result = await performLocate('/sites/x', {
    locateSite: async () => {
      throw new Error('/tmp/y is not a complete Tovu site (empty). Pick the folder that holds this website.');
    },
  });
  assert.deepEqual(result, { error: '/tmp/y is not a complete Tovu site (empty). Pick the folder that holds this website.' });
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
