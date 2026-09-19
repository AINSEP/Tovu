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
