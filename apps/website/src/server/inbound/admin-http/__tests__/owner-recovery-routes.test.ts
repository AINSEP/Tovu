import assert from 'node:assert/strict';
import { test, beforeEach, afterEach } from 'node:test';
import type { Express, Request, Response } from 'express';
import { registerOwnerRecoveryRoutes } from '../owner-recovery-routes.js';
import type { RouteDeps } from '#src/server/routes/types';

let savedOrigin: string | undefined;
beforeEach(() => { savedOrigin = process.env.TOVU_PUBLIC_URL; delete process.env.TOVU_PUBLIC_URL; });
afterEach(() => { if (savedOrigin === undefined) delete process.env.TOVU_PUBLIC_URL; else process.env.TOVU_PUBLIC_URL = savedOrigin; });

/** Direct invocation with injected admission: no listeners, timers, Electron or real sleeps. */
function fixture(options: { caller?: string; desktop?: boolean; allowed?: boolean; failedStore?: boolean; capability?: string; local?: boolean; forwarded?: boolean } = {}) {
  type Handler = (req: Request, res: Response) => Promise<void>;
  const handlers = new Map<string, Handler>();
  const app = { post: (path: string, handler: Handler) => handlers.set(path, handler), get: (path: string, handler: Handler) => handlers.set(path, handler) } as unknown as Express;
  let writes = 0;
  const deps = { workspaceId: 'workspace', identityReady: Promise.resolve(), ownerPrincipalId: Promise.resolve('owner'),
    recoveryCodes: options.failedStore ? undefined : { clear: async () => { writes++; } },
  } as unknown as RouteDeps;
  registerOwnerRecoveryRoutes({ app, deps, desktopOwnerReset: options.desktop ?? false,
    acceptsDesktopCapability: ({ capability }) => capability === "launch-proof",
    authenticate: async () => options.caller ? { id: options.caller } : null,
    limiter: { check: async () => ({ allowed: options.allowed ?? true, retryAfterSeconds: 60 }) },
  });
  async function invoke(path: string, body: object = {}, crossSite = false) {
    let status = 200, result: unknown;
    const headers = new Map<string, string>();
    const requestHeaders = { host: options.local ? 'localhost:4317' : 'site.test', origin: options.local ? 'https://localhost:4317' : 'https://site.test', ...(options.capability ? { 'x-tovu-desktop-owner-signin': options.capability } : {}), ...(options.forwarded ? { 'x-forwarded-proto': 'https' } : {}) };
    const req = { body, headers: requestHeaders, protocol: options.forwarded ? 'http' : 'https', ip: '127.0.0.1', socket: options.local ? { localAddress: '127.0.0.1', remoteAddress: '127.0.0.1' } : {}, is: () => 'application/json',
      get: (key: string) => (crossSite && key === 'origin' ? 'https://attacker.test' : (requestHeaders as Record<string, string>)[key]),
    } as unknown as Request;
    const res = { setHeader: (key: string, value: string) => headers.set(key, value), status: (code: number) => { status = code; return res; },
      json: (value: unknown) => { result = value; return res; }, send: () => res,
    } as unknown as Response;
    await handlers.get(`/api/admin/v1/auth/${path}`)!(req, res);
    return { status, result, headers };
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
