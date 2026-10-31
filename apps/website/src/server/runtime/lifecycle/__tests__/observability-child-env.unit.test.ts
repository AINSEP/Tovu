import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { createRealDaemonProcessPorts } from '../daemon-supervisor.js';

// The website server already received the fact from Electron main. The supervisor refreshes env
// on each spawn; exercise that actual spawn boundary without starting an OS process or server.
test('daemon launches and respawns inherit the sanitized desktop packaging fact', () => {
  const original = process.env.TOVU_PACKAGED_DESKTOP;
  const seen: (string | undefined)[] = [];
  const ports = createRealDaemonProcessPorts({ workspaceId: 'telemetry-fixture', siteDir: '/fake/site', daemonPortOverride: undefined }, {
    spawn: ({ options }) => {
      seen.push(options?.env?.TOVU_PACKAGED_DESKTOP);
      return Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() }) as unknown as ChildProcess;
    },
  });
  try {
    for (const fact of ['1', '0', undefined]) {
      if (fact === undefined) delete process.env.TOVU_PACKAGED_DESKTOP;
      else process.env.TOVU_PACKAGED_DESKTOP = fact;
      ports.spawnDaemonProcess();
    }
    assert.deepEqual(seen, ['1', '0', undefined]);
  } finally {
    if (original === undefined) delete process.env.TOVU_PACKAGED_DESKTOP;
    else process.env.TOVU_PACKAGED_DESKTOP = original;
  }
});
