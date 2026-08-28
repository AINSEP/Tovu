import type { AdminAnalyticsHit } from "@/lib/api";

/**
 * @file What `useAnalytics` needs from the outside world, as an interface rather than a direct
 * `lib/api` import.
 *
 * Follows the `useX(dependencies)` / `useWiredX()` pair documented on `assistant-chats-port.hooks.ts`
 * (the canonical reference in this workspace) and already applied to `features/redirects` and
 * `features/pages`: this file declares, `analytics-dependencies.hooks.ts` binds the real `api`
 * client, and nothing else under `features/analytics/hooks` imports `lib/api`.
 */
export interface AnalyticsPort {
  listRecentAnalyticsHits(options?: { limit?: number }): Promise<{ hits: AdminAnalyticsHit[] }>;
}
