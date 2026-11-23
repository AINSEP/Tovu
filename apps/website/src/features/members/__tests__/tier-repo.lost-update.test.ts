import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { RecordVersionConflictError } from "@jini-ai/core/optimistic-concurrency";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { SqlMemberTierRepo } from "../repo.js";
import { InMemoryMemberTierRepo } from "@jini-ai/user-management/members/repo.memory";
import type { MemberTierRepoPort } from "@jini-ai/user-management/members/ports";
import type { MemberTierRecord } from "@jini-ai/user-management/members/types";

/**
 * @file Lost-update regression (refactor pattern lost-update, example L-REPO-CAS): two editors open
 * the same tier at version 1; the first save lands as version 2; the second, still based on
 * version 1, must be refused with the live version instead of silently overwriting the first.
 * Runs the SQL repo on every dialect and the in-memory twin through the same body.
 */

const WS = "ws-tiers";
const T0 = "2026-11-13T00:00:00.000Z";

function tier(overrides: Partial<MemberTierRecord> = {}): MemberTierRecord {
  return {
    id: "t1", workspaceId: WS, name: "Gold", slug: "gold", type: "paid", status: "active",
    visibleInPortal: true, createdAt: T0, updatedAt: T0, version: 1, ...overrides,
  };
}

function lostUpdateCases(make: () => MemberTierRepoPort): void {
  test("a save based on a superseded version is refused and the first editor's change survives", async () => {
    const tiers = make();
    await tiers.save(tier());
    await tiers.save(tier({ name: "Gold (theirs)", version: 2 }), { expectedVersion: 1 });
    await assert.rejects(tiers.save(tier({ name: "Gold (mine)", version: 2 }), { expectedVersion: 1 }), (error: unknown) => {
      assert.ok(error instanceof RecordVersionConflictError);
      assert.equal(error.expectedVersion, 1);
      assert.equal(error.currentVersion, 2);
      return true;
    });
    assert.equal((await tiers.findById({ workspaceId: WS, id: "t1" }))?.name, "Gold (theirs)");
  });

  test("a save of a deleted or missing tier with a basis is refused, not re-created", async () => {
    const tiers = make();
    await assert.rejects(tiers.save(tier({ version: 2 }), { expectedVersion: 1 }), (error: unknown) =>
      error instanceof RecordVersionConflictError && error.currentVersion === null);
    assert.equal(await tiers.findById({ workspaceId: WS, id: "t1" }), null);
  });

  test("no basis keeps the create/import path working", async () => {
    const tiers = make();
    await tiers.save(tier());
    await tiers.save(tier({ name: "Renamed", version: 2 }));
    assert.equal((await tiers.findById({ workspaceId: WS, id: "t1" }))?.name, "Renamed");
  });
}

describeEachDialect("member tier lost update", { tables: ["member_tiers"], make: (kernel: ContentKernel) => new SqlMemberTierRepo(kernel) }, (make) => {
  lostUpdateCases(make);
});

describe("member tier lost update — memory", () => {
  lostUpdateCases(() => new InMemoryMemberTierRepo());
});
