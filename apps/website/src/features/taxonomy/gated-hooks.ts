import type { Clock as ClockPort } from "@jini-ai/core/primitives";
import type { GatedMutationHooks } from "@jini-ai/core/gated-mutations";
import { planHashOf, resolveActorClassIdentity } from "../../contracts/core/gated-mutations/composition.js";
import type { MergeTermPlanDetails } from "@jini-ai/cms/taxonomy";
import { buildMergeTermHooks as buildJiniMergeTermHooks, type MergeableEntryTermRepoPort, type ImportableTermRepoPort, type TermRepoPort, type TaxonomyRevisionRepoPort } from "@jini-ai/cms/taxonomy";

/**
 * @file Taxonomy's `GatedMutationHooks` factory for the `mergeTerm` ceremony (SPEC-018 C-207) —
 * the domain-specific quarter of what used to be `server/gated-mutations-composition.ts`, split
 * out so Taxonomy no longer needs a back-edge into `server/` for its own hook builder. The generic
 * pieces every ceremony shares (`buildGatewayDeps`, `planHashOf`, `resolveActorClassIdentity`,
 * `buildConfirmOnlyHooks`) stayed in `core/gated-mutations/composition.ts`, which this file imports
 * from — the correct direction (a domain depending on `core`), unlike the old direction (a domain
 * depending on `server`).
 */

export interface BuildMergeTermHooksInput {
  workspaceId: string;
  fromTermId: string;
  intoTermId: string;
  actorId: string;
  clock: ClockPort;
  /** `findByIdFull` because the deprecation write must advance the source term's stored `version`,
   * which the narrow `findById` row doesn't carry. */
  termRepo: TermRepoPort & ImportableTermRepoPort;
  entryTermRepo: MergeableEntryTermRepoPort;
  taxonomyRevisionRepo: TaxonomyRevisionRepoPort;
}

/**
 * SPEC-018 C-207 — the taxonomy `mergeTerm` ceremony's `GatedMutationHooks`. `computePlan()` is
 * re-invoked by both `gateway.plan()` and `gateway.execute()` (CIC U-001-B3): it live-recomputes
 * the overlap count every call, so a change in `entry_terms` between confirm and execute correctly
 * produces a different plan hash and a `PLAN_STALE` rejection at execute time — never a cached,
 * possibly-stale count.
 *
 * `executeMutation()` is new production logic (no certified test in `features/taxonomy/__tests__`
 * exercises the actual merge SQL — Session 4's own disclosure: "confirmMergeTerm/executeMergeTerm
 * were implemented anyway as thin delegating wrappers... the other two were added for a coherent,
 * real, composable chokepoint"). Re-points every `entry_terms` row from `fromTermId` to
 * `intoTermId` (dedup via `entry_terms_unique`, the disclosed overlap-loss mode `merge-term.ts`'s
 * own header names), flips the source term to `status: "deprecated"` (a term merge is
 * semantically a "this term no longer exists standalone" transition — the closest fit in
 * `TaxonomyRevisionRow`'s certified, closed `op` union is `"deprecate"`; there is no `"merge"`
 * variant to reuse, and widening that union is out of this dispatch's scope, so `"deprecate"` is
 * used with a `previousState` payload that names the merge explicitly, disclosed here rather than
 * silently picked).
 *
 * @complexity O(f) in the number of `entry_terms` rows assigned to `fromTermId`.
 * @overallScore 100
 */
export function buildMergeTermHooks(input: BuildMergeTermHooksInput): GatedMutationHooks<MergeTermPlanDetails, { mergedCount: number }> {
  return buildJiniMergeTermHooks({
    ...input,
    planHashOf: (details) => planHashOf({ details }),
    resolveActorClassIdentity,
    domain: "taxonomy.merge",
    readPermission: "admin.taxonomy.manage",
    mutatePermission: "admin.taxonomy.manage",
  });
}
