import { toAdminFormSubmissionListResponse } from "../../../http/admin/forms";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { RouteRegistrar } from "../../../routes/types";

const DEFAULT_LIMIT = 50;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

/** GET submissions for a form definition, newest-first (`FORMS_LIST_SUBMISSIONS`, REQ-13). */
export const registerAdminFormsListSubmissionsRoute: RouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/forms/:formId/submissions", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const formId = String(req.params.formId ?? "");

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.forms.submissions.read",
        workspaceId: deps.workspaceId,
        entityType: "form_submission",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.forms.submissions.read' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.forms.submissions.read", reason: authResult.reason },
        });
        return;
      }

      const definition = await deps.formDefinitionRepo.findById({ workspaceId: deps.workspaceId, id: formId });
      if (!definition) {
        res.status(404).json({ error: `form definition '${formId}' was not found`, code: "FORMS_DEFINITION_NOT_FOUND" });
        return;
      }

      const rawLimit = req.query.limit !== undefined ? Number(req.query.limit) : DEFAULT_LIMIT;
      if (!Number.isInteger(rawLimit) || rawLimit < MIN_LIMIT || rawLimit > MAX_LIMIT) {
        res.status(400).json({
          error: `limit must be an integer between ${MIN_LIMIT} and ${MAX_LIMIT}`,
          code: "FORMS_FIELD_VALIDATION_ERROR",
          details: { fieldErrors: [{ field: "limit", reason: `must be ${MIN_LIMIT}-${MAX_LIMIT}` }] },
        });
        return;
      }
      const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;

      const page = await deps.formSubmissionRepo.listByDefinition({
        workspaceId: deps.workspaceId,
        formDefinitionId: formId,
        limit: rawLimit,
        cursor,
      });
      res.json(toAdminFormSubmissionListResponse(page));
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
