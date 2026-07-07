import {
  PresentationSettingsNotFoundError,
  PresentationSettingsValidationError,
  setActiveTheme,
} from "../../../../features/presentation";
import { validThemeIds } from "../../../../features/theme";
import { toAdminPresentationResponse } from "../../../../server/http/admin/presentation";
import type { RouteRegistrar } from "../../../routes/types";

export const registerAdminPresentationPatchRoute: RouteRegistrar = (app, deps) => {
  app.patch("/api/admin/v1/workspaces/:workspaceId/presentation", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
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
