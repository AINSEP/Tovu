import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import express, { type Request } from 'express';
import { createCapturingResponse, extractRouteHandler } from '#src/server/__tests__/helpers/http-test-server';
import { portFake } from '#src/server/__tests__/helpers/port-fake';
import { originFixture } from '#src/features/member-login/__tests__/fixtures';
import { MemberLoginError } from '#src/features/member-login/index';
import * as memberLogin from '#src/features/member-login/index';
import type { MemberRecord, MemberSessionRecord } from '#src/features/members/index';
import { InMemoryMemberExternalIdentityRepo } from '#src/features/members/repo.memory';
import type { MemberPublicRouteDeps } from '../../deps.js';
import { currentOidcMember, memberOidcCookie, MEMBER_OIDC_PATH, MEMBER_OIDC_BINDING_COOKIE, MEMBER_OIDC_PROOF_COOKIE, type MemberOidcRouteDeps } from '../../oidc-deps.js';
import { registerMemberLoginProvidersRoute, registerMemberOidcStartRoute } from '../../oidc-start.js';
import { registerPublicMemberMeRoute } from '../../me.js';

let completions = 0;
mock.module('#src/features/member-login/index', { namedExports: { ...memberLogin, completeOidcLogin: async () => {
  completions++; throw new MemberLoginError({ code: 'LOGIN_UNAVAILABLE' });
} } });
const { registerMemberOidcCallbackRoute } = await import('../../oidc-callback.js');

const NOW = '2026-10-28T12:00:00.000Z';
const SESSION: MemberSessionRecord = { id: 's', memberId: 'member', workspaceId: 'ws', tokenHash: 'opaque', createdAt: '2026-10-28T10:00:00.000Z', expiresAt: '2026-10-29T12:00:00.000Z' };
const MEMBER: MemberRecord = { id: 'member', workspaceId: 'ws', email: 'person@example.com', status: 'active', version: 1, createdAt: NOW, updatedAt: NOW };

function memberDeps(required: { member?: MemberRecord | null; session?: MemberSessionRecord | null }, _options = {}) {
  return portFake<MemberPublicRouteDeps>({ workspaceId: 'ws', clock: { nowMs: () => Date.parse(NOW) },
    memberSessionRepo: { findByTokenHash: async () => required.session === undefined ? SESSION : required.session },
    memberRepo: { findById: async () => required.member === undefined ? MEMBER : required.member },
    memberSubscriptionRepo: { listActiveByMember: async () => [] },
    magicLinkCompleteAttemptLimiter: { check: async () => ({ allowed: true }) },
    passwordSignInPerIpLimiter: { check: async () => ({ allowed: true }) },
  });
}

for (const [name, session] of [['missing', null], ['revoked', { ...SESSION, revokedAt: NOW }], ['expired', { ...SESSION, expiresAt: NOW }]] as const) {
  test(`OIDC treats a ${name} member session as anonymous`, async () => {
    assert.equal(await currentOidcMember({ req: { headers: { cookie: 'tovu_member_session=token' } } as Request, deps: memberDeps({ session }) }), null);
  });
}

for (const member of [null, { ...MEMBER, status: 'disabled' as const }, { ...MEMBER, status: 'trash' as const }]) {
  test(`OIDC refuses a live session for ${member?.status ?? 'missing'} member`, async () => {
    await assert.rejects(currentOidcMember({ req: { headers: { cookie: 'tovu_member_session=token' } } as Request, deps: memberDeps({ member }) }),
      (error: unknown) => error instanceof MemberLoginError && error.code === 'LOGIN_BLOCKED');
  });
}

test('OIDC credential revocation makes an older session anonymous; pending members may connect', async () => {
  const req = { headers: { cookie: 'tovu_member_session=token' } } as Request;
  assert.equal(await currentOidcMember({ req, deps: memberDeps({ member: { ...MEMBER, credentialsRevokedAt: NOW } }) }), null);
  const pending = { ...MEMBER, status: 'pending' as const };
  assert.deepEqual(await currentOidcMember({ req, deps: memberDeps({ member: pending }) }), { session: SESSION, member: pending });
});

test('OIDC cookies keep configured base paths and reject malformed binding before setting', () => {
  const { res } = createCapturingResponse();
  const calls: unknown[] = [];
  Object.assign(res, { cookie: (...args: unknown[]) => { calls.push(['set', ...args]); return res; },
    clearCookie: (...args: unknown[]) => { calls.push(['clear', ...args]); return res; } });
  const callbackUrl = 'https://site.example/base/api/members/v1/workspaces/ws/oidc/google/callback';
  const binding = 'b'.repeat(43);
  memberOidcCookie({ res, callbackUrl, kind: 'callback', binding });
  memberOidcCookie({ res, callbackUrl, kind: 'proof', binding });
  memberOidcCookie({ res, callbackUrl, kind: 'proof' });
  assert.deepEqual(calls, [
    ['set', MEMBER_OIDC_BINDING_COOKIE, binding, { httpOnly: true, secure: true, sameSite: 'lax', path: '/base/api/members/v1/workspaces/ws/oidc/google/callback', maxAge: 600000 }],
    ['set', MEMBER_OIDC_PROOF_COOKIE, binding, { httpOnly: true, secure: true, sameSite: 'lax', path: '/base/api/members/v1/workspaces/ws/oidc/google/verify-email', maxAge: 600000 }],
    ['clear', MEMBER_OIDC_PROOF_COOKIE, { httpOnly: true, secure: true, sameSite: 'lax', path: '/base/api/members/v1/workspaces/ws/oidc/google/verify-email' }],
  ]);
  for (const invalid of ['', 'x'.repeat(42), 'x'.repeat(44), '!'.repeat(43)]) {
    assert.throws(() => memberOidcCookie({ res, callbackUrl, kind: 'callback', binding: invalid }),
      (error: unknown) => error instanceof MemberLoginError && error.code === 'LOGIN_INVALID');
  }
  assert.equal(calls.length, 3);
});

for (const query of [{ error: 'access_denied' }, { error: 'provider-secret' }, { code: [], state: 'state' },
  { code: 'code', state: {} }, { code: '', state: 'state' }, { code: 'c'.repeat(4097), state: 'state' },
  { code: 'code', state: '' }, { code: 'code', state: 's'.repeat(16385) }, { code: 'valid-code', state: 'valid-state' }]) {
  test(`OIDC callback clears binding and bounds query before exchange ${Object.keys(query).join(',')}:${JSON.stringify(query).length}`, async () => {
    completions = 0;
    const app = express();
    const members = memberDeps({});
    const deps = portFake<MemberOidcRouteDeps>({ members, protocol: { origin: originFixture() } });
    registerMemberOidcCallbackRoute({ app, deps });
    const { res, capture } = createCapturingResponse();
    const calls: unknown[] = [];
    Object.assign(res, { setHeader: () => res, clearCookie: (name: string) => { calls.push(name); return res; },
      redirect: (status: number, location: string) => { capture.statusCode = status; capture.jsonBody = location; return res; } });
    await extractRouteHandler(app, 'get', `${MEMBER_OIDC_PATH}/callback`)({ params: { workspaceId: 'ws', providerId: 'google' },
      headers: {}, query, socket: { remoteAddress: '203.0.113.1' }, get: () => undefined }, res);
    assert.deepEqual(calls, [MEMBER_OIDC_BINDING_COOKIE]);
    const valid = query.code === 'valid-code';
    assert.equal(completions, valid ? 1 : 0);
    const code = valid ? 'LOGIN_UNAVAILABLE' : query.error === 'access_denied' ? 'LOGIN_CANCELLED' : 'LOGIN_INVALID';
    assert.deepEqual(capture, { statusCode: 303, jsonBody: `/signin#oidcError=${code}` });
  });
}

for (const failure of [new MemberLoginError({ code: 'LOGIN_UNAVAILABLE' }), new Error('private provider failure')]) {
  test(`provider metadata failure ${failure.constructor.name} is a fixed response`, async () => {
    const app = express();
    registerMemberLoginProvidersRoute({ app, deps: portFake<MemberOidcRouteDeps>({ members: memberDeps({}), listProviders: async () => { throw failure; } }) });
    const { res, capture } = createCapturingResponse(); res.setHeader = (() => res) as typeof res.setHeader;
    await extractRouteHandler(app, 'get', '/api/members/v1/workspaces/:workspaceId/login-providers')({ params: { workspaceId: 'ws' } }, res);
    assert.deepEqual(capture, { statusCode: failure instanceof MemberLoginError ? 503 : 401, jsonBody: { error: 'member login failed', code: failure instanceof MemberLoginError ? 'LOGIN_UNAVAILABLE' : 'LOGIN_INVALID' } });
  });
}

test('OIDC start refuses an invalid provider id before resolving provider configuration', async () => {
  const app = express();
  registerMemberOidcStartRoute({ app, deps: portFake<MemberOidcRouteDeps>({ members: memberDeps({}) }) });
  const { res, capture } = createCapturingResponse();
  Object.assign(res, { setHeader: () => res, redirect: (status: number, location: string) => { capture.statusCode = status; capture.jsonBody = location; return res; } });
  await extractRouteHandler(app, 'get', `${MEMBER_OIDC_PATH}/start`)({ params: { workspaceId: 'ws', providerId: 'INVALID' }, headers: {}, get: () => undefined, socket: {} }, res);
  assert.deepEqual(capture, { statusCode: 303, jsonBody: '/signin#oidcError=LOGIN_INVALID' });
});

test('me keeps linked identities readable when provider discovery is unavailable', async () => {
  const members = memberDeps({});
  const app = express();
  const login = portFake<MemberOidcRouteDeps>({ members,
    links: portFake<MemberOidcRouteDeps['links']>({ identities: new InMemoryMemberExternalIdentityRepo({ initialRows: [
      { id: 'linked', workspaceId: 'ws', memberId: MEMBER.id, providerId: 'disabled-provider', issuer: 'https://disabled.example', subject: 'linked-subject', linkedAt: NOW },
      { id: 'unlinked', workspaceId: 'ws', memberId: MEMBER.id, providerId: 'removed', issuer: 'https://removed.example', subject: 'unlinked-subject', linkedAt: NOW, unlinkedAt: NOW },
    ] }) }),
    listProviders: async () => { throw new Error('plugin disabled'); },
  });
  registerPublicMemberMeRoute(app, members, { login });
  const { res, capture } = createCapturingResponse(); res.setHeader = (() => res) as typeof res.setHeader;
  await extractRouteHandler(app, 'get', '/api/members/v1/workspaces/:workspaceId/me')({ params: { workspaceId: 'ws' }, headers: { cookie: 'tovu_member_session=token' } }, res);
  assert.equal(capture.statusCode, 200);
  assert.deepEqual((capture.jsonBody as { identities: unknown }).identities, [{ providerId: 'disabled-provider', label: 'disabled-provider' }]);
});
