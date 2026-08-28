import type { AdminFormSubmission } from "@/lib/api";

/**
 * @file What `useFormSubmissions` and `useFormSubmissionDetail` need from the outside world, as an
 * interface rather than a direct `lib/api` import.
 *
 * A separate port from `forms-port.hooks.ts` rather than folding in: submissions are a distinct
 * sub-resource (`AdminFormSubmission`, not `AdminFormDefinition`) with no method overlap with form
 * CRUD. Shared between these two hooks because both read/write the SAME submissions list for a
 * form — `useFormSubmissions` lists it, `useFormSubmissionDetail` deletes one row from it — the
 * same "genuinely matches" shape `redirects-port.hooks.ts` names for its own three hooks.
 */
export interface FormSubmissionsPort {
  listFormSubmissions(
    target: { formId: string },
    options?: { cursor?: string; limit?: number }
  ): Promise<{ data: AdminFormSubmission[]; nextCursor: string | null }>;
  getFormSubmission(target: { formId: string; submissionId: string }): Promise<{ data: AdminFormSubmission }>;
  deleteFormSubmission(target: { formId: string; submissionId: string }): Promise<void>;
}
