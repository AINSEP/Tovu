import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openContentDb } from "#src/db/sqlite/content-db";
import { SqliteChangeSetRepo } from "#src/db/sqlite/change-set-repo.sqlite";

/**
 * @file ADR-046 Phase 1's own required production gate for the Change Sets row: "Restart and
 * revert integration tests." Mirrors `identity/__tests__/wiring.test.ts`'s restart-survival
 * pattern — a brand-new `openContentDb()` handle against the SAME on-disk file is exactly what a
 * real process restart does.
 */

test("SqliteChangeSetRepo: an applied change set (header + items) survives a simulated process restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-change-sets-restart-test-"));
  const dbPath = join(dir, "content.db");
  try {
    const workspaceId = "workspace-restart-test";

    // "First boot": apply a mutation and record its change set.
    const db1 = openContentDb(dbPath);
    const repo1 = new SqliteChangeSetRepo(db1);
    await repo1.insert(
      {
        id: "cs-restart-1",
        workspaceId,
        actorId: "user-1",
        status: "applied",
        summary: "Renamed a post",
        idempotencyKey: "idem-restart-1",
        createdAt: "2026-07-16T00:00:00.000Z",
        appliedAt: "2026-07-16T00:00:00.000Z",
      },
      [
        {
          id: "cs-restart-1-item-1",
          changeSetId: "cs-restart-1",
          entityType: "post",
          entityId: "post-restart-1",
          operation: "update",
          inversePayload: { title: "Old title" },
          entityVersionAtApply: 2,
          position: 0,
        },
      ]
    );

    // "Restart": a brand-new content.db handle + a brand-new SqliteChangeSetRepo against the
    // SAME on-disk file — the in-memory adapter this replaces would have lost everything here.
    const db2 = openContentDb(dbPath);
    const repo2 = new SqliteChangeSetRepo(db2);

    const found = await repo2.findById({ workspaceId, id: "cs-restart-1" });
    assert.ok(found, "the change set must survive a restart");
    assert.equal(found?.changeSet.summary, "Renamed a post");
    assert.equal(found?.items.length, 1);
    assert.deepEqual(found?.items[0].inversePayload, { title: "Old title" }, "the inverse payload (revert's only input for a non-revisioned entity) must survive");

    const byIdempotencyKey = await repo2.findByIdempotencyKey({ workspaceId, idempotencyKey: "idem-restart-1" });
    assert.equal(byIdempotencyKey?.id, "cs-restart-1", "idempotency-key lookup must also survive a restart");

    // Revert, then confirm the status transition itself survives a SECOND restart.
    await repo2.save({ ...found!.changeSet, status: "reverted", revertedAt: "2026-07-16T01:00:00.000Z" });

    const db3 = openContentDb(dbPath);
    const repo3 = new SqliteChangeSetRepo(db3);
    const afterRevert = await repo3.findById({ workspaceId, id: "cs-restart-1" });
    assert.equal(afterRevert?.changeSet.status, "reverted");
    assert.equal(afterRevert?.changeSet.revertedAt, "2026-07-16T01:00:00.000Z");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
