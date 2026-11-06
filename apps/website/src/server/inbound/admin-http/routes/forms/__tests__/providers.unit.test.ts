import assert from 'node:assert/strict';
import test from 'node:test';
import { createFormCollectionRegistry } from '@jini-ai/cms/forms';
import { registerAdminFormsProvidersRoute } from '../providers.js';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { BASE, fixture, testRouteFailureMatrix } from '#src/server/__tests__/helpers/admin-route-failures';

testRouteFailureMatrix([{ name: 'forms providers', register: registerAdminFormsProvidersRoute, method: 'GET', path: `${BASE}/forms/providers`, coded: true,
  failure: { message: 'The form operation could not be completed.', action: 'Check the result before repeating this operation. Copy details and report this problem.', step: 'form operation' } }]);

test('admin lists provider-owned settings and unavailable descriptions from its current registry', async () => {
  const providers = createFormCollectionRegistry({});
  providers.contribute({ pluginId: 'fourth', definition: { id: 'fourth_provider', provider: {
    describe: () => ({ label: 'Fourth provider', fields: [{ key: 'public_url', label: 'Public URL', type: 'url' }], answers: 'Remote inbox', validation: 'Remote validation', frameOrigins: [] }),
    plan: () => ({ kind: 'unavailable', code: 'provider_unavailable', message: 'Fixture only' }),
  } } });
  providers.contribute({ pluginId: 'broken', definition: { id: 'broken', provider: {
    describe: () => { throw new Error('private detail'); },
    plan: () => ({ kind: 'unavailable', code: 'provider_unavailable', message: 'Fixture only' }),
  } } });
  const { app } = fixture(registerAdminFormsProvidersRoute, { formCollectionProviders: () => providers });
  const response = await dispatchJsonRequest(app, 'GET', `${BASE}/forms/providers`);
  assert.equal(response.status, 200);
  const rows = (response.body as { data: Array<{ id: string; available: boolean; fields: unknown[] }> }).data;
  assert.deepEqual(rows.find(row => row.id === 'fourth_provider')?.fields, [{ key: 'public_url', label: 'Public URL', type: 'url' }]);
  assert.equal(rows.find(row => row.id === 'broken')?.available, false);
  assert.doesNotMatch(JSON.stringify(response.body), /private detail/);
});
