import assert from 'node:assert/strict';
import test from 'node:test';
import { edit, themeBatchFixture } from './theme-batch-fixture.js';

/**
 * @file Pins what a same-file `theme_edit_file` batch does TODAY: the second item is pinned to the bytes read
 * before the first one wrote, so it is refused as stale, the call throws that one sentence, and the first
 * edit stays applied.
 */

test('two edits to one file in one call: edit 1 is on disk, edit 2 is not, and the call throws the stale words', async t => {
  const f = themeBatchFixture(t, { files: { 'p.css': 'a b' } });
  await assert.rejects(
    f.run('theme_edit_file', { items: [edit('p.css', 'a', 'A'), edit('p.css', 'b', 'B')] }),
    { message: 'The theme file changed during review. Read it again and retry; this file was not replaced.' },
  );
  assert.equal(f.read('p.css'), 'A b', 'edit 1 applied, edit 2 not');
});
