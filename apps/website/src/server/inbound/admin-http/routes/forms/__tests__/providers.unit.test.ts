import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createFormCollectionRegistry } from '@jini-ai/cms/forms';
import { registerAdminFormsProvidersRoute } from '../providers.js';
import { registerAdminFormsGetRoute } from '../get-by-id.js';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import express from 'express';
import type { FormsRouteDeps, FormsRouteRegistrar } from '../deps.js';
import { createCapturingResponse } from '#src/server/__tests__/helpers/http-test-server';
import { assertAdminResponse } from '#src/server/inbound/admin-http/http/__tests__/assert-admin-response';
import { createRouteDeps } from '#src/server/runtime/composition/app';

const BASE = '/api/admin/v1/workspaces/workspace-local';
function fixture(register: FormsRouteRegistrar, overrides: Record<string, unknown> = {}) {
  const deps: FormsRouteDeps = { ...createRouteDeps(), workspaceId: 'workspace-local', authorize: async () => ({ allowed: true, reason: 'fixture' }), ...overrides };
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: 'owner' }; next(); });
  register(app, deps);
  return { app, deps };
}

test('forms providers: authorization failures stay private', async () => {
  const { app } = fixture(registerAdminFormsProvidersRoute, { authorize: async () => { throw new Error('private credential'); } });
  assertAdminResponse({ actual: await dispatchJsonRequest(app, 'GET', `${BASE}/forms/_providers`), expected: { status: 500, body: { error: 'internal error', code: 'INTERNAL_ERROR' } } }, {
    failure: { message: 'The forms could not be loaded.', action: 'Try loading them again. If it still fails, copy details and report this problem.', step: 'Load forms' },
  });
});
test('forms providers: denied permission never reads provider settings', async () => {
  let reads = 0;
  const { app } = fixture(registerAdminFormsProvidersRoute, { authorize: async () => ({ allowed: false, reason: 'no_grant' }), formCollectionProviders: () => { reads++; return createFormCollectionRegistry({}); } });
  const response = await dispatchJsonRequest(app, 'GET', `${BASE}/forms/_providers`);
  assert.equal(response.status, 403);
  assert.equal((response.body as { code: string }).code, 'FORBIDDEN');
  assert.equal(reads, 0);
});
test('forms providers: workspace isolation precedes authorization', async () => {
  let calls = 0;
  const { app } = fixture(registerAdminFormsProvidersRoute, { authorize: async () => { calls++; return { allowed: true }; } });
  assert.deepEqual(await dispatchJsonRequest(app, 'GET', '/api/admin/v1/workspaces/other/forms/_providers'), { status: 404, body: { error: 'workspace was not found' } });
  assert.equal(calls, 0);
});
test('forms providers: missing workspace parameter remains isolated', async () => {
  let calls = 0;
  const { app } = fixture(registerAdminFormsProvidersRoute, { authorize: async () => { calls++; return { allowed: true }; } });
  const layer = (app as unknown as { _router: { stack: { route?: { stack: { handle: (req: unknown, res: unknown) => Promise<void> }[] } }[] } })._router.stack.find(item => item.route);
  const { res, capture } = createCapturingResponse();
  await layer!.route!.stack[0]!.handle({ params: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: 'workspace was not found' });
  assert.equal(calls, 0);
});



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
  const response = await dispatchJsonRequest(app, 'GET', `${BASE}/forms/_providers`);
  assert.equal(response.status, 200);
  const rows = (response.body as { data: Array<{ id: string; available: boolean; fields: unknown[] }> }).data;
  assert.deepEqual(rows.find(row => row.id === 'fourth_provider')?.fields, [{ key: 'public_url', label: 'Public URL', type: 'url' }]);
  assert.equal(rows.find(row => row.id === 'broken')?.available, false);
  assert.doesNotMatch(JSON.stringify(response.body), /private detail/);
});


test('provider discovery does not intercept an existing form named providers', async () => {
  const stored = { id: 'form-1', workspaceId: 'workspace-local', name: 'Providers', slug: 'providers', fields: [], status: 'active', notify: { enabled: false, recipients: [] }, createdAt: '2026-11-05T00:00:00Z', updatedAt: '2026-11-05T00:00:00Z', version: 1 };
  const { app } = fixture((app, deps) => { registerAdminFormsProvidersRoute(app, deps); registerAdminFormsGetRoute(app, deps); }, {
    formDefinitionRepo: { findBySlug: async ({ slug }: { slug: string }) => slug === stored.slug ? stored : null, findById: async () => null },
  });
  const form = await dispatchJsonRequest(app, 'GET', `${BASE}/forms/providers`);
  assert.equal(form.status, 200);
  assert.equal((form.body as { data: { slug: string } }).data.slug, 'providers');
  const discovery = await dispatchJsonRequest(app, 'GET', `${BASE}/forms/_providers`);
  assert.equal(discovery.status, 200);
  assert.ok(Array.isArray((discovery.body as { data: unknown }).data));
});
