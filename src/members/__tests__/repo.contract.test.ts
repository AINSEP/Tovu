import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb } from "../../db/sqlite/content-db";
import {
  InMemoryMagicLinkTokenRepo,
  InMemoryMemberConsentRepo,
  InMemoryMemberRepo,
  InMemoryMemberSessionRepo,
  InMemoryMemberSubscriptionRepo,
  InMemoryMemberTierRepo,
} from "../repo.memory";
import {
  SqliteMagicLinkTokenRepo,
  SqliteMemberConsentRepo,
  SqliteMemberRepo,
  SqliteMemberSessionRepo,
  SqliteMemberSubscriptionRepo,
  SqliteMemberTierRepo,
} from "../repo.sqlite";
import type {
  MagicLinkTokenRepoPort,
  MemberConsentRepoPort,
  MemberRepoPort,
  MemberSessionRepoPort,
  MemberSubscriptionRepoPort,
  MemberTierRepoPort,
} from "../ports";

/**
 * @file T036/C-002 (ADR-PIPE-013 Decision §5, Article IV rule-of-two) —
 * shared contract-test suite covering all 6 `Member*RepoPort` interfaces (the
 * 5 pre-existing + the new `MemberConsentRepoPort`), run against BOTH
 * `repo.memory.ts` and `repo.sqlite.ts`. Mirrors
 * `src/features/settings/__tests__/repo.contract.test.ts`'s shape — no such
 * shared-suite convention existed for the 5 pre-existing ports before this
 * pass (only adapter-specific unit tests in `repo.memory.test.ts`).
 *
 * No SQL-level FK to `workspaces` on any member table (unlike
 * `setting_values_workspace`/`_user`), so no workspace-seeding precondition
 * is needed before these tests run.
 */

const NOW = "2026-07-13T00:00:00.000Z";

function runMemberRepoContractSuite(adapterName: string, makeRepo: () => MemberRepoPort) {
  test(`[${adapterName}] MemberRepoPort: save + findById round-trips`, async () => {
    const repo = makeRepo();
    await repo.save({
      id: "m-1",
      workspaceId: "ws-1",
      email: "a@example.com",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
      version: 1,
    });
    const found = await repo.findById({ workspaceId: "ws-1", id: "m-1" });
    assert.equal(found?.email, "a@example.com");
  });

  test(`[${adapterName}] MemberRepoPort: findByEmail is case-insensitive and workspace-scoped`, async () => {
    const repo = makeRepo();
    await repo.save({
      id: "m-2",
      workspaceId: "ws-1",
      email: "b@example.com",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
      version: 1,
    });
    assert.equal((await repo.findByEmail({ workspaceId: "ws-1", email: "B@Example.com" }))?.id, "m-2");
    assert.equal(await repo.findByEmail({ workspaceId: "ws-OTHER", email: "b@example.com" }), null);
  });

  test(`[${adapterName}] MemberRepoPort: list paginates by id cursor within a workspace`, async () => {
    const repo = makeRepo();
    await repo.save({ id: "m-1", workspaceId: "ws-list", email: "x1@example.com", status: "active", createdAt: NOW, updatedAt: NOW, version: 1 });
    await repo.save({ id: "m-2", workspaceId: "ws-list", email: "x2@example.com", status: "active", createdAt: NOW, updatedAt: NOW, version: 1 });
    await repo.save({ id: "m-3", workspaceId: "ws-list", email: "x3@example.com", status: "active", createdAt: NOW, updatedAt: NOW, version: 1 });

    const firstPage = await repo.list({ workspaceId: "ws-list", limit: 2 });
    assert.deepEqual(firstPage.map((m) => m.id), ["m-1", "m-2"]);
    const secondPage = await repo.list({ workspaceId: "ws-list", afterId: "m-2", limit: 2 });
    assert.deepEqual(secondPage.map((m) => m.id), ["m-3"]);
  });

  test(`[${adapterName}] MemberRepoPort: save upserts by id (version bump visible on re-read)`, async () => {
    const repo = makeRepo();
    await repo.save({ id: "m-up", workspaceId: "ws-1", email: "up@example.com", status: "pending", createdAt: NOW, updatedAt: NOW, version: 1 });
    await repo.save({ id: "m-up", workspaceId: "ws-1", email: "up@example.com", status: "active", createdAt: NOW, updatedAt: NOW, version: 2 });
    const found = await repo.findById({ workspaceId: "ws-1", id: "m-up" });
    assert.equal(found?.status, "active");
    assert.equal(found?.version, 2);
  });
}

function runMemberTierRepoContractSuite(adapterName: string, makeRepo: () => MemberTierRepoPort) {
  test(`[${adapterName}] MemberTierRepoPort: save + findById + findBySlug round-trip`, async () => {
    const repo = makeRepo();
    await repo.save({
      id: "t-1",
      workspaceId: "ws-1",
      name: "Gold",
      slug: "gold",
      type: "paid",
      status: "active",
      visibleInPortal: true,
      createdAt: NOW,
      updatedAt: NOW,
      version: 1,
    });
    assert.equal((await repo.findById({ workspaceId: "ws-1", id: "t-1" }))?.slug, "gold");
    assert.equal((await repo.findBySlug({ workspaceId: "ws-1", slug: "gold" }))?.id, "t-1");
    assert.equal(await repo.findBySlug({ workspaceId: "ws-OTHER", slug: "gold" }), null);
  });

  test(`[${adapterName}] MemberTierRepoPort: list scopes to workspace`, async () => {
    const repo = makeRepo();
    await repo.save({ id: "t-2", workspaceId: "ws-list-tiers", name: "Free", slug: "free", type: "free", status: "active", visibleInPortal: true, createdAt: NOW, updatedAt: NOW, version: 1 });
    const rows = await repo.list({ workspaceId: "ws-list-tiers" });
    assert.equal(rows.length, 1);
  });
}

function runMemberSubscriptionRepoContractSuite(adapterName: string, makeRepo: () => MemberSubscriptionRepoPort) {
  test(`[${adapterName}] MemberSubscriptionRepoPort: save + findById + listByMember + listActiveByMember`, async () => {
    const repo = makeRepo();
    await repo.save({
      id: "s-1",
      workspaceId: "ws-1",
      memberId: "m-sub",
      tierId: "t-1",
      status: "active",
      source: "signup",
      startedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
      version: 1,
    });
    await repo.save({
      id: "s-2",
      workspaceId: "ws-1",
      memberId: "m-sub",
      tierId: "t-2",
      status: "canceled",
      source: "comp",
      startedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
      version: 1,
    });

    assert.equal((await repo.findById({ workspaceId: "ws-1", id: "s-1" }))?.tierId, "t-1");

    const all = await repo.listByMember({ workspaceId: "ws-1", memberId: "m-sub" });
    assert.equal(all.length, 2);

    const active = await repo.listActiveByMember({ workspaceId: "ws-1", memberId: "m-sub", nowIso: NOW });
    assert.deepEqual(active.map((s) => s.id), ["s-1"]);
  });

  test(`[${adapterName}] MemberSubscriptionRepoPort: listActiveByMember excludes a lapsed currentPeriodEnd`, async () => {
    const repo = makeRepo();
    await repo.save({
      id: "s-expired",
      workspaceId: "ws-1",
      memberId: "m-expired",
      tierId: "t-1",
      status: "active",
      source: "signup",
      startedAt: "2026-01-01T00:00:00.000Z",
      currentPeriodEnd: "2026-02-01T00:00:00.000Z",
      createdAt: NOW,
      updatedAt: NOW,
      version: 1,
    });
    const active = await repo.listActiveByMember({ workspaceId: "ws-1", memberId: "m-expired", nowIso: "2026-07-13T00:00:00.000Z" });
    assert.equal(active.length, 0);
  });
}

function runMemberSessionRepoContractSuite(adapterName: string, makeRepo: () => MemberSessionRepoPort) {
  test(`[${adapterName}] MemberSessionRepoPort: save + findByTokenHash + listByMember + revoke`, async () => {
    const repo = makeRepo();
    await repo.save({ id: "sess-1", workspaceId: "ws-1", memberId: "m-sess", tokenHash: "hash-1", createdAt: NOW, expiresAt: NOW });
    assert.equal((await repo.findByTokenHash({ workspaceId: "ws-1", tokenHash: "hash-1" }))?.id, "sess-1");

    const rows = await repo.listByMember({ workspaceId: "ws-1", memberId: "m-sess" });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].revokedAt, undefined);

    await repo.revoke({ workspaceId: "ws-1", id: "sess-1", revokedAt: NOW });
    const revoked = await repo.findByTokenHash({ workspaceId: "ws-1", tokenHash: "hash-1" });
    assert.equal(revoked?.revokedAt, NOW);
  });

  test(`[${adapterName}] MemberSessionRepoPort: revokeAllForMember revokes only that member's un-revoked sessions`, async () => {
    const repo = makeRepo();
    await repo.save({ id: "sess-a", workspaceId: "ws-1", memberId: "m-multi", tokenHash: "hash-a", createdAt: NOW, expiresAt: NOW });
    await repo.save({ id: "sess-b", workspaceId: "ws-1", memberId: "m-multi", tokenHash: "hash-b", createdAt: NOW, expiresAt: NOW });
    await repo.save({ id: "sess-other", workspaceId: "ws-1", memberId: "m-other", tokenHash: "hash-other", createdAt: NOW, expiresAt: NOW });

    await repo.revokeAllForMember({ workspaceId: "ws-1", memberId: "m-multi", revokedAt: NOW });

    const revokedA = await repo.findByTokenHash({ workspaceId: "ws-1", tokenHash: "hash-a" });
    const revokedB = await repo.findByTokenHash({ workspaceId: "ws-1", tokenHash: "hash-b" });
    const untouched = await repo.findByTokenHash({ workspaceId: "ws-1", tokenHash: "hash-other" });
    assert.equal(revokedA?.revokedAt, NOW);
    assert.equal(revokedB?.revokedAt, NOW);
    assert.equal(untouched?.revokedAt, undefined);
  });
}

function runMagicLinkTokenRepoContractSuite(adapterName: string, makeRepo: () => MagicLinkTokenRepoPort) {
  test(`[${adapterName}] MagicLinkTokenRepoPort: save + findByTokenHash + single-use consume`, async () => {
    const repo = makeRepo();
    await repo.save({ id: "tok-1", workspaceId: "ws-1", memberId: "m-tok", tokenHash: "hash-tok", purpose: "signin", createdAt: NOW, expiresAt: NOW });
    assert.equal((await repo.findByTokenHash({ workspaceId: "ws-1", tokenHash: "hash-tok" }))?.id, "tok-1");

    await repo.consume({ workspaceId: "ws-1", id: "tok-1", consumedAt: NOW });
    const consumed = await repo.findByTokenHash({ workspaceId: "ws-1", tokenHash: "hash-tok" });
    assert.equal(consumed?.consumedAt, NOW);

    await assert.rejects(() => repo.consume({ workspaceId: "ws-1", id: "tok-1", consumedAt: NOW }));
  });

  test(`[${adapterName}] MagicLinkTokenRepoPort: consuming an unknown id rejects`, async () => {
    const repo = makeRepo();
    await assert.rejects(() => repo.consume({ workspaceId: "ws-1", id: "no-such-token", consumedAt: NOW }));
  });
}

function runMemberConsentRepoContractSuite(adapterName: string, makeRepo: () => MemberConsentRepoPort) {
  test(`[${adapterName}] MemberConsentRepoPort: save + findByMemberAndPurpose round-trips, workspace-scoped`, async () => {
    const repo = makeRepo();
    await repo.save({
      id: "c-1",
      workspaceId: "ws-1",
      memberId: "m-consent",
      purpose: "newsletter:list-1",
      status: "pending",
      evidence: { source: "form" },
      createdAt: NOW,
      updatedAt: NOW,
      version: 1,
    });
    const found = await repo.findByMemberAndPurpose({ workspaceId: "ws-1", memberId: "m-consent", purpose: "newsletter:list-1" });
    assert.equal(found?.status, "pending");
    assert.equal(found?.evidence.source, "form");
    assert.equal(await repo.findByMemberAndPurpose({ workspaceId: "ws-OTHER", memberId: "m-consent", purpose: "newsletter:list-1" }), null);
  });

  test(`[${adapterName}] MemberConsentRepoPort: appendRevision assigns a monotonically increasing seq; listRevisions returns ascending order`, async () => {
    const repo = makeRepo();
    const base = {
      workspaceId: "ws-1",
      memberId: "m-rev",
      consentId: "c-rev",
      purpose: "marketing-email",
      op: "consent_request" as const,
      beforeJson: null,
      afterJson: { status: "pending" },
      originModule: "newsletter",
      createdAt: NOW,
    };
    const seq1 = await repo.appendRevision(base);
    const seq2 = await repo.appendRevision({ ...base, op: "consent_confirm", afterJson: { status: "granted" } });
    assert.ok(seq2 > seq1);

    const revisions = await repo.listRevisions({ workspaceId: "ws-1", memberId: "m-rev" });
    assert.deepEqual(revisions.map((r) => r.op), ["consent_request", "consent_confirm"]);
  });

  test(`[${adapterName}] MemberConsentRepoPort: listRevisions filters by purpose when given`, async () => {
    const repo = makeRepo();
    await repo.appendRevision({ workspaceId: "ws-1", memberId: "m-filter", consentId: "c-a", purpose: "purpose-a", op: "consent_request", beforeJson: null, afterJson: null, originModule: "x", createdAt: NOW });
    await repo.appendRevision({ workspaceId: "ws-1", memberId: "m-filter", consentId: "c-b", purpose: "purpose-b", op: "consent_request", beforeJson: null, afterJson: null, originModule: "x", createdAt: NOW });

    const filtered = await repo.listRevisions({ workspaceId: "ws-1", memberId: "m-filter", purpose: "purpose-a" });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].purpose, "purpose-a");
  });

  test(`[${adapterName}] MemberConsentRepoPort: transaction runs the callback and returns its result`, async () => {
    const repo = makeRepo();
    const result = await repo.transaction(async () => {
      await repo.save({
        id: "c-tx",
        workspaceId: "ws-1",
        memberId: "m-tx",
        purpose: "tx-purpose",
        status: "pending",
        evidence: { source: "tx" },
        createdAt: NOW,
        updatedAt: NOW,
        version: 1,
      });
      return "done";
    });
    assert.equal(result, "done");
    assert.notEqual(await repo.findByMemberAndPurpose({ workspaceId: "ws-1", memberId: "m-tx", purpose: "tx-purpose" }), null);
  });
}

runMemberRepoContractSuite("InMemoryMemberRepo", () => new InMemoryMemberRepo());
runMemberRepoContractSuite("SqliteMemberRepo", () => new SqliteMemberRepo(openContentDb(":memory:")));

runMemberTierRepoContractSuite("InMemoryMemberTierRepo", () => new InMemoryMemberTierRepo());
runMemberTierRepoContractSuite("SqliteMemberTierRepo", () => new SqliteMemberTierRepo(openContentDb(":memory:")));

runMemberSubscriptionRepoContractSuite("InMemoryMemberSubscriptionRepo", () => new InMemoryMemberSubscriptionRepo());
runMemberSubscriptionRepoContractSuite("SqliteMemberSubscriptionRepo", () => new SqliteMemberSubscriptionRepo(openContentDb(":memory:")));

runMemberSessionRepoContractSuite("InMemoryMemberSessionRepo", () => new InMemoryMemberSessionRepo());
runMemberSessionRepoContractSuite("SqliteMemberSessionRepo", () => new SqliteMemberSessionRepo(openContentDb(":memory:")));

runMagicLinkTokenRepoContractSuite("InMemoryMagicLinkTokenRepo", () => new InMemoryMagicLinkTokenRepo());
runMagicLinkTokenRepoContractSuite("SqliteMagicLinkTokenRepo", () => new SqliteMagicLinkTokenRepo(openContentDb(":memory:")));

runMemberConsentRepoContractSuite("InMemoryMemberConsentRepo", () => new InMemoryMemberConsentRepo());
runMemberConsentRepoContractSuite("SqliteMemberConsentRepo", () => new SqliteMemberConsentRepo(openContentDb(":memory:")));
