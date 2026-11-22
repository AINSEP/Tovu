import assert from 'node:assert/strict';
import test from 'node:test';
import { edit, themeBatchFixture } from './theme-batch-fixture.js';

/**
 * @file The words for a theme file that changed after it was read. One sentence at both places that detect it
 * (the tool's own check before running, and the writer's check right before the rename), and no
 * "fix the input" note: retrying after a fresh read is exactly what helps.
 */

const STALE = 'This theme file changed after it was read. Read it again and retry; this change was not applied.';

test('a file changed after the tool read it is refused by the writer with the one sentence, undecorated', async t => {
  const f = themeBatchFixture(t, { files: { 'p.css': 'a b' } });
  const authorize = f.deps.authorize;
  let calls = 0;
  // Authorization call 1 is the preparation; call 2 is inside the handler, after the tool's own check passed.
  f.deps.authorize = async (...args) => { calls++; if (calls === 2) f.write('p.css', 'A foreign'); return authorize(...args); };
  await assert.rejects(f.run('theme_edit_file', edit('p.css', 'A', 'AA')), { message: STALE });
  assert.equal(f.read('p.css'), 'A foreign', 'the foreign bytes are not overwritten');
});
