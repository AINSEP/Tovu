import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { registerAdminEntryCreateRoute } from '../create.js';
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

test('entries POST: permission revoked between the route gate and the write-service gate maps to 403 without writing', async () => {
  let checks = 0;
  let writes = 0;
  const { app } = fixture(registerAdminEntryCreateRoute, {
    authorize: async () => ({ allowed: ++checks === 1, reason: 'no_grant' }),
    entryRepo: { transaction: async () => { writes++; } },
  });
  const response = await dispatchJsonRequest(app, 'POST', '/api/admin/v1/entries', { type: 'recipe', slug: 'eggs', title: 'Eggs' });
  assert.deepEqual(response, { status: 403, body: { error: "principal 'owner' cannot create an entry (no_grant)", code: 'FORBIDDEN' } });
  assert.equal(checks, 2);
  assert.equal(writes, 0);
});

test('entries POST: a request with no body at all is a 400 naming the required strings, not a crash', async () => {
  const { app } = fixture(registerAdminEntryCreateRoute);
  assert.deepEqual(await dispatchJsonRequest(app, 'POST', '/api/admin/v1/entries'), {
    status: 400,
    body: { error: "'type', 'slug', and 'title' (strings) are required", code: 'VALIDATION_ERROR' },
  });
});

test('entries POST: a non-Error throw is a 500 with the generic message', async () => {
  const { app } = fixture(registerAdminEntryCreateRoute, { authorize: async () => { throw 'string failure'; } });
  assert.deepEqual(await dispatchJsonRequest(app, 'POST', '/api/admin/v1/entries', { type: 'recipe', slug: 'eggs', title: 'Eggs' }), {
    status: 500,
    body: { error: 'internal error', code: 'INTERNAL_ERROR' },
  });
});
