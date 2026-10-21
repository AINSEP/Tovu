/** @file Consent 1b: all HTTP contracts, authorization, tenant isolation and safe failures. */
import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { registerAdminConsentRoutes } from '../routes.js';
import { consentFixture } from '#src/features/consent/__tests__/fixture';
import { startTestServer, loginAsBarePrincipal, bootAuthenticated, createCapturingResponse } from '#src/server/__tests__/helpers/http-test-server';
import { lastRouteHandler } from '#src/server/__tests__/helpers/last-route-handler';
import { createApp, createRouteDeps } from '#src/server/runtime/composition/app';

const cases = [
  { method: 'GET', path: 'settings' },
  { method: 'GET', path: 'readiness' },
  { method: 'POST', path: 'dry-run' },
  { method: 'POST', path: 'preview' },
  { method: 'PUT', path: 'settings' },
  { method: 'POST', path: 'publish' },
];

for (const route of cases) test(`${route.method} consent/${route.path}: permission, workspace and storage failures`, async t => {
  const f = consentFixture({ t });
  const app = express(); app.use(express.json());
  // Authentication itself is exercised through the real composed gate below.
  app.use((_req, res, next) => { res.locals.principal = { id: 'owner' }; next(); });
  registerAdminConsentRoutes({ app, deps: { workspaceId: 'ws', authorize: f.ports.authorize }, service: f.service });
  const base = await startTestServer(app, t);
  const body = route.path === 'publish' ? { draftId: 'revision-1', expectedPublishedId: null } : route.method === 'PUT' ? { config: f.config, expectedDraftId: null } : {};
  const request = (workspace = 'ws', payload = body) => fetch(`${base}/api/admin/v1/workspaces/${workspace}/consent/${route.path}`, { method: route.method, ...(route.method === 'GET' ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }) });
  assert.equal((await request('foreign')).status, 404);
  if (route.path === 'publish') await f.service.saveDraft({ principalId: 'owner', config: f.config, expectedDraftId: null });
  assert.equal((await request()).status, 200);
  if (route.method === 'PUT') assert.equal((await request()).status, 409);
  if (route.method !== 'GET') assert.equal((await request('ws', { ...body, confirm: true } as typeof body)).status, 400);
  f.ports.store = undefined;
  assert.equal((await request()).status, 503);
  f.deny();
  assert.equal((await request()).status, 403);
});

test('all consent routes reject anonymous sessions and principals with no grants at the real admin gate', async t => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const bare = await loginAsBarePrincipal(deps, baseUrl);
  for (const route of cases) {
    const url = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/consent/${route.path}`;
    const body = route.method === 'GET' ? {} : { headers: { 'content-type': 'application/json' }, body: '{}' };
    assert.equal((await fetch(url, { method: route.method, ...body })).status, 401);
    assert.equal((await fetch(url, { method: route.method, ...body, headers: { ...('headers' in body ? body.headers : {}), cookie: bare } })).status, 403);
  }
});

test('dry-run accepts a candidate without persisting; unknown fields and missing tokens are rejected', async t => {
  const f = consentFixture({ t }); const app = express(); app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: 'owner' }; next(); });
  registerAdminConsentRoutes({ app, deps: { workspaceId: 'ws', authorize: f.ports.authorize }, service: f.service });
  const base = await startTestServer(app, t);
  const send = (suffix: string, method: string, value: unknown) => fetch(`${base}/api/admin/v1/workspaces/ws/consent/${suffix}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
  const dryRun = await send('dry-run', 'POST', { config: f.config, path: '/' });
  assert.equal(dryRun.status, 200); assert.equal((await dryRun.json()).ready, true);
  assert.deepEqual(await f.store.read({}), { draft: null, published: null });
  for (const value of [null, [], { config: f.config }, { config: { ...f.config, enabled: 'true' }, expectedDraftId: null }, { config: f.config, expectedDraftId: null, workspaceId: 'other' }]) assert.equal((await send('settings', 'PUT', value)).status, 400);
  assert.equal((await fetch(`${base}/api/admin/v1/workspaces/ws/consent/readiness?path=/&path=/privacy`)).status, 400);
});

/** A route mounted with an always-allow gate, so the service's own permission re-check is what decides. */
async function serviceGatedApp(t: import('node:test').TestContext) {
  const f = consentFixture({ t }); const app = express(); app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: 'owner' }; next(); });
  registerAdminConsentRoutes({ app, deps: { workspaceId: 'ws', authorize: async () => ({ allowed: true, reason: 'matched' }) }, service: f.service });
  const base = await startTestServer(app, t);
  const send = (suffix: string, method: string, value?: unknown) => fetch(`${base}/api/admin/v1/workspaces/ws/consent/${suffix}`, value === undefined ? { method } : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
  return { f, send };
}

test('a permission revoked between the route gate and the service re-check is a fixed 403, not a 503', async t => {
  const { f, send } = await serviceGatedApp(t);
  f.deny();
  const res = await send('settings', 'GET');
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { code: 'FORBIDDEN', error: 'Permission to access cookie consent was denied.' });
  assert.deepEqual(f.calls, ['settings.read']);
});

test('dry-run and preview refuse a non-string path; preview renders a supplied candidate config for a real path', async t => {
  const { f, send } = await serviceGatedApp(t);
  for (const suffix of ['dry-run', 'preview']) {
    const res = await send(suffix, 'POST', { path: 42 });
    assert.equal(res.status, 400, suffix);
    assert.deepEqual(await res.json(), { code: 'CONSENT_VALIDATION_FAILED', error: 'path must be one local page path.' }, suffix);
  }
  const preview = await send('preview', 'POST', { path: '/', config: f.config });
  assert.equal(preview.status, 200);
  assert.deepEqual(await f.store.read({}), { draft: null, published: null });
});

test('publish without a draft id is a 400 naming the missing draft, and nothing is published', async t => {
  const { f, send } = await serviceGatedApp(t);
  const res = await send('publish', 'POST', { draftId: null, expectedPublishedId: null });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { code: 'CONSENT_VALIDATION_FAILED', error: 'draftId must name a saved draft.' });
  assert.deepEqual(await f.store.read({}), { draft: null, published: null });
});

test('a hand-built request with no :workspaceId is 404 before authorization (direct invoke)', async t => {
  const f = consentFixture({ t }); const app = express();
  let authorized = 0;
  registerAdminConsentRoutes({ app, deps: { workspaceId: 'ws', authorize: async () => { authorized++; return { allowed: true, reason: 'matched' }; } }, service: f.service });
  const handler = lastRouteHandler(app, 'get', '/api/admin/v1/workspaces/:workspaceId/consent/settings');
  const { res, capture } = createCapturingResponse();
  const headers: Record<string, string> = {};
  Object.assign(res, { set: (name: string, value: string) => { headers[name] = value; return res; } });
  await handler({ params: {} }, res);
  assert.equal(headers['Cache-Control'], 'no-store');
  assert.deepEqual({ statusCode: capture.statusCode, jsonBody: capture.jsonBody }, { statusCode: 404, jsonBody: { error: 'workspace was not found' } });
  assert.equal(authorized, 0);
});
