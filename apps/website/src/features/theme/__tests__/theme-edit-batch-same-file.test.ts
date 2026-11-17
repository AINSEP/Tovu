import assert from 'node:assert/strict';
import test from 'node:test';
import { batchOutcomeFor, type ToolExecutionContext, type ToolRegistration } from '@jini-ai/core';
import { protectThemeFileTools } from '../file-mutation-tools.js';
import { readThemeFile, writeThemeFile } from '../theme-files.js';
import { edit, themeBatchFixture, type ThemeBatchFixture } from './theme-batch-fixture.js';

/**
 * @file Items of one `theme_edit_file` call that edit the same file apply in order, each pinned to the version
 * the call's own previous write committed, never to a re-read. A foreign writer is refused in every window.
 */

const STALE = 'This theme file changed after it was read. Read it again and retry; this change was not applied.';
const SKIPPED = 'Skipped: an earlier change to this file in the same call failed.';
const FOREIGN = 'foreign bytes';

type Result = { batch: true; total: number; results: Array<{ index: number; ok: boolean; error?: string }> };
const run = async (f: ThemeBatchFixture, items: unknown[]) => await f.run('theme_edit_file', { items }) as Result;

test('two and three edits to one file all apply in order, equal the sequential result, and complete', async t => {
  const two = themeBatchFixture(t, { files: { 'p.css': 'a b c' } });
  const result = await run(two, [edit('p.css', 'a', 'A'), edit('p.css', 'b', 'B')]);
  assert.deepEqual(result.results.map(item => item.ok), [true, true]);
  assert.equal(two.read('p.css'), 'A B c');
  assert.equal(batchOutcomeFor({ output: result }), 'completed');
  const three = themeBatchFixture(t, { files: { 'p.css': 'a b c' } });
  const all = await run(three, [edit('p.css', 'a', 'A'), edit('p.css', 'b', 'B'), edit('p.css', 'c', 'C')]);
  assert.equal(batchOutcomeFor({ output: all }), 'completed');
  assert.equal(three.read('p.css'), 'A B C');
});

test('edits to P, Q, P all apply: different files never share a pin', async t => {
  const f = themeBatchFixture(t, { files: { 'p.css': 'a b', 'q.css': 'x' } });
  const result = await run(f, [edit('p.css', 'a', 'A'), edit('q.css', 'x', 'X'), edit('p.css', 'b', 'B')]);
  assert.equal(batchOutcomeFor({ output: result }), 'completed');
  assert.deepEqual([f.read('p.css'), f.read('q.css')], ['A B', 'X']);
});

test('an edit whose old text exists only after the previous edit is applied (order, not just the pin)', async t => {
  const f = themeBatchFixture(t, { files: { 'p.css': 'one' } });
  const result = await run(f, [edit('p.css', 'one', 'two'), edit('p.css', 'two', 'three')]);
  assert.equal(batchOutcomeFor({ output: result }), 'completed');
  assert.equal(f.read('p.css'), 'three');
});

/** A fake of the inner tool handler that does what `theme_edit_file` does (read, replace, write), with a hook per item. */
function chainedFixture(t: test.TestContext, { files, hooks }: { files: Record<string, string>; hooks: { before?: (index: number) => void; after?: (index: number) => void } }) {
  const f = themeBatchFixture(t, { files });
  let index = 0;
  const real = f.unbatched.find(r => r.descriptor.id === 'theme_edit_file')!;
  const inner: ToolRegistration = { ...real, handler: async ctx => {
    const own = index++;
    hooks.before?.(own);
    const { path: relativePath, oldString, newString } = ctx.input as { path: string; oldString: string; newString: string };
    const file = { themeDir: f.themeDir, themesRoot: f.root, relativePath };
    writeThemeFile({ ...file, content: readThemeFile(file).replace(oldString, newString) });
    hooks.after?.(own);
    return { ok: true };
  } };
  const [protectedEdit] = protectThemeFileTools({ registrations: [inner], deps: f.deps, catalog: new Map() });
  const call = async (items: unknown[]): Promise<Result> => {
    const ctx: ToolExecutionContext = { executionId: 'exec', run: { id: 'run' }, principal: { id: 'owner' }, input: { items }, signal: new AbortController().signal };
    return await protectedEdit!.handler(ctx, {}) as Result;
  };
  return { f, call };
}

test('a foreign write right after item 1 committed: item 2 is refused as stale, item 1 stays applied, the foreign bytes survive', async t => {
  const { f, call } = chainedFixture(t, { files: { 'p.css': 'a b' }, hooks: { after: i => { if (i === 0) f.write('p.css', FOREIGN); } } });
  const result = await call([edit('p.css', 'a', 'A'), edit('p.css', 'b', 'B')]);
  assert.deepEqual(result.results, [{ index: 0, ok: true, result: { ok: true } }, { index: 1, ok: false, error: STALE }]);
  assert.equal(batchOutcomeFor({ output: result }), 'partial_failure');
  assert.equal(f.read('p.css'), FOREIGN);
});

test('a foreign write after item 2 was pinned and before its write: item 2 is refused, nothing of the foreign write is lost', async t => {
  const { f, call } = chainedFixture(t, { files: { 'p.css': 'a b' }, hooks: { before: i => { if (i === 1) f.write('p.css', `${FOREIGN} b`); } } });
  const result = await call([edit('p.css', 'a', 'A'), edit('p.css', 'b', 'B')]);
  assert.deepEqual(result.results.map(item => [item.ok, item.error]), [[true, undefined], [false, STALE]]);
  assert.equal(f.read('p.css'), `${FOREIGN} b`);
});

test('a foreign write while item 2 prepares: item 1 refuses with the same sentence, item 2 is skipped, nothing is written', async t => {
  let authorizations = 0;
  const { f, call } = chainedFixture(t, { files: { 'p.css': 'a b' }, hooks: {} });
  const authorize = f.deps.authorize;
  f.deps.authorize = async (...args) => { authorizations++; if (authorizations === 2) f.write('p.css', FOREIGN); return authorize(...args); };
  const result = await call([edit('p.css', 'a', 'A'), edit('p.css', 'b', 'B')]);
  assert.deepEqual(result.results.map(item => [item.ok, item.error]), [[false, STALE], [false, SKIPPED]]);
  assert.equal(batchOutcomeFor({ output: result }), 'error');
  assert.equal(f.read('p.css'), FOREIGN);
});

test('when edit 1 fails (its old text is absent) a later edit to the same file is skipped with the exact sentence', async t => {
  const f = themeBatchFixture(t, { files: { 'p.css': 'a b' } });
  const result = await run(f, [edit('p.css', 'missing', 'x'), edit('p.css', 'b', 'B')]);
  assert.equal(result.results[0]!.ok, false);
  assert.deepEqual(result.results[1], { index: 1, ok: false, error: SKIPPED });
  assert.equal(f.read('p.css'), 'a b');
});

test('a byte-identical first write commits nothing, so the next edit runs against the unchanged pin', async t => {
  const f = themeBatchFixture(t, { files: { 'p.css': 'a b' } });
  const result = await run(f, [edit('p.css', 'a', 'a'), edit('p.css', 'b', 'B')]);
  assert.equal(batchOutcomeFor({ output: result }), 'completed');
  assert.equal(f.read('p.css'), 'a B');
});

test('a principal without the theme write permission is refused before any item runs', async t => {
  const f = themeBatchFixture(t, { files: { 'p.css': 'a b' } });
  f.deps.authorize = async () => ({ allowed: false, reason: 'denied' });
  await assert.rejects(run(f, [edit('p.css', 'a', 'A'), edit('p.css', 'b', 'B')]));
  assert.equal(f.read('p.css'), 'a b');
});

test('a single (non-batch) edit keeps its result shape', async t => {
  const f = themeBatchFixture(t, { files: { 'p.css': 'a b' } });
  const single = await f.run('theme_edit_file', edit('p.css', 'a', 'A')) as Record<string, unknown>;
  assert.deepEqual(Object.keys(single).sort(), ['bytesWritten', 'errors', 'occurrencesReplaced', 'path', 'status', 'theme', 'themeId']);
  assert.deepEqual([single.themeId, single.path, single.occurrencesReplaced, single.bytesWritten], ['copy', 'p.css', 1, 3]);
  assert.equal(f.read('p.css'), 'A b');
});
