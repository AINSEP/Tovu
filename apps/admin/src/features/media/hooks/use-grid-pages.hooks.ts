import { useCallback, useRef, useState } from "react";

import type { AdminMedia, MediaGridOrder, MediaGridPage, MediaGridTab } from "@jini-ai/core/contracts/site/cms-admin-media";
import type { useFetchQuery as UseFetchQuery } from "@jini-ai/ui/fetch-query";
import { KEYS } from "@jini-ai/admin/screens/media/rules";

/**
 * @file The Media grid's server-paged read: page one through the shared query cache, further pages
 * and the exact deep-link lookup through the same port. Why-comment — sorting or filtering one fetched
 * page cannot reproduce a globally ordered, filtered list, so the tab, the order and the counts are
 * always the server's answer and this hook never re-sorts, re-filters or re-counts what it holds.
 */

/** Rows asked per page; the route bounds this to 1..100. */
export const GRID_PAGE_SIZE = 50;

/** The one view of the grid a request is for. */
export interface MediaGridView { tab: MediaGridTab; orderBy: MediaGridOrder }

/** One request's paging: a page size, the previous page's opaque cursor, or one exact asset. */
export interface MediaGridPageRequest { limit?: number; cursor?: string; itemId?: string }

/** The admin route a grid page is read from. */
export interface MediaGridPort {
  listMediaGrid: (view: MediaGridView, page?: MediaGridPageRequest) => Promise<MediaGridPage>;
}

/** What {@link useGridPages} needs; the query hook is injected like every other hook. */
export interface GridPagesDeps extends MediaGridView {
  port: MediaGridPort;
  useFetchQuery: typeof UseFetchQuery;
}

/** Everything the screen reads from the grid. */
export interface GridPages {
  /** Loaded rows in the server's order, or `null` until page one settles. */
  items: AdminMedia[] | null;
  /** The deep-link asset fetched by exact lookup when it is not among the loaded rows. */
  exactItem: AdminMedia | null;
  /** Workspace-wide counts per tab from the server, never counted from loaded rows. */
  counts: MediaGridPage["counts"] | null;
  hasUntypedActive: boolean;
  error: Error | null;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: Error | null;
  loadMore: () => Promise<void>;
  retryLoadMore: () => Promise<void>;
}

/** Pages after page one, valid only for the page-one answer (`base`) they were read after. */
interface MorePages { base: MediaGridPage | undefined; rows: AdminMedia[]; cursor: string | null; loading: boolean; error: Error | null }

const NO_MORE: MorePages = { base: undefined, rows: [], cursor: null, loading: false, error: null };

/** Page one plus the pages read after that same answer, each asset once. @complexity O(n) in loaded rows. */
function mergeRows({ first, more }: { first: MediaGridPage; more: MorePages | null }, _optional: Record<string, never> = {}): AdminMedia[] {
  const seen = new Set<string>();
  return [...first.media, ...(more?.rows ?? [])].filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)));
}

/**
 * Reads the grid for one tab and order: page one from the cache, `loadMore` for the next page. A page
 * that returns after the tab, the order or page one itself changed (a sort, a tab switch, a mutation
 * refresh) belongs to a view nobody is looking at and is dropped, never appended.
 * @complexity O(n) in loaded rows per render; one request per page.
 */
export function useGridPages(required: GridPagesDeps, optional: { itemId?: string | null } = {}): GridPages {
  const { port, tab, orderBy, useFetchQuery } = required;
  const itemId = optional.itemId ?? null;
  const first = useFetchQuery({ key: [...KEYS.list, "grid", tab, orderBy], fetch: () => port.listMediaGrid({ tab, orderBy }, { limit: GRID_PAGE_SIZE }) });
  const [state, setState] = useState<MorePages>(NO_MORE);
  const current = useRef(first.data);
  current.current = first.data;
  const more = state.base === first.data && first.data !== undefined ? state : null;
  const items = first.data ? mergeRows({ first: first.data, more }) : null;
  const cursor = more ? more.cursor : first.data?.nextCursor ?? null;
  const loaded = itemId !== null && (items?.some((item) => item.id === itemId) ?? false);
  const exact = useFetchQuery(
    { key: [...KEYS.list, "grid-item", tab, itemId ?? ""], fetch: () => port.listMediaGrid({ tab, orderBy }, { itemId: itemId ?? "" }) },
    { enabled: itemId !== null && first.data !== undefined && !loaded },
  );

  const loadMore = useCallback(async (): Promise<void> => {
    const base = first.data;
    if (!base || cursor === null || more?.loading) return;
    const rows = more?.rows ?? [];
    setState({ base, rows, cursor, loading: true, error: null });
    try {
      const page = await port.listMediaGrid({ tab, orderBy }, { limit: GRID_PAGE_SIZE, cursor });
      if (current.current !== base) return;
      setState({ base, rows: [...rows, ...page.media], cursor: page.nextCursor, loading: false, error: null });
    } catch (failure) {
      if (current.current !== base) return;
      setState({ base, rows, cursor, loading: false, error: failure instanceof Error ? failure : new Error("more media could not be loaded") });
    }
  }, [first.data, cursor, more, port, tab, orderBy]);

  return {
    items,
    exactItem: loaded ? null : exact.data?.media[0] ?? null,
    counts: first.data?.counts ?? null,
    hasUntypedActive: first.data?.hasUntypedActive ?? false,
    error: first.error,
    hasMore: cursor !== null,
    loadingMore: more?.loading ?? false,
    loadMoreError: more?.error ?? null,
    loadMore,
    retryLoadMore: loadMore,
  };
}
