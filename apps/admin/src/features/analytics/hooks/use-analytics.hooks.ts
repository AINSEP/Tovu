import { useEffect, useState } from "react";

import { api, type AdminAnalyticsHit } from "../../../lib/api";

/**
 * @file Everything the Analytics screen does, so `Analytics.tsx` is only markup.
 *
 * Extracted verbatim — same state, same effect, same error string. Naming follows
 * `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because nothing
 * outside `features/analytics` needs it.
 */

export interface AnalyticsController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  hits: AdminAnalyticsHit[] | null;
  error: string | null;
}

/**
 * @complexity Time/space: O(1) — one fetch on mount, no iteration of its own.
 */
export function useAnalytics(): AnalyticsController {
  const [hits, setHits] = useState<AdminAnalyticsHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listRecentAnalyticsHits()
      .then((r) => setHits(r.hits))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load recent hits"));
  }, []);

  return { hits, error };
}
