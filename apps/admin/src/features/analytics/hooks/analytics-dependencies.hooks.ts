import { api, type AdminAnalyticsHit } from "@/lib/api";
import type { AnalyticsPort } from "./analytics-port.hooks";

/**
 * @file The only place under `features/analytics/hooks` that reaches `lib/api` — see
 * `analytics-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies.hooks.ts`'s
 *  `defaultRedirectsPort`. */
export const defaultAnalyticsPort: AnalyticsPort = {
  listRecentAnalyticsHits: (options) => api.listRecentAnalyticsHits(options),
};

/** Seed state for {@link createFakeAnalyticsPort}. */
export interface FakeAnalyticsPortOptions {
  hits?: AdminAnalyticsHit[];
}

/**
 * An in-memory {@link AnalyticsPort} for tests — the fake that lets a test describe "these hits
 * are recorded" directly, instead of hand-building fetch `Response`s. Shipped alongside the real
 * binding per the pattern's "every port gets a fake" rule (see `assistant-chats-dependencies
 * .hooks.ts`).
 */
export function createFakeAnalyticsPort(options: FakeAnalyticsPortOptions = {}): AnalyticsPort {
  const hits = options.hits ?? [];

  return {
    async listRecentAnalyticsHits() {
      return { hits };
    },
  };
}
