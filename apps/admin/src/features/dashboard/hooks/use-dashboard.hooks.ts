import { useDashboard, type DashboardController } from "@jini-ai/admin/screens/dashboard/hooks/use-dashboard.hooks";

import { describeApiError } from "@/lib/admin-http/request";
import { useWiredAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as translate } from "../dashboard-i18n";

import { defaultDashboardPort } from "./dashboard-dependencies.hooks";

/**
 * @file The host half of the `useX(dependencies)` / `useWiredX()` pair: binds this app's API
 * clients, admin locale, product-bound translator, API error copy and storage namespace into
 * `@jini-ai/admin`'s `useDashboard`. `index.ts` hands it to the Dashboard as `useDashboardHook`.
 */

/** Password-banner plan (2026-09-24), Slice 3 — per-browser dismiss for the default-password nag.
 *  Namespaced under `tovu.admin.` like `standing-draft-local-backup.ts`'s own keys, so it can never
 *  collide with an unrelated app key. The stored value is the principal id that dismissed it, so a
 *  different user signing in on the same browser still sees their own nag. */
const DEFAULT_CREDENTIAL_BANNER_DISMISSED_KEY = "tovu.admin.default-password-banner.dismissed";

/**
 * Binds the real `/api` client, the real `useWiredAdminLocale()`, and a `DASHBOARD_DICT`-bound
 * translator — see `dashboard-dependencies.hooks.ts`.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so the
 * Dashboard composes this and a test composes `useDashboard` with `createFakeDashboardPort`.
 *
 * @returns The dashboard screen's full controller — see `DashboardController`.
 */
export function useWiredDashboard(): DashboardController {
  const locale = useWiredAdminLocale();
  const t = (key: string): string => translate({ locale: locale, key: key });
  return useDashboard({
    port: defaultDashboardPort, locale, t, describeError: describeApiError,
    passwordBannerDismissedKey: DEFAULT_CREDENTIAL_BANNER_DISMISSED_KEY,
  });
}
