import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test, beforeEach, afterEach } from 'node:test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { registerOwnerRecoveryRoutes } from '../owner-recovery-routes.js';
import type { RouteDeps } from '#src/server/routes/types';
import { createInMemoryIdentityRouteDeps } from '#src/features/identity/wiring';
import { createPermissionGrantRegistry } from '@jini-ai/user-management/identity/permission-grants';

let savedOrigin: string | undefined;
beforeEach(() => { savedOrigin = process.env.TOVU_PUBLIC_URL; delete process.env.TOVU_PUBLIC_URL; });
afterEach(() => { if (savedOrigin === undefined) delete process.env.TOVU_PUBLIC_URL; else process.env.TOVU_PUBLIC_URL = savedOrigin; });

// Driven through a real Express app over HTTP (not a hand-rolled req/res double), so the assertions
// hold for whatever writes the reply: the status, the JSON body, the headers and what was read before it.
// It replaces the earlier harness, "Direct invocation with injected admission: no listeners, timers, Electron or real sleeps.":
// still no timers, Electron or real sleeps; the one listener is loopback-only and closed after each request.
function fixture(options: { caller?: string; desktop?: boolean; allowed?: boolean; failedStore?: boolean; capability?: string; local?: boolean; forwarded?: boolean; deps?: RouteDeps } = {}) {
  const app = express();
  // TLS is terminated in front of the app unless this request arrives forwarded (then plain http + x-forwarded-proto).
  app.use((req, _res, next) => { if (!options.forwarded) Object.defineProperty(req, 'protocol', { value: 'https' }); next(); });
  app.use(express.json());
  let writes = 0;
  const deps = options.deps ?? ({ workspaceId: 'workspace', identityReady: Promise.resolve(), ownerPrincipalId: Promise.resolve('owner'),
    recoveryCodes: options.failedStore ? undefined : { clear: async () => { writes++; } },
  } as unknown as RouteDeps);
  registerOwnerRecoveryRoutes({ errors: createRouteIncidentReporter().errors, app, deps, desktopOwnerReset: options.desktop ?? false,
    acceptsDesktopCapability: ({ capability }) => capability === "launch-proof",
    authenticate: async () => options.caller ? { id: options.caller } : null,
    limiter: { check: async () => ({ allowed: options.allowed ?? true, retryAfterSeconds: 60 }) },
  });
  async function invoke(path: string, body: object = {}, crossSite = false) {
    const requestHeaders = { host: options.local ? 'localhost:4317' : 'site.test', origin: crossSite ? 'https://attacker.test' : options.local ? 'https://localhost:4317' : 'https://site.test', 'content-type': 'application/json', ...(options.capability ? { 'x-tovu-desktop-owner-signin': options.capability } : {}), ...(options.forwarded ? { 'x-forwarded-proto': 'https' } : {}) };
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    try {
      const method = path === 'owner-recovery' ? 'GET' : 'POST';
      const reply = await new Promise<{ status: number; text: string; headers: Headers }>((resolve, reject) => {
        const request = http.request({ host: '127.0.0.1', port: (server.address() as AddressInfo).port, path: `/api/admin/v1/auth/${path}`, method, headers: requestHeaders }, (response) => {
          let text = '';
          response.setEncoding('utf8').on('data', (chunk: string) => { text += chunk; }).on('end', () => {
            const headers = new Headers();
            for (const [key, value] of Object.entries(response.headers)) if (typeof value === 'string') headers.set(key, value);
            resolve({ status: response.statusCode ?? 0, text, headers });
          });
        });
        request.on('error', reject);
        request.end(method === 'POST' ? JSON.stringify(body) : undefined);
      });
      return { status: reply.status, result: reply.text ? JSON.parse(reply.text) as unknown : undefined, headers: reply.headers };
    } finally { server.close(); }
  }
  return { invoke, writes: () => writes };
}

test('staff cannot issue kits or use desktop owner reset even when the launch is trusted', async () => {
  const f = fixture({ caller: 'staff', desktop: true });
  for (const path of ['recovery-codes', 'reset-owner']) {
    const result = await f.invoke(path, { password: 'private-password', principalId: 'owner' });
    assert.equal(result.status, 403);
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
    assert.ok(!JSON.stringify(result.result).includes('private-password'));
  }
  assert.equal(f.writes(), 0);
});

test('owner reset requires the desktop launch policy as well as an owner session', async () => {
  const f = fixture({ caller: 'owner' });
  assert.equal((await f.invoke('reset-owner', { password: 'new' })).status, 403);
  assert.equal(f.writes(), 0);
});

test('the shared login limiter and cross-origin admission refuse before any code lookup', async () => {
  assert.equal((await fixture({ allowed: false }).invoke('recover-owner', { code: 'a'.repeat(64), password: 'new' })).status, 429);
  assert.equal((await fixture().invoke('recover-owner', { password: 'new' }, true)).status, 403);
});

test('status exposes no codes and hides owner actions from staff; unavailable storage gives safe details', async () => {
  const f = fixture({ caller: 'staff', desktop: true });
  assert.deepEqual((await f.invoke('owner-recovery')).result, { isOwner: false, available: false, desktopOwnerReset: false });
  const result = await fixture({ failedStore: true }).invoke('recover-owner', { password: 'private-password' });
  assert.equal(result.status, 503);
  assert.ok(!JSON.stringify(result.result).includes('private-password'));
  assert.ok(JSON.stringify(result.result).includes('owner-recovery-recover'));
});


test('a copied owner cookie cannot reset without this request’s local launch capability', async () => {
  for (const options of [{ local: true }, { local: true, capability: 'wrong-proof' }, { capability: 'launch-proof' }, { local: true, capability: 'launch-proof', forwarded: true }]) {
    const f = fixture({ caller: 'owner', desktop: true, ...options });
    const result = await f.invoke('reset-owner', { password: 'private-password' });
    assert.equal(result.status, 403);
    assert.equal(f.writes(), 0);
  }
  // Correct proof gets past admission to the deliberately absent identity repos (503), rather than 403.
  assert.equal((await fixture({ caller: 'owner', desktop: true, local: true, capability: 'launch-proof' }).invoke('reset-owner')).status, 503);
});

test('TLS forwarded by a same-origin host passes origin admission without trust proxy', async () => {
  const result = await fixture({ forwarded: true, failedStore: true }).invoke('recover-owner');
  assert.equal(result.status, 503);
  assert.match(JSON.stringify(result.result), /owner-recovery-recover/);
});

test('the signed-in owner receives a no-store recovery kit backed by digests for that site and owner', async () => {
  const workspaceId = 'kit-workspace';
  const password = 'fixture-owner-passphrase';
  const clock = { nowIso: () => '2026-11-27T00:00:00.000Z', nowMs: () => Date.parse('2026-11-27T00:00:00.000Z') };
  let nextId = 0;
  const idGen = { newId: () => `kit-id-${++nextId}` };
  const identity = createInMemoryIdentityRouteDeps({ workspaceId, clock, idGen, permissionGrants: createPermissionGrantRegistry(),
    ownerCredentials: { username: 'fixture-owner', password } });
  await identity.identityReady;
  const owner = await identity.ownerPrincipalId;
  type Store = NonNullable<RouteDeps['recoveryCodes']>;
  const storage = new Map<string, string[]>();
  const key = (scope: { workspaceId: string; principalId: string }) => JSON.stringify([scope.workspaceId, scope.principalId]);
  const recoveryCodes: Store = {
    replace: async input => { storage.set(key(input), [...input.hashes]); },
    contains: async input => storage.get(key(input))?.includes(input.hash) ?? false,
    clear: async input => { storage.delete(key(input)); },
  };
  let nextCode = 0;
  const tokens = { newToken: () => (++nextCode).toString(16).padStart(64, '0'), hashToken: identity.tokens.hashToken.bind(identity.tokens) };
  const deps = { ...identity, workspaceId, clock, idGen, recoveryCodes, tokens } as unknown as RouteDeps;
  const { invoke } = fixture({ caller: owner, deps });
  const scope = { workspaceId, principalId: owner };
  assert.equal(storage.has(key(scope)), false);
  const issued = await invoke('recovery-codes', { password });
  assert.equal(issued.status, 200);
  assert.equal(issued.headers.get('cache-control'), 'no-store');
  const expectedCodes = Array.from({ length: 10 }, (_, index) => (index + 1).toString(16).padStart(64, '0'));
  assert.deepEqual(issued.result, { codes: expectedCodes });
  const expectedHashes = expectedCodes.map(code => createHash('sha256').update(JSON.stringify(['owner-recovery-v1', workspaceId, owner, code])).digest('hex'));
  assert.deepEqual([...storage], [[key(scope), expectedHashes]]);
  assert.deepEqual((await invoke('owner-recovery')).result, { isOwner: true, available: true, desktopOwnerReset: false });
});

test('an owner with an enrolled authenticator has the kit request verified through the site authenticator ports, not refused as unavailable', async () => {
  const workspaceId = 'mfa-workspace';
  const password = 'fixture-owner-passphrase';
  const clock = { nowIso: () => '2026-11-27T00:00:00.000Z', nowMs: () => Date.parse('2026-11-27T00:00:00.000Z') };
  let nextId = 0;
  const idGen = { newId: () => `mfa-id-${++nextId}` };
  const identity = createInMemoryIdentityRouteDeps({ workspaceId, clock, idGen, permissionGrants: createPermissionGrantRegistry(),
    ownerCredentials: { username: 'fixture-owner', password } });
  await identity.identityReady;
  const owner = await identity.ownerPrincipalId;
  const replaced: unknown[] = [];
  const factorLookups: unknown[] = [];
  const recoveryCodes = { replace: async (input: unknown) => { replaced.push(input); }, contains: async () => false, clear: async () => {} };
  const mfaStore = { factor: async (input: unknown) => { factorLookups.push(input); return { workspaceId, principalId: owner, secret: 'sealed', lastStep: 0 }; },
    saveFactor: async () => {}, removeFactor: async () => {} };
  const deps = { ...identity, workspaceId, clock, idGen, recoveryCodes, mfaStore } as unknown as RouteDeps;
  const issued = await fixture({ caller: owner, deps }).invoke('recovery-codes', { password, code: '000000' });
  // The composed authenticator deps reach factor verification, which needs the (absent) site key:
  // the redacted 503, never the "Authenticator verification is unavailable" refusal.
  assert.equal(issued.status, 503);
  assert.doesNotMatch(JSON.stringify(issued.result), /Authenticator verification is unavailable/);
  assert.ok(factorLookups.length >= 2, 'the factor is looked up by the kit check and again by the verifier');
  assert.deepEqual(replaced, [], 'no kit is stored');
});
