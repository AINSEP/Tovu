/** Native bridge boundary coverage alongside the real-pipe integration tests. */
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { MAX_INBOUND_LINE_BYTES, REVEAL_COMMANDS, resolveUserDataDir, revealPath, serveMcpOverStdio } from '../bin/mcp-bridge.ts';

test('bridge directory resolution trims inputs, gives argv precedence and rejects missing configuration', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tovu-bridge-config-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal(resolveUserDataDir(['--user-data-dir', ` ${dir} `], { TOVU_DESKTOP_USER_DATA_DIR: '/ignored' }), dir);
  assert.equal(resolveUserDataDir(['--user-data-dir'], { TOVU_DESKTOP_USER_DATA_DIR: dir }), dir);
  assert.equal(resolveUserDataDir([], { TOVU_DESKTOP_USER_DATA_DIR: ` ${dir} ` }), dir);
  assert.throws(() => resolveUserDataDir([], {}), /is required/);
  assert.throws(() => resolveUserDataDir(['--user-data-dir', '  '], { TOVU_DESKTOP_USER_DATA_DIR: dir }), /is required/);
  assert.throws(() => resolveUserDataDir(['--user-data-dir', path.join(dir, 'missing')], {}), /does not exist/);
});

test('file-manager commands preserve hostile folder names as a single argument on every supported OS', () => {
  const target = '/tmp/My Folder; echo "still one argument"';
  assert.deepEqual(REVEAL_COMMANDS.darwin!(target), ['open', ['-R', target]]);
  assert.deepEqual(REVEAL_COMMANDS.win32!(target), ['explorer.exe', [`/select,${target}`]]);
  assert.deepEqual(REVEAL_COMMANDS.linux!(target), ['xdg-open', [target]]);
});

test('native reveal waits for success and reports process failures without opening a file manager', async (t) => {
  const target = '/tmp/fixture folder';
  let child!: EventEmitter;
  const calls: unknown[] = [];
  t.mock.method(childProcess, 'spawn', ((command: string, args: string[], options: unknown) => {
    calls.push([command, args, options]);
    child = new EventEmitter();
    return child as childProcess.ChildProcess;
  }) as typeof childProcess.spawn);
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const expected = REVEAL_COMMANDS[process.platform];
  assert.ok(expected, 'this contract requires a supported desktop platform');
  const success = revealPath(target);
  child.emit('exit', 0);
  await success;
  assert.deepEqual(calls[0], [...expected(target), { stdio: 'ignore' }]);
  const nonzero = revealPath(target);
  child.emit('exit', 5);
  await assert.rejects(nonzero, /exited with code 5/);
  const failure = revealPath(target);
  child.emit('error', new Error('file manager missing'));
  await assert.rejects(failure, /could not run .*file manager missing/);
});

test('stdio drops oversized unfinished input, recovers framing and ignores blank lines and notifications', async (t) => {
  const input = new PassThrough();
  const output = new PassThrough();
  const diagnostics: string[] = [];
  t.mock.method(process.stderr, 'write', (chunk: string | Uint8Array) => { diagnostics.push(String(chunk)); return true; });
  t.after(() => { input.destroy(); output.destroy(); });
  let received = '';
  output.setEncoding('utf8');
  output.on('data', (chunk: string) => { received += chunk; });
  serveMcpOverStdio({
    input, output,
    context: { projectsPath: '/unused', revealPath: async () => assert.fail('tools/list has no reveal effect') },
  });
  input.write('x'.repeat(MAX_INBOUND_LINE_BYTES + 1));
  // Also split a valid request across chunks: newline framing must retain the partial prefix.
  input.write('\n  \n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0",');
  input.write('"id":7,"method":"tools/list"}\n');
  await new Promise<void>((resolve) => setImmediate(resolve));
  const responses = received.trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(responses.map((response) => response.id), [7]);
  assert.ok(responses[0].result.tools.some((tool: { name: string }) => tool.name === 'add_site_pointer'));
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0]!, /dropped .* buffered bytes/);
});
