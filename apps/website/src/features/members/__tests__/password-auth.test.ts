/** OPUS-REVIEW shard C: password policy, anti-enumeration, reset cutoff and password/reset races. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import type { OutboundEmail } from "#src/platform/mail/index";
import type { MembersWriteServiceDeps } from "../ports.js";
import {
  InMemoryMagicLinkTokenRepo, InMemoryMemberRepo, InMemoryMemberSessionRepo,
  InMemoryMemberSubscriptionRepo, InMemoryMemberTierRepo,
} from "../repo.memory.js";
import { completeSignIn, issueMemberSession, requestSignInLink } from "../write-service.js";
import { requestPasswordReset, resetPassword, setMemberPassword, signInWithPassword } from "../password-auth.js";
import { MemberAuthError, MemberReauthenticationRequiredError, MemberValidationError, type MemberRecord } from "../types.js";

const WS = "member-passwords";
const EMAIL = "ada@example.test";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const credentialHash = (value: string) => `test-hash:${digest(value)}`;

function harness() {
  const clock = createFakeClock({ startIso: "2026-10-24T12:00:00.000Z" });
  let seq = 0;
  const sent: OutboundEmail[] = [];
  const verifications: Array<{ hash: string; password: string }> = [];
  const hashInputs: string[] = [];
  const deps: MembersWriteServiceDeps = {
    // Policy tests use memory ports; real lock/rollback guarantees live in password-lifecycle.dialects.test.ts.
    credentialLifecycle: { transaction: work => work(), lockKey: async () => {} },
    clock, ids: { newId: () => `id-${++seq}` }, members: new InMemoryMemberRepo(),
    sessions: new InMemoryMemberSessionRepo(), magicLinks: new InMemoryMagicLinkTokenRepo(),
    subscriptions: new InMemoryMemberSubscriptionRepo(), tiers: new InMemoryMemberTierRepo(),
    principals: new InMemoryPrincipalRepo({}),
    passwordHasher: {
      hash: async ({ password }) => { hashInputs.push(password); return credentialHash(password); },
      verify: async input => { verifications.push(input); return input.hash === credentialHash(input.password); },
    },
    origin: {
      canonicalOrigin: async () => ({ scheme: "https", host: "members.example.test", source: "workspace-setting", verifiedAt: clock.nowIso() }),
      isAllowedRedirectTarget: async () => false, isAllowedEgressTarget: async () => false,
    },
    mailer: {
      capabilities: () => ({ driver: "memory", supportsIdempotencyKey: true, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }),
      send: async message => { sent.push(message); return { ok: true, providerMessageId: "sent", acceptedAt: clock.nowIso() }; },
      sendBatch: async () => [],
    },
  };
  async function seed(status: MemberRecord["status"] = "active", password: string | null = "old") {
    const member: MemberRecord = { id: "ada", workspaceId: WS, email: EMAIL, status,
      createdAt: clock.nowIso(), updatedAt: clock.nowIso(), version: 1 };
    await deps.members.save(member);
    if (password !== null && status !== "trash") await deps.members.setPasswordHash({ workspaceId: WS, memberId: member.id, passwordHash: credentialHash(password) });
    return member;
  }
  async function resetToken() {
    assert.deepEqual(await requestPasswordReset({ deps, input: { workspaceId: WS, email: EMAIL } }), { accepted: true });
    const text = sent.at(-1)!.text!;
    const token = /#token=([a-f0-9]+)/.exec(text)?.[1];
    assert.ok(token, "reset secret must be in the URL fragment");
    assert.doesNotMatch(text, /one-time code/);
    return token;
  }
  const login = (password = "old", email = EMAIL) => signInWithPassword({ deps, input: { workspaceId: WS, email, password } });
  const sessionFor = (member: MemberRecord) => issueMemberSession({ deps, member, nowIso: clock.nowIso() });
  const setPassword = (sessionToken: string | undefined, password = "new", currentPassword?: string) =>
    setMemberPassword({ deps, input: { workspaceId: WS, sessionToken, password, currentPassword } });
  return { deps, clock, sent, verifications, hashInputs, seed, resetToken, login, sessionFor, setPassword };
}

for (const password of ["x", "  كلمة🙂  ", "🙂".repeat(512)]) {
  test(`D2: fresh passwordless member sets ${[...password].length} code points without altering bytes`, async () => {
    const h = harness(); const member = await h.seed("active", null);
    const current = await h.sessionFor(member); const other = await h.sessionFor(member);
    h.clock.advanceMs(1000);
    assert.deepEqual(await h.setPassword(current.rawSessionToken, password), { ok: true });
    assert.deepEqual(h.hashInputs, [password]);
    assert.deepEqual(h.verifications, []);
    assert.equal(await h.deps.members.findPasswordHash({ workspaceId: WS, memberId: member.id }), credentialHash(password));
    assert.equal((await h.deps.members.findById({ workspaceId: WS, id: member.id }))?.credentialsRevokedAt, h.clock.nowIso());
    const sessions = await h.deps.sessions.listByMember({ workspaceId: WS, memberId: member.id });
    assert.equal(sessions.length, 2, "no new session is minted");
    assert.equal(sessions.find(s => s.id === current.session.id)?.revokedAt, undefined);
    assert.equal(sessions.find(s => s.id === other.session.id)?.revokedAt, h.clock.nowIso());
    await h.login(password);
  });
}

for (const ageMs of [15 * 60_000, 15 * 60_000 + 1, -1]) {
  test(`D2: passwordless session issuance age ${ageMs} controls authorization`, async () => {
    const h = harness(); const member = await h.seed("active", null);
    const current = await h.sessionFor(member);
    h.clock.advanceMs(ageMs);
    await h.deps.sessions.save({ ...current.session, lastSeenAt: h.clock.nowIso() });
    if (ageMs === 15 * 60_000) assert.deepEqual(await h.setPassword(current.rawSessionToken), { ok: true });
    else {
      await assert.rejects(h.setPassword(current.rawSessionToken), MemberReauthenticationRequiredError);
      assert.deepEqual(h.hashInputs, []);
      assert.equal(await h.deps.members.findPasswordHash({ workspaceId: WS, memberId: member.id }), null);
      assert.equal((await h.deps.sessions.findByTokenHash({ workspaceId: WS, tokenHash: current.session.tokenHash }))?.revokedAt, undefined);
    }
  });
}

test("D2: existing password requires exact current proof even on a fresh session; old sessions may change it", async () => {
  const h = harness(); const member = await h.seed("active", " old🙂 ");
  const current = await h.sessionFor(member); const other = await h.sessionFor(member);
  for (const proof of [undefined, "wrong", "old🙂"]) {
    await assert.rejects(h.setPassword(current.rawSessionToken, "x", proof), { message: "INVALID_CREDENTIALS" });
    assert.deepEqual(h.hashInputs, []);
    assert.equal((await h.deps.sessions.findByTokenHash({ workspaceId: WS, tokenHash: other.session.tokenHash }))?.revokedAt, undefined);
  }
  h.clock.advanceMs(16 * 60_000);
  assert.deepEqual(await h.setPassword(current.rawSessionToken, "x", " old🙂 "), { ok: true });
  assert.deepEqual(h.verifications.map(v => v.password), ["wrong", "old🙂", " old🙂 "]);
  assert.equal(h.verifications.at(-1)?.hash, credentialHash(" old🙂 "));
  assert.equal((await h.deps.sessions.findByTokenHash({ workspaceId: WS, tokenHash: current.session.tokenHash }))?.revokedAt, undefined);
  assert.equal((await h.deps.sessions.findByTokenHash({ workspaceId: WS, tokenHash: other.session.tokenHash }))?.revokedAt, h.clock.nowIso());
  await assert.rejects(h.login(" old🙂 "), MemberAuthError);
  await h.login("x");
});

for (const password of ["", "🙂".repeat(513)]) {
  test(`D2: invalid length ${[...password].length} leaves credentials and sessions untouched`, async () => {
    const h = harness(); const member = await h.seed("active", null);
    const current = await h.sessionFor(member);
    await assert.rejects(h.setPassword(current.rawSessionToken, password), MemberValidationError);
    assert.deepEqual(h.hashInputs, []);
    assert.equal((await h.deps.members.findById({ workspaceId: WS, id: member.id }))?.credentialsRevokedAt, undefined);
    assert.equal((await h.deps.sessions.findByTokenHash({ workspaceId: WS, tokenHash: current.session.tokenHash }))?.revokedAt, undefined);
  });
}

test("D2: absent, unknown, expired, revoked and foreign-workspace sessions cannot set a password", async () => {
  const h = harness(); const member = await h.seed("active", null);
  await assert.rejects(h.setPassword(undefined), MemberAuthError);
  await assert.rejects(h.setPassword("unknown"), MemberAuthError);
  for (const state of ["expired", "revoked", "foreign"]) {
    const current = await h.sessionFor(member);
    await h.deps.sessions.save({ ...current.session,
      expiresAt: state === "expired" ? h.clock.nowIso() : current.session.expiresAt,
      revokedAt: state === "revoked" ? h.clock.nowIso() : undefined,
      workspaceId: state === "foreign" ? "foreign" : WS });
    await assert.rejects(h.setPassword(current.rawSessionToken), MemberAuthError);
  }
  assert.deepEqual(h.hashInputs, []);
});

for (const status of ["pending", "disabled", "trash"] as const) {
  test(`D2: session member status ${status} follows /me eligibility`, async () => {
    const h = harness(); const member = await h.seed("active", null);
    const current = await h.sessionFor(member);
    await h.deps.members.save({ ...member, status, version: 2 });
    if (status === "pending") assert.deepEqual(await h.setPassword(current.rawSessionToken), { ok: true });
    else {
      await assert.rejects(h.setPassword(current.rawSessionToken), MemberAuthError);
      assert.deepEqual(h.hashInputs, []);
    }
  });
}

test("D2: setting a password invalidates outstanding inbox challenges while preserving the current session", async () => {
  const h = harness(); const member = await h.seed("active", null);
  const current = await h.sessionFor(member);
  await requestSignInLink({ deps: h.deps, input: { workspaceId: WS, email: EMAIL } });
  const magic = /#magic=([a-f0-9]+)/.exec(h.sent.at(-1)!.text!)![1];
  const reset = await h.resetToken();
  h.clock.advanceMs(1);
  await h.setPassword(current.rawSessionToken);
  await assert.rejects(completeSignIn({ deps: h.deps, input: { workspaceId: WS, token: magic } }), MemberAuthError);
  await assert.rejects(resetPassword({ deps: h.deps, input: { workspaceId: WS, token: reset, password: "other" } }), MemberAuthError);
  assert.equal((await h.deps.sessions.findByTokenHash({ workspaceId: WS, tokenHash: current.session.tokenHash }))?.revokedAt, undefined);
});

test("D2: a disable that races the Argon2 hash is not undone by the password write", async () => {
  const h = harness(); const member = await h.seed("active", null);
  const current = await h.sessionFor(member);
  const hasher = h.deps.passwordHasher!; const hash = hasher.hash;
  hasher.hash = async input => {
    await h.deps.members.save({ ...member, status: "disabled", credentialsRevokedAt: h.clock.nowIso(), version: 2 });
    return hash(input);
  };
  await assert.rejects(h.setPassword(current.rawSessionToken), MemberAuthError);
  assert.equal((await h.deps.members.findById({ workspaceId: WS, id: member.id }))?.status, "disabled");
  assert.equal(await h.deps.members.findPasswordHash({ workspaceId: WS, memberId: member.id }), null);
});

for (const password of ["x", "🙂", "  päss كلمة  ", "🙂".repeat(512)]) {
  test(`reset and password login preserve ${[...password].length} Unicode code points exactly`, async () => {
    const h = harness();
    await h.seed("pending", null);
    const token = await h.resetToken();
    assert.deepEqual(await resetPassword({ deps: h.deps, input: { workspaceId: WS, token, password } }), { ok: true });
    assert.ok(h.hashInputs.includes(password));
    const result = await h.login(password, " ADA@EXAMPLE.TEST ");
    assert.equal(result.member.status, "active");
    assert.equal(result.member.emailVerifiedAt, h.clock.nowIso());
    assert.equal(result.session.tokenHash, digest(result.rawSessionToken));
    assert.equal("passwordHash" in result.member, false);
    assert.equal("password" in result.member, false);
    if (password.trim() !== password) await assert.rejects(h.login(password.trim()), { message: "INVALID_CREDENTIALS" });
  });
}

for (const password of ["", "🙂".repeat(513)]) {
  test(`reset rejects invalid password length ${[...password].length} without consuming its link`, async () => {
    const h = harness(); await h.seed(); const token = await h.resetToken();
    await assert.rejects(resetPassword({ deps: h.deps, input: { workspaceId: WS, token, password } }), MemberValidationError);
    const record = await h.deps.magicLinks.findByTokenHash({ workspaceId: WS, tokenHash: digest(token) });
    assert.equal(record?.consumedAt, undefined);
    assert.equal(h.hashInputs.length, 0);
  });
}

test("password login gives every invalid account class one verify and the same error; dummy hash is cached", async () => {
  const h = harness();
  for (const scenario of ["missing", "passwordless", "pending", "disabled", "trash", "wrong"] as const) {
    // Account classes are independent fixtures: saving over Trash must never resurrect a member.
    // Keep the same hasher so the cached dummy-credential assertion still spans every request.
    h.deps.members = new InMemoryMemberRepo();
    if (scenario !== "missing") await h.seed(
      scenario === "pending" || scenario === "disabled" || scenario === "trash" ? scenario : "active",
      scenario === "passwordless" ? null : "old",
    );
    const calls = h.verifications.length;
    await assert.rejects(h.login(scenario === "wrong" ? "wrong" : "old"), { name: "Error", message: "INVALID_CREDENTIALS" });
    assert.equal(h.verifications.length, calls + 1, scenario);
    assert.deepEqual(await h.deps.sessions.listByMember({ workspaceId: WS, memberId: "ada" }), []);
  }
  const missingHash = h.verifications[0].hash;
  assert.notEqual(missingHash, credentialHash("wrong"));
  assert.equal(h.verifications[1].hash, missingHash, "passwordless account uses cached dummy hash");
  assert.equal(h.verifications[4].hash, missingHash, "trashed account uses cached dummy hash");
  assert.equal(h.hashInputs.length, 1, "one dummy hash per adapter, reused across requests");
});

test("password login refuses a hash replaced during verification and leaves no live session", async () => {
  const h = harness(); await h.seed();
  h.deps.passwordHasher!.verify = async () => {
    await h.deps.members.setPasswordHash({ workspaceId: WS, memberId: "ada", passwordHash: credentialHash("new") });
    return true;
  };
  await assert.rejects(h.login(), { message: "INVALID_CREDENTIALS" });
  const sessions = await h.deps.sessions.listByMember({ workspaceId: WS, memberId: "ada" });
  assert.ok(sessions.every(s => s.revokedAt), "any minted session is revoked");
});

test("a reset that completes between the login's checks and its session save still kills that session", async () => {
  const h = harness(); await h.seed();
  const token = await h.resetToken();
  const save = h.deps.sessions.save.bind(h.deps.sessions);
  let raced = false;
  h.deps.sessions.save = async session => {
    if (!raced) { raced = true; await resetPassword({ deps: h.deps, input: { workspaceId: WS, token, password: "new" } }); }
    await save(session);
  };
  await assert.rejects(h.login("old"), { message: "INVALID_CREDENTIALS" });
  const sessions = await h.deps.sessions.listByMember({ workspaceId: WS, memberId: "ada" });
  assert.equal(sessions.length, 1);
  assert.ok(sessions[0].revokedAt, "the old-password session cannot outlive the reset");
});

test("password login refuses an account disabled during verification", async () => {
  const h = harness(); const member = await h.seed();
  h.deps.passwordHasher!.verify = async () => { await h.deps.members.save({ ...member, status: "disabled" }); return true; };
  await assert.rejects(h.login(), { message: "INVALID_CREDENTIALS" });
});

test("reset consumes first, writes hash and cutoff, revokes all sessions, and invalidates older links/codes", async () => {
  const h = harness(); await h.seed();
  const first = await h.login(); const second = await h.login();
  await requestSignInLink({ deps: h.deps, input: { workspaceId: WS, email: EMAIL } });
  const magic = /#magic=([a-f0-9]+)/.exec(h.sent.at(-1)!.text!)![1];
  const codeRequest = await requestSignInLink({ deps: h.deps, input: { workspaceId: WS, email: EMAIL } });
  const code = /one-time code:\s*(\d{6})/.exec(h.sent.at(-1)!.text!)![1];
  const token = await h.resetToken();
  h.clock.advanceMs(1000);
  const events: string[] = [];
  const consume = h.deps.magicLinks.consume.bind(h.deps.magicLinks);
  h.deps.magicLinks.consume = async input => { events.push("consume"); await consume(input); };
  const setHash = h.deps.members.setPasswordHash.bind(h.deps.members);
  h.deps.members.setPasswordHash = async input => { events.push("hash"); await setHash(input); };
  const save = h.deps.members.save.bind(h.deps.members);
  h.deps.members.save = async member => { events.push("cutoff"); await save(member); };
  const revoke = h.deps.sessions.revokeAllForMember.bind(h.deps.sessions);
  h.deps.sessions.revokeAllForMember = async input => { events.push("revoke"); await revoke(input); };
  await resetPassword({ deps: h.deps, input: { workspaceId: WS, token, password: "new" } });
  // These effects now commit together; a profile conflict must also roll back the password.
  assert.deepEqual(events, ["consume", "hash", "revoke", "cutoff"]);
  const sessions = await h.deps.sessions.listByMember({ workspaceId: WS, memberId: "ada" });
  assert.deepEqual(sessions.map(s => s.id), [first.session.id, second.session.id], "reset issues no session");
  assert.ok(sessions.every(s => s.revokedAt === h.clock.nowIso()));
  await assert.rejects(h.login("old"), { message: "INVALID_CREDENTIALS" });
  await h.login("new");
  await assert.rejects(completeSignIn({ deps: h.deps, input: { workspaceId: WS, token: magic } }), MemberAuthError);
  // A separate outstanding challenge proves cutoff rejection independently of link consumption.
  await assert.rejects(completeSignIn({ deps: h.deps, input: { workspaceId: WS, challengeId: codeRequest.challengeId, code } }), MemberAuthError);
  await assert.rejects(resetPassword({ deps: h.deps, input: { workspaceId: WS, token, password: "again" } }), MemberAuthError);
  h.clock.advanceMs(1);
  const fresh = await requestSignInLink({ deps: h.deps, input: { workspaceId: WS, email: EMAIL } });
  const freshCode = /one-time code:\s*(\d{6})/.exec(h.sent.at(-1)!.text!)![1];
  await completeSignIn({ deps: h.deps, input: { workspaceId: WS, challengeId: fresh.challengeId, code: freshCode } });
});

for (const status of ["disabled", "trash"] as const) {
  test(`reset denies a member made ${status} after issuance`, async () => {
    const h = harness(); const member = await h.seed(); const token = await h.resetToken();
    await h.deps.members.save({ ...member, status });
    await assert.rejects(resetPassword({ deps: h.deps, input: { workspaceId: WS, token, password: "x" } }), MemberAuthError);
    assert.deepEqual(h.hashInputs, []);
  });
}

test("forgot password is indistinguishable for unknown, disabled and eligible addresses", async () => {
  const h = harness();
  const expected = { accepted: true };
  assert.deepEqual(await requestPasswordReset({ deps: h.deps, input: { workspaceId: WS, email: EMAIL } }), expected);
  await h.seed("disabled");
  assert.deepEqual(await requestPasswordReset({ deps: h.deps, input: { workspaceId: WS, email: EMAIL } }), expected);
  assert.equal(h.sent.length, 0);
  await h.seed();
  assert.deepEqual(await requestPasswordReset({ deps: h.deps, input: { workspaceId: WS, email: EMAIL } }), expected);
  assert.equal(h.sent.length, 1);
});

test("reset rejects sign-in purpose; no hash write and no consumption", async () => {
  const h = harness(); await h.seed();
  const request = await requestSignInLink({ deps: h.deps, input: { workspaceId: WS, email: EMAIL } });
  const token = /#magic=([a-f0-9]+)/.exec(h.sent.at(-1)!.text!)![1];
  await assert.rejects(resetPassword({ deps: h.deps, input: { workspaceId: WS, token, password: "x" } }), { message: "sign-in credential is invalid" });
  const record = await h.deps.magicLinks.findById({ workspaceId: WS, id: request.challengeId });
  assert.equal(record?.consumedAt, undefined);
  assert.equal(await h.deps.members.findPasswordHash({ workspaceId: WS, memberId: "ada" }), credentialHash("old"));
});

test("reset persists only credential hashes and cutoff; reset mail uses the capture-redaction prefix", async () => {
  const h = harness(); await h.seed();
  let key = "";
  const send = h.deps.mailer.send.bind(h.deps.mailer);
  h.deps.mailer.send = async (message, options) => { key = options.idempotencyKey; return send(message, options); };
  const token = await h.resetToken();
  const record = await h.deps.magicLinks.findByTokenHash({ workspaceId: WS, tokenHash: digest(token) });
  assert.equal(key, `members:signin:reset:${digest(token)}`);
  assert.equal(record?.codeHash, undefined);
  assert.equal(JSON.stringify(record).includes(token), false);
  await resetPassword({ deps: h.deps, input: { workspaceId: WS, token, password: "Secret🗝" } });
  const member = await h.deps.members.findById({ workspaceId: WS, id: "ada" });
  assert.equal(JSON.stringify(member).includes("Secret🗝"), false);
  assert.equal(JSON.stringify(member).includes("test-hash:"), false);
});
