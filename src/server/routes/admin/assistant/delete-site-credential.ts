import { ADMIN_ASSISTANT_PERMISSION } from "#src/assistant/public-assistant-settings";
import { deleteSiteAssistantCredential } from "#src/assistant/site-credential-store";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { AssistantSettingsRouteRegistrar } from "./deps";

/**
 * DELETE the workspace's SITE assistant credential (ADR-058) — clears the stored key only.
 * `provider`/`baseUrl`/`model` are left as they were (see `deleteSiteAssistantCredential`'s own
 * doc). Idempotent: deleting an already-unset key is a normal 200, not a 404 — this is "make sure no
 * key is stored," not "a key must currently exist." No sealer/keyring involved (clearing needs no
 * decrypt), so this cannot fail on a misconfigured master secret either.
 */
export const registerAdminAssistantDeleteSiteCredentialRoute: AssistantSettingsRouteRegistrar = (app, deps) => {
  app.delete("/api/admin/v1/workspaces/:workspaceId/assistant/site-credential", async (req, res) => {
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

      const view = await deleteSiteAssistantCredential(
        { repo: deps.siteAssistantCredentialRepo, clock: deps.clock },
        { workspaceId: deps.workspaceId }
      );
      res.json({ data: view });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
