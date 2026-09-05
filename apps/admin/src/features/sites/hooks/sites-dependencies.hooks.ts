import { api, type AdminSitesSnapshot } from "@/lib/api";
import type { SitesPort } from "./sites-port.hooks";

/** The live implementation, as a module-level singleton — matches
 *  `deployment-overview-dependencies.hooks.ts`'s `defaultDeploymentOverviewPort`. */
export const defaultSitesPort: SitesPort = {
  listSites: () => api.listSites(),
  createSite: (input) => api.createSite(input),
  activateSite: (name) => api.activateSite(name),
};

/** Overrides for {@link createFakeSitesPort} — anything not supplied rejects, so a test that
 *  reaches an operation it did not describe fails loudly instead of silently succeeding. */
export interface FakeSitesPortOverrides {
  createSite?: SitesPort["createSite"];
  activateSite?: SitesPort["activateSite"];
}

/**
 * An in-memory {@link SitesPort} for tests — resolves a caller-supplied snapshot (or rejects, for
 * the load-error path) instead of a real fetch. Shipped alongside the real binding per this app's
 * "every port gets a fake" rule.
 *
 * @param snapshot - The list response, or a thunk for the rejecting/changing-over-time cases.
 * @param overrides - Per-write behavior. Both default to rejecting.
 */
export function createFakeSitesPort(
  snapshot: AdminSitesSnapshot | (() => Promise<AdminSitesSnapshot>),
  overrides: FakeSitesPortOverrides = {},
): SitesPort {
  return {
    listSites: () => (typeof snapshot === "function" ? snapshot() : Promise.resolve(snapshot)),
    createSite: overrides.createSite ?? (() => Promise.reject(new Error("createSite was not expected"))),
    activateSite: overrides.activateSite ?? (() => Promise.reject(new Error("activateSite was not expected"))),
  };
}
