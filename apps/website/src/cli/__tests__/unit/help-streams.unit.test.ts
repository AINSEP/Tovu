import assert from 'node:assert/strict';
import test from 'node:test';
import type { Command } from 'commander';

import { printBareUsageAndExit, printUsageToStderr } from '../../help.js';

// Author Checklist: reject truncating help, swapping stdout/stderr, changing exit 0 to 1,
// or exiting in the stderr-only formatter. TestContext restores all process replacements.
// F2.5/F4.1: the formatter's promise is exact delivery to the right process stream.
const HELP = 'Usage: tovu [options] [command]\n\nCommands:\n  init <dir>\n  serve <dir>\n';
const program = { helpInformation: () => HELP } as Command;

test('bare usage writes complete help to stdout before exiting with zero', (t) => {
  const calls: unknown[] = [];
  const exited = new Error('captured process exit');
  t.mock.method(process.stdout, 'write', (chunk: unknown) => { calls.push(['stdout', chunk]); return true; });
  t.mock.method(process.stderr, 'write', (chunk: unknown) => { calls.push(['stderr', chunk]); return true; });
  t.mock.method(process, 'exit', (code: unknown) => { calls.push(['exit', code]); throw exited; });
  assert.throws(() => printBareUsageAndExit(program), (error) => error === exited);
  assert.deepEqual(calls, [['stdout', HELP], ['exit', 0]]);
});

test('unknown-command usage writes complete help only to stderr and does not exit', (t) => {
  const calls: unknown[] = [];
  t.mock.method(process.stdout, 'write', (chunk: unknown) => { calls.push(['stdout', chunk]); return true; });
  t.mock.method(process.stderr, 'write', (chunk: unknown) => { calls.push(['stderr', chunk]); return true; });
  t.mock.method(process, 'exit', (code: unknown) => { calls.push(['exit', code]); throw new Error('unexpected exit'); });
  printUsageToStderr(program);
  assert.deepEqual(calls, [['stderr', HELP]]);
});
