import type { AdminDeploymentOverview } from "@/features/deployment/api/deployment-api.types";
import { deploymentApi } from "@/features/deployment/api/deployment-api";
import type { DeploymentOverviewPort } from "./deployment-overview-port.hooks";

/** The live implementation, as a module-level singleton — matches
 *  `integrations-dependencies.hooks.ts`'s `defaultIntegrationsPort`. */
export const defaultDeploymentOverviewPort: DeploymentOverviewPort = {
  getDeploymentOverview: () => deploymentApi.getDeploymentOverview(),
};

/**
 * An in-memory {@link DeploymentOverviewPort} for tests — resolves a caller-supplied snapshot (or
 * rejects, for the load-error path) instead of a real fetch. Shipped alongside the real binding per
 * this app's "every port gets a fake" rule.
 */
export function createFakeDeploymentOverviewPort(
  { snapshot }: { snapshot: AdminDeploymentOverview | (() => Promise<AdminDeploymentOverview>) },
  _options = {},
): DeploymentOverviewPort {
  return {
    getDeploymentOverview: () => (typeof snapshot === "function" ? snapshot() : Promise.resolve(snapshot)),
  };
}
