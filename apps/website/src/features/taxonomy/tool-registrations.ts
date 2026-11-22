import { toolMetadata } from '../../contracts/core/tool-metadata/taxonomy.js';
import { contentReadVocabulary } from "../../contracts/core/tool-metadata/content-read.js";
import { type Clock } from "@jini-ai/core/primitives";
/**
 * @file Taxonomy's half of ADR-049 Decision 4 (SPEC-018/ADR-044), the host binding: the ten
 * handlers and the authored risk map live in `@jini-ai/cms/taxonomy` (`buildTaxonomyToolRegistrations`).
 * This file supplies what is Tovu's: the catalog (`./agent-tools.ts` extends the shared one with two
 * read tools), the search vocabulary and approval policy (`toolMetadata`), the gateway bound to
 * Tovu's token policy and storage ports, the confirm dialog's wording and transport
 * (`humanConfirmedToolHandler`), the slug function (a saved format), the content-type policy and the
 * default surface store.
 *
 * `taxonomy_execute_merge_term` (2026-09-24) asks the human in chat first: a merge deletes the source
 * term's assignments with no Trash or undo. On the human's click it confirms as that human and
 * executes as the agent acting for them — see `contracts/core/human-confirm.ts`'s
 * `humanConfirmedToolHandler`.
 */
import { withToolMetadata, type ToolContributor, type ToolRegistration } from "@jini-ai/core";
import { buildTaxonomyToolRegistrations, taxonomyDerivedRisk, type TaxonomyPackageToolDeps } from "@jini-ai/cms/taxonomy";
import { type AuthorizeFn, type OutboxPort, type TransactionalRepoPort } from "@jini-ai/core/contracts/events";
import {
  confirm as gatewayConfirm,
  execute as gatewayExecute,
  plan as gatewayPlan,
  type GatewayDeps,
} from "../../contracts/core/gated-mutations/gateway.js";
import { humanConfirmedToolHandler, refuseUnexpectedKeys } from "#src/contracts/core/human-confirm";
import { createSurfaceExchangeStore, type AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { toSlug } from "../../platform/html/slug.js";
import type { PostRepoPort } from "../post/index.js";
import { authorizeContentEdit, createContentTargetPorts, createLiveCollectionTermPolicy } from "./content-targets.js";
import type { CollectionOwnerLookupPort, MergeableEntryTermRepoPort } from "@jini-ai/cms/taxonomy";
import { buildMergeTermHooks } from "./gated-hooks.js";
import { taxonomyAgentToolCatalog } from "./agent-tools.js";
import {
  type EntryRecordLookupPort,
} from "./index.js";
import type { TaxonomyListPort, TermListPort, EntryTermRepoPort, TaxonomyRepoPort, TaxonomyRevisionRepoPort, TermRepoPort, ImportableTermRepoPort, UnassignableEntryTermRepoPort } from "@jini-ai/cms/taxonomy";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/platform/system";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";

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
  clock: Clock;
  idGen: { newId(): string };
  taxonomyRepo: TaxonomyRepoPort & TaxonomyListPort & TransactionalRepoPort;
  termRepo: TermRepoPort & TermListPort & ImportableTermRepoPort;
  entryTermRepo: EntryTermRepoPort & MergeableEntryTermRepoPort & UnassignableEntryTermRepoPort & {
    listForContent(input: { contentType: string; contentId: string }): Promise<ReadonlyArray<{ termId: string }>>;
  };
  taxonomyRevisionRepo: TaxonomyRevisionRepoPort;
  /** Passed wholesale to `repo.memory.ts`'s `toTaxonomyOutbox` adapter, which reads this field plus
   * `clock`/`idGen` off the same bag rather than taking a pre-built outbox — see that function's own
   * doc comment. */
  outbox: OutboxPort;
  postRepo: PostRepoPort;
  /** With `contentTypeRepo`, lets the tagging tools reach collection entries — the same
   * `createContentTargetPorts` the admin assign/unassign routes use. */
  entryRepo: EntryRecordLookupPort;
  contentTypeRepo: CollectionOwnerLookupPort;
  gatedMutations: { gatewayDeps: GatewayDeps };
  /** See `RouteDeps.stampWatermark`'s doc comment (`server/routes/types.ts`) — same field, this
   * domain's tool-calling deps bag is structurally satisfied by the same composition-root object
   * the admin HTTP routes use. */
  stampWatermark: () => Promise<void> | void;
}
const MERGE_TOOL_ID = "taxonomy_execute_merge_term";

/**
 * The merge's human confirmation: the dialog's wording is Tovu's, and the allow-list scan
 * (`assistant/__tests__/mcp-ui-allowlist-completeness.test.ts`) reads its tool id from this
 * `dialog:` spec. Plans as the agent, asks the human, then the package confirms as the human and
 * executes as the agent.
 */
const confirmedMergeHandler: TaxonomyPackageToolDeps["mergeConfirmedHandler"] = (surfaces, { flag, prepare, run }) =>
  humanConfirmedToolHandler(surfaces, {
    flag,
    prepare,
    dialog: ({ plan, fromName, intoName }) => ({
      toolId: MERGE_TOOL_ID,
      errorCode: "TAXONOMY",
      title: `Merge ${fromName} into ${intoName}?`,
      details: [
        { label: "Merge away", value: fromName },
        { label: "Keep", value: intoName },
        ...(plan.details.overlappingContentCount > 0
          ? [{ label: "Tagged with both", value: String(plan.details.overlappingContentCount) }]
          : []),
      ],
      warning: `Everything tagged ${fromName} is re-tagged ${intoName}, and ${fromName} is retired. This can't be undone.`,
      danger: true,
      confirmLabel: "Merge terms",
    }),
    run,
  });

/**
 * The package deps over the host's route deps. Every field is a getter so a field the composition
 * root assigns after this registry is built (the authorizer, the repos) is read at call time, as
 * the handlers did when they read the route deps directly.
 */
function toPackageDeps({ routeDeps }: { routeDeps: TaxonomyToolDeps }, _optional = {}): TaxonomyPackageToolDeps {
  return {
    get authorize() { return routeDeps.authorize; },
    get workspaceId() { return routeDeps.workspaceId; },
    get clock() { return routeDeps.clock; },
    get idGen() { return routeDeps.idGen; },
    get taxonomyRepo() { return routeDeps.taxonomyRepo; },
    get termRepo() { return routeDeps.termRepo; },
    get entryTermRepo() { return routeDeps.entryTermRepo; },
    get taxonomyRevisionRepo() { return routeDeps.taxonomyRevisionRepo; },
    get outbox() { return routeDeps.outbox; },
    get stampWatermark() { return routeDeps.stampWatermark; },
    contentTargetPorts: () => createContentTargetPorts(routeDeps),
    collectionTermPolicy: () => createLiveCollectionTermPolicy(routeDeps),
    authorizeContentEdit: ({ principalId, contentType }) => authorizeContentEdit({ deps: routeDeps, principalId, contentType }),
    mergeTermHooks: ({ fromTermId, intoTermId, actorId }) =>
      buildMergeTermHooks({
        workspaceId: routeDeps.workspaceId,
        fromTermId,
        intoTermId,
        actorId,
        clock: routeDeps.clock,
        termRepo: routeDeps.termRepo,
        entryTermRepo: routeDeps.entryTermRepo,
        taxonomyRevisionRepo: routeDeps.taxonomyRevisionRepo,
      }),
    mergeGateway: {
      plan: (required) => gatewayPlan({ deps: routeDeps.gatedMutations.gatewayDeps, ...required }),
      confirm: (required) => gatewayConfirm({ deps: routeDeps.gatedMutations.gatewayDeps, ...required }),
      execute: (required) => gatewayExecute({ deps: routeDeps.gatedMutations.gatewayDeps, ...required }),
    },
    mergeConfirmedHandler: confirmedMergeHandler,
    refuseUnexpectedKeys,
    toSlug,
  };
}

export function buildTaxonomyRegistrations(
  routeDeps: TaxonomyToolDeps,
  surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) },
): ToolRegistration[] {
  return withToolMetadata({ registrations: buildTaxonomyToolRegistrations({ deps: toPackageDeps({ routeDeps }), surfaces, catalog: taxonomyAgentToolCatalog }, { hostReads: contentReadVocabulary }), metadata: toolMetadata });
}

/**
 * Contributes Taxonomy's AI tools to the assistant's catalog — called once by
 * `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildTaxonomyRegistrations`/
 * `taxonomyDerivedRisk` by name; this is the seam that replaced it (2026-08-17, Stage 2 of the
 * rollout — no sibling domain still statically wired through `assistant` imports `taxonomy`, so this
 * one-directional `taxonomy -> assistant` call closes no new cycle).
 */
export function contributeTaxonomyTools(): ToolContributor<TaxonomyToolDeps, AssistantSurfaceDeps> {
  return { domain: "taxonomy", build: buildTaxonomyRegistrations, risk: taxonomyDerivedRisk };
}
