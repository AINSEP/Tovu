import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { installDesktopHooks } from '../prepare-desktop-hooks.mjs';
const repoRoot = path.resolve('/fixture/tovu');
test('prepare installs the desktop hook path once and then leaves it alone', () => {
  let hooksPath = '', writes = 0;
  const runGit = ({ args }) => {
    if (args[0] === 'rev-parse') return { status: 0, stdout: repoRoot };
    if (args.includes('--get')) return { status: hooksPath ? 0 : 1, stdout: hooksPath };
    assert.deepEqual(args, ['config', '--local', 'core.hooksPath', 'apps/desktop/scripts/hooks']);
    writes++; hooksPath = args.at(-1); return { status: 0, stdout: '' };
  };
  assert.equal(installDesktopHooks({ repoRoot }, { env: {}, runGit }), 'installed');
  assert.equal(installDesktopHooks({ repoRoot }, { env: {}, runGit }), 'already-installed');
  assert.equal(writes, 1);
});
test('prepare skips CI, archive installs and nested non-checkout directories', () => {
  assert.equal(installDesktopHooks({ repoRoot }, { env: { CI: 'true' }, runGit: () => { throw new Error('must not call git'); } }), 'ci');
  for (const result of [{ status: 128, stdout: '' }, { status: 0, stdout: path.dirname(repoRoot) }]) {
    const calls = [];
    assert.equal(installDesktopHooks({ repoRoot }, { env: {}, runGit: ({ args }) => { calls.push(args); return result; } }), 'not-checkout');
    assert.equal(calls.length, 1);
  }
});
test('prepare surfaces a failed config write', () => {
  const runGit = ({ args }) => args[0] === 'rev-parse' ? { status: 0, stdout: repoRoot } : { status: 1, stdout: '' };
  assert.throws(() => installDesktopHooks({ repoRoot }, { env: {}, runGit }), /Could not install/);
});
