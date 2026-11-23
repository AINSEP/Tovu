/**
 * @file Express adapter for the admin `forms` routes: maps forms/core errors to HTTP statuses and
 * bodies (errors.spec.md §2/§6). The DTO projections live in `@jini-ai/cms/admin-http/http/forms`;
 * this wire half stays with the host's routes because it writes to an Express `Response`.
 */
import type { Response } from "express";
import { ToolInputError } from "@jini-ai/core";
import { RecordVersionConflictError, versionConflictBody } from "@jini-ai/core/optimistic-concurrency";
import {
  FormDefinitionNotFoundError,
  FormFieldValidationError,
  FormSlugConflictError,
  FormSubmissionNotFoundError,
} from "@jini-ai/cms/forms";
import { ForbiddenError as CommandForbiddenError } from "@jini-ai/cms/core";

/**
 * Shared error -> HTTP mapping for every admin `forms` route (errors.spec.md §2/§6). Returns
 * `true` once it has written a response (caller should stop); `false` for an unrecognized error
 * (caller falls through to its own generic 500).
 */
export function mapFormsWriteError({ err, res }: { err: unknown; res: Response }, _optional = {}): boolean {
  if (err instanceof ToolInputError) {
    res.status(400).json({ error: err.message, code: "VALIDATION_ERROR" });
    return true;
  }
  if (err instanceof RecordVersionConflictError) {
    res.status(409).json(versionConflictBody({ error: err }));
    return true;
  }
  if (err instanceof CommandForbiddenError) {
    res.status(403).json({
      error: err.message,
      code: "FORBIDDEN",
      details: { permission: err.permission, reason: err.reason },
    });
    return true;
  }
  if (err instanceof FormFieldValidationError) {
    res.status(400).json({
      error: err.message,
      code: "FORMS_FIELD_VALIDATION_ERROR",
      details: { fieldErrors: err.fieldErrors },
    });
    return true;
  }
  if (err instanceof FormSlugConflictError) {
    res.status(409).json({ error: err.message, code: "FORMS_SLUG_CONFLICT", details: { slug: err.slug } });
    return true;
  }
  if (err instanceof FormDefinitionNotFoundError) {
    res.status(404).json({ error: err.message, code: "FORMS_DEFINITION_NOT_FOUND" });
    return true;
  }
  if (err instanceof FormSubmissionNotFoundError) {
    res.status(404).json({ error: err.message, code: "FORMS_SUBMISSION_NOT_FOUND" });
    return true;
  }
  return false;
}
