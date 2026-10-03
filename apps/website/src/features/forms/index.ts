/**
 * @file Barrel for forms' cross-module data contract (ADS-memory/reports/architecture/
 * 2026-08-13-api-surface-trace-A.md, proposal F-1).
 *
 * Composition-root wiring (repo adapters, rate-limit profile, boot subscribers, write/submit
 * services) is deliberately NOT re-exported here — those stay reached by direct import, same as
 * `comments/index.ts`'s existing precedent. Only the port interfaces, shared record/field types,
 * and typed domain errors — the module's actual cross-feature contract — live behind this door.
 */
export type { FormDefinitionRepoPort } from "@jini-ai/cms-forms";
export type { FormSubmissionRepoPort, RemoveFormSubmissionFn } from "./ports.js";
export { deleteFormSubmission, type DeleteFormSubmissionOutcome } from "./delete-submission.js";
// Record/field safety rationale: Jini/packages/cms/forms/src/types.ts (SPEC-010, ADR-PIPE-010).
export type {
  FieldDescriptor,
  FieldType,
  NotifyConfig,
  FormDefinitionStatus,
  FormDefinitionRecord,
  FormSubmissionRecord,
  FormSubmissionPage,
} from "@jini-ai/cms-forms";
// Typed errors and disabled-as-not-found policy: Jini/packages/cms/forms/src/errors.ts (SPEC-010).
export {
  FormFieldValidationError,
  FormSlugConflictError,
  FormDefinitionNotFoundError,
  FormSubmissionValidationError,
  FormSubmissionNotFoundError,
  FormRateLimitExceededError,
} from "@jini-ai/cms-forms";
