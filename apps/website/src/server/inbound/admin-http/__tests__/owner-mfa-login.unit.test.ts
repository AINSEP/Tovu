import '../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import express, { type Request } from 'express';
import type { MfaFactor, MfaPending, MfaStore } from '@jini-ai/user-management/server';
import { createRouteDeps } from '../../../runtime/composition/app.js';
import { createCapturingResponse, extractRouteHandler } from '../../../__tests__/helpers/http-test-server.js';
import { registerAuthRoutes } from '../dev-auth.js';
import { ownerMfaDepsFrom } from '../owner-mfa-deps.js';

/** The real HTTP handlers + Jini verifier, with only persistence held in a deterministic fixture. */
test('password login waits for a valid TOTP and consumes the pending proof before issuing a cookie', async t => {
  const deps = createRouteDeps();
  await deps.identityReady;
  deps.clock = { nowIso: () => '1970-01-01T00:00:59.000Z', nowMs: () => 59000 };
  let factor: MfaFactor | null = null;
  const proofs = new Map<string, MfaPending>();
  deps.mfaStore = {
    factor: async () => factor,
    saveFactor: async value => { factor = value; },
    pending: async input => proofs.get(input.tokenHash) ?? null,
    savePending: async value => { proofs.set(value.tokenHash, value); },
    clearPending: async () => { proofs.clear(); },
    clear: async () => { factor = null; proofs.clear(); },
  } satisfies MfaStore;
  const scope = { workspaceId: deps.workspaceId, principalId: await deps.ownerPrincipalId };
  const mfa = await ownerMfaDepsFrom({ deps });
  factor = { ...scope, lastStep: 0, sealedSecret: await mfa.secrets.seal({ ...scope, secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' }) };
  const app = express();
  registerAuthRoutes(app, deps);
  const saved = t.mock.method(deps.sessionRepo, 'save');
  function response() {
    const { res, capture } = createCapturingResponse();
    const cookies: string[] = [];
    res.setHeader = () => res;
    res.cookie = (_name, value) => { cookies.push(value); return res; };
    res.req = { headers: {}, socket: { localPort: 4317 } } as Request;
    return { res, capture, cookies };
  }
  const request = (body: object) => ({ body, ip: '127.0.0.1', headers: {}, socket: { localPort: 4317 }, get: () => undefined });
  const first = response();
  await extractRouteHandler(app, 'post', '/api/admin/v1/auth/login')(request({ username: 'admin', password: 'tovu-dev' }), first.res);
  assert.deepEqual(first.cookies, []);
  assert.equal(saved.mock.callCount(), 0);
  assert.partialDeepStrictEqual(first.capture.jsonBody, { mfaRequired: true });
  const { pendingToken } = first.capture.jsonBody as { pendingToken: string };
  assert.equal(proofs.size, 1);
  const refused = response();
  await extractRouteHandler(app, 'post', '/api/admin/v1/auth/mfa/login')(request({ pendingToken, code: 'wrong' }), refused.res);
  assert.equal(refused.capture.statusCode, 400);
  assert.equal(saved.mock.callCount(), 0);
  assert.deepEqual(refused.cookies, []);
  const completed = response();
  await extractRouteHandler(app, 'post', '/api/admin/v1/auth/mfa/login')(request({ pendingToken, code: '287082' }), completed.res);
  assert.equal(completed.capture.statusCode, 200);
  assert.partialDeepStrictEqual(completed.capture.jsonBody, { user: { id: scope.principalId, username: 'admin' } });
  assert.equal(completed.cookies.length, 1);
  assert.equal(saved.mock.callCount(), 1);
  assert.equal(proofs.size, 0);
  assert.equal(factor!.lastStep, 1);
  const replay = response();
  await extractRouteHandler(app, 'post', '/api/admin/v1/auth/mfa/login')(request({ pendingToken, code: '287082' }), replay.res);
  assert.equal(replay.capture.statusCode, 400);
  assert.equal(saved.mock.callCount(), 1);
  assert.deepEqual(replay.cookies, []);
});
