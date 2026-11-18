import { toolMetadata } from '../../contracts/core/tool-metadata/widgets.js';
/**
 * @file Widgets' half of ADR-049 Decision 4 (SPEC-043/ADR-047): maps `agent-tools.ts`'s twelve
 * catalog entries onto the read/write/region/embed services, as `ToolRegistration`s. The entire
 * catalog is wired — `purgeWidgetInstance` is deliberately absent from the catalog rather than
 * present-but-unwired; see `widgets/agent-tools.ts`'s own header.
 *
 * Authorization shape, which is mixed here and deliberately so: every mutating handler's underlying
 * function (`createWidgetInstance`, `updateWidgetInstance`, `trashWidgetInstance`,
 * `mutateWidgetAreaPlacements`, `insertWidgetEmbed`, `removeWidgetEmbed`, `reorderWidgetEmbeds`)
 * calls `requireWidgetPermission` as its own first line (REQ-40/41 — the SAME gate for a human
 * route or an AI tool route), so those handlers must NOT re-check. The 3 tools with no such
 * service-layer wrapper to delegate to — `widgets_list_regions`/`widgets_get_region` (reads) and
 * `widgets_bind_region`, whose own `bindWidgetArea` is deliberately gate-free, being designed to
 * double as boot/theme-activation seeding — call the SAME `requireWidgetPermission` helper inline
 * here instead. One evaluator either way, just relocated. This domain calls the widgets-specific
 * helper rather than the kit's generic `requireToolPermission` precisely so both paths reach the
 * identical gate function.
 */
import { buildDomainRegistrations, indexCatalogById, withSchemaOnRejection, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
// `ToolInputError` specifically — see `features/post/tool-registrations.ts`'s identical import for
// why: the marker `@jini-ai/daemon`'s `ToolExecutor` reads to classify a rejection 400 rather than
// redacting it into a message-stripped 500.
import { ToolInputError } from "@jini-ai/core";
import type { ToolContributor } from "@jini-ai/core";
import { createSurfaceExchangeStore, type AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { withPluginHookRefusals } from "../../contracts/core/plugin-hook-failed-error.js";
import { widgetsAgentToolCatalog } from "./agent-tools.js";
import { buildWidgetsDeps, buildWidgetsRegionDeps, type WidgetsRouteDeps } from "./deps.js";
import { WidgetAreaConflictError, WidgetAreaNotFoundError, WidgetConfigValidationError, WidgetEmbedGuardrailError, WidgetEmbedHostNotFoundError, WidgetEmbedHostUnsupportedError, WidgetEmbedPlacementNotFoundError, WidgetForbiddenError, WidgetInstanceNotFoundError, WidgetTypeUnregisteredError, WidgetVersionConflictError, WidgetEmbedReorderCountMismatchError } from "@jini-ai/cms/widgets";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/platform/system";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import type { WidgetsPackageToolDeps, WidgetsSchemaGuard } from "./tool-handlers.types.js";
import { widgetsGetInstanceHandler, widgetsCreateInstanceHandler, widgetsListInstancesHandler, widgetsTrashInstanceHandler, widgetsUpdateInstanceHandler } from "./tool-handlers.instances.js";
import type { WidgetsHandlerArgs } from "./tool-handlers.types.js";
import { widgetsBindRegionHandler, widgetsGetRegionHandler, widgetsInsertEmbedHandler, widgetsListRegionsHandler, widgetsRemoveEmbedHandler, widgetsReorderEmbedsHandler, widgetsSetRegionPlacementsHandler } from "./tool-handlers.areas.js";


const MUTATES_DURABLE_STATE = "mutates-durable-state";


const CATALOG_BY_ID = indexCatalogById({ catalog: widgetsAgentToolCatalog });

/** Re-exported for this file's existing callers/tests, now sourced from the shared composer
 * (`./deps.ts`) instead of being declared locally — see that file's header for why one composer
 * replaces what used to be this interface's own copy plus `server/routes/admin/widgets/
 * agent-tools.ts`'s separately-written, identically-shaped one. */
export type WidgetsToolDeps = WidgetsRouteDeps;

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration.
 */
export const widgetsDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> listWidgetInstances (Jini/packages/cms/src/widgets/read-service.ts): entryRepo.listByWorkspace only, no write.
  ["widgets_list_instances", "none"],
  // -> getWidgetInstance (Jini/packages/cms/src/widgets/read-service.ts) + entryRefsRepo.findByTarget: reads only.
  ["widgets_get_instance", "none"],
  // -> widgetBindingRepo.listByWorkspace + entryRepo.findById: reads only.
  ["widgets_list_regions", "none"],
  // -> widgetBindingRepo.findByRegion + entryRepo.findById (+ per-placement resolution): reads only.
  ["widgets_get_region", "none"],
  // -> createWidgetInstance (Jini/packages/cms/src/widgets/write-service.ts): createEntry + entry_refs extraction in one tx.
  ["widgets_create_instance", MUTATES_DURABLE_STATE],
  // -> updateWidgetInstance (Jini/packages/cms/src/widgets/write-service.ts): updateEntry + entry_refs extraction.
  ["widgets_update_instance", MUTATES_DURABLE_STATE],
  // -> trashWidgetInstance (Jini/packages/cms/src/widgets/write-service.ts): moves it to the Trash (restorable). Never a purge:
  //    a permanent delete exists only as the Trash screen's purge.
  ["widgets_trash_instance", MUTATES_DURABLE_STATE],
  // -> bindWidgetArea (Jini/packages/cms/src/widgets/region-area-service.ts): createEntry (maybe) + bindingRepo.upsert.
  ["widgets_bind_region", MUTATES_DURABLE_STATE],
  // -> mutateWidgetAreaPlacements (Jini/packages/cms/src/widgets/region-area-service.ts): updateEntry + bindingRepo.upsert.
  ["widgets_set_region_placements", MUTATES_DURABLE_STATE],
  // -> insertWidgetEmbed (Jini/packages/cms/src/widgets/embed-service.ts): updateEntry (bodyJson) + entry_refs extraction.
  ["widgets_insert_embed", MUTATES_DURABLE_STATE],
  // -> removeWidgetEmbed (Jini/packages/cms/src/widgets/embed-service.ts): updateEntry (bodyJson) + entry_refs extraction.
  ["widgets_remove_embed", MUTATES_DURABLE_STATE],
  // -> reorderWidgetEmbeds (Jini/packages/cms/src/widgets/embed-service.ts): updateEntry (bodyJson) + entry_refs extraction.
  ["widgets_reorder_embeds", MUTATES_DURABLE_STATE],
]);

/**
 * The Widgets rejections worth decorating with the published schema: config/type/embed SHAPE
 * problems only. A `WidgetForbiddenError` or `WidgetReferencedError` is not a shape problem
 * retrying the SAME input would ever resolve.
 */
function isWidgetsShapeRejection({ error }: { error: unknown }, _optional = {}): boolean {
  return (
    error instanceof WidgetConfigValidationError ||
    error instanceof WidgetTypeUnregisteredError ||
    error instanceof WidgetEmbedGuardrailError ||
    error instanceof WidgetEmbedReorderCountMismatchError
  );
}

/**
 * Re-classifies every typed not-found/conflict/forbidden domain error this handler map can throw
 * as a `ToolInputError` on its way to the model, and passes anything else through untouched.
 *
 * `WidgetForbiddenError` used to be the one class explicitly passed through untouched here, on the
 * theory that a `403` isn't caller-input. That left the model unable to tell "you lack permission"
 * from "the server broke" — both surfaced as the same redacted `INTERNAL_ERROR` — and the owner's
 * 2026-09-15 ruling ("always say the real reason ... so I can improve it or people can see the
 * errors") overrides that theory: the message already names the missing permission and the reason
 * (`requireWidgetPermission` in `Jini/packages/cms/src/widgets/authorize-helper.ts` builds it), so there is real, actionable
 * signal here worth letting through, same as every other case below.
 *
 * Same reasoning as `post/tool-registrations.ts`'s `toModelFacingUpdateError` (lines 222-244
 * there): `@jini-ai/daemon`'s `ToolExecutor` tags any rejection that is not `instanceof
 * ToolInputError` as `errorKind: 'internal'`, and the delegated-tool-call transport SEC-005-
 * redacts an `'internal'` failure into a message-stripped `INTERNAL_ERROR` 500. Unlike Posts,
 * which reclassifies its one conflict type at each call site, this wraps the WHOLE handler map
 * once (see the `buildDomainRegistrations` call below) so all 12 widgets tools get it — including
 * the 3 embed handlers with the wrong-table host-lookup bug this reclassification was written
 * alongside, and the read/region/instance handlers that had the SAME redaction bug independent of
 * that lookup bug (see the fix plan's §3 sibling-arms table). A code prefix before `:` is prepended
 * so the model (and `widgets-error-code-parity.test.ts`) can match the same code the HTTP arm's
 * `mapWidgetErrorToResponse` returns, without this layer importing that HTTP-only module.
 *
 * `WIDGETS_FORBIDDEN` now has full HTTP-side parity too: `widgets.ts`'s `widgetForbiddenToResponse`
 * returns HTTP `code: "WIDGETS_FORBIDDEN"`, matching `Jini/packages/cms/src/widgets/errors.ts`'s own class doc and every sibling
 * prefix in this function (which all match their class doc verbatim). It used to return the generic
 * `FORBIDDEN` instead — a drift fixed once `widgets-error-code-parity.test.ts` was extended to cover
 * this class too.
 *
 * @complexity O(1).
 */
function toModelFacingWidgetsError({ err }: { err: unknown }, _optional = {}): unknown {
  if (err instanceof ToolInputError) return err;
  if (err instanceof WidgetForbiddenError) {
    return new ToolInputError({ message: `WIDGETS_FORBIDDEN: ${err.message}` });
  }
  if (err instanceof WidgetInstanceNotFoundError) {
    return new ToolInputError({ message: `WIDGETS_INSTANCE_NOT_FOUND: ${err.message}` });
  }
  if (err instanceof WidgetAreaNotFoundError) {
    return new ToolInputError({ message: `WIDGETS_AREA_NOT_FOUND: ${err.message}` });
  }
  if (err instanceof WidgetEmbedHostNotFoundError) {
    return new ToolInputError({ message: `WIDGETS_EMBED_HOST_NOT_FOUND: ${err.message}` });
  }
  if (err instanceof WidgetEmbedHostUnsupportedError) {
    return new ToolInputError({ message: `WIDGETS_EMBED_HOST_UNSUPPORTED: ${err.message}` });
  }
  if (err instanceof WidgetEmbedPlacementNotFoundError) {
    return new ToolInputError({ message: `WIDGETS_EMBED_PLACEMENT_NOT_FOUND: ${err.message}` });
  }
  const conflict = toModelFacingWidgetsConflictError({ err });
  if (conflict) return conflict;
  return err;
}

/** The two optimistic-concurrency refusals of {@link toModelFacingWidgetsError}, split out to keep
 * its branch count within the complexity limit. `undefined` when `err` is neither. */
function toModelFacingWidgetsConflictError({ err }: { err: unknown }, _optional = {}): ToolInputError | undefined {
  if (err instanceof WidgetVersionConflictError) {
    return new ToolInputError({ message: `WIDGETS_VERSION_CONFLICT: ${err.message}. Nothing was written. Re-read the host or instance to get its current version (${err.currentVersion}) and resend with that as baseVersion.` });
  }
  if (err instanceof WidgetAreaConflictError) {
    return new ToolInputError({ message: `WIDGETS_AREA_CONFLICT: ${err.message}. Nothing was written. Call content_read.widget_region to get the current baseVersion (${err.currentVersion}) and resend.` });
  }
  return undefined;
}

const withWidgetsSchema: WidgetsSchemaGuard = ({ toolId, fn }) =>
  withSchemaOnRejection({ toolId, catalog: CATALOG_BY_ID, isShapeRejection: ({ error }) => isWidgetsShapeRejection({ error }), fn });

/**
 * The slice of the host's route deps the handlers read, plus the two composers of the write-path
 * deps bags (`buildWidgetsDeps`/`buildWidgetsRegionDeps`, which stay host code). They stay lazy: a
 * registry built for its descriptors alone is given route deps without the repos those bags read.
 */
function toPackageDeps({ routeDeps }: { routeDeps: WidgetsToolDeps }, _optional = {}): WidgetsPackageToolDeps {
  return {
    authorize: routeDeps.authorize,
    workspaceId: routeDeps.workspaceId,
    idGen: routeDeps.idGen,
    entryRepo: routeDeps.entryRepo,
    entryRefsRepo: routeDeps.entryRefsRepo,
    widgetBindingRepo: routeDeps.widgetBindingRepo,
    composeWriteDeps: () => buildWidgetsDeps(routeDeps),
    composeRegionDeps: () => buildWidgetsRegionDeps(routeDeps),
  };
}

export function buildWidgetsRegistrations(
  routeDeps: WidgetsToolDeps,
  surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) },
): ToolRegistration[] {
  const args: WidgetsHandlerArgs = { deps: toPackageDeps({ routeDeps }), withSchema: withWidgetsSchema };
  const handlers: Record<string, ToolHandler> = {
    widgets_list_instances: widgetsListInstancesHandler(args),
    widgets_get_instance: widgetsGetInstanceHandler(args),
    widgets_list_regions: widgetsListRegionsHandler(args),
    widgets_get_region: widgetsGetRegionHandler(args),
    widgets_create_instance: widgetsCreateInstanceHandler(args),
    widgets_update_instance: widgetsUpdateInstanceHandler(args),
    widgets_trash_instance: widgetsTrashInstanceHandler(args),
    widgets_bind_region: widgetsBindRegionHandler(args),
    widgets_set_region_placements: widgetsSetRegionPlacementsHandler(args),
    widgets_insert_embed: widgetsInsertEmbedHandler(args),
    widgets_remove_embed: widgetsRemoveEmbedHandler(args),
    widgets_reorder_embeds: widgetsReorderEmbedsHandler(args),
  };

  // Every handler above gets `toModelFacingWidgetsError` — see that function's doc comment for why
  // this wraps the whole map once here rather than per call site. The inner `withPluginHookRefusals`
  // covers the 3 embed tools on a post/page host (`updatePost` runs the plugin save hook): a plugin
  // refusal becomes the fixed `PLUGIN_HOOK_FAILED` message naming the plugin, which
  // `toModelFacingWidgetsError` then passes through as the `ToolInputError` it already is.
  const modelFacingHandlers: Record<string, ToolHandler> = Object.fromEntries(
    Object.entries(withPluginHookRefusals(handlers)).map(([toolId, handler]) => [
      toolId,
      async (ctx) => {
        try {
          return await handler(ctx);
        } catch (err) {
          throw toModelFacingWidgetsError({ err });
        }
      },
    ])
  );

  // No `unwiredToolIds`: Widgets wires its ENTIRE catalog, same tripwire discipline as Forms.
  return buildDomainRegistrations({ metadata: toolMetadata,
    domain: "widgets",
    catalogModule: "widgets/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers: modelFacingHandlers,
    derivedRisk: widgetsDerivedRisk,
  });
}

/**
 * Contributes Widgets' AI tools to the assistant's catalog — called once by
 * `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildWidgetsRegistrations`/
 * `widgetsDerivedRisk` by name; this is the seam that replaced it (2026-08-17, Stage 2 batch 2 — see
 * `tool-contribution-registry.ts`'s header for why: this edge used to close a module cycle with
 * `assistant`, and a one-directional `widgets -> assistant` registration call does not). Converting
 * `widgets` first in this batch (ahead of `content-types`/`forms`, which `widgets` itself imports)
 * was deliberate: it removes the `assistant -> widgets` static edge before either of those converts,
 * so a later `content-types -> assistant` or `forms -> assistant` edge cannot round-trip back through
 * `widgets` to close a new cycle the way `themes`/`post` did in the prior batch.
 */
export function contributeWidgetsTools(): ToolContributor<WidgetsToolDeps, AssistantSurfaceDeps> {
  return { domain: "widgets", build: buildWidgetsRegistrations, risk: widgetsDerivedRisk };
}