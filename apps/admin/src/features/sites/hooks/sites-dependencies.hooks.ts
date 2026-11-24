import type { AdminSitesSnapshot } from "@jini-ai/core/contracts/site/admin-sites";
import { sitesApi } from "@/features/sites/api/sites-api";
import type { SitesPort } from "@jini-ai/admin/screens/sites/sites-port.hooks";
import type { SitesListingScope } from "@jini-ai/admin/screens/sites/use-sites-snapshot.hooks";
import type { LocalSitesDeps } from "@jini-ai/admin/screens/sites/use-local-sites.hooks";
import type { SiteConfirmPresentation } from "@jini-ai/admin/screens/sites/use-site-confirm.hooks";
import { useSitesConfig, type SitesConfigController } from "@jini-ai/admin/screens/sites/use-sites-config.hooks";
import { useAsyncAction } from "@jini-ai/ui/panel-kit";
import { startVisibleInterval } from "@jini-ai/ui/visible-interval";
import { describeApiError } from "@/lib/admin-http/request";
import { KEYS, SERVING_CHAT_WARNING_KEY, SITES_RESOURCE, siteWriteErrorKey } from "../rules";

/** The confirmation copy per confirmable local-site action (`useLocalSites` in `@jini-ai/admin`). */
export const LOCAL_SITE_CONFIRM_KEYS = {
  trash: "Move this site to Trash? You can restore it later.",
  delete: "Permanently delete this site and all its data? This cannot be undone.",
  switch: "Switch now? Unsaved changes will be lost.",
  "stop-serving": "Stop {name} and move this address to {target}? {target} restarts here, and anything running on either site stops.",
};
type ConfirmableAction = keyof typeof LOCAL_SITE_CONFIRM_KEYS;

/** Title, confirm label and tone per confirmable action; the body is the controller's own message.
 *  This admin's copy for `useSiteConfirm` (`@jini-ai/admin/screens/sites/use-site-confirm.hooks`). */
export const LOCAL_SITE_CONFIRM_PRESENTATION: Record<ConfirmableAction, SiteConfirmPresentation> = {
  trash: { titleKey: "Move site to Trash?", confirmKey: "Move to Trash", tone: "danger" },
  delete: { titleKey: "Delete site permanently?", confirmKey: "Delete permanently", tone: "danger" },
  switch: { titleKey: "Switch to this site now?", confirmKey: "Switch now", tone: "warning" },
  "stop-serving": { titleKey: "Stop this site?", confirmKey: "Stop", tone: "warning" },
};

/** The site-list cache key and content-refresh resource `useSitesSnapshot` (`@jini-ai/admin`) reads under. */
export const SITES_LISTING: SitesListingScope = { listKey: KEYS.list, resource: SITES_RESOURCE };

/** This admin's list key, copy keys, write-error rules and interval for `useLocalSites` (`@jini-ai/admin`). */
export const localSitesDeps: LocalSitesDeps = {
  listKey: KEYS.list,
  confirmKeys: LOCAL_SITE_CONFIRM_KEYS,
  servingChatWarningKey: SERVING_CHAT_WARNING_KEY,
  siteWriteErrorKey,
  describeApiError,
  startVisibleInterval,
};

/** This admin's sites settings controller (`useSitesConfig` in `@jini-ai/admin`): the live API
 *  client, the site-list key it invalidates after a write, and the shared `useAsyncAction`. */
export function useHostSitesConfig(_required = {}, _optional = {}): SitesConfigController {
  return useSitesConfig({ port: sitesApi, listKey: KEYS.list, useAsyncActionHook: useAsyncAction });
}

/** The live implementation, as a module-level singleton — matches
 *  `deployment-overview-dependencies.hooks.ts`'s `defaultDeploymentOverviewPort`. */
export const defaultSitesPort: SitesPort = {
  openSite: ({ url }, _optional = {}) => window.location.assign(url),
  manageLocalSite: (input, _optional = {}) => sitesApi.manageLocalSite(input),
  listSites: () => sitesApi.listSites(),
  createSite: (input, _optional = {}) => sitesApi.createSite(input),
  listTokenSignInPlugins: () => sitesApi.listTokenSignInPlugins(),
  activateSite: ({ name }, _optional = {}) => sitesApi.activateSite({ name }),
};

/** Overrides for {@link createFakeSitesPort} — anything not supplied rejects, so a test that
 *  reaches an operation it did not describe fails loudly instead of silently succeeding. */
export interface FakeSitesPortOverrides {
  manageLocalSite?: SitesPort["manageLocalSite"];
  createSite?: SitesPort["createSite"];
  activateSite?: SitesPort["activateSite"];
  /** Defaults to no plugins, so a test that is not about the token fields never sees them. */
  listTokenSignInPlugins?: SitesPort["listTokenSignInPlugins"];
}

/**
 * An in-memory {@link SitesPort} for tests — resolves a caller-supplied snapshot (or rejects, for
 * the load-error path) instead of a real fetch. Shipped alongside the real binding per this app's
 * "every port gets a fake" rule.
 *
 * @param required.snapshot - The list response, or a thunk for the rejecting/changing-over-time cases.
 * @param overrides - Per-write behavior. Both default to rejecting.
 */
export function createFakeSitesPort(
  { snapshot }: { snapshot: AdminSitesSnapshot | (() => Promise<AdminSitesSnapshot>) },
  overrides: FakeSitesPortOverrides = {},
): SitesPort {
  return {
    manageLocalSite: overrides.manageLocalSite ?? (() => Promise.reject(new Error("manageLocalSite was not expected"))),
    listSites: () => (typeof snapshot === "function" ? snapshot() : Promise.resolve(snapshot)),
    createSite: overrides.createSite ?? (() => Promise.reject(new Error("createSite was not expected"))),
    activateSite: overrides.activateSite ?? (() => Promise.reject(new Error("activateSite was not expected"))),
    listTokenSignInPlugins: overrides.listTokenSignInPlugins ?? (() => Promise.resolve({ plugins: [] })),
  };
}
