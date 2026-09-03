import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { FormsRouteDeps, FormsRouteRegistrar } from "./deps.js";
import { resolveFormDefinitionByIdOrSlug } from "./resolve-definition.js";

/**
 * Looks up a submission and confirms it belongs to `definitionId` — a real submission id scoped to
 * a DIFFERENT form must read as not-found here, same as an id that doesn't exist at all. Extracted
 * from the route handler below so the `||` this comparison needed collapses to a single `if` at the
 * call site (cyclomatic-complexity gate, not a behavior change — see AC-20/forms-submissions.test.ts
 * for the cross-form-mismatch regression test this preserves).
 */
async function findSubmissionScopedToDefinition(
  deps: Pick<FormsRouteDeps, "workspaceId" | "formSubmissionRepo">,
  definitionId: string,
  submissionId: string
) {
  const submission = await deps.formSubmissionRepo.findById({ workspaceId: deps.workspaceId, id: submissionId });
  return submission && submission.formDefinitionId === definitionId ? submission : undefined;
}

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

        // Slug first, id second — same rationale as `list-submissions.ts`/`get-by-id.ts`: the
        // Submissions tab URL is /admin/forms/:slug, and `FormEditor.tsx` passes that same route
        // param straight through as `formId` here.
        const definition = await resolveFormDefinitionByIdOrSlug(deps, formId);
        if (!definition) {
          res.status(404).json({ error: `form definition '${formId}' was not found`, code: "FORMS_DEFINITION_NOT_FOUND" });
          return;
        }

        const submission = await findSubmissionScopedToDefinition(deps, definition.id, submissionId);
        if (!submission) {
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
