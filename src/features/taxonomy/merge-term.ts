/**
 * @file `mergeTerm`'s domain half — re-exported from `@jini-ai/cms/taxonomy`.
 *
 * Merge is destructive and can silently lose pre-merge assignment history for content already
 * assigned to both terms, so it alone of every taxonomy mutation gets a plan/confirm/execute
 * ceremony. What ported is this domain's own wrapping logic: the structural self-merge guard and
 * the plan's overlap-loss disclosure.
 *
 * The ceremony itself did NOT port. `core/gated-mutations` is this host's kernel, and these
 * functions already took `gatewayPlan`/`gatewayConfirm`/`gatewayExecute` as injected closures
 * rather than importing it — so the package needs no gateway at all, and this host keeps binding
 * those closures to its own. That pre-existing injection is the reason this file had zero imports
 * and could move as-is.
 */
export {
  SameTermMergeError,
  planMergeTerm,
  confirmMergeTerm,
  executeMergeTerm,
} from "@jini-ai/cms/taxonomy";

export type {
  MergeTermPlanDetails,
  PlanMergeTermRequired,
  ConfirmMergeTermRequired,
  ExecuteMergeTermRequired,
} from "@jini-ai/cms/taxonomy";
