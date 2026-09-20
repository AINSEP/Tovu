import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

import { describeApiError, type AdminTrashItem } from "@/lib/api";
import { useFetchQuery, useInvalidate } from "@/lib/fetch-query";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useContentRefreshSubscription } from "@/hooks/use-content-refresh-subscription.hooks";
import {
  allVisibleSelected,
  describePurgeReport,
  describeRestoreReport,
  KEYS,
  selectionAfterSelectAll,
  toggleSelection,
  TRASH_RESOURCE,
} from "../rules";
import { t } from "../trash-i18n";
import { defaultTrashPort } from "./trash-dependencies.hooks";
import type { TrashPort } from "./trash-port.hooks";

/**
 * @file All of the Trash screen's state. `Trash.tsx` is markup only.
 *
 * Page 1 is one `useFetchQuery` keyed on `KEYS.list()`; "Load more" pages accumulate locally, for
 * the same reason `use-comment-queue.hooks.ts` and `use-form-submissions.hooks.ts` keep theirs
 * local (one hook, one FIXED key — a cursor-appended list is exactly the shape that convention
 * warns against faking).
 *
 * `useContentRefreshSubscription` is not optional here. Four agent tools and four admin delete
 * paths write trash rows, so without it an operator who asks the assistant to delete a post sees
 * this screen keep reporting an empty Trash. There is no draft state to protect — the only local
 * state is a checkbox selection, and the selection is reconciled against the refreshed rows rather
 * than cleared (see `visibleItems`'s effect below), so a background refresh cannot make a
 * "Delete permanently" click act on a row that is no longer on screen.
 */

export interface TrashController {
  /** `null` until the first page settles. */
  items: AdminTrashItem[] | null;
  nextCursor: string | null;
  loadingMore: boolean;
  loadMore: () => void;
  error: string | null;
  /** One-line result of the last restore/purge. */
  notice: string | null;
  busy: boolean;

  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  toggleAll: () => void;
  allSelected: boolean;

  onRestoreSelected: () => Promise<void>;
  /** Open when the confirm modal is asking about the current selection. */
  purgeConfirmOpen: boolean;
  setPurgeConfirmOpen: Dispatch<SetStateAction<boolean>>;
  onPurgeConfirmed: () => Promise<void>;

  locale: string;
}

export interface TrashDependencies {
  port: TrashPort;
  locale: string;
}

export function useTrash(deps: TrashDependencies): TrashController {
  const { port, locale } = deps;
  const invalidate = useInvalidate();

  // Stable identity so the subscription effect does not resubscribe every render.
  const invalidateList = useCallback(() => invalidate(KEYS.listRoot), [invalidate]);
  useContentRefreshSubscription(TRASH_RESOURCE, invalidateList);

  const firstPage = useFetchQuery({ key: KEYS.list(), fetch: () => port.listTrash({}) });

  const [morePages, setMorePages] = useState<AdminTrashItem[]>([]);
  const [moreCursor, setMoreCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set<string>());
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false);

  useEffect(() => {
    setMoreCursor(firstPage.data?.nextCursor ?? null);
  }, [firstPage.data]);

  const items = firstPage.data ? [...firstPage.data.items, ...morePages] : null;

  // Reconcile the selection against what is actually on screen. A background refresh (an agent
  // restored something, the 60-day sweeper purged something) can remove a row mid-selection, and a
  // selection holding an id nobody can see any more would send it to the purge endpoint anyway.
  const visibleIds = items ? items.map((item) => item.id).join("\u0000") : null;
  useEffect(() => {
    if (visibleIds === null) return;
    const present = new Set(visibleIds.length > 0 ? visibleIds.split("\u0000") : []);
    setSelected((current) => {
      const kept = new Set([...current].filter((id) => present.has(id)));
      return kept.size === current.size ? current : kept;
    });
  }, [visibleIds]);

  async function loadMore() {
    if (!moreCursor) return;
    setLoadingMore(true);
    try {
      const page = await port.listTrash({ cursor: moreCursor });
      setMorePages((prev) => [...prev, ...page.items]);
      setMoreCursor(page.nextCursor);
    } catch (e) {
      setActionError(describeApiError(e, t(locale, "failed to load the Trash")));
    } finally {
      setLoadingMore(false);
    }
  }

  /** Drops the locally accumulated pages and refetches page 1 — the rows just moved. */
  function reloadAfterAction() {
    setMorePages([]);
    invalidate(KEYS.listRoot);
  }

  /** The rows the current selection actually names, resolved from what is on screen. */
  function selectedItems(): AdminTrashItem[] {
    return (items ?? []).filter((item) => selected.has(item.id));
  }

  async function onRestoreSelected() {
    const chosen = selectedItems();
    if (chosen.length === 0 || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const report = await port.restoreTrashItems({
        items: chosen.map((item) => ({ entityType: item.entityType, entityId: item.entityId })),
      });
      setNotice(describeRestoreReport(locale, report));
      setSelected(new Set<string>());
      reloadAfterAction();
    } catch (e) {
      setActionError(describeApiError(e, t(locale, "failed to restore")));
    } finally {
      setBusy(false);
    }
  }

  async function onPurgeConfirmed() {
    const chosen = selectedItems();
    if (chosen.length === 0 || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const report = await port.purgeTrashItems({ ids: chosen.map((item) => item.id) });
      setNotice(describePurgeReport(locale, report));
      setSelected(new Set<string>());
      setPurgeConfirmOpen(false);
      reloadAfterAction();
    } catch (e) {
      setActionError(describeApiError(e, t(locale, "failed to delete permanently")));
    } finally {
      setBusy(false);
    }
  }

  return {
    items,
    nextCursor: moreCursor,
    loadingMore,
    loadMore,
    error: firstPage.error ? describeApiError(firstPage.error, t(locale, "failed to load the Trash")) : actionError,
    notice,
    busy,
    selected,
    toggle: (id) => setSelected((current) => toggleSelection(current, id)),
    toggleAll: () =>
      setSelected((current) => selectionAfterSelectAll(items ?? [], allVisibleSelected(items ?? [], current))),
    allSelected: allVisibleSelected(items ?? [], selected),
    onRestoreSelected,
    purgeConfirmOpen,
    setPurgeConfirmOpen,
    onPurgeConfirmed,
    locale,
  };
}

/**
 * Binds the real client and the resolved locale — the zero-argument half of the
 * `useX(dependencies)` / `useWiredX()` pair, so `Trash.tsx` composes this and a test composes
 * {@link useTrash} with `createFakeTrashPort`.
 */
export function useWiredTrash(): TrashController {
  const locale = useAdminLocale();
  return useTrash({ port: defaultTrashPort, locale });
}
