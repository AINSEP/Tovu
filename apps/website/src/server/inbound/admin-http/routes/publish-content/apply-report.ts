import type { BackstopAuditPort } from "#src/features/publish-content/backstop-audit";
import type { PublishContentReport } from "#src/features/publish-content/planner";
import type { PublishContentReportDto } from "#src/features/publish-content/report-contract";
import { toPublishContentReportDto } from "./report-dto.js";

/**
 * @file The extra `report` field the manual import `execute` reply carries for a backstop run,
 * read from the destination's backstop audit (`import.ts`'s execute route spreads the result into
 * its reply). Its own module so every arm is testable with a small audit fake instead of a full
 * backstop apply through the gateway.
 */

/**
 * Reads the apply-time report a backstop run recorded, so the manual result names apply-time
 * skips rather than repeating the dry-run prediction.
 *
 * Reading the audit after a successful mutation is advisory: a read failure must never turn an
 * already applied send into an apparent failure and invite a duplicate retry, so any audit error
 * (and a missing, not-ready or non-destination record) yields `{}`.
 *
 * @returns `{ report }` to spread into the execute reply, or `{}` when there is nothing to add.
 * @complexity O(rows) for the DTO mapping; one `ready()` and at most one `get()`.
 */
export async function readBackstopApplyReport(required: {
  audit: BackstopAuditPort | undefined;
  workspaceId: string;
  runId: string;
}): Promise<{ report?: PublishContentReportDto }> {
  const { audit, workspaceId, runId } = required;
  try {
    if (!audit || !(await audit.ready())) return {};
    const log = await audit.get({ workspaceId, id: runId });
    if (log?.direction !== "destination" || !log.details.report) return {};
    return { report: toPublishContentReportDto(log.details.report as PublishContentReport) };
  } catch {
    // The normal run and its persisted audit remain authoritative.
    return {};
  }
}
