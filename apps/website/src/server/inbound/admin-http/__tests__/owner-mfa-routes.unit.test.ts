import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Express, Request, Response } from 'express';
import { registerOwnerMfaRoutes } from '../owner-mfa-routes.js';
import type { RouteDeps } from '#src/server/routes/types';

function fixture(options: { caller?: string; kind?: string; allowed?: boolean; enrolled?: boolean } = {}) {
  type Handler = (req: Request, res: Response) => Promise<void>;
  const handlers = new Map<string, Handler>();
  const app = { post: (path: string, handler: Handler) => handlers.set(path, handler),
    get: (path: string, handler: Handler) => handlers.set(path, handler) } as unknown as Express;
  let factorReads = 0;
  const deps = { workspaceId: 'site', ownerPrincipalId: Promise.resolve('owner'), identityReady: Promise.resolve(),
    mfaStore: { factor: async () => { factorReads++; return options.enrolled ? { sealedSecret: 'never-return-this' } : null; } },
  } as unknown as RouteDeps;
  registerOwnerMfaRoutes({ app, deps,
    authenticate: async () => options.caller ? { principal: { id: options.caller }, kind: options.kind ?? 'session' } : null,
    limiter: { check: async () => ({ allowed: options.allowed ?? true, retryAfterSeconds: 60 }) },
  });
  async function invoke(path: string, origin = 'https://site.test') {
    let status = 200, body: unknown;
    const req = { body: {}, headers: { host: 'site.test' }, protocol: 'https', ip: '127.0.0.1', socket: {},
      is: () => 'application/json', get: (name: string) => name === 'origin' ? origin : name === 'host' ? 'site.test' : undefined } as unknown as Request;
    const res = { setHeader: () => {}, status: (code: number) => { status = code; return res; },
      json: (value: unknown) => { body = value; return res; }, send: () => res } as unknown as Response;
    await handlers.get(`/api/admin/v1/auth/mfa${path}`)!(req, res);
    return { status, body };
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
