import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { changeSetRepoFor } from "#src/platform/db/repos/change-set-repo";
import { SqliteChangeSetRepo } from "#src/platform/db/sqlite/change-set-repo.sqlite";
import { InMemoryChangeSetRepo } from "../repo.memory.js";
import type { ChangeSetItemRecord, ChangeSetRecord, ChangeSetRepoPort } from "@jini-ai/cms/core";

/**
 * @file SPEC-023 / ADR-046 Phase 1 — shared `ChangeSetRepoPort` contract-test suite, run against
 * BOTH `repo.memory.ts` and `db/sqlite/change-set-repo.sqlite.ts` (rule-of-two, ADR-006).
 * Same pattern as `redirects/__tests__/repo.contract.test.ts`/every other rule-of-two contract
 * suite in this codebase.
 */

function makeRecord(overrides: Partial<ChangeSetRecord> = {}): ChangeSetRecord {
  return {
    id: overrides.id ?? "cs-1",
    workspaceId: "workspace-1",
    actorId: "user-1",
    status: "applied",
    summary: "Updated post title",
    createdAt: "2026-07-16T00:00:00.000Z",
    appliedAt: "2026-07-16T00:00:00.000Z",
    ...overrides,
  };
}

function makeItem(changeSetId: string, overrides: Partial<ChangeSetItemRecord> = {}): ChangeSetItemRecord {
  return {
    id: overrides.id ?? `${changeSetId}-item-1`,
    changeSetId,
    entityType: "post",
    entityId: "post-1",
    operation: "update",
    inversePayload: { title: "Old title" },
    entityVersionAtApply: 2,
    position: 0,
    ...overrides,
  };
}

function runContractSuite(label: string, makeRepo: () => ChangeSetRepoPort) {
  test(`[${label}] insert() then findById() round-trips the header and its items`, async () => {
    const repo = makeRepo();
    const record = makeRecord();
    const item = makeItem(record.id);
    await repo.insert({ record: record, items: [item] });

    const found = await repo.findById({ workspaceId: "workspace-1", id: record.id });
    assert.ok(found);
    assert.equal(found?.changeSet.summary, "Updated post title");
    assert.equal(found?.changeSet.status, "applied");
    assert.equal(found?.items.length, 1);
    assert.equal(found?.items[0].entityType, "post");
    assert.deepEqual(found?.items[0].inversePayload, { title: "Old title" });
  });

  test(`[${label}] findById returns null for a different workspace (workspace isolation)`, async () => {
    const repo = makeRepo();
    const record = makeRecord();
    await repo.insert({ record: record, items: [makeItem(record.id)] });

    const found = await repo.findById({ workspaceId: "workspace-other", id: record.id });
    assert.equal(found, null);
  });

  test(`[${label}] findByIdempotencyKey finds the change set that used the key`, async () => {
    const repo = makeRepo();
    const record = makeRecord({ id: "cs-idem", idempotencyKey: "client-key-1" });
    await repo.insert({ record: record, items: [makeItem(record.id)] });

    const found = await repo.findByIdempotencyKey({ workspaceId: "workspace-1", idempotencyKey: "client-key-1" });
    assert.ok(found);
    assert.equal(found?.id, "cs-idem");
  });

  test(`[${label}] findByIdempotencyKey returns null for an unused key`, async () => {
    const repo = makeRepo();
    const found = await repo.findByIdempotencyKey({ workspaceId: "workspace-1", idempotencyKey: "never-used" });
    assert.equal(found, null);
  });

  test(`[${label}] multiple change sets with no idempotency key never collide with each other`, async () => {
    const repo = makeRepo();
    await repo.insert({ record: makeRecord({ id: "cs-a" }), items: [makeItem("cs-a")] });
    await repo.insert({ record: makeRecord({ id: "cs-b" }), items: [makeItem("cs-b")] });

    const list = await repo.listByWorkspace({ workspaceId: "workspace-1" });
    assert.equal(list.length, 2);
  });

  test(`[${label}] listByWorkspace lists every change set for that workspace, none from another`, async () => {
    const repo = makeRepo();
    await repo.insert({ record: makeRecord({ id: "cs-1", workspaceId: "workspace-1" }), items: [makeItem("cs-1")] });
    await repo.insert({ record: makeRecord({ id: "cs-2", workspaceId: "workspace-2" }), items: [makeItem("cs-2")] });

    const list = await repo.listByWorkspace({ workspaceId: "workspace-1" });
    assert.equal(list.length, 1);
    assert.equal(list[0].id, "cs-1");
  });

  test(`[${label}] save() persists a status transition (applied -> reverted)`, async () => {
    const repo = makeRepo();
    const record = makeRecord();
    await repo.insert({ record: record, items: [makeItem(record.id)] });

    await repo.save({ ...record, status: "reverted", revertedAt: "2026-07-16T01:00:00.000Z" });

    const found = await repo.findById({ workspaceId: "workspace-1", id: record.id });
    assert.equal(found?.changeSet.status, "reverted");
    assert.equal(found?.changeSet.revertedAt, "2026-07-16T01:00:00.000Z");
  });

  test(`[${label}] items are returned in position order, not insertion order`, async () => {
    const repo = makeRepo();
    const record = makeRecord({ id: "cs-multi" });
    await repo.insert({ record: record, items: [
      makeItem(record.id, { id: "item-b", position: 1, entityId: "post-2" }),
      makeItem(record.id, { id: "item-a", position: 0, entityId: "post-1" }),
    ] });

    const found = await repo.findById({ workspaceId: "workspace-1", id: record.id });
    assert.deepEqual(
      found?.items.map((i) => i.entityId),
      ["post-1", "post-2"]
    );
  });

  test(`[${label}] an item with no inverse payload round-trips as undefined, not null or a stringified "null"`, async () => {
    const repo = makeRepo();
    const record = makeRecord({ id: "cs-no-inverse" });
    await repo.insert({ record: record, items: [makeItem(record.id, { inversePayload: undefined })] });

    const found = await repo.findById({ workspaceId: "workspace-1", id: record.id });
    assert.equal(found?.items[0].inversePayload, undefined);
  });
}

runContractSuite("memory", () => new InMemoryChangeSetRepo());

runContractSuite("sqlite", () => new SqliteChangeSetRepo(openContentDb(":memory:")));

// The one Kysely body on every dialect (storage plan §4): SQLite again through the neutral factory, and PGlite.
for (const each of eachDialect({ tables: ["change_set_items", "change_sets", "outbox_events"], make: changeSetRepoFor })) {
  runContractSuite(`kysely/${each.name}`, each.make);
}
