import { buildWidgetsRegionDeps } from "#src/features/widgets/deps";
import { mutateWidgetAreaPlacements } from "#src/features/widgets/region-area-service";
import type { WidgetPlacementNode } from "#src/features/widgets/types";
import { mapWidgetErrorToResponse, toAdminWidgetAreaResponse } from "#src/server/inbound/admin-http/http/widgets";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteRegistrar } from "../../../../routes/types.js";

function isPlacementShape(value: unknown): value is { placementId: string; widgetEntryId: string; enabled: boolean } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.placementId === "string" && typeof v.widgetEntryId === "string" && typeof v.enabled === "boolean";
}

/**
 * Fable adversarial-review fix (2026-07-21, Finding H): the route previously only checked
 * `Array.isArray(body.placements)` — each element's shape was never validated, so client-supplied
 * duplicate `placementId`s and arbitrary extra properties passed straight through into the stored
 * area doc verbatim. Validates every element's shape, rejects duplicate `placementId`s (it is meant
 * to be a stable, unique locator — `entry_refs`' `fieldPath` and reorder/diagnostics all address a
 * placement by it), and returns a NORMALIZED array (exactly the three known fields) so nothing
 * extra a client sends ends up persisted. Returns `null` on any violation.
 */
function parsePlacements(raw: readonly unknown[]): WidgetPlacementNode[] | null {
  const placements: WidgetPlacementNode[] = [];
  const seenIds = new Set<string>();
  for (const item of raw) {
    if (!isPlacementShape(item)) return null;
    if (seenIds.has(item.placementId)) return null;
    seenIds.add(item.placementId);
    placements.push({ placementId: item.placementId, widgetEntryId: item.widgetEntryId, enabled: item.enabled });
  }
  return placements;
}

/**
 * PUT a region's whole placement list (SPEC-043 REQ-15/16), `widgets.place`-gated. Always a
 * whole-document, version-guarded write (INV-03) — never a per-placement patch endpoint, matching
 * `ui.spec.md` §4.6/§4.7's single `onSave` event over the full `placements` array.
 */
export const registerAdminWidgetRegionMutatePlacementsRoute: RouteRegistrar = (app, deps) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/widgets/regions/:regionKey", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const body = req.body ?? {};
    if (typeof body.baseVersion !== "number" || !Array.isArray(body.placements)) {
      res.status(400).json({ error: "baseVersion and placements[] are required", code: "VALIDATION_ERROR" });
      return;
    }
    const placements = parsePlacements(body.placements);
    if (!placements) {
      res.status(400).json({
        error: "each placement must be { placementId: string, widgetEntryId: string, enabled: boolean }, with no duplicate placementId",
        code: "VALIDATION_ERROR",
      });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const binding = await deps.widgetBindingRepo.findByRegion({ workspaceId: deps.workspaceId, regionKey: String(req.params.regionKey) });
      if (!binding) {
        res.status(404).json({ error: `region '${req.params.regionKey}' is not bound`, code: "WIDGETS_AREA_NOT_FOUND" });
        return;
      }

      const { areaEntry } = await mutateWidgetAreaPlacements({
        deps: buildWidgetsRegionDeps(deps),
        input: {
          workspaceId: deps.workspaceId,
          actor: { principalId: principal.id },
          areaEntryId: binding.areaEntryId,
          baseVersion: body.baseVersion,
          placements,
        },
      });
      res.status(200).json(toAdminWidgetAreaResponse(areaEntry));
    } catch (err) {
      mapWidgetErrorToResponse(err, res);
    }
  });
};
