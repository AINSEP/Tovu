import type { AdminSitesSnapshot } from "@/features/sites/api/sites-api.types";
import { sitesApi } from "@/features/sites/api/sites-api";
import type { SitesPort } from "./sites-port.hooks";

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
