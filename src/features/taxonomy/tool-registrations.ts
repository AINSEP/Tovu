/**
 * @file Taxonomy's half of ADR-049 Decision 4 (SPEC-018/ADR-044): maps `agent-tools.ts`'s 7 catalog
 * entries onto `write-service.ts`'s ordinary mutations, `list.ts`'s read, and `merge-term.ts`'s
 * plan-only slice of the gated-mutation ceremony, as `ToolRegistration`s.
 *
 * Scope: 6 of 7 catalog entries are wired. `taxonomy_execute_merge_term` is declared unwired — see
 * `agent-tools.ts`'s own header for the full `mergeTerm` safety analysis (destructive, agent-cannot-
 * confirm by the gateway's own actor-class rule, no confirmation transport exists anyway).
 *
 * Authorization shape, mixed and deliberately so: `createTaxonomy`/`createTerm`/`renameTerm`/
 * `assignTerms` each call `authorizeTaxonomyManage` (`admin.taxonomy.manage`) as their own first line
 * (confirmed directly against `write-service.ts`), so those four handlers must NOT re-check
 * (ADR-021 §2 "one evaluator"). `listTaxonomiesWithTerms` (`list.ts`) has no such call of its own —
 * its file header says so explicitly ("no authorization of its own") — so `taxonomy_list`'s handler
 * performs that identical inline check itself, mirroring `taxonomy/list.ts`'s admin route.
 * `taxonomy_plan_merge_term` is a THIRD shape: `core/gated-mutations/gateway.ts`'s `plan()` itself
 * calls `authorize()` unconditionally before `hooks.computePlan()` ever runs (verified directly
 * against that function's body) — mirrors `features/database/tool-registrations.ts`'s identical
 * `database_plan_migrate_forward` precedent, including reusing this domain's own
 * `gated-hooks.ts`'s `buildMergeTermHooks` directly.
 */
import {
  type AuthorizeFn,
  type OutboxPort,
  AGENT_TOOL_PRINCIPAL_KIND,
  buildDomainRegistrations,
  indexCatalogById,
  optionalString,
  requireInputRecord,
  requireString,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";
import {
  plan as gatewayPlan,
  type GatedMutationHooks,
  type GatewayDeps,
} from "../../contracts/core/gated-mutations/gateway.js";
import { registerToolContributor } from "#src/assistant/index";
import type { PostRepoPort } from "../post/index.js";
import { buildMergeTermHooks, type MergeableEntryTermRepoPort } from "./gated-hooks.js";
import { taxonomyAgentToolCatalog } from "./agent-tools.js";
import {
  createPostBackedContentLookup,
  listTaxonomiesWithTerms,
  planMergeTerm,
  toTaxonomyOutbox,
  assignTerms,
  createTaxonomy,
  createTerm,
  renameTerm,
  type TaxonomyListPort,
  type TermListPort,
  type EntryTermRepoPort,
  type TaxonomyRepoPort,
  type TaxonomyRevisionRepoPort,
  type TermRepoPort,
  type WriteServiceDeps,
} from "./index.js";

const CATALOG_BY_ID = indexCatalogById(taxonomyAgentToolCatalog);

/**
 * The exact slice of the route-deps bag Taxonomy's tool handlers read. Declared structurally
 * (rather than importing `server/routes/types`'s `RouteDeps`) so this module carries no back-edge
 * into the composition root for the `RouteDeps` god type. This domain's `buildMergeTermHooks`/
 * `MergeableEntryTermRepoPort` now live in this module's own `gated-hooks.ts` (moved out of
 * `server/gated-mutations-composition.ts`, closing the back-edge into `server/` that file's import
 * previously required), so `server/routes/*` satisfies this interface structurally by passing its
 * existing `RouteDeps` object; nothing there changes.
 */
export interface TaxonomyToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  clock: { nowIso(): string };
  idGen: { newId(): string };
  taxonomyRepo: TaxonomyRepoPort & TaxonomyListPort;
  termRepo: TermRepoPort & TermListPort;
  entryTermRepo: EntryTermRepoPort & MergeableEntryTermRepoPort;
  taxonomyRevisionRepo: TaxonomyRevisionRepoPort;
  /** Passed wholesale to `repo.memory.ts`'s `toTaxonomyOutbox` adapter, which reads this field plus
   * `clock`/`idGen` off the same bag rather than taking a pre-built outbox — see that function's own
   * doc comment. */
  outbox: OutboxPort;
  postRepo: PostRepoPort;
  gatedMutations: { gatewayDeps: GatewayDeps };
  /** See `RouteDeps.stampWatermark`'s doc comment (`server/routes/types.ts`) — same field, this
   * domain's tool-calling deps bag is structurally satisfied by the same composition-root object
   * the admin HTTP routes use. */
  stampWatermark: () => void;
}

/** Taxonomy catalog entries this pass does not wire, and why — see `agent-tools.ts`'s own header
 * for the full `mergeTerm` safety analysis. */
const UNWIRED_TAXONOMY_TOOL_IDS = new Set([
  // EXCLUDED BY DESIGN: token-gated, and `assertToolIsWirable` refuses to build it anyway
  // (`actorClassRule: 'confirmer-must-equal-own-delegatedBy'` has no confirmation transport yet).
  // `core/gated-mutations/gateway.ts`'s own confirm() step additionally refuses an agent principal
  // unconditionally, before any permission check even runs — so this exclusion is enforced twice
  // over, not just by this codebase's own policy choice.
  "taxonomy_execute_merge_term",
]);

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration — and note that `taxonomy_execute_merge_term` appears NOWHERE here,
 * which is itself the strongest of the guards: an unclassified id cannot be wired at all.
 */
export const taxonomyDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> listTaxonomiesWithTerms (list.ts): taxonomies.list() + terms.listByTaxonomy() reads only.
  ["taxonomy_list", "none"],
  // -> createTaxonomy (write-service.ts): taxonomies.insert + revisions.insert in effect.
  ["taxonomy_create_taxonomy", "mutates-durable-state"],
  // -> createTerm (write-service.ts): terms.insert + revisions.insert.
  ["taxonomy_create_term", "mutates-durable-state"],
  // -> renameTerm (write-service.ts): terms.update + revisions.insert.
  ["taxonomy_rename_term", "mutates-durable-state"],
  // -> assignTerms (write-service.ts): entryTerms.upsert per termId (INV-05: no revision row, see
  //    that function's own doc comment for the disclosed narrowing this implements).
  ["taxonomy_assign_terms", "mutates-durable-state"],
  // -> gateway.ts's plan() via buildMergeTermHooks: authorizes, then recomputes a plan and returns
  //    it — verified directly against plan()'s own body, which persists nothing (AC-10).
  ["taxonomy_plan_merge_term", "none"],
]);

/** Shared dependency bag for `write-service.ts` calls — every mutating handler here takes this
 * identical shape, mirroring each admin route's own inline construction. */
function taxonomyDeps(routeDeps: TaxonomyToolDeps): WriteServiceDeps {
  return {
    authorize: (params) => routeDeps.authorize({ ...params, workspaceId: routeDeps.workspaceId }),
    clock: routeDeps.clock,
    idGen: routeDeps.idGen,
    taxonomies: routeDeps.taxonomyRepo,
    terms: routeDeps.termRepo,
    entryTerms: routeDeps.entryTermRepo,
    revisions: routeDeps.taxonomyRevisionRepo,
    stampWatermark: routeDeps.stampWatermark,
    outbox: toTaxonomyOutbox(routeDeps),
    workspaceId: routeDeps.workspaceId,
    contentLookup: createPostBackedContentLookup({ postRepo: routeDeps.postRepo, workspaceId: routeDeps.workspaceId }),
  };
}

export function buildTaxonomyRegistrations(routeDeps: TaxonomyToolDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    taxonomy_list: async (ctx) => {
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "admin.taxonomy.manage", entityType: "taxonomy" });
      return listTaxonomiesWithTerms({ taxonomies: routeDeps.taxonomyRepo, terms: routeDeps.termRepo });
    },

    taxonomy_create_taxonomy: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const taxonomy = await createTaxonomy({
        deps: taxonomyDeps(routeDeps),
        principalId: ctx.principal.id,
        name: requireString(input, "name"),
        hierarchical: input.hierarchical === true,
      });
      return { taxonomy };
    },

    taxonomy_create_term: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const term = await createTerm({
        deps: taxonomyDeps(routeDeps),
        principalId: ctx.principal.id,
        taxonomyId: requireString(input, "taxonomyId"),
        name: requireString(input, "name"),
        parentId: optionalString(input, "parentId") ?? null,
      });
      return { term };
    },

    taxonomy_rename_term: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const term = await renameTerm({
        deps: taxonomyDeps(routeDeps),
        principalId: ctx.principal.id,
        termId: requireString(input, "termId"),
        newName: requireString(input, "newName"),
      });
      return { term };
    },

    taxonomy_assign_terms: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const contentType = requireString(input, "contentType");
      const contentId = requireString(input, "contentId");
      if (!Array.isArray(input.termIds) || !input.termIds.every((id: unknown) => typeof id === "string")) {
        throw new Error("'termIds' (string array) is required");
      }
      const termIds = input.termIds as string[];

      await assignTerms({ deps: taxonomyDeps(routeDeps), principalId: ctx.principal.id, contentType, contentId, termIds });
      return { contentType, contentId, assignedTermIds: termIds };
    },

    taxonomy_plan_merge_term: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const fromTermId = requireString(input, "fromTermId");
      const intoTermId = requireString(input, "intoTermId");

      const hooks = buildMergeTermHooks({
        workspaceId: routeDeps.workspaceId,
        fromTermId,
        intoTermId,
        actorId: ctx.principal.id,
        clock: routeDeps.clock,
        termRepo: routeDeps.termRepo,
        entryTermRepo: routeDeps.entryTermRepo,
        taxonomyRevisionRepo: routeDeps.taxonomyRevisionRepo,
      });

      // No explicit pre-check here: `gateway.ts`'s plan() calls authorize() unconditionally, BEFORE
      // hooks.computePlan() ever runs (see `taxonomyDerivedRisk`'s comment for this tool). Adding a
      // second check here would be the duplicate evaluator ADR-021 §2 forbids.
      return planMergeTerm({
        principalId: ctx.principal.id,
        principalKind: AGENT_TOOL_PRINCIPAL_KIND,
        fromTermId,
        intoTermId,
        computeOverlap: async () => ({ overlappingContentCount: await routeDeps.entryTermRepo.countOverlap({ fromTermId, intoTermId }) }),
        gatewayPlan: async () =>
          gatewayPlan({
            deps: routeDeps.gatedMutations.gatewayDeps,
            principalId: ctx.principal.id,
            principalKind: AGENT_TOOL_PRINCIPAL_KIND,
            hooks: hooks as unknown as GatedMutationHooks<unknown, unknown>,
          }),
      });
    },
  };

  return buildDomainRegistrations({
    domain: "taxonomy",
    catalogModule: "features/taxonomy/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: taxonomyDerivedRisk,
    unwiredToolIds: UNWIRED_TAXONOMY_TOOL_IDS,
  });
}

/**
 * Contributes Taxonomy's AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildTaxonomyRegistrations`/
 * `taxonomyDerivedRisk` by name; this is the seam that replaced it (2026-08-17, Stage 2 of the
 * rollout — no sibling domain still statically wired through `assistant` imports `taxonomy`, so this
 * one-directional `taxonomy -> assistant` call closes no new cycle).
 */
export function contributeTaxonomyTools(): void {
  registerToolContributor({ domain: "taxonomy", build: buildTaxonomyRegistrations, risk: taxonomyDerivedRisk });
}
