import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test, type TestContext } from "node:test";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { SqlMagicLinkTokenRepo, SqlMemberRepo, SqlMemberSessionRepo } from "../repo.js";
import { InMemoryMemberSubscriptionRepo, InMemoryMemberTierRepo } from "../repo.memory.js";
import { completeSignIn, updateProfile } from "../write-service.js";
import type { MembersWriteServiceDeps } from "../ports.js";
import type { ContentKernel } from "#src/platform/db/content-kernel";

const WS = "credential-workspace";
const BEFORE = "2026-10-09T12:00:00.000Z";
const REVOKED = "2026-10-09T12:01:00.000Z";
const AFTER = "2026-10-09T12:02:00.000Z";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

function harness(kernel: ContentKernel) {
  const members = new SqlMemberRepo(kernel);
  const sessions = new SqlMemberSessionRepo(kernel);
  const magicLinks = new SqlMagicLinkTokenRepo(kernel);
  const clock = createFakeClock({ startIso: BEFORE });
  let seq = 0;
  const deps: MembersWriteServiceDeps = {
    clock, ids: { newId: () => `credential-${++seq}` }, members, sessions, magicLinks,
    tiers: new InMemoryMemberTierRepo(), subscriptions: new InMemoryMemberSubscriptionRepo(),
    principals: new InMemoryPrincipalRepo({}),
    mailer: {
      capabilities: () => ({ driver: "memory", supportsIdempotencyKey: true, supportsWebhookFeedback: false,
        maxBatchSize: 1, supportsAttachments: false }),
      send: async () => { throw new Error("completeSignIn must not send mail"); },
      sendBatch: async () => { throw new Error("completeSignIn must not send mail"); },
    },
  };
  const seed = async (id = "member") => members.save({ id, workspaceId: WS, email: `${id}@example.test`,
    status: "pending", createdAt: BEFORE, updatedAt: BEFORE, version: 1 });
  const link = async (token: string, createdAt = BEFORE, memberId = "member") => magicLinks.save({
    id: `link-${token}`, workspaceId: WS, memberId, tokenHash: hash(token), purpose: "signin",
    createdAt, expiresAt: "2026-10-09T12:15:00.000Z",
  });
  const signIn = (token: string, inputDeps = deps) => completeSignIn({ deps: inputDeps,
    input: { workspaceId: WS, token, userAgent: token } });
  return { kernel, members, sessions, magicLinks, clock, deps, seed, link, signIn };
}

describeEachDialect("member credential cutoff", {
  tables: ["member_sessions", "member_magic_tokens", "members"], make: harness,
}, (make, dialect) => {
  function open(t: TestContext) {
    const h = make();
    if (dialect === "sqlite") t.after(() => h.kernel.close());
    return h;
  }

  test("both devices' outstanding links survive the first sign-in", async t => {
    const h = open(t); await h.seed(); await h.link("one"); await h.link("two");
    h.clock.set(REVOKED);
    const first = await h.signIn("one");
    h.clock.set(AFTER);
    const second = await h.signIn("two");
    assert.equal(second.member.id, first.member.id);
    assert.equal(second.member.emailVerifiedAt, first.member.emailVerifiedAt);
    assert.deepEqual((await h.sessions.listByMember({ workspaceId: WS, memberId: "member" }))
      .map(row => row.userAgent).sort(), ["one", "two"]);
  });

  test("profile edits preserve pending links and in-flight session writes", async t => {
    const h = open(t); await h.seed(); await h.link("profile");
    h.clock.set(REVOKED);
    await updateProfile({ deps: h.deps, input: { workspaceId: WS, memberId: "member", name: "Edited Name" } });
    // The session write may arrive after a later ordinary profile edit.
    await h.sessions.save({ id: "in-flight", workspaceId: WS, memberId: "member", tokenHash: "in-flight-hash",
      createdAt: BEFORE, expiresAt: "2026-11-01T00:00:00.000Z" });
    h.clock.set(AFTER);
    assert.equal((await h.signIn("profile")).member.name, "Edited Name");
    assert.equal((await h.members.findById({ workspaceId: WS, id: "member" }))!.credentialsRevokedAt, undefined);
    assert.equal((await h.sessions.findByTokenHash({ workspaceId: WS, tokenHash: "in-flight-hash" }))!.revokedAt, undefined);
  });

  test("explicit revocation kills older links even with no sessions and admits later links", async t => {
    const h = open(t); await h.seed(); await h.seed("other"); await h.link("old");
    const stale = (await h.members.findById({ workspaceId: WS, id: "member" }))!;
    await h.sessions.revokeAllForMember({ workspaceId: "other-workspace", memberId: "member", revokedAt: REVOKED });
    assert.equal((await h.members.findById({ workspaceId: WS, id: "member" }))!.credentialsRevokedAt, undefined);
    await h.sessions.revokeAllForMember({ workspaceId: WS, memberId: "member", revokedAt: REVOKED });
    assert.equal((await h.members.findById({ workspaceId: WS, id: "member" }))!.credentialsRevokedAt, REVOKED);
    assert.equal((await h.members.findById({ workspaceId: WS, id: "other" }))!.credentialsRevokedAt, undefined);
    await assert.rejects(h.members.save({ ...stale, name: "Stale Edit", version: stale.version + 1 }),
      { message: "member changed or is in Trash; re-read it before updating" });
    h.clock.set(AFTER);
    // Revocation remains enforced without exposing why a bearer was refused.
    await assert.rejects(h.signIn("old"),
      { message: "sign-in credential is invalid" });
    assert.equal((await h.magicLinks.findByTokenHash({ workspaceId: WS, tokenHash: hash("old") }))?.consumedAt,
      AFTER, "the valid challenge reached consumption before the member cutoff refused sign-in");
    assert.deepEqual(await h.sessions.listByMember({ workspaceId: WS, memberId: "member" }), []);
    await h.link("new", AFTER);
    const fresh = await h.signIn("new");
    assert.equal(fresh.member.credentialsRevokedAt, REVOKED);
    assert.ok(await h.sessions.findByTokenHash({ workspaceId: WS, tokenHash: fresh.session.tokenHash }));
  });

  test("revocation between sign-in validation and session save prevents a late mint", async t => {
    const h = open(t); await h.seed(); await h.link("racing"); h.clock.set(REVOKED);
    const deps: MembersWriteServiceDeps = { ...h.deps, sessions: {
      findByTokenHash: input => h.sessions.findByTokenHash(input),
      listByMember: input => h.sessions.listByMember(input),
      revoke: input => h.sessions.revoke(input),
      revokeAllForMember: input => h.sessions.revokeAllForMember(input),
      save: async record => {
        await h.sessions.revokeAllForMember({ workspaceId: WS, memberId: "member", revokedAt: AFTER });
        await h.sessions.save(record);
      },
    } };
    await assert.rejects(h.signIn("racing", deps),
      { message: "member changed before the session was saved; request a new sign-in link" });
    assert.deepEqual(await h.sessions.listByMember({ workspaceId: WS, memberId: "member" }), []);
    assert.equal((await h.members.findById({ workspaceId: WS, id: "member" }))!.credentialsRevokedAt, AFTER);
  });

  test("bulk revocation rolls back with sessions and never lowers the cutoff", async t => {
    const h = open(t); await h.seed(); await h.link("first"); const signedIn = await h.signIn("first");
    await assert.rejects(h.kernel.transaction(async () => {
      await h.sessions.revokeAllForMember({ workspaceId: WS, memberId: "member", revokedAt: REVOKED });
      throw new Error("rollback revocation");
    }), { message: "rollback revocation" });
    assert.equal((await h.members.findById({ workspaceId: WS, id: "member" }))!.credentialsRevokedAt, undefined);
    assert.equal((await h.sessions.findByTokenHash({ workspaceId: WS, tokenHash: signedIn.session.tokenHash }))!.revokedAt, undefined);
    await h.sessions.revokeAllForMember({ workspaceId: WS, memberId: "member", revokedAt: AFTER });
    await h.sessions.revokeAllForMember({ workspaceId: WS, memberId: "member", revokedAt: REVOKED });
    assert.equal((await h.members.findById({ workspaceId: WS, id: "member" }))!.credentialsRevokedAt, AFTER);
    assert.equal((await h.sessions.findByTokenHash({ workspaceId: WS, tokenHash: signedIn.session.tokenHash }))!.revokedAt, AFTER);
  });
});
