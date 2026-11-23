/**
 * @file Host bindings for the Jini Analytics screen (`@jini-ai/admin/screens/analytics`): the
 * live {@link AnalyticsPort} over this app's admin request client and workspace id, and the
 * zero-argument `useWiredAnalytics()` the screen receives as its required `useAnalyticsHook` prop.
 * The request client, `WORKSPACE_ID` and `useAdminLocale()` never enter the package — this file is
 * the only place they meet the screen.
 */
import type { AnalyticsPort } from '@jini-ai/admin/screens/analytics/hooks/analytics-port.hooks';
import { useAnalytics, type AnalyticsController } from '@jini-ai/admin/screens/analytics/hooks/use-analytics.hooks';
import { t as defaultT } from '@jini-ai/admin/screens/analytics/analytics-i18n';
import { analyticsApi } from '../../features/analytics/api/analytics-api';
import { useAdminLocale } from '../../hooks/use-admin-locale.hooks';

/** The live implementation, as a module-level singleton — matches `redirects-ports.ts`'s
 *  `redirectsHostPorts`. */
export const analyticsHostPort: AnalyticsPort = {
  listRecentAnalyticsHits: (_required = {}, options = {}) => analyticsApi.listRecentAnalyticsHits(options),
};

/**
 * Binds the real `/api/.../analytics/recent-hits` client, and a `t` bound to the real resolved
 * locale (`useAdminLocale()`, called here and ONLY here — the screen and its `useAnalytics` never
 * call it) — see {@link analyticsHostPort}.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so the screen composes
 * this and a test composes `useAnalytics` with `createFakeAnalyticsPort` and a fake `t`.
 */
export function useWiredAnalytics(): AnalyticsController {
  const locale = useAdminLocale();
  const t = ({ key }: { key: string }, _optional = {}): string => defaultT({ locale: locale, key: key });
  return useAnalytics({ port: analyticsHostPort, t });
}
