import { useEffect, useState } from "react";

import type { AdminFormSubmission } from "../../../lib/api";
import { defaultFormSubmissionsPort } from "./form-submissions-dependencies.hooks";
import type { FormSubmissionsPort } from "./form-submissions-port.hooks";

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
 *
 * `port` is injected — see `form-submissions-port.hooks.ts` (shared with `use-form-submission-
 * detail.hooks.ts`, since both read/write the same submissions list for a form) — rather than
 * importing `lib/api` directly, so a test can describe list outcomes against
 * `createFakeFormSubmissionsPort` instead of stubbing global `fetch`. `useWiredFormSubmissions`
 * below is the zero-argument pair `FormEditor.tsx` actually mounts.
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

export function useFormSubmissions(props: { formId: string }, port: FormSubmissionsPort): FormSubmissionsController {
  const [submissions, setSubmissions] = useState<AdminFormSubmission[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function load(cursor?: string) {
    port
      .listFormSubmissions({ formId: props.formId }, cursor ? { cursor } : {})
      .then((r) => {
        setSubmissions((prev) => (cursor ? [...(prev ?? []), ...r.data] : r.data));
        setNextCursor(r.nextCursor);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load submissions"));
  }

  useEffect(() => load(), [props.formId, port]);

  return { submissions, nextCursor, error, selectedId, setSelectedId, load };
}

/**
 * Binds the real `/api/.../forms/:id/submissions` client — see
 * `form-submissions-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `FormEditor.tsx`
 * composes this and a test composes {@link useFormSubmissions} with
 * `createFakeFormSubmissionsPort`.
 */
export function useWiredFormSubmissions(props: { formId: string }): FormSubmissionsController {
  return useFormSubmissions(props, defaultFormSubmissionsPort);
}
