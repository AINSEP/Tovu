import { deleteFormSubmission } from "#src/features/forms/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { FormsRouteDeps, FormsRouteRegistrar } from "./deps.js";
import { resolveFormDefinitionByIdOrSlug } from "./resolve-definition.js";

/** DELETE moves one submission to the Trash (`FORMS_DELETE_SUBMISSION`). A submission of another
 *  form reads as not-found, same as a missing one (`deleteFormSubmission`). */
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

        // Slug first, id second — same rationale as `list-submissions.ts`/`get-by-id.ts`: the
        // Submissions tab URL is /admin/forms/:slug, and `FormEditor.tsx` passes that same route
        // param straight through as `formId` here.
        const definition = await resolveFormDefinitionByIdOrSlug(deps, formId);
        if (!definition) {
          res.status(404).json({ error: `form definition '${formId}' was not found`, code: "FORMS_DEFINITION_NOT_FOUND" });
          return;
        }

        // Moves it to the Trash; restore or a permanent delete happens from the Trash screen.
        const outcome = await deleteFormSubmission(
          {
            workspaceId: deps.workspaceId,
            form: { id: definition.id, name: definition.name },
            submissionId,
            actor: { principalId: principal.id, pluginId: null },
          },
          { submissionRepo: deps.formSubmissionRepo, remove: deps.removeFormSubmission, clock: deps.clock }
        );
        if (!outcome.ok && outcome.reason === "not-found") {
          res
            .status(404)
            .json({ error: `submission '${submissionId}' was not found`, code: "FORMS_SUBMISSION_NOT_FOUND" });
          return;
        }
        if (!outcome.ok) {
          res
            .status(409)
            .json({ error: `submission '${submissionId}' changed while it was being deleted`, code: "TRASH_VERSION_CHANGED" });
          return;
        }
        res.status(204).end();
      } catch {
        res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
      }
    }
  );
};
