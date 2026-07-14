/**
 * @file Typed domain errors for `forms` (SPEC-010 errors.spec.md §2).
 *
 * Purpose:
 * One class per error this module originates; route handlers map these 1:1 to the HTTP codes in
 * api.spec.md §6. Mirrors the `features/settings/errors.ts` / `PostConflictError`-style
 * convention already used throughout this codebase.
 */

/** `FORMS_FIELD_VALIDATION_ERROR` (400) — field descriptors or a definition write are invalid. */
export class FormFieldValidationError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors: Array<{ field: string; reason: string }> = []
  ) {
    super(message);
  }
}

/** `FORMS_SLUG_CONFLICT` (409) — the workspace already has a definition at this slug. */
export class FormSlugConflictError extends Error {
  constructor(
    message: string,
    public readonly slug: string
  ) {
    super(message);
  }
}

/** `FORMS_DEFINITION_NOT_FOUND` (404) — also covers "disabled" by design (REQ-07/AC-12). */
export class FormDefinitionNotFoundError extends Error {}

/** `FORMS_SUBMISSION_VALIDATION_ERROR` (400) — a public submission payload fails validation. */
export class FormSubmissionValidationError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors: Array<{ field: string; reason: string }> = []
  ) {
    super(message);
  }
}

/** `FORMS_SUBMISSION_NOT_FOUND` (404). */
export class FormSubmissionNotFoundError extends Error {}

/** `FORMS_RATE_LIMIT_EXCEEDED` (429). */
export class FormRateLimitExceededError extends Error {
  constructor(
    message: string,
    public readonly retryAfterSeconds: number
  ) {
    super(message);
  }
}
