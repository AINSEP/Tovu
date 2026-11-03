import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess, Serializable } from 'node:child_process';
import express from 'express';
import { receiveNodeStartupSecrets } from '@jini-ai/sidecar/supervisor/node';
import { ensureToolExecToken, requireAgentDaemonToken } from '#src/assistant/daemon-access';
import { createRealDaemonProcessPorts } from '../daemon-supervisor.js';
import { STARTUP_SECRET_KEYS } from '../../boot/startup-secrets.js';

test('standalone chat authenticates with privately delivered capabilities and exports no host token to its CLI children', async () => {
  const before = process.env.TOVU_AGENT_DAEMON_TOKEN;
  process.env.TOVU_AGENT_DAEMON_TOKEN = 'standalone-proxy-secret';
  const toolToken = ensureToolExecToken({ env: {} }, {});
  class Peer extends EventEmitter {
    connected = true;
    other?: Peer;
    send(message: Serializable, callback: (error: Error | null) => void) {
      queueMicrotask(() => this.other?.emit('message', message)); callback(null); return true;
    }
  }
  const parent = Object.assign(new Peer(), { stdout: new PassThrough(), stderr: new PassThrough(), pid: 777 });
  const child = new Peer(); parent.other = child; child.other = parent;
  const app = express();
  app.use(requireAgentDaemonToken({ env: { TOVU_AGENT_DAEMON_TOKEN: 'standalone-proxy-secret' } }, {}));
  app.get('/private', (_request, response) => { response.sendStatus(200); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const ports = createRealDaemonProcessPorts({ workspaceId: 'site-a', siteDir: '/site/a', daemonPortOverride: '4329' }, {
      spawn(input) {
        for (const key of STARTUP_SECRET_KEYS) assert.equal(key in input.options.env!, false, key);
        assert.deepEqual(input.options.stdio, [process.platform === 'win32' ? 'pipe' : 'ignore', 'pipe', 'pipe', 'ipc']);
        return parent as unknown as ChildProcess;
      },
    });
    ports.spawnDaemonProcess();
    const credentials = await receiveNodeStartupSecrets({ peer: child });
    assert.deepEqual(credentials, {
      TOVU_AGENT_DAEMON_TOKEN: 'standalone-proxy-secret', TOVU_TOOL_EXEC_TOKEN: toolToken,
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/private`;
    assert.equal((await fetch(url, { headers: { authorization: `Bearer ${credentials.TOVU_AGENT_DAEMON_TOKEN}` } })).status, 200);
    assert.equal((await fetch(url)).status, 401);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    parent.emit('exit', 0, null); parent.stdout.destroy(); parent.stderr.destroy();
    if (before === undefined) delete process.env.TOVU_AGENT_DAEMON_TOKEN; else process.env.TOVU_AGENT_DAEMON_TOKEN = before;
  }
});
