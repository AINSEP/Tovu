import '../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp, createRouteDeps } from '../app.js';
import { bootAuthenticated, startTestServer } from '#src/server/__tests__/helpers/http-test-server';

for (const consentAudit of [undefined, true] as const) {
  test(`L058a public middleware preserves recovery gate and headers (consentAudit=${consentAudit})`, async t => {
    const deps = createRouteDeps();
    deps.siteStatusRepo = { get: async () => 'BLOCKED_PENDING_RECOVERY', set: async () => {} };
    const work: Promise<void>[] = [];
    const app = createApp(deps, { consentAudit, themeIdOverride: 'fixture-theme', onBootWork: pending => { work.push(pending); } });
    await Promise.all(work);
    const baseUrl = await startTestServer(app, t);
    const response = await fetch(`${baseUrl}/fixture-page`);
    assert.equal(response.status, 503);
    assert.equal((await response.json() as { code: string }).code, 'SITE_BLOCKED_PENDING_RECOVERY');
    const health = await fetch(`${baseUrl}/healthz`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  });
}

test('L058a BYOK boot pass is still tracked when admin assistant routes are off', async () => {
  const deps = createRouteDeps();
  deps.adminAssistantEnabled = false;
  const work: Promise<void>[] = [];
  createApp(deps, { onBootWork: pending => { work.push(pending); } });
  assert.equal(work.length, 1);
  await Promise.all(work);
});

for (const enabled of [true, false]) {
  test(`L058a assistant flag=${enabled} gates all chat routes but leaves settings mounted`, async t => {
    const deps = createRouteDeps();
    deps.adminAssistantEnabled = enabled;
    const work: Promise<void>[] = [];
    const app = createApp(deps, { onBootWork: pending => { work.push(pending); } });
    await Promise.all(work);
    const { baseUrl, cookie } = await bootAuthenticated(app, t);
    for (const endpoint of ['/api/runs', '/api/assistant/chats']) {
      const response = await fetch(`${baseUrl}${endpoint}`);
      assert.equal(response.status, enabled ? 401 : 404);
      await response.text();
    }
    for (const endpoint of ['byok-turn', 'ag-ui-run']) {
      const response = await fetch(`${baseUrl}/api/admin/v1/assistant/${endpoint}`, {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}',
      });
      assert.equal(response.status, enabled ? 400 : 404);
      await response.text();
    }
    const settings = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/assistant/settings`, { headers: { cookie } });
    assert.equal(settings.status, 200);
    assert.equal((await settings.json() as { adminAssistantEnabled: boolean }).adminAssistantEnabled, enabled);
  });
}
