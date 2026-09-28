import type { Selectable } from "kysely";

import type { ContentKernel } from "../content-kernel.js";
import type { ChangeSetItemsTable, ChangeSetsTable } from "../content-database.generated.js";
import { outboxEventValues } from "./outbox-repo.js";
import type {
  DomainEvent,
  ChangeSetItemRecord,
  ChangeSetOperation,
  ChangeSetRecord,
  ChangeSetRepoPort,
  ChangeSetStatus,
  ChangeSetWithItems,
} from "@jini-ai/cms/core";

/**
 * @file SPEC-023 / ADR-046 Phase 1 — THE `ChangeSetRepoPort` adapter: one Kysely query body for every
 * dialect (storage plan §4, ADR-066). ADR-006 rule-of-two "second adapter" half;
 * `core/commands/repo.memory.ts`'s `InMemoryChangeSetRepo` is the first.
 * `sqlite/change-set-repo.sqlite.ts` is the thin subclass the composition root builds.
 *
 * Purpose:
 * Change-set mutation history (ADR-008's audit/undo trail) previously lived only in-memory in the
 * real running server (`server/deps.ts`), lost on every restart — ADR-046's Context section names
 * this explicitly as unacceptable for user-visible state. This adapter closes that gap.
 *
 * Transaction-participation scope (disclosed, deliberate): `insert()` writes the change-set header,
 * its items, AND (BR-04 resolution, 2026-07-16 swarm debate — full record:
 * `ADS-memory/reports/swarm-consensus/runs/20260716T-br04-outbox-seam-consensus-report.md`)
 * its optional outbox event, as ONE atomic kernel transaction — none of the three rows can ever
 * partially land. This does NOT extend to wrapping the *domain* mutation's own write in the same
 * transaction as this repo's insert — `core/commands/command.ts`'s `executeCommand()` keeps its
 * existing capture-then-compensating-rollback design unchanged for the domain write (ADR-046 Phase
 * 1's own instruction for this row: "migrate existing local semantics without changing route
 * contracts"). Unifying the domain write and this repo's write into one shared transaction would
 * mean threading a transaction handle through every `CommandMutation.execute()` across the whole
 * codebase — that is Phase 3 (composition-root rework) territory, not this row's job.
 *
 * Architectural role:
 * Infrastructure adapter. `core/commands` never imports this file — it depends only on
 * `ChangeSetRepoPort`; composition roots (`server/deps.ts`) bind the concrete class.
 */

function toRecord(row: Selectable<ChangeSetsTable>): ChangeSetRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    actorId: row.actor_id ?? undefined,
    status: row.status as ChangeSetStatus,
    summary: row.summary,
    idempotencyKey: row.idempotency_key ?? undefined,
    intentRef: row.intent_ref ?? undefined,
    createdAt: row.created_at,
    appliedAt: row.applied_at ?? undefined,
    revertedAt: row.reverted_at ?? undefined,
  };
}

function toItemRecord(row: Selectable<ChangeSetItemsTable>): ChangeSetItemRecord {
  return {
    id: row.id,
    changeSetId: row.change_set_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    operation: row.operation as ChangeSetOperation,
    beforeRevisionId: row.before_revision_id ?? undefined,
    afterRevisionId: row.after_revision_id ?? undefined,
    inversePayload: row.inverse_payload_json == null ? undefined : JSON.parse(row.inverse_payload_json),
    entityVersionAtApply: row.entity_version_at_apply ?? undefined,
    position: row.position,
  };
}

export class SqlChangeSetRepo implements ChangeSetRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  /** Header + items + (when supplied) the outbox event land as one atomic transaction — never a
   * partial write (ADR-046 Phase 1's "transaction participation" requirement, and BR-04's
   * resolution for the outbox event specifically; see this file's header). */
  async insert(record: ChangeSetRecord, items: ChangeSetItemRecord[], event?: DomainEvent): Promise<void> {
    await this.kernel.transaction(() =>
      this.kernel.run(async (db) => {
        await db
          .insertInto("change_sets")
          .values({
            id: record.id,
            workspace_id: record.workspaceId,
            actor_id: record.actorId ?? null,
            status: record.status,
            summary: record.summary,
            idempotency_key: record.idempotencyKey ?? null,
            intent_ref: record.intentRef ?? null,
            created_at: record.createdAt,
            applied_at: record.appliedAt ?? null,
            reverted_at: record.revertedAt ?? null,
          })
          .execute();

        for (const item of items) {
          await db
            .insertInto("change_set_items")
            .values({
              id: item.id,
              change_set_id: item.changeSetId,
              entity_type: item.entityType,
              entity_id: item.entityId,
              operation: item.operation,
              before_revision_id: item.beforeRevisionId ?? null,
              after_revision_id: item.afterRevisionId ?? null,
              inverse_payload_json: item.inversePayload === undefined ? null : JSON.stringify(item.inversePayload),
              entity_version_at_apply: item.entityVersionAtApply ?? null,
              position: item.position,
            })
            .execute();
        }

        if (event) await db.insertInto("outbox_events").values(outboxEventValues(event)).execute();
      })
    );
  }

  async findById(required: { workspaceId: string; id: string }): Promise<ChangeSetWithItems | null> {
    return this.kernel.run(async (db) => {
      const row = await db
        .selectFrom("change_sets")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .limit(1)
        .executeTakeFirst();
      if (!row) return null;
      const itemRows = await db
        .selectFrom("change_set_items")
        .selectAll()
        .where("change_set_id", "=", row.id)
        .orderBy("position")
        .execute();
      return { changeSet: toRecord(row), items: itemRows.map(toItemRecord) };
    });
  }

  async findByIdempotencyKey(required: { workspaceId: string; idempotencyKey: string }): Promise<ChangeSetRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("change_sets")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("idempotency_key", "=", required.idempotencyKey)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toRecord(row) : null;
  }

  async listByWorkspace(required: { workspaceId: string }): Promise<ChangeSetRecord[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("change_sets").selectAll().where("workspace_id", "=", required.workspaceId).orderBy("created_at").execute()
    );
    return rows.map(toRecord);
  }

  async save(record: ChangeSetRecord): Promise<void> {
    await this.kernel.run((db) =>
      db
        .updateTable("change_sets")
        .set({ status: record.status, applied_at: record.appliedAt ?? null, reverted_at: record.revertedAt ?? null })
        .where("workspace_id", "=", record.workspaceId)
        .where("id", "=", record.id)
        .execute()
    );
  }
}

/** The change-set repo on `kernel`'s database, whichever dialect. */
export function changeSetRepoFor(kernel: ContentKernel): ChangeSetRepoPort {
  return new SqlChangeSetRepo(kernel);
}
