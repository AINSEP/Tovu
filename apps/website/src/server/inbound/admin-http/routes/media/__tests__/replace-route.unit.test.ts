import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Express } from 'express';
import { createCapturingResponse, extractRouteHandler } from '#src/server/__tests__/helpers/http-test-server';
import { WS } from '#src/server/__tests__/helpers/admin-route-failures';
import type { Deps } from '#src/server/__tests__/helpers/admin-route-failures';
import { registerAdminMediaReplaceRoute } from '../replace.js';
import { mediaApp } from './media-route-harness.js';

const ROUTE = '/api/admin/v1/workspaces/:workspaceId/media/:mediaId/replace';
const register = (app: Express, deps: Deps) => registerAdminMediaReplaceRoute({ app, deps });

test('media replace: a hand-built request with no params falls back to an empty workspace id and 404s', async () => {
  const { app } = mediaApp(register);
  const { res, capture } = createCapturingResponse();
  await extractRouteHandler(app, 'post', ROUTE)({ params: {} }, res);
  assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: 'workspace was not found' } });
});

test('media replace: a hand-built request with no media id authorizes and looks up the empty id', async () => {
  const calls: unknown[] = [];
  const { app } = mediaApp(register, { authorize: async (params) => { calls.push(params); return { allowed: true, reason: 'matched' }; } });
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: 'owner' };
  await extractRouteHandler(app, 'post', ROUTE)({ params: { workspaceId: WS } }, res);
  assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: "media '' was not found" } });
  assert.deepEqual(calls, [{ principalId: 'owner', permission: 'media.update', workspaceId: WS, entityType: 'media', entityId: '' }]);
});
