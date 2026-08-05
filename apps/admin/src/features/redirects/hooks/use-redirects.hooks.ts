import { useState } from "react";

import { api, type AdminRedirect } from "../../../lib/api";
import { useFetchMutation, useFetchQuery, type QueryStatus } from "../../../lib/fetch-query";
import { KEYS, buildCreateRedirectPayload, firstWriteError, isAnyWritePending, nextRedirectStatus, visibleRedirectsError } from "../rules";

/**
 * @file Everything the Redirects LIST screen does, so `Redirects.tsx` is only markup.
 *
 * First screen migrated off the admin's `useState`-triple convention onto `lib/fetch-query` (see
 * the original file-header comment, now on `Redirects.tsx`, for the pilot rationale) — extracted
 * here verbatim: same three independent mutations, same delete-confirm state, same error
 * precedence. `HitCountCell` and `ImportRedirectsForm` are separate components with their own
 * hooks (`use-hit-count-cell.hooks.ts`, `use-import-redirects-form.hooks.ts`) since each is
 * independently testable without rendering the list screen around it.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because
 * nothing outside `features/redirects` needs it.
 */

export interface RedirectsController {
  redirects: AdminRedirect[] | undefined;
  /** Mirrors `useFetchQuery`'s own `status` — the caller decides the full-screen loading/error
   *  guard from this plus `redirects`, same shape as `list.status` in the pre-extraction code. */
  listStatus: QueryStatus;
  /** Raw list-read failure, for the full-screen guard (`listStatus === "error" && !redirects`). */
  listError: Error | null;
  /** The banner error actually shown once a list has loaded — see `visibleRedirectsError`. */
  error: Error | null;
  saving: boolean;
  /** The rule a `RowMenu` "Delete" selection is asking to confirm — `null` when the dialog is
   *  closed. `ConfirmDialog` stays mounted unconditionally in the view; this drives its `open`. */
  pendingDelete: AdminRedirect | null;
  setPendingDelete: (rule: AdminRedirect | null) => void;
  confirmDelete: () => void;
  /** Drives `ConfirmDialog`'s `pending` prop — true only while the confirmed delete itself is in
   *  flight, not for the other two writes. */
  deletePending: boolean;
  createRedirect: (form: FormData) => void;
  onToggleStatus: (rule: AdminRedirect) => void;
  onRequestDelete: (rule: AdminRedirect) => void;
}

export function useRedirects(): RedirectsController {
  const list = useFetchQuery({ key: KEYS.list, fetch: () => api.listRedirects() });

  // Each write names the cache it affects rather than calling a loader; the
  // list refetches because it is mounted under that key, not because this
  // component remembered to ask it to.
  const createRule = useFetchMutation({
    run: (form: FormData) => api.createRedirect(buildCreateRedirectPayload(form)),
    invalidates: [KEYS.list],
  });

  const toggleStatus = useFetchMutation({
    run: (rule: AdminRedirect) => api.updateRedirect({ id: rule.id }, { status: nextRedirectStatus(rule.status) }),
    invalidates: [KEYS.list],
  });

  const removeRule = useFetchMutation({
    run: (rule: AdminRedirect) => api.tombstoneRedirect(rule.id),
    invalidates: [KEYS.list],
  });

  // The rule a `RowMenu` "Delete" selection is asking to confirm — `null` when the dialog is
  // closed. `ConfirmDialog` stays mounted unconditionally in the view (see its own doc comment on
  // why); this is what drives its `open` prop. Row action moved off the in-place two-click
  // `ConfirmButton` control (MSG-03 rollout) — see `Roles.tsx`'s `onDeleteRole` comment for why a
  // `RowMenu` item needs `ConfirmDialog`, not `ConfirmButton`, to hold the confirm step.
  const [pendingDelete, setPendingDelete] = useState<AdminRedirect | null>(null);

  function confirmDelete() {
    if (!pendingDelete) return;
    const rule = pendingDelete;
    clearOtherWriteErrors(removeRule);
    // `.catch` BEFORE `.finally`, and both are load-bearing. `mutate()`'s own promise arrives with
    // a rejection handler already attached (`adapter.tanstack.tsx`'s `call` wrapper), which is what
    // makes the bare `void mutate(...)` form used by `createRedirect`/`onToggleStatus` safe. But
    // `.finally()` builds a NEW derived promise that re-throws the rejection, and handling the
    // original does not retroactively handle a chain derived from it — so a failed delete raised a
    // process-level `unhandledRejection`, in production as well as under the runner. Swallowing
    // here loses nothing: the failure is already surfaced through `removeRule.error` -> `error`.
    void removeRule
      .mutate(rule)
      .catch(() => {})
      .finally(() => setPendingDelete(null));
  }

  const writes = [createRule, toggleStatus, removeRule];
  const saving = isAnyWritePending(writes);
  const writeError = firstWriteError(writes);
  const error = visibleRedirectsError({ writeError, saving, listError: list.error });

  /**
   * Clears the OTHER writes' failures before starting one.
   *
   * The pre-migration code kept a single shared `error` and each handler opened
   * with `setError(null)`, so any new write wiped the previous one's message.
   * Three independent mutations do not inherit that: each keeps its own error
   * until reset, and `firstWriteError` returns creation order rather than recency —
   * so a failed Create would keep its banner on screen after a later, entirely
   * successful Disable, blaming an operation that worked. `mutate` already
   * clears the active mutation's own error, so only its siblings need this.
   */
  function clearOtherWriteErrors(active: { reset: () => void }) {
    for (const write of writes) if (write !== active) write.reset();
  }

  function createRedirect(form: FormData) {
    clearOtherWriteErrors(createRule);
    void createRule.mutate(form);
  }

  // `disabled={saving}` on the old inline buttons guarded against a second write firing while any
  // of this screen's writes (create/toggle/delete) is in flight — `RowMenu`'s `items` has no
  // per-item `disabled`, so that guard lives in each handler below instead. Functionally identical
  // (no double-submission); the only loss is the greyed-out visual cue while `saving` is true, a
  // presentation detail, not a dropped confirmation or destructive/warning classification.
  function onToggleStatus(rule: AdminRedirect) {
    if (saving) return;
    clearOtherWriteErrors(toggleStatus);
    void toggleStatus.mutate(rule);
  }

  function onRequestDelete(rule: AdminRedirect) {
    if (saving) return;
    setPendingDelete(rule);
  }

  return {
    redirects: list.data?.data,
    listStatus: list.status,
    listError: list.error,
    error,
    saving,
    pendingDelete,
    setPendingDelete,
    confirmDelete,
    deletePending: removeRule.status === "pending",
    createRedirect,
    onToggleStatus,
    onRequestDelete,
  };
}
