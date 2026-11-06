/** The renderer test hook must resolve React without recursively entering its own resolver. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const desktop = new URL('../', import.meta.url);
test('the renderer loader imports React and its renderer entrypoints on Node 24', () => {
  const result = spawnSync(process.execPath, ['--import', './scripts/one-react.ts', '--input-type=module', '-e', `
    import React from 'react';
    import { jsx } from 'react/jsx-runtime';
    import { createRoot } from 'react-dom/client';
    import { renderToStaticMarkup } from 'react-dom/server';
    if (typeof createRoot !== 'function') throw new Error('missing client renderer');
    console.log(renderToStaticMarkup(jsx('p', { children: React.version })));
  `], { cwd: desktop, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^<p>19\./);
});
