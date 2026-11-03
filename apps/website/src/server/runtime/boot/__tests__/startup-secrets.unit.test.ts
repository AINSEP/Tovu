import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeStartupSecrets, startupSecretEnvironment, STARTUP_SECRET_KEYS } from '../startup-secrets.js';
import { ensureAgentDaemonToken, requireAgentDaemonToken } from '#src/assistant/daemon-access';
import express from 'express';
import { desktopRenderForHost } from '../../../../platform/headless-browser/desktop-render.js';
import { startRenderBridge } from '@jini-ai/desktop-host/render-bridge';

test('the site authenticates with its startup daemon token without exporting secrets to descendants', async () => {
  const prior = Object.fromEntries(STARTUP_SECRET_KEYS.map(key => [key, process.env[key]]));
  const priorRenderUrl = process.env.JINI_DESKTOP_RENDER_URL;
  const png = Buffer.from('captured-png');
  const bridge = await startRenderBridge({ capture: { async captureUrl() {
    return { png, finalUrl: 'http://127.0.0.1/', title: 'Private capture', status: 200,
      pageHeight: 1, capturedHeight: 1, blockedRequests: 0 };
  } } });
  process.env.TOVU_AGENT_DAEMON_TOKEN = 'startup-daemon-secret';
  process.env.TOVU_TOOL_EXEC_TOKEN = 'startup-tool-secret';
  Object.assign(process.env, bridge.env);
  try {
    await initializeStartupSecrets({}, {});
    for (const key of STARTUP_SECRET_KEYS) assert.equal(key in process.env, false, `${key} must be consumed`);
    assert.equal(ensureAgentDaemonToken({}, {}), 'startup-daemon-secret');
    const capture = desktopRenderForHost({ env: process.env });
    assert.ok(capture);
    const result = await capture.captureUrl({ url: 'http://127.0.0.1/', viewport: { width: 800, height: 600 }, fullPage: false,
      maxPageHeightPx: 4000, settleMs: 0 });
    assert.deepEqual(Buffer.from(result.png), png, 'the private token still authenticates native capture');
    assert.equal(startupSecretEnvironment({ env: {} }).TOVU_AGENT_DAEMON_TOKEN, undefined, 'an explicit scope never receives ambient authority');
    const app = express();
    app.use(requireAgentDaemonToken({}, {}));
    app.get('/private', (_req, res) => { res.sendStatus(200); });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const url = `http://127.0.0.1:${address.port}/private`;
      assert.equal((await fetch(url, { headers: { authorization: 'Bearer startup-daemon-secret' } })).status, 200);
      assert.equal((await fetch(url)).status, 401);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  } finally {
    bridge.close();
    if (priorRenderUrl === undefined) delete process.env.JINI_DESKTOP_RENDER_URL; else process.env.JINI_DESKTOP_RENDER_URL = priorRenderUrl;
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
