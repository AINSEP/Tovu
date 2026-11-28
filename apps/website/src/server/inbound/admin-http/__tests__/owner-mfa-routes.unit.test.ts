import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { registerOwnerMfaRoutes } from '../owner-mfa-routes.js';
import type { RouteDeps } from '#src/server/routes/types';

// Driven through a real Express app over HTTP (not a hand-rolled req/res double), so the assertions
// hold for whatever writes the reply: the status, the JSON body and what was read before it.
function fixture(options: { caller?: string; kind?: string; allowed?: boolean; enrolled?: boolean } = {}) {
  const app = express();
  app.use(express.json());
  let factorReads = 0;
  const deps = { workspaceId: 'site', ownerPrincipalId: Promise.resolve('owner'), identityReady: Promise.resolve(),
    mfaStore: { factor: async () => { factorReads++; return options.enrolled ? { sealedSecret: 'never-return-this' } : null; } },
  } as unknown as RouteDeps;
  registerOwnerMfaRoutes({ errors: createRouteIncidentReporter().errors, app, deps,
    authenticate: async () => options.caller ? { principal: { id: options.caller }, kind: options.kind ?? 'session' } : null,
    limiter: { check: async () => ({ allowed: options.allowed ?? true, retryAfterSeconds: 60 }) },
  });
  async function invoke(path: string, origin?: string) {
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const response = await fetch(`${base}/api/admin/v1/auth/mfa${path}`, { method: path ? 'POST' : 'GET',
        headers: { 'content-type': 'application/json', origin: origin ?? base }, ...(path ? { body: '{}' } : {}) });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) as unknown : undefined };
    } finally { server.close(); }
  }
  return { invoke, factorReads: () => factorReads };
}

for (const options of [{}, { caller: 'staff' }, { caller: 'owner', kind: 'api_key' }]) {
  test(`MFA management denies non-owner session ${JSON.stringify(options)} before secret access`, async () => {
    const f = fixture(options);
    for (const action of ['/enroll', '/confirm', '/remove']) assert.equal((await f.invoke(action)).status, 403);
    assert.equal(f.factorReads(), 0);
    assert.deepEqual((await f.invoke('')).body, { isOwner: false, available: false, enrolled: false });
    assert.equal(f.factorReads(), 0);
  });
}

test('MFA routes reject another origin and excessive attempts before reading factors', async () => {
  const f = fixture({ caller: 'owner' });
  assert.equal((await f.invoke('/enroll', 'https://other.test')).status, 403);
  assert.equal(f.factorReads(), 0);
  const limited = fixture({ caller: 'owner', allowed: false });
  assert.equal((await limited.invoke('/remove')).status, 429);
  assert.equal(limited.factorReads(), 0);
});

test('owner status discloses enrollment without sealed factor or a challenge', async () => {
  const f = fixture({ caller: 'owner', enrolled: true });
  const response = await f.invoke('');
  assert.deepEqual(response.body, { isOwner: true, available: true, enrolled: true });
  assert.equal(f.factorReads(), 1);
  assert.ok(!JSON.stringify(response.body).includes('never-return-this'));
});

test('every MFA reply is no-store: origin 403, 429 with Retry-After, status 200 and the redacted 500', async () => {
  const app = express();
  app.use(express.json());
  let check = async () => ({ allowed: false, retryAfterSeconds: 42 });
  const deps = { workspaceId: 'site', ownerPrincipalId: Promise.resolve('owner'), identityReady: Promise.resolve(), mfaStore: { factor: async () => null } } as unknown as RouteDeps;
  registerOwnerMfaRoutes({ errors: createRouteIncidentReporter().errors, app, deps, authenticate: async () => ({ principal: { id: 'owner' }, kind: 'session' }),
    limiter: { check: () => check() } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (origin: string) => fetch(`${base}/api/admin/v1/auth/mfa/remove`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: '{}' });
  try {
    const foreign = await post('https://other.test');
    assert.equal(foreign.status, 403);
    assert.equal(foreign.headers.get('cache-control'), 'no-store');
    const limited = await post(base);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('cache-control'), 'no-store');
    assert.equal(limited.headers.get('retry-after'), '42');
    assert.equal(limited.headers.get('content-type'), 'application/json; charset=utf-8');
    const status = await fetch(`${base}/api/admin/v1/auth/mfa`);
    assert.equal(status.headers.get('cache-control'), 'no-store');
    check = async () => { throw new Error('limiter store password=hunter2'); };
    const failed = await post(base);
    const text = await failed.text();
    assert.equal(failed.status, 500);
    assert.equal(failed.headers.get('cache-control'), 'no-store');
    assert.equal((JSON.parse(text) as { code?: string }).code, 'MFA_UNAVAILABLE');
    assert.ok(!text.includes('hunter2'));
  } finally { server.close(); }
});

test('owner enrollment looks up the owner by the server-selected principal before the service runs', async () => {
  const app = express();
  app.use(express.json());
  const lookups: unknown[] = [];
  const deps = { workspaceId: 'site', ownerPrincipalId: Promise.resolve('owner'), identityReady: Promise.resolve(), mfaStore: { factor: async () => null },
    userRepo: { findByPrincipalId: async (input: unknown) => { lookups.push(input); return { username: 'site-owner' }; } },
  } as unknown as RouteDeps;
  registerOwnerMfaRoutes({ errors: createRouteIncidentReporter().errors, app, deps, authenticate: async () => ({ principal: { id: 'owner' }, kind: 'session' }),
    limiter: { check: async () => ({ allowed: true, retryAfterSeconds: 0 }) } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const enroll = await fetch(`${base}/api/admin/v1/auth/mfa/enroll`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ password: 'pw-a', principalId: 'someone-else' }) });
    const text = await enroll.text();
    assert.deepEqual(lookups, [{ workspaceId: 'site', principalId: 'owner', password: 'pw-a', code: '' }]);
    // This fixture has no password store, so the service then fails: the reply stays the redacted MFA failure.
    assert.equal(enroll.status, 500);
    assert.equal((JSON.parse(text) as { code?: string }).code, 'MFA_UNAVAILABLE');
    assert.ok(!text.includes('pw-a'));
  } finally { server.close(); }
});
