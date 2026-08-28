import { toAdminFormDefinitionResponse } from "#src/server/inbound/admin-http/http/forms";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { FormsRouteRegistrar } from "./deps.js";

/** GET one form definition by id (`FORMS_GET_DEFINITION`, REQ-04). */
export const registerAdminFormsGetRoute: FormsRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/forms/:formId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const formId = String(req.params.formId ?? "");

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.forms.manage",
        workspaceId: deps.workspaceId,
        entityType: "form_definition",
        entityId: formId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.forms.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.forms.manage", reason: authResult.reason },
        });
        return;
      }

      const definition = await deps.formDefinitionRepo.findById({ workspaceId: deps.workspaceId, id: formId });
      if (!definition) {
        res.status(404).json({ error: `form definition '${formId}' was not found`, code: "FORMS_DEFINITION_NOT_FOUND" });
        return;
      }
      res.json(toAdminFormDefinitionResponse(definition));
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
