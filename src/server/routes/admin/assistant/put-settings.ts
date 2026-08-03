import {
  ADMIN_ASSISTANT_PERMISSION,
  PublicAssistantSettingsValidationError,
  setPublicAssistantSettings,
} from "#src/assistant/public-assistant-settings";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { AssistantSettingsRouteRegistrar } from "./deps";

/**
 * PUT (partial) the workspace's `site.assistant.*` settings — the route the admin's AI Assistant
 * screen flips the public switch through. Mirrors `routes/admin/seo/put-settings.ts` exactly: same
 * auth gate as the matching GET, same `{ data }` envelope, same 400-on-validation /
 * 500-on-everything-else split, and the same return of the settings AS THEY NOW READ so the client
 * renders the persisted truth rather than the value it optimistically sent.
 */
export const registerAdminAssistantPutSettingsRoute: AssistantSettingsRouteRegistrar = (app, deps) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/assistant/settings", async (req, res) => {
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

      const settings = await setPublicAssistantSettings(
        {
          settingsRepo: deps.settingsRepo,
          clock: deps.clock,
          ids: deps.idGen,
          authorize: deps.authorize,
          principals: deps.principalRepo,
        },
        { workspaceId: deps.workspaceId, patch: req.body ?? {}, callerPrincipalId: principal.id }
      );
      res.json({ data: settings });
    } catch (err) {
      if (err instanceof PublicAssistantSettingsValidationError) {
        res.status(400).json({ error: err.message, code: "ASSISTANT_SETTINGS_VALIDATION_ERROR" });
        return;
      }
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
