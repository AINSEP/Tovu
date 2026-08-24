import type { Request } from "express";

import { toAdminFormSubmissionListResponse } from "#src/server/http/admin/forms";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { FormsRouteRegistrar } from "./deps.js";

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
export const registerAdminFormsListSubmissionsRoute: FormsRouteRegistrar = (app, deps) => {
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
        formDefinitionId: formId,
        limit: parsedQuery.limit,
        cursor: parsedQuery.cursor,
      });
      res.json(toAdminFormSubmissionListResponse(page));
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
