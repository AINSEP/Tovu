import { useStaticExport as jiniUseStaticExport, type StaticExportController } from "@jini-ai/devops/deploy/react/hooks/use-static-export.hooks";

import { describeApiError } from "@/lib/admin-http/request";
import { useFetchQuery } from "@jini-ai/ui/fetch-query";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useContentRefreshSubscription } from "@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks";
import { t as defaultT } from "../deployment-host-i18n";
import { exportLoadErrorMessage, exportPollErrorMessage, exportTriggerErrorMessage } from "@jini-ai/admin/deployment/deployment-i18n";

import { defaultStaticExportPort } from "./static-export-dependencies.hooks";
import type { StaticExportPort } from "@jini-ai/core/contracts/site/deployment-admin";

import { type Translate } from '@jini-ai/core/text';
/**
 * @file Everything the Static Site tab's "Build static export" action does, so `StaticSiteTab.tsx`
 * is only markup. Wired 2026-08-15 against `POST`/`GET .../system/export`
 * (`apps/website/src/server/inbound/admin-http/routes/system/export-site.ts`) — see that route's header for the trigger+poll
 * shape this hook mirrors: a real export is seconds to minutes, so a click starts the run and this
 * hook polls the status route until it settles, rather than holding one request open.
 *
 * `run` is seeded from a `getSiteExportStatus()` read on mount (via `useFetchQuery`, once — see
 * `seededRef` below) so a reload mid-export, or a second browser tab, still shows the real state
 * instead of a blank "not started". After that first paint, `run` is owned entirely by
 * {@link trigger} and the poll loop, never by a background refetch of the query — same "no
 * `invalidates`, set state from the write's own response" reasoning `use-dockerfile-source.hooks.ts`'s
 * header documents, extended here to the poll (which is this hook's OWN repeated read, not the
 * query's).
 *
 * `clean` defaults to `false` and is never silently flipped by this hook — `exportSite` itself
 * refuses to overwrite a non-empty output directory, and surfacing that refusal honestly (rather
 * than working around it here) is the point: see `StaticSiteTab.tsx`'s own reason text for the
 * checkbox.
 *
 * ## `useContentRefreshSubscription` — a bespoke reload, not the usual one-liner
 *
 * Staleness-bug generalization pass (see that hook's own header): an assistant run that called
 * `deployment_trigger_export` (`apps/website/src/features/deployments/agent-tools.ts`) from a
 * DIFFERENT tab/session should not leave this tab showing "Not started" indefinitely. This can't be
 * the usual `useInvalidate()` one-liner (`use-media.hooks.ts`'s shape) because `run` is not read
 * from `query.data` after the FIRST load — `seededRef` above deliberately blocks a later background
 * refetch of the SAME `useFetchQuery` from re-seeding it, so invalidating that query would silently
 * do nothing. Instead, {@link refreshRun} calls `port.getSiteExportStatus()` directly and sets
 * `run` from the response, bypassing the query entirely — the same "reach past the query, call the
 * port directly" shape `use-access-tokens.hooks.ts`'s own `reloadAllStores` uses for the identical
 * reason. This is safe unconditionally, unlike a re-seed of `use-dockerfile-source.hooks.ts`'s
 * `draft`: `run` is a pure status snapshot the operator only ever VIEWS, never types into, so there
 * is no in-progress edit a background refresh could clobber. If the fresh status comes back
 * `"running"`, the poll effect below picks it up on its own next render (it re-arms whenever
 * `isRunning` flips true) — this function does not need to start polling itself.
 */
export function useStaticExport({ port, t, locale }: { port: StaticExportPort; t: Translate; locale: string }, _options = {}): StaticExportController {
  return jiniUseStaticExport({ port, t, locale, useFetchQuery, useContentRefreshSubscription, describeApiError, exportLoadErrorMessage, exportPollErrorMessage, exportTriggerErrorMessage, setTimeout, clearTimeout });
}

/**
 * Binds the real `/api/.../system/export` client, and a `t` bound to the real resolved locale — the
 * zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, same shape
 * `use-deployment-overview.hooks.ts`'s `useWiredDeploymentOverview` documents.
 */
export function useWiredStaticExport(): StaticExportController {
  const locale = useAdminLocale();
  const t = (key: string): string => defaultT({ locale: locale, key: key });
  return useStaticExport({ port: defaultStaticExportPort, t, locale });
}
