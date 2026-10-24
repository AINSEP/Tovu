/** The same member credential contracts on SQLite, PGlite and the dev/test memory adapter. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { MagicLinkTokenRepoPort, MemberRepoPort, MemberSessionRepoPort } from "../ports.js";
import { InMemoryMagicLinkTokenRepo, InMemoryMemberRepo, InMemoryMemberSessionRepo } from "../repo.memory.js";
import { SqlMagicLinkTokenRepo, SqlMemberRepo, SqlMemberSessionRepo } from "../repo.js";
import type { MagicLinkTokenRecord, MemberRecord } from "../types.js";

const NOW = "2026-10-24T12:00:00.000Z";
const member: MemberRecord = {
  id: "member", workspaceId: "w", email: "member@example.com", status: "active",
  createdAt: NOW, updatedAt: NOW, version: 1,
};
const challenge: MagicLinkTokenRecord = {
  id: "challenge", workspaceId: "w", memberId: member.id, email: member.email,
  tokenHash: "link-hash", codeHash: "code-hash", purpose: "signin",
  createdAt: NOW, expiresAt: "2026-10-24T12:15:00.000Z",
};
interface Repos {
  members: MemberRepoPort;
  tokens: MagicLinkTokenRepoPort;
  sessions: MemberSessionRepoPort;
  close?: () => Promise<void>;
}
const adapters = [
  ...eachDialect<Repos>({ tables: ["member_sessions", "members", "member_magic_tokens"], make: kernel => ({
    members: new SqlMemberRepo(kernel), tokens: new SqlMagicLinkTokenRepo(kernel), sessions: new SqlMemberSessionRepo(kernel),
    close: kernel.dialect === "sqlite" ? () => kernel.close() : undefined,
  }) }),
  { name: "memory", make: (): Repos => ({ members: new InMemoryMemberRepo(), tokens: new InMemoryMagicLinkTokenRepo(), sessions: new InMemoryMemberSessionRepo() }) },
];

for (const adapter of adapters) {
  test(`[${adapter.name}] D2: bulk revocation excludes only the current session within the member/workspace`, async t => {
    const { members, sessions, close } = adapter.make();
    t.after(() => close?.());
    await members.save(member);
    await members.save({ ...member, id: "other-member", email: "other@example.test" });
    await members.save({ ...member, id: "foreign-member", workspaceId: "foreign" });
    for (const id of ["current", "other", "revoked", "unrelated", "foreign"]) {
      await sessions.save({ id, workspaceId: id === "foreign" ? "foreign" : "w",
        memberId: id === "unrelated" ? "other-member" : id === "foreign" ? "foreign-member" : member.id,
        tokenHash: `hash-${id}`, createdAt: NOW, expiresAt: "2026-11-24T12:00:00.000Z",
        revokedAt: id === "revoked" ? NOW : undefined });
    }
    const revokedAt = "2026-10-24T12:01:00.000Z";
    await sessions.revokeAllForMember({ workspaceId: "w", memberId: member.id, revokedAt }, { exceptSessionId: "current" });
    const read = (id: string, workspaceId = "w") => sessions.findByTokenHash({ workspaceId, tokenHash: `hash-${id}` });
    assert.equal((await read("current"))?.revokedAt, undefined);
    assert.equal((await read("current"))?.createdAt, NOW, "keeping a session must not refresh its issuance time");
    assert.equal((await read("other"))?.revokedAt, revokedAt);
    assert.equal((await read("revoked"))?.revokedAt, NOW);
    assert.equal((await read("unrelated"))?.revokedAt, undefined);
    assert.equal((await read("foreign", "foreign"))?.revokedAt, undefined);
    await sessions.revokeAllForMember({ workspaceId: "w", memberId: member.id, revokedAt });
    assert.equal((await read("current"))?.revokedAt, revokedAt, "reset's default still revokes every session");
    await sessions.revokeAllForMember({ workspaceId: "w", memberId: member.id, revokedAt: "2026-10-24T12:02:00.000Z" },
      { exceptSessionId: "current" });
    assert.equal((await read("current"))?.revokedAt, revokedAt, "exclusion never restores an already-revoked session");
  });

  test(`[${adapter.name}] password reads/writes are scoped and profile saves cannot erase or expose the hash`, async t => {
    const { members, close } = adapter.make();
    t.after(() => close?.());
    assert.equal(await members.findPasswordHash({ workspaceId: "w", memberId: member.id }), null);
    await members.save(member);
    assert.equal(await members.findPasswordHash({ workspaceId: "w", memberId: member.id }), null);
    await members.setPasswordHash({ workspaceId: "w", memberId: member.id, passwordHash: "first-hash" });
    await members.save({ ...member, name: "Updated", version: 2 });
    assert.equal(await members.findPasswordHash({ workspaceId: "w", memberId: member.id }), "first-hash");
    await members.setPasswordHash({ workspaceId: "w", memberId: member.id, passwordHash: "replacement-hash" });
    assert.equal(await members.findPasswordHash({ workspaceId: "w", memberId: member.id }), "replacement-hash");
    assert.equal(await members.findPasswordHash({ workspaceId: "other", memberId: member.id }), null);
    await assert.rejects(members.setPasswordHash({ workspaceId: "other", memberId: member.id, passwordHash: "foreign-hash" }));
    await assert.rejects(members.setPasswordHash({ workspaceId: "w", memberId: "missing", passwordHash: "missing-hash" }));
    const views = [await members.findById({ workspaceId: "w", id: member.id }),
      await members.findByEmail({ workspaceId: "w", email: member.email }), ...(await members.list({ workspaceId: "w" }))];
    for (const view of views) {
      assert.ok(view);
      assert.equal(Object.hasOwn(view, "passwordHash"), false);
      assert.equal(Object.hasOwn(view, "password_hash"), false);
      assert.doesNotMatch(JSON.stringify(view), /first-hash|replacement-hash/);
    }
    await members.save({ ...member, status: "trash", version: 3 });
    assert.equal(await members.findPasswordHash({ workspaceId: "w", memberId: member.id }), null);
    await assert.rejects(members.setPasswordHash({ workspaceId: "w", memberId: member.id, passwordHash: "trash-hash" }));
  });

  test(`[${adapter.name}] challenge fields, reset purpose and id lookup round-trip within the member realm`, async t => {
    const { tokens, close } = adapter.make();
    t.after(() => close?.());
    const reset = { ...challenge, purpose: "password_reset" as const, failedAttempts: 2, consumedAt: undefined };
    await tokens.save(reset);
    const found = await tokens.findById({ workspaceId: "w", id: challenge.id });
    assert.deepEqual(found, { ...reset, consumedAt: undefined });
    assert.deepEqual(await tokens.findByTokenHash({ workspaceId: "w", tokenHash: challenge.tokenHash }), found);
    assert.equal(await tokens.findById({ workspaceId: "other", id: challenge.id }), null);
    assert.equal(await tokens.findById({ workspaceId: "w", id: "missing" }), null);
    const { codeHash: _code, failedAttempts: _attempts, ...legacy } = reset;
    await tokens.save({ ...legacy, id: "legacy", tokenHash: "legacy-hash" });
    const old = await tokens.findById({ workspaceId: "w", id: "legacy" });
    assert.equal(old?.codeHash, undefined);
    assert.equal(old?.failedAttempts ?? 0, 0);
  });

  test(`[${adapter.name}] concurrent code attempts reserve at most the limit, only on live challenges`, async t => {
    const { tokens, close } = adapter.make();
    t.after(() => close?.());
    await tokens.save(challenge);
    await tokens.save({ ...challenge, id: "expired", tokenHash: "expired-hash", expiresAt: NOW });
    const reserve = (id: string) => tokens.reserveCodeAttempt({ workspaceId: "w", id, nowIso: NOW });
    assert.equal(await tokens.reserveCodeAttempt({ workspaceId: "other", id: challenge.id, nowIso: NOW }), false);
    assert.equal(await reserve("missing"), false);
    assert.equal(await reserve("expired"), false);
    const reserved = await Promise.all(Array.from({ length: 7 }, () => reserve(challenge.id)));
    assert.equal(reserved.filter(Boolean).length, 5);
    assert.equal((await tokens.findById({ workspaceId: "w", id: challenge.id }))?.failedAttempts, 5);
    assert.equal(await tokens.reserveCodeAttempt({ workspaceId: "w", id: challenge.id, nowIso: NOW }, { maxAttempts: 6 }), true);
    // Consume never rechecks attempts: the fifth reserved attempt may carry the correct code.
    await tokens.consume({ workspaceId: "w", id: challenge.id, consumedAt: NOW });
    assert.equal((await tokens.findById({ workspaceId: "w", id: challenge.id }))?.consumedAt, NOW);
  });

  test(`[${adapter.name}] link and code share exactly one successful consume; consumed rows cannot accrue attempts`, async t => {
    const { tokens, close } = adapter.make();
    t.after(() => close?.());
    await tokens.save(challenge);
    const outcomes = await Promise.allSettled([
      tokens.consume({ workspaceId: "w", id: challenge.id, consumedAt: NOW }),
      tokens.consume({ workspaceId: "w", id: challenge.id, consumedAt: NOW }),
    ]);
    assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(outcomes.filter(result => result.status === "rejected").length, 1);
    assert.equal(await tokens.reserveCodeAttempt({ workspaceId: "w", id: challenge.id, nowIso: NOW }), false);
    const used = await tokens.findById({ workspaceId: "w", id: challenge.id });
    assert.equal(used?.consumedAt, NOW);
    assert.equal(used?.failedAttempts ?? 0, 0);
  });
}
