import { useState } from "react";

import { describeApiError, type AdminFormSubmission } from "@/lib/api";
import { useFetchMutation, useFetchQuery } from "@/lib/fetch-query";
import { KEYS } from "../rules";
import { defaultFormSubmissionsPort } from "./form-submissions-dependencies.hooks";
import type { FormSubmissionsPort } from "./form-submissions-port.hooks";

/**
 * @file `FormSubmissionDetail`'s own state and delete action, so the detail view in
 * `FormEditor.tsx` is only markup.
 *
 * Permanent delete now confirms through a modal (S5 fix, 2026-09-20), not an inline two-click
 * button: the old `confirming`/`handleDelete` shape flipped a click's own label to "Confirm
 * delete", so a real double-click deleted the submission outright with no way to back out — the
 * same bug widgets' `trashOrPurge` had before its own `pendingPurge`/`ConfirmDialog` fix. This
 * hook now mirrors that shape one-for-one: `requestDelete` only opens the dialog (no network),
 * `cancelDelete` closes it with no request, and `confirmDelete` runs the mutation.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because
 * nothing outside `features/forms` needs it.
 *
 * `port` is injected — see `form-submissions-port.hooks.ts` (shared with `use-form-
 * submissions.hooks.ts`, since both read/write the same submissions list for a form) — rather than
 * importing `lib/api` directly, so a test can describe load/delete outcomes against
 * `createFakeFormSubmissionsPort` instead of stubbing global `fetch`.
 * `useWiredFormSubmissionDetail` below is the zero-argument pair `FormEditor.tsx` actually mounts.
 *
 * `lib/fetch-query` migration (2026-08-12): the load is one `useFetchQuery` keyed on
 * `KEYS.submissionDetail(formId, submissionId)` — a query cannot commit a response belonging to a
 * prior key, which eliminates the load race an external audit flagged at this file's old line 48
 * (a plain `.then()`/`.catch()` effect with no cancellation guard) by construction. `confirmDelete`
 * is a `useFetchMutation` that `invalidates: [KEYS.submissionsList(formId)]`, so the sibling list
 * (`use-form-submissions.hooks.ts`) refreshes on its own — `props.onDeleted()` now only needs to
 * clear the caller's `selectedId` (a UI-navigation concern this hook can't own), not also trigger a
 * reload, so `FormEditor.tsx`'s `onDeleted` callback drops its own `load()` call.
 */

export interface FormSubmissionDetailController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  submission: AdminFormSubmission | null;
  error: string | null;
  /** True while the "Delete permanently?" confirm dialog should be open — opened by
   *  {@link FormSubmissionDetailController.requestDelete}, closed by
   *  {@link FormSubmissionDetailController.cancelDelete} or once
   *  {@link FormSubmissionDetailController.confirmDelete} settles. */
  confirmOpen: boolean;
  deleting: boolean;
  /** Opens the confirm dialog. No network call — a click alone can never delete. */
  requestDelete: () => void;
  /** Closes the confirm dialog with no request. */
  cancelDelete: () => void;
  /** Runs the delete. On success, calls `props.onDeleted()`. Closes the dialog in `finally`
   *  either way, so a failed delete doesn't leave the operator stuck behind it — the failure is
   *  still visible via `error` below. */
  confirmDelete: () => Promise<void>;
}

export function useFormSubmissionDetail(
  props: {
    formId: string;
    submissionId: string;
    onDeleted: () => void;
  },
  port: FormSubmissionsPort
): FormSubmissionDetailController {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const list = useFetchQuery({
    key: KEYS.submissionDetail(props.formId, props.submissionId),
    fetch: () => port.getFormSubmission({ formId: props.formId, submissionId: props.submissionId }),
  });

  const deleteMutation = useFetchMutation({
    run: (_: undefined) => port.deleteFormSubmission({ formId: props.formId, submissionId: props.submissionId }),
    invalidates: [KEYS.submissionsList(props.formId)],
  });

  function requestDelete() {
    setConfirmOpen(true);
  }

  function cancelDelete() {
    setConfirmOpen(false);
  }

  async function confirmDelete() {
    try {
      await deleteMutation.mutate(undefined);
      props.onDeleted();
    } catch {
      // already surfaced through deleteMutation.error -> error below
    } finally {
      setConfirmOpen(false);
    }
  }

  const submission = list.data?.data ?? null;
  // The delete's own failure outranks a background load-refresh failure — flat `if`s rather than a
  // nested ternary, per `adapter.tanstack.tsx`'s `resolveFetchQueryStatus` doc on why the two carry
  // a different complexity-gate weight for the same branch count.
  let error: string | null = null;
  if (deleteMutation.error) {
    error = describeApiError(deleteMutation.error, "delete failed");
  } else if (list.error) {
    error = describeApiError(list.error, "failed to load submission");
  }

  return {
    submission,
    error,
    confirmOpen,
    deleting: deleteMutation.status === "pending",
    requestDelete,
    cancelDelete,
    confirmDelete,
  };
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
