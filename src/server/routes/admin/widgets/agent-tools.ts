import type { Response } from "express";

import { buildWidgetsDeps, buildWidgetsRegionDeps } from "#src/features/widgets/deps";
import { parseWidgetAreaPayload, parseWidgetInstancePayload } from "#src/features/widgets/entry-payload";
import { insertWidgetEmbed, removeWidgetEmbed } from "#src/features/widgets/embed-service";
import { mutateWidgetAreaPlacements } from "#src/features/widgets/region-area-service";
import { createWidgetInstance } from "#src/features/widgets/write-service";
import { WidgetAreaNotFoundError } from "#src/features/widgets/errors";
import { WIDGET_CONTENT_TYPE } from "#src/features/widgets/types";
import type { WidgetPlacementNode, WidgetTypeKey } from "#src/features/widgets/types";
import {
  mapWidgetErrorToResponse,
  requireWidgetsPermissionOrRespond,
  toAdminWidgetResponse,
  toWhereUsedResponse,
  widgetErrorToResponse,
} from "#src/server/http/admin/widgets";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RouteDeps, RouteRegistrar } from "../../types.js";

/**
 * @file The `widgets.place` / `widgets.create` / `widgets.remove` / `widgets.diagnose` AI tool
 * surface (SPEC-043 REQ-35/44, ADR-047 §5). Thin gateway clients — every call maps 1:1 to the SAME
 * C-005/C-006/C-007 domain functions the human admin routes use, gated by the SAME `widgets.*`
 * permission check (INV-07: an agent's effective permission is always `grant ∩ delegator`,
 * unchanged by this feature). No bespoke AI-agent transport is invented here — REQ-35's "distinct,
 * explicit gateway operations" requirement is about `place` vs `create` being two DISTINCT,
 * unambiguous operations (never one "add widget" call that could mean either), not about a
 * separate wire protocol from the ordinary admin HTTP surface; ADR-047 §5 phrases these as "thin
 * gateway/tool clients, the same shape as ADR-029 §8's `navigation.update`," which is itself an
 * ordinary admin route.
 *
 * Each tool call is ONE atomic operation (unlike the human UI's two-step "create, then place"
 * flow over separate routes) — an agent tool call for "place this widget in the footer" should not
 * require two round-trips.
 */

type PlaceTarget =
  | { readonly kind: "region"; readonly regionKey: string; readonly baseVersion: number }
  | { readonly kind: "embed"; readonly hostEntryId: string; readonly baseVersion: number };

/** Appends `widgetEntryId` to a region's CURRENT placement list (loaded fresh) and writes the
 * whole list back, per REQ-15's whole-document discipline — never a partial patch. */
async function placeIntoRegion(deps: RouteDeps, workspaceId: string, actor: { principalId: string }, regionKey: string, baseVersion: number, widgetEntryId: string) {
  const binding = await deps.widgetBindingRepo.findByRegion({ workspaceId, regionKey });
  // Round-2 external-audit fix (2026-07-21, agy + Opus 4.8, independently converged): a bare Error
  // isn't recognized by widgetErrorToResponse, so an unbound region 500'd instead of the same 404
  // WIDGETS_AREA_NOT_FOUND region-mutate-placements.ts already returns for this exact condition.
  if (!binding) throw new WidgetAreaNotFoundError(`region '${regionKey}' is not bound`);
  const areaEntry = await deps.entryRepo.findById({ workspaceId, id: binding.areaEntryId });
  if (!areaEntry) throw new WidgetAreaNotFoundError(`region area entry for '${regionKey}' was not found`);
  const currentPlacements = parseWidgetAreaPayload(areaEntry.fieldsJson).doc.placements;
  const nextPlacements: WidgetPlacementNode[] = [...currentPlacements, { placementId: deps.idGen.newId(), widgetEntryId, enabled: true }];

  return mutateWidgetAreaPlacements({
    deps: buildWidgetsRegionDeps(deps),
    input: { workspaceId, actor, areaEntryId: binding.areaEntryId, baseVersion, placements: nextPlacements },
  });
}

async function placeTarget(deps: RouteDeps, workspaceId: string, actor: { principalId: string }, target: PlaceTarget, widgetEntryId: string) {
  if (target.kind === "region") {
    return placeIntoRegion(deps, workspaceId, actor, target.regionKey, target.baseVersion, widgetEntryId);
  }
  return insertWidgetEmbed({
    deps: buildWidgetsDeps(deps),
    input: { workspaceId, actor, hostEntryId: target.hostEntryId, baseVersion: target.baseVersion, widgetEntryId },
  });
}

function readTarget(body: Record<string, unknown>): PlaceTarget | null {
  const target = body.target as Record<string, unknown> | undefined;
  if (!target || typeof target.baseVersion !== "number") return null;
  if (target.kind === "region" && typeof target.regionKey === "string") {
    return { kind: "region", regionKey: target.regionKey, baseVersion: target.baseVersion };
  }
  if (target.kind === "embed" && typeof target.hostEntryId === "string") {
    return { kind: "embed", hostEntryId: target.hostEntryId, baseVersion: target.baseVersion };
  }
  return null;
}

function respondBadTarget(res: Response): void {
  res.status(400).json({
    error: "target must be { kind: 'region', regionKey, baseVersion } or { kind: 'embed', hostEntryId, baseVersion }",
    code: "VALIDATION_ERROR",
  });
}

/** This tool's validated body shape: a resolved `target` plus the new instance's fields.
 *  `widgetType` is cast, not validated, against the real `WidgetTypeKey` union here — same as the
 *  inline code this replaces, `createWidgetInstance` (`getWidgetTypeRegistration`) is what rejects
 *  an unregistered type at runtime, with its own `WidgetTypeUnregisteredError`. */
type CreateToolInput = { target: PlaceTarget; widgetType: WidgetTypeKey; title: string; config: Record<string, unknown> };

/**
 * Parses+validates `widgets.create`'s body in one place — target resolution (via `readTarget`),
 * `widgetType`/`title` presence, and the `config` object-or-default normalization all collapse into
 * one null-means-invalid result instead of three separate inline checks.
 *
 * @complexity O(1).
 */
function parseCreateToolInput(body: Record<string, unknown>): CreateToolInput | null {
  const target = readTarget(body);
  if (!target || typeof body.widgetType !== "string" || typeof body.title !== "string") return null;
  return {
    target,
    widgetType: body.widgetType as WidgetTypeKey,
    title: body.title,
    config: typeof body.config === "object" && body.config !== null ? (body.config as Record<string, unknown>) : {},
  };
}

/** Removes an embed-hosted placement — thin pass-through to `removeWidgetEmbed`, kept symmetric
 *  with `removeRegionPlacement` below. @complexity O(1). */
async function removeEmbedPlacement(
  deps: RouteDeps,
  workspaceId: string,
  actor: { principalId: string },
  target: Extract<PlaceTarget, { kind: "embed" }>,
  placementId: string
) {
  return removeWidgetEmbed({
    deps: buildWidgetsDeps(deps),
    input: { workspaceId, actor, hostEntryId: target.hostEntryId, baseVersion: target.baseVersion, placementId },
  });
}

/** Removes a region-bound placement by loading the CURRENT placement list and writing it back
 *  without `placementId`, matching `placeIntoRegion`'s whole-document discipline (REQ-15).
 *  @complexity O(placements in the region). */
async function removeRegionPlacement(
  deps: RouteDeps,
  workspaceId: string,
  actor: { principalId: string },
  target: Extract<PlaceTarget, { kind: "region" }>,
  placementId: string
) {
  const binding = await deps.widgetBindingRepo.findByRegion({ workspaceId, regionKey: target.regionKey });
  if (!binding) throw new WidgetAreaNotFoundError(`region '${target.regionKey}' is not bound`);
  const areaEntry = await deps.entryRepo.findById({ workspaceId, id: binding.areaEntryId });
  if (!areaEntry) throw new WidgetAreaNotFoundError(`region area entry for '${target.regionKey}' was not found`);
  const nextPlacements = parseWidgetAreaPayload(areaEntry.fieldsJson).doc.placements.filter((p) => p.placementId !== placementId);
  return mutateWidgetAreaPlacements({
    deps: buildWidgetsRegionDeps(deps),
    input: { workspaceId, actor, areaEntryId: binding.areaEntryId, baseVersion: target.baseVersion, placements: nextPlacements },
  });
}

/** Dispatches to the embed or region removal path — mirrors `placeTarget`'s own dispatch shape.
 *  @complexity O(1) plus whichever branch's own cost. */
async function removePlacement(
  deps: RouteDeps,
  workspaceId: string,
  actor: { principalId: string },
  target: PlaceTarget,
  placementId: string
) {
  if (target.kind === "embed") {
    return removeEmbedPlacement(deps, workspaceId, actor, target, placementId);
  }
  return removeRegionPlacement(deps, workspaceId, actor, target, placementId);
}

/** Resolves `widgets.diagnose`'s exists/status pair for an already-fetched entry — a bare
 *  `Awaited<ReturnType<...findById>>` type keeps this tied to the repo port's own return shape
 *  rather than a hand-rolled interface. @complexity O(1). */
function resolveWidgetStatus(entry: Awaited<ReturnType<RouteDeps["entryRepo"]["findById"]>>): {
  exists: boolean;
  status: string | null;
} {
  const isWidget = Boolean(entry) && entry?.type === WIDGET_CONTENT_TYPE;
  if (!isWidget || !entry) return { exists: isWidget, status: null };
  // Fable adversarial-review fix (2026-07-21, Finding B): diagnosing a real entry id that is NOT a
  // widget instance (wrong content type, or a widget row with a malformed payload) used to 500 via
  // an uncaught `parseWidgetInstancePayload` throw — `getWidgetInstance` already guards the same
  // case with an `entry.type` check; this mirrors it instead of parsing blind.
  try {
    return { exists: true, status: parseWidgetInstancePayload(entry.fieldsJson).status };
  } catch {
    return { exists: true, status: null };
  }
}

/** `widgets.place` — reference an EXISTING widget instance into a target. Distinct from
 * `widgets.create` (REQ-35, AC-25): this call never creates a new instance. */
const registerPlaceTool: RouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/widgets/tools/place", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    const body = req.body ?? {};
    const target = readTarget(body);
    if (!target || typeof body.widgetInstanceId !== "string") {
      respondBadTarget(res);
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const result = await placeTarget(deps, deps.workspaceId, { principalId: principal.id }, target, body.widgetInstanceId);
      res.status(200).json({ tool: "widgets.place", result });
    } catch (err) {
      mapWidgetErrorToResponse(err, res);
    }
  });
};

/** `widgets.create` — create a NEW widget instance and place it in one call. Distinct from
 * `widgets.place` (REQ-35, AC-25). */
const registerCreateTool: RouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/widgets/tools/create", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    const body = req.body ?? {};
    const parsed = parseCreateToolInput(body);
    if (!parsed) {
      respondBadTarget(res);
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const actor = { principalId: principal.id };
      const { instance } = await createWidgetInstance({
        deps: buildWidgetsDeps(deps),
        input: {
          workspaceId: deps.workspaceId,
          actor,
          widgetType: parsed.widgetType,
          title: parsed.title,
          config: parsed.config,
        },
      });

      try {
        const placeResult = await placeTarget(deps, deps.workspaceId, actor, parsed.target, instance.id);
        res.status(201).json({ tool: "widgets.create", widget: toAdminWidgetResponse(instance).widget, result: placeResult });
      } catch (placeErr) {
        // Finding D (Fable adversarial-review fix, 2026-07-21): placement failing AFTER the
        // instance was already created must not silently drop the created id — the instance is
        // real and persisted regardless of whether placement succeeded. Without this, a caller
        // (especially a retrying AI agent) sees only an error, has no way to know the instance
        // already exists, and mints a duplicate via a second `widgets.create` call instead of
        // retrying placement with `widgets.place`.
        const { status, body: errorBody } = widgetErrorToResponse(placeErr);
        res.status(status).json({ tool: "widgets.create", widget: toAdminWidgetResponse(instance).widget, placementFailed: true, ...errorBody });
      }
    } catch (err) {
      mapWidgetErrorToResponse(err, res);
    }
  });
};

/** `widgets.remove` — remove a PLACEMENT (region entry or embed node), never the widget instance
 * itself (that's `widgets.delete`/`.delete.force` via the ordinary CRUD routes). */
const registerRemoveTool: RouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/widgets/tools/remove", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    const body = req.body ?? {};
    const target = readTarget(body);
    if (!target || typeof body.placementId !== "string") {
      respondBadTarget(res);
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const actor = { principalId: principal.id };
      const result = await removePlacement(deps, deps.workspaceId, actor, target, body.placementId);
      res.status(200).json({ tool: "widgets.remove", result });
    } catch (err) {
      mapWidgetErrorToResponse(err, res);
    }
  });
};

/** `widgets.diagnose` — read-only: where-used + broken-reference state for one instance, sourced
 * entirely from the already-queryable `entry_refs` index (ADR-047 §5: "a broken widget reference
 * is already a queryable, first-class state, not new detection logic to build"). */
const registerDiagnoseTool: RouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/widgets/tools/diagnose/:widgetInstanceId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    try {
      const principal = await requireWidgetsPermissionOrRespond(deps.authorize, deps.workspaceId, "widgets.read", res);
      if (!principal) return;

      const widgetInstanceId = String(req.params.widgetInstanceId);
      const entry = await deps.entryRepo.findById({ workspaceId: deps.workspaceId, id: widgetInstanceId });
      const { exists, status } = resolveWidgetStatus(entry);
      const refs = await deps.entryRefsRepo.findByTarget({ workspaceId: deps.workspaceId, targetKind: "entry", targetId: widgetInstanceId });
      res.status(200).json({
        tool: "widgets.diagnose",
        exists,
        status,
        whereUsed: toWhereUsedResponse(refs),
      });
    } catch (err) {
      mapWidgetErrorToResponse(err, res);
    }
  });
};

export const registerAdminWidgetAgentToolsRoutes: RouteRegistrar = (app, deps) => {
  registerPlaceTool(app, deps);
  registerCreateTool(app, deps);
  registerRemoveTool(app, deps);
  registerDiagnoseTool(app, deps);
};
