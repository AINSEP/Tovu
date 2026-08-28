import { useEffect, useRef, useState } from "react";

import { describeApiError, type AdminFormSubmission } from "@/lib/api";
import { useFetchQuery, useInvalidate } from "@/lib/fetch-query";
import { KEYS } from "../rules";
import { defaultFormSubmissionsPort } from "./form-submissions-dependencies.hooks";
import type { FormSubmissionsPort } from "./form-submissions-port.hooks";

/**
 * @file `FormSubmissions`'s own state and paginated load, so the submissions list in
 * `FormEditor.tsx` is only markup.
 *
 * Extracted verbatim — same cursor-append load shape, same error strings. `load` keeps its original
 * `(cursor?: string) => void` signature rather than being split into separate "load"/"loadMore"
 * functions, so both call sites (`load(nextCursor)` for "Load more", `load()` after a submission
 * delete) carry over unchanged.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because
 * nothing outside `features/forms` needs it.
 *
 * `port` is injected — see `form-submissions-port.hooks.ts` (shared with `use-form-submission-
 * detail.hooks.ts`, since both read/write the same submissions list for a form) — rather than
 * importing `lib/api` directly, so a test can describe list outcomes against
 * `createFakeFormSubmissionsPort` instead of stubbing global `fetch`. `useWiredFormSubmissions`
 * below is the zero-argument pair `FormEditor.tsx` actually mounts.
 *
 * `lib/fetch-query` migration (2026-08-12): the FIRST page is one `useFetchQuery` keyed on
 * `KEYS.submissionsList(formId)` — a query cannot commit a response belonging to a prior key, which
 * eliminates the load race an external audit flagged at this file's old line 56 (a plain
 * `.then()`/`.catch()` effect with no cancellation guard) for that page. Subsequent "Load more"
 * pages are NOT folded into that same query: `lib/fetch-query/types.ts`'s `QueryKey` doc binds one
 * hook to one FIXED key, and a cursor-appended page list is exactly the "moving-target key" shape
 * that doc's own Skip precedent (`useSettingsContainer`, see this migration's dispatch brief) warns
 * against faking — so accumulated pages stay local `useState`, fetched directly through `port`
 * (bypassing the cache, since an appended page is not a cacheable "the current state of X", it's an
 * accumulating view built by this one screen). `formIdRef` guards that accumulation against the
 * SAME class of race the base query gets for free: a `loadMore` in flight when `formId` changes
 * must not append the wrong form's rows once it resolves.
 *
 * The audit's second, more serious finding at this file — `selectedId` surviving a `formId` change
 * untouched, so a delete could fire against a submission id belonging to the PREVIOUS form while its
 * stale rows were still on screen — is fixed by the identity-reset effect below, which clears both
 * `selectedId` and the accumulated "more" pages whenever `formId` changes.
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
  const invalidate = useInvalidate();
  const firstPage = useFetchQuery({
    key: KEYS.submissionsList(props.formId),
    fetch: () => port.listFormSubmissions({ formId: props.formId }, {}),
  });

  const [morePages, setMorePages] = useState<AdminFormSubmission[]>([]);
  const [moreCursor, setMoreCursor] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Guards `loadMore` against the same class of race `useFetchQuery` closes for the first page: an
  // append in flight when `formId` changes must not land on the new form's screen once it resolves.
  const formIdRef = useRef(props.formId);

  // One effect, not two: `formIdRef`'s update and the state reset below both need to fire exactly
  // on a `formId` change, and merging them means `props.formId` is genuinely read in the body (the
  // `formIdRef.current` assignment), which is also what satisfies the lint rule that would
  // otherwise flag a dependency array entry never referenced inside the effect.
  //
  // The reset itself fixes the audit's data-loss finding at this file: `selectedId` used to
  // survive a `formId` change untouched, so a delete could fire against a submission id belonging
  // to the PREVIOUS form while its stale rows were still on screen. Also drops accumulated "more"
  // pages, which belong to the previous form's cursor walk.
  useEffect(() => {
    formIdRef.current = props.formId;
    setSelectedId(null);
    setMorePages([]);
    setMoreCursor(null);
  }, [props.formId]);

  useEffect(() => {
    setMoreCursor(firstPage.data?.nextCursor ?? null);
  }, [firstPage.data]);

  async function loadMore(cursor: string) {
    const formIdAtCall = props.formId;
    try {
      const r = await port.listFormSubmissions({ formId: formIdAtCall }, { cursor });
      if (formIdAtCall !== formIdRef.current) return; // stale — formId changed while this was in flight
      setMorePages((prev) => [...prev, ...r.data]);
      setMoreCursor(r.nextCursor);
    } catch (e) {
      if (formIdAtCall !== formIdRef.current) return;
      setMoreError(e instanceof Error ? e.message : "failed to load submissions");
    }
  }

  /** Passing a cursor appends via `loadMore`; omitting it re-reads the first page from scratch
   *  (used after a submission delete, so the list reflects the removal) and drops accumulated pages,
   *  matching the pre-migration `load()`'s own "no cursor replaces everything" behavior. */
  function load(cursor?: string) {
    if (cursor) {
      void loadMore(cursor);
      return;
    }
    setMorePages([]);
    invalidate(KEYS.submissionsList(props.formId));
  }

  const submissions = firstPage.data ? [...firstPage.data.data, ...morePages] : null;
  const error = moreError ?? (firstPage.error ? describeApiError(firstPage.error, "failed to load submissions") : null);

  return { submissions, nextCursor: moreCursor, error, selectedId, setSelectedId, load };
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
