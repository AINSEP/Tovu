import { toAdminFormSubmissionResponse } from "#src/server/inbound/admin-http/http/forms";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { FormsRouteRegistrar } from "./deps.js";
import { resolveFormDefinitionByIdOrSlug } from "./resolve-definition.js";

/** GET one submission's full field values (`FORMS_GET_SUBMISSION`, REQ-13). */
export const registerAdminFormsGetSubmissionRoute: FormsRouteRegistrar = (app, deps) => {
  app.get(
    "/api/admin/v1/workspaces/:workspaceId/forms/:formId/submissions/:submissionId",
    async (req, res) => {
      if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
        res.status(404).json({ error: "workspace was not found" });
        return;
      }

      const formId = String(req.params.formId ?? "");
      const submissionId = String(req.params.submissionId ?? "");

      try {
        const principal = getAuthedPrincipal(res);
        const authResult = await deps.authorize({
          principalId: principal.id,
          permission: "admin.forms.submissions.read",
          workspaceId: deps.workspaceId,
          entityType: "form_submission",
          entityId: submissionId,
        });
        if (!authResult.allowed) {
          res.status(403).json({
            error: `principal '${principal.id}' is not authorized for 'admin.forms.submissions.read' (${authResult.reason})`,
            code: "FORBIDDEN",
            details: { permission: "admin.forms.submissions.read", reason: authResult.reason },
          });
          return;
        }

        // Slug first, id second — same rationale as `list-submissions.ts`/`get-by-id.ts`: the
        // Submissions tab URL is /admin/forms/:slug, and `FormEditor.tsx` passes that same route
        // param straight through as `formId` here.
        const definition = await resolveFormDefinitionByIdOrSlug(deps, formId);
        if (!definition) {
          res.status(404).json({ error: `form definition '${formId}' was not found`, code: "FORMS_DEFINITION_NOT_FOUND" });
          return;
        }

        const submission = await deps.formSubmissionRepo.findById({ workspaceId: deps.workspaceId, id: submissionId });
        if (!submission || submission.formDefinitionId !== definition.id) {
          res
            .status(404)
            .json({ error: `submission '${submissionId}' was not found`, code: "FORMS_SUBMISSION_NOT_FOUND" });
          return;
        }
        res.json(toAdminFormSubmissionResponse(submission));
      } catch {
        res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
      }
    }
  );
};
