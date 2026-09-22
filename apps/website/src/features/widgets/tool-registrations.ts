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
  AGENT_TOOL_PRINCIPAL_KIND,
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
// `ToolInputError` specifically — see `features/post/tool-registrations.ts`'s identical import for
// why: the marker `@jini-ai/daemon`'s `ToolExecutor` reads to classify a rejection 400 rather than
// redacting it into a message-stripped 500.
import { ToolInputError } from "@jini-ai/core";
import { buildConfirmationSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";
import type { ToolContributor } from "#src/assistant/index";
import {
  createSurfaceExchangeStore,
  resolveConfirmationDecision,
  SURFACE_EXCHANGE_ID_PARAM,
  type AssistantSurfaceDeps,
  type SurfaceExchange,
} from "../../contracts/core/tool-surface-exchanges.js";
import { toWhereUsedResponse } from "./where-used.js";
import { widgetsAgentToolCatalog } from "./agent-tools.js";
import { requireWidgetPermission } from "./authorize-helper.js";
import { buildWidgetsDeps, buildWidgetsRegionDeps, type WidgetsRouteDeps } from "./deps.js";
import {
  insertWidgetEmbed,
  removeWidgetEmbed,
  reorderWidgetEmbeds,
  WidgetEmbedReorderCountMismatchError,
} from "./embed-service.js";
import { parseWidgetAreaPayload, parseWidgetInstancePayload } from "./entry-payload.js";
import {
  WidgetAreaConflictError,
  WidgetAreaNotFoundError,
  WidgetConfigValidationError,
  WidgetEmbedGuardrailError,
  WidgetEmbedHostNotFoundError,
  WidgetEmbedHostUnsupportedError,
  WidgetForbiddenError,
  WidgetInstanceNotFoundError,
  WidgetTypeUnregisteredError,
  WidgetVersionConflictError,
} from "./errors.js";
import { getWidgetInstance, listWidgetInstances } from "./read-service.js";
import { bindWidgetArea, mutateWidgetAreaPlacements } from "./region-area-service.js";
import { WIDGET_AREA_CONTENT_TYPE, WIDGET_CONTENT_TYPE } from "./types.js";
import type {
  WidgetAreaEntry,
  WidgetInstanceEntry,
  WidgetPlacementNode,
  WidgetTypeKey,
} from "./types.js";
import { createWidgetInstance, trashWidgetInstance, updateWidgetInstance } from "./write-service.js";

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
  // -> trashWidgetInstance (write-service.ts): moves it to the Trash (restorable). Never a purge:
  //    a permanent delete exists only as the Trash screen's purge.
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

/**
 * Re-classifies every typed not-found/conflict/forbidden domain error this handler map can throw
 * as a `ToolInputError` on its way to the model, and passes anything else through untouched.
 *
 * `WidgetForbiddenError` used to be the one class explicitly passed through untouched here, on the
 * theory that a `403` isn't caller-input. That left the model unable to tell "you lack permission"
 * from "the server broke" — both surfaced as the same redacted `INTERNAL_ERROR` — and the owner's
 * 2026-09-15 ruling ("always say the real reason ... so I can improve it or people can see the
 * errors") overrides that theory: the message already names the missing permission and the reason
 * (`requireWidgetPermission` in `authorize-helper.ts` builds it), so there is real, actionable
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
 * returns HTTP `code: "WIDGETS_FORBIDDEN"`, matching `errors.ts`'s own class doc and every sibling
 * prefix in this function (which all match their class doc verbatim). It used to return the generic
 * `FORBIDDEN` instead — a drift fixed once `widgets-error-code-parity.test.ts` was extended to cover
 * this class too.
 *
 * @complexity O(1).
 */
function toModelFacingWidgetsError(err: unknown): unknown {
  if (err instanceof ToolInputError) return err;
  if (err instanceof WidgetForbiddenError) {
    return new ToolInputError(`WIDGETS_FORBIDDEN: ${err.message}`);
  }
  if (err instanceof WidgetInstanceNotFoundError) {
    return new ToolInputError(`WIDGETS_INSTANCE_NOT_FOUND: ${err.message}`);
  }
  if (err instanceof WidgetAreaNotFoundError) {
    return new ToolInputError(`WIDGETS_AREA_NOT_FOUND: ${err.message}`);
  }
  if (err instanceof WidgetEmbedHostNotFoundError) {
    return new ToolInputError(`WIDGETS_EMBED_HOST_NOT_FOUND: ${err.message}`);
  }
  if (err instanceof WidgetEmbedHostUnsupportedError) {
    return new ToolInputError(`WIDGETS_EMBED_HOST_UNSUPPORTED: ${err.message}`);
  }
  if (err instanceof WidgetVersionConflictError) {
    return new ToolInputError(
      `WIDGETS_VERSION_CONFLICT: ${err.message}. Nothing was written. Re-read the host or instance to get its current version (${err.currentVersion}) and resend with that as baseVersion.`
    );
  }
  if (err instanceof WidgetAreaConflictError) {
    return new ToolInputError(
      `WIDGETS_AREA_CONFLICT: ${err.message}. Nothing was written. Call content_read.widget_region to get the current baseVersion (${err.currentVersion}) and resend.`
    );
  }
  return err;
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

const WIDGETS_TRASH_TOOL_ID = "widgets_trash_instance";

/** The `ui://` URI for one trash-confirmation instance — keyed by the exchange id, mirroring
 *  `comments/tool-registrations.ts`'s identical `trashConfirmationUri`. */
function trashConfirmationUri(exchangeId: string): UIResourceUri {
  return `ui://tovu/widgets-trash-instance/${exchangeId}` as UIResourceUri;
}

/**
 * Renders `widgets_trash_instance`'s confirmation dialog. Mirrors
 * `features/post/delete-confirmation-ui.ts`'s `buildDeleteConfirmationResource` shape; Jini's
 * `buildConfirmationSurface` owns HOW the dialog behaves, this only decides WHAT it says.
 *
 * @complexity O(1).
 */
function buildTrashConfirmationResource(spec: { instance: { title: string; slug: string }; exchangeId: string }): UIResource {
  const { instance, exchangeId } = spec;
  return buildConfirmationSurface({
    uri: trashConfirmationUri(exchangeId),
    title: "Trash this widget instance?",
    description: "The widget instance will be moved to the trash and removed from wherever it is currently placed.",
    details: [
      { label: "Title", value: instance.title },
      { label: "Slug", value: instance.slug },
    ],
    danger: true,
    confirm: {
      label: "Trash widget",
      toolName: WIDGETS_TRASH_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" },
    },
    cancel: {
      label: "Cancel",
      toolName: WIDGETS_TRASH_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "cancel" },
    },
    app: { appName: "tovu-widgets-trash-instance", appVersion: "1" },
    preferredFrameSize: ["100%", "320px"],
  });
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

export function buildWidgetsRegistrations(
  routeDeps: WidgetsToolDeps,
  surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore() },
): ToolRegistration[] {
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

    /**
     * The MCP-UI-gated trash — migrated onto the shared held-open confirmation exchange
     * (2026-09-08, ADS-memory/reports/2026-09-08-delete-confirmation-build.md). The pre-dialog read
     * gates on `widgets.read`, deferring `widgets.delete` to the confirmed write — same split
     * `content_post_delete` uses for `content.read`/`content.write`. `trashWidgetInstance` re-reads
     * the row and derives `expectedVersion` from that fresh read INSIDE itself, right before moving
     * it to the Trash, so no separate staleness re-check is needed here the way
     * `content_post_delete`'s own handler needs one.
     *
     * (2026-09-21, trash T4) The pre-dialog read no longer goes through `getWidgetInstance` — that
     * function calls `toWidgetInstanceEntry`, which `JSON.parse`s `fields_json`, so a widget whose
     * payload is corrupt (e.g. `fields_json = "{not json"`) threw here before the confirmation
     * dialog ever rendered, making exactly the rows a user most wants gone untrashable. Reads the
     * raw `EntryRecord` (`title`/`slug`/`version`/`type`) instead, the same column-only rule
     * `TrashAdapter` implementations already follow (see `ports.ts`'s file header) — the dialog now
     * shows Title/Slug (both raw columns) rather than widget type/status (both payload fields).
     */
    widgets_trash_instance: async (ctx) => {
      const widgetInstanceId = requireString(requireInputRecord(ctx.input), "widgetInstanceId");

      await requireWidgetPermission({
        authorize: routeDeps.authorize,
        actor: { principalId: ctx.principal.id },
        workspaceId: routeDeps.workspaceId,
        permission: "widgets.read",
      });
      const entry = await routeDeps.entryRepo.findById({ workspaceId: routeDeps.workspaceId, id: widgetInstanceId });
      if (!entry || entry.type !== WIDGET_CONTENT_TYPE) {
        throw new WidgetInstanceNotFoundError(`widget instance '${widgetInstanceId}' was not found`);
      }

      if (!ctx.emitSurface) {
        throw new Error(
          "widgets_trash_instance: this execution context has no interactive confirmation channel " +
            "(no emitSurface), so a destructive trash cannot be gated here. Nothing was trashed."
        );
      }

      const exchange: SurfaceExchange = surfaces.surfaceExchanges.open(
        { toolId: WIDGETS_TRASH_TOOL_ID, principalId: ctx.principal.id },
        ctx.emitSurface
      );
      const ui = buildTrashConfirmationResource({
        instance: { title: entry.title, slug: entry.slug },
        exchangeId: exchange.id,
      });

      const closeOnAbort = () => exchange.close();
      ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
      try {
        const outcome = await resolveConfirmationDecision(exchange, { channel: "mcp-ui", payload: { resource: ui } });
        if (!outcome.confirmed) {
          if (outcome.reason === "declined") {
            return { trashed: false, cancelled: true, widgetInstanceId, title: entry.title, slug: entry.slug };
          }
          return {
            trashed: false,
            cancelled: false,
            reason: outcome.reason,
            note:
              outcome.reason === "expired"
                ? "The user did not respond to the confirmation dialog before it expired. Nothing was trashed."
                : "The confirmation dialog was closed because the run ended. Nothing was trashed.",
          };
        }

        const { version } = await trashWidgetInstance({
          deps: buildWidgetsDeps(routeDeps),
          input: { workspaceId: routeDeps.workspaceId, actor: { principalId: ctx.principal.id }, widgetInstanceId },
        });
        // The row itself is unchanged apart from its Trash marker; no `toWidgetInstanceToolView` here
        // (see this handler's own header) — a corrupt payload must still be reportable as trashed.
        return { trashed: true, cancelled: false, widgetInstanceId, title: entry.title, slug: entry.slug, version: version ?? entry.version };
      } finally {
        ctx.signal.removeEventListener("abort", closeOnAbort);
      }
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
      if (!Array.isArray(input.placements)) throw new ToolInputError("'placements' (array) is required");

      const seenIds = new Set<string>();
      const placements: WidgetPlacementNode[] = input.placements.map((raw: unknown) => {
        if (!isRecord(raw)) throw new ToolInputError("each placement must be an object");
        const widgetEntryId = requireString(raw, "widgetEntryId");
        if (typeof raw.enabled !== "boolean") throw new ToolInputError("each placement's 'enabled' must be a boolean");
        const placementId = typeof raw.placementId === "string" && raw.placementId.length > 0 ? raw.placementId : routeDeps.idGen.newId();
        if (seenIds.has(placementId)) throw new ToolInputError(`duplicate placementId '${placementId}'`);
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
            actor: { principalId: ctx.principal.id, kind: AGENT_TOOL_PRINCIPAL_KIND },
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
          actor: { principalId: ctx.principal.id, kind: AGENT_TOOL_PRINCIPAL_KIND },
          hostEntryId: requireString(input, "hostEntryId"),
          baseVersion: requireNumber(input, "baseVersion"),
          placementId: requireString(input, "placementId"),
        },
      });
      return { entryId: entry.id, entryVersion: entry.version };
    },

    widgets_reorder_embeds: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      // The `orderedWidgetEntryIds` shape check used to run BEFORE this `withSchemaOnRejection` call
      // even started — a bare `Error` thrown there still reaches `ToolExecutor` as `errorKind:
      // 'internal'` regardless of where it is thrown (that classification reads `instanceof
      // ToolInputError`, not call-stack position), but it also never got this tool's own schema
      // decoration a rejection caught INSIDE the wrap gets from `isWidgetsShapeRejection`. Moved
      // inside so this validator is unremarkable among this handler's other shape checks rather than
      // the one exception that bypasses the wrap every sibling rejection goes through.
      return withSchemaOnRejection({ toolId: "widgets_reorder_embeds", catalog: CATALOG_BY_ID, isShapeRejection: isWidgetsShapeRejection }, async () => {
        if (!Array.isArray(input.orderedWidgetEntryIds) || !input.orderedWidgetEntryIds.every((id: unknown) => typeof id === "string" && id.length > 0)) {
          throw new ToolInputError("'orderedWidgetEntryIds' (non-empty string array) is required");
        }
        const { entry } = await reorderWidgetEmbeds({
          deps: buildWidgetsDeps(routeDeps),
          input: {
            workspaceId: routeDeps.workspaceId,
            actor: { principalId: ctx.principal.id, kind: AGENT_TOOL_PRINCIPAL_KIND },
            hostEntryId: requireString(input, "hostEntryId"),
            baseVersion: requireNumber(input, "baseVersion"),
            orderedWidgetEntryIds: input.orderedWidgetEntryIds as string[],
          },
        });
        return { entryId: entry.id, entryVersion: entry.version };
      });
    },
  };

  // Every handler above gets `toModelFacingWidgetsError` — see that function's doc comment for why
  // this wraps the whole map once here rather than per call site.
  const modelFacingHandlers: Record<string, ToolHandler> = Object.fromEntries(
    Object.entries(handlers).map(([toolId, handler]) => [
      toolId,
      async (ctx) => {
        try {
          return await handler(ctx);
        } catch (err) {
          throw toModelFacingWidgetsError(err);
        }
      },
    ])
  );

  // No `unwiredToolIds`: Widgets wires its ENTIRE catalog, same tripwire discipline as Forms.
  return buildDomainRegistrations({
    domain: "widgets",
    catalogModule: "widgets/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers: modelFacingHandlers,
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
export function contributeWidgetsTools(): ToolContributor {
  return { domain: "widgets", build: buildWidgetsRegistrations, risk: widgetsDerivedRisk };
}
