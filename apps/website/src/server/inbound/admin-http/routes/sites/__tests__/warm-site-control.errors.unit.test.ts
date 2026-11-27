import { recordingComposedReporter } from "#src/server/__tests__/helpers/composed-reporter-probe";
import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import type { Express } from 'express';

const net = await import('@jini-ai/platform/net');
mock.module('@jini-ai/platform/net', { namedExports: { ...net, requestLoopbackHttp: async () => {
  throw new Error('boom tovu_ak_0123456789ab.SECRETSECRETSECRETSECRET');
} } });
const { registerWarmSiteControl } = await import('../warm-site-control.js');

test('warm site control reports one redacted incident without forwarding request data', async (t) => {
  const { reporter, records, reports } = recordingComposedReporter();
  let handler: ((req: unknown, res: unknown) => Promise<void>) | undefined;
  const app = { use: (_path: string, next: typeof handler) => { handler = next; } } as unknown as Express;
  const prefix = '/api/admin/v1/workspaces/ws/system/sites';
  registerWarmSiteControl({ app, workspaceId: 'ws', binding: { name: 'child', dir: '/sites/child', dirOverridden: false, switcherCompatible: true } }, {
    env: { TOVU_DEV_WARM_SITES: '1', TOVU_DEV_WARM_CONTROL_URL: 'http://localhost:3000', TOVU_DEV_WARM_CONTROL_WORKSPACE: 'host', TOVU_DISABLE_DEV_TLS: '1' },
  });
  assert.ok(handler, 'the control route is registered');
  let status = 0; let body: unknown;
  const res = { locals: { principal: { id: 'owner' }, failureReporter: reporter }, status(code: number) { status = code; return res; }, json(value: unknown) { body = value; return res; } };
  const errors = t.mock.method(console, 'error', () => {});
  const warnings = t.mock.method(console, 'warn', () => {});
  await handler({ originalUrl: prefix, method: 'POST', headers: { cookie: 'COOKIE_SHOULD_NEVER_LEAK' }, body: { secret: 'BODY_SHOULD_NEVER_LEAK' } }, res);
  assert.equal(status, 500);
  assert.ok(body && typeof body === 'object' && 'error' in body && 'errorId' in body);
  assert.match(String(body.error), /The dev site manager is unavailable/);
  assert.doesNotMatch(JSON.stringify(body), /SECRETSECRETSECRETSECRET|COOKIE_SHOULD_NEVER_LEAK|BODY_SHOULD_NEVER_LEAK/);
  assert.equal(records.length, 1);
  assert.equal(reports.length, 1);
  assert.equal(errors.mock.callCount(), 0);
  assert.equal(warnings.mock.callCount(), 0);
  const detail = (records[0]![1] as { meta: { errorId: string; diagnostic: string } }).meta;
  assert.equal(detail.errorId, body.errorId);
  assert.match(detail.diagnostic, /boom/);
  assert.match(detail.diagnostic, /warm-site-control\.errors\.unit\.test\.ts/);
  assert.doesNotMatch(detail.diagnostic, /SECRETSECRETSECRETSECRET|COOKIE_SHOULD_NEVER_LEAK|BODY_SHOULD_NEVER_LEAK/);
});

test('warm site control still replies with safe 503 copy if its failure reporter cannot be read', async t => {
  const warnings = t.mock.method(console, 'warn', () => {});
  let handler: ((req: unknown, res: unknown) => Promise<void>) | undefined;
  const app = { use: (_path: string, mounted: typeof handler) => { handler = mounted; } } as unknown as Express;
  const prefix = '/api/admin/v1/workspaces/ws/system/sites';
  registerWarmSiteControl({ app, workspaceId: 'ws', binding: { name: 'child', dir: '/sites/child', dirOverridden: false, switcherCompatible: true } }, {
    env: { TOVU_DEV_WARM_SITES: '1', TOVU_DEV_WARM_CONTROL_URL: 'http://localhost:3000', TOVU_DEV_WARM_CONTROL_WORKSPACE: 'host', TOVU_DISABLE_DEV_TLS: '1' },
  });
  assert.ok(handler, 'the control route is registered');
  const replies: Array<{ status: number; body: unknown }> = [];
  const res = {
    locals: { get failureReporter(): never { throw new Error('diagnostic adapter unavailable'); } },
    status(status: number) { return { json(body: unknown) { replies.push({ status, body }); } }; },
  };
  await handler({ originalUrl: prefix, method: 'GET', headers: {} }, res);
  assert.deepEqual(replies, [{ status: 503, body: { error: 'The dev site manager is unavailable. Return to the original dev server.' } }]);
  assert.deepEqual(warnings.mock.calls.map(call => call.arguments), [
    ['tovu dev: warm site management host is unavailable.', '[diagnostic unavailable]'],
  ]);
});
