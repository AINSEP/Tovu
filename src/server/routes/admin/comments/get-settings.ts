import { getCommentsSettings } from "../../../../comments";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { RouteRegistrar } from "../../../routes/types";

/** GET workspace-level `comments.*` settings (SPEC-035, ADR-028 Settings Layered Ledger wiring
 * for Comments). Mirrors `routes/admin/seo/get-settings.ts`'s exact shape. */
export const registerAdminCommentsGetSettingsRoute: RouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/comments/settings", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      await deps.commentsSettingsReady;
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "comments.configure",
        workspaceId: deps.workspaceId,
        entityType: "comments-settings",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'comments.configure' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "comments.configure", reason: authResult.reason },
        });
        return;
      }

      const settings = await getCommentsSettings({ settingsRepo: deps.settingsRepo }, { workspaceId: deps.workspaceId });
      res.json({ data: settings });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
