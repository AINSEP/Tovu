import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import { describeApiError, type AdminComment, type CommentModerationAction, type CommentStatus } from "../../../lib/api";
import { describeModerationError, emptyRowState, type RowActionState } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../comments-i18n";
import { defaultCommentQueuePort } from "./comment-queue-dependencies.hooks";
import type { CommentQueuePort } from "./comment-queue-port.hooks";

/**
 * @file `QueueSection`'s moderation-queue state — status filter, keyset-cursor paging, per-row
 * moderation state, and the Purge confirm dialog. Extracted verbatim from `Comments.tsx`; see that
 * file's own header for why `QueueSection` stays a private sub-component with no DI seam of its
 * own.
 *
 * Does not take `permissions` — the only thing that used it (the row-menu item builder) moved to
 * `rules.ts`'s `commentRowMenuItems`, called directly by the view, which already has `permissions`
 * in scope as `QueueSection`'s own prop. This hook has no use for it.
 *
 * `port`/`locale` are injected — see `comment-queue-port.hooks.ts` — rather than reaching
 * `lib/api`/`useAdminLocale()` directly, so a test can describe load/moderate/purge outcomes
 * against `createFakeCommentQueuePort` instead of stubbing global `fetch`. `useWiredCommentQueue`
 * below is the pair `Comments.tsx`'s `QueueSection` actually mounts.
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
  const [items, setItems] = useState<AdminComment[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [rowState, setRowState] = useState<Record<string, RowActionState>>({});
  // The comment a `RowMenu` "Purge" selection is asking to confirm — `null` when the dialog is
  // closed. `ConfirmDialog` stays mounted unconditionally below (see its own doc comment on why);
  // this is what drives its `open` prop. Row actions moved into `RowMenu` below (MSG-03 rollout);
  // Purge is the one that needed a real confirm step, so it's the one that gained this state — the
  // others (Approve/Spam/Trash/Restore) were never gated by anything and still aren't.
  const [pendingPurge, setPendingPurge] = useState<AdminComment | null>(null);

  function stateFor(id: string): RowActionState {
    return rowState[id] ?? emptyRowState();
  }

  function patchRowState(id: string, patch: Partial<RowActionState>) {
    setRowState((current) => ({ ...current, [id]: { ...emptyRowState(), ...current[id], ...patch } }));
  }

  function load(reset: boolean, forStatus: CommentStatus, cursor: string | null) {
    setError(null);
    port
      .listCommentsQueue({ status: forStatus, cursor: cursor ?? undefined })
      .then((r) => {
        setItems((current) => (reset || !current ? r.items : [...current, ...r.items]));
        setNextCursor(r.nextCursor);
      })
      .catch((e) => setError(describeApiError(e, t(locale, "failed to load the moderation queue"))))
      .finally(() => setLoadingMore(false));
  }

  useEffect(() => {
    setItems(null);
    load(true, status, null);
    // `port` is added — see `use-page-editor.hooks.ts`'s identical note: a function-scoped value
    // ESLint's exhaustive-deps rule can see, referentially stable in production, so this changes
    // nothing about when the effect re-runs. The rest of the pre-existing gap (`load` itself isn't
    // listed) predates this conversion — not this refactor's scope to fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, port]);

  function loadMore() {
    setLoadingMore(true);
    load(false, status, nextCursor);
  }

  /** Reloads page 1 of the current filter — the simplest correct way to reflect a moderation
   * action's effect (REQ-05's "refetching the row's queue page on success"): every action always
   * moves the comment to a different status than whatever the current filter is showing it under,
   * so a fresh first page is always the right post-action view. */
  function reloadFirstPage() {
    load(true, status, null);
  }

  async function onModerate(comment: AdminComment, action: CommentModerationAction) {
    if (stateFor(comment.id).busy) return;
    patchRowState(comment.id, { busy: true, error: null });
    try {
      await port.moderateComment({ commentId: comment.id, action, expectedVersion: comment.version });
      reloadFirstPage();
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
      reloadFirstPage();
    } catch (e) {
      patchRowState(comment.id, { busy: false, error: describeApiError(e, t(locale, "Failed to purge comment.")) });
    } finally {
      setPendingPurge(null);
    }
  }

  return {
    status,
    setStatus,
    items,
    nextCursor,
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
