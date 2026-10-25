import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
/** Shard D: real HTTP security contracts, with transactional member storage and a deterministic hasher. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { after } from "node:test";
import express from "express";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { freshSqliteContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqlMagicLinkTokenRepo, SqlMemberRepo, SqlMemberSessionRepo } from "#src/features/members/repo";
import {
  InMemoryMemberSubscriptionRepo, InMemoryMemberTierRepo, requestSignInLink, requestPasswordReset,
  type MemberRecord, type OutboundEmail,
} from "#src/features/members/index";
import { issueMemberSession } from "#src/features/members/write-service";
import {
  createRateLimiter, LOGIN_STRICT, MAGIC_LINK_COMPLETE_ATTEMPT, MAGIC_LINK_PER_EMAIL, MAGIC_LINK_PER_IP,
  type RateLimiter,
} from "#src/contracts/core/rate-limit/rate-limit";
import { toPublicMembersWriteServiceDeps, type MemberPublicRouteDeps } from "../../inbound/public-http/routes/members/deps.js";
import { registerPublicMemberSignInRequestRoute } from "../../inbound/public-http/routes/members/sign-in.js";
import { registerPublicMemberCompleteSignInRoute } from "../../inbound/public-http/routes/members/complete-sign-in.js";
import { registerPublicMemberPasswordSignInRoute } from "../../inbound/public-http/routes/members/password-sign-in.js";
import { registerPublicMemberForgotPasswordRoute } from "../../inbound/public-http/routes/members/forgot-password.js";
import { registerPublicMemberResetPasswordRoute } from "../../inbound/public-http/routes/members/reset-password.js";
import { registerPublicMemberSetPasswordRoute } from "../../inbound/public-http/routes/members/set-password.js";
import { registerPublicMemberMeRoute } from "../../inbound/public-http/routes/members/me.js";
import { registerPublicMemberSignOutRoute } from "../../inbound/public-http/routes/members/sign-out.js";
import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { startTestServer } from "../helpers/http-test-server.js";

const BASE = "/api/members/v1/workspaces/member-http";
const INVALID = { error: "invalid credentials", code: "INVALID_CREDENTIALS" };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const hash = (value: string) => `test:${digest(value)}`;

function harness() {
  const kernel = freshSqliteContentKernel();
  after(() => kernel.close());
  const clock = createFakeClock({ startIso: "2026-10-24T12:00:00.000Z" });
  const sent: OutboundEmail[] = [];
  let sequence = 0;
  const deps: MemberPublicRouteDeps = {
    credentialLifecycle: kernel,
    workspaceId: "member-http", clock, idGen: { newId: () => `id-${++sequence}` },
    memberRepo: new SqlMemberRepo(kernel), memberSessionRepo: new SqlMemberSessionRepo(kernel),
    memberTierRepo: new InMemoryMemberTierRepo(), memberSubscriptionRepo: new InMemoryMemberSubscriptionRepo(),
    magicLinkRepo: new SqlMagicLinkTokenRepo(kernel), principalRepo: new InMemoryPrincipalRepo({}),
    passwordHasher: { hash: async ({ password }) => hash(password), verify: async input => input.hash === hash(input.password) },
    origin: {
      canonicalOrigin: async () => ({ scheme: "https", host: "members.example.test", source: "workspace-setting", verifiedAt: clock.nowIso() }),
      isAllowedRedirectTarget: async () => false, isAllowedEgressTarget: async () => false,
    },
    mailer: {
      capabilities: () => ({ driver: "memory", supportsIdempotencyKey: true, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }),
      send: async message => { sent.push(message); return { ok: true, providerMessageId: "sent", acceptedAt: clock.nowIso() }; },
      sendBatch: async () => [],
    },
    magicLinkPerEmailLimiter: createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock }),
    magicLinkPerIpLimiter: createRateLimiter({ profile: MAGIC_LINK_PER_IP, clock }),
    magicLinkCompleteAttemptLimiter: createRateLimiter({ profile: MAGIC_LINK_COMPLETE_ATTEMPT, clock }),
    passwordSignInPerEmailLimiter: createRateLimiter({ profile: LOGIN_STRICT, clock }),
    passwordSignInPerIpLimiter: createRateLimiter({ profile: LOGIN_STRICT, clock }),
    passwordSetPerMemberLimiter: createRateLimiter({ profile: LOGIN_STRICT, clock }),
  };
  const app = express();
  app.use(express.json());
  for (const register of [registerPublicMemberSignInRequestRoute, registerPublicMemberCompleteSignInRoute,
    registerPublicMemberPasswordSignInRoute, registerPublicMemberForgotPasswordRoute, registerPublicMemberResetPasswordRoute,
    registerPublicMemberMeRoute, registerPublicMemberSignOutRoute, registerPublicMemberSetPasswordRoute]) register(app, deps);
  async function seed(email = "ada@example.test", status: MemberRecord["status"] = "active", password: string | null = "x") {
    const member: MemberRecord = { id: email, workspaceId: deps.workspaceId, email, status,
      createdAt: clock.nowIso(), updatedAt: clock.nowIso(), version: 1 };
    await deps.memberRepo.save(member);
    if (password !== null && status !== "trash") await deps.memberRepo.setPasswordHash({ workspaceId: deps.workspaceId,
      memberId: member.id, passwordHash: hash(password) });
    return member;
  }
  async function challenge(purpose: "signin" | "password_reset" = "signin") {
    const input = { workspaceId: deps.workspaceId, email: "ada@example.test" };
    const serviceDeps = toPublicMembersWriteServiceDeps(deps);
    if (purpose === "signin") await requestSignInLink({ deps: serviceDeps, input });
    else await requestPasswordReset({ deps: serviceDeps, input });
    const text = sent.at(-1)!.text!;
    const token = /#(?:magic|token)=([a-f0-9]+)/.exec(text)?.[1];
    assert.ok(token);
    const record = await deps.magicLinkRepo.findByTokenHash({ workspaceId: deps.workspaceId, tokenHash: digest(token) });
    assert.ok(record);
    return { token, challengeId: record.id, code: /\b(\d{6})\b/.exec(text)?.[1] };
  }
  async function cookieFor(member: MemberRecord) {
    const result = await issueMemberSession({ deps: toPublicMembersWriteServiceDeps(deps), member, nowIso: clock.nowIso() });
    return `tovu_member_session=${result.rawSessionToken}`;
  }
  return { app, deps, seed, challenge, sent, clock, cookieFor };
}

function post(base: string, path: string, body: unknown = {}, headers: Record<string, string> = {}) {
  return fetch(`${base}${BASE}/${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
}

function spyLimiter(allowed: boolean) {
  const keys: string[] = [];
  const limiter: RateLimiter = { check: async ({ key }) => {
    keys.push(key);
    return allowed ? { allowed: true } : { allowed: false, retryAfterSeconds: 42 };
  } };
  return { keys, limiter };
}

for (const method of ["link", "code"]) {
  test(`D2: fresh ${method} session sets a password and retains only its own cookie session`, async t => {
    const h = harness(); const member = await h.seed("ada@example.test", "active", null);
    const otherCookie = await h.cookieFor(member);
    const challenge = await h.challenge();
    const base = await startTestServer(h.app, t);
    const proof = method === "link" ? { token: challenge.token } : { challengeId: challenge.challengeId, code: challenge.code };
    const login = await post(base, "sign-in/complete", proof);
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const result = await post(base, "password/set", { password: "🙂" }, { cookie });
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { ok: true });
    assert.equal(result.headers.has("set-cookie"), false);
    const me = await fetch(`${base}${BASE}/me`, { headers: { cookie } });
    assert.deepEqual(await me.json(), { member: { id: member.id, email: member.email, status: "active" }, identities: [] });
    const other = await fetch(`${base}${BASE}/me`, { headers: { cookie: otherCookie } });
    assert.deepEqual(await other.json(), { member: null, identities: [] });
    assert.equal(await h.deps.memberRepo.findPasswordHash({ workspaceId: h.deps.workspaceId, memberId: member.id }), hash("🙂"));
    const sessions = await h.deps.memberSessionRepo.listByMember({ workspaceId: h.deps.workspaceId, memberId: member.id });
    assert.equal(sessions.length, 2);
    assert.equal(sessions.filter(s => !s.revokedAt).length, 1);
  });
}

test("D2: existing password gives uniform 401 for missing/wrong proof and changes with exact proof", async t => {
  const h = harness(); const member = await h.seed(); const cookie = await h.cookieFor(member);
  const base = await startTestServer(h.app, t);
  for (const body of [{ password: "y" }, { password: "y", currentPassword: "wrong" }]) {
    const response = await post(base, "password/set", body, { cookie });
    assert.equal(response.status, 401); assert.deepEqual(await response.json(), INVALID);
  }
  h.clock.advanceMs(16 * 60_000);
  const changed = await post(base, "password/set", { password: " y ", currentPassword: "x" }, { cookie });
  assert.equal(changed.status, 200); assert.deepEqual(await changed.json(), { ok: true });
  const login = await post(base, "password/sign-in", { email: member.email, password: " y " });
  assert.equal(login.status, 200);
});

test("D2: passwordless stale session returns UI reauthentication code and leaves credentials untouched", async t => {
  const h = harness(); const member = await h.seed("ada@example.test", "active", null);
  const cookie = await h.cookieFor(member);
  h.clock.advanceMs(15 * 60_000 + 1);
  const base = await startTestServer(h.app, t);
  const response = await post(base, "password/set", { password: "x" }, { cookie });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "sign in again to set a password", code: "REAUTHENTICATION_REQUIRED" });
  assert.equal(await h.deps.memberRepo.findPasswordHash({ workspaceId: h.deps.workspaceId, memberId: member.id }), null);
});

test("D2: missing/staff/unknown/revoked/expired cookies and disabled members cannot set a password", async t => {
  const h = harness(); const member = await h.seed("ada@example.test", "active", null);
  const cookie = await h.cookieFor(member);
  const base = await startTestServer(h.app, t);
  for (const invalidCookie of ["", "tovu_session=staff", "tovu_member_session=unknown"]) {
    const response = await post(base, "password/set", { password: "x" }, { cookie: invalidCookie });
    assert.equal(response.status, 401); assert.deepEqual(await response.json(), INVALID);
  }
  for (const state of ["revoked", "expired", "disabled"]) {
    const [session] = await h.deps.memberSessionRepo.listByMember({ workspaceId: h.deps.workspaceId, memberId: member.id });
    await h.deps.memberSessionRepo.save({ ...session,
      revokedAt: state === "revoked" ? h.clock.nowIso() : undefined,
      expiresAt: state === "expired" ? h.clock.nowIso() : "2026-11-24T12:00:00.000Z" });
    if (state === "disabled") await h.deps.memberRepo.save({ ...member, status: "disabled", version: 2 });
    const response = await post(base, "password/set", { password: "x" }, { cookie });
    assert.equal(response.status, 401); assert.deepEqual(await response.json(), INVALID);
  }
});

for (const denied of ["member", "ip"]) {
  test(`D2: ${denied} limiter denies before hashing and both strict counters are charged`, async t => {
    const h = harness(); const member = await h.seed(); const cookie = await h.cookieFor(member);
    const memberLimit = spyLimiter(denied !== "member"), ipLimit = spyLimiter(denied !== "ip");
    h.deps.passwordSetPerMemberLimiter = memberLimit.limiter;
    h.deps.passwordSignInPerIpLimiter = ipLimit.limiter;
    h.deps.passwordHasher.verify = async () => assert.fail("limited request must not verify");
    h.deps.passwordHasher.hash = async () => assert.fail("limited request must not hash");
    const base = await startTestServer(h.app, t);
    const response = await post(base, "password/set", { password: "y", currentPassword: "x" }, { cookie });
    assert.equal(response.status, 429); assert.equal(response.headers.get("retry-after"), "42");
    assert.deepEqual(memberLimit.keys, [member.id]); assert.equal(ipLimit.keys.length, 1);
  });
}

test("D2: LOGIN_STRICT exhausts after ten current-password guesses and resets after the window", async t => {
  const h = harness(); const member = await h.seed(); const cookie = await h.cookieFor(member);
  const base = await startTestServer(h.app, t);
  for (let attempt = 0; attempt < 10; attempt++) {
    assert.equal((await post(base, "password/set", { password: "y", currentPassword: "wrong" }, { cookie })).status, 401);
  }
  assert.equal((await post(base, "password/set", { password: "y", currentPassword: "x" }, { cookie })).status, 429);
  h.clock.advanceMs(60_001);
  assert.equal((await post(base, "password/set", { password: "y", currentPassword: "x" }, { cookie })).status, 200);
});

test("D2: set-password policy matches reset and workspace mismatch is 404", async t => {
  const h = harness(); const member = await h.seed("ada@example.test", "active", null);
  const cookie = await h.cookieFor(member); const base = await startTestServer(h.app, t);
  for (const password of ["", "x".repeat(513)]) {
    assert.equal((await post(base, "password/set", { password }, { cookie })).status, 400);
  }
  const foreign = await fetch(`${base}/api/members/v1/workspaces/foreign/password/set`, {
    method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ password: "x" }),
  });
  assert.equal(foreign.status, 404);
});

test("password account classes, links, codes and reset failures share exactly one 401", async t => {
  const h = harness();
  await h.seed();
  await h.seed("disabled@example.test", "disabled");
  await h.seed("pending@example.test", "pending");
  await h.seed("passwordless@example.test", "active", null);
  await h.seed("trashed@example.test", "trash");
  const base = await startTestServer(h.app, t);
  const cases: Array<[string, unknown]> = [
    ...["missing", "disabled", "pending", "passwordless", "trashed"].map(name =>
      ["password/sign-in", { email: `${name}@example.test`, password: "x" }] as [string, unknown]),
    ["password/sign-in", { email: "ada@example.test", password: "wrong" }],
    ["sign-in/complete", { token: "unknown" }],
    ["sign-in/complete", { challengeId: "missing", code: "000000" }],
    ["reset-password", { token: "unknown", password: "x" }],
  ];
  for (const [path, body] of cases) {
    const response = await post(base, path, body);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), INVALID);
    assert.equal(response.headers.has("set-cookie"), false);
  }
});

test("every member POST refuses cross-origin and form requests before service work", async t => {
  const h = harness();
  h.deps.memberRepo.findByEmail = async () => assert.fail("must refuse before lookup");
  const base = await startTestServer(h.app, t);
  for (const path of ["sign-in", "sign-in/complete", "password/sign-in", "password/set", "forgot-password", "reset-password", "sign-out"]) {
    for (const headers of [{ origin: "https://attacker.test" }, { "content-type": "application/x-www-form-urlencoded" }] as Record<string, string>[]) {
      const response = await post(base, path, {}, headers);
      assert.equal(response.status, 403, path);
      assert.equal(response.headers.has("set-cookie"), false);
    }
  }
});

test("malformed body shapes and missing IDs return 400 before repository access", async t => {
  const h = harness();
  h.deps.magicLinkRepo.findById = async () => assert.fail("missing id must never reach repo");
  h.deps.memberRepo.findByEmail = async () => assert.fail("shape validation must precede lookup");
  const base = await startTestServer(h.app, t);
  const cases: Array<[string, unknown]> = [
    ["sign-in", {}], ["sign-in", { email: 1 }], ["sign-in", { email: "a@b.test", redirectPath: 2 }],
    ["forgot-password", { email: [] }], ["password/sign-in", { email: "a@b.test" }],
    ["password/sign-in", { email: {}, password: "x" }], ["password/sign-in", { email: "a@b.test", password: 2 }],
    ["reset-password", { token: "x" }], ["reset-password", { token: 1, password: "x" }],
    ["reset-password", { challengeId: "x", code: "000000", password: "x" }],
    ["password/set", {}], ["password/set", { password: 1 }], ["password/set", { password: "x", currentPassword: 1 }],
    ["password/set", { password: "x", memberId: "someone-else" }],
    ["sign-in/complete", {}], ["sign-in/complete", { code: "000000" }],
    ["sign-in/complete", { challengeId: "", code: "000000" }], ["sign-in/complete", { token: 1 }],
    ["sign-in/complete", { token: "x", challengeId: "x", code: "000000" }],
    ["sign-in/complete", { challengeId: "x", code: 123456 }],
    ["sign-in/complete", { challengeId: "x", code: "12345" }],
    ["sign-in/complete", ["x"]],
  ];
  for (const [path, body] of cases) assert.equal((await post(base, path, body)).status, 400, `${path}: ${JSON.stringify(body)}`);
});

test("strict password limiters both hit on normalized email and IP, including denied checks", async t => {
  for (const allowed of [true, false]) {
    const h = harness();
    const email = spyLimiter(allowed), ip = spyLimiter(allowed);
    h.deps.passwordSignInPerEmailLimiter = email.limiter;
    h.deps.passwordSignInPerIpLimiter = ip.limiter;
    const base = await startTestServer(h.app, t);
    const response = await post(base, "password/sign-in", { email: " ADA@EXAMPLE.TEST ", password: "x" });
    assert.equal(response.status, allowed ? 401 : 429);
    assert.deepEqual(email.keys, ["ada@example.test"]);
    assert.equal(ip.keys.length, 1);
    assert.match(ip.keys[0], /(?:^|:)127\.0\.0\.1$/);
    if (!allowed) assert.equal(response.headers.get("retry-after"), "42");
  }
});

test("forgot and sign-in reuse both magic-link counters", async t => {
  const h = harness();
  const email = spyLimiter(false), ip = spyLimiter(false);
  h.deps.magicLinkPerEmailLimiter = email.limiter;
  h.deps.magicLinkPerIpLimiter = ip.limiter;
  const base = await startTestServer(h.app, t);
  for (const path of ["sign-in", "forgot-password"]) {
    const response = await post(base, path, { email: " ADA@EXAMPLE.TEST " });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("retry-after"), "42");
  }
  assert.deepEqual(email.keys, ["ada@example.test", "ada@example.test"]);
  assert.equal(ip.keys.length, 2);
  assert.equal(ip.keys[0], ip.keys[1]);
  assert.match(ip.keys[0], /(?:^|:)127\.0\.0\.1$/);
});

test("password bodies over 4 KB stop before lookup or hashing", async t => {
  const h = harness();
  h.deps.memberRepo.findByEmail = async () => assert.fail("oversized body must not look up address");
  const base = await startTestServer(h.app, t);
  for (const path of ["password/sign-in", "password/set", "reset-password"]) {
    const response = await post(base, path, { email: "ada@example.test", token: "x", password: "x".repeat(4096) });
    assert.equal(response.status, 413);
  }
});

for (const path of ["sign-in", "forgot-password"]) {
  test(`${path}: known, missing and disabled acceptance does not await lookup`, async t => {
    const h = harness();
    await h.seed(); await h.seed("disabled@example.test", "disabled");
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const find = h.deps.memberRepo.findByEmail.bind(h.deps.memberRepo);
    h.deps.memberRepo.findByEmail = async input => { await gate; return find(input); };
    const base = await startTestServer(h.app, t);
    try {
      for (const email of ["ada@example.test", "missing@example.test", "disabled@example.test"]) {
        const response = await post(base, path, { email });
        assert.equal(response.status, 200);
        const body = await response.json() as Record<string, unknown>;
        if (path === "sign-in") {
          assert.deepEqual(Object.keys(body).sort(), ["accepted", "challengeId"]);
          assert.equal(typeof body.challengeId, "string");
        } else assert.deepEqual(body, { accepted: true });
        assert.equal(body.accepted, true);
      }
    } finally { release(); }
  });

  test(`${path}: response does not await suppressed mail`, async t => {
    const h = harness(); await h.seed();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    h.deps.mailer.send = async () => {
      await gate;
      return { ok: false, retryable: false, errorCode: "MAIL_RECIPIENT_SUPPRESSED", message: "private" };
    };
    const base = await startTestServer(h.app, t);
    try {
      const response = await post(base, path, { email: "ada@example.test" });
      assert.equal(response.status, 200);
      const body = await response.json() as Record<string, unknown>;
      assert.equal(body.accepted, true);
      assert.equal("delivered" in body, false);
    } finally { release(); }
  });

  test(`${path}: site-wide missing mail or origin stays 503 before address lookup`, async t => {
    for (const missing of ["mail", "origin"]) {
      const h = harness();
      if (missing === "mail") {
        const caps = h.deps.mailer.capabilities();
        h.deps.mailer.capabilities = () => ({ ...caps, driver: "console" });
      } else h.deps.origin = undefined;
      h.deps.memberRepo.findByEmail = async () => assert.fail("setup must precede lookup");
      const base = await startTestServer(h.app, t);
      let previous: unknown;
      for (const email of ["known@example.test", "missing@example.test"]) {
        const response = await post(base, path, { email });
        assert.equal(response.status, 503);
        const body = await response.json() as { code: string };
        assert.equal(body.code, "MEMBER_SIGN_IN_UNAVAILABLE");
        if (previous) assert.deepEqual(body, previous);
        previous = body;
      }
    }
  });
}

test("password session, /me status/no-store, and idempotent sign-out share cookie attributes", async t => {
  const h = harness(); const member = await h.seed();
  const base = await startTestServer(h.app, t);
  const login = await post(base, "password/sign-in", { email: member.email, password: "x" });
  assert.equal(login.status, 200);
  assert.deepEqual(await login.json(), { member: { id: member.id, email: member.email, status: "active" } });
  const setCookie = login.headers.get("set-cookie")!;
  assert.match(setCookie, /^tovu_member_session=/);
  for (const attribute of ["Path=/", "HttpOnly", "Secure", "SameSite=Lax"]) assert.ok(setCookie.includes(attribute));
  const cookie = setCookie.split(";")[0];
  async function me(rawCookie: string) {
    const response = await fetch(`${base}${BASE}/me`, { headers: { cookie: rawCookie } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    return response.json();
  }
  assert.deepEqual(await me(cookie), { member: { id: member.id, email: member.email, status: "active" }, identities: [] });
  assert.deepEqual(await me("tovu_session=staff-cookie"), { member: null, identities: [] });
  await h.deps.memberRepo.save({ ...member, status: "pending", version: 2 });
  assert.deepEqual(await me(cookie), { member: { id: member.id, email: member.email, status: "pending" }, identities: [] });
  await h.deps.memberRepo.save({ ...member, status: "disabled", version: 3 });
  assert.deepEqual(await me(cookie), { member: null, identities: [] });
  // Trash is terminal in the repo, so it is checked last.
  await h.deps.memberRepo.save({ ...member, status: "trash", version: 4 });
  assert.deepEqual(await me(cookie), { member: null, identities: [] });
  for (let attempt = 0; attempt < 2; attempt++) {
    const logout = await post(base, "sign-out", {}, { cookie });
    assert.equal(logout.status, 204);
    const clear = logout.headers.get("set-cookie")!;
    for (const attribute of ["Path=/", "HttpOnly", "Secure", "SameSite=Lax"]) assert.ok(clear.includes(attribute));
    assert.match(clear, /Expires=Thu, 01 Jan 1970/);
  }
  assert.deepEqual(await me(cookie), { member: null, identities: [] });
  const sessions = await h.deps.memberSessionRepo.listByMember({ workspaceId: h.deps.workspaceId, memberId: member.id });
  assert.ok(sessions[0].revokedAt);
});

test("link/code purpose and replay failures share 401; reset accepts one-character passwords without a cookie", async t => {
  const h = harness(); await h.seed();
  const base = await startTestServer(h.app, t);
  const signIn = await h.challenge();
  const reset = await h.challenge("password_reset");
  for (const [path, body] of [
    ["sign-in/complete", { token: reset.token }],
    ["reset-password", { token: signIn.token, password: "x" }],
  ] as const) {
    const response = await post(base, path, body);
    assert.equal(response.status, 401); assert.deepEqual(await response.json(), INVALID);
  }
  const complete = await post(base, "sign-in/complete", { challengeId: signIn.challengeId, code: signIn.code });
  assert.equal(complete.status, 200);
  assert.match(complete.headers.get("set-cookie")!, /^tovu_member_session=/);
  const replay = await post(base, "sign-in/complete", { token: signIn.token });
  assert.equal(replay.status, 401); assert.deepEqual(await replay.json(), INVALID);
  for (const password of ["", "x".repeat(513)]) {
    const rejected = await post(base, "reset-password", { token: reset.token, password });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.headers.has("set-cookie"), false);
  }
  const result = await post(base, "reset-password", { token: reset.token, password: "🙂" });
  assert.equal(result.status, 200); assert.deepEqual(await result.json(), { ok: true });
  assert.equal(result.headers.has("set-cookie"), false);
});

test("challenge CAS rejection is 401 but database outage surfaces as 500", async t => {
  const h = harness(); await h.seed();
  const base = await startTestServer(h.app, t);
  const challenge = await h.challenge();
  h.deps.magicLinkRepo.consume = async ({ id }) => { throw new Error(`magic link token '${id}' was already consumed`); };
  const invalid = await post(base, "sign-in/complete", { token: challenge.token });
  assert.equal(invalid.status, 401); assert.deepEqual(await invalid.json(), INVALID);
  h.deps.magicLinkRepo.consume = async () => { throw new Error("database connection lost"); };
  const unavailable = await post(base, "sign-in/complete", { token: challenge.token });
  assert.equal(unavailable.status, 500); assert.deepEqual(await unavailable.json(), { error: "internal error" });
});


test("createApp uses the staff hasher and admin routes reject a valid member cookie", async t => {
  const deps = createRouteDeps();
  const kernel = freshSqliteContentKernel();
  t.after(() => kernel.close());
  deps.contentKernel = kernel;
  deps.memberRepo = new SqlMemberRepo(kernel);
  deps.memberSessionRepo = new SqlMemberSessionRepo(kernel);
  deps.magicLinkRepo = new SqlMagicLinkTokenRepo(kernel);
  const member: MemberRecord = { id: "cookie-realm-member", workspaceId: deps.workspaceId,
    email: "realm@example.test", status: "active", createdAt: deps.clock.nowIso(), updatedAt: deps.clock.nowIso(), version: 1 };
  await deps.memberRepo.save(member);
  await deps.memberRepo.setPasswordHash({ workspaceId: deps.workspaceId, memberId: member.id,
    passwordHash: await deps.passwordHasher.hash({ password: "x" }) });
  let staffVerifications = 0;
  const verify = deps.passwordHasher.verify.bind(deps.passwordHasher);
  deps.passwordHasher.verify = async input => { staffVerifications += 1; return verify(input); };
  const base = await startTestServer(createApp(deps), t);
  const login = await fetch(`${base}/api/members/v1/workspaces/${deps.workspaceId}/password/sign-in`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: member.email, password: "x" }),
  });
  assert.equal(login.status, 200);
  assert.equal(staffVerifications, 1);
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const changed = await fetch(`${base}/api/members/v1/workspaces/${deps.workspaceId}/password/set`, {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ password: "y", currentPassword: "x" }),
  });
  assert.equal(changed.status, 200);
  assert.deepEqual(await changed.json(), { ok: true });
  assert.equal(staffVerifications, 2, "set-password uses the injected staff Argon2 hasher");
  const admin = await fetch(`${base}/api/admin/v1/workspaces/${deps.workspaceId}/members`, { headers: { cookie } });
  assert.equal(admin.status, 401);
});


test("memory-only createApp still changes passwords and revalidates concurrent changes", async t => {
  // No contentKernel: the composition must supply its in-process lifecycle, not fail closed.
  const deps = createRouteDeps();
  assert.equal(deps.contentKernel, undefined);
  const member: MemberRecord = { id: "memory-member", workspaceId: deps.workspaceId,
    email: "memory@example.test", status: "active", createdAt: deps.clock.nowIso(), updatedAt: deps.clock.nowIso(), version: 1 };
  await deps.memberRepo.save(member);
  await deps.memberRepo.setPasswordHash({ workspaceId: deps.workspaceId, memberId: member.id,
    passwordHash: await deps.passwordHasher.hash({ password: "x" }) });
  const base = await startTestServer(createApp(deps), t);
  const route = (path: string) => `${base}/api/members/v1/workspaces/${deps.workspaceId}/password/${path}`;
  const json = (body: object, cookie?: string) => ({ method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  const login = await fetch(route("sign-in"), json({ email: member.email, password: "x" }));
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const statuses = (await Promise.all(["y", "z"].map(password =>
    fetch(route("set"), json({ password, currentPassword: "x" }, cookie))))).map(r => r.status).sort();
  assert.deepEqual(statuses, [200, 401], "the second change revalidates against the first one's credential");
  const signIns = await Promise.all(["y", "z"].map(password => fetch(route("sign-in"), json({ email: member.email, password }))));
  assert.deepEqual(signIns.map(r => r.status).sort(), [200, 401]);
});

test("expired, consumed, exhausted, wrong-purpose and wrong-code challenges share the same 401", async t => {
  const h = harness(); await h.seed();
  const base = await startTestServer(h.app, t);
  for (const state of ["expired", "consumed", "exhausted", "wrong-purpose", "wrong-code"]) {
    const challenge = await h.challenge();
    const record = await h.deps.magicLinkRepo.findById({ workspaceId: h.deps.workspaceId, id: challenge.challengeId });
    assert.ok(record);
    await h.deps.magicLinkRepo.save({ ...record,
      expiresAt: state === "expired" ? h.clock.nowIso() : record.expiresAt,
      consumedAt: state === "consumed" ? h.clock.nowIso() : undefined,
      failedAttempts: state === "exhausted" ? 5 : 0,
      purpose: state === "wrong-purpose" ? "password_reset" : "signin",
    });
    const wrongCode = challenge.code === "000000" ? "999999" : "000000";
    const response = await post(base, "sign-in/complete", { challengeId: challenge.challengeId,
      code: state === "wrong-code" ? wrongCode : challenge.code });
    assert.equal(response.status, 401, state);
    assert.deepEqual(await response.json(), INVALID);
  }
});

// F6 fix wave (L12 Stryker top-3, me.ts:16): a valid member cookie presented under ANOTHER workspace's
// /me path is a 404 that never resolves the session or returns the member.
test("/me under a foreign workspace id is 404 even with a valid member session cookie", async t => {
  const h = harness(); const member = await h.seed();
  const cookie = await h.cookieFor(member);
  const base = await startTestServer(h.app, t);
  const foreign = await fetch(`${base}/api/members/v1/workspaces/foreign/me`, { headers: { cookie } });
  assert.equal(foreign.status, 404);
  assert.equal(foreign.headers.get("cache-control"), "no-store");
  assert.deepEqual(await foreign.json(), { error: "workspace was not found" });
  const own = await fetch(`${base}${BASE}/me`, { headers: { cookie } });
  assert.deepEqual(await own.json(), { member: { id: member.id, email: member.email, status: "active" }, identities: [] });
});

// F6 fix wave (Stryker re-score of complete-sign-in.ts): the session cookie lives exactly as long as
// the session row (Max-Age = remaining lifetime, never 0 or doubled), and the completion limiter stops
// a request before any challenge is touched.
test("the member session cookie's Max-Age is the session's remaining lifetime", async t => {
  const h = harness(); const member = await h.seed();
  const base = await startTestServer(h.app, t);
  const login = await post(base, "password/sign-in", { email: member.email, password: "x" });
  assert.equal(login.status, 200);
  const maxAge = Number(/Max-Age=(\d+)/.exec(login.headers.get("set-cookie")!)?.[1]);
  const [session] = await h.deps.memberSessionRepo.listByMember({ workspaceId: h.deps.workspaceId, memberId: member.id });
  const remaining = (Date.parse(session!.expiresAt) - Date.now()) / 1000;
  assert.ok(maxAge > 0 && Math.abs(maxAge - remaining) <= 5, `Max-Age ${maxAge} vs remaining ${remaining}`);
});

test("sign-in completion stops at its per-IP limiter with 429 before the challenge is read", async t => {
  const h = harness(); await h.seed();
  const challenge = await h.challenge();
  const { limiter, keys } = spyLimiter(false);
  h.deps.magicLinkCompleteAttemptLimiter = limiter;
  const base = await startTestServer(h.app, t);
  const response = await post(base, "sign-in/complete", { token: challenge.token });
  assert.equal(response.status, 429);
  assert.equal((await response.json() as { code: string }).code, "RATE_LIMIT_EXCEEDED");
  assert.equal(keys.length, 1);
  assert.equal((await h.deps.magicLinkRepo.findById({ workspaceId: h.deps.workspaceId, id: challenge.challengeId }))?.consumedAt, undefined);
});
