import { downgradedRow, downgradeOrRethrow, type ApplyRowResult } from "./apply-failure.js";
import { refreshBaseline, type ApplyRowStep } from "./apply-row.js";
import { publishContentItemIdempotencyKey } from "./idempotency.js";
import type { PublishContentOutcomeRow } from "./plan-rows.js";

type RetiringRow = PublishContentOutcomeRow & { retires: NonNullable<PublishContentOutcomeRow["retires"]> };

export type RetiringRowStep = ApplyRowStep & { readonly row: RetiringRow };

/** publish-overwrite-live-plan §4/S5 — an address-clash overwrite. This row's own entity id must
 *  still be free at the destination (unlike a slug clash, "someone already holds THIS id" here
 *  would mean a genuine create race, not the live holder this row is about to retire), and the
 *  live row row.retires named at plan time must still be exactly what a FRESH planRetire() sees —
 *  closing the same plan/apply window `apply-row.ts`'s header requires for every other outcome, just
 *  applied to a target that lives outside this row's own id. Both checks run BEFORE either write,
 *  so a stale retire target never reaches handler.retire()/apply() at all. */
async function validateRetire({ step }: { step: RetiringRowStep }, _optional: Record<string, never> = {}): Promise<ApplyRowResult | null> {
  const { row, entity, handler, current } = step;
  if (current !== null) {
    return downgradedRow({ row, outcome: "conflict", reason: `${row.entityType} '${row.entityId}' was created on the destination between plan and apply` });
  }
  if (!handler.planRetire || !handler.retire) {
    return downgradedRow({
      row,
      outcome: "blocked",
      reason: `internal inconsistency: no planRetire()/retire() on the ${row.entityType} handler for a retire-offered row at apply time`,
    });
  }
  const freshTarget = await handler.planRetire({ entity });
  if (!freshTarget || freshTarget.entityId !== row.retires.entityId || freshTarget.hash !== row.retires.hash) {
    return downgradedRow({ row, outcome: "conflict", reason: `the live ${row.entityType} at this address changed after this run's plan was built` });
  }
  return null;
}

export async function applyRetiringRow({ step }: { step: RetiringRowStep }, _optional: Record<string, never> = {}): Promise<ApplyRowResult> {
  const { row, ctx, key, entity, handler } = step;
  const refused = await validateRetire({ step });
  if (refused) return refused;
  const itemIdempotencyKey = publishContentItemIdempotencyKey({
    workspaceId: ctx.workspaceId,
    sourcePrincipalId: ctx.sourcePrincipalId,
    entity,
  });
  let retireResult: { changeSetId: string; undo(): Promise<void> } | undefined;
  let changeSetId: string;
  try {
    if (!handler.retire) throw new Error("Publish content handler has no retire operation");
    retireResult = await handler.retire({
      target: row.retires,
      principalId: ctx.principalId,
      // Scoped to this run: `undo()` restores forward and leaves the retire's change set (and its
      // key) in the ledger, so a key shared across runs would make every retry after an undone
      // retire fail as "already executed".
      idempotencyKey: `${itemIdempotencyKey}:retire:${ctx.runId}`,
    });
    ({ changeSetId } = await handler.apply({
      entity,
      expectedVersion: undefined, // current === null (checked above) — this is always a create.
      principalId: ctx.principalId, // always the operator — see `apply-row.ts`'s header.
      idempotencyKey: itemIdempotencyKey,
    }));
  } catch (error) {
    await undoRetire({ error, retireResult, row });
    return downgradeOrRethrow({ error, row, handler });
  }
  // Both writes landed. A failure from here on is accounting only, so it fails the run (keeping
  // `content_applied` and both change-set ids) instead of undoing anything.
  await ctx.recordContentApplied({ itemKey: key, changeSetId, retiredChangeSetId: retireResult.changeSetId });
  await refreshBaseline({ row, entity, ctx });
  return { row, changeSetId, retiredChangeSetId: retireResult.changeSetId };
}

async function undoRetire({ error, retireResult, row }: {
  error: unknown; retireResult: { undo(): Promise<void> } | undefined;
  row: PublishContentOutcomeRow & { retires: NonNullable<PublishContentOutcomeRow["retires"]> };
}, _optional: Record<string, never> = {}): Promise<void> {
  // The retire already landed but the create it was clearing the address FOR did not — put the
  // holder back rather than leaving it retired with nothing to show for it (this handler's own
  // `retire()` doc: the apply loop is the one caller besides its own gateway rollback that calls
  // `undo()` directly). Only here: once the create has landed, the new row holds the address and
  // putting the holder back would collide with it.
  if (retireResult) {
    try {
      await retireResult.undo();
    } catch (undoError) {
      const cause = error instanceof Error ? error.message : String(error);
      const undoCause = undoError instanceof Error ? undoError.message : String(undoError);
      throw new Error(
        `${row.entityType} '${row.entityId}' was not created (${cause}), and putting the retired ` +
        `${row.retires.entityType} '${row.retires.entityId}' back failed too (${undoCause}) — restore it from Trash`
      );
    }
  }
}
