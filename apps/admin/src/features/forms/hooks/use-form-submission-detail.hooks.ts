import { useEffect, useState } from "react";

import type { AdminFormSubmission } from "../../../lib/api";
import { defaultFormSubmissionsPort } from "./form-submissions-dependencies.hooks";
import type { FormSubmissionsPort } from "./form-submissions-port.hooks";

/**
 * @file `FormSubmissionDetail`'s own state and delete action, so the detail view in
 * `FormEditor.tsx` is only markup.
 *
 * Extracted verbatim — same state, same load effect, same two-click confirm (`confirming` flips
 * true on the first click, the second actually deletes), same error strings.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because
 * nothing outside `features/forms` needs it.
 *
 * `port` is injected — see `form-submissions-port.hooks.ts` (shared with `use-form-
 * submissions.hooks.ts`, since both read/write the same submissions list for a form) — rather than
 * importing `lib/api` directly, so a test can describe load/delete outcomes against
 * `createFakeFormSubmissionsPort` instead of stubbing global `fetch`.
 * `useWiredFormSubmissionDetail` below is the zero-argument pair `FormEditor.tsx` actually mounts.
 */

export interface FormSubmissionDetailController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  submission: AdminFormSubmission | null;
  error: string | null;
  /** True after the first "Delete submission" click — the second click (still `handleDelete`)
   *  performs the actual delete. */
  confirming: boolean;
  deleting: boolean;
  handleDelete: () => void;
}

export function useFormSubmissionDetail(
  props: {
    formId: string;
    submissionId: string;
    onDeleted: () => void;
  },
  port: FormSubmissionsPort
): FormSubmissionDetailController {
  const [submission, setSubmission] = useState<AdminFormSubmission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    port
      .getFormSubmission({ formId: props.formId, submissionId: props.submissionId })
      .then((r) => setSubmission(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load submission"));
  }, [props.formId, props.submissionId, port]);

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await port.deleteFormSubmission({ formId: props.formId, submissionId: props.submissionId });
      props.onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete failed");
      setDeleting(false);
    }
  }

  return { submission, error, confirming, deleting, handleDelete };
}

/**
 * Binds the real `/api/.../forms/:id/submissions` client — see
 * `form-submissions-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `FormEditor.tsx`
 * composes this and a test composes {@link useFormSubmissionDetail} with
 * `createFakeFormSubmissionsPort`.
 */
export function useWiredFormSubmissionDetail(props: {
  formId: string;
  submissionId: string;
  onDeleted: () => void;
}): FormSubmissionDetailController {
  return useFormSubmissionDetail(props, defaultFormSubmissionsPort);
}
