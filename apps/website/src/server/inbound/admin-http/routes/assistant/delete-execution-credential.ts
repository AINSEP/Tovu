import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { deleteExecutionCredential } from "#src/assistant/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { AssistantSettingsRouteRegistrar } from "./deps.js";

/**
 * DELETE the calling admin's OWN BYOK execution credential — clears the stored key only.
 * `protocol`/`providerId`/`baseUrl`/`model`/`maxTokens` are left as they were (see
 * `deleteExecutionCredential`'s own doc). Idempotent: deleting an already-unset key is a normal 200.
 * No sealer/keyring involved, so this cannot fail on a misconfigured site key. Scoped to
 * `(deps.workspaceId, getAuthedPrincipal(res).id)` — an admin can only ever clear their own row.
 */
export const registerAdminAssistantDeleteExecutionCredentialRoute: AssistantSettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.delete("/api/admin/v1/workspaces/:workspaceId/assistant/execution-credential", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = getAuthedPrincipal(res);
      const view = await deleteExecutionCredential(
        { repo: deps.adminExecutionCredentialRepo, clock: deps.clock },
        { workspaceId: deps.workspaceId, principalId: principal.id }
      );
      res.json({ data: view });
    } catch (error) {
      sendAdminFailure({ res, error }, { operation: "routes/assistant/delete-execution-credential", code: "INTERNAL_ERROR" });
    }
  });
};
