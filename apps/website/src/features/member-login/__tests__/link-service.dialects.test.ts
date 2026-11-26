import { schemaErasedKernel } from '#src/platform/db/content-kernel';
/** Real transaction boundaries: a failed session mint must roll back link and activation. */
import { orFallbackSync } from "@jini-ai/core/errors/idioms";
import { membersMailTransport } from "#src/features/members/mail-transport";
import assert from "node:assert/strict";
import test from "node:test";
import { eachDialect } from "../../../platform/db/kernel/__tests__/dialect-matrix.js";
import type { ContentKernel } from "../../../platform/db/content-kernel.js";
import { SqlPrincipalRepo } from "@jini-ai/user-management/identity/repo";
import { SqlMemberRepo, SqlMemberExternalIdentityRepo } from "@jini-ai/user-management/members/repo";
import { SqlMemberSessionRepo, SqlMagicLinkTokenRepo } from "@jini-ai/user-management/members/repo.sessions";
import { memberSqlDeps } from "../../members/repo.sqlite.js";
import { InMemoryMemberTierRepo, InMemoryMemberSubscriptionRepo } from "@jini-ai/user-management/members/repo.memory";
import { resolveFederatedIdentity, type MemberLoginLinkDeps } from "@jini-ai/user-management/member-login/link-service";
import { MemberLoginError } from "@jini-ai/user-management/server";
import { cryptoFixture, provider } from "./fixtures.js";

function depsFor(kernel: ContentKernel): MemberLoginLinkDeps {
  let seq = 0;
  return { clock: cryptoFixture().clock, ids: { newId: () => { seq++; return `id-${seq}`; } },
    members: new SqlMemberRepo(memberSqlDeps({ store: kernel })), sessions: new SqlMemberSessionRepo(memberSqlDeps({ store: kernel })), magicLinks: new SqlMagicLinkTokenRepo(memberSqlDeps({ store: kernel })),
    identities: new SqlMemberExternalIdentityRepo(memberSqlDeps({ store: kernel })), principals: new SqlPrincipalRepo({ kernel: schemaErasedKernel({ store: kernel }), table: 'principals' }),
    tiers: new InMemoryMemberTierRepo(), subscriptions: new InMemoryMemberSubscriptionRepo(),
    transaction: run => kernel.transaction(run), lockKey: key => kernel.lockKey(key), reportFailure: () => undefined,
    orFallbackSync,
    mailTransport: membersMailTransport,
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
    const failingSessions = new SqlMemberSessionRepo(memberSqlDeps({ store: kernel }));
    const oldSession = { workspaceId: "ws", tokenHash: "old-hash" };
    const seen: unknown[] = [];
    const save = t.mock.method(failingSessions, "save", async () => {
      const linked = await deps.identities.findBySubject({ workspaceId: "ws", issuer: provider.issuer, subject: "subject" });
      const active = await deps.members.findById({ workspaceId: "ws", id: member.id });
      const revoked = await deps.sessions.findByTokenHash(oldSession);
      seen.push([linked?.memberId, active?.status, revoked?.id, revoked?.revokedAt]);
      throw new Error("mint-failure-canary");
    });
    await assert.rejects(resolveFederatedIdentity({ deps: { ...deps, sessions: failingSessions }, input: { workspaceId: "ws", startedAt: now,
      identity: { providerId: provider.id, issuer: provider.issuer, subject: "subject", email: member.email, emailAuthoritative: true } } }), MemberLoginError);
    assert.equal(save.mock.callCount(), 1);
    assert.deepEqual(seen, [[member.id, "active", "old", now]]);
    assert.deepEqual(await deps.identities.listByMember({ workspaceId: "ws", memberId: member.id }), []);
    assert.equal((await deps.members.findById({ workspaceId: "ws", id: member.id }))?.status, "pending");
    const restored = await deps.sessions.findByTokenHash(oldSession);
    assert.equal(restored?.id, "old");
    assert.equal(restored?.revokedAt, undefined);
  });
  test(`[${adapter.name}] new member/principal/link/session commit together`, async t => {
    const kernel = adapter.make();
    if (adapter.name === "sqlite") t.after(() => kernel.close());
    const deps = depsFor(kernel);
    const outcome = await resolveFederatedIdentity({ deps, input: { workspaceId: "ws", startedAt: "2026-10-24T12:00:00.000Z",
      identity: { providerId: provider.id, issuer: provider.issuer, subject: "subject", email: "person@gmail.com", emailAuthoritative: true } } });
    assert.equal(outcome.kind, "signed_in");
    if (outcome.kind !== "signed_in") return;
    const principal = await new SqlPrincipalRepo({ kernel: schemaErasedKernel({ store: kernel }), table: 'principals' }).findById({ workspaceId: "ws", id: outcome.result.member.id });
    assert.equal(principal?.kind, "member");
    assert.equal((await deps.identities.findBySubject({ workspaceId: "ws", issuer: provider.issuer, subject: "subject" }))?.memberId, principal?.id);
    assert.equal((await deps.sessions.listByMember({ workspaceId: "ws", memberId: outcome.result.member.id })).length, 1);
  });
}
