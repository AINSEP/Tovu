import { useCallback as useQueryFetchCallback } from "react";
import { useFetchQuery } from "@jini-ai/ui/fetch-query";

import type { AdminAnalyticsHit } from "@/lib/api";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as defaultT } from "../analytics-i18n";
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
 *
 * `t` (2026-08-11, standing i18n rule — a component with a hook gets a BOUND `t` from that hook,
 * not its own `useAdminLocale()`/dictionary import): injected as this hook's second parameter,
 * pre-bound to `(key: string) => string` — same shape `features/posts/hooks/use-post-editor.hooks
 * .ts` established for this exact rule. `useAdminLocale()` and `analytics-i18n`'s `t` are called/
 * read only inside {@link useWiredAnalytics}, exactly where `Analytics.tsx` used to call them
 * directly before this change. `useAnalytics` itself never calls `t` internally (no translated
 * error strings originate here) — it exists solely to hand the bound translator through to the
 * component, same as the port.
 */

export interface AnalyticsController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  hits: AdminAnalyticsHit[] | null;
  error: string | null;
  /** Bound translator — `key` already resolved against the caller's locale, so `Analytics.tsx`
   *  never imports `useAdminLocale`/`analytics-i18n` itself. See this file's header. */
  t: (key: string) => string;
}

/**
 * @complexity Time/space: O(1) — one fetch on mount, no iteration of its own.
 */
export function useAnalytics(port: AnalyticsPort, t: (key: string) => string): AnalyticsController {
  const queryFetch = useQueryFetchCallback(async () => {
    try { return (await port.listRecentAnalyticsHits()).hits; }
    catch (error) { throw new Error(error instanceof Error ? error.message : "failed to load recent hits"); }
  }, [port]);
  const query = useFetchQuery({ key: ["analytics", "recent-hits"], fetch: queryFetch }, { staleTime: 0 });
  const hits = query.data ?? null;
  const error = query.error?.message ?? null;

  return { hits, error, t };
}

/**
 * Binds the real `/api/.../analytics/recent-hits` client, and a `t` bound to the real resolved
 * locale (`useAdminLocale()`, called here and ONLY here — see this file's header) — see
 * `analytics-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Analytics.tsx`
 * composes this and a test composes {@link useAnalytics} with `createFakeAnalyticsPort` and a fake
 * `t`.
 */
export function useWiredAnalytics(): AnalyticsController {
  const locale = useAdminLocale();
  const t = (key: string): string => defaultT({ locale: locale, key: key });
  return useAnalytics(defaultAnalyticsPort, t);
}
