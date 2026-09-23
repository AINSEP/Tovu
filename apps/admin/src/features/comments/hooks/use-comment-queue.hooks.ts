import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { describeApiError, type AdminComment, type CommentModerationAction, type CommentStatus } from "@/lib/api";
import { useFetchQuery, useInvalidate } from "@/lib/fetch-query";
import { COMMENTS_QUEUE_RESOURCE, KEYS, describeModerationError, emptyRowState, type RowActionState } from "../rules";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useSettlementGeneration } from "@/hooks/use-settlement-generation.hooks";
import { useContentRefreshSubscription } from "@/hooks/use-content-refresh-subscription.hooks";
import { t } from "../comments-i18n";
import { defaultCommentQueuePort } from "./comment-queue-dependencies.hooks";
import type { CommentQueuePort } from "./comment-queue-port.hooks";

/**
 * @file `QueueSection`'s moderation-queue state — status filter, keyset-cursor paging, per-row
 * moderation state, and the Purge confirm dialog. Extracted verbatim from `Comments.tsx`.
 * `QueueSection` is defined and exported from `Comments.tsx` (see that file's own header for why it
 * lives there rather than its own file), and carries its own DI-seam prop (`useCommentQueueHook`,
 * 2026-08-14) plus a direct test (`QueueSection.unit.test.tsx`) — see `use-comments.hooks.ts`'s
 * header for why the earlier "no seam for these sections" rule no longer applies.
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
 * against faking) — `pageSettlement` (`useSettlementGeneration`, same primitive and shape as
 * `use-form-submissions.hooks.ts`'s own `pageSettlement`) guards that local accumulation against
 * the same class of race the base query gets for free: a `loadMore` in flight when `status`
 * changes, or when a content-refresh refetches page 1, must not append its page once it resolves —
 * see `resetMorePages` below, which mints a fresh generation on every reset so an older in-flight
 * page fetch is superseded. A synchronous `loadingMoreRef` lock, checked before minting a
 * generation, covers a same-tick double `loadMore` (2026-09-20, `plan-content2.md` S3).
 *
 * Per-row moderation state (`rowState`, `pendingPurge`) stays local `useState`, per this
 * migration's own dispatch brief: `comments` has per-row action state, and a single shared
 * mutation object cannot carry "which row" on its own. `onModerate`/`onPurge` therefore call
 * `port.moderateComment`/`port.purgeComment` directly (not through `useFetchMutation`) and use
 * `useInvalidate()` to refresh the queue on success — see `reloadAfterAction`'s own comment for why
 * that invalidates `KEYS.queueRoot` (every status) rather than just the current filter.
 *
 * `useContentRefreshSubscription` (staleness-bug generalization pass — see that hook's own header):
 * a moderation action from the assistant (an operator asks it to approve/spam/trash/restore a
 * comment) now invalidates `KEYS.queueRoot` the same way this hook's own `reloadAfterAction` does,
 * instead of leaving the queue showing a comment in its pre-write status until a manual reload. No
 * draft to protect here — every row's own edit state (`rowState`) is per-action busy/error tracking,
 * not typed text a background refresh could clobber, unlike `use-comment-settings.hooks.ts`'s
 * uncontrolled form (deliberately NOT given this same subscription — see that hook's own header).
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

  // Out-of-band writes — a moderation action from an assistant run (`comments_approve_comment` et
  // al., `apps/website/src/features/comments/agent-tools.ts`) — invalidate every status's cache the
  // same way `reloadAfterAction` below does for an operator's own action. Stable identity (not an
  // inline arrow) so `useContentRefreshSubscription`'s own effect does not unsubscribe/resubscribe
  // on every render — see `use-media.hooks.ts`'s identical `invalidateList` note.
  const invalidateQueue = useCallback(() => invalidate(KEYS.queueRoot), [invalidate]);
  useContentRefreshSubscription(COMMENTS_QUEUE_RESOURCE, invalidateQueue);

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

  // The "latest call wins" guard for accumulated pages — see the file header. `loadingMoreRef` is
  // the synchronous half (blocks a same-tick double `loadMore`); `pageSettlement` is the async half
  // (a superseded fetch's response must not land once a reset or a status switch has moved on).
  const loadingMoreRef = useRef(false);
  const pageSettlement = useSettlementGeneration();

  // Supersedes any in-flight "Load more" fetch and clears the accumulated pages/cursor/error back
  // to "just the first page" — called wherever the previous code did a bare `setMorePages([])`, so
  // there is one reset path instead of several ad hoc ones. Does NOT touch `rowState`: that belongs
  // to the status effect below, which still resets it directly (unrelated to page accumulation).
  const resetMorePages = useCallback(() => {
    pageSettlement.next();
    loadingMoreRef.current = false;
    setLoadingMore(false);
    setMorePages([]);
    setMoreError(null);
  }, [pageSettlement]);

  // Resets the accumulated pages/row state that belonged to the PREVIOUS filter, and supersedes
  // any of that filter's `loadMore` still in flight — including releasing its `loadingMore` lock,
  // which the old `statusAtCall !== statusRef.current` finally-check never did (a `loadMore`
  // in flight when `status` changed left `loadingMore` stuck true forever, since neither its
  // success nor its error branch's guard matched once the filter moved on).
  useEffect(() => {
    resetMorePages();
    setRowState({});
  }, [status, resetMorePages]);

  // A refetched first page (e.g. a content-refresh landing an assistant's moderation action) must
  // drop the "more" pages it used to leave stale — they are always a continuation of the CURRENT
  // first page, not whichever first page was on screen when they were fetched. `resetMorePages()`
  // also supersedes any `loadMore` already in flight when the refetch lands, so its page can't
  // append afterward.
  useEffect(() => {
    resetMorePages();
    setMoreCursor(firstPage.data?.nextCursor ?? null);
  }, [firstPage.data, resetMorePages]);

  function stateFor(id: string): RowActionState {
    return rowState[id] ?? emptyRowState();
  }

  function patchRowState(id: string, patch: Partial<RowActionState>) {
    setRowState((current) => ({ ...current, [id]: { ...emptyRowState(), ...current[id], ...patch } }));
  }

  async function loadMore() {
    if (!moreCursor) return;
    if (loadingMoreRef.current) return; // a same-tick double click sends only one request
    loadingMoreRef.current = true;
    const generation = pageSettlement.next();
    const statusAtCall = status;
    setLoadingMore(true);
    setMoreError(null); // a retry clears the previous failure
    try {
      const r = await port.listCommentsQueue({ status: statusAtCall, cursor: moreCursor });
      if (!pageSettlement.isCurrent(generation)) return; // superseded by a reset or a status switch
      setMorePages((prev) => [...prev, ...r.items]);
      setMoreCursor(r.nextCursor);
    } catch (e) {
      if (!pageSettlement.isCurrent(generation)) return;
      setMoreError(describeApiError(e, t(locale, "failed to load the moderation queue")));
    } finally {
      // A superseded call's lock was already released by `resetMorePages`; only the still-current
      // call releases it here.
      if (pageSettlement.isCurrent(generation)) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
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
    resetMorePages();
    invalidate(KEYS.queueRoot);
  }

  // Synchronous per-row duplicate-submit guard, shared by `onModerate`/`onPurge` below — a ref, not
  // `rowState`'s own `busy` flag, because a real double-click can fire two calls for the SAME
  // comment in the same synchronous tick, before React has re-rendered with `busy: true`.
  // `RowMenu`'s items carry no `disabled` state at all (`QueueActionsCell` builds every item
  // unconditionally, busy or not — this hook is the only gate), so two selections on one row — even
  // two DIFFERENT actions, e.g. Approve then Spam — could otherwise both pass the old state-based
  // check and both reach the port. Checked-then-set synchronously, so a second same-tick call always
  // observes the first's write; `rowState.busy` (state) still exists to let the UI show a busy row.
  const busyRowIdsRef = useRef<Set<string>>(new Set());

  async function onModerate(comment: AdminComment, action: CommentModerationAction) {
    if (busyRowIdsRef.current.has(comment.id)) return;
    busyRowIdsRef.current.add(comment.id);
    patchRowState(comment.id, { busy: true, error: null });
    try {
      await port.moderateComment({ commentId: comment.id, action, expectedVersion: comment.version });
      reloadAfterAction();
    } catch (e) {
      patchRowState(comment.id, { busy: false, error: describeModerationError(e, locale) });
    } finally {
      busyRowIdsRef.current.delete(comment.id);
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
    // Same synchronous guard as `onModerate` above — shares `busyRowIdsRef` with it since both
    // patch the same row's `rowState` entry.
    if (busyRowIdsRef.current.has(comment.id)) return;
    busyRowIdsRef.current.add(comment.id);
    patchRowState(comment.id, { busy: true, error: null });
    try {
      await port.purgeComment({ commentId: comment.id });
      reloadAfterAction();
    } catch (e) {
      patchRowState(comment.id, { busy: false, error: describeApiError(e, t(locale, "Failed to purge comment.")) });
    } finally {
      busyRowIdsRef.current.delete(comment.id);
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
