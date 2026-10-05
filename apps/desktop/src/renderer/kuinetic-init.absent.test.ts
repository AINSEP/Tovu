/**
 * @file The other half of `kuinetic-init.test.ts`: with no kuinetic defined (the vendored script
 * failed to load), the bootstrap must do nothing rather than throw and break the page.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const scope = globalThis as { window?: unknown };
// A URL, not a literal specifier: the plain `.js` has no type declarations to resolve.
const initScript = new URL('./public/kuinetic-init.js', import.meta.url).href;

test('does nothing, without throwing, when the vendored script did not define kuinetic', async () => {
  scope.window = {};
  try {
    await assert.doesNotReject(import(initScript));
  } finally {
    delete scope.window;
  }
});
