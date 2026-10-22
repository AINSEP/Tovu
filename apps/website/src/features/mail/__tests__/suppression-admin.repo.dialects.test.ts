import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { createMailSuppressionRepo } from "../suppression.repo.js";
import { createMailSuppressionAdminRepo } from "../suppression-admin.repo.js";

/**
 * @file The suppression admin repo (migration 0030) on SQLite and PGlite: list/search/filter/page,
 * removal with its audit row in one transaction (send-time checks then pass), workspace isolation,
 * and the newest verified feedback event per provider.
 */

const T = (s: number) => new Date(Date.parse("2026-10-22T12:00:00.000Z") + s * 1000).toISOString();

describeEachDialect("mail suppression admin repo", {
  tables: ["mail_suppression", "mail_suppression_removals", "mail_feedback_inbox", "workspaces"],
  make: (kernel) => {
    const db = kernel as StorageKernel<unknown>;
    let ids = 0;
    return {
      db,
      admin: createMailSuppressionAdminRepo({ db }, { nowIso: () => T(100), newId: () => `r${++ids}` }),
      sendSide: createMailSuppressionRepo({ db }),
      seeded: db.execute(sql`INSERT INTO workspaces (id, name, slug, created_at) VALUES ('wa', 'A', 'wa', ${T(0)}), ('wb', 'B', 'wb', ${T(0)})`),
    };
  },
}, (make) => {
  const ready = async () => {
    const ctx = make();
    await ctx.seeded;
    const add = async (ws: string, address: string, scope: string, reason: string, at: number) =>
      ctx.db.execute(sql`INSERT INTO mail_suppression (workspace_id, normalized_address, scope, reason, created_at) VALUES (${ws}, ${address}, ${scope}, ${reason}, ${T(at)})`);
    await add("wa", "ann@example.com", "all", "bounced", 1);
    await add("wa", "bob@example.com", "bulk", "complained", 2);
    await add("wa", "bob@example.com", "all", "manual", 2);
    await add("wa", "x_y%z@other.test", "all", "manual", 3);
    await add("wb", "ann@example.com", "all", "bounced", 4);
    return ctx;
  };

  test("lists newest first, searches literally, filters by scope and reason, pages with skip", async () => {
    const { admin } = await ready();
    assert.deepEqual((await admin.list({ workspaceId: "wa", limit: 9 })).map((e) => `${e.address}/${e.scope}`), ["x_y%z@other.test/all", "bob@example.com/bulk", "bob@example.com/all", "ann@example.com/all"]);
    assert.deepEqual((await admin.list({ workspaceId: "wa", limit: 9 }, { search: " EXAMPLE.com" })).length, 3);
    assert.deepEqual((await admin.list({ workspaceId: "wa", limit: 9 }, { search: "_y%" })).map((e) => e.address), ["x_y%z@other.test"]);
    assert.deepEqual((await admin.list({ workspaceId: "wa", limit: 9 }, { search: "n_" })).length, 0, "an underscore is literal, not a wildcard");
    assert.deepEqual((await admin.list({ workspaceId: "wa", limit: 9 }, { scope: "bulk" })).map((e) => e.reason), ["complained"]);
    assert.deepEqual((await admin.list({ workspaceId: "wa", limit: 9 }, { reason: "manual" })).map((e) => e.scope), ["all", "all"]);
    assert.deepEqual((await admin.list({ workspaceId: "wa", limit: 2 }, { before: { createdAt: T(2), skip: 1 } })).map((e) => `${e.address}/${e.scope}`), ["bob@example.com/all", "ann@example.com/all"]);
    assert.deepEqual(await admin.list({ workspaceId: "wa", limit: 1 }), [{ address: "x_y%z@other.test", scope: "all", reason: "manual", createdAt: T(3) }]);
  });

  test("remove deletes one scope, records the audit row, and the send-time check then passes", async () => {
    const { admin, sendSide, db } = await ready();
    assert.equal(await sendSide.isSuppressed({ workspaceId: "wa", normalizedAddress: "bob@example.com", lane: "bulk" }), true);
    const removal = await admin.remove({ workspaceId: "wa", address: " Bob@Example.com ", scope: "bulk", removalReason: "complained by mistake", removedBy: "owner" });
    assert.deepEqual(removal, { id: "r1", address: "bob@example.com", scope: "bulk", suppressionReason: "complained", suppressedAt: T(2), removalReason: "complained by mistake", removedBy: "owner", removedAt: T(100) });
    assert.equal(await admin.find({ workspaceId: "wa", address: "bob@example.com", scope: "bulk" }), null);
    // The `all` row is a separate suppression: it still blocks bulk mail.
    assert.equal(await sendSide.isSuppressed({ workspaceId: "wa", normalizedAddress: "bob@example.com", lane: "bulk" }), true);
    await admin.remove({ workspaceId: "wa", address: "bob@example.com", scope: "all", removalReason: "fixed", removedBy: "owner" });
    assert.equal(await sendSide.isSuppressed({ workspaceId: "wa", normalizedAddress: "bob@example.com", lane: "bulk" }), false);
    assert.equal(await admin.remove({ workspaceId: "wa", address: "bob@example.com", scope: "all", removalReason: "again", removedBy: "owner" }), null);
    assert.deepEqual(await db.query(sql`SELECT id, normalized_address, scope, suppression_reason, removal_reason, removed_by FROM mail_suppression_removals ORDER BY id`), [
      { id: "r1", normalized_address: "bob@example.com", scope: "bulk", suppression_reason: "complained", removal_reason: "complained by mistake", removed_by: "owner" },
      { id: "r2", normalized_address: "bob@example.com", scope: "all", suppression_reason: "manual", removal_reason: "fixed", removed_by: "owner" },
    ]);
    assert.notEqual(await admin.find({ workspaceId: "wb", address: "ann@example.com", scope: "all" }), null, "another workspace's row is untouched");
  });

  test("lastFeedbackEvent is the newest event for that provider and workspace, or null", async () => {
    const { admin, db } = await ready();
    assert.equal(await admin.lastFeedbackEvent({ workspaceId: "wa", providerId: "smtp" }), null);
    for (const [id, kind, at, ws, provider] of [["e1", "delivered", 5, "wa", "smtp"], ["e2", "bounced", 9, "wa", "smtp"], ["e3", "complained", 20, "wb", "smtp"], ["e4", "complained", 30, "wa", "other"]] as const) {
      await db.execute(sql`INSERT INTO mail_feedback_inbox (provider_id, event_id, workspace_id, recipient, kind, hard_bounce, provider_message_id, occurred_at, received_at)
        VALUES (${provider}, ${id}, ${ws}, 'a@x.test', ${kind}, 0, 'm', ${T(at)}, ${T(at)})`);
    }
    assert.deepEqual(await admin.lastFeedbackEvent({ workspaceId: "wa", providerId: "smtp" }), { kind: "bounced", receivedAt: T(9) });
  });
});

test("the default clock and id generator stamp a removal", async () => {
  const { eachDialect } = await import("#src/platform/db/kernel/__tests__/dialect-matrix");
  const [sqlite] = eachDialect({ tables: ["mail_suppression", "mail_suppression_removals", "workspaces"], make: (kernel) => kernel as StorageKernel<unknown> });
  const db = sqlite!.make();
  try {
    await db.execute(sql`INSERT INTO workspaces (id, name, slug, created_at) VALUES ('wa', 'A', 'wa', ${T(0)})`);
    await db.execute(sql`INSERT INTO mail_suppression (workspace_id, normalized_address, scope, reason, created_at) VALUES ('wa', 'a@x.test', 'all', 'manual', ${T(1)})`);
    const removal = await createMailSuppressionAdminRepo({ db }).remove({ workspaceId: "wa", address: "a@x.test", scope: "all", removalReason: "r", removedBy: "o" });
    assert.match(removal!.id, /^[0-9a-f-]{36}$/);
    assert.ok(!Number.isNaN(Date.parse(removal!.removedAt)));
  } finally {
    await db.close();
  }
});
