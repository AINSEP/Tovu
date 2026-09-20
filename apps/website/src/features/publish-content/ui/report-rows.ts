import type { PublishContentOutcomeRow, PublishContentReport } from "./contract.js";

/**
 * @file Task 11 — turning a `PublishContentReport` into the rows the Publish Content dialog
 * renders, and the counts its primary button is labelled with.
 *
 * ## The one property this file is responsible for
 *
 * Plan §4 task 11: *a conflict row renders its reason and is not selectable for silent apply.*
 *
 * **2026-09-19 (owner-directed): rows a run WOULD write are now selectable; rows it would not are
 * still not.** {@link PublishReportRow.selectable} is derived from the disposition map below and
 * from nothing else, so only `publish` rows can ever carry a checkbox — an `unchanged` or `skipped`
 * row renders no control at all (not a disabled one), which keeps the original property exactly as
 * stated: there is no affordance anywhere in the dialog that could move a skipped row into the set
 * the run writes.
 *
 * Deselection is still **exclusion by construction**, not an apply-time flag: deselecting rows makes
 * the dialog re-plan against a bundle containing only the selected entities (`export-bundle.ts`'s
 * `selectBundleEntities`, reached through `push/plan`'s `selectedEntityKeys`), so a deselected entity
 * is never staged on the destination at all and no code path downstream has to remember to skip it.
 * `forced` (plan §4's seventh outcome, the operator explicitly choosing a conflicted row) is a
 * different feature and still unbuilt; when it lands it lands here, next to `publishRowDisposition`,
 * not as a second copy in `apps/admin`.
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

/** One rendered report row. `key` is stable across re-plans, so React can keep row identity, and it
 *  is byte-identical to `planner.ts`'s own `entityKey(type, id)` — the string a selection is sent
 *  back to the server as. */
export interface PublishReportRow {
  readonly key: string;
  readonly entityType: string;
  readonly entityId: string;
  /** Always renderable, never blank: the planner's `entityLabel` when the entity had one, otherwise
   *  a {@link SHORT_ID_LENGTH}-character prefix of the id. A full uuid is never a display value —
   *  the whole column was unreadable while it was one. */
  readonly entityLabel: string;
  /** Whether this row may be deselected before publishing. True for `publish` rows ONLY — an
   *  `unchanged` or `skipped` row is a statement, not an action, and gets no control at all. */
  readonly selectable: boolean;
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

/** How much of an id to show when an entity has no human identifier at all. Eight hex characters is
 *  the git-short-sha convention and stays unique enough to tell two rows apart on one screen, which
 *  is the only job left for an id once the label column is doing the naming. */
const SHORT_ID_LENGTH = 8;

/**
 * What to print in the entity column. Prefers the planner's own label; falls back to a short id
 * prefix, never the full uuid (`?? null` covers an older peer whose report predates the field).
 *
 * @complexity O(1).
 */
function displayLabelFor(row: PublishContentOutcomeRow): string {
  const label = row.entityLabel ?? null;
  if (label !== null && label.trim().length > 0) return label;
  return row.entityId.slice(0, SHORT_ID_LENGTH);
}

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
      entityLabel: displayLabelFor(row),
      selectable: disposition === "publish",
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

/**
 * Every row key the operator is allowed to deselect — the dialog's initial "everything is checked"
 * state, its header checkbox's whole reach, and the yardstick for "is this a strict subset?".
 *
 * Exported rather than left as a filter at the call site so all three of those reads apply the same
 * {@link PublishReportRow.selectable} rule; a fourth that spelled it `disposition === "publish"`
 * itself would silently disagree the day a new outcome lands.
 *
 * @complexity O(n), single pass.
 */
export function selectableRowKeys(rows: readonly PublishReportRow[]): readonly string[] {
  return rows.filter((row) => row.selectable).map((row) => row.key);
}

/**
 * How many rows this run would actually write given the operator's current selection — the number
 * the primary button commits to out loud.
 *
 * Counts the INTERSECTION rather than `selected.size`: a key left over from a previous plan, or one
 * naming a row that is no longer selectable, must not inflate the promise on the button.
 *
 * @complexity O(n), single pass.
 */
export function countSelectedPublishing(rows: readonly PublishReportRow[], selected: ReadonlySet<string>): number {
  let count = 0;
  for (const row of rows) if (row.selectable && selected.has(row.key)) count += 1;
  return count;
}
