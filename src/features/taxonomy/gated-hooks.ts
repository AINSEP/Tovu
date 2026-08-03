import type { ClockPort } from "../../core/ports";
import type { GatedMutationHooks } from "../../core/gated-mutations/gateway";
import { planHashOf, resolveActorClassIdentity } from "../../core/gated-mutations/composition";
import type { MergeTermPlanDetails } from "./merge-term";
import type { TermRepoPort, TaxonomyRevisionRepoPort } from "./write-service";

/**
 * @file Taxonomy's `GatedMutationHooks` factory for the `mergeTerm` ceremony (SPEC-018 C-207) —
 * the domain-specific quarter of what used to be `server/gated-mutations-composition.ts`, split
 * out so Taxonomy no longer needs a back-edge into `server/` for its own hook builder. The generic
 * pieces every ceremony shares (`buildGatewayDeps`, `planHashOf`, `resolveActorClassIdentity`,
 * `buildConfirmOnlyHooks`) stayed in `core/gated-mutations/composition.ts`, which this file imports
 * from — the correct direction (a domain depending on `core`), unlike the old direction (a domain
 * depending on `server`).
 */

/** Additive capability beyond the certified `EntryTermRepoPort` (which has no by-term enumeration
 * method at all) — implemented on both `InMemoryEntryTermRepo` and `SqliteEntryTermRepo`. */
export interface MergeableEntryTermRepoPort {
  countOverlap(params: { fromTermId: string; intoTermId: string }): Promise<number>;
  repointTerm(params: { fromTermId: string; intoTermId: string }): Promise<{ repointedCount: number }>;
}

export interface BuildMergeTermHooksInput {
  workspaceId: string;
  fromTermId: string;
  intoTermId: string;
  actorId: string;
  clock: ClockPort;
  termRepo: TermRepoPort;
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
  return {
    domain: "taxonomy.merge",
    readPermission: "admin.taxonomy.manage",
    mutatePermission: "admin.taxonomy.manage",
    scopeId: input.workspaceId,
    computePlan: async () => {
      const overlappingContentCount = await input.entryTermRepo.countOverlap({ fromTermId: input.fromTermId, intoTermId: input.intoTermId });
      const details: MergeTermPlanDetails = {
        fromTermId: input.fromTermId,
        intoTermId: input.intoTermId,
        overlapLossDisclosed: overlappingContentCount > 0,
        overlappingContentCount,
      };
      return { planHash: planHashOf(details), details };
    },
    executeMutation: async () => {
      const { repointedCount } = await input.entryTermRepo.repointTerm({ fromTermId: input.fromTermId, intoTermId: input.intoTermId });

      const fromTerm = await input.termRepo.findById(input.fromTermId);
      if (fromTerm) {
        await input.termRepo.update({
          id: fromTerm.id,
          taxonomyId: fromTerm.taxonomyId,
          parentId: null,
          name: fromTerm.name ?? input.fromTermId,
          status: "deprecated",
          updatedAt: input.clock.nowIso(),
          version: 1,
        });
        await input.taxonomyRevisionRepo.insert({
          taxonomyId: fromTerm.taxonomyId,
          op: "deprecate",
          previousState: { mergedInto: input.intoTermId, fromTermId: input.fromTermId, repointedCount },
          actorId: input.actorId,
          recordedAt: input.clock.nowIso(),
        });
      }

      return { mergedCount: repointedCount };
    },
    resolveActorClassIdentity,
  };
}
