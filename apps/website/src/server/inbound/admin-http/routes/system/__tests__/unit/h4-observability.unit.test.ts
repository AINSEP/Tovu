import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import type { Tracker } from '@jini-ai/diagnostics/observability';
import { createCapturingResponse, extractRouteHandler } from '#src/server/__tests__/helpers/http-test-server';
import { portFake } from '#src/server/__tests__/helpers/port-fake';
import { createNoopObservabilityPort } from '#src/platform/observability/index';
import { registerAdminObservabilityStatusRoute, type AdminObservabilityStatusDeps } from '../../observability-status.js';
import { registerAdminBrowserTelemetryRoute } from '../../browser-telemetry.js';

const ROOT = '/api/admin/v1/workspaces/:workspaceId/system';

for (const failure of [new Error('private exporter failure'), 'opaque exporter failure']) {
  test(`telemetry test sanitizes ${typeof failure} failure and reports it to the tracker`, async () => {
    const reports: unknown[][] = [];
    const app = express();
    registerAdminObservabilityStatusRoute(app, portFake<AdminObservabilityStatusDeps>({
      workspaceId: 'ws', authorize: async () => ({ allowed: true, reason: 'owner' }),
      sendTelemetryTest: async () => { throw failure; },
      tracker: { error: (...args: unknown[]) => { reports.push(args); } },
    }));
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: 'owner' };
    await extractRouteHandler(app, 'post', `${ROOT}/observability/test-error`)({ params: { workspaceId: 'ws' } }, res);
    assert.deepEqual(capture, { statusCode: 500, jsonBody: { error: 'internal error', code: 'INTERNAL_ERROR' } });
    assert.equal(reports.length, 1);
    const [{ error }, context] = reports[0] as [{ error: Error }, unknown];
    assert.equal(error.message, failure instanceof Error ? failure.message : 'telemetry test failed');
    assert.deepEqual(context, { context: { operation: 'telemetry.test_action' } });
  });
}

test('telemetry test without a bound sender is unavailable after authorization', async () => {
  const app = express();
  const permissions: string[] = [];
  registerAdminObservabilityStatusRoute(app, portFake<AdminObservabilityStatusDeps>({
    workspaceId: 'ws', authorize: async ({ permission }) => { permissions.push(permission); return { allowed: true, reason: 'owner' }; },
  }));
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: 'owner' };
  await extractRouteHandler(app, 'post', `${ROOT}/observability/test-error`)({ params: { workspaceId: 'ws' } }, res);
  assert.deepEqual(capture, { statusCode: 503, jsonBody: { error: 'telemetry test is unavailable' } });
  assert.deepEqual(permissions, ['system.write']);
});

test('observability read can succeed while test-error permission is denied', async () => {
  const app = express();
  registerAdminObservabilityStatusRoute(app, portFake<AdminObservabilityStatusDeps>({
    workspaceId: 'ws', observability: createNoopObservabilityPort({}),
    authorize: async ({ permission }) => ({ allowed: permission === 'system.read', reason: 'read-only' }),
    sendTelemetryTest: async () => assert.fail('a status read must never send a diagnostic'),
  }));
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: 'reader' };
  await extractRouteHandler(app, 'get', `${ROOT}/observability-status`)({ params: { workspaceId: 'ws' } }, res);
  assert.deepEqual(capture, { statusCode: 200, jsonBody: { enabled: false, serviceName: null, canSendTestError: false } });
});

test('browser telemetry answers a fixed 500 if its limiter rejects, without forwarding', async t => {
  t.mock.method(console, 'error', () => {});
  const app = express();
  registerAdminBrowserTelemetryRoute(app, {
    clock: { nowMs: () => 0, nowIso: () => '2026-10-28T00:00:00.000Z' },
    tracker: portFake<Tracker>({ capture: () => assert.fail('must not capture'), error: () => assert.fail('must not report') }),
  }, { check: async () => { throw new Error('private limiter failure'); } });
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: 'owner' };
  res.locals.authCredentialKind = 'session';
  await extractRouteHandler(app, 'post', '/api/admin/v1/telemetry')({ headers: {}, body: { type: 'pageview', route: '/admin' } }, res);
  assert.deepEqual(capture, { statusCode: 500, jsonBody: { error: 'internal error', code: 'INTERNAL_ERROR' } });
});
