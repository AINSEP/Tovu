import {
  PresentationSettingsNotFoundError,
  PresentationSettingsValidationError,
  setActiveTheme,
} from "../../../../features/presentation";
import { validThemeIds } from "../../../../features/theme";
import { toAdminPresentationResponse } from "../../../../server/http/admin/presentation";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps";

/**
 * PATCH the active theme.
 *
 * Gated by the existing `theme.set` permission, checked directly via `authorize()` — mirrors
 * `members/disable.ts`'s pattern since `setActiveTheme` is a direct feature call, not routed
 * through the SPEC-001 command gateway.
 */
export const registerAdminPresentationPatchRoute: ContentRouteRegistrar = (app, deps) => {
  app.patch("/api/admin/v1/workspaces/:workspaceId/presentation", async (req, res) => {
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

      const result = await setActiveTheme({
        deps: {
          repo: deps.presentationRepo,
          clock: deps.clock,
          availableThemeIds: validThemeIds(deps.themes),
        },
        input: {
          workspaceId: deps.workspaceId,
          activeThemeId: String(req.body?.activeThemeId ?? ""),
        },
      });

      res.json(toAdminPresentationResponse(result.settings, result.availableThemeIds));
    } catch (err) {
      if (err instanceof PresentationSettingsValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }

      if (err instanceof PresentationSettingsNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};
