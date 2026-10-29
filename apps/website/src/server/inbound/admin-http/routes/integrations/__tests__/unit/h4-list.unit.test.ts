import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createCapturingResponse, extractRouteHandler } from '#src/server/__tests__/helpers/http-test-server';
import { portFake } from '#src/server/__tests__/helpers/port-fake';
import type { IntegrationsRouteDeps } from '../../deps.js';
import { registerAdminIntegrationsListRoute } from '../../list.js';

test('integration list handles equal timestamps and empty histories independently for each subscription', async () => {
  const app = express();
  const asked: unknown[] = [];
  const subscription = { id: 'first', label: 'First', targetUrl: 'https://hooks.example.com', topics: ['post.published'], status: 'active',
    secretVersion: 2, previousSecretVersion: 1, disabledAt: null, createdAt: '2026-10-01', updatedAt: '2026-10-02' };
  const delivery = { id: 'newest', createdAt: '2026-10-28', status: 'delivered', attempts: 2, lastResponseStatus: 204, lastError: null, deliveredAt: '2026-10-28' };
  registerAdminIntegrationsListRoute(app, portFake<IntegrationsRouteDeps>({ workspaceId: 'ws', authorize: async () => ({ allowed: true, reason: 'owner' }),
    webhookSubscriptionRepo: { listByWorkspace: async () => [subscription, { ...subscription, id: 'empty' }] },
    webhookDeliveryRepo: { listBySubscription: async (input: { subscriptionId: string }) => {
      asked.push(input);
      return input.subscriptionId === 'empty' ? [] : [{ ...delivery, id: 'old', createdAt: '2026-10-01' }, delivery, { ...delivery, id: 'tie' }];
    } },
  }));
  const { res, capture } = createCapturingResponse(); res.locals.principal = { id: 'owner' };
  await extractRouteHandler(app, 'get', '/api/admin/v1/workspaces/:workspaceId/integrations/subscriptions')({ params: { workspaceId: 'ws' } }, res);
  assert.deepEqual(capture, { statusCode: 200, jsonBody: { subscriptions: [
    { ...subscription, lastDelivery: delivery }, { ...subscription, id: 'empty', lastDelivery: null },
  ] } });
  assert.deepEqual(asked, [{ workspaceId: 'ws', subscriptionId: 'first', limit: 50 }, { workspaceId: 'ws', subscriptionId: 'empty', limit: 50 }]);
});
