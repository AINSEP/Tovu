import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { registerAdminEntryLifecycleRoute } from '../lifecycle.js';
import { registerAdminEntryUpdateRoute } from '../update.js';
import { allowed, fixture, testRouteFailureMatrix, type RouteFailureCase } from '#src/server/__tests__/helpers/admin-route-failures';

const routes: RouteFailureCase[] = [
  { name: 'entries lifecycle', register: registerAdminEntryLifecycleRoute, method: 'POST', path: '/api/admin/v1/entries/e/lifecycle', body: { op: 'publish', expectedVersion: 1 }, coded: true },
  { name: 'entries update', register: registerAdminEntryUpdateRoute, method: 'PUT', path: '/api/admin/v1/entries/e', body: { expectedVersion: 1 }, coded: true },
];

testRouteFailureMatrix(routes);

for (const [register, method, path, body] of [
  [registerAdminEntryUpdateRoute, 'PUT', '/api/admin/v1/entries/e', { expectedVersion: 1 }],
  [registerAdminEntryLifecycleRoute, 'POST', '/api/admin/v1/entries/e/lifecycle', { op: 'publish', expectedVersion: 1 }],
] as const) {
  test(`entries ${method}: permission revoked between the route gate and the shared write gate maps to 403`, async () => {
    let checks = 0;
    let reads = 0;
    const { app } = fixture(register, {
      authorize: async () => ({ allowed: ++checks === 1, reason: 'no_grant' }),
      entryRepo: { findById: async () => { reads++; return null; } },
    });
    const response = await dispatchJsonRequest(app, method, path, body);
    assert.equal(response.status, 403);
    assert.deepEqual(response.body, { error: "principal 'owner' cannot modify entry 'e' (no_grant)", code: 'FORBIDDEN' });
    assert.equal(checks, 2);
    assert.equal(reads, 0);
  });
}
