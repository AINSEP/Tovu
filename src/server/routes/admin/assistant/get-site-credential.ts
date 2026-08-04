import { ADMIN_ASSISTANT_PERMISSION } from "#src/assistant/public-assistant-settings";
import { getSiteAssistantCredential } from "#src/assistant/site-credential-store";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { AssistantSettingsRouteRegistrar } from "./deps";

/**
 * GET the workspace's SITE assistant credential (ADR-058) — never the key itself, only whether one
 * is set and what it ends in. Shape and error contract copied from `get-settings.ts` in this same
 * directory: same auth gate, same `{ data }` envelope, same 404-on-workspace-mismatch. Pure DB read
 * (`getSiteAssistantCredential` never decrypts — see that function's own doc), so this route cannot
 * fail on a misconfigured master secret the way PUT can.
 */
export const registerAdminAssistantGetSiteCredentialRoute: AssistantSettingsRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/assistant/site-credential", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
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

      const view = await getSiteAssistantCredential(
        { repo: deps.siteAssistantCredentialRepo },
        { workspaceId: deps.workspaceId }
      );
      res.json({ data: view });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
