import assert from 'node:assert/strict';
import test from 'node:test';
import { forbidAdminImports } from '../../vite-public-guard';
import lazyConfig from '../../vite.lazy.config';

// Drive the actual loader hook used by the lazy build, rather than matching source strings.
test('lazy bundle uses the resolved-path admin import guard', () => {
  const plugins = lazyConfig.plugins as typeof forbidAdminImports[];
  const guard = plugins.find(plugin => plugin === forbidAdminImports);
  assert.ok(guard);
  const hook = guard.load;
  assert.equal(typeof hook, 'function');
  const load = hook as (id: string) => unknown;
  assert.throws(() => load('/repo/apps/admin/src/private.ts'), /must not ship admin internals/);
  assert.equal(load('/repo/apps/site-chat/src/loader-entry.ts'), null);
});
