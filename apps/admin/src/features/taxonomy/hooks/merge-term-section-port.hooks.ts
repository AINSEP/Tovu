import type { GatedConfirmResult, GatedPlanResult, MergeTermPlanDetails } from "../../../lib/api";

/**
 * @file What `useMergeTermSection` needs from the outside world, as an interface rather than a
 * direct `lib/api` import.
 *
 * A separate port from `taxonomy-port.hooks.ts` rather than folding in: the merge ceremony's three
 * routes (`planMergeTerm`/`confirmMergeTerm`/`executeMergeTerm`) share no method with
 * `TaxonomyPort`'s four (`listTaxonomies`/`deleteTerm`/`deleteTaxonomy`/`renameTerm`) — narrowing
 * to what this hook actually consumes, per `page-editor-port.hooks.ts`'s "narrowing here is not a
 * shared contract, it is this hook's own consumption" reasoning, rather than forcing a shared
 * shape neither hook's contract needs.
 */
export interface MergeTermSectionPort {
  planMergeTerm(target: { fromTermId: string; intoTermId: string }): Promise<GatedPlanResult<MergeTermPlanDetails>>;
  confirmMergeTerm(target: { fromTermId: string; planId: string; planHash: string }): Promise<GatedConfirmResult>;
  executeMergeTerm(target: {
    fromTermId: string;
    intoTermId: string;
    confirmationToken: string;
  }): Promise<{ mergedCount: number }>;
}
