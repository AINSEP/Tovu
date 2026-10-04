/** Contract checks for Tovu's native ports, which injected Jini-only fakes cannot exercise. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createMacOnDeviceTranscriptionPort } from './mac-on-device-transcriber.ts';
import { buildDefaultPort, registerSpeechIpc, IPC_CHANNEL_IS_AVAILABLE, IPC_CHANNEL_TRANSCRIBE } from './speech-ipc.ts';

test('the native speech adapter passes WAV bytes and locale to its helper and removes scratch audio',
  { skip: process.platform === 'win32' }, async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tovu-native-speech-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const binaryPath = path.join(dir, 'helper');
    const tracePath = path.join(dir, 'trace.json');
    // A controlled executable speaks the helper protocol; no Swift build or OS recognition runs.
    fs.writeFileSync(binaryPath, `#!/usr/bin/env node
const fs = require('node:fs');
const [command, ...args] = process.argv.slice(2);
if (command === 'check') {
  if (args[0] !== 'en-US') process.exit(2);
  process.stdout.write(JSON.stringify({ available: true, reason: null }));
} else if (command === 'transcribe') {
  fs.writeFileSync(${JSON.stringify(tracePath)}, JSON.stringify({ args, bytes: [...fs.readFileSync(args[0])] }));
  process.stdout.write(JSON.stringify({ ok: true, text: 'adapter fixture', elapsedMs: 7 }));
} else process.exit(3);
`, { mode: 0o700 });
    // Leave fs, execFile, source resolution, temp naming and locale on their production paths.
    const port = buildDefaultPort({ platform: 'darwin' }, { binaryPath });
    assert.deepEqual(await port.isAvailable(), { available: true, reason: undefined });
    const wavBuffer = Buffer.from([82, 73, 70, 70, 0, 255]);
    assert.deepEqual(await port.transcribe({ wavBuffer }), { text: 'adapter fixture', elapsedMs: 7 });
    const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8')) as { args: string[]; bytes: number[] };
    assert.deepEqual(trace.bytes, [...wavBuffer]);
    assert.equal(trace.args[1], 'en-US');
    assert.match(path.basename(trace.args[0]!), /^tovu-speech-.*\.wav$/);
    assert.equal(path.dirname(trace.args[0]!), os.tmpdir());
    assert.equal(fs.existsSync(trace.args[0]!), false, 'scratch recording must be removed');
  });

test('a cold native adapter creates its cache and reports compiler failure without recognition', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tovu-native-cache-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const binaryPath = path.join(dir, 'nested', 'helper');
  const sourcePath = path.join(dir, 'source.swift');
  const calls: unknown[] = [];
  const compilerFailure = Object.assign(new Error('compiler fixture'), { code: 'ENOENT' });
  // Support both published compiler-port shapes without ever invoking swiftc.
  const port = createMacOnDeviceTranscriptionPort({}, {
    binaryPath, sourcePath,
    spawnSync: ({ command, args }) => {
      calls.push([command, args]);
      return { status: null, error: compilerFailure };
    },
    execFileAsync: async ({ file, args }) => {
      calls.push([file, args]);
      throw compilerFailure;
    },
  });
  assert.deepEqual(await port.isAvailable(), { available: false, reason: 'swiftc-not-found: no Swift toolchain on this machine' });
  assert.deepEqual(calls, [['swiftc', ['-O', sourcePath, '-o', binaryPath]]]);
  assert.equal(fs.statSync(path.dirname(binaryPath)).isDirectory(), true);
  assert.equal(fs.existsSync(binaryPath), false);
});

test('unsupported default speech remains unavailable and IPC disposal removes both native channels', async () => {
  const port = buildDefaultPort({ platform: 'linux' });
  assert.deepEqual(await port.isAvailable(), { available: false, reason: 'unsupported-platform:linux' });
  const registered: string[] = [];
  const removed: string[] = [];
  const dispose = registerSpeechIpc({
    ipcMain: { handle: (channel) => { registered.push(channel); }, removeHandler: (channel) => { removed.push(channel); } },
    isTrustedSender: () => true,
  }, { port });
  dispose();
  assert.deepEqual(registered, [IPC_CHANNEL_IS_AVAILABLE, IPC_CHANNEL_TRANSCRIBE]);
  assert.deepEqual(removed, registered);
});
