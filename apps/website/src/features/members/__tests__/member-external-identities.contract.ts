/** Storage contract for the amended 2026-10-24 Google login design, shard S1. */
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { MemberExternalIdentityRepoPort } from "../ports.js";
import type { MemberExternalIdentityRecord } from "../types.js";

const LINKED = "2026-10-24T20:00:00.000Z";
const UNLINKED = "2026-10-24T20:01:00.000Z";
const identity: MemberExternalIdentityRecord = {
  id: "identity", workspaceId: "w", memberId: "member", providerId: "google",
  issuer: "https://accounts.google.com", subject: "subject", linkedAt: LINKED,
};

/** Register identical observable assertions for every adapter, without inspecting private state. */
export function runExternalIdentityContract(required: {
  name: string;
  open: (t: TestContext) => Promise<MemberExternalIdentityRepoPort>;
}, _options: Record<string, never> = {}): void {
  const { name, open } = required;
  test(`[${name}] identity round-trip is scoped and independent of email or tokens`, async t => {
    const repo = await open(t);
    assert.equal(await repo.findBySubject({ workspaceId: "w", issuer: identity.issuer, subject: identity.subject }), null);
    assert.deepEqual(await repo.listByMember({ workspaceId: "w", memberId: "member" }), []);
    await repo.save(identity);
    assert.deepEqual(await repo.findBySubject({ workspaceId: "w", issuer: identity.issuer, subject: identity.subject }), identity);
    assert.deepEqual(await repo.findByMemberAndProvider({ workspaceId: "w", memberId: "member", providerId: "google" }), identity);
    assert.deepEqual(await repo.listByMember({ workspaceId: "w", memberId: "member" }), [identity]);
    assert.equal(await repo.findBySubject({ workspaceId: "other", issuer: identity.issuer, subject: identity.subject }), null);
    assert.equal(await repo.findBySubject({ workspaceId: "w", issuer: "https://other.test", subject: identity.subject }), null);
    assert.equal(await repo.findByMemberAndProvider({ workspaceId: "other", memberId: "member", providerId: "google" }), null);
    assert.equal(await repo.findByMemberAndProvider({ workspaceId: "w", memberId: "other", providerId: "google" }), null);
    assert.deepEqual(await repo.listByMember({ workspaceId: "other", memberId: "member" }), []);
    // An identity has no email column: changing a member's address cannot change subject ownership.
    assert.deepEqual(Object.keys(identity).sort(), ["id", "workspaceId", "memberId", "providerId", "issuer", "subject", "linkedAt"].sort());
  });

  test(`[${name}] both natural keys reserve ownership, including unlinked rows`, async t => {
    const repo = await open(t);
    await repo.save(identity);
    await repo.unlink({ workspaceId: "w", memberId: "member", providerId: "google", unlinkedAt: UNLINKED });
    await assert.rejects(repo.save({ ...identity, id: "other-member", memberId: "other", providerId: "other" }));
    await assert.rejects(repo.save({ ...identity, id: "other-subject", subject: "other" }));
    await repo.save({ ...identity, id: "foreign", workspaceId: "other" });
    assert.equal((await repo.listByMember({ workspaceId: "other", memberId: "member" })).length, 1);
    assert.equal((await repo.findBySubject({ workspaceId: "w", issuer: identity.issuer, subject: identity.subject }))?.unlinkedAt, UNLINKED);
  });

  test(`[${name}] an id cannot move ownership, even during explicit reconnect`, async t => {
    const repo = await open(t);
    await repo.save(identity);
    for (const change of [{ workspaceId: "other" }, { memberId: "other" }, { providerId: "other" }]) {
      await assert.rejects(repo.save({ ...identity, ...change }, { allowRelink: true }));
    }
    await assert.rejects(repo.save({ ...identity, subject: "other" }));
    await assert.rejects(repo.save({ ...identity, issuer: "https://other.test" }));
    assert.deepEqual(await repo.listByMember({ workspaceId: "w", memberId: "member" }), [identity]);
  });

  test(`[${name}] unlink survives stale callbacks and is idempotent and workspace-scoped`, async t => {
    const repo = await open(t);
    await repo.save(identity);
    await repo.unlink({ workspaceId: "other", memberId: "member", providerId: "google", unlinkedAt: UNLINKED });
    await repo.unlink({ workspaceId: "w", memberId: "other", providerId: "google", unlinkedAt: UNLINKED });
    await repo.unlink({ workspaceId: "w", memberId: "member", providerId: "missing", unlinkedAt: UNLINKED });
    assert.deepEqual(await repo.findByMemberAndProvider({ workspaceId: "w", memberId: "member", providerId: "google" }), identity);
    await repo.unlink({ workspaceId: "w", memberId: "member", providerId: "google", unlinkedAt: UNLINKED });
    await repo.unlink({ workspaceId: "w", memberId: "member", providerId: "google", unlinkedAt: "2026-10-24T20:02:00.000Z" });
    await assert.rejects(repo.save(identity));
    await assert.rejects(repo.save(identity, { allowRelink: false }));
    assert.deepEqual(await repo.listByMember({ workspaceId: "w", memberId: "member" }), [{ ...identity, unlinkedAt: UNLINKED }]);
  });

  test(`[${name}] explicit connect reuses the marker row and can change the subject`, async t => {
    const repo = await open(t);
    await repo.save(identity);
    await repo.unlink({ workspaceId: "w", memberId: "member", providerId: "google", unlinkedAt: UNLINKED });
    const reconnected = { ...identity, subject: "new-subject", linkedAt: "2026-10-24T20:03:00.000Z" };
    await repo.save(reconnected, { allowRelink: true });
    assert.deepEqual(await repo.findByMemberAndProvider({ workspaceId: "w", memberId: "member", providerId: "google" }), reconnected);
    assert.equal(await repo.findBySubject({ workspaceId: "w", issuer: identity.issuer, subject: identity.subject }), null);
    await repo.save(reconnected);
  });

  test(`[${name}] conflicting concurrent inserts produce exactly one owner`, async t => {
    const repo = await open(t);
    const outcomes = await Promise.allSettled([
      repo.save(identity), repo.save({ ...identity, id: "racer", memberId: "racer" }),
    ]);
    assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(outcomes.filter(result => result.status === "rejected").length, 1);
    const owner = await repo.findBySubject({ workspaceId: "w", issuer: identity.issuer, subject: identity.subject });
    assert.ok(owner);
    assert.equal((await repo.listByMember({ workspaceId: "w", memberId: owner.memberId })).length, 1);
  });

  test(`[${name}] listing orders multiple providers and active upserts retain a single row`, async t => {
    const repo = await open(t);
    await repo.save({ ...identity, id: "z", providerId: "z-provider", subject: "z-subject" });
    await repo.save(identity);
    await repo.save({ ...identity, id: "a", providerId: "a-provider", subject: "a-subject" });
    await repo.save({ ...identity, linkedAt: "2026-10-24T20:03:00.000Z" });
    const rows = await repo.listByMember({ workspaceId: "w", memberId: "member" });
    assert.deepEqual(rows.map(row => row.providerId), ["a-provider", "google", "z-provider"]);
    assert.equal(rows[1]?.linkedAt, "2026-10-24T20:03:00.000Z");
  });

  test(`[${name}] records cannot mutate storage through input or output references`, async t => {
    const repo = await open(t);
    const input = { ...identity };
    await repo.save(input);
    input.subject = "mutated-input";
    const read = (await repo.listByMember({ workspaceId: "w", memberId: "member" }))[0]!;
    read.subject = "mutated-output";
    assert.deepEqual(await repo.findByMemberAndProvider({ workspaceId: "w", memberId: "member", providerId: "google" }), identity);
  });
}
