import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { FormsRouteRegistrar } from "./deps";

/** DELETE permanently removes one submission (`FORMS_DELETE_SUBMISSION`, REQ-14). */
export const registerAdminFormsDeleteSubmissionRoute: FormsRouteRegistrar = (app, deps) => {
  app.delete(
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
          permission: "admin.forms.submissions.delete",
          workspaceId: deps.workspaceId,
          entityType: "form_submission",
          entityId: submissionId,
        });
        if (!authResult.allowed) {
          res.status(403).json({
            error: `principal '${principal.id}' is not authorized for 'admin.forms.submissions.delete' (${authResult.reason})`,
            code: "FORBIDDEN",
            details: { permission: "admin.forms.submissions.delete", reason: authResult.reason },
          });
          return;
        }

        const submission = await deps.formSubmissionRepo.findById({ workspaceId: deps.workspaceId, id: submissionId });
        if (!submission || submission.formDefinitionId !== formId) {
          res
            .status(404)
            .json({ error: `submission '${submissionId}' was not found`, code: "FORMS_SUBMISSION_NOT_FOUND" });
          return;
        }

        await deps.formSubmissionRepo.delete({ workspaceId: deps.workspaceId, id: submissionId });
        res.status(204).end();
      } catch {
        res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
      }
    }
  );
};
