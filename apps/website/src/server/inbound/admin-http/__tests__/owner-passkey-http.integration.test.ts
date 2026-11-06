import { createSettingsPrincipalLookup } from '#src/features/settings/index';
import '../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import express from 'express';
import { chromium } from '@playwright/test';
import { createRouteDeps } from '../../../runtime/composition/app.js';
import { registerAuthRoutes } from '../dev-auth.js';
import { createSqliteIdentityRouteDeps } from '#src/features/identity/wiring';
import { createPermissionGrantRegistry } from '#src/features/identity/permission-grants';
import { freshSqliteContentKernel } from '#src/platform/db/kernel/__tests__/dialect-matrix';

test('real HTTP/browser TOTP enrollment and passkey registration/login withhold cookies until factor completion', { timeout: 30000 }, async t => {
  const kernel = freshSqliteContentKernel();
  t.after(() => kernel.close());
  let now = Date.now();
  const clock = { nowMs: () => now, nowIso: () => new Date(now).toISOString() };
  const original = createRouteDeps(); await original.identityReady;
  const identity = createSqliteIdentityRouteDeps({ db: kernel, workspaceId: 'synthetic-http-site', clock,
    idGen: { newId: () => randomUUID() }, permissionGrants: createPermissionGrantRegistry(),
    ownerCredentials: { username: 'synthetic-owner', password: 'synthetic-password' } });
  await identity.identityReady;
  const repo = identity.principalRepo;
  const principalRepo = { ...createSettingsPrincipalLookup({ repo }),
    findById: repo.findById.bind(repo), list: repo.list.bind(repo), save: repo.save.bind(repo) };
  const deps = { ...original, ...identity, principalRepo, workspaceId: 'synthetic-http-site', clock };
  const identityRequire = createRequire(import.meta.resolve('@jini-ai/user-management/server'));
  const bundle = await readFile(resolve(dirname(identityRequire.resolve('@simplewebauthn/browser')), '../dist/bundle/index.umd.min.js'));
  const { generate } = identityRequire('otplib') as { generate(input: { secret: string; epoch: number }): Promise<string> };
  const app = express(); app.use(express.json({ limit: '16kb' }));
  app.get('/browser.js', (_req, res) => { res.type('js').send(bundle); });
  app.get('/', (_req, res) => { res.type('html').send('<!doctype html><title>Synthetic passkey test</title><script src="/browser.js"></script>'); });
  registerAuthRoutes(app, deps, { localOwnerSignIn: { enabled: false } });
  const server = createServer(app);
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  deps.derivedPublicOrigin = `http://localhost:${address.port}`; deps.passkeyOrigin = undefined;
  const browser = await chromium.launch({ ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}), headless: true, args: ['--no-sandbox'] });
  t.after(() => browser.close());
  const page = await browser.newPage(); await page.goto(deps.derivedPublicOrigin);
  const cdp = await page.context().newCDPSession(page); await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  async function post<T>(action: string, body: object): Promise<T> {
    const result = await page.evaluate(async ({ action, body }) => {
      const response = await fetch(`/api/admin/v1/auth/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return { status: response.status, body: response.status === 204 ? null : await response.json() };
    }, { action, body });
    assert.ok(result.status === 200 || result.status === 204, `${action} returned ${result.status}`);
    return result.body as T;
  }
  const credentials = { username: 'synthetic-owner', password: 'synthetic-password' };
  await post('login', credentials);
  const setup = await post<{ pendingToken: string; secret: string }>('mfa/enroll', { password: credentials.password });
  const code = () => generate({ secret: setup.secret, epoch: Math.floor(now / 1000) });
  await post('mfa/confirm', { pendingToken: setup.pendingToken, code: await code() });
  now += 30000;
  await page.context().clearCookies();
  const pending = await post<{ mfaRequired: true; pendingToken: string }>('login', credentials);
  assert.equal(pending.mfaRequired, true);
  assert.equal((await page.context().cookies()).length, 0);
  await post('mfa/login', { pendingToken: pending.pendingToken, code: await code() });
  assert.equal((await page.context().cookies()).length, 1);
  now += 30000;
  const registration = await post<{ pendingToken: string; options: object }>('passkeys/enroll', { password: credentials.password, code: await code() });
  const registered = await page.evaluate('SimpleWebAuthnBrowser.startRegistration(' + JSON.stringify({ optionsJSON: registration.options }) + ')');
  await post('passkeys/confirm', { pendingToken: registration.pendingToken, response: registered });
  assert.equal((await deps.passkeyStore!.list({ workspaceId: deps.workspaceId, principalId: await deps.ownerPrincipalId })).length, 1);
  await post('logout', {});
  await page.context().clearCookies();
  const next = await post<{ mfaRequired: true; pendingToken: string }>('login', credentials);
  assert.equal(next.mfaRequired, true);
  assert.equal((await page.context().cookies()).length, 0);
  const assertion = await post<{ pendingToken: string; options: object }>('passkeys/begin-login', { pendingToken: next.pendingToken });
  assert.equal((await page.context().cookies()).length, 0);
  const response = await page.evaluate('SimpleWebAuthnBrowser.startAuthentication(' + JSON.stringify({ optionsJSON: assertion.options }) + ')');
  const signedIn = await post<{ user: { username: string } }>('passkeys/login', { pendingToken: assertion.pendingToken, response });
  assert.equal(signedIn.user.username, credentials.username);
  assert.equal((await page.context().cookies()).length, 1);
});
