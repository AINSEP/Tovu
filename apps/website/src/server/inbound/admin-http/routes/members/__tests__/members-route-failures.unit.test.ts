import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { registerAdminMemberGetRoute } from '../get-by-id.js';
import { registerAdminMemberListRoute } from '../list.js';
import { registerAdminMemberRequestMagicLinkRoute } from '../request-magic-link.js';
import { WS, BASE, INTERNAL, allowed, fixture, invokeRouteDirectly, testRouteFailureMatrix, type RouteFailureCase } from '#src/server/__tests__/helpers/admin-route-failures';
import { registerAdminMemberDisableRoute } from '../disable.js';

const routes: RouteFailureCase[] = [
  { name: 'members get', register: registerAdminMemberGetRoute, method: 'GET', path: `${BASE}/members/member` },
  { name: 'members list', register: registerAdminMemberListRoute, method: 'GET', path: `${BASE}/members` },
  { name: 'members magic link', register: registerAdminMemberRequestMagicLinkRoute, method: 'POST', path: `${BASE}/members/request-magic-link` },
];

testRouteFailureMatrix(routes);

test('member get: a missing record is 404; an unavailable repository is 500', async () => {
  for (const [findById, expected] of [
    [async () => null, { status: 404, body: { error: "member 'member' was not found" } }],
    [async () => { throw new Error('database details'); }, { status: 500, body: INTERNAL }],
  ] as const) {
    const { app } = fixture(registerAdminMemberGetRoute, { memberRepo: { findById } });
    assert.deepEqual(await dispatchJsonRequest(app, 'GET', `${BASE}/members/member`), expected);
  }
});

for (const query of ['', '?limit=no', '?limit=Infinity', '?limit=0', '?limit=-1', '?limit=2&afterId=previous', '?limit[x]=2&afterId[x]=bad']) {
  test(`members list normalizes pagination ${query || '(absent)'}`, async () => {
    let input: unknown;
    const { app } = fixture(registerAdminMemberListRoute, { memberRepo: { list: async (value: unknown) => { input = value; return []; } } });
    assert.deepEqual(await dispatchJsonRequest(app, 'GET', `${BASE}/members${query}`), { status: 200, body: { members: [] } });
    assert.deepEqual(input, { workspaceId: WS, afterId: query.includes('previous') ? 'previous' : undefined, limit: query.includes('previous') ? 2 : undefined });
  });
}

test('magic link: absent body is validation failure without consuming email rate budget', async () => {
  let checks = 0;
  const { app } = fixture(registerAdminMemberRequestMagicLinkRoute, { magicLinkPerEmailLimiter: { check: async () => { checks++; return { allowed: true }; } } });
  assert.deepEqual(await dispatchJsonRequest(app, 'POST', `${BASE}/members/request-magic-link`), { status: 400, body: { error: "'' is not a valid email address" } });
  assert.equal(checks, 0);
});

/**
 * `String(req.params.X ?? "")` (extractRouteHandler's own doc, `helpers/http-test-server.ts`): Express
 * guarantees a matched `:param` is always populated, so the right side of each `??` below is unreachable
 * through any real HTTP request. Restored 2026-09-03 after being wrongly deleted as "unreachable dead
 * code" -- the repo's established answer is to KEEP the guard and exercise it with a hand-built `req`
 * that deliberately violates that contract.
 */
for (const { name, register, method, path } of [
  { name: 'members disable', register: registerAdminMemberDisableRoute, method: 'POST', path: `${BASE}/members/member/disable` },
] as const) {
  test(`${name}: \`req.params.workspaceId ?? ""\` fallback, forced via a direct handler call, is the workspace 404 before authorization`, async () => {
    let calls = 0;
    const { app } = fixture(register, { authorize: async () => { calls++; return { allowed: true }; } });
    assert.deepEqual(await invokeRouteDirectly({ app, method, path, req: { params: {}, query: {}, body: {} } }), {
      statusCode: 404, jsonBody: { error: 'workspace was not found' },
    });
    assert.equal(calls, 0);
  });
}

for (const { name, register, method, path } of [
  { name: 'members disable: `req.params.memberId ?? ""`', register: registerAdminMemberDisableRoute, method: 'POST', path: `${BASE}/members/member/disable` },
  { name: 'members get: `req.params.memberId ?? ""`', register: registerAdminMemberGetRoute, method: 'GET', path: `${BASE}/members/member` },
] as const) {
  test(`${name} fallback, forced via a direct handler call, resolves the empty id to the ordinary not-found`, async () => {
    const { app } = fixture(register);
    assert.deepEqual(await invokeRouteDirectly({ app, method, path, req: { params: { workspaceId: WS }, query: {}, body: {} } }), {
      statusCode: 404, jsonBody: { error: "member '' was not found" },
    });
  });
}
