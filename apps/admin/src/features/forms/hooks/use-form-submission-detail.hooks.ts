import { useEffect, useState } from "react";

import { api, type AdminFormSubmission } from "../../../lib/api";

/**
 * @file `FormSubmissionDetail`'s own state and delete action, so the detail view in
 * `FormEditor.tsx` is only markup.
 *
 * Extracted verbatim — same state, same load effect, same two-click confirm (`confirming` flips
 * true on the first click, the second actually deletes), same error strings.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because
 * nothing outside `features/forms` needs it.
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

export function useFormSubmissionDetail(props: {
  formId: string;
  submissionId: string;
  onDeleted: () => void;
}): FormSubmissionDetailController {
  const [submission, setSubmission] = useState<AdminFormSubmission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api
      .getFormSubmission({ formId: props.formId, submissionId: props.submissionId })
      .then((r) => setSubmission(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load submission"));
  }, [props.formId, props.submissionId]);

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await api.deleteFormSubmission({ formId: props.formId, submissionId: props.submissionId });
      props.onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete failed");
      setDeleting(false);
    }
  }

  return { submission, error, confirming, deleting, handleDelete };
}
