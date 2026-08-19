import { deleteExecutionCredential } from "#src/assistant/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { AssistantSettingsRouteRegistrar } from "./deps.js";

/**
 * DELETE the calling admin's OWN BYOK execution credential — clears the stored key only.
 * `protocol`/`providerId`/`baseUrl`/`model`/`maxTokens` are left as they were (see
 * `deleteExecutionCredential`'s own doc). Idempotent: deleting an already-unset key is a normal 200.
 * No sealer/keyring involved, so this cannot fail on a misconfigured master secret. Scoped to
 * `(deps.workspaceId, getAuthedPrincipal(res).id)` — an admin can only ever clear their own row.
 */
export const registerAdminAssistantDeleteExecutionCredentialRoute: AssistantSettingsRouteRegistrar = (app, deps) => {
  app.delete("/api/admin/v1/workspaces/:workspaceId/assistant/execution-credential", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const view = await deleteExecutionCredential(
        { repo: deps.adminExecutionCredentialRepo, clock: deps.clock },
        { workspaceId: deps.workspaceId, principalId: principal.id }
      );
      res.json({ data: view });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
