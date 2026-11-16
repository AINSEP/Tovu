# admin/features/database (W1 #34, level 3): 2 slices
Written 2026-11-16 from Tovu b28d38c6 / Jini b7666092 (refactor/terra); skeleton by make-sheet.py.
kind: UI (feature label, medium confidence). KIND-SUSPECT fired on all 6 DELETE files (real bodies). Re-kinded:
  - the 6 `*-port.hooks.ts` / `*-dependencies.hooks.ts` files: not dead, not Jini-bound; they ARE the wired-hooks convention (development/docs/architecture/wired-hooks-convention.md:24-28). Slice DL-admin-database-1 = BLOCKED on owner question Q-WH (same question as sheets/delete-admin-analytics.md). Recommendation: STAY, drop from the plan. No sheet body is written for them until Q-WH is answered "inline" (then copy the analytics sheet's M1-M3 pattern per section: port interface -> its use-*-section hook, default port -> same hook, fake -> its unit test).
      guarded for that future sheet (blobs at b28d38c6): migrate-forward-section-dependencies 5df8315ce7cbbf9f892be75c233350b79baeb3df, migrate-forward-section-port 83c13fc6de9a3cc715d512ff13f4dbbed814843d, schema-state-section-dependencies 464e708f73a4920566bb75426dc65b2688f32f05, schema-state-section-port 83b68053461597e8772e6457f2ea5e70d4f59ecf, timeline-section-dependencies fa500ca99f501da3cf404eab336557ccf3cc59d9, timeline-section-port 5864b388a8b476293d36c49e6247cf8a0560a432 (all under apps/admin/src/features/database/hooks/).
  - use-timeline-section.hooks.ts (MIXED, 230 loc): SPLIT, generic half is a hook -> slice SP-admin-database-2, READY. Tier: Sonnet executes; Opus wrote the split (no further review needed).
untangle_overlap: none.

## Slice SP-admin-database-2 (T-SPLIT): useCursorPages into @jini-ai/ui/fetch-query
tovu_files:
  - apps/admin/src/features/database/hooks/use-timeline-section.hooks.ts | blob 957555c7d4863a8906efd657d3d0ffa27bd8eef7
  - apps/admin/src/features/database/__tests__/use-timeline-section.unit.test.tsx | blob e7e21b9c99046ede96d620abcce2ab4731d1b131 | unchanged (read-only guard: it pins the bound behaviour)
split (every top-level declaration):
  - navigateToRecoveryWithDeepLink | STAY-PRODUCT (sessionStorage envelope + Tovu route)
  - TimelineSectionController | STAY-WIRING (screen contract)
  - TimelineFilters, BLANK_FILTERS | STAY-PRODUCT (the ledger's four filter fields)
  - TimelineSectionDependencies | STAY-WIRING
  - useTimelineSection | STAY-WIRING, reduced: the first-page query keyed on APPLIED filters, the cursor-appended pages, the stale-append guard (filtersRef/loadingMoreRef) and the page-reset on new filters MOVE -> Jini `useCursorPages`. Kept in Tovu: the four draft filter states, fetchTimelinePage (closure over the port), KEYS.timeline, describeApiError wording, t/locale.
  - useWiredTimelineSection | STAY-WIRING
ports (all passed as arguments, no Tovu type crosses): key: ({ filters }) => QueryKey (Tovu binds `KEYS.timeline(filters)`); fetchPage: ({ filters }, { cursor }) => Promise<{ items; nextCursor }> (Tovu binds its local fetchTimelinePage over `port.getDatabaseTimeline`); initialFilters (Tovu: BLANK_FILTERS). Error wording stays in Tovu: Jini returns the raw failure.
jini guards: packages/ui/src/features/panel-kit/fetch-query/use-cursor-pages.hooks.ts must not exist; `rg -n "useCursorPages|CursorPages|CursorPage\b" packages/ui/src` prints nothing; packages/ui/src/features/panel-kit/fetch-query/index.ts: line "export { useFetchQuery, useFetchMutation, useCachedLoader, useInvalidate, useFetchQueryScope } from './binding.react.js';" occurs once.
jini_code (new file packages/ui/src/features/panel-kit/fetch-query/use-cursor-pages.hooks.ts):
```ts
import { useEffect, useRef, useState } from "react";
import type { QueryKey } from "@jini-ai/core/fetch";
import { useFetchQuery } from "./binding.react.js";

/**
 * @file A list whose first page is one fetch-query keyed on the APPLIED filters, plus "Load more"
 * pages appended locally by cursor.
 *
 * The applied filters (not the draft a form edits) are the key, so typing into a filter input does not
 * reload; only `applyFilters` does, by changing the key. Load-more pages are not folded into the query
 * because a query binds one hook to one fixed key. The local pages get the same race guard the first
 * page gets for free: a load-more still in flight when new filters are applied must not append the old
 * filters' rows once it resolves, and applying new filters drops the pages of the previous set.
 */

export interface CursorPage<Item> {
  items: Item[];
  nextCursor: string | null;
}

export interface CursorPagesRequired<Filters, Item> {
  key: (required: { filters: Filters }) => QueryKey;
  fetchPage: (required: { filters: Filters }, optional?: { cursor?: string | undefined }) => Promise<CursorPage<Item>>;
  initialFilters: Filters;
}

export interface CursorPages<Filters, Item> {
  /** `null` until the first page settles. */
  rows: Item[] | null;
  nextCursor: string | null;
  /** The first-page or load-more failure, raw; the host words it. `null` when none. */
  failure: { error: unknown } | null;
  appliedFilters: Filters;
  applyFilters: (filters: Filters) => void;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
}

/**
 * First page by key plus cursor-appended pages, with a stale-append guard.
 * @complexity O(rows) per render (concatenation).
 */
export function useCursorPages<Filters, Item>(
  { key, fetchPage, initialFilters }: CursorPagesRequired<Filters, Item>,
  _optional: Record<string, never> = {},
): CursorPages<Filters, Item> {
  const [appliedFilters, setAppliedFilters] = useState<Filters>(initialFilters);
  const firstPage = useFetchQuery({ key: key({ filters: appliedFilters }), fetch: () => fetchPage({ filters: appliedFilters }) });
  const [morePages, setMorePages] = useState<Item[]>([]);
  const [moreCursor, setMoreCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const [moreFailure, setMoreFailure] = useState<{ error: unknown } | null>(null);
  const filtersRef = useRef(appliedFilters);
  useEffect(() => {
    filtersRef.current = appliedFilters;
    loadingMoreRef.current = false;
    setLoadingMore(false);
    setMorePages([]);
    setMoreFailure(null);
  }, [appliedFilters]);
  useEffect(() => {
    setMoreCursor(firstPage.data?.nextCursor ?? null);
  }, [firstPage.data]);

  async function loadMore() {
    if (!moreCursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    const filtersAtCall = appliedFilters;
    setLoadingMore(true);
    setMoreFailure(null);
    try {
      const page = await fetchPage({ filters: filtersAtCall }, { cursor: moreCursor });
      if (filtersAtCall !== filtersRef.current) return; // stale: filters changed while this was in flight
      setMorePages((prev) => [...prev, ...page.items]);
      setMoreCursor(page.nextCursor);
    } catch (error) {
      if (filtersAtCall !== filtersRef.current) return;
      setMoreFailure({ error });
    } finally {
      if (filtersAtCall === filtersRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }

  const rows = firstPage.data ? [...firstPage.data.items, ...morePages] : null;
  const failure = moreFailure ?? (firstPage.error ? { error: firstPage.error } : null);
  return { rows, nextCursor: moreCursor, failure, appliedFilters, applyFilters: setAppliedFilters, loadingMore, loadMore };
}
```
  STOP: if eslint reports max-lines-per-function or complexity on useCursorPages, split `loadMore` out as `function useLoadMore(...)` is NOT pre-decided: SKIP and report the numbers (the sheet gives no split).
jini_index (fetch-query/index.ts): after "export { useFetchQuery, useFetchMutation, useCachedLoader, useInvalidate, useFetchQueryScope } from './binding.react.js';" insert
  "export { useCursorPages } from './use-cursor-pages.hooks.js';\nexport type { CursorPage, CursorPages, CursorPagesRequired } from './use-cursor-pages.hooks.js';"
jini_tests (new file packages/ui/src/features/panel-kit/fetch-query/__tests__/use-cursor-pages.hooks.test.tsx):
```tsx
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FetchQueryProvider } from "../adapter.react.js";
import { useCursorPages, type CursorPage } from "../use-cursor-pages.hooks.js";

const wrapper = ({ children }: { children: ReactNode }) => <FetchQueryProvider>{children}</FetchQueryProvider>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

describe("useCursorPages", () => {
  it("loads the first page for the applied filters, then appends the next page by cursor", async () => {
    const calls: Array<{ filters: string; cursor: string | undefined }> = [];
    const fetchPage = async ({ filters }: { filters: string }, { cursor }: { cursor?: string | undefined } = {}): Promise<CursorPage<number>> => {
      calls.push({ filters, cursor });
      return cursor === undefined ? { items: [1, 2], nextCursor: "c2" } : { items: [3], nextCursor: null };
    };
    const { result } = renderHook(() => useCursorPages({ key: ({ filters }) => ["cursor-pages", filters], fetchPage, initialFilters: "all" }), { wrapper });
    expect(result.current.rows).toBeNull();
    await waitFor(() => expect(result.current.rows).toEqual([1, 2]));
    expect(result.current.nextCursor).toBe("c2");
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.rows).toEqual([1, 2, 3]);
    expect(result.current.nextCursor).toBeNull();
    expect(calls).toEqual([{ filters: "all", cursor: undefined }, { filters: "all", cursor: "c2" }]);
  });

  it("drops a load-more that resolves after new filters were applied", async () => {
    const late = deferred<CursorPage<string>>();
    const fetchPage = async ({ filters }: { filters: string }, { cursor }: { cursor?: string | undefined } = {}): Promise<CursorPage<string>> => {
      if (cursor !== undefined) return late.promise;
      return { items: [`${filters}-1`], nextCursor: "next" };
    };
    const { result } = renderHook(() => useCursorPages({ key: ({ filters }) => ["cursor-pages-race", filters], fetchPage, initialFilters: "a" }), { wrapper });
    await waitFor(() => expect(result.current.rows).toEqual(["a-1"]));
    let pending!: Promise<void>;
    act(() => { pending = result.current.loadMore(); });
    expect(result.current.loadingMore).toBe(true);
    act(() => result.current.applyFilters("b"));
    await waitFor(() => expect(result.current.rows).toEqual(["b-1"]));
    await act(async () => { late.resolve({ items: ["a-2"], nextCursor: null }); await pending; });
    expect(result.current.rows).toEqual(["b-1"]);
    expect(result.current.loadingMore).toBe(false);
  });

  it("reports a load-more failure raw and clears it when new filters are applied", async () => {
    const boom = new Error("boom");
    const fetchPage = async ({ filters }: { filters: string }, { cursor }: { cursor?: string | undefined } = {}): Promise<CursorPage<string>> => {
      if (cursor !== undefined) throw boom;
      return { items: [filters], nextCursor: "next" };
    };
    const { result } = renderHook(() => useCursorPages({ key: ({ filters }) => ["cursor-pages-fail", filters], fetchPage, initialFilters: "a" }), { wrapper });
    await waitFor(() => expect(result.current.rows).toEqual(["a"]));
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.failure).toEqual({ error: boom });
    act(() => result.current.applyFilters("b"));
    await waitFor(() => expect(result.current.rows).toEqual(["b"]));
    expect(result.current.failure).toBeNull();
  });
});
```
changeset: .changeset/ui-fetch-query-cursor-pages.md: `"@jini-ai/ui": minor` | "`@jini-ai/ui/fetch-query` exports `useCursorPages`: a first page keyed on applied filters plus cursor-appended pages with a stale-append guard."
jini_msg: "feat(ui): useCursorPages in fetch-query"
Tovu edits (use-timeline-section.hooks.ts, exact old -> new, each once):
  - "import { useEffect, useRef, useState } from \"react\";" -> "import { useState } from \"react\";"
  - "import { useFetchQuery } from \"@jini-ai/ui/fetch-query\";" -> "import { useCursorPages } from \"@jini-ai/ui/fetch-query\";"
  - header: after the line " * fake-port object per render can never retrigger either effect." insert the two lines " *\n * The first-page query, the cursor-appended pages and the stale-append guard described above now live in\n * `useCursorPages` (`@jini-ai/ui/fetch-query`); this hook binds the port, `KEYS.timeline` and the error wording." (three lines in total, each starting " *")
  - in fetchTimelinePage's signature: "{ cursor }: { cursor?: string } = {}" -> "{ cursor }: { cursor?: string | undefined } = {}"
  - replace from the line "  // The COMMITTED filters the first page is keyed on — deliberately separate from the draft" through the line "  const error = moreError ?? (firstPage.error ? describeApiError({ e: firstPage.error, fallback: t({ locale: locale, key: \"failed to load the Database Timeline\" }) }) : null);" (inclusive; lines 141-201 at the guarded blob) with:
```ts
  // The COMMITTED filters the first page is keyed on live in `useCursorPages`, deliberately separate
  // from the draft `kind`/`outcome`/`fromDate`/`toDate` above (bound to the filter form's own inputs)
  // so typing does not itself trigger a reload. See this file's own header.
  const pages = useCursorPages<TimelineFilters, AdminLedgerRow>({
    key: ({ filters }) => KEYS.timeline(filters),
    fetchPage: fetchTimelinePage,
    initialFilters: BLANK_FILTERS,
  });

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    pages.applyFilters({ kind, outcome, fromDate, toDate });
  }

  const rows = pages.rows;
  const error = pages.failure === null ? null : describeApiError({ e: pages.failure.error, fallback: t({ locale: locale, key: "failed to load the Database Timeline" }) });
```
  - in the return object: "    nextCursor: moreCursor," -> "    nextCursor: pages.nextCursor,"; "    loadingMore,\n    applyFilters,\n    loadMore," -> "    loadingMore: pages.loadingMore,\n    applyFilters,\n    loadMore: pages.loadMore,"
census: python3 scripts/census.py <TOVU> apps/admin/src/features/database/hooks/use-timeline-section.hooks.ts: importers unchanged (no export removed or renamed). `rg -n "moreCursor|morePages|filtersRef|loadingMoreRef|moreError|firstPage" apps/admin/src/features/database/hooks/use-timeline-section.hooks.ts` after the edit: no hit except inside comments of the header.
tests: Tovu use-timeline-section.unit.test.tsx unchanged (it drives fetch + the fake through the bound hook; all its cases must still hold). No test moves out of Tovu: they pin Tovu's KEYS/wording. RED: none (pure move; Jini tests are new coverage, GREEN on the commit).
tovu_msg: "refactor(admin-database): timeline paging comes from useCursorPages in @jini-ai/ui/fetch-query" | body "Tovu keeps the four filter fields, the port, KEYS.timeline and the error wording."
follow-up (coordinator, not this slice): Jini packages/admin/src/forms/react/hooks/use-form-submissions.hooks.ts and the comments queue hook keep their own cursor-appended pages (named in this file's header); they are DEDUPE candidates onto useCursorPages once it lands.
look: Database screen, Timeline: filter by kind, Apply, Load more; change filters while Load more is pending -> no old rows appear.
est. executor tokens: ~50k Sonnet (slice 2). Slice 1: 0 until Q-WH.
