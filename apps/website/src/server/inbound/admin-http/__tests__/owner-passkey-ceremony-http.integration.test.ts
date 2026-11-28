import { createRouteIncidentReporter } from '#src/server/__tests__/helpers/route-incident-reporter';
import { createSettingsPrincipalLookup } from '#src/features/settings/index';
import '../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import express from 'express';
import { createRouteDeps } from '../../../runtime/composition/app.js';
import { registerAuthRoutes } from '../dev-auth.js';
import { createSqliteIdentityRouteDeps } from '#src/features/identity/wiring';
import { createPermissionGrantRegistry } from '@jini-ai/user-management/identity/permission-grants';
import { freshSqliteContentKernel } from '#src/platform/db/kernel/__tests__/dialect-matrix';

/** Real HTTP (no browser): the passkey actions that need no WebAuthn ceremony run through the real identity services. */
test('owner passkey removal, login refusal and storage incidents over real HTTP with sqlite identity', { timeout: 30000 }, async t => {
  const kernel = freshSqliteContentKernel();
  t.after(() => kernel.close());
  const now = Date.now();
  const clock = { nowMs: () => now, nowIso: () => new Date(now).toISOString() };
  const original = createRouteDeps(); await original.identityReady;
  const identity = createSqliteIdentityRouteDeps({ db: kernel, workspaceId: 'synthetic-http-site', clock,
    idGen: { newId: () => randomUUID() }, permissionGrants: createPermissionGrantRegistry(),
    ownerCredentials: { username: 'synthetic-owner', password: 'synthetic-password' } });
  await identity.identityReady;
  const repo = identity.principalRepo;
  const principalRepo = { ...createSettingsPrincipalLookup({ repo }),
    findById: repo.findById.bind(repo), list: repo.list.bind(repo), save: repo.save.bind(repo) };
  const realStore = identity.passkeyStore!;
  const removed: Array<{ id: string; principalId: string }> = [];
  let storeFails = false;
  const passkeyStore = { ...realStore, list: realStore.list.bind(realStore), save: realStore.save.bind(realStore),
    remove: async (input: Parameters<typeof realStore.remove>[0]) => {
      if (storeFails) throw new Error('passkey table offline');
      removed.push({ id: input.id, principalId: input.principalId });
      return realStore.remove(input);
    } };
  const deps = { ...original, ...identity, principalRepo, passkeyStore, workspaceId: 'synthetic-http-site', clock };
  const app = express(); app.use(express.json({ limit: '16kb' }));
  registerAuthRoutes({ app, deps, errors: createRouteIncidentReporter().errors }, { localOwnerSignIn: { enabled: false, routineDesktopEligible: false } });
  const server = createServer(app);
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const port = address.port;
  const origin = `http://localhost:${port}`;
  deps.derivedPublicOrigin = origin; deps.passkeyOrigin = undefined;
  let cookie = '';
  async function post(action: string, body: object) {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/v1/auth/${action}`, { method: 'POST',
      headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
    const setCookie = response.headers.get('set-cookie');
    const text = await response.text();
    return { status: response.status, setCookie, body: text ? JSON.parse(text) as Record<string, unknown> : null };
  }

  const signIn = await post('login', { username: 'synthetic-owner', password: 'synthetic-password' });
  assert.equal(signIn.status, 200);
  assert.ok(signIn.setCookie, 'password login without an enrolled factor sets the session cookie');
  cookie = signIn.setCookie.split(';')[0]!;
  const ownerId = await deps.ownerPrincipalId;

  // Login with a pending token the store never issued: the real completion service refuses and no cookie is set.
  const login = await post('passkeys/login', { pendingToken: 'never-issued', response: { id: 'x' } });
  assert.equal(login.status, 400);
  assert.equal(login.setCookie, null);
  assert.deepEqual(login.body, { error: 'This passkey attempt was not accepted or has expired. Start a new attempt, or use your authenticator app or recovery code.',
    code: 'PASSKEY_REFUSED', details: { operation: 'owner-passkey' } });

  // Removal reads password and id from the JSON body; the owner principal comes from the server, not the body.
  const done = await post('passkeys/remove', { password: 'synthetic-password', id: 'cred-a', principalId: 'someone-else' });
  assert.equal(done.status, 204);
  assert.equal(done.body, null);
  assert.deepEqual(removed, [{ id: 'cred-a', principalId: ownerId }]);

  // A non-identity storage failure becomes the passkey incident, not a refusal, and removes nothing.
  storeFails = true;
  const failed = await post('passkeys/remove', { password: 'synthetic-password', id: 'cred-b' });
  assert.equal(failed.status, 500);
  assert.deepEqual(failed.body, { code: 'PASSKEY_UNAVAILABLE', errorId: 'ERR-0000-0000-0000-0000',
    error: 'The sign-in operation could not be completed. Check the result before repeating this operation. Report this error ID. (error ERR-0000-0000-0000-0000)' });
  assert.equal(JSON.stringify(failed.body).includes('passkey table offline'), false);
  assert.deepEqual(removed, [{ id: 'cred-a', principalId: ownerId }]);
});
