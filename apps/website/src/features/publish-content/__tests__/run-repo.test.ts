import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqlitePublishContentRunRepo } from "#src/platform/db/sqlite/publish-content-run-repo.sqlite";
import { getPublishContentRunStatus, InMemoryPublishContentRunRepo, type PublishContentRunRecord } from "../run-repo.js";

/**
 * @file Closes the mutation-sweep gap on `run-repo.ts:123`'s
 * `if (record?.workspaceId !== input.workspaceId) return null;` — the cross-workspace isolation
 * check on `InMemoryPublishContentRunRepo.findById`
 * (`ADS-memory/reports/2026-09-20-mutation-sweep-changed-files.md` §6b): a tenancy boundary with
 * no test proving it holds. Without it, a run record saved under one workspace would be readable
 * by any caller who guesses its id and claims a different `workspaceId` — the same shape of leak
 * `publish-content-peer-repo.sqlite.ts`'s own (separately, pre-existing red) suite exists to catch
 * for baselines.
 */

function record(overrides: Partial<PublishContentRunRecord> = {}): PublishContentRunRecord {
  return {
    id: "run-1",
    workspaceId: "workspace-a",
    direction: "export",
    peerPrincipalId: "pub:install-a",
    peerLabel: null,
    phase: "applied",
    restorePointId: null,
    changeSetIdsJson: null,
    actorId: "actor-1",
    startedAt: "2026-09-20T00:00:00.000Z",
    finishedAt: null,
    reportJson: null,
    itemsJson: null,
    ...overrides,
  };
}

test("InMemoryPublishContentRunRepo.findById: a run saved under one workspace is invisible to a lookup claiming a different workspace", async () => {
  const repo = new InMemoryPublishContentRunRepo();
  await repo.save(record({ id: "run-1", workspaceId: "workspace-a" }));

  const crossTenant = await repo.findById({ workspaceId: "workspace-b", id: "run-1" });
  assert.equal(crossTenant, null, "a run saved under workspace-a must not be readable by id alone from workspace-b");
});

test("InMemoryPublishContentRunRepo.findById: the same workspace CAN read its own run by id", async () => {
  const repo = new InMemoryPublishContentRunRepo();
  await repo.save(record({ id: "run-1", workspaceId: "workspace-a" }));

  const sameTenant = await repo.findById({ workspaceId: "workspace-a", id: "run-1" });
  assert.equal(sameTenant?.id, "run-1");
  assert.equal(sameTenant?.workspaceId, "workspace-a");
});

test("InMemoryPublishContentRunRepo.findById: an unknown id returns null regardless of workspace", async () => {
  const repo = new InMemoryPublishContentRunRepo();
  const result = await repo.findById({ workspaceId: "workspace-a", id: "no-such-run" });
  assert.equal(result, null);
});

for (const adapter of ["memory", "sqlite"] as const) {
  test(`${adapter}: status decodes the full saved report, progress and retired change sets within its workspace`, async t => {
    const db = adapter === "sqlite" ? openContentDb(":memory:") : null;
    if (db) t.after(() => db.$client.close());
    const repo = db ? new SqlitePublishContentRunRepo(db) : new InMemoryPublishContentRunRepo();
    const report = { refused: false, refusalReason: null, applyOrder: ["post"], rows: [
      { entityType: "post", entityId: "post-1", entityLabel: "Title", outcome: "forced", writes: true,
        reason: "operator overwrite", canOverwrite: true, retires: { entityType: "post", entityId: "holder-1", entityLabel: "Old title", hash: "holder-hash" } },
    ] };
    const items = [
      { entityType: "post", entityId: "post-1", idempotencyKey: "exact-version", phase: "content_applied", outcome: "forced",
        writes: true, reason: "operator overwrite", changeSetId: "cs-write", retiredChangeSetId: "cs-retire",
        errorSummary: "baseline failed", updatedAt: "2026-09-20T00:00:01.000Z" },
      { entityType: "post", entityId: "post-2", idempotencyKey: "next-version", phase: "pending", outcome: "created",
        writes: true, reason: null, changeSetId: null, retiredChangeSetId: null, errorSummary: null,
        updatedAt: "2026-09-20T00:00:00.000Z" },
    ];
    await repo.save(record({ direction: "import" }));
    const saved = record({ phase: "failed", direction: "import", restorePointId: "rp-1", finishedAt: "2026-09-20T00:00:02.000Z",
      changeSetIdsJson: '["cs-write"]', reportJson: JSON.stringify(report), itemsJson: JSON.stringify(items) });
    await repo.save(saved);
    assert.deepEqual(await repo.findById({ workspaceId: "workspace-a", id: "run-1" }), saved);
    assert.deepEqual(await getPublishContentRunStatus(repo, { workspaceId: "workspace-a", runId: "run-1" }), {
      id: "run-1", workspaceId: "workspace-a", direction: "import", phase: "failed", restorePointId: "rp-1", actorId: "actor-1",
      startedAt: "2026-09-20T00:00:00.000Z", finishedAt: "2026-09-20T00:00:02.000Z",
      changeSetIds: ["cs-write"], retiredChangeSetIds: ["cs-retire"], report, items,
    });
    assert.equal(await getPublishContentRunStatus(repo, { workspaceId: "workspace-b", runId: "run-1" }), null);
    assert.equal(await getPublishContentRunStatus(repo, { workspaceId: "workspace-a", runId: "missing" }), null);
    assert.equal(await repo.findById({ workspaceId: "workspace-b", id: "run-1" }), null);
    assert.equal(await repo.findById({ workspaceId: "workspace-a", id: "missing" }), null);
  });
}
