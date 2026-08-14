import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { describeApiError, type AdminComment, type CommentModerationAction, type CommentStatus } from "../../../lib/api";
import { useFetchQuery, useInvalidate } from "../../../lib/fetch-query";
import { KEYS, describeModerationError, emptyRowState, type RowActionState } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../comments-i18n";
import { defaultCommentQueuePort } from "./comment-queue-dependencies.hooks";
import type { CommentQueuePort } from "./comment-queue-port.hooks";

/**
 * @file `QueueSection`'s moderation-queue state — status filter, keyset-cursor paging, per-row
 * moderation state, and the Purge confirm dialog. Extracted verbatim from `Comments.tsx`.
 * `QueueSection` stays a private, unexported sub-component of `Comments.tsx` (see that file's own
 * header for why), but it DOES carry its own DI-seam prop (`useCommentQueueHook`, 2026-08-14) —
 * see `use-comments.hooks.ts`'s header for why the earlier "no seam for private sub-components"
 * rule was reversed.
 *
 * Does not take `permissions` — the only thing that used it (the row-menu item builder) moved to
 * `rules.ts`'s `commentRowMenuItems`, called directly by the view, which already has `permissions`
 * in scope as `QueueSection`'s own prop. This hook has no use for it.
 *
 * `port`/`locale` are injected — see `comment-queue-port.hooks.ts` — rather than reaching
 * `lib/api`/`useAdminLocale()` directly, so a test can describe load/moderate/purge outcomes
 * against `createFakeCommentQueuePort` instead of stubbing global `fetch`. `useWiredCommentQueue`
 * below is the pair `Comments.tsx`'s `QueueSection` actually mounts.
 *
 * `lib/fetch-query` migration (2026-08-12): page 1 for the current `status` filter is one
 * `useFetchQuery` keyed on `KEYS.queue(status)` — a query cannot commit a response belonging to a
 * prior key, so switching filters mid-flight can no longer land a stale status's page on screen.
 * Subsequent "Load more" pages are NOT folded into that query, for the identical reason
 * `forms/hooks/use-form-submissions.hooks.ts` keeps its own cursor-appended pages local (see that
 * file's own doc comment: `lib/fetch-query/types.ts`'s `QueryKey` doc binds one hook to one FIXED
 * key, and a cursor-appended page list is exactly the shape that doc's Skip precedent warns
 * against faking) — `statusRef` guards that local accumulation against the same class of race the
 * base query gets for free.
 *
 * Per-row moderation state (`rowState`, `pendingPurge`) stays local `useState`, per this
 * migration's own dispatch brief: `comments` has per-row action state, and a single shared
 * mutation object cannot carry "which row" on its own. `onModerate`/`onPurge` therefore call
 * `port.moderateComment`/`port.purgeComment` directly (not through `useFetchMutation`) and use
 * `useInvalidate()` to refresh the queue on success — see `reloadAfterAction`'s own comment for why
 * that invalidates `KEYS.queueRoot` (every status) rather than just the current filter.
 */

export interface CommentQueueController {
  status: CommentStatus;
  setStatus: Dispatch<SetStateAction<CommentStatus>>;
  /** `null` until the first page for the current status settles. */
  items: AdminComment[] | null;
  nextCursor: string | null;
  error: string | null;
  loadingMore: boolean;
  loadMore: () => void;
  /** Per-row moderation state, falling back to the empty state for a row with no action taken
   *  yet. */
  stateFor: (id: string) => RowActionState;
  onModerate: (comment: AdminComment, action: CommentModerationAction) => Promise<void>;
  /** The comment a `RowMenu` "Purge" selection is asking to confirm; `null` when the dialog is
   *  closed. `ConfirmDialog` stays mounted unconditionally in the view (see its own doc comment on
   *  why); this is what drives its `open` prop. */
  pendingPurge: AdminComment | null;
  setPendingPurge: Dispatch<SetStateAction<AdminComment | null>>;
  onPurge: () => Promise<void>;
}

export interface CommentQueueDependencies {
  port: CommentQueuePort;
  locale: string;
}

export function useCommentQueue(deps: CommentQueueDependencies): CommentQueueController {
  const { port, locale } = deps;
  const [status, setStatus] = useState<CommentStatus>("pending");
  const invalidate = useInvalidate();

  const firstPage = useFetchQuery({ key: KEYS.queue(status), fetch: () => port.listCommentsQueue({ status }) });

  const [morePages, setMorePages] = useState<AdminComment[]>([]);
  const [moreCursor, setMoreCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowActionState>>({});
  // The comment a `RowMenu` "Purge" selection is asking to confirm — `null` when the dialog is
  // closed. `ConfirmDialog` stays mounted unconditionally below (see its own doc comment on why);
  // this is what drives its `open` prop. Row actions moved into `RowMenu` below (MSG-03 rollout);
  // Purge is the one that needed a real confirm step, so it's the one that gained this state — the
  // others (Approve/Spam/Trash/Restore) were never gated by anything and still aren't.
  const [pendingPurge, setPendingPurge] = useState<AdminComment | null>(null);

  // Guards `loadMore` against the same class of race `useFetchQuery` closes for page 1: an append
  // in flight when `status` changes must not land under the new filter once it resolves. Also
  // resets the accumulated pages/row state that belonged to the PREVIOUS filter.
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
    setMorePages([]);
    setRowState({});
    setMoreError(null);
  }, [status]);

  useEffect(() => {
    setMoreCursor(firstPage.data?.nextCursor ?? null);
  }, [firstPage.data]);

  function stateFor(id: string): RowActionState {
    return rowState[id] ?? emptyRowState();
  }

  function patchRowState(id: string, patch: Partial<RowActionState>) {
    setRowState((current) => ({ ...current, [id]: { ...emptyRowState(), ...current[id], ...patch } }));
  }

  async function loadMore() {
    if (!moreCursor) return;
    const statusAtCall = status;
    setLoadingMore(true);
    try {
      const r = await port.listCommentsQueue({ status: statusAtCall, cursor: moreCursor });
      if (statusAtCall !== statusRef.current) return; // stale — status filter changed while this was in flight
      setMorePages((prev) => [...prev, ...r.items]);
      setMoreCursor(r.nextCursor);
    } catch (e) {
      if (statusAtCall !== statusRef.current) return;
      setMoreError(describeApiError(e, t(locale, "failed to load the moderation queue")));
    } finally {
      if (statusAtCall === statusRef.current) setLoadingMore(false);
    }
  }

  /** Reflects a moderation action's effect (REQ-05's "refetching the row's queue page on
   * success") — but invalidates `KEYS.queueRoot`, every status's cached page, not just the current
   * filter's. See `rules.ts`'s `KEYS` doc for why: an action always moves the comment to a
   * DIFFERENT status than the one currently filtered, so a previously-visited OTHER status tab's
   * cache would otherwise stay stale (missing the comment) until the operator happened to force a
   * reload — a gap the pre-migration `reloadFirstPage()` had too, just invisibly, since nothing
   * cached a prior visit to reveal it. Also drops the current filter's accumulated "more" pages,
   * which belonged to the pre-action list. */
  function reloadAfterAction() {
    setMorePages([]);
    invalidate(KEYS.queueRoot);
  }

  async function onModerate(comment: AdminComment, action: CommentModerationAction) {
    if (stateFor(comment.id).busy) return;
    patchRowState(comment.id, { busy: true, error: null });
    try {
      await port.moderateComment({ commentId: comment.id, action, expectedVersion: comment.version });
      reloadAfterAction();
    } catch (e) {
      patchRowState(comment.id, { busy: false, error: describeModerationError(e) });
    }
  }

  /** Confirmation now gates via a `ConfirmDialog` modal, reached through `RowMenu`'s "Purge" item
   *  (`setPendingPurge` below), rather than `window.confirm` — same upgrade `Posts.tsx`/`Pages.tsx`
   *  already made for their own Delete. Copy is the exact previous sentence, unchanged: states the
   *  consequence ("permanently delete") and explicitly "this cannot be undone" because, unlike
   *  Trash (a status this same menu can restore from), a purge genuinely has no way back. Dialog
   *  always closes on settle (success or failure) — a failure surfaces via this row's own existing
   *  `rs.error` mechanism, same place every other moderation action's failure already shows up. */
  async function onPurge() {
    if (!pendingPurge) return;
    const comment = pendingPurge;
    if (stateFor(comment.id).busy) return;
    patchRowState(comment.id, { busy: true, error: null });
    try {
      await port.purgeComment({ commentId: comment.id });
      reloadAfterAction();
    } catch (e) {
      patchRowState(comment.id, { busy: false, error: describeApiError(e, t(locale, "Failed to purge comment.")) });
    } finally {
      setPendingPurge(null);
    }
  }

  const items = firstPage.data ? [...firstPage.data.items, ...morePages] : null;
  const error = moreError ?? (firstPage.error ? describeApiError(firstPage.error, t(locale, "failed to load the moderation queue")) : null);

  return {
    status,
    setStatus,
    items,
    nextCursor: moreCursor,
    error,
    loadingMore,
    loadMore,
    stateFor,
    onModerate,
    pendingPurge,
    setPendingPurge,
    onPurge,
  };
}

/**
 * Binds the real `/api/.../comments/queue` client and the resolved `useAdminLocale()` value — see
 * `comment-queue-dependencies.hooks.ts`. The zero-argument-deps half of the `useX(dependencies)` /
 * `useWiredX()` pair, so `Comments.tsx`'s `QueueSection` composes this and a test composes
 * {@link useCommentQueue} with `createFakeCommentQueuePort`.
 */
export function useWiredCommentQueue(): CommentQueueController {
  const locale = useAdminLocale();
  return useCommentQueue({ port: defaultCommentQueuePort, locale });
}
