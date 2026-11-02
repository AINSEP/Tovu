/**
 * @file `countRunningSites` run against the real function. Moved from `App.hooks.test.ts` with the
 * split; the inventory hooks are rendered in `use-sites-inventory.hooks.render.test.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { SiteRecord } from '../contracts/project.js';
import { countRunningSites } from './use-sites-inventory.hooks.js';

/** A `SiteRecord` stand-in: `countRunningSites` reads nothing but `status`. */
function siteWithStatus(status: SiteRecord['status']): SiteRecord {
  return { id: `/sites/${status}`, status } as unknown as SiteRecord;
}

test('countRunningSites counts running sites and nothing else', () => {
  const projects = (['running', 'starting', 'running', 'provisioning', 'blocked'] as const).map(siteWithStatus);
  assert.equal(countRunningSites(projects), 2);
  assert.equal(countRunningSites([]), 0);
});
