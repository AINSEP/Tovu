import { lazy, useCallback, useContext } from "react";
import { createBrowserViewerClipboard } from "@jini-ai/ui";
import { AdminFetchQueryAdapterContext } from "@jini-ai/admin/shell/lib/fetch-query/adapter-context";
import { createObservabilityStatusPort } from "@jini-ai/admin/screens/observability/hooks/observability-status-dependencies.hooks";
import { createRecentServerErrorsPort } from "@jini-ai/admin/screens/observability/hooks/recent-server-errors-dependencies.hooks";
import { useObservabilityStatus, type ObservabilityStatusController } from "@jini-ai/admin/screens/observability/hooks/use-observability-status.hooks";
import { useRecentServerErrors, type RecentServerErrorsController } from "@jini-ai/admin/screens/observability/hooks/use-recent-server-errors.hooks";
import { useQueriesTab, type QueriesTabController } from "@jini-ai/admin/screens/observability/hooks/use-queries-tab.hooks";
import { t as translateObservability } from "@jini-ai/admin/screens/observability/observability-i18n";

import { authApi } from "@/features/auth/api/auth-api";
import { describeApiError } from "@/lib/admin-http/request";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { observabilityApi } from "../api/observability-api";

/**
 * @file Host wiring for the Observability screen's hooks: binds this admin's API client, browser
 * clipboard, locale, error describer, auth identity and query adapter into the screen's Jini hooks.
 * The zero-argument `useWiredX()` halves of the `useX(dependencies)` / `useWiredX()` pairs.
 */

/** The live implementation, as a module-level singleton — matches `defaultAgentPluginsPort`. This one is the Overview port. */
export const defaultObservabilityStatusPort = createObservabilityStatusPort({ api: observabilityApi });

/** The live Recent errors port: server logs through the admin client, copy through the browser clipboard. */
export const defaultRecentServerErrorsPort = createRecentServerErrorsPort({ api: observabilityApi, clipboard: createBrowserViewerClipboard() });

/**
 * Binds the real `/api/.../system/observability-status` client and the real `useAdminLocale()` —
 * see `observability-status-dependencies.hooks.ts`.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `Observability.tsx` composes this and a test composes {@link useObservabilityStatus} with
 * `createFakeObservabilityStatusPort`.
 */
export function useWiredObservabilityStatus(): ObservabilityStatusController {
  const locale = useAdminLocale();
  const t = (key: string): string => translateObservability({ locale: locale, key: key });
  return useObservabilityStatus({ port: defaultObservabilityStatusPort, locale, t, describeError: describeApiError });
}

/** Binds the real API client and admin locale — the `useWiredX()` half of the pair. Feeds the Recent errors tab. */
export function useWiredRecentServerErrors(): RecentServerErrorsController {
  const locale = useAdminLocale();
  const t = useCallback((key: string): string => translateObservability({ locale: locale, key: key }), [locale]);
  return useRecentServerErrors({ port: defaultRecentServerErrorsPort, locale, t, describeError: describeApiError });
}

/** Bind this admin's provider capability and existing auth client at the host boundary. */
export function useWiredQueriesTab(): QueriesTabController {
  const adapter = useContext(AdminFetchQueryAdapterContext);
  return useQueriesTab({ adapter, port: authApi }, { development: import.meta.env.DEV });
}

// Creating this lazy component downloads nothing. SettingsDialogShell mounts only its
// selected panel, so this import runs only when an authorized TanStack host opens Queries.
// The default package entry returns null in production; the explicit production export
// provides the same embeddable panel there, using the nearest live QueryClient context.
export const QueryDevtoolsPanel = lazy(() => import("@tanstack/react-query-devtools/production")
  .then(module => ({ default: module.ReactQueryDevtoolsPanel })));
