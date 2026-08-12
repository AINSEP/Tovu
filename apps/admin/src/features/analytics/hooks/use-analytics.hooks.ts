import { useEffect, useState } from "react";

import type { AdminAnalyticsHit } from "../../../lib/api";
import { defaultAnalyticsPort } from "./analytics-dependencies.hooks";
import type { AnalyticsPort } from "./analytics-port.hooks";

/**
 * @file Everything the Analytics screen does, so `Analytics.tsx` is only markup.
 *
 * Extracted verbatim — same state, same effect, same error string. Naming follows
 * `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because nothing
 * outside `features/analytics` needs it.
 *
 * `port` is injected — see `analytics-port.hooks.ts` — rather than importing `lib/api` directly,
 * so a test can describe the recent-hits list against `createFakeAnalyticsPort` instead of
 * stubbing global `fetch`. `useWiredAnalytics` below is the zero-argument pair `Analytics.tsx`
 * actually mounts.
 */

export interface AnalyticsController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  hits: AdminAnalyticsHit[] | null;
  error: string | null;
}

/**
 * @complexity Time/space: O(1) — one fetch on mount, no iteration of its own.
 */
export function useAnalytics(port: AnalyticsPort): AnalyticsController {
  const [hits, setHits] = useState<AdminAnalyticsHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    port
      .listRecentAnalyticsHits()
      .then((r) => setHits(r.hits))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load recent hits"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { hits, error };
}

/**
 * Binds the real `/api/.../analytics/recent-hits` client — see `analytics-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Analytics.tsx`
 * composes this and a test composes {@link useAnalytics} with `createFakeAnalyticsPort`.
 */
export function useWiredAnalytics(): AnalyticsController {
  return useAnalytics(defaultAnalyticsPort);
}
