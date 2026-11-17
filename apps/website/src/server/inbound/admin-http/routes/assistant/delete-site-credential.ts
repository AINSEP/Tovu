import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { ADMIN_ASSISTANT_PERMISSION, deleteSiteAssistantCredential } from "#src/assistant/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { AssistantSettingsRouteRegistrar } from "./deps.js";

/**
 * DELETE the workspace's SITE assistant credential (ADR-058) — clears the stored key only.
 * `provider`/`baseUrl`/`model` are left as they were (see `deleteSiteAssistantCredential`'s own
 * doc). Idempotent: deleting an already-unset key is a normal 200, not a 404 — this is "make sure no
 * key is stored," not "a key must currently exist." No sealer/keyring involved (clearing needs no
 * decrypt), so this cannot fail on a misconfigured site key either.
 */
export const registerAdminAssistantDeleteSiteCredentialRoute: AssistantSettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.delete("/api/admin/v1/workspaces/:workspaceId/assistant/site-credential", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: ADMIN_ASSISTANT_PERMISSION, workspaceId: deps.workspaceId, entityType: "assistant-settings" };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const view = await deleteSiteAssistantCredential(
        { repo: deps.siteAssistantCredentialRepo, clock: deps.clock },
        { workspaceId: deps.workspaceId }
      );
      res.json({ data: view });
    } catch (error) {
      sendAdminFailure({ res, error }, { operation: "routes/assistant/delete-site-credential", code: "INTERNAL_ERROR" });
    }
  });
};
