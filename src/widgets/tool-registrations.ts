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
import {
  buildDomainRegistrations,
  indexCatalogById,
  isRecord,
  requireInputRecord,
  requireNumber,
  requireObject,
  requireString,
  withSchemaOnRejection,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";
import { registerToolContributor } from "#src/assistant/index";
import { toWhereUsedResponse } from "./where-used";
import { widgetsAgentToolCatalog } from "./agent-tools";
import { requireWidgetPermission } from "./authorize-helper";
import { buildWidgetsDeps, buildWidgetsRegionDeps, type WidgetsRouteDeps } from "./deps";
import {
  insertWidgetEmbed,
  removeWidgetEmbed,
  reorderWidgetEmbeds,
  WidgetEmbedReorderCountMismatchError,
} from "./embed-service";
import { parseWidgetAreaPayload, parseWidgetInstancePayload } from "./entry-payload";
import {
  WidgetAreaNotFoundError,
  WidgetConfigValidationError,
  WidgetEmbedGuardrailError,
  WidgetTypeUnregisteredError,
} from "./errors";
import { getWidgetInstance, listWidgetInstances } from "./read-service";
import { bindWidgetArea, mutateWidgetAreaPlacements } from "./region-area-service";
import { WIDGET_AREA_CONTENT_TYPE, WIDGET_CONTENT_TYPE } from "./types";
import type {
  WidgetAreaEntry,
  WidgetInstanceEntry,
  WidgetPlacementNode,
  WidgetTypeKey,
} from "./types";
import { createWidgetInstance, trashWidgetInstance, updateWidgetInstance } from "./write-service";

const CATALOG_BY_ID = indexCatalogById(widgetsAgentToolCatalog);

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
  // -> listWidgetInstances (read-service.ts): entryRepo.listByWorkspace only, no write.
  ["widgets_list_instances", "none"],
  // -> getWidgetInstance (read-service.ts) + entryRefsRepo.findByTarget: reads only.
  ["widgets_get_instance", "none"],
  // -> widgetBindingRepo.listByWorkspace + entryRepo.findById: reads only.
  ["widgets_list_regions", "none"],
  // -> widgetBindingRepo.findByRegion + entryRepo.findById (+ per-placement resolution): reads only.
  ["widgets_get_region", "none"],
  // -> createWidgetInstance (write-service.ts): createEntry + entry_refs extraction in one tx.
  ["widgets_create_instance", "mutates-durable-state"],
  // -> updateWidgetInstance (write-service.ts): updateEntry + entry_refs extraction.
  ["widgets_update_instance", "mutates-durable-state"],
  // -> trashWidgetInstance (write-service.ts): updateEntry, status flip only. Never a purge:
  //    purgeWidgetInstance is deliberately not exposed (see widgets/agent-tools.ts's file header).
  ["widgets_trash_instance", "mutates-durable-state"],
  // -> bindWidgetArea (region-area-service.ts): createEntry (maybe) + bindingRepo.upsert.
  ["widgets_bind_region", "mutates-durable-state"],
  // -> mutateWidgetAreaPlacements (region-area-service.ts): updateEntry + bindingRepo.upsert.
  ["widgets_set_region_placements", "mutates-durable-state"],
  // -> insertWidgetEmbed (embed-service.ts): updateEntry (bodyJson) + entry_refs extraction.
  ["widgets_insert_embed", "mutates-durable-state"],
  // -> removeWidgetEmbed (embed-service.ts): updateEntry (bodyJson) + entry_refs extraction.
  ["widgets_remove_embed", "mutates-durable-state"],
  // -> reorderWidgetEmbeds (embed-service.ts): updateEntry (bodyJson) + entry_refs extraction.
  ["widgets_reorder_embeds", "mutates-durable-state"],
]);

/**
 * The Widgets rejections worth decorating with the published schema: config/type/embed SHAPE
 * problems only. A `WidgetForbiddenError` or `WidgetReferencedError` is not a shape problem
 * retrying the SAME input would ever resolve.
 */
function isWidgetsShapeRejection(error: unknown): boolean {
  return (
    error instanceof WidgetConfigValidationError ||
    error instanceof WidgetTypeUnregisteredError ||
    error instanceof WidgetEmbedGuardrailError ||
    error instanceof WidgetEmbedReorderCountMismatchError
  );
}

/** What a Widgets instance tool returns to the model — see {@link toWidgetInstanceToolView}. */
interface WidgetInstanceToolView {
  id: string;
  slug: string;
  title: string;
  status: WidgetInstanceEntry["status"];
  widgetType: WidgetInstanceEntry["widgetType"];
  config: Record<string, unknown>;
  version: number;
}

/** Projects a `WidgetInstanceEntry` into an explicit model-facing shape — `config` is copied so a tool caller cannot mutate domain state through the returned object. */
function toWidgetInstanceToolView(instance: WidgetInstanceEntry): WidgetInstanceToolView {
  return {
    id: instance.id,
    slug: instance.slug,
    title: instance.title,
    status: instance.status,
    widgetType: instance.widgetType,
    config: { ...instance.config },
    version: instance.version,
  };
}

/** What a Widgets region tool returns to the model — see {@link toWidgetAreaToolView}. `doc`/`workspaceId` are dropped: placements are returned separately, already resolved. */
interface WidgetAreaToolView {
  id: string;
  regionKey: string;
  version: number;
  updatedAt: string;
}

function toWidgetAreaToolView(area: Pick<WidgetAreaEntry, "id" | "regionKey" | "version" | "updatedAt">): WidgetAreaToolView {
  return { id: area.id, regionKey: area.regionKey, version: area.version, updatedAt: area.updatedAt };
}

/** Resolves one region placement's admin-facing view (widget title/type + broken flag) — mirrors `server/routes/admin/widgets/region-get.ts`'s identical resolution. */
async function resolveWidgetPlacementView(routeDeps: WidgetsToolDeps, placement: WidgetPlacementNode) {
  const widget = await routeDeps.entryRepo.findById({ workspaceId: routeDeps.workspaceId, id: placement.widgetEntryId });
  const payload = widget && widget.type === WIDGET_CONTENT_TYPE ? parseWidgetInstancePayload(widget.fieldsJson) : null;
  return {
    placementId: placement.placementId,
    widgetEntryId: placement.widgetEntryId,
    enabled: placement.enabled,
    widgetTitle: widget?.title ?? null,
    widgetType: payload?.widgetType ?? null,
    broken: !widget || !payload || payload.status !== "active",
  };
}

export function buildWidgetsRegistrations(routeDeps: WidgetsToolDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    widgets_list_instances: async (ctx) => {
      const input = isRecord(ctx.input) ? ctx.input : {};
      const { instances } = await listWidgetInstances({
        deps: { entryRepo: routeDeps.entryRepo, authorize: routeDeps.authorize },
        input: {
          workspaceId: routeDeps.workspaceId,
          actor: { principalId: ctx.principal.id },
          widgetType: typeof input.widgetType === "string" ? input.widgetType : undefined,
          includeInactive: input.includeInactive === true,
        },
      });
      return { instances: instances.map(toWidgetInstanceToolView) };
    },

    widgets_get_instance: async (ctx) => {
      const widgetInstanceId = requireString(requireInputRecord(ctx.input), "widgetInstanceId");
      const { instance } = await getWidgetInstance({
        deps: { entryRepo: routeDeps.entryRepo, authorize: routeDeps.authorize },
        input: { workspaceId: routeDeps.workspaceId, actor: { principalId: ctx.principal.id }, widgetInstanceId },
      });
      const refs = await routeDeps.entryRefsRepo.findByTarget({ workspaceId: routeDeps.workspaceId, targetKind: "entry", targetId: instance.id });
      return { instance: toWidgetInstanceToolView(instance), whereUsed: toWhereUsedResponse(refs) };
    },

    widgets_list_regions: async (ctx) => {
      await requireWidgetPermission({ authorize: routeDeps.authorize, actor: { principalId: ctx.principal.id }, workspaceId: routeDeps.workspaceId, permission: "widgets.read" });
      const bindings = await routeDeps.widgetBindingRepo.listByWorkspace({ workspaceId: routeDeps.workspaceId });
      const regions = await Promise.all(
        bindings.map(async (binding) => {
          const areaEntry = await routeDeps.entryRepo.findById({ workspaceId: routeDeps.workspaceId, id: binding.areaEntryId });
          const placementCount = areaEntry ? parseWidgetAreaPayload(areaEntry.fieldsJson).doc.placements.length : 0;
          return { regionKey: binding.regionKey, areaEntryId: binding.areaEntryId, updatedAt: binding.updatedAt, placementCount };
        }),
      );
      return { regions };
    },

    widgets_get_region: async (ctx) => {
      const regionKey = requireString(requireInputRecord(ctx.input), "regionKey");
      await requireWidgetPermission({ authorize: routeDeps.authorize, actor: { principalId: ctx.principal.id }, workspaceId: routeDeps.workspaceId, permission: "widgets.read" });

      const binding = await routeDeps.widgetBindingRepo.findByRegion({ workspaceId: routeDeps.workspaceId, regionKey });
      if (!binding) throw new WidgetAreaNotFoundError(`region '${regionKey}' is not bound`);
      const areaEntry = await routeDeps.entryRepo.findById({ workspaceId: routeDeps.workspaceId, id: binding.areaEntryId });
      if (!areaEntry || areaEntry.type !== WIDGET_AREA_CONTENT_TYPE) {
        throw new WidgetAreaNotFoundError(`region area entry for '${regionKey}' was not found`);
      }
      const doc = parseWidgetAreaPayload(areaEntry.fieldsJson).doc;
      const placements = await Promise.all(doc.placements.map((placement) => resolveWidgetPlacementView(routeDeps, placement)));
      return { area: toWidgetAreaToolView({ id: areaEntry.id, regionKey, version: areaEntry.version, updatedAt: areaEntry.updatedAt }), placements };
    },

    widgets_create_instance: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      return withSchemaOnRejection({ toolId: "widgets_create_instance", catalog: CATALOG_BY_ID, isShapeRejection: isWidgetsShapeRejection }, async () => {
        const { instance } = await createWidgetInstance({
          deps: buildWidgetsDeps(routeDeps),
          input: {
            workspaceId: routeDeps.workspaceId,
            actor: { principalId: ctx.principal.id },
            widgetType: requireString(input, "widgetType") as WidgetTypeKey,
            title: requireString(input, "title"),
            config: requireObject(input, "config"),
            slug: typeof input.slug === "string" ? input.slug : undefined,
          },
        });
        return { instance: toWidgetInstanceToolView(instance) };
      });
    },

    widgets_update_instance: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      return withSchemaOnRejection({ toolId: "widgets_update_instance", catalog: CATALOG_BY_ID, isShapeRejection: isWidgetsShapeRejection }, async () => {
        const { instance } = await updateWidgetInstance({
          deps: buildWidgetsDeps(routeDeps),
          input: {
            workspaceId: routeDeps.workspaceId,
            actor: { principalId: ctx.principal.id },
            widgetInstanceId: requireString(input, "widgetInstanceId"),
            baseVersion: requireNumber(input, "baseVersion"),
            config: requireObject(input, "config"),
          },
        });
        return { instance: toWidgetInstanceToolView(instance) };
      });
    },

    widgets_trash_instance: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const { instance } = await trashWidgetInstance({
        deps: buildWidgetsDeps(routeDeps),
        input: { workspaceId: routeDeps.workspaceId, actor: { principalId: ctx.principal.id }, widgetInstanceId: requireString(input, "widgetInstanceId") },
      });
      return { instance: toWidgetInstanceToolView(instance) };
    },

    widgets_bind_region: async (ctx) => {
      const regionKey = requireString(requireInputRecord(ctx.input), "regionKey");
      // `bindWidgetArea` itself carries NO authorize() call (it is designed to double as a boot/theme-
      // activation seeding step, see its own doc comment) — the human `region-bind.ts` route gates
      // inline before calling it, and this handler does the identical inline `widgets.place` check.
      await requireWidgetPermission({ authorize: routeDeps.authorize, actor: { principalId: ctx.principal.id }, workspaceId: routeDeps.workspaceId, permission: "widgets.place" });
      const { areaEntry } = await bindWidgetArea({
        deps: buildWidgetsRegionDeps(routeDeps),
        input: { workspaceId: routeDeps.workspaceId, regionKey },
      });
      return { area: toWidgetAreaToolView(areaEntry) };
    },

    widgets_set_region_placements: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const regionKey = requireString(input, "regionKey");
      const baseVersion = requireNumber(input, "baseVersion");
      if (!Array.isArray(input.placements)) throw new Error("'placements' (array) is required");

      const seenIds = new Set<string>();
      const placements: WidgetPlacementNode[] = input.placements.map((raw: unknown) => {
        if (!isRecord(raw)) throw new Error("each placement must be an object");
        const widgetEntryId = requireString(raw, "widgetEntryId");
        if (typeof raw.enabled !== "boolean") throw new Error("each placement's 'enabled' must be a boolean");
        const placementId = typeof raw.placementId === "string" && raw.placementId.length > 0 ? raw.placementId : routeDeps.idGen.newId();
        if (seenIds.has(placementId)) throw new Error(`duplicate placementId '${placementId}'`);
        seenIds.add(placementId);
        return { placementId, widgetEntryId, enabled: raw.enabled };
      });

      const binding = await routeDeps.widgetBindingRepo.findByRegion({ workspaceId: routeDeps.workspaceId, regionKey });
      if (!binding) throw new WidgetAreaNotFoundError(`region '${regionKey}' is not bound`);

      const { areaEntry } = await mutateWidgetAreaPlacements({
        deps: buildWidgetsRegionDeps(routeDeps),
        input: { workspaceId: routeDeps.workspaceId, actor: { principalId: ctx.principal.id }, areaEntryId: binding.areaEntryId, baseVersion, placements },
      });
      return { area: toWidgetAreaToolView(areaEntry) };
    },

    widgets_insert_embed: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      return withSchemaOnRejection({ toolId: "widgets_insert_embed", catalog: CATALOG_BY_ID, isShapeRejection: isWidgetsShapeRejection }, async () => {
        const { entry, placementId } = await insertWidgetEmbed({
          deps: buildWidgetsDeps(routeDeps),
          input: {
            workspaceId: routeDeps.workspaceId,
            actor: { principalId: ctx.principal.id },
            hostEntryId: requireString(input, "hostEntryId"),
            baseVersion: requireNumber(input, "baseVersion"),
            widgetEntryId: requireString(input, "widgetEntryId"),
          },
        });
        return { entryId: entry.id, entryVersion: entry.version, placementId };
      });
    },

    widgets_remove_embed: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const { entry } = await removeWidgetEmbed({
        deps: buildWidgetsDeps(routeDeps),
        input: {
          workspaceId: routeDeps.workspaceId,
          actor: { principalId: ctx.principal.id },
          hostEntryId: requireString(input, "hostEntryId"),
          baseVersion: requireNumber(input, "baseVersion"),
          placementId: requireString(input, "placementId"),
        },
      });
      return { entryId: entry.id, entryVersion: entry.version };
    },

    widgets_reorder_embeds: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      if (!Array.isArray(input.orderedWidgetEntryIds) || !input.orderedWidgetEntryIds.every((id: unknown) => typeof id === "string" && id.length > 0)) {
        throw new Error("'orderedWidgetEntryIds' (non-empty string array) is required");
      }
      return withSchemaOnRejection({ toolId: "widgets_reorder_embeds", catalog: CATALOG_BY_ID, isShapeRejection: isWidgetsShapeRejection }, async () => {
        const { entry } = await reorderWidgetEmbeds({
          deps: buildWidgetsDeps(routeDeps),
          input: {
            workspaceId: routeDeps.workspaceId,
            actor: { principalId: ctx.principal.id },
            hostEntryId: requireString(input, "hostEntryId"),
            baseVersion: requireNumber(input, "baseVersion"),
            orderedWidgetEntryIds: input.orderedWidgetEntryIds as string[],
          },
        });
        return { entryId: entry.id, entryVersion: entry.version };
      });
    },
  };

  // No `unwiredToolIds`: Widgets wires its ENTIRE catalog, same tripwire discipline as Forms.
  return buildDomainRegistrations({
    domain: "widgets",
    catalogModule: "widgets/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: widgetsDerivedRisk,
  });
}

/**
 * Contributes Widgets' AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildWidgetsRegistrations`/
 * `widgetsDerivedRisk` by name; this is the seam that replaced it (2026-08-17, Stage 2 batch 2 — see
 * `tool-contribution-registry.ts`'s header for why: this edge used to close a module cycle with
 * `assistant`, and a one-directional `widgets -> assistant` registration call does not). Converting
 * `widgets` first in this batch (ahead of `content-types`/`forms`, which `widgets` itself imports)
 * was deliberate: it removes the `assistant -> widgets` static edge before either of those converts,
 * so a later `content-types -> assistant` or `forms -> assistant` edge cannot round-trip back through
 * `widgets` to close a new cycle the way `themes`/`post` did in the prior batch.
 */
export function contributeWidgetsTools(): void {
  registerToolContributor({ domain: "widgets", build: buildWidgetsRegistrations, risk: widgetsDerivedRisk });
}
