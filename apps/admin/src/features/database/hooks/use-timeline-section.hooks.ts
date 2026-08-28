import { useEffect, useRef, useState } from "react";
import { describeApiError, type AdminLedgerRow } from "@/lib/api";
import { useFetchQuery } from "@/lib/fetch-query";
import { KEYS } from "../rules";
import { navigate } from "@/lib/router";
import { useWiredAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t } from "../database-i18n";
import { defaultTimelineSectionPort } from "./timeline-section-dependencies.hooks";
import type { TimelineSectionPort } from "./timeline-section-port.hooks";

/**
 * @file Everything `TimelineSection` (the Database screen's ledger browser) does, so
 * `Database.tsx` is only markup.
 *
 * Extracted verbatim — same state, same declaration order, same effect, same error strings.
 * `Database.tsx` has no unit test today (see the feature's `README.md`); a hook is reachable from
 * `renderHook` with no `DataTable` and no cursor-driven pagination UI to drive by hand.
 *
 * `navigateToRecoveryWithDeepLink` moved here rather than to `rules.ts`: it performs I/O
 * (`sessionStorage.setItem`, `navigate`) rather than computing a value, so it is an effect, not a
 * pure rule, even though it needs no component state and is exported as a plain function rather
 * than folded into the hook's return.
 *
 * `t`/`locale` (2026-08-11, standing i18n rule — a component with a hook gets a BOUND `t` from that
 * hook, not its own `useAdminLocale()`/dictionary import): this hook already called
 * `useWiredAdminLocale()` for its own error-string translations, so exposing that SAME already-resolved
 * `locale` as a bound `t` (plus the raw value, still needed for `TimelineSection`'s own local
 * subcomponents) on the return value adds no new fetch — `TimelineSection` used to receive `locale`
 * as a separate prop from `Database`, entirely redundant with the resolution this hook was already
 * doing internally and not using for anything the component could see.
 *
 * `lib/fetch-query` migration (2026-08-12): page 1 is one `useFetchQuery` keyed on `KEYS.
 * timeline(appliedFilters)` — `appliedFilters` (NOT `kind`/`outcome`/`fromDate`/`toDate`
 * themselves) is the key, so typing into a filter input does not itself trigger a reload; only
 * `applyFilters` committing the draft into `appliedFilters` does, by changing the query's key (see
 * `rules.ts`'s `KEYS` doc). This also removes the mount-time `useEffect` entirely — `useFetchQuery`
 * fetches on mount by construction, and `appliedFilters` already starts blank. "Load more" pages
 * are NOT folded into that query, for the identical reason `forms/hooks/use-form-
 * submissions.hooks.ts`/`comments/hooks/use-comment-queue.hooks.ts` keep their own cursor-appended
 * pages local: `lib/fetch-query/types.ts`'s `QueryKey` doc binds one hook to one FIXED key.
 * `filtersRef` guards that local accumulation against the same class of race the base query gets
 * for free: a `loadMore` in flight when `applyFilters` commits new filters must not append the
 * wrong filter's rows once it resolves.
 *
 * DI seam (2026-08-14, Orc-BASH pass): `port` is injected — see `timeline-section-port.hooks.ts` —
 * rather than reaching `lib/api` directly, so a test can describe timeline-load/load-more outcomes
 * against `createFakeTimelineSectionPort` instead of stubbing global `fetch`. `useWiredTimelineSection`
 * below is the zero-argument pair `Database.tsx` actually mounts; `fetchTimelinePage` is now a
 * closure over `port` local to the hook body rather than a module-scope function, matching
 * `use-comment-queue.hooks.ts`'s inline-closure convention — `port` is never placed in a dependency
 * array (this file has no `useCallback` and neither `useEffect` below depends on it), so a fresh
 * fake-port object per render can never retrigger either effect.
 */

/** Stashes a client-constructed `DatabaseContextEnvelope` for `Recovery.tsx` to re-resolve
 * server-side on arrival (ADR-041 §7/ADR-045 §5, INV-04) — this admin app's router has no
 * per-navigation state mechanism, so `sessionStorage` carries the envelope across the navigation the
 * same way route state would in a router that supported it. A query string would technically work
 * now that routing is path-based, but this is transient handoff state: putting it in the URL would
 * make it bookmarkable and shareable, which is exactly what it must not be. The envelope itself
 * carries display continuity only; `resolveDeepLinkContext` never trusts it as authoritative. */
export function navigateToRecoveryWithDeepLink(row: AdminLedgerRow) {
  if (!row.restorePointId) return;
  const envelope = {
    v: 1,
    correlationId: `database-timeline-${row.id}`,
    siteId: "workspace-local",
    ledgerEventId: row.id,
    restorePointId: row.restorePointId,
    drift: row.kind,
    intent: "view",
    issuedAt: new Date().toISOString(),
  };
  sessionStorage.setItem("recovery-deep-link-envelope", JSON.stringify(envelope));
  navigate("/recovery");
}

export interface TimelineSectionController {
  rows: AdminLedgerRow[] | null;
  nextCursor: string | null;
  error: string | null;
  kind: string;
  setKind: (kind: string) => void;
  outcome: string;
  setOutcome: (outcome: string) => void;
  fromDate: string;
  setFromDate: (fromDate: string) => void;
  toDate: string;
  setToDate: (toDate: string) => void;
  loadingMore: boolean;
  applyFilters: (e: React.FormEvent) => void;
  loadMore: () => void;
  /** Bound translator — `key` already resolved against the caller's locale, so `Database.tsx`
   *  never imports `useAdminLocale`/`database-i18n` for this section. See this file's header. */
  t: (key: string) => string;
  /** Raw resolved locale — `TimelineSection`'s own local subcomponents (`TimelineFilterForm`,
   *  `TimelineBody`, `timelineColumns`) take `locale` directly rather than a bound translator. See
   *  this file's header. */
  locale: string;
}

interface TimelineFilters {
  kind: string;
  outcome: string;
  fromDate: string;
  toDate: string;
}

const BLANK_FILTERS: TimelineFilters = { kind: "", outcome: "", fromDate: "", toDate: "" };

export interface TimelineSectionDependencies {
  port: TimelineSectionPort;
}

/**
 * @param deps Injected dependencies — the `TimelineSectionPort` to read the ledger through.
 * @returns The Timeline's filter/paging state plus `applyFilters`/`loadMore`, and a bound `t`/
 * `locale` — see this file's header for the full rationale.
 */
export function useTimelineSection(deps: TimelineSectionDependencies): TimelineSectionController {
  const { port } = deps;
  const locale = useWiredAdminLocale();
  const boundT = (key: string): string => t(locale, key);

  function fetchTimelinePage(filters: TimelineFilters, cursor?: string) {
    return port.getDatabaseTimeline({
      kind: filters.kind || undefined,
      outcome: filters.outcome || undefined,
      fromDate: filters.fromDate || undefined,
      toDate: filters.toDate || undefined,
      cursor,
    });
  }

  const [kind, setKind] = useState("");
  const [outcome, setOutcome] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  // The COMMITTED filters the first page is keyed on — deliberately separate from the draft
  // `kind`/`outcome`/`fromDate`/`toDate` above (bound to the filter form's own inputs) so typing
  // does not itself trigger a reload. See this file's own header.
  const [appliedFilters, setAppliedFilters] = useState<TimelineFilters>(BLANK_FILTERS);

  const firstPage = useFetchQuery({
    key: KEYS.timeline(appliedFilters),
    fetch: () => fetchTimelinePage(appliedFilters),
  });

  const [morePages, setMorePages] = useState<AdminLedgerRow[]>([]);
  const [moreCursor, setMoreCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  // Guards `loadMore` against the same class of race `useFetchQuery` closes for page 1: an append
  // in flight when `applyFilters` commits new filters must not land under the old filters once it
  // resolves. Also resets the accumulated pages that belonged to the PREVIOUS filter set.
  const filtersRef = useRef(appliedFilters);
  useEffect(() => {
    filtersRef.current = appliedFilters;
    setMorePages([]);
    setMoreError(null);
  }, [appliedFilters]);

  useEffect(() => {
    setMoreCursor(firstPage.data?.nextCursor ?? null);
  }, [firstPage.data]);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setAppliedFilters({ kind, outcome, fromDate, toDate });
  }

  async function loadMore() {
    if (!moreCursor) return;
    const filtersAtCall = appliedFilters;
    setLoadingMore(true);
    try {
      const r = await fetchTimelinePage(filtersAtCall, moreCursor);
      if (filtersAtCall !== filtersRef.current) return; // stale — filters changed while this was in flight
      setMorePages((prev) => [...prev, ...r.items]);
      setMoreCursor(r.nextCursor);
    } catch (e) {
      if (filtersAtCall !== filtersRef.current) return;
      setMoreError(describeApiError(e, t(locale, "failed to load the Database Timeline")));
    } finally {
      if (filtersAtCall === filtersRef.current) setLoadingMore(false);
    }
  }

  const rows = firstPage.data ? [...firstPage.data.items, ...morePages] : null;
  const error = moreError ?? (firstPage.error ? describeApiError(firstPage.error, t(locale, "failed to load the Database Timeline")) : null);

  return {
    rows,
    nextCursor: moreCursor,
    error,
    kind,
    setKind,
    outcome,
    setOutcome,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    loadingMore,
    applyFilters,
    loadMore,
    t: boundT,
    locale,
  };
}

/**
 * Binds the real `/api/.../database/timeline` client — see `timeline-section-dependencies.hooks.ts`.
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Database.tsx`
 * composes this and a test composes {@link useTimelineSection} with `createFakeTimelineSectionPort`.
 *
 * @returns Same controller shape as {@link useTimelineSection}, bound to the real port.
 */
export function useWiredTimelineSection(): TimelineSectionController {
  return useTimelineSection({ port: defaultTimelineSectionPort });
}
