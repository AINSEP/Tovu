import assert from "node:assert/strict";
import { test } from "node:test";

import type { ChangeSetItemRecord, ChangeSetRecord, DomainEvent } from "@jini-ai/cms/core";
import type { ContentKernel } from "../../content-kernel.js";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqlChangeSetRepo } from "../change-set-repo.js";

/**
 * @file `SqlChangeSetRepo.insert()`'s write side against a real, migrated content database on every
 * dialect (SQLite + PGlite, storage plan §4). The port-level round trips live in
 * `contracts/core/commands/__tests__/repo.contract.test.ts` and the optional-field read branches in
 * `sqlite/__tests__/change-set-repo.sqlite.test.ts`; what only this file proves is the exact column
 * values each record maps to (absent optionals are SQL NULL, never a stringified "undefined"), the
 * co-persisted outbox event, and that header + items + event land all-or-nothing.
 */

const WORKSPACE = "workspace-1";
const AT = "2026-10-20T00:00:00.000Z";
const TABLES = ["change_set_items", "change_sets", "outbox_events"];

function header(overrides: Partial<ChangeSetRecord> = {}): ChangeSetRecord {
  return {
    id: "cs-1",
    workspaceId: WORKSPACE,
    actorId: "user-1",
    status: "reverted",
    summary: "Renamed a post",
    idempotencyKey: "idem-1",
    intentRef: "chat-message-1",
    createdAt: AT,
    appliedAt: "2026-10-20T00:00:01.000Z",
    revertedAt: "2026-10-20T00:00:02.000Z",
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
    beforeRevisionId: "rev-before",
    afterRevisionId: "rev-after",
    inversePayload: { title: "Old title" },
    entityVersionAtApply: 3,
    position: 0,
    ...overrides,
  };
}

const EVENT: DomainEvent = {
  id: "evt-1",
  name: "change-set.applied",
  occurredAt: AT,
  workspaceId: WORKSPACE,
  payload: { changeSetId: "cs-1" },
};

function make(kernel: ContentKernel) {
  return { kernel, repo: new SqlChangeSetRepo(kernel) };
}

async function headerRows(kernel: ContentKernel) {
  return kernel.run((db) => db.selectFrom("change_sets").selectAll().execute());
}

async function itemRows(kernel: ContentKernel) {
  return kernel.run((db) => db.selectFrom("change_set_items").selectAll().orderBy("position").execute());
}

/** Outbox rows with `event_json` parsed: Postgres stores it as `jsonb`, which does not keep key order. */
async function outboxRows(kernel: ContentKernel) {
  const rows = await kernel.run((db) => db.selectFrom("outbox_events").select(["id", "workspace_id", "event_json", "status", "attempts", "next_attempt_at", "created_at"]).execute());
  return rows.map((row) => ({ ...row, event_json: JSON.parse(row.event_json) as unknown }));
}

describeEachDialect("SqlChangeSetRepo.insert", { tables: TABLES, make }, (makeRepo, dialect) => {
  const uniqueViolation = (table: string) => dialect === "sqlite" ? new RegExp(`UNIQUE constraint failed: ${table}\\.id`) : new RegExp(`duplicate key value violates unique constraint "${table}_pkey"`);

  test("a fully populated header is written column-for-column", async () => {
    const { kernel, repo } = makeRepo();

    await repo.insert({ record: header(), items: [] });

    assert.deepEqual(await headerRows(kernel), [{
      id: "cs-1",
      workspace_id: WORKSPACE,
      actor_id: "user-1",
      status: "reverted",
      summary: "Renamed a post",
      idempotency_key: "idem-1",
      intent_ref: "chat-message-1",
      created_at: AT,
      applied_at: "2026-10-20T00:00:01.000Z",
      reverted_at: "2026-10-20T00:00:02.000Z",
    }]);
  });

  test("every absent optional header field is written as SQL NULL", async () => {
    const { kernel, repo } = makeRepo();
    const bare = header({ actorId: undefined, idempotencyKey: undefined, intentRef: undefined, appliedAt: undefined, revertedAt: undefined, status: "proposed" });

    await repo.insert({ record: bare, items: [] });

    assert.deepEqual(await headerRows(kernel), [{
      id: "cs-1",
      workspace_id: WORKSPACE,
      actor_id: null,
      status: "proposed",
      summary: "Renamed a post",
      idempotency_key: null,
      intent_ref: null,
      created_at: AT,
      applied_at: null,
      reverted_at: null,
    }]);
  });

  test("a fully populated item is written column-for-column, its inverse payload as JSON text", async () => {
    const { kernel, repo } = makeRepo();

    await repo.insert({ record: header(), items: [item()] });

    assert.deepEqual(await itemRows(kernel), [{
      id: "csi-1",
      change_set_id: "cs-1",
      entity_type: "post",
      entity_id: "post-1",
      operation: "update",
      before_revision_id: "rev-before",
      after_revision_id: "rev-after",
      inverse_payload_json: JSON.stringify({ title: "Old title" }),
      entity_version_at_apply: 3,
      position: 0,
    }]);
  });

  test("every absent optional item field is written as SQL NULL", async () => {
    const { kernel, repo } = makeRepo();
    const bare = item({ operation: "create", beforeRevisionId: undefined, afterRevisionId: undefined, inversePayload: undefined, entityVersionAtApply: undefined });

    await repo.insert({ record: header(), items: [bare] });

    assert.deepEqual(await itemRows(kernel), [{
      id: "csi-1",
      change_set_id: "cs-1",
      entity_type: "post",
      entity_id: "post-1",
      operation: "create",
      before_revision_id: null,
      after_revision_id: null,
      inverse_payload_json: null,
      entity_version_at_apply: null,
      position: 0,
    }]);
  });

  test("every item of a multi-item change set is written", async () => {
    const { kernel, repo } = makeRepo();

    await repo.insert({ record: header(), items: [item(), item({ id: "csi-2", entityId: "post-2", position: 1 })] });

    assert.deepEqual((await itemRows(kernel)).map((row) => [row.id, row.entity_id, row.position]), [["csi-1", "post-1", 0], ["csi-2", "post-2", 1]]);
  });

  test("a supplied event is co-persisted as a pending outbox row", async () => {
    const { kernel, repo } = makeRepo();

    await repo.insert({ record: header(), items: [item()] }, { event: EVENT });

    assert.deepEqual(await outboxRows(kernel), [{
      id: "evt-1",
      workspace_id: WORKSPACE,
      event_json: EVENT,
      status: "pending",
      attempts: 0,
      next_attempt_at: AT,
      created_at: AT,
    }]);
  });

  test("no event means no outbox row", async () => {
    const { kernel, repo } = makeRepo();

    await repo.insert({ record: header(), items: [item()] });

    assert.deepEqual(await outboxRows(kernel), []);
  });

  test("a failing item write rolls back the header and the event with it", async () => {
    const { kernel, repo } = makeRepo();
    const duplicateItemIds = [item(), item({ position: 1 })];

    await assert.rejects(repo.insert({ record: header(), items: duplicateItemIds }, { event: EVENT }), uniqueViolation("change_set_items"));

    assert.deepEqual(await headerRows(kernel), []);
    assert.deepEqual(await itemRows(kernel), []);
    assert.deepEqual(await outboxRows(kernel), []);
  });

  test("a failing event write rolls back the header and every item", async () => {
    const { kernel, repo } = makeRepo();
    await repo.insert({ record: header({ id: "cs-0", idempotencyKey: undefined }), items: [] }, { event: EVENT });

    await assert.rejects(repo.insert({ record: header(), items: [item()] }, { event: EVENT }), uniqueViolation("outbox_events"));

    assert.deepEqual((await headerRows(kernel)).map((row) => row.id), ["cs-0"]);
    assert.deepEqual(await itemRows(kernel), []);
    assert.deepEqual((await outboxRows(kernel)).map((row) => row.id), ["evt-1"]);
  });
});
