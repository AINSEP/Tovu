import assert from "node:assert/strict";
import { test } from "node:test";
import { RecordVersionConflictError } from "@jini-ai/core/optimistic-concurrency";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { toAdminWorkspaceResponse } from "#src/server/inbound/admin-http/http/workspace";
import { SqlWorkspaceRepo } from "../repo.js";

const initial = { id: "ws", name: "Original", slug: "original", createdAt: "t0", version: 1 };

describeEachDialect("workspace lost update", { tables: ["workspaces"], make: (kernel) => new SqlWorkspaceRepo(kernel) }, (make) => {
  test("a stale update is refused without overwriting the first change", async () => {
    const repo = make();
    await repo.insert(initial);
    await repo.update({ ...initial, name: "First", version: 2 }, { expectedVersion: 1 });
    await assert.rejects(repo.update({ ...initial, name: "Second", version: 2 }, { expectedVersion: 1 }),
      (error: unknown) => error instanceof RecordVersionConflictError && error.currentVersion === 2);
    const saved = await repo.findById({ id: initial.id });
    assert.ok(saved);
    assert.equal(saved.name, "First");
    assert.equal(saved.version, 2);
    assert.equal(toAdminWorkspaceResponse(saved).version, 2);
  });

  test("a conditional update of a missing workspace is refused", async () => {
    const repo = make();
    await assert.rejects(repo.update({ ...initial, version: 2 }, { expectedVersion: 1 }),
      (error: unknown) => error instanceof RecordVersionConflictError && error.currentVersion === null);
  });
});
