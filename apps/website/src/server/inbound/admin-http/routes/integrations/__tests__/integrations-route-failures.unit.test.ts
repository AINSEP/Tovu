import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { registerAdminIntegrationsDeliveriesRoute } from '../deliveries.js';
import { registerAdminIntegrationsListRoute } from '../list.js';
import { WS, BASE, fixture, testRouteFailureMatrix, type RouteFailureCase } from '#src/server/__tests__/helpers/admin-route-failures';

const routes: RouteFailureCase[] = [
  { name: 'integrations deliveries', register: registerAdminIntegrationsDeliveriesRoute, method: 'GET', path: `${BASE}/integrations/subscriptions/sub/deliveries` },
  { name: 'integrations list', register: registerAdminIntegrationsListRoute, method: 'GET', path: `${BASE}/integrations/subscriptions` },
];

testRouteFailureMatrix(routes);

test('integrations list chooses latest timestamps independent of repository order and handles empty delivery history', async () => {
  const subscription = { id: 'sub', label: 'Test', targetUrl: 'https://example.com', topics: ['post.published'], status: 'active', secretVersion: 1, previousSecretVersion: null,
    createdAt: '2026-10-01', updatedAt: '2026-10-01', disabledAt: null };
  const delivery = (id: string, createdAt: string) => ({ id, createdAt, status: 'delivered', attempts: 2, lastResponseStatus: 200, lastError: null, deliveredAt: createdAt });
  const newest = delivery('newest', '2026-10-19');
  const lookups: unknown[] = [];
  const { app } = fixture(registerAdminIntegrationsListRoute, {
    webhookSubscriptionRepo: { listByWorkspace: async () => [subscription, { ...subscription, id: 'empty' }] },
    webhookDeliveryRepo: { listBySubscription: async (input: { subscriptionId: string }) => {
      lookups.push(input); return input.subscriptionId === 'empty' ? [] : [delivery('first', '2026-10-02'), newest, delivery('older', '2026-10-01')];
    } },
  });
  assert.deepEqual(await dispatchJsonRequest(app, 'GET', `${BASE}/integrations/subscriptions`), {
    status: 200, body: { subscriptions: [{ ...subscription, lastDelivery: newest }, { ...subscription, id: 'empty', lastDelivery: null }] },
  });
  assert.deepEqual(lookups, [{ workspaceId: WS, subscriptionId: 'sub', limit: 50 }, { workspaceId: WS, subscriptionId: 'empty', limit: 50 }]);
});

for (const [query, limit] of [['', 50], ['?limit=Infinity', 50], ['?limit=0', 50], ['?limit=-1', 50], ['?limit=2.9', 2], ['?limit=999', 200]] as const) {
  test(`delivery log bounds the repository read ${query || '(default)'}`, async () => {
    let input: unknown;
    const { app } = fixture(registerAdminIntegrationsDeliveriesRoute, {
      webhookSubscriptionRepo: { findById: async () => ({ id: 'sub' }) },
      webhookDeliveryRepo: { listBySubscription: async (value: unknown) => { input = value; return []; } },
    });
    assert.deepEqual(await dispatchJsonRequest(app, 'GET', `${BASE}/integrations/subscriptions/sub/deliveries${query}`), { status: 200, body: { deliveries: [] } });
    assert.deepEqual(input, { workspaceId: WS, subscriptionId: 'sub', limit });
  });
}
