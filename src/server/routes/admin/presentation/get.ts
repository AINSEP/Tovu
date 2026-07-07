import {
  getPresentationSettings,
  PresentationSettingsNotFoundError,
} from "../../../../features/presentation";
import { toAdminPresentationResponse } from "../../../../server/http/admin/presentation";
import type { RouteRegistrar } from "../../../routes/types";

export const registerAdminPresentationGetRoute: RouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/presentation", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const result = await getPresentationSettings({
        deps: { repo: deps.presentationRepo },
        input: { workspaceId: deps.workspaceId },
      });

      res.json(toAdminPresentationResponse(result.settings, result.availableThemeIds));
    } catch (err) {
      if (err instanceof PresentationSettingsNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};
