import { ADMIN_ASSISTANT_PERMISSION, getPublicAssistantSettings } from "#src/assistant/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { AssistantSettingsRouteRegistrar } from "./deps.js";

/**
 * GET the workspace's `site.assistant.*` settings — today, the public assistant's master on/off
 * switch. Shape and error contract copied from `routes/admin/seo/get-settings.ts` deliberately, down
 * to the 404-on-workspace-mismatch and the `{ data }` envelope, so the admin client's existing
 * `request()` helper needs no special case.
 */
export const registerAdminAssistantGetSettingsRoute: AssistantSettingsRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/assistant/settings", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      await deps.assistantSettingsReady;
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: ADMIN_ASSISTANT_PERMISSION,
        workspaceId: deps.workspaceId,
        entityType: "assistant-settings",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for '${ADMIN_ASSISTANT_PERMISSION}' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: ADMIN_ASSISTANT_PERMISSION, reason: authResult.reason },
        });
        return;
      }

      const settings = await getPublicAssistantSettings(
        { settingsRepo: deps.settingsRepo, getEffective: deps.getEffective },
        { workspaceId: deps.workspaceId }
      );
      res.json({ data: settings });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
