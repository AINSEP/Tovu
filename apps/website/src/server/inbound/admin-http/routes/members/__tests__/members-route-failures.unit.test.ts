import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { registerAdminMemberGetRoute } from '../get-by-id.js';
import { registerAdminMemberListRoute } from '../list.js';
import { registerAdminMemberRequestMagicLinkRoute } from '../request-magic-link.js';
import { WS, BASE, INTERNAL, allowed, fixture, testRouteFailureMatrix, type RouteFailureCase } from '#src/server/__tests__/helpers/admin-route-failures';

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
