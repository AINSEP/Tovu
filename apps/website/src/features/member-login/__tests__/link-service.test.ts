import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { InMemoryMagicLinkTokenRepo, InMemoryMemberRepo, InMemoryMemberSessionRepo, InMemoryMemberSubscriptionRepo,
  InMemoryMemberTierRepo, InMemoryMemberExternalIdentityRepo } from "../../members/repo.memory.js";
import type { MemberRecord } from "../../members/types.js";
import type { OutboundEmail } from "../../../platform/mail/index.js";
import { issueMemberSession } from "../../members/write-service.js";
import { resolveFederatedIdentity, requestLoginEmailProof, type MemberLoginLinkDeps } from "../link-service.js";
import { MemberLoginError } from "../types.js";
import { cryptoFixture, originFixture, provider } from "./fixtures.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const identity = { providerId: provider.id, issuer: provider.issuer, subject: "stable-subject", email: "person@gmail.com", emailAuthoritative: true };

function fixture() {
  const { clock } = cryptoFixture();
  let seq = 0;
  let inTransaction = false;
  let transactions = 0;
  const locks: string[] = [];
  const sent: OutboundEmail[] = [];
  const deps: MemberLoginLinkDeps = {
    clock, ids: { newId: () => { seq++; return `id-${seq}`; } }, members: new InMemoryMemberRepo(), sessions: new InMemoryMemberSessionRepo(),
    magicLinks: new InMemoryMagicLinkTokenRepo(), tiers: new InMemoryMemberTierRepo(), subscriptions: new InMemoryMemberSubscriptionRepo(),
    principals: new InMemoryPrincipalRepo({}), identities: new InMemoryMemberExternalIdentityRepo({}), origin: originFixture(),
    passwordHasher: { hash: async ({ password }) => `hash:${hash(password)}`, verify: async ({ password, hash: saved }) => saved === `hash:${hash(password)}` },
    mailer: { capabilities: () => ({ driver: "memory", supportsIdempotencyKey: true, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }),
      send: async message => { sent.push(message); return { ok: true, providerMessageId: "sent", acceptedAt: clock.nowIso() }; }, sendBatch: async () => [] },
    transaction: async run => {
      transactions++;
      inTransaction = true;
      try { return await run(); } finally { inTransaction = false; }
    },
    lockKey: async key => { assert.equal(inTransaction, true); locks.push(key); },
  };
  async function seed(status: MemberRecord["status"] = "active", email = identity.email) {
    const member: MemberRecord = { id: "member-1", workspaceId: "ws", email, status,
      createdAt: clock.nowIso(), updatedAt: clock.nowIso(), version: 1 };
    await deps.members.save(member);
    return member;
  }
  const input = { workspaceId: "ws", identity, startedAt: clock.nowIso() };
  return { deps, clock, locks, sent, seed, input, transactions: () => transactions, inTransaction: () => inTransaction };
}

test("new verified identity uses member creation owner and the sole member-session minter", async () => {
  const f = fixture();
  const outcome = await resolveFederatedIdentity({ deps: f.deps, input: f.input });
  assert.equal(outcome.kind, "signed_in");
  if (outcome.kind !== "signed_in") return;
  const saved = await f.deps.identities.findBySubject({ workspaceId: "ws", issuer: identity.issuer, subject: identity.subject });
  assert.equal(saved?.memberId, outcome.result.member.id);
  assert.equal(outcome.result.member.status, "active");
  const sessions = await f.deps.sessions.listByMember({ workspaceId: "ws", memberId: outcome.result.member.id });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].tokenHash, hash(outcome.result.rawSessionToken));
  assert.equal(f.transactions(), 1);
});
test("pending verified match activates and revokes old sessions", async () => {
  const f = fixture();
  const member = await f.seed("pending");
  const old = await issueMemberSession({ deps: f.deps, member, nowIso: f.clock.nowIso() });
  const outcome = await resolveFederatedIdentity({ deps: f.deps, input: f.input });
  assert.equal(outcome.kind, "signed_in");
  const updated = await f.deps.members.findById({ workspaceId: "ws", id: member.id });
  assert.equal(updated?.status, "active");
  assert.ok(updated?.emailVerifiedAt);
  assert.ok((await f.deps.sessions.findByTokenHash({ workspaceId: "ws", tokenHash: old.session.tokenHash }))?.revokedAt);
  assert.deepEqual(f.locks.slice(0, 2), ["members:external-identities:ws", "trash:member:ws:member-1"]);
});
for (const status of ["disabled", "trash"] as const) {
  test(`${status} cannot link or mint a session`, async () => {
    const f = fixture();
    await f.seed(status);
    await assert.rejects(resolveFederatedIdentity({ deps: f.deps, input: f.input }), MemberLoginError);
    assert.deepEqual(await f.deps.identities.listByMember({ workspaceId: "ws", memberId: "member-1" }), []);
    assert.deepEqual(await f.deps.sessions.listByMember({ workspaceId: "ws", memberId: "member-1" }), []);
  });
}
test("linked subject follows its original member when provider email changes", async () => {
  const f = fixture();
  await resolveFederatedIdentity({ deps: f.deps, input: f.input });
  f.clock.advanceMs(1);
  const outcome = await resolveFederatedIdentity({ deps: f.deps, input: { ...f.input, startedAt: f.clock.nowIso(),
    identity: { ...identity, email: "changed@custom.example", emailAuthoritative: false } } });
  assert.equal(outcome.kind, "signed_in");
  if (outcome.kind === "signed_in") assert.equal(outcome.result.member.email, identity.email);
});
test("unlink blocks subsequent sign-in and deliberate signed-in connect may restore it", async () => {
  const f = fixture();
  const member = await f.seed();
  await resolveFederatedIdentity({ deps: f.deps, input: f.input });
  f.clock.advanceMs(1);
  await f.deps.identities.unlink({ workspaceId: "ws", memberId: member.id, providerId: identity.providerId, unlinkedAt: f.clock.nowIso() });
  const input = { ...f.input, startedAt: f.clock.nowIso() };
  await assert.rejects(resolveFederatedIdentity({ deps: f.deps, input }), MemberLoginError);
  const outcome = await resolveFederatedIdentity({ deps: f.deps, input: { ...input, connectMemberId: member.id } });
  assert.equal(outcome.kind, "signed_in");
  assert.equal((await f.deps.identities.findByMemberAndProvider({ workspaceId: "ws", memberId: member.id, providerId: identity.providerId }))?.unlinkedAt, undefined);
});
test("a foreign signed-in connect cannot move an already-linked subject", async () => {
  const f = fixture();
  await f.seed();
  await resolveFederatedIdentity({ deps: f.deps, input: f.input });
  f.clock.advanceMs(1);
  await assert.rejects(resolveFederatedIdentity({ deps: f.deps, input: { ...f.input, startedAt: f.clock.nowIso(), connectMemberId: "foreign-member" } }), MemberLoginError);
});
test("signed-in connect with a different Google address links without verifying the member's own email", async () => {
  const f = fixture();
  const member = await f.seed("pending", "member@site.example");
  const outcome = await resolveFederatedIdentity({ deps: f.deps, input: { ...f.input, connectMemberId: member.id,
    identity: { ...identity, email: "person@custom.example", emailAuthoritative: false } } });
  assert.equal(outcome.kind, "signed_in");
  const updated = await f.deps.members.findById({ workspaceId: "ws", id: member.id });
  assert.equal(updated?.status, "pending");
  assert.equal(updated?.emailVerifiedAt, undefined);
  assert.equal((await f.deps.identities.findBySubject({ workspaceId: "ws", issuer: identity.issuer, subject: identity.subject }))?.memberId, member.id);
  assert.deepEqual(f.sent, []);
});
test("custom-domain first link returns proof-needed without member/link/session writes", async () => {
  const f = fixture();
  const custom = { ...identity, email: "person@custom.example", emailAuthoritative: false };
  assert.deepEqual(await resolveFederatedIdentity({ deps: f.deps, input: { ...f.input, identity: custom } }),
    { kind: "email_verification_required", email: custom.email, providerId: identity.providerId });
  assert.equal(await f.deps.members.findByEmail({ workspaceId: "ws", email: custom.email }), null);
});
test("one existing email code permits first custom-domain link; replay fails", async () => {
  const f = fixture();
  const custom = { ...identity, email: "person@custom.example", emailAuthoritative: false };
  const challenge = await requestLoginEmailProof({ deps: f.deps, input: { workspaceId: "ws", email: custom.email } });
  const code = /one-time code:\s*(\d{6})/.exec(f.sent.at(-1)!.text!)![1];
  const input = { ...f.input, identity: custom, emailProof: { challengeId: challenge.challengeId, code } };
  const outcome = await resolveFederatedIdentity({ deps: f.deps, input });
  assert.equal(outcome.kind, "signed_in");
  if (outcome.kind !== "signed_in") return;
  const sessions = await f.deps.sessions.listByMember({ workspaceId: "ws", memberId: outcome.result.member.id });
  assert.equal(sessions.filter(session => !session.revokedAt).length, 1);
  await assert.rejects(resolveFederatedIdentity({ deps: f.deps, input }), MemberLoginError);
});
test("wrong email code spends an attempt outside the link transaction", async () => {
  const f = fixture();
  const custom = { ...identity, email: "person@custom.example", emailAuthoritative: false };
  const challenge = await requestLoginEmailProof({ deps: f.deps, input: { workspaceId: "ws", email: custom.email } });
  const actual = /one-time code:\s*(\d{6})/.exec(f.sent.at(-1)!.text!)![1];
  const wrong = actual === "000000" ? "111111" : "000000";
  await assert.rejects(resolveFederatedIdentity({ deps: f.deps, input: { ...f.input, identity: custom,
    emailProof: { challengeId: challenge.challengeId, code: wrong } } }), MemberLoginError);
  const row = await f.deps.magicLinks.findById({ workspaceId: "ws", id: challenge.challengeId });
  assert.equal(row?.failedAttempts, 1);
  assert.equal(f.transactions(), 0);
});
test("credential revocation fences an outstanding callback", async () => {
  const f = fixture();
  const member = await f.seed();
  await f.deps.members.save({ ...member, credentialsRevokedAt: f.input.startedAt });
  await assert.rejects(resolveFederatedIdentity({ deps: f.deps, input: f.input }), MemberLoginError);
});

// --- F6 fix wave (L7 Stryker): each ownership/eligibility/proof guard refused with its OWN code. ---
const rejectsWith = (code: string) => (error: unknown) => {
  assert.ok(error instanceof MemberLoginError);
  assert.equal(error.code, code);
  return true;
};
const linkRow = (overrides: Record<string, unknown>) => ({ id: "link-x", workspaceId: "ws", memberId: "member-1", providerId: provider.id,
  issuer: identity.issuer, subject: identity.subject, linkedAt: "2026-01-01T00:00:00.000Z", ...overrides });

test("a subject already linked under ANOTHER provider id is a LOGIN_CONFLICT and mints nothing", async () => {
  const f = fixture();
  await f.seed();
  await f.deps.identities.save(linkRow({ providerId: "other-provider" }));
  await assert.rejects(resolveFederatedIdentity({ deps: f.deps, input: f.input }), rejectsWith("LOGIN_CONFLICT"));
  assert.deepEqual(await f.deps.sessions.listByMember({ workspaceId: "ws", memberId: "member-1" }), []);
});

test("a subject linked to a member row that no longer exists is a LOGIN_CONFLICT", async () => {
  const f = fixture();
  await f.deps.identities.save(linkRow({ memberId: "ghost-member" }));
  await assert.rejects(resolveFederatedIdentity({ deps: f.deps, input: f.input }), rejectsWith("LOGIN_CONFLICT"));
});

test("a member whose provider slot holds a DIFFERENT live subject is a LOGIN_CONFLICT", async () => {
  const f = fixture();
  await f.seed();
  await f.deps.identities.save(linkRow({ subject: "someone-else" }));
  await assert.rejects(resolveFederatedIdentity({ deps: f.deps, input: f.input }), rejectsWith("LOGIN_CONFLICT"));
});

test("an UNLINKED provider slot with a different subject is not a conflict: sign-in stays blocked, not conflicting", async () => {
  const f = fixture();
  await f.seed();
  await f.deps.identities.save(linkRow({ subject: "someone-else", unlinkedAt: "2026-01-02T00:00:00.000Z" }));
  await assert.rejects(resolveFederatedIdentity({ deps: f.deps, input: f.input }), rejectsWith("LOGIN_BLOCKED"));
});

for (const startedAt of ["not-a-date", "", "2026-13-45T99:00:00Z"]) {
  test(`an unparseable sealed startedAt (${JSON.stringify(startedAt)}) is LOGIN_INVALID`, async () => {
    const f = fixture();
    await assert.rejects(resolveFederatedIdentity({ deps: f.deps, input: { ...f.input, startedAt } }), rejectsWith("LOGIN_INVALID"));
    assert.equal(await f.deps.members.findByEmail({ workspaceId: "ws", email: identity.email }), null);
  });
}

test("revocation AT startedAt blocks, revocation strictly before it does not", async () => {
  const f = fixture();
  const member = await f.seed();
  await f.deps.members.save({ ...member, credentialsRevokedAt: f.input.startedAt });
  await assert.rejects(resolveFederatedIdentity({ deps: f.deps, input: f.input }), rejectsWith("LOGIN_BLOCKED"));
  const g = fixture();
  const other = await g.seed();
  await g.deps.members.save({ ...other, credentialsRevokedAt: new Date(Date.parse(g.input.startedAt) - 1).toISOString() });
  assert.equal((await resolveFederatedIdentity({ deps: g.deps, input: g.input })).kind, "signed_in");
});

test("an inbox proof for a DIFFERENT address cannot link a custom-domain identity", async () => {
  const f = fixture();
  const custom = { ...identity, email: "person@custom.example", emailAuthoritative: false };
  const challenge = await requestLoginEmailProof({ deps: f.deps, input: { workspaceId: "ws", email: "attacker@custom.example" } });
  const code = /one-time code:\s*(\d{6})/.exec(f.sent.at(-1)!.text!)![1];
  await assert.rejects(resolveFederatedIdentity({ deps: f.deps, input: { ...f.input, identity: custom,
    emailProof: { challengeId: challenge.challengeId, code } } }), rejectsWith("LOGIN_INVALID"));
  assert.equal(await f.deps.identities.findBySubject({ workspaceId: "ws", issuer: identity.issuer, subject: identity.subject }), null);
});

test("any failure while requesting the inbox proof is masked as LOGIN_UNAVAILABLE", async () => {
  const f = fixture();
  await assert.rejects(requestLoginEmailProof({ deps: f.deps, input: { workspaceId: "ws", email: "not-an-email" } }), rejectsWith("LOGIN_UNAVAILABLE"));
  assert.deepEqual(f.sent, []);
});

test("activating a pending member keeps an earlier email verification time", async () => {
  const f = fixture();
  const member = await f.seed("pending");
  await f.deps.members.save({ ...member, emailVerifiedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal((await resolveFederatedIdentity({ deps: f.deps, input: f.input })).kind, "signed_in");
  const updated = await f.deps.members.findById({ workspaceId: "ws", id: member.id });
  assert.equal(updated?.status, "active");
  assert.equal(updated?.emailVerifiedAt, "2026-01-01T00:00:00.000Z");
});
