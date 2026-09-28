import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { memberRepoFor, memberSubscriptionRepoFor, memberTierRepoFor } from "../repo.js";
import type { MemberRecord, MemberSubscriptionRecord, MemberTierRecord } from "../types.js";

/**
 * @file The members repos on every dialect through the kernel's matrix (`describeEachDialect` + ONE
 * factory: one query body serves every dialect). One `describe` per repo class; each covers every
 * public method: hit, miss, other-workspace isolation and rollback.
 */

const WS = "ws-dialects";
const OTHER = "ws-other";
const T0 = "2026-09-28T00:00:00.000Z";

const TABLES = [
  "members",
  "member_tiers",
  "member_subscriptions",
  "member_sessions",
  "member_magic_tokens",
  "member_consents",
  "member_revisions",
] as const;

function member(id: string, email: string, overrides: Partial<MemberRecord> = {}): MemberRecord {
  return {
    id,
    workspaceId: WS,
    email,
    name: `Name ${id}`,
    emailVerifiedAt: T0,
    status: "active",
    note: "a note",
    fields: { plan: "pro", n: 2 },
    createdAt: T0,
    updatedAt: T0,
    version: 1,
    ...overrides,
  };
}

function tier(id: string, slug: string, overrides: Partial<MemberTierRecord> = {}): MemberTierRecord {
  return {
    id,
    workspaceId: WS,
    name: `Tier ${slug}`,
    slug,
    type: "paid",
    status: "active",
    description: "desc",
    welcomePagePath: "/welcome",
    visibleInPortal: true,
    monthlyPriceCents: 500,
    yearlyPriceCents: 5000,
    currency: "usd",
    createdAt: T0,
    updatedAt: T0,
    version: 1,
    ...overrides,
  };
}

function subscription(id: string, overrides: Partial<MemberSubscriptionRecord> = {}): MemberSubscriptionRecord {
  return {
    id,
    workspaceId: WS,
    memberId: "m1",
    tierId: "t1",
    status: "active",
    source: "manual",
    externalRef: "ext-1",
    startedAt: T0,
    currentPeriodEnd: "2027-01-01T00:00:00.000Z",
    canceledAt: undefined,
    createdAt: T0,
    updatedAt: T0,
    version: 1,
    ...overrides,
  };
}

function repos(kernel: ContentKernel) {
  return { kernel, members: memberRepoFor(kernel), tiers: memberTierRepoFor(kernel), subs: memberSubscriptionRepoFor(kernel) };
}

describeEachDialect("members repos", { tables: TABLES, make: repos }, (makeRepos) => {
  describe("MemberRepo", () => {
    test("save then findById / findByEmail round-trip; email is matched normalized", async () => {
      const { members } = makeRepos();
      await members.save(member("m1", "a@example.com"));
      assert.deepEqual(await members.findById({ workspaceId: WS, id: "m1" }), member("m1", "a@example.com"));
      assert.deepEqual(await members.findByEmail({ workspaceId: WS, email: "  A@Example.com " }), member("m1", "a@example.com"));
    });

    test("optional fields round-trip as undefined when absent", async () => {
      const { members } = makeRepos();
      const bare = member("m1", "a@example.com", {
        name: undefined,
        emailVerifiedAt: undefined,
        note: undefined,
        fields: undefined,
      });
      await members.save(bare);
      assert.deepEqual(await members.findById({ workspaceId: WS, id: "m1" }), bare);
    });

    test("reads miss unknown ids/emails and never cross workspaces", async () => {
      const { members } = makeRepos();
      await members.save(member("m1", "a@example.com"));
      assert.equal(await members.findById({ workspaceId: WS, id: "nope" }), null);
      assert.equal(await members.findById({ workspaceId: OTHER, id: "m1" }), null);
      assert.equal(await members.findByEmail({ workspaceId: WS, email: "nope@example.com" }), null);
      assert.equal(await members.findByEmail({ workspaceId: OTHER, email: "a@example.com" }), null);
      assert.deepEqual(await members.list({ workspaceId: OTHER }), []);
    });

    test("save upserts by id; another workspace may reuse the email", async () => {
      const { members } = makeRepos();
      await members.save(member("m1", "a@example.com"));
      await members.save(member("m1", "a@example.com", { name: "Renamed", version: 2, fields: undefined }));
      await members.save(member("m2", "a@example.com", { workspaceId: OTHER }));
      const updated = await members.findById({ workspaceId: WS, id: "m1" });
      assert.equal(updated?.name, "Renamed");
      assert.equal(updated?.version, 2);
      assert.equal(updated?.fields, undefined);
      assert.equal((await members.list({ workspaceId: WS })).length, 1);
    });

    test("the unique index rejects a second member with the same email in a workspace", async () => {
      const { members } = makeRepos();
      await members.save(member("m1", "a@example.com"));
      await assert.rejects(members.save(member("m2", "a@example.com")));
      assert.equal(await members.findById({ workspaceId: WS, id: "m2" }), null);
    });

    test("list orders by id, pages after a cursor and ignores an unknown or foreign cursor", async () => {
      const { members } = makeRepos();
      for (const id of ["m3", "m1", "m2", "m4"]) await members.save(member(id, `${id}@example.com`));
      await members.save(member("m0", "m0@example.com", { workspaceId: OTHER }));
      const ids = async (o: { afterId?: string; limit?: number } = {}) =>
        (await members.list({ workspaceId: WS, ...o })).map((m) => m.id);
      assert.deepEqual(await ids(), ["m1", "m2", "m3", "m4"]);
      assert.deepEqual(await ids({ limit: 2 }), ["m1", "m2"]);
      assert.deepEqual(await ids({ afterId: "m2", limit: 5 }), ["m3", "m4"]);
      assert.deepEqual(await ids({ afterId: "unknown" }), ["m1", "m2", "m3", "m4"]);
      // A cursor id from another workspace resolves to nothing (first page).
      assert.deepEqual(await ids({ afterId: "m0" }), ["m1", "m2", "m3", "m4"]);
    });

    test("list caps a page at 100 members", async () => {
      const { members } = makeRepos();
      for (let i = 0; i < 101; i++) {
        const id = `p${String(i).padStart(3, "0")}`;
        await members.save(member(id, `${id}@example.com`));
      }
      assert.equal((await members.list({ workspaceId: WS, limit: 500 })).length, 100);
      assert.equal((await members.list({ workspaceId: WS })).length, 100);
    });

    test("saves inside a rolled-back transaction leave nothing behind", async () => {
      const { kernel, members } = makeRepos();
      await assert.rejects(
        kernel.transaction(async () => {
          await members.save(member("m1", "a@example.com"));
          throw new Error("boom");
        }),
        /boom/
      );
      assert.equal(await members.findById({ workspaceId: WS, id: "m1" }), null);
    });
  });

  describe("MemberTierRepo", () => {
    test("save then findById / findBySlug / list round-trip, booleans and prices included", async () => {
      const { tiers } = makeRepos();
      await tiers.save(tier("t1", "gold"));
      await tiers.save(tier("t2", "free", { type: "free", visibleInPortal: false, monthlyPriceCents: undefined, yearlyPriceCents: undefined, currency: undefined, description: undefined, welcomePagePath: undefined }));
      await tiers.save(tier("tx", "gold", { workspaceId: OTHER }));
      assert.deepEqual(await tiers.findById({ workspaceId: WS, id: "t1" }), tier("t1", "gold"));
      const free = await tiers.findBySlug({ workspaceId: WS, slug: "free" });
      assert.equal(free?.visibleInPortal, false);
      assert.equal(free?.monthlyPriceCents, undefined);
      assert.deepEqual((await tiers.list({ workspaceId: WS })).map((t) => t.id).sort(), ["t1", "t2"]);
    });

    test("reads miss unknown ids/slugs and never cross workspaces", async () => {
      const { tiers } = makeRepos();
      await tiers.save(tier("t1", "gold"));
      assert.equal(await tiers.findById({ workspaceId: WS, id: "nope" }), null);
      assert.equal(await tiers.findById({ workspaceId: OTHER, id: "t1" }), null);
      assert.equal(await tiers.findBySlug({ workspaceId: WS, slug: "nope" }), null);
      assert.equal(await tiers.findBySlug({ workspaceId: OTHER, slug: "gold" }), null);
      assert.deepEqual(await tiers.list({ workspaceId: OTHER }), []);
    });

    test("save upserts by id and can flip visibleInPortal", async () => {
      const { tiers } = makeRepos();
      await tiers.save(tier("t1", "gold"));
      await tiers.save(tier("t1", "gold", { name: "Renamed", visibleInPortal: false, version: 2 }));
      assert.deepEqual(
        await tiers.findById({ workspaceId: WS, id: "t1" }),
        tier("t1", "gold", { name: "Renamed", visibleInPortal: false, version: 2 })
      );
      assert.equal((await tiers.list({ workspaceId: WS })).length, 1);
    });

    test("the unique index rejects a duplicate slug in a workspace; another workspace may reuse it", async () => {
      const { tiers } = makeRepos();
      await tiers.save(tier("t1", "gold"));
      await tiers.save(tier("t3", "gold", { workspaceId: OTHER }));
      await assert.rejects(tiers.save(tier("t2", "gold")));
      assert.equal(await tiers.findById({ workspaceId: WS, id: "t2" }), null);
    });

    test("saves inside a rolled-back transaction leave nothing behind", async () => {
      const { kernel, tiers } = makeRepos();
      await assert.rejects(
        kernel.transaction(async () => {
          await tiers.save(tier("t1", "gold"));
          throw new Error("boom");
        }),
        /boom/
      );
      assert.equal(await tiers.findById({ workspaceId: WS, id: "t1" }), null);
    });
  });

  describe("MemberSubscriptionRepo", () => {
    test("save then findById round-trips; misses and other workspaces return null", async () => {
      const { subs } = makeRepos();
      await subs.save(subscription("s1", { canceledAt: "2026-10-01T00:00:00.000Z", status: "canceled" }));
      assert.deepEqual(
        await subs.findById({ workspaceId: WS, id: "s1" }),
        subscription("s1", { canceledAt: "2026-10-01T00:00:00.000Z", status: "canceled" })
      );
      assert.equal(await subs.findById({ workspaceId: WS, id: "nope" }), null);
      assert.equal(await subs.findById({ workspaceId: OTHER, id: "s1" }), null);
    });

    test("optional columns round-trip as undefined", async () => {
      const { subs } = makeRepos();
      const bare = subscription("s1", { externalRef: undefined, currentPeriodEnd: undefined });
      await subs.save(bare);
      assert.deepEqual(await subs.findById({ workspaceId: WS, id: "s1" }), bare);
    });

    test("save upserts by id", async () => {
      const { subs } = makeRepos();
      await subs.save(subscription("s1"));
      await subs.save(subscription("s1", { status: "canceled", version: 2 }));
      const row = await subs.findById({ workspaceId: WS, id: "s1" });
      assert.equal(row?.status, "canceled");
      assert.equal(row?.version, 2);
      assert.equal((await subs.listByMember({ workspaceId: WS, memberId: "m1" })).length, 1);
    });

    test("listByMember is newest-started first and scoped to member and workspace", async () => {
      const { subs } = makeRepos();
      await subs.save(subscription("old", { startedAt: "2026-01-01T00:00:00.000Z" }));
      await subs.save(subscription("new", { startedAt: "2026-06-01T00:00:00.000Z" }));
      await subs.save(subscription("mid", { startedAt: "2026-03-01T00:00:00.000Z" }));
      await subs.save(subscription("other-member", { memberId: "m2" }));
      await subs.save(subscription("other-ws", { workspaceId: OTHER }));
      assert.deepEqual((await subs.listByMember({ workspaceId: WS, memberId: "m1" })).map((s) => s.id), ["new", "mid", "old"]);
      assert.deepEqual(await subs.listByMember({ workspaceId: WS, memberId: "nobody" }), []);
    });

    test("listActiveByMember keeps active/comped rows whose period has not ended", async () => {
      const { subs } = makeRepos();
      const now = "2026-09-28T00:00:00.000Z";
      await subs.save(subscription("active-future", { currentPeriodEnd: "2026-12-01T00:00:00.000Z" }));
      await subs.save(subscription("comped-open", { status: "comped", currentPeriodEnd: undefined }));
      await subs.save(subscription("active-past", { currentPeriodEnd: "2026-01-01T00:00:00.000Z" }));
      await subs.save(subscription("ends-now", { currentPeriodEnd: now }));
      await subs.save(subscription("canceled", { status: "canceled" }));
      await subs.save(subscription("other-member", { memberId: "m2" }));
      await subs.save(subscription("other-ws", { workspaceId: OTHER }));
      const active = await subs.listActiveByMember({ workspaceId: WS, memberId: "m1", nowIso: now });
      assert.deepEqual(active.map((s) => s.id).sort(), ["active-future", "comped-open"]);
    });

    test("saves inside a rolled-back transaction leave nothing behind", async () => {
      const { kernel, subs } = makeRepos();
      await assert.rejects(
        kernel.transaction(async () => {
          await subs.save(subscription("s1"));
          throw new Error("boom");
        }),
        /boom/
      );
      assert.equal(await subs.findById({ workspaceId: WS, id: "s1" }), null);
    });
  });
});
