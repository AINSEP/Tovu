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
}

/** The only report shape serialized for publish-content clients. */
export interface PublishContentReportDto {
  readonly refused: boolean;
  readonly refusalReason: string | null;
  readonly applyOrder: readonly string[];
  readonly rows: readonly PublishContentOutcomeRowDto[];
}
