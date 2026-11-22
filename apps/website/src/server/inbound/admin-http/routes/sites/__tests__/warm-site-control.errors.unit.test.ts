import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import type { Express } from 'express';

const net = await import('@jini-ai/platform/net');
mock.module('@jini-ai/platform/net', { namedExports: { ...net, requestLoopbackHttp: async () => {
  throw new Error('boom tovu_ak_0123456789ab.SECRETSECRETSECRETSECRET');
} } });
const { registerWarmSiteControl } = await import('../warm-site-control.js');

test('warm site control reports one redacted incident without forwarding request data', async (t) => {
  const logs: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logs.push(args); });
  let handler: ((req: unknown, res: unknown) => Promise<void>) | undefined;
  const app = { use: (_path: string, next: typeof handler) => { handler = next; } } as unknown as Express;
  const prefix = '/api/admin/v1/workspaces/ws/system/sites';
  registerWarmSiteControl({ app, workspaceId: 'ws', binding: { name: 'child', dir: '/sites/child', dirOverridden: false, switcherCompatible: true } }, {
    env: { TOVU_DEV_WARM_SITES: '1', TOVU_DEV_WARM_CONTROL_URL: 'http://localhost:3000', TOVU_DEV_WARM_CONTROL_WORKSPACE: 'host', TOVU_DISABLE_DEV_TLS: '1' },
  });
  assert.ok(handler, 'the control route is registered');
  let status = 0; let body: unknown;
  const res = { locals: { principal: { id: 'owner' } }, status(code: number) { status = code; return res; }, json(value: unknown) { body = value; return res; } };
  await handler({ originalUrl: prefix, method: 'POST', headers: { cookie: 'COOKIE_SHOULD_NEVER_LEAK' }, body: { secret: 'BODY_SHOULD_NEVER_LEAK' } }, res);
  assert.equal(status, 500);
  assert.ok(body && typeof body === 'object' && 'error' in body && 'errorId' in body);
  assert.match(String(body.error), /The dev site manager is unavailable/);
  assert.doesNotMatch(JSON.stringify(body), /SECRETSECRETSECRETSECRET|COOKIE_SHOULD_NEVER_LEAK|BODY_SHOULD_NEVER_LEAK/);
  const entry = logs.find(args => args[0] === '[warm-sites:control]'); assert.ok(entry);
  const detail = entry[1] as { errorId: string; diagnostic: string };
  assert.equal(detail.errorId, body.errorId);
  assert.match(detail.diagnostic, /boom/);
  assert.match(detail.diagnostic, /warm-site-control\.errors\.unit\.test\.ts/);
  assert.doesNotMatch(detail.diagnostic, /SECRETSECRETSECRETSECRET|COOKIE_SHOULD_NEVER_LEAK|BODY_SHOULD_NEVER_LEAK/);
});
