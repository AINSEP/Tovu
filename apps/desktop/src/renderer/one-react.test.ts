/**
 * @file The renderer tests run a Jini package's hooks under plain node, so the renderer and Jini must
 * load one React whether Jini is linked or installed. See `scripts/one-react.ts`.
 */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('a Jini package and the renderer load the same React and react-dom', () => {
  const here = createRequire(import.meta.url);
  // The real path, because that is where node resolves a linked package's own imports from.
  const jiniUi = realpathSync(fileURLToPath(import.meta.resolve('@jini-ai/ui/site-card')));
  const fromJini = createRequire(jiniUi);
  for (const name of ['react', 'react-dom', 'react/jsx-runtime']) {
    assert.ok(here(name) === fromJini(name), `${name} loaded twice, so hooks would throw "Invalid hook call"`);
  }
});
