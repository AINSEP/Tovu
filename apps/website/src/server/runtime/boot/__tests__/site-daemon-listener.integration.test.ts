import '../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { requireToolExecutionCaller } from '@jini-ai/daemon/http';
import { createDaemonCoreClient } from '../../../inbound/assistant/agent-daemon-core-client.js';
import { createAgentDaemonCoreDeps } from '../../composition/agent-daemon-core-deps.js';
import { startSiteDaemonListener } from '../site-daemon-listener.js';

for (const publicOrigin of ['http://192.168.1.20:4200', 'https://[2001:db8::20]:4200']) {
  test(`chat can reach authenticated retained state when the site listens on ${publicOrigin}`, async () => {
    const app = express();
    const token = 'site-private-test';
    const gate = requireToolExecutionCaller({}, { tokenEnvVar: 'PRIVATE_SITE_TOKEN', env: { PRIVATE_SITE_TOKEN: token } });
    app.post('/internal/agent-daemon-core', gate, express.json(), (_req, res) => res.json({ value: {
      workspaceId: 'site-a', ownerPrincipalId: 'owner', siteBinding: { dir: '/sites/a', name: 'a' },
      siteStoragePaths: { contentDbPath: '/sites/a/content.db', mediaUploadsDir: '/sites/a/uploads', chatAttachmentsDir: '/sites/a/attachments' },
      traceEnabled: false, traceCapture: 'off',
    } }));
    app.get('/admin/private', (_req, res) => res.send('private admin'));
    const listener = await startSiteDaemonListener({ publicOrigin, handler: app }, {});
    try {
      assert.equal(new URL(listener.origin).hostname, '127.0.0.1');
      assert.equal(new URL(listener.origin).protocol, 'http:');
      assert.notEqual(listener.origin, publicOrigin);
      const client = createDaemonCoreClient({ baseUrl: listener.origin, token }, {});
      assert.equal((await client.bootstrap()).workspaceId, 'site-a');
      const retained = await createAgentDaemonCoreDeps({ token, env: { TOVU_DB: 'memory',
        TOVU_SITE_LISTENER_ORIGIN: publicOrigin, TOVU_SITE_CALLBACK_ORIGIN: listener.origin,
      } });
      await retained.close();
      const refusedHeaders: Record<string, string>[] = [{}, { authorization: 'Bearer wrong' }, { authorization: `Bearer ${token}`, origin: publicOrigin }];
      for (const headers of refusedHeaders) {
        const denied = await fetch(`${listener.origin}/internal/agent-daemon-core`, { method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' }, body: '{malformed',
        });
        assert.ok([401, 403].includes(denied.status), 'authentication precedes parsing and browser origins stay refused');
        await denied.body?.cancel();
      }
      const other = await fetch(`${listener.origin}/admin/private`);
      assert.equal(other.status, 404); await other.body?.cancel();
    } finally { await listener.close(); await listener.close(); }
  });
}

test('a loopback-bound site reuses its existing callback listener', async () => {
  for (const publicOrigin of ['http://127.0.0.1:4200', 'https://localhost:4200', 'http://[::1]:4200']) {
    const listener = await startSiteDaemonListener({ publicOrigin, handler: () => assert.fail('no second socket is needed') });
    assert.equal(listener.origin, publicOrigin);
    await listener.close();
  }
});
