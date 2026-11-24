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

/**
 * The live repro (sites/tovu-dev server.log, 2026-10-09T01:04Z): one daemon outage logged from two
 * call sites. Same tag, headline and `[cause]`; only the caller's stack frame differs.
 * Now: the test this sentence headed is `@jini-ai/admin`'s `recent-errors-rules.unit.test.ts`; the
 * grouping it pins runs on every load of the port below.
 */
/**
 * @file Pure shaping for the Recent errors tab: one-line summaries, grouping of repeated errors,
 * shortened file paths for display, and the paste-ready text the Copy button puts on the
 * clipboard. No React, no I/O — `use-recent-server-errors.hooks.ts` calls these once per load.
 *
 * Redaction: every `message` reaching this file was already secret-redacted on write by the
 * server's log buffer (`apps/website/src/platform/server-logs/index.ts`, `redactSecretShapes`).
 * Nothing here un-redacts or re-reads anything, so the copied text carries exactly the same
 * `[REDACTED:…]` markers the screen shows. No second client-side pass: `@jini-ai/core`'s
 * `redactSecrets` also masks IPv4 addresses, which would turn the most useful part of an error
 * like "daemon unreachable at 127.0.0.1:51384" into a marker.
 * Now: these shaping rules are `@jini-ai/admin`'s `screens/observability/recent-errors-rules.ts`;
 * the redacting log buffer is still this app's server-log capture.
 */
/**
 * Shortens an absolute path for display: from the last `node_modules/`, else from the first
 * `apps/` or `packages/` folder (the repo root is not known to the browser), else `~/` for a
 * home directory. Anything else is returned unchanged. A `:line:col` suffix is kept.
 * @example shortenSourcePath({ path: "/Users/me/Tovu/apps/website/src/a.ts:2:4" }) // "apps/website/src/a.ts:2:4"
 * Now: `shortenSourcePath` is `@jini-ai/admin`'s `recent-errors-rules.ts`; it shortens the paths
 * this app's server logs carry.
 */
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
