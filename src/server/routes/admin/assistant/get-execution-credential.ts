import { getExecutionCredential } from "#src/assistant/execution-credential-store";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { AssistantSettingsRouteRegistrar } from "./deps";

/**
 * GET the calling admin's OWN BYOK execution credential — never the key itself, only whether one is
 * set and what it ends in. Scoped to `(deps.workspaceId, getAuthedPrincipal(res).id)`: there is no
 * `:principalId` in the path and none accepted from the request — an admin can only ever read their
 * own row, by construction, not by an authorization check. Shape and error contract mirror
 * `get-site-credential.ts`: same `{ data }` envelope, same 404-on-workspace-mismatch. Pure DB read
 * (`getExecutionCredential` never decrypts), so this cannot fail on a misconfigured master secret.
 */
export const registerAdminAssistantGetExecutionCredentialRoute: AssistantSettingsRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/assistant/execution-credential", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const view = await getExecutionCredential(
        { repo: deps.adminExecutionCredentialRepo },
        { workspaceId: deps.workspaceId, principalId: principal.id }
      );
      res.json({ data: view });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
