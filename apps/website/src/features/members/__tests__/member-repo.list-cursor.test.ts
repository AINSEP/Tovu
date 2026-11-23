import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { SqlMemberRepo } from "../repo.js";
import { InMemoryMemberRepo } from "@jini-ai/user-management/members/repo.memory";
import type { MemberRepoPort } from "@jini-ai/user-management/members/ports";
import type { MemberRecord } from "@jini-ai/user-management/members/types";

/**
 * @file Cut-off-list regression (refactor pattern list-cursor, example T1 + T2): a workspace with
 * one member more than the page size used to return the first page as a bare array, with nothing
 * saying more exist, so the 101st member was unreachable from the admin list and `members_list`.
 * Every page now says whether another follows (`nextCursor`), and following it reaches every member
 * exactly once. Runs the SQL repo on every dialect and the in-memory twin through the same body.
 */

const WS = "ws-list-cursor";
const OTHER = "ws-list-cursor-other";
const T0 = "2026-11-13T00:00:00.000Z";

function member(id: string, overrides: Partial<MemberRecord> = {}): MemberRecord {
  return {
    id, workspaceId: WS, email: `${id}@example.com`, name: `Name ${id}`, emailVerifiedAt: T0, status: "active",
    note: "", fields: {}, createdAt: T0, updatedAt: T0, version: 1, ...overrides,
  };
}

function listCursorCases(make: () => MemberRepoPort): void {
  test("one member past the page size is reachable through nextCursor, and every member appears once", async () => {
    const members = make();
    for (const id of ["m3", "m1", "m2"]) await members.save(member(id));
    await members.save(member("m0", { workspaceId: OTHER }));

    const first = await members.list({ workspaceId: WS }, { limit: 2 });
    assert.deepEqual(first.items.map((m) => m.id), ["m1", "m2"]);
    assert.equal(typeof first.nextCursor, "string", "a full page must say that more members exist");

    const second = await members.list({ workspaceId: WS }, { limit: 2, cursor: first.nextCursor });
    assert.deepEqual(second.items.map((m) => m.id), ["m3"]);
    assert.equal(second.nextCursor, null, "the last page must say it is the last");
  });

  test("an exactly full last page still ends with nextCursor null after one more call", async () => {
    const members = make();
    for (const id of ["m1", "m2"]) await members.save(member(id));
    const only = await members.list({ workspaceId: WS }, { limit: 2 });
    assert.deepEqual(only.items.map((m) => m.id), ["m1", "m2"]);
    assert.equal(only.nextCursor, null);
  });

  test("a cursor that is not one of ours is refused, never read as page one", async () => {
    const members = make();
    await members.save(member("m1"));
    await assert.rejects(members.list({ workspaceId: WS }, { cursor: "not-a-cursor" }), /invalid cursor/i);
  });

  test("page size stays capped at 100", async () => {
    const members = make();
    for (let i = 0; i < 101; i++) await members.save(member(`p${String(i).padStart(3, "0")}`));
    const page = await members.list({ workspaceId: WS }, { limit: 500 });
    assert.equal(page.items.length, 100);
    assert.notEqual(page.nextCursor, null);
  });
}

describeEachDialect("member list cursor", { tables: ["members"], make: (kernel: ContentKernel) => new SqlMemberRepo(kernel) }, (make) => {
  listCursorCases(make);
});

describe("member list cursor (memory)", () => {
  listCursorCases(() => new InMemoryMemberRepo());
});
