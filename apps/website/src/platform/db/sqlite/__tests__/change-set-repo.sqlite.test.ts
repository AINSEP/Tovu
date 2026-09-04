import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb } from "../content-db.js";
import { SqliteChangeSetRepo } from "../change-set-repo.sqlite.js";
import type { ChangeSetItemRecord, ChangeSetRecord } from "@jini-ai/cms/core";

/**
 * @file Direct unit coverage of `change-set-repo.sqlite.ts` — no dedicated unit test file existed
 * for this adapter before now; only `repo.contract.test.ts` (the shared `ChangeSetRepoPort`
 * contract suite, run against both `repo.memory.ts` and this adapter) and a handful of integration
 * suites (`change-sets-restart.integration.test.ts`, `idempotency-race.integration.test.ts`,
 * `outbox-restart.integration.test.ts`) touched it at all.
 *
 * `toRecord`/`toItemRecord`'s `?? undefined` mappings and `insert()`/`save()`'s mirrored
 * `?? null` writes are each a genuine two-way branch per optional field
 * (`ChangeSetRecord.actorId`/`idempotencyKey`/`intentRef`/`appliedAt`/`revertedAt`,
 * `ChangeSetItemRecord.beforeRevisionId`/`afterRevisionId`/`inversePayload`/`entityVersionAtApply`
 * — see `@jini-ai/cms/core`'s `change-set.ts`). Every existing suite that inserts a change set
 * always supplies the SAME shape (`actorId`/`appliedAt`/`entityVersionAtApply` present,
 * `intentRef`/`beforeRevisionId`/`afterRevisionId` absent) — so across the whole repo, exactly one
 * side of several of these branches had ever been reached. This file exercises the other side of
 * each, plus `save()`'s `appliedAt`/`revertedAt` null branches, which no caller in this codebase
 * reaches today (`revert.ts` is the only production caller of `save()`, and it always supplies both
 * fields) but which the `ChangeSetRepoPort` contract itself allows any other caller to hit — kept
 * and tested directly per this repo's unreachable-branch policy, not deleted.
 */

const WORKSPACE = "workspace-1";

function record(overrides: Partial<ChangeSetRecord> = {}): ChangeSetRecord {
  return {
    id: "cs-1",
    workspaceId: WORKSPACE,
    actorId: "user-1",
    status: "applied",
    summary: "test change set",
    createdAt: "2026-09-04T00:00:00.000Z",
    appliedAt: "2026-09-04T00:00:00.000Z",
    ...overrides,
  };
}

function item(overrides: Partial<ChangeSetItemRecord> = {}): ChangeSetItemRecord {
  return {
    id: "csi-1",
    changeSetId: "cs-1",
    entityType: "post",
    entityId: "post-1",
    operation: "update",
    inversePayload: { title: "old title" },
    entityVersionAtApply: 2,
    position: 0,
    ...overrides,
  };
}

function openRepo(): SqliteChangeSetRepo {
  return new SqliteChangeSetRepo(openContentDb(":memory:"));
}

test("actorId round-trips as undefined (not null) when the change set has no actor — the null side of `row.actorId ?? undefined`, never hit by any other suite's always-actored fixtures", async () => {
  const repo = openRepo();
  await repo.insert(record({ actorId: undefined }), [item()]);

  const found = await repo.findById({ workspaceId: WORKSPACE, id: "cs-1" });
  assert.equal(found?.changeSet.actorId, undefined);
});

test("intentRef round-trips its value when present — every other suite's fixtures omit it, so only the null side had ever been reached", async () => {
  const repo = openRepo();
  await repo.insert(record({ intentRef: "chat-message-42" }), [item()]);

  const found = await repo.findById({ workspaceId: WORKSPACE, id: "cs-1" });
  assert.equal(found?.changeSet.intentRef, "chat-message-42");
});

test("intentRef round-trips as undefined when absent", async () => {
  const repo = openRepo();
  await repo.insert(record(), [item()]);

  const found = await repo.findById({ workspaceId: WORKSPACE, id: "cs-1" });
  assert.equal(found?.changeSet.intentRef, undefined);
});

test("appliedAt round-trips as undefined for a change set that was never applied (status 'proposed') — the null side of `row.appliedAt ?? undefined`, never hit by any other suite's always-applied fixtures", async () => {
  const repo = openRepo();
  await repo.insert(record({ status: "proposed", appliedAt: undefined }), [item()]);

  const found = await repo.findById({ workspaceId: WORKSPACE, id: "cs-1" });
  assert.equal(found?.changeSet.status, "proposed");
  assert.equal(found?.changeSet.appliedAt, undefined);
});

test("revertedAt round-trips its value when supplied AT INSERT TIME (not via a later save()) — every other suite's insert() calls omit it and only set it through save()", async () => {
  const repo = openRepo();
  await repo.insert(record({ status: "reverted", revertedAt: "2026-09-04T01:00:00.000Z" }), [item()]);

  const found = await repo.findById({ workspaceId: WORKSPACE, id: "cs-1" });
  assert.equal(found?.changeSet.revertedAt, "2026-09-04T01:00:00.000Z");
});

test("save() persists an absent appliedAt as null, round-tripping to undefined — unreachable via revert.ts (the only production caller, which always supplies appliedAt), but a plain ChangeSetRepoPort.save() call is not restricted to that caller", async () => {
  const repo = openRepo();
  await repo.insert(record(), [item()]);

  await repo.save({ ...record(), status: "proposed", appliedAt: undefined });

  const found = await repo.findById({ workspaceId: WORKSPACE, id: "cs-1" });
  assert.equal(found?.changeSet.status, "proposed");
  assert.equal(found?.changeSet.appliedAt, undefined);
});

test("save() persists an absent revertedAt as null, round-tripping to undefined — same unreachable-from-revert.ts branch as appliedAt above, tested directly through the port", async () => {
  const repo = openRepo();
  await repo.insert(record({ status: "reverted", revertedAt: "2026-09-04T01:00:00.000Z" }), [item()]);

  await repo.save({ ...record(), status: "applied", revertedAt: undefined });

  const found = await repo.findById({ workspaceId: WORKSPACE, id: "cs-1" });
  assert.equal(found?.changeSet.status, "applied");
  assert.equal(found?.changeSet.revertedAt, undefined);
});

test("beforeRevisionId round-trips its value when present — a revisioned entity type's item ('Revision pointers for revisioned entity types', change-set.ts), never exercised by any suite's fixtures, which always omit it", async () => {
  const repo = openRepo();
  await repo.insert(record(), [item({ beforeRevisionId: "rev-before-1" })]);

  const found = await repo.findById({ workspaceId: WORKSPACE, id: "cs-1" });
  assert.equal(found?.items[0].beforeRevisionId, "rev-before-1");
});

test("beforeRevisionId round-trips as undefined when absent", async () => {
  const repo = openRepo();
  await repo.insert(record(), [item()]);

  const found = await repo.findById({ workspaceId: WORKSPACE, id: "cs-1" });
  assert.equal(found?.items[0].beforeRevisionId, undefined);
});

test("afterRevisionId round-trips its value when present — same never-exercised branch as beforeRevisionId", async () => {
  const repo = openRepo();
  await repo.insert(record(), [item({ afterRevisionId: "rev-after-1" })]);

  const found = await repo.findById({ workspaceId: WORKSPACE, id: "cs-1" });
  assert.equal(found?.items[0].afterRevisionId, "rev-after-1");
});

test("afterRevisionId round-trips as undefined when absent", async () => {
  const repo = openRepo();
  await repo.insert(record(), [item()]);

  const found = await repo.findById({ workspaceId: WORKSPACE, id: "cs-1" });
  assert.equal(found?.items[0].afterRevisionId, undefined);
});

test("entityVersionAtApply round-trips as undefined for a 'create' item, which has no prior version — the null side of `row.entityVersionAtApply ?? undefined`, never hit by any other suite's always-versioned update fixtures", async () => {
  const repo = openRepo();
  await repo.insert(record(), [
    item({ operation: "create", entityVersionAtApply: undefined, inversePayload: undefined }),
  ]);

  const found = await repo.findById({ workspaceId: WORKSPACE, id: "cs-1" });
  assert.equal(found?.items[0].entityVersionAtApply, undefined);
});
