import type { PublishContentReport } from "#src/features/publish-content/planner";
import type { PublishContentReportDto } from "#src/features/publish-content/report-contract";

/** Maps the planner's domain result to the one client-safe wire DTO at the HTTP boundary. */
export function toPublishContentReportDto(report: PublishContentReport): PublishContentReportDto {
  return {
    refused: report.refused,
    refusalReason: report.refusalReason,
    applyOrder: [...report.applyOrder],
    rows: report.rows.map((row) => ({
      entityType: row.entityType,
      entityId: row.entityId,
      outcome: row.outcome,
      writes: row.writes,
      reason: row.reason,
    })),
  };
}
