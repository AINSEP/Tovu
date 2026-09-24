/**
 * Client-safe publish-content report wire contract.
 *
 * This module is deliberately neutral: it imports no planner, repository, Node builtin, or UI
 * code. Server HTTP boundaries and the admin client share these DTOs without either depending on
 * the other's implementation graph.
 */

export type PublishContentOutcomeKindDto =
  | "created"
  | "unchanged"
  | "applied"
  | "conflict"
  | "blocked"
  | "forced";

/** Wire twin of `planner.ts`'s `RetireTarget` — this module imports no planner code (this file's
 *  header), so the shape is repeated here rather than shared by import. */
export interface PublishContentRetireTargetDto {
  readonly entityType: string;
  readonly entityId: string;
  readonly entityLabel: string | null;
  readonly hash: string;
}

export interface PublishContentOutcomeRowDto {
  readonly entityType: string;
  readonly entityId: string;
  /**
   * The entity's human identifier (`planner.ts`'s `entityDisplayLabel`) — a slug, a title — so a
   * client can name the row instead of printing a uuid at the operator.
   *
   * OPTIONAL on the wire, unlike on the planner's own row, precisely because this report can arrive
   * from ANOTHER instance: a peer built before this field existed answers a plan without it, and
   * that response must still render. A reader treats absent exactly like `null` (show a short id),
   * never as a reason to reject the report.
   */
  readonly entityLabel?: string | null;
  readonly outcome: PublishContentOutcomeKindDto;
  readonly writes: boolean;
  readonly reason: string | null;
  /**
   * publish-overwrite-live-plan §4/S6 — whitelisted straight off `planner.ts`'s own `canOverwrite`.
   * OPTIONAL on the wire, the same reasoning as `entityLabel` above: a peer built before S2 answers a
   * plan without it, and a reader must treat absent exactly like `false` (nothing offered), never as
   * a reason to reject the report.
   */
  readonly canOverwrite?: boolean;
  /** publish-overwrite-live-plan §4/S6 — whitelisted straight off `planner.ts`'s own `retires`.
   *  OPTIONAL/absent for the same pre-S2-peer reason as {@link canOverwrite}; a reader treats absent
   *  exactly like `null`. */
  readonly retires?: PublishContentRetireTargetDto | null;
}

/** The only report shape serialized for publish-content clients. */
export interface PublishContentReportDto {
  readonly refused: boolean;
  readonly refusalReason: string | null;
  readonly applyOrder: readonly string[];
  readonly rows: readonly PublishContentOutcomeRowDto[];
}
