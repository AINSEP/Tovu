import { and, eq } from "drizzle-orm";

import { changeSetItems, changeSets, outboxEvents } from "../db/schema";
import type { ContentDb } from "./content-db";
import type { DomainEvent } from "../../core/ports";
import type {
  ChangeSetItemRecord,
  ChangeSetOperation,
  ChangeSetRecord,
  ChangeSetRepoPort,
  ChangeSetStatus,
  ChangeSetWithItems,
} from "../../core/commands/change-set";

/**
 * @file SPEC-023 / ADR-046 Phase 1 — real SQLite `ChangeSetRepoPort` adapter (ADR-006 rule-of-two
 * "second adapter" half; `core/commands/repo.memory.ts`'s `InMemoryChangeSetRepo` is the first).
 *
 * Purpose:
 * Change-set mutation history (ADR-008's audit/undo trail) previously lived only in-memory in the
 * real running server (`server/deps.ts`), lost on every restart — ADR-046's Context section names
 * this explicitly as unacceptable for user-visible state. This adapter closes that gap.
 *
 * Transaction-participation scope (disclosed, deliberate): `insert()` writes the change-set header,
 * its items, AND (BR-04 resolution, 2026-07-16 swarm debate — full record:
 * `ADS-memory/reports/swarm-consensus/runs/20260716T-br04-outbox-seam-consensus-report.md`)
 * its optional outbox event, as ONE atomic SQLite transaction — none of the three rows can ever
 * partially land. This does NOT extend to wrapping the *domain* mutation's own write in the same
 * transaction as this repo's insert — `core/commands/command.ts`'s `executeCommand()` keeps its
 * existing capture-then-compensating-rollback design unchanged for the domain write (ADR-046 Phase
 * 1's own instruction for this row: "migrate existing local semantics without changing route
 * contracts"). Unifying the domain write and this repo's write into one shared transaction would
 * mean threading a transaction handle through every `CommandMutation.execute()` across the whole
 * codebase — that is Phase 3 (composition-root rework) territory, not this row's job. The debate
 * verified this scope boundary isn't just convenient: Drizzle's better-sqlite3 `transaction()` is
 * synchronous while `mutation.execute()` is an arbitrary async call, so including it here is not
 * buildable under the current driver without an unsafe held-open transaction.
 *
 * Architectural role:
 * Infrastructure adapter. `core/commands` never imports this file — it depends only on
 * `ChangeSetRepoPort`; composition roots (`server/deps.ts`) bind the concrete class.
 */

function toRecord(row: typeof changeSets.$inferSelect): ChangeSetRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    actorId: row.actorId ?? undefined,
    status: row.status as ChangeSetStatus,
    summary: row.summary,
    idempotencyKey: row.idempotencyKey ?? undefined,
    intentRef: row.intentRef ?? undefined,
    createdAt: row.createdAt,
    appliedAt: row.appliedAt ?? undefined,
    revertedAt: row.revertedAt ?? undefined,
  };
}

function toItemRecord(row: typeof changeSetItems.$inferSelect): ChangeSetItemRecord {
  return {
    id: row.id,
    changeSetId: row.changeSetId,
    entityType: row.entityType,
    entityId: row.entityId,
    operation: row.operation as ChangeSetOperation,
    beforeRevisionId: row.beforeRevisionId ?? undefined,
    afterRevisionId: row.afterRevisionId ?? undefined,
    inversePayload: row.inversePayloadJson == null ? undefined : JSON.parse(row.inversePayloadJson),
    entityVersionAtApply: row.entityVersionAtApply ?? undefined,
    position: row.position,
  };
}

export class SqliteChangeSetRepo implements ChangeSetRepoPort {
  constructor(private readonly db: ContentDb) {}

  /** Header + items + (when supplied) the outbox event land as one atomic transaction — never a
   * partial write (ADR-046 Phase 1's "transaction participation" requirement, and BR-04's
   * resolution for the outbox event specifically; see this file's header). */
  async insert(record: ChangeSetRecord, items: ChangeSetItemRecord[], event?: DomainEvent): Promise<void> {
    this.db.transaction((tx) => {
      tx.insert(changeSets)
        .values({
          id: record.id,
          workspaceId: record.workspaceId,
          actorId: record.actorId ?? null,
          status: record.status,
          summary: record.summary,
          idempotencyKey: record.idempotencyKey ?? null,
          intentRef: record.intentRef ?? null,
          createdAt: record.createdAt,
          appliedAt: record.appliedAt ?? null,
          revertedAt: record.revertedAt ?? null,
        })
        .run();

      for (const item of items) {
        tx.insert(changeSetItems)
          .values({
            id: item.id,
            changeSetId: item.changeSetId,
            entityType: item.entityType,
            entityId: item.entityId,
            operation: item.operation,
            beforeRevisionId: item.beforeRevisionId ?? null,
            afterRevisionId: item.afterRevisionId ?? null,
            inversePayloadJson: item.inversePayload === undefined ? null : JSON.stringify(item.inversePayload),
            entityVersionAtApply: item.entityVersionAtApply ?? null,
            position: item.position,
          })
          .run();
      }

      if (event) {
        tx.insert(outboxEvents)
          .values({
            id: event.id,
            workspaceId: event.workspaceId,
            eventJson: JSON.stringify(event),
            status: "pending",
            attempts: 0,
            nextAttemptAt: event.occurredAt,
            createdAt: event.occurredAt,
          })
          .run();
      }
    });
  }

  async findById(required: { workspaceId: string; id: string }): Promise<ChangeSetWithItems | null> {
    const row = this.db
      .select()
      .from(changeSets)
      .where(and(eq(changeSets.workspaceId, required.workspaceId), eq(changeSets.id, required.id)))
      .all()[0];
    if (!row) return null;

    const itemRows = this.db
      .select()
      .from(changeSetItems)
      .where(eq(changeSetItems.changeSetId, row.id))
      .orderBy(changeSetItems.position)
      .all();

    return { changeSet: toRecord(row), items: itemRows.map(toItemRecord) };
  }

  async findByIdempotencyKey(required: { workspaceId: string; idempotencyKey: string }): Promise<ChangeSetRecord | null> {
    const row = this.db
      .select()
      .from(changeSets)
      .where(and(eq(changeSets.workspaceId, required.workspaceId), eq(changeSets.idempotencyKey, required.idempotencyKey)))
      .all()[0];
    return row ? toRecord(row) : null;
  }

  async listByWorkspace(required: { workspaceId: string }): Promise<ChangeSetRecord[]> {
    const rows = this.db
      .select()
      .from(changeSets)
      .where(eq(changeSets.workspaceId, required.workspaceId))
      .orderBy(changeSets.createdAt)
      .all();
    return rows.map(toRecord);
  }

  async save(record: ChangeSetRecord): Promise<void> {
    this.db
      .update(changeSets)
      .set({
        status: record.status,
        appliedAt: record.appliedAt ?? null,
        revertedAt: record.revertedAt ?? null,
      })
      .where(and(eq(changeSets.workspaceId, record.workspaceId), eq(changeSets.id, record.id)))
      .run();
  }
}
