/**
 * @file Barrel for forms' cross-module data contract (ADS-memory/reports/architecture/
 * 2026-08-13-api-surface-trace-A.md, proposal F-1).
 *
 * Composition-root wiring (repo adapters, rate-limit profile, boot subscribers, write/submit
 * services) is deliberately NOT re-exported here — those stay reached by direct import, same as
 * `comments/index.ts`'s existing precedent. Only the port interfaces, shared record/field types,
 * and typed domain errors — the module's actual cross-feature contract — live behind this door.
 */
export type { FormDefinitionRepoPort, FormSubmissionRepoPort, RemoveFormSubmissionFn } from "./ports.js";
export { deleteFormSubmission, type DeleteFormSubmissionOutcome } from "./delete-submission.js";
export type {
  FieldDescriptor,
  FieldType,
  NotifyConfig,
  FormDefinitionStatus,
  FormDefinitionRecord,
  FormSubmissionRecord,
  FormSubmissionPage,
} from "./types.js";
export {
  FormFieldValidationError,
  FormSlugConflictError,
  FormDefinitionNotFoundError,
  FormSubmissionValidationError,
  FormSubmissionNotFoundError,
  FormRateLimitExceededError,
} from "./errors.js";
