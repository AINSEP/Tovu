import assert from 'node:assert/strict';
import test from 'node:test';
import { edit, themeBatchFixture } from './theme-batch-fixture.js';

/**
 * @file Was the pin of what a same-file `theme_edit_file` batch did before the chain: edit 2 was pinned to the
 * bytes read before edit 1 wrote, so it was refused as stale, the call threw that one sentence ('The theme file
 * changed during review. Read it again and retry; this file was not replaced.'), and only edit 1 was applied.
 * The chain changed exactly that: both edits apply. The other pins of this folder (single-call shape, foreign
 * writers, permission) are in `theme-edit-batch-same-file.test.ts`.
 */

test('two edits to one file in one call: both are applied in order and the call no longer throws', async t => {
  const f = themeBatchFixture(t, { files: { 'p.css': 'a b' } });
  const result = await f.run('theme_edit_file', { items: [edit('p.css', 'a', 'A'), edit('p.css', 'b', 'B')] }) as { batch: boolean; total: number };
  assert.equal(f.read('p.css'), 'A B', 'edit 1 and edit 2 applied');
  assert.deepEqual([result.batch, result.total], [true, 2]);
});
