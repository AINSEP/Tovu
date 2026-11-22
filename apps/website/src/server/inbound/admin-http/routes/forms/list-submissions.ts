import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import type { Request } from "express";

import { toAdminFormSubmissionListResponse } from "@jini-ai/cms/admin-http/http/forms";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { FormsRouteRegistrar } from "./deps.js";
import { resolveFormDefinitionByIdOrSlug } from "./resolve-definition.js";

const DEFAULT_LIMIT = 50;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

/** Parsed+validated `?limit=`/`?cursor=` pair, or the reason validation failed. */
type ParsedSubmissionsQuery =
  | { readonly ok: true; readonly limit: number; readonly cursor: string | undefined }
  | { readonly ok: false; readonly error: string; readonly field: string; readonly reason: string };

/**
 * Parses and validates `?limit=`/`?cursor=` in one place — `limit` must be an integer in
 * `[MIN_LIMIT, MAX_LIMIT]`, defaulting to `DEFAULT_LIMIT` when omitted; `cursor`, if present, must
 * be a string.
 *
 * @complexity O(1).
 */
function parseSubmissionsQuery(query: Request["query"]): ParsedSubmissionsQuery {
  const rawLimit = query.limit !== undefined ? Number(query.limit) : DEFAULT_LIMIT;
  if (!Number.isInteger(rawLimit) || rawLimit < MIN_LIMIT || rawLimit > MAX_LIMIT) {
    return {
      ok: false,
      error: `limit must be an integer between ${MIN_LIMIT} and ${MAX_LIMIT}`,
      field: "limit",
      reason: `must be ${MIN_LIMIT}-${MAX_LIMIT}`,
    };
  }
  if (query.cursor !== undefined && typeof query.cursor !== "string") {
    return { ok: false, error: "cursor must be a string", field: "cursor", reason: "must be a string" };
  }
  return { ok: true, limit: rawLimit, cursor: query.cursor as string | undefined };
}

/** GET submissions for a form definition, newest-first (`FORMS_LIST_SUBMISSIONS`, REQ-13). */
export const registerAdminFormsListSubmissionsRoute: FormsRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/forms/:formId/submissions", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    const formId = String(req.params.formId ?? "");

    try {
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: "admin.forms.submissions.read", workspaceId: deps.workspaceId, entityType: "form_submission" };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      // Slug first, id second — the Submissions tab URL is /admin/forms/:slug, and
      // `FormEditor.tsx` passes that same route param straight through as `formId` here (see
      // `resolve-definition.ts`), same as the sibling GET-by-id route already does.
      const definition = await resolveFormDefinitionByIdOrSlug({ deps, formId });
      if (!definition) {
        res.status(404).json({ error: `form definition '${formId}' was not found`, code: "FORMS_DEFINITION_NOT_FOUND" });
        return;
      }

      const parsedQuery = parseSubmissionsQuery(req.query);
      if (!parsedQuery.ok) {
        res.status(400).json({
          error: parsedQuery.error,
          code: "FORMS_FIELD_VALIDATION_ERROR",
          details: { fieldErrors: [{ field: parsedQuery.field, reason: parsedQuery.reason }] },
        });
        return;
      }

      const page = await deps.formSubmissionRepo.listByDefinition({
        workspaceId: deps.workspaceId,
        formDefinitionId: definition.id,
        limit: parsedQuery.limit,
      }, { cursor: parsedQuery.cursor });
      res.json(toAdminFormSubmissionListResponse(page));
    } catch (error) {
      sendAdminFailure({ res, error }, { operation: "routes/forms/list-submissions", code: "INTERNAL_ERROR" });
    }
  });
};
