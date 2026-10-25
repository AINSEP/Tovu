/** Real transaction boundaries: a failed session mint must roll back link and activation. */
import assert from "node:assert/strict";
import test from "node:test";
import { eachDialect } from "../../../platform/db/kernel/__tests__/dialect-matrix.js";
import type { ContentKernel } from "../../../platform/db/content-kernel.js";
import { SqlPrincipalRepo } from "../../identity/repo.js";
import { SqlMemberRepo, SqlMemberSessionRepo, SqlMagicLinkTokenRepo, SqlMemberExternalIdentityRepo } from "../../members/repo.js";
import { InMemoryMemberTierRepo, InMemoryMemberSubscriptionRepo } from "../../members/repo.memory.js";
import { resolveFederatedIdentity, type MemberLoginLinkDeps } from "../link-service.js";
import { MemberLoginError } from "../types.js";
import { cryptoFixture, provider } from "./fixtures.js";

function depsFor(kernel: ContentKernel): MemberLoginLinkDeps {
  let seq = 0;
  return { clock: cryptoFixture().clock, ids: { newId: () => { seq++; return `id-${seq}`; } },
    members: new SqlMemberRepo(kernel), sessions: new SqlMemberSessionRepo(kernel), magicLinks: new SqlMagicLinkTokenRepo(kernel),
    identities: new SqlMemberExternalIdentityRepo({ kernel }), principals: new SqlPrincipalRepo(kernel),
    tiers: new InMemoryMemberTierRepo(), subscriptions: new InMemoryMemberSubscriptionRepo(),
    transaction: run => kernel.transaction(run), lockKey: key => kernel.lockKey(key),
    mailer: { capabilities: () => ({ driver: "memory", supportsIdempotencyKey: true, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }),
      send: async () => { throw new Error("no mail in authoritative login"); }, sendBatch: async () => [] } };
}

const adapters = eachDialect({ tables: ["member_external_identities", "member_sessions", "member_magic_tokens", "members", "principals"], make: kernel => kernel });
for (const adapter of adapters) {
  test(`[${adapter.name}] session write failure rolls back link, member activation and session revocation`, async t => {
    const kernel = adapter.make();
    if (adapter.name === "sqlite") t.after(() => kernel.close());
    const deps = depsFor(kernel);
    const now = "2026-10-24T12:00:00.000Z";
    const member = { id: "member", workspaceId: "ws", email: "person@gmail.com", status: "pending" as const, version: 1, createdAt: now, updatedAt: now };
    await deps.members.save(member);
    await deps.sessions.save({ id: "old", workspaceId: "ws", memberId: member.id, tokenHash: "old-hash", createdAt: now, expiresAt: "2026-11-24T12:00:00.000Z" });
    const failingSessions = Object.create(deps.sessions) as MemberLoginLinkDeps["sessions"];
    failingSessions.save = async () => { throw new Error("mint-failure-canary"); };
    await assert.rejects(resolveFederatedIdentity({ deps: { ...deps, sessions: failingSessions }, input: { workspaceId: "ws", startedAt: now,
      identity: { providerId: provider.id, issuer: provider.issuer, subject: "subject", email: member.email, emailAuthoritative: true } } }), MemberLoginError);
    assert.deepEqual(await deps.identities.listByMember({ workspaceId: "ws", memberId: member.id }), []);
    assert.equal((await deps.members.findById({ workspaceId: "ws", id: member.id }))?.status, "pending");
    assert.equal((await deps.sessions.findByTokenHash({ workspaceId: "ws", tokenHash: "old-hash" }))?.revokedAt, undefined);
  });
  test(`[${adapter.name}] new member/principal/link/session commit together`, async t => {
    const kernel = adapter.make();
    if (adapter.name === "sqlite") t.after(() => kernel.close());
    const deps = depsFor(kernel);
    const outcome = await resolveFederatedIdentity({ deps, input: { workspaceId: "ws", startedAt: "2026-10-24T12:00:00.000Z",
      identity: { providerId: provider.id, issuer: provider.issuer, subject: "subject", email: "person@gmail.com", emailAuthoritative: true } } });
    assert.equal(outcome.kind, "signed_in");
    if (outcome.kind !== "signed_in") return;
    const principal = await new SqlPrincipalRepo(kernel).findById({ workspaceId: "ws", id: outcome.result.member.id });
    assert.equal(principal?.kind, "member");
    assert.equal((await deps.identities.findBySubject({ workspaceId: "ws", issuer: provider.issuer, subject: "subject" }))?.memberId, principal?.id);
    assert.equal((await deps.sessions.listByMember({ workspaceId: "ws", memberId: outcome.result.member.id })).length, 1);
  });
}
