/** Google login S3: real HTTP + real sealed state/JWT/link owners, entirely local protocol I/O.
 * Binding changes and owner 2026-10-24 require first-link inbox proof and member-only cookies.
 * Deliberately not executed by the shard worker; central commands are in the handoff.
 */
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import express from "express";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { InMemoryMagicLinkTokenRepo, InMemoryMemberRepo, InMemoryMemberSessionRepo, InMemoryMemberSubscriptionRepo,
  InMemoryMemberTierRepo, InMemoryMemberExternalIdentityRepo, type MemberRecord, type OutboundEmail } from "#src/features/members/index";
import { issueMemberSession } from "#src/features/members/write-service";
import { cryptoFixture, originFixture, provider } from "#src/features/member-login/__tests__/fixtures";
import type { MemberPublicRouteDeps } from "../../inbound/public-http/routes/members/deps.js";
import { toPublicMembersWriteServiceDeps } from "../../inbound/public-http/routes/members/deps.js";
import { registerMemberLoginProvidersRoute, registerMemberOidcStartRoute } from "../../inbound/public-http/routes/members/oidc-start.js";
import { registerMemberOidcCallbackRoute } from "../../inbound/public-http/routes/members/oidc-callback.js";
import { registerMemberOidcVerifyEmailRoute } from "../../inbound/public-http/routes/members/oidc-verify-email.js";
import { registerMemberUnlinkIdentityRoute } from "../../inbound/public-http/routes/members/unlink-identity.js";
import { registerPublicMemberMeRoute } from "../../inbound/public-http/routes/members/me.js";
import { MEMBER_OIDC_BINDING_COOKIE, MEMBER_OIDC_PROOF_COOKIE, type MemberOidcRouteDeps } from "../../inbound/public-http/routes/members/oidc-deps.js";
import { startTestServer } from "../helpers/http-test-server.js";

const BASE = "/api/members/v1/workspaces/ws";
const OIDC = `${BASE}/oidc/google`;
const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
const wrongKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...key.publicKey.export({ format: "jwk" }), kid: "key", alg: "RS256", use: "sig" };
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const cookie = (response: globalThis.Response, name: string) => response.headers.getSetCookie().find(value => value.startsWith(`${name}=`))?.split(";")[0] ?? "";

function fixture(claimOverrides: Record<string, unknown> = {}) {
  const crypto = cryptoFixture();
  const sent: OutboundEmail[] = [], locks: string[] = [];
  const claims = { email: "person@gmail.com", email_verified: true, ...claimOverrides };
  let sequence = 0, exchanges = 0, invalidSignature = false;
  let enabled = true, inTransaction = false;
  const usedCodes = new Set<string>();
  const codeNonces = new Map<string, string>();
  const limiter = { check: async () => ({ allowed: true as const }) };
  const members: MemberPublicRouteDeps = {
    workspaceId: "ws", clock: crypto.clock, idGen: { newId: () => { sequence++; return `id-${sequence}`; } },
    memberRepo: new InMemoryMemberRepo(), memberSessionRepo: new InMemoryMemberSessionRepo(),
    memberTierRepo: new InMemoryMemberTierRepo(), memberSubscriptionRepo: new InMemoryMemberSubscriptionRepo(),
    magicLinkRepo: new InMemoryMagicLinkTokenRepo(), principalRepo: new InMemoryPrincipalRepo({}), origin: originFixture(),
    passwordHasher: { hash: async ({ password }) => `hash:${password}`, verify: async ({ hash, password }) => hash === `hash:${password}` },
    mailer: { capabilities: () => ({ driver: "memory", supportsIdempotencyKey: true, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }),
      send: async message => { sent.push(message); return { ok: true, providerMessageId: "sent", acceptedAt: crypto.clock.nowIso() }; }, sendBatch: async () => [] },
    magicLinkPerEmailLimiter: limiter, magicLinkPerIpLimiter: limiter, magicLinkCompleteAttemptLimiter: limiter,
    passwordSignInPerEmailLimiter: limiter, passwordSignInPerIpLimiter: limiter, passwordSetPerMemberLimiter: limiter,
  };
  const identities = new InMemoryMemberExternalIdentityRepo({});
  const deps: MemberOidcRouteDeps = { members, listProviders: async () => enabled ? [provider] : [],
    links: { ...toPublicMembersWriteServiceDeps(members), identities,
      transaction: async body => { inTransaction = true; try { return await body(); } finally { inTransaction = false; } },
      lockKey: async value => { assert.equal(inTransaction, true); locks.push(value); } },
    protocol: { ...crypto, origin: originFixture(),
      resolveProvider: async () => enabled ? provider : null,
      resolveClient: async () => ({ clientId: "client", clientSecret: "secret-never-returned", authMethod: "client_secret_post" }),
      httpPorts: { guard: { assertSafeUrl: ({ raw }) => new URL(raw) }, fetchFn: async ({ url }, init) => {
        if (String(url) === provider.jwksUri) return Response.json({ keys: [jwk] });
        assert.equal(String(url), provider.tokenEndpoint);
        exchanges++;
        const code = new URLSearchParams(String(init?.body)).get("code")!;
        if (usedCodes.has(code)) return Response.json({ error: "invalid_grant" }, { status: 400 });
        usedCodes.add(code);
        const now = Math.floor(crypto.clock.nowMs() / 1000);
        const payload = `${encode({ alg: "RS256", kid: "key" })}.${encode({ iss: provider.issuer, aud: "client", sub: "subject", iat: now, exp: now + 300, nonce: codeNonces.get(code), ...claims })}`;
        const signature = sign("RSA-SHA256", Buffer.from(payload), invalidSignature ? wrongKey.privateKey : key.privateKey).toString("base64url");
        return Response.json({ token_type: "Bearer", access_token: "transient-token", id_token: `${payload}.${signature}` });
      } } },
  };
  const app = express(); app.use(express.json());
  for (const register of [registerMemberLoginProvidersRoute, registerMemberOidcStartRoute, registerMemberOidcCallbackRoute,
    registerMemberOidcVerifyEmailRoute, registerMemberUnlinkIdentityRoute]) register({ app, deps });
  registerPublicMemberMeRoute(app, members, { login: deps });
  async function start(base: string, memberCookie = "") {
    crypto.clock.advanceMs(1);
    const response = await fetch(`${base}${OIDC}/start`, { redirect: "manual", headers: { cookie: memberCookie } });
    assert.equal(response.status, 303);
    const location = new URL(response.headers.get("location")!);
    const nonce = location.searchParams.get("nonce")!;
    sequence++;
    const params = new URLSearchParams({ state: location.searchParams.get("state")!, code: `code-${sequence}` });
    codeNonces.set(`code-${sequence}`, nonce);
    return { response, location, params, binding: cookie(response, MEMBER_OIDC_BINDING_COOKIE) };
  }
  async function seed(status: MemberRecord["status"] = "active", email = "person@gmail.com") {
    const record: MemberRecord = { id: "member", workspaceId: "ws", email, status,
      emailVerifiedAt: crypto.clock.nowIso(), createdAt: crypto.clock.nowIso(), updatedAt: crypto.clock.nowIso(), version: 1 };
    await members.memberRepo.save(record); return record;
  }
  async function memberCookie(record: MemberRecord) {
    const result = await issueMemberSession({ deps: deps.links, member: record, nowIso: crypto.clock.nowIso() });
    return `tovu_member_session=${result.rawSessionToken}`;
  }
  return { ...crypto, app, deps, members, identities, claims, locks, sent, start, seed, memberCookie,
    exchanges: () => exchanges, disable: () => { enabled = false; }, badSignature: () => { invalidSignature = true; } };
}

function callback(base: string, params: URLSearchParams, binding = "") {
  return fetch(`${base}${OIDC}/callback?${params}`, { redirect: "manual", headers: { cookie: binding } });
}

function post(base: string, path: string, body: unknown, cookies = "", extra: Record<string, string> = {}) {
  return fetch(`${base}${path}`, { method: "POST", redirect: "manual", headers: { "content-type": "application/json", cookie: cookies, ...extra }, body: JSON.stringify(body) });
}

test("S3 provider metadata and plain start expose no client secrets; callback cookie is host-only and scoped", async t => {
  const f = fixture(), base = await startTestServer(f.app, t);
  const response = await fetch(`${base}${BASE}/login-providers`);
  assert.deepEqual(await response.json(), { providers: [{ id: "google", label: "Google" }] });
  assert.equal(response.headers.get("cache-control"), "no-store");
  const started = await f.start(base);
  const header = started.response.headers.get("set-cookie")!;
  for (const attribute of ["HttpOnly", "Secure", "SameSite=Lax", `Path=${OIDC}/callback`]) assert.ok(header.includes(attribute));
  assert.ok(!header.includes("Domain="));
  assert.ok(!started.location.href.includes(started.binding.split("=")[1]));
  assert.ok(!started.location.href.includes("secret-never-returned"));
  assert.equal(started.location.searchParams.get("redirect_uri"), `https://site.example${OIDC}/callback`);
});

for (const proof of ["missing", "wrong", "duplicate", "duplicate-spaced", "forwarded"] as const) {
  test(`S3 ${proof} callback binding refuses before exchange and clears cookie`, async t => {
    const f = fixture(), base = await startTestServer(f.app, t), start = await f.start(base);
    const wrong = `${MEMBER_OIDC_BINDING_COOKIE}=${Buffer.alloc(32, 7).toString("base64url")}`;
    const binding = { missing: "", wrong, duplicate: `${start.binding}; ${wrong}`,
      "duplicate-spaced": `${start.binding}; ${wrong.replace("=", " =")}`, forwarded: "tovu_session=staff-only" }[proof];
    const response = await callback(base, start.params, binding);
    assert.equal(response.status, 401); assert.equal(f.exchanges(), 0);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.ok(response.headers.get("set-cookie")!.includes("Expires=Thu, 01 Jan 1970"));
    assert.ok(!cookie(response, "tovu_member_session"));
  });
}

for (const mode of ["tampered", "expired", "denied", "duplicate-state", "duplicate-code"] as const) {
  test(`S3 ${mode} callback is refused without revealing upstream diagnostics`, async t => {
    const f = fixture(), base = await startTestServer(f.app, t), start = await f.start(base);
    if (mode === "tampered") start.params.set("state", `${start.params.get("state")}x`);
    if (mode === "expired") f.clock.advanceMs(600001);
    if (mode === "denied") start.params.set("error", "access_denied");
    if (mode === "duplicate-state") start.params.append("state", "attacker");
    if (mode === "duplicate-code") start.params.append("code", "attacker");
    const response = await callback(base, start.params, start.binding);
    assert.equal(response.status, 401); assert.equal(f.exchanges(), 0);
    assert.deepEqual(await response.json(), { error: "member login failed", code: "LOGIN_INVALID" });
  });
}

for (const override of [{ iss: "https://attacker.example" }, { aud: "wrong" }, { nonce: "wrong" }, { exp: 1 },
  { email_verified: undefined }, { email_verified: "true" }, { email_verified: false }]) {
  test(`S3 invalid OIDC claim ${JSON.stringify(override)} never creates a member session`, async t => {
    const f = fixture(override), base = await startTestServer(f.app, t), start = await f.start(base);
    const response = await callback(base, start.params, start.binding);
    assert.equal(response.status, 401); assert.ok(!cookie(response, "tovu_member_session"));
    assert.deepEqual(await f.members.memberRepo.list({ workspaceId: "ws" }), []);
  });
}

test("S3 invalid signature fails closed", async t => {
  const f = fixture(), base = await startTestServer(f.app, t), start = await f.start(base); f.badSignature();
  assert.equal((await callback(base, start.params, start.binding)).status, 401);
});

test("S3 first auto-link activates pending and revokes active members' existing sessions", async t => {
  for (const status of ["pending", "active"] as const) {
    const f = fixture(), member = await f.seed(status), oldCookie = await f.memberCookie(member);
    const base = await startTestServer(f.app, t), start = await f.start(base);
    const response = await callback(base, start.params, start.binding);
    assert.equal(response.status, 303); assert.equal(response.headers.get("location"), "/account");
    assert.ok(cookie(response, "tovu_member_session"));
    const me = await fetch(`${base}${BASE}/me`, { headers: { cookie: cookie(response, "tovu_member_session") } });
    assert.deepEqual(await me.json(), { member: { id: member.id, email: member.email, status: "active" }, identities: [{ providerId: "google", label: "Google" }] });
    const old = await fetch(`${base}${BASE}/me`, { headers: { cookie: oldCookie } });
    assert.deepEqual(await old.json(), { member: null, identities: [] });
    assert.deepEqual(f.locks.slice(0, 2), ["members:external-identities:ws", "trash:member:ws:member"]);
    assert.equal((await callback(base, start.params, start.binding)).status, 401, "provider code is single-use");
  }
});

for (const status of ["disabled", "trash"] as const) {
  test(`S3 ${status} member cannot link or mint a session`, async t => {
    const f = fixture(); await f.seed(status);
    const base = await startTestServer(f.app, t), start = await f.start(base);
    const response = await callback(base, start.params, start.binding);
    assert.equal(response.status, 401); assert.ok(!cookie(response, "tovu_member_session"));
    assert.deepEqual(await f.identities.listByMember({ workspaceId: "ws", memberId: "member" }), []);
  });
}

test("S3 signed-in connect binds to that member on both legs and /me rejects duplicate member cookies", async t => {
  const f = fixture({ email: "different@custom.example" }); const member = await f.seed();
  const memberCookie = await f.memberCookie(member), base = await startTestServer(f.app, t), start = await f.start(base, memberCookie);
  assert.equal((await callback(base, start.params, start.binding)).status, 401);
  const response = await callback(base, start.params, `${start.binding}; ${memberCookie}`);
  assert.equal(response.status, 303); assert.equal(response.headers.get("location"), "/account");
  assert.equal(f.sent.length, 0, "deliberate connect does not auto-link by mailbox");
  const identity = await f.identities.findBySubject({ workspaceId: "ws", issuer: provider.issuer, subject: "subject" });
  assert.equal(identity?.memberId, member.id);
  const duplicate = await fetch(`${base}${BASE}/me`, { headers: { cookie: `${memberCookie}; ${memberCookie}` } });
  assert.equal(duplicate.status, 401);
});

async function emailContinuation(f: ReturnType<typeof fixture>, base: string) {
  const start = await f.start(base), response = await callback(base, start.params, start.binding);
  assert.equal(response.status, 303);
  const location = new URL(response.headers.get("location")!, "https://site.example");
  assert.equal(location.pathname, "/signin");
  const params = new URLSearchParams(location.hash.slice(1));
  const code = /\b(\d{6})\b/.exec(f.sent.at(-1)!.text!)![1];
  const body = { continuation: params.get("continuation")!, challengeId: params.get("challengeId")!, code };
  assert.equal(params.get("oidc"), "google");
  assert.ok(!JSON.stringify(body).includes("transient-token"));
  assert.ok(!cookie(response, "tovu_member_session"));
  assert.ok(response.headers.getSetCookie().some(value => value.includes(`Path=${OIDC}/verify-email`)));
  return { body, binding: cookie(response, MEMBER_OIDC_PROOF_COOKIE) };
}

test("S3 custom domain requires one browser-bound emailed code; retries spend budget, success clears proof and replay fails", async t => {
  const f = fixture({ email: "person@custom.example" }), base = await startTestServer(f.app, t);
  const proof = await emailContinuation(f, base);
  const wrongCode = proof.body.code === "000000" ? "999999" : "000000";
  assert.equal((await post(base, `${OIDC}/verify-email`, { ...proof.body, code: wrongCode }, proof.binding)).status, 401);
  const challenge = await f.members.magicLinkRepo.findById({ workspaceId: "ws", id: proof.body.challengeId });
  assert.equal(challenge?.failedAttempts, 1);
  const success = await post(base, `${OIDC}/verify-email`, proof.body, proof.binding);
  assert.equal(success.status, 200); assert.ok(cookie(success, "tovu_member_session"));
  assert.ok(success.headers.getSetCookie().some(value => value.startsWith(`${MEMBER_OIDC_PROOF_COOKIE}=`) && value.includes("Expires=Thu, 01 Jan 1970")));
  assert.equal((await post(base, `${OIDC}/verify-email`, proof.body, proof.binding)).status, 401);
  const again = await f.start(base), login = await callback(base, again.params, again.binding);
  assert.equal(login.headers.get("location"), "/account"); assert.equal(f.sent.length, 1);
});

for (const mode of ["missing", "wrong", "duplicate", "tamper", "expire", "disable", "csrf", "inject"] as const) {
  test(`S3 continuation ${mode} refuses before consuming inbox code`, async t => {
    const f = fixture({ email: "person@custom.example" }), base = await startTestServer(f.app, t), proof = await emailContinuation(f, base);
    let binding = proof.binding;
    if (mode === "missing") binding = "";
    if (mode === "wrong") binding = `${MEMBER_OIDC_PROOF_COOKIE}=${Buffer.alloc(32, 8).toString("base64url")}`;
    if (mode === "duplicate") binding = `${binding}; ${binding}`;
    if (mode === "tamper") proof.body.continuation += "x";
    if (mode === "expire") f.clock.advanceMs(600001);
    if (mode === "disable") f.disable();
    const response = await post(base, `${OIDC}/verify-email`, mode === "inject" ? { ...proof.body, emailProofVerified: true } : proof.body,
      binding, mode === "csrf" ? { origin: "https://attacker.example" } : {});
    assert.equal(response.status, mode === "csrf" ? 403 : 401);
    assert.ok(!cookie(response, "tovu_member_session"));
    const challenge = await f.members.magicLinkRepo.findById({ workspaceId: "ws", id: proof.body.challengeId });
    assert.equal(challenge?.failedAttempts, 0); assert.ok(!challenge?.consumedAt);
    assert.deepEqual(await f.members.memberRepo.list({ workspaceId: "ws" }), []);
  });
}

test("S3 linked subject keeps original member when its provider email changes", async t => {
  const f = fixture(), base = await startTestServer(f.app, t), first = await f.start(base);
  const login = await callback(base, first.params, first.binding), original = await (await fetch(`${base}${BASE}/me`, { headers: { cookie: cookie(login, "tovu_member_session") } })).json();
  f.claims.email = "changed@custom.example";
  const second = await f.start(base), result = await callback(base, second.params, second.binding);
  assert.equal(result.headers.get("location"), "/account");
  const current = await (await fetch(`${base}${BASE}/me`, { headers: { cookie: cookie(result, "tovu_member_session") } })).json();
  assert.deepEqual(current, original); assert.equal(f.sent.length, 0);
});

test("S3 unlink marks identity, revokes all old sessions, reissues current, blocks auto-link and permits deliberate reconnect", async t => {
  const f = fixture(), member = await f.seed();
  await f.members.memberRepo.setPasswordHash({ workspaceId: "ws", memberId: member.id, passwordHash: "hash:x" });
  const base = await startTestServer(f.app, t), start = await f.start(base), login = await callback(base, start.params, start.binding);
  const oldCookie = cookie(login, "tovu_member_session"); f.clock.advanceMs(1);
  const response = await post(base, `${BASE}/identities/google/unlink`, {}, oldCookie);
  assert.equal(response.status, 200);
  const replacement = cookie(response, "tovu_member_session"); assert.ok(replacement && replacement !== oldCookie);
  const old = await fetch(`${base}${BASE}/me`, { headers: { cookie: oldCookie } });
  assert.deepEqual(await old.json(), { member: null, identities: [] });
  const current = await fetch(`${base}${BASE}/me`, { headers: { cookie: replacement } });
  assert.deepEqual(await current.json(), { member: { id: member.id, email: member.email, status: "active" }, identities: [] });
  assert.ok((await f.identities.findByMemberAndProvider({ workspaceId: "ws", memberId: member.id, providerId: "google" }))?.unlinkedAt);
  const anonymous = await f.start(base); assert.equal((await callback(base, anonymous.params, anonymous.binding)).status, 401);
  const connect = await f.start(base, replacement);
  assert.equal((await callback(base, connect.params, `${connect.binding}; ${replacement}`)).status, 303);
  assert.ok(!(await f.identities.findByMemberAndProvider({ workspaceId: "ws", memberId: member.id, providerId: "google" }))?.unlinkedAt);
});

for (const mode of ["stale", "no-alternative", "csrf", "duplicate", "staff", "foreign-workspace"] as const) {
  test(`S3 unlink refuses ${mode} without altering association or issuing a session`, async t => {
    const f = fixture(), base = await startTestServer(f.app, t), start = await f.start(base), login = await callback(base, start.params, start.binding);
    let sessionCookie = cookie(login, "tovu_member_session");
    if (mode === "stale") f.clock.advanceMs(900001);
    if (mode === "no-alternative") f.members.mailer.capabilities = () => ({ driver: "console", supportsIdempotencyKey: false, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false });
    if (mode === "duplicate") sessionCookie = `${sessionCookie}; ${sessionCookie}`;
    if (mode === "staff") sessionCookie = "tovu_session=staff-only";
    const path = `${BASE}/identities/google/unlink`.replace("/workspaces/ws/", mode === "foreign-workspace" ? "/workspaces/other/" : "/workspaces/ws/");
    const response = await post(base, path, {}, sessionCookie, mode === "csrf" ? { origin: "https://attacker.example" } : {});
    const expected = new Map<string, number>([["csrf", 403], ["foreign-workspace", 404]]).get(mode) ?? 401;
    assert.equal(response.status, expected);
    assert.ok(!cookie(response, "tovu_member_session"));
    const [member] = await f.members.memberRepo.list({ workspaceId: "ws" });
    assert.ok(!(await f.identities.findByMemberAndProvider({ workspaceId: "ws", memberId: member.id, providerId: "google" }))?.unlinkedAt);
  });
}

test("S3 strict IP limiter stops start and callback before protocol I/O", async t => {
  const f = fixture(), base = await startTestServer(f.app, t), start = await f.start(base);
  const deny = { check: async () => ({ allowed: false as const, retryAfterSeconds: 42 }) };
  f.members.passwordSignInPerIpLimiter = deny;
  assert.equal((await fetch(`${base}${OIDC}/start`, { redirect: "manual" })).status, 429);
  f.members.magicLinkCompleteAttemptLimiter = deny;
  const response = await callback(base, start.params, start.binding);
  assert.equal(response.status, 429); assert.equal(response.headers.get("retry-after"), "42"); assert.equal(f.exchanges(), 0);
});

test("S3 cross-site start is refused before a binding cookie; a revoked member cookie starts anonymously", async t => {
  const f = fixture(), member = await f.seed(), stale = await f.memberCookie(member), base = await startTestServer(f.app, t);
  const forced = await fetch(`${base}${OIDC}/start`, { redirect: "manual", headers: { cookie: stale, "sec-fetch-site": "cross-site" } });
  assert.equal(forced.status, 401); assert.equal(forced.headers.get("location"), null);
  assert.ok(!cookie(forced, MEMBER_OIDC_BINDING_COOKIE));
  await f.members.memberSessionRepo.revokeAllForMember({ workspaceId: "ws", memberId: member.id, revokedAt: f.clock.nowIso() });
  const start = await f.start(base, stale), login = await callback(base, start.params, `${start.binding}; ${stale}`);
  assert.equal(login.status, 303); assert.equal(login.headers.get("location"), "/account");
  assert.ok(cookie(login, "tovu_member_session"));
});

test("S3 unlink fences outstanding anonymous redirects and signed-in connects", async t => {
  const f = fixture(), member = await f.seed();
  await f.members.memberRepo.setPasswordHash({ workspaceId: "ws", memberId: member.id, passwordHash: "hash:x" });
  const base = await startTestServer(f.app, t), first = await f.start(base), login = await callback(base, first.params, first.binding);
  const sessionCookie = cookie(login, "tovu_member_session");
  const anonymous = await f.start(base), connect = await f.start(base, sessionCookie);
  f.clock.advanceMs(1);
  assert.equal((await post(base, `${BASE}/identities/google/unlink`, {}, sessionCookie)).status, 200);
  assert.equal((await callback(base, anonymous.params, anonymous.binding)).status, 401);
  assert.equal((await callback(base, connect.params, `${connect.binding}; ${sessionCookie}`)).status, 401);
  assert.ok((await f.identities.findByMemberAndProvider({ workspaceId: "ws", memberId: member.id, providerId: "google" }))?.unlinkedAt);
});

test("S3 provider disable after start and workspace mismatch refuse completion before exchange", async t => {
  const f = fixture(), base = await startTestServer(f.app, t), start = await f.start(base);
  f.disable();
  assert.equal((await callback(base, start.params, start.binding)).status, 401);
  const foreign = await fetch(`${base}${OIDC.replace("/workspaces/ws/", "/workspaces/other/")}/callback?${start.params}`, { headers: { cookie: start.binding } });
  assert.equal(foreign.status, 404); assert.equal(f.exchanges(), 0);
  assert.deepEqual(await (await fetch(`${base}${BASE}/login-providers`)).json(), { providers: [] });
});

test("S3 a pending member's provisioned password is not a usable alternative for unlink", async t => {
  const f = fixture({ email: "different@custom.example" }), member = await f.seed("pending");
  await f.members.memberRepo.setPasswordHash({ workspaceId: "ws", memberId: member.id, passwordHash: "hash:x" });
  const sessionCookie = await f.memberCookie(member), base = await startTestServer(f.app, t), start = await f.start(base, sessionCookie);
  const login = await callback(base, start.params, `${start.binding}; ${sessionCookie}`);
  assert.equal(login.status, 303);
  f.members.mailer.capabilities = () => ({ driver: "console", supportsIdempotencyKey: false, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false });
  const response = await post(base, `${BASE}/identities/google/unlink`, {}, cookie(login, "tovu_member_session"));
  assert.equal(response.status, 401);
  assert.ok(!(await f.identities.findByMemberAndProvider({ workspaceId: "ws", memberId: member.id, providerId: "google" }))?.unlinkedAt);
});
