import type { PublishContentOutcomeRow, PublishContentReport } from "./contract.js";

/**
 * @file Task 11 — turning a `PublishContentReport` into the rows the Publish Content dialog
 * renders, and the counts its primary button is labelled with.
 *
 * ## The one property this file is responsible for
 *
 * Plan §4 task 11: *a conflict row renders its reason and is not selectable for silent apply.*
 *
 * There is deliberately **no per-row opt-in control** in v1, and this is not an oversight. The
 * execute route (`routes/publish-content/import.ts`) accepts a bundle and a confirmation token and
 * nothing else — it has no per-row selection parameter — so a checkbox next to each row would be a
 * control that changes nothing, which is worse than no control at all. Exclusion is by
 * construction instead: a `skipped` row is not in the set the run writes, and there is no affordance
 * anywhere in the dialog that could move it there. `forced` (plan §4's seventh outcome, the operator
 * explicitly choosing a conflicted row) is the feature that will need row selection; when it lands
 * it lands here, next to `publishRowDisposition`, not as a second copy in `apps/admin`.
 *
 * `appliesOnExecute` is read straight off the planner's own `writes` flag rather than re-derived
 * from `outcome`, so this file cannot disagree with `planner.ts` about what a run does.
 */

/**
 * What the dialog says will happen to one entity.
 *
 * - `publish` — the run writes this row.
 * - `unchanged` — the destination already matches; nothing happens, and that is the expected case.
 * - `skipped` — the run deliberately does not touch this row, and owes the operator a reason.
 */
export type PublishRowDisposition = "publish" | "unchanged" | "skipped";

/** One rendered report row. `key` is stable across re-plans, so React can keep row identity. */
export interface PublishReportRow {
  readonly key: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly outcome: PublishContentOutcomeRow["outcome"];
  readonly disposition: PublishRowDisposition;
  readonly dispositionLabel: string;
  /** Never `null` for a `skipped` row — see {@link MISSING_REASON}. */
  readonly reason: string | null;
  /** The planner's own `writes` flag, carried through unmodified. */
  readonly appliesOnExecute: boolean;
}

/** What the counts under the table add up to. */
export interface PublishReportSummary {
  readonly total: number;
  readonly publishing: number;
  readonly unchanged: number;
  readonly skipped: number;
}

/**
 * Stand-in for a `skipped` row whose planner reason is `null`. A skip with a blank cell reads as a
 * rendering bug and leaves the operator with no way to act; a sentence that says the reason is
 * missing is at least honest about which of the two it is.
 */
const MISSING_REASON = "No reason recorded.";

const DISPOSITION_BY_OUTCOME: Readonly<Record<PublishContentOutcomeRow["outcome"], PublishRowDisposition>> = {
  created: "publish",
  applied: "publish",
  forced: "publish",
  unchanged: "unchanged",
  conflict: "skipped",
  blocked: "skipped",
};

/** Terse, operator-facing, and specific about *why* — "Skipped" alone sends someone hunting. */
const LABEL_BY_OUTCOME: Readonly<Record<PublishContentOutcomeRow["outcome"], string>> = {
  created: "Will publish — new",
  applied: "Will publish — update",
  forced: "Will publish — overwrite",
  unchanged: "Already up to date",
  conflict: "Skipped",
  blocked: "Skipped",
};

/**
 * Whether the run writes this row, stated as a disposition rather than a boolean so the table can
 * distinguish "nothing to do" from "deliberately not done".
 *
 * @complexity O(1).
 */
export function publishRowDisposition(row: PublishContentOutcomeRow): PublishRowDisposition {
  return DISPOSITION_BY_OUTCOME[row.outcome];
}

/**
 * Shapes a report for rendering. A refused report has no rows by construction (`planner.ts`), so
 * this returns an empty list for one rather than inventing a placeholder — the dialog renders the
 * refusal reason on its own.
 *
 * @complexity O(n) in the report's row count, single pass, no sorting: the planner already emits
 * rows in `dependsOn` apply order and re-sorting here would hide that ordering from the operator.
 */
export function toPublishReportRows(report: PublishContentReport): readonly PublishReportRow[] {
  if (report.refused) return [];
  return report.rows.map((row) => {
    const disposition = publishRowDisposition(row);
    return {
      key: `${row.entityType}:${row.entityId}`,
      entityType: row.entityType,
      entityId: row.entityId,
      outcome: row.outcome,
      disposition,
      dispositionLabel: LABEL_BY_OUTCOME[row.outcome],
      reason: disposition === "skipped" ? (row.reason ?? MISSING_REASON) : row.reason,
      appliesOnExecute: row.writes,
    };
  });
}

/**
 * The counts the dialog's primary button and summary line read from.
 *
 * `publishing` counts rows by disposition, not by `appliesOnExecute`: the two agree for every
 * outcome the planner produces, and disagreeing would mean the table said one thing and the button
 * said another. `report-rows.test.ts` pins them together.
 *
 * @complexity O(n), single pass.
 */
export function summarizePublishReport(rows: readonly PublishReportRow[]): PublishReportSummary {
  let publishing = 0;
  let unchanged = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.disposition === "publish") publishing += 1;
    else if (row.disposition === "unchanged") unchanged += 1;
    else skipped += 1;
  }
  return { total: rows.length, publishing, unchanged, skipped };
}
