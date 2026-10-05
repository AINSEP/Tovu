/**
 * @file Coverage for `public/kuinetic-init.js`, the two-line bootstrap index.html loads right after
 * the vendored kuinetic.js (kept as a file so the CSP needs no `'unsafe-inline'`).
 *
 * The real file is executed twice against a fake `window`: once with kuinetic defined (the observer
 * must start, with `observe: true`) and once without it (a missing vendor script must not throw
 * and break the page; see `kuinetic-init.absent.test.ts`). The file has no imports or exports, so
 * it loads as a module here. The two cases live in two files because each process evaluates the
 * module once, and the coverage report merges per file path, not per import URL.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const scope = globalThis as { window?: unknown };
// A URL, not a literal specifier: the plain `.js` has no type declarations to resolve.
const initScript = new URL('./public/kuinetic-init.js', import.meta.url).href;

test('starts the declarative attribute observer once kuinetic is loaded', async () => {
  const calls: unknown[] = [];
  let started = 0;
  scope.window = { kuinetic: { kuinetic: (options: unknown) => { calls.push(options); return { start: () => { started += 1; } }; } } };
  try {
    await import(initScript);
  } finally {
    delete scope.window;
  }
  assert.deepEqual(calls, [{ observe: true }]);
  assert.equal(started, 1);
});
