import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { ADMIN_ASSISTANT_PERMISSION, getSiteAssistantCredential } from "#src/assistant/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { AssistantSettingsRouteRegistrar } from "./deps.js";

/**
 * GET the workspace's SITE assistant credential (ADR-058) — never the key itself, only whether one
 * is set and what it ends in. Shape and error contract copied from `get-settings.ts` in this same
 * directory: same auth gate, same `{ data }` envelope, same 404-on-workspace-mismatch. The safe length hint is derived
 * by a server-only open. An open failure still leaves metadata readable, so this route cannot
 * fail on a misconfigured site key the way PUT can.
 */
export const registerAdminAssistantGetSiteCredentialRoute: AssistantSettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/assistant/site-credential", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: ADMIN_ASSISTANT_PERMISSION, workspaceId: deps.workspaceId, entityType: "assistant-settings" };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const view = await getSiteAssistantCredential(
        { repo: deps.siteAssistantCredentialRepo, sealer: deps.siteAssistantSecretSealer },
        { workspaceId: deps.workspaceId }
      );
      res.json({ data: view });
    } catch (error) {
      sendAdminFailure({ res, error }, { operation: "routes/assistant/get-site-credential", code: "INTERNAL_ERROR" });
    }
  });
};
