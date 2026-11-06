import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Express, Request, Response } from 'express';
import type { RouteDeps } from '#src/server/routes/types';
import { ownerPasskeySite, registerOwnerPasskeyRoutes } from '../owner-passkey-routes.js';

test('passkey origin is trusted config/listener data, includes port and keeps a stable RP', () => {
  assert.deepEqual(ownerPasskeySite({ deps: { derivedPublicOrigin: 'http://localhost:3000' }, localPort: 4321 }),
    { origin: 'http://localhost:4321', rpId: 'localhost', name: 'Tovu' });
  assert.deepEqual(ownerPasskeySite({ deps: { passkeyOrigin: 'https://admin.example:8443', derivedPublicOrigin: 'http://localhost:3000' }, localPort: 4321 }),
    { origin: 'https://admin.example:8443', rpId: 'admin.example', name: 'Tovu' });
  assert.throws(() => ownerPasskeySite({ deps: {} }), /unavailable/);
  assert.throws(() => ownerPasskeySite({ deps: { derivedPublicOrigin: 'http://evil.test' } }), /HTTPS or localhost/);
});

function fixture(options: { caller?: string; kind?: string; allowed?: boolean } = {}) {
  type Handler = (req: Request, res: Response) => Promise<void>;
  const handlers = new Map<string, Handler>();
  const app = { post: (path: string, handler: Handler) => handlers.set(path, handler),
    get: (path: string, handler: Handler) => handlers.set(path, handler) } as unknown as Express;
  let reads = 0;
  let cookies = 0;
  const deps = { workspaceId: 'site', ownerPrincipalId: Promise.resolve('owner'), identityReady: Promise.resolve(),
    passkeyOrigin: 'https://trusted.test:8443', mfaStore: {}, clock: { nowIso: () => '2026-01-01T00:00:00Z' },
    passkeyStore: { list: async () => { reads++; return [{ id: 'public-id', publicKey: 'never-return-this', counter: 123 }]; } },
  } as unknown as RouteDeps;
  registerOwnerPasskeyRoutes({ app, deps,
    authenticate: async () => options.caller ? { principal: { id: options.caller }, kind: options.kind ?? 'session' } : null,
    limiter: { check: async () => ({ allowed: options.allowed ?? true, retryAfterSeconds: 60 }) },
    signedIn: async () => { cookies++; },
  });
  async function invoke(path: string, input: { origin?: string; fetchSite?: string; body?: unknown } = {}) {
    let status = 200, body: unknown;
    const req = { body: input.body ?? {}, headers: { host: 'spoofed.test' }, protocol: 'https', ip: '127.0.0.1', socket: { localPort: 3000 },
      is: () => 'application/json', get: (name: string) => name === 'origin' ? input.origin ?? 'https://trusted.test:8443'
        : name === 'sec-fetch-site' ? input.fetchSite : name === 'host' ? 'spoofed.test' : undefined } as unknown as Request;
    const res = { setHeader: () => {}, status: (code: number) => { status = code; return res; },
      json: (value: unknown) => { body = value; return res; }, send: () => res } as unknown as Response;
    await handlers.get(`/api/admin/v1/auth/passkeys${path}`)!(req, res);
    return { status, body };
  }
  return { invoke, reads: () => reads, cookies: () => cookies };
}

for (const options of [{}, { caller: 'staff' }, { caller: 'owner', kind: 'api_key' }]) {
  test(`passkey management requires owner session ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    for (const action of ['/enroll', '/confirm', '/remove']) assert.equal((await f.invoke(action)).status, 403);
    assert.equal(f.reads(), 0);
    assert.deepEqual((await f.invoke('')).body, { isOwner: false, credentials: [] });
    assert.equal(f.cookies(), 0);
  });
}

test('trusted-origin, cross-site, size and rate gates reject before reading credentials or setting cookies', async () => {
  const f = fixture({ caller: 'owner' });
  assert.equal((await f.invoke('/enroll', { origin: 'https://spoofed.test' })).status, 403);
  assert.equal((await f.invoke('/login', { fetchSite: 'cross-site' })).status, 403);
  assert.equal((await f.invoke('/confirm', { body: { response: 'x'.repeat(16384) } })).status, 413);
  assert.equal((await f.invoke('/login', { body: { response: 'x'.repeat(8192) } })).status, 413);
  assert.equal((await fixture({ caller: 'owner', allowed: false }).invoke('/enroll')).status, 429);
  assert.equal(f.reads(), 0); assert.equal(f.cookies(), 0);
});

test('owner status reveals only public credential IDs and never keys/counters', async () => {
  const f = fixture({ caller: 'owner' });
  assert.deepEqual((await f.invoke('')).body, { isOwner: true, credentials: [{ id: 'public-id' }] });
  assert.equal(f.reads(), 1);
});
