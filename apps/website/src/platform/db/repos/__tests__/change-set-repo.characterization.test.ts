import assert from "node:assert/strict";
import { test } from "node:test";

import type { ChangeSetItemRecord, ChangeSetRecord, DomainEvent } from "@jini-ai/core/contracts/events";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "../../content-kernel.js";
import { SqlChangeSetRepo } from "../change-set-repo.js";

/**
 * @file S6a T0: the change-set repo on the unmoved code, before it moves to Jini `@jini-ai/db/events`. The column mapping
 * and the all-or-nothing insert are pinned by `change-set-repo.test.ts`; what only this file adds is that every read and
 * the status write stay inside one workspace, and that the co-persisted outbox row is the one `outboxEventValues` builds.
 * Each test names the one-line mutation of `change-set-repo.ts` that turns it red.
 */

const AT = "2026-11-18T00:00:00.000Z";
const header = (over: Partial<ChangeSetRecord>): ChangeSetRecord => ({
  id: "cs-a", workspaceId: "ws-a", actorId: "user-1", status: "proposed", summary: "s", idempotencyKey: "idem-1", createdAt: AT, ...over,
});
const item = (over: Partial<ChangeSetItemRecord>): ChangeSetItemRecord => ({
  id: "csi-a", changeSetId: "cs-a", entityType: "post", entityId: "post-1", operation: "create", position: 0, ...over,
});

describeEachDialect(
  "SqlChangeSetRepo workspace scoping",
  { tables: ["change_set_items", "change_sets", "outbox_events"], make: (kernel: ContentKernel) => ({ kernel, repo: new SqlChangeSetRepo(kernel) }) },
  (make) => {
    async function twoWorkspaces() {
      const { kernel, repo } = make();
      await repo.insert({ record: header({}), items: [item({})] });
      await repo.insert({ record: header({ id: "cs-b", workspaceId: "ws-b", createdAt: "2026-11-18T00:00:01.000Z" }), items: [item({ id: "csi-b", changeSetId: "cs-b" })] });
      return { kernel, repo };
    }

    test("findById, findByIdempotencyKey and listByWorkspace answer only for their workspace (mutation: drop a `workspace_id` predicate)", async () => {
      const { repo } = await twoWorkspaces();
      assert.equal((await repo.findById({ workspaceId: "ws-a", id: "cs-a" }))?.changeSet.id, "cs-a");
      assert.equal(await repo.findById({ workspaceId: "ws-b", id: "cs-a" }), null);
      assert.equal((await repo.findByIdempotencyKey({ workspaceId: "ws-b", idempotencyKey: "idem-1" }))?.id, "cs-b");
      assert.equal(await repo.findByIdempotencyKey({ workspaceId: "ws-c", idempotencyKey: "idem-1" }), null);
      assert.deepEqual((await repo.listByWorkspace({ workspaceId: "ws-a" })).map((record) => record.id), ["cs-a"]);
      assert.deepEqual((await repo.listByWorkspace({ workspaceId: "ws-b" })).map((record) => record.id), ["cs-b"]);
    });

    test("save writes status and the two timestamps of its own workspace's row only (mutation: drop the `workspace_id` predicate of save)", async () => {
      const { repo } = await twoWorkspaces();
      await repo.save(header({ id: "cs-a", workspaceId: "ws-b", status: "reverted", summary: "ignored", revertedAt: AT }));
      assert.equal((await repo.findById({ workspaceId: "ws-a", id: "cs-a" }))?.changeSet.status, "proposed", "another workspace's save cannot reach this row");
      await repo.save(header({ status: "applied", summary: "ignored", appliedAt: AT }));
      const stored = (await repo.findById({ workspaceId: "ws-a", id: "cs-a" }))?.changeSet;
      assert.deepEqual({ status: stored?.status, appliedAt: stored?.appliedAt, summary: stored?.summary }, { status: "applied", appliedAt: AT, summary: "s" });
    });

    test("the co-persisted outbox row is the frozen outbox row, in the insert's transaction (mutation: write another shape)", async () => {
      const { kernel, repo } = make();
      const event: DomainEvent = { id: "cs-a-change-set.applied", name: "change-set.applied", occurredAt: AT, workspaceId: "ws-a", payload: { changeSetId: "cs-a" } };
      await repo.insert({ record: header({}), items: [] }, { event });
      const rows = await kernel.run((db) => db.selectFrom("outbox_events").select(["id", "workspace_id", "status", "attempts", "next_attempt_at", "created_at"]).execute());
      assert.deepEqual(rows, [{ id: event.id, workspace_id: "ws-a", status: "pending", attempts: 0, next_attempt_at: AT, created_at: AT }]);
    });
  },
);

