import { ForbiddenError } from "@jini-ai/cms/core";

import { PluginHookFailedError } from "../../contracts/core/plugin-hook-failed-error.js";

import { PublishContentApplyRowError } from "./apply-errors.js";
import type { PublishContentOutcomeRow } from "./plan-rows.js";
import type { PublishContentHandler } from "./type-registry.js";

/**
 * How {@link applyOneRow} should report a failure raised by `handler.apply()` — the row's downgraded
 * outcome plus its operator-facing reason — or `null` for a genuine failure that must abort the run.
 *
 * Any type may opt one of its own failures into a downgrade by raising
 * {@link PublishContentApplyRowError}; a handler whose errors predate it (`post`/`page`) names them
 * through its own `isApplyConflict`. See `apply-row.ts`'s header for why the two are phrased differently.
 *
 * A permission refusal from `executeCommand` (`ForbiddenError`) is `blocked` for every type: the
 * gateway authorizes before it writes, so the refused command wrote nothing, and one row the
 * operator (or a publishing grant) may not write must not abort everything else.
 *
 * @complexity O(1).
 */
function classifyApplyRowFailure(
  { error, row, handler }: { error: unknown; row: PublishContentOutcomeRow; handler: PublishContentHandler },
  _optional = {}
): { outcome: "conflict" | "blocked"; reason: string } | null {
  if (error instanceof PublishContentApplyRowError) {
    return { outcome: error.rowOutcome, reason: error.message };
  }
  if (error instanceof ForbiddenError) {
    return { outcome: "blocked", reason: error.message };
  }
  if (handler.isApplyConflict?.(error)) {
    return {
      outcome: "conflict",
      reason: `${row.entityType} '${row.entityId}' changed on the destination during apply: ${error.message}`,
    };
  }
  return null;
}

/**
 * Names the item a plugin save hook refused when it aborts a row-by-row run, so the caller can say
 * that the items before it stay saved (`PluginHookFailedError.refusedItemRef`). Any other error, or
 * a failure outside a row, is returned unchanged.
 * @complexity O(1).
 */
export function withRefusedItem({ error, itemKey }: { error: unknown; itemKey: string | null }, _optional = {}): unknown {
  if (!(error instanceof PluginHookFailedError) || itemKey === null) return error;
  return new PluginHookFailedError(error.pluginId, error.message, { cause: error, refusedItemRef: itemKey });
}

export type ApplyRowResult = { row: PublishContentOutcomeRow; changeSetId: string | null; retiredChangeSetId: string | null };

/** The row with its outcome downgraded: nothing was written, so no change set id. */
export function downgradedRow(
  { row, outcome, reason }: { row: PublishContentOutcomeRow; outcome: "conflict" | "blocked"; reason: string },
  _optional = {}
): ApplyRowResult {
  return { row: { ...row, outcome, writes: false, reason }, changeSetId: null, retiredChangeSetId: null };
}

/** The downgrade a failure from `handler.apply()` calls for, or the failure itself rethrown. */
export function downgradeOrRethrow(
  { error, row, handler }: { error: unknown; row: PublishContentOutcomeRow; handler: PublishContentHandler },
  _optional = {}
): ApplyRowResult {
  const downgrade = classifyApplyRowFailure({ error, row, handler });
  if (!downgrade) throw error; // genuine failure — the caller's own try/catch persists a `failed` run row and rethrows.
  return downgradedRow({ row, outcome: downgrade.outcome, reason: downgrade.reason });
}
