import type { ISODateTime, JsonObject, UUID } from "../ports";

/**
 * @file Change-set vocabulary and persistence contract (ADR-008).
 *
 * Purpose:
 * Defines the durable rows that make every mutation auditable and revertible,
 * for human and AI actors alike.
 *
 * How it relates to the project:
 * - `command.ts` records one change set per executed command.
 * - `revert.ts` walks items in reverse to undo an applied change set.
 * - `repo.memory.ts` provides the in-memory adapter for local dev/tests.
 *
 * Architectural role:
 * This is the storage shape ADR-008 requires to land with the first persistent
 * schema. SQLite/Postgres adapters must satisfy `ChangeSetRepoPort` unchanged.
 */
export type ChangeSetStatus = "proposed" | "applied" | "reverted" | "discarded";

export type ChangeSetOperation = "create" | "update" | "delete" | "activate";

/** Durable header row for one reviewable, revertible unit of change. */
export interface ChangeSetRecord {
  id: UUID;
  workspaceId: UUID;
  /** Principal (user or agent) that caused the change. */
  actorId?: UUID;
  status: ChangeSetStatus;
  /** Human-readable description shown in audit/review UIs. */
  summary: string;
  /** Client-supplied key that makes retried commands safe to reject. */
  idempotencyKey?: string;
  /** Link back to the chat message / plan step that motivated the change. */
  intentRef?: string;
  createdAt: ISODateTime;
  appliedAt?: ISODateTime;
  revertedAt?: ISODateTime;
}

/** One entity mutation inside a change set. */
export interface ChangeSetItemRecord {
  id: UUID;
  changeSetId: UUID;
  /** Entity type key used to resolve an inverse applier, e.g. `post`. */
  entityType: string;
  entityId: UUID;
  operation: ChangeSetOperation;
  /** Revision pointers for revisioned entity types (ADR-008). */
  beforeRevisionId?: UUID;
  afterRevisionId?: UUID;
  /**
   * Inline inverse for non-revisioned entities. An item with neither revision
   * pointers nor an inverse payload cannot be reverted — and per ADR-008 such
   * entities must not be mutated by agents.
   */
  inversePayload?: JsonObject;
  /** Apply order; revert walks positions in reverse. */
  position: number;
}

/** Change set header plus its ordered items. */
export interface ChangeSetWithItems {
  changeSet: ChangeSetRecord;
  items: ChangeSetItemRecord[];
}

/** Persistence contract for change sets. */
export interface ChangeSetRepoPort {
  insert(record: ChangeSetRecord, items: ChangeSetItemRecord[]): Promise<void>;
  findById(required: { workspaceId: UUID; id: UUID }): Promise<ChangeSetWithItems | null>;
  findByIdempotencyKey(required: {
    workspaceId: UUID;
    idempotencyKey: string;
  }): Promise<ChangeSetRecord | null>;
  listByWorkspace(required: { workspaceId: UUID }): Promise<ChangeSetRecord[]>;
  /** Persist status transitions (applied -> reverted, proposed -> discarded, …). */
  save(record: ChangeSetRecord): Promise<void>;
}
