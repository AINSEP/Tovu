import {
  getPresentationSettings,
  PresentationSettingsNotFoundError,
} from "../../../../features/presentation";
import { validThemeIds } from "../../../../features/theme";
import { toAdminPresentationResponse } from "../../../../server/http/admin/presentation";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps";

/**
 * GET presentation settings (active theme + available themes).
 *
 * Gated by the existing `theme.set` permission — there is no dedicated read permission for
 * presentation settings in the catalog, and `activeThemeId` is currently the only field this
 * resource has, so the same permission that gates changing it also gates reading it (same
 * single-permission-per-domain reasoning as `member.manage`). Disclosed explicitly in the
 * Programmer handoff since this reuses a write-shaped permission name for a read route.
 */
export const registerAdminPresentationGetRoute: ContentRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/presentation", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "theme.set",
        workspaceId: deps.workspaceId,
        entityType: "presentation",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'theme.set' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "theme.set", reason: authResult.reason },
        });
        return;
      }

      const result = await getPresentationSettings({
        deps: { repo: deps.presentationRepo, availableThemeIds: validThemeIds(deps.themes) },
        input: { workspaceId: deps.workspaceId },
      });

      res.json(toAdminPresentationResponse({ settings: result.settings, availableThemeIds: result.availableThemeIds }));
    } catch (err) {
      if (err instanceof PresentationSettingsNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};
