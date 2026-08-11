import { useState } from "react";

import type { AdminRedirectHitStats } from "../../../lib/api";
import { useFetchQuery } from "../../../lib/fetch-query";
import { KEYS } from "../rules";
import { defaultRedirectsPort } from "./redirects-dependencies.hooks";
import type { RedirectsPort } from "./redirects-port.hooks";

/**
 * @file The lazy per-row hit-count cell (SPEC-037 REQ-03), so `HitCountCell` in `Redirects.tsx` is
 * only markup.
 *
 * Extracted verbatim — same lazy-request gate, same query. `enabled` is what keeps this lazy: the
 * query is declared for every row but runs for none of them until the row's own "Load hits" button
 * is pressed, so a list of many rows never fires a synchronous burst of `/hits` requests.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because
 * nothing outside `features/redirects` needs it.
 *
 * `port` is injected (see `redirects-port.hooks.ts`) — shared with `use-redirects.hooks.ts` and
 * `use-import-redirects-form.hooks.ts`, since all three read the same `/redirects` resource.
 */

export interface HitCountCellController {
  error: Error | null;
  /** `undefined` until the request resolves — a rule with zero recorded hits still resolves to
   *  `{ data: { hitCount: 0, ... } }`, matching `hits.ts`'s own "still 200s with hitCount: 0"
   *  contract, so the caller must branch on this being present, never on `hitCount`'s truthiness. */
  data: { data: AdminRedirectHitStats } | undefined;
  isFetching: boolean;
  /** Fires the lazy hits fetch by flipping the query's `enabled` gate. */
  request: () => void;
}

export function useHitCountCell(props: { redirectId: string }, port: RedirectsPort): HitCountCellController {
  // `enabled` is what keeps this lazy: the query is declared for every row but
  // runs for none of them until its own button is pressed, preserving the
  // no-N+1-burst property without a manual imperative fetch.
  const [requested, setRequested] = useState(false);
  const hits = useFetchQuery({
    key: KEYS.hits(props.redirectId),
    fetch: () => port.getRedirectHits(props.redirectId),
    enabled: requested,
  });

  return {
    error: hits.error,
    data: hits.data,
    isFetching: hits.isFetching,
    request: () => setRequested(true),
  };
}

/** Binds the real client — see `redirects-dependencies.hooks.ts`. The zero-argument half of the
 *  `useX(dependencies)` / `useWiredX()` pair; `Redirects.tsx`'s `HitCountCell` composes this. */
export function useWiredHitCountCell(props: { redirectId: string }): HitCountCellController {
  return useHitCountCell(props, defaultRedirectsPort);
}
