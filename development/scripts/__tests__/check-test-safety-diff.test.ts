import assert from 'node:assert/strict';
import test from 'node:test';

import { countUnsafeAsserts, findRegressions, parseNameStatus } from '../check-test-safety-diff.js';

/**
 * @file The rollout gate for the tsx assert-message hang (open-bugs 10-31): a failing message-less
 * `assert.ok` in a tsx-run test can pin a CPU for 20+ minutes. The lint config existed but nothing
 * ran it, so new hang risks landed freely. The gate compares each changed test file with its
 * merge-base copy: it may never gain a message-less assertion, while historical files stay green.
 */

const TEST_FILE = 'apps/website/src/features/example/__tests__/example.test.ts';
const HEADER = "import assert from 'node:assert/strict';\n";

function readers(head: Record<string, string>, base: Record<string, string>) {
  return {
    readHead: (path: string) => head[path] ?? '',
    readBase: (path: string) => base[path] ?? '',
  };
}

test('a test change that adds a message-less assert.ok is reported against its merge-base copy', () => {
  const files = parseNameStatus(`M\t${TEST_FILE}\n`);
  const regressions = findRegressions({
    files,
    ...readers({ [TEST_FILE]: `${HEADER}assert.ok(a, 'a exists');\nassert.ok(b);\n` }, { [TEST_FILE]: `${HEADER}assert.ok(a, 'a exists');\n` }),
  });
  assert.deepEqual(regressions, [{ file: TEST_FILE, before: 0, after: 1 }], 'the new message-less assert.ok must fail the gate');
});

test('a brand-new test file counts every message-less assertion as new', () => {
  const regressions = findRegressions({ files: parseNameStatus(`A\t${TEST_FILE}\n`), ...readers({ [TEST_FILE]: `${HEADER}assert(x);\nassert.strict.ok(y);\n` }, {}) });
  assert.deepEqual(regressions, [{ file: TEST_FILE, before: 0, after: 2 }], 'a new file has no historical allowance');
});

test('historical violations in a touched file pass while the count holds or shrinks', () => {
  const base = `${HEADER}assert.ok(a);\nassert.ok(b);\n`;
  const held = findRegressions({ files: parseNameStatus(`M\t${TEST_FILE}\n`), ...readers({ [TEST_FILE]: `${base}assert.equal(c, 1);\n` }, { [TEST_FILE]: base }) });
  const shrunk = findRegressions({ files: parseNameStatus(`M\t${TEST_FILE}\n`), ...readers({ [TEST_FILE]: `${HEADER}assert.ok(a);\n` }, { [TEST_FILE]: base }) });
  assert.deepEqual(held, [], 'an unchanged count is not a regression');
  assert.deepEqual(shrunk, [], 'a shrinking count is not a regression');
});

test('a renamed test file keeps the allowance of its source path', () => {
  const oldPath = 'apps/website/src/features/example/__tests__/old.test.ts';
  const files = parseNameStatus(`R091\t${oldPath}\t${TEST_FILE}\n`);
  assert.deepEqual(files, [{ path: TEST_FILE, basePath: oldPath }], 'a rename compares against the old path');
  const text = `${HEADER}assert.ok(a);\n`;
  assert.deepEqual(findRegressions({ files, ...readers({ [TEST_FILE]: text }, { [oldPath]: text }) }), [], 'a pure rename adds nothing');
});

test('files outside the tsx-run test roots and inline disables are handled by the shared config', () => {
  assert.equal(countUnsafeAsserts({ text: `${HEADER}assert.ok(a);\n`, file: 'apps/website/src/server/app.ts' }), 0, 'production source is out of scope');
  assert.equal(countUnsafeAsserts({ text: `${HEADER}assert.ok(a);\n`, file: 'apps/site-chat/src/chat/__tests__/chat.test.ts' }), 1, 'site-chat tests also run under tsx');
  const disabled = `${HEADER}// eslint-disable-next-line no-restricted-syntax\nassert.ok(a);\n`;
  assert.equal(countUnsafeAsserts({ text: disabled, file: TEST_FILE }), 1, 'an inline disable cannot hide a hang risk');
});
