import { useEffect, useState } from "react";

import { api, type AdminFormSubmission } from "../../../lib/api";

/**
 * @file `FormSubmissions`'s own state and paginated load, so the submissions list in
 * `FormEditor.tsx` is only markup.
 *
 * Extracted verbatim — same state, same cursor-append load, same error strings. `load` keeps its
 * original `(cursor?: string) => void` signature rather than being split into separate
 * "load"/"loadMore" functions, so both call sites (`load(nextCursor)` for "Load more",
 * `load()` after a submission delete) carry over unchanged.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because
 * nothing outside `features/forms` needs it.
 */

export interface FormSubmissionsController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  submissions: AdminFormSubmission[] | null;
  nextCursor: string | null;
  error: string | null;
  /** The submission `FormSubmissions` is showing `FormSubmissionDetail` for — `null` shows the
   *  plain list. */
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  /** Re-fetches. Passing a cursor appends to `submissions`; omitting it replaces the list from the
   *  start (used after a submission is deleted, so the list reflects the removal). */
  load: (cursor?: string) => void;
}

export function useFormSubmissions(props: { formId: string }): FormSubmissionsController {
  const [submissions, setSubmissions] = useState<AdminFormSubmission[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function load(cursor?: string) {
    api
      .listFormSubmissions({ formId: props.formId }, cursor ? { cursor } : {})
      .then((r) => {
        setSubmissions((prev) => (cursor ? [...(prev ?? []), ...r.data] : r.data));
        setNextCursor(r.nextCursor);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load submissions"));
  }

  useEffect(() => load(), [props.formId]);

  return { submissions, nextCursor, error, selectedId, setSelectedId, load };
}
