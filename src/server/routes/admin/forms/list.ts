import { toAdminFormDefinitionListResponse } from "#src/server/http/admin/forms";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { FormsRouteRegistrar } from "./deps.js";

/** GET the workspace's form definitions (`FORMS_LIST_DEFINITIONS`, api.spec.md §1). */
export const registerAdminFormsListRoute: FormsRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/forms", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.forms.manage",
        workspaceId: deps.workspaceId,
        entityType: "form_definition",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.forms.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.forms.manage", reason: authResult.reason },
        });
        return;
      }

      const definitions = await deps.formDefinitionRepo.list({ workspaceId: deps.workspaceId });
      res.json(toAdminFormDefinitionListResponse(definitions));
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
