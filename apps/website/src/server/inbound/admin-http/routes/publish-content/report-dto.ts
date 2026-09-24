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
      // Field-by-field on purpose (this mapper is a whitelist, not a spread), so a new planner field
      // is only ever serialized deliberately — which also means a new one is invisible to every
      // client until it is added HERE. `entityLabel` is what the report table names its rows by.
      entityLabel: row.entityLabel,
      outcome: row.outcome,
      writes: row.writes,
      reason: row.reason,
      // publish-overwrite-live-plan §4/S6 — whitelisted the same field-by-field way as every other
      // row field above (this mapper's own doc), so the admin dialog and the chat surface can offer
      // the "overwrite on live" tick without either reaching into the planner's own row shape.
      canOverwrite: row.canOverwrite,
      retires: row.retires,
    })),
  };
}
