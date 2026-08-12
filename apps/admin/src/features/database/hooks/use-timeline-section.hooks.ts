import { useEffect, useState } from "react";
import { api, describeApiError, type AdminLedgerRow } from "../../../lib/api";
import { navigate } from "../../../lib/router";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../database-i18n";

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
 * `useAdminLocale()` for its own error-string translations, so exposing that SAME already-resolved
 * `locale` as a bound `t` (plus the raw value, still needed for `TimelineSection`'s own local
 * subcomponents) on the return value adds no new fetch — `TimelineSection` used to receive `locale`
 * as a separate prop from `Database`, entirely redundant with the resolution this hook was already
 * doing internally and not using for anything the component could see.
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

export function useTimelineSection(): TimelineSectionController {
  const locale = useAdminLocale();
  const boundT = (key: string): string => t(locale, key);
  const [rows, setRows] = useState<AdminLedgerRow[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState("");
  const [outcome, setOutcome] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  function load(reset: boolean) {
    setError(null);
    api
      .getDatabaseTimeline({
        kind: kind || undefined,
        outcome: outcome || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        cursor: reset ? undefined : nextCursor ?? undefined,
      })
      .then((r) => {
        setRows((current) => (reset || !current ? r.items : [...current, ...r.items]));
        setNextCursor(r.nextCursor);
      })
      .catch((e) => setError(describeApiError(e, t(locale, "failed to load the Database Timeline"))))
      .finally(() => setLoadingMore(false));
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    load(true);
  }

  function loadMore() {
    setLoadingMore(true);
    load(false);
  }

  return { rows, nextCursor, error, kind, setKind, outcome, setOutcome, fromDate, setFromDate, toDate, setToDate, loadingMore, applyFilters, loadMore, t: boundT, locale };
}
