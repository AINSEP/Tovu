import type { AdminDeploymentOverview } from "@/lib/api";

/**
 * @file What `useDeploymentOverview` needs from the outside world, as an interface rather than a
 * direct `lib/api` import — same `useX(dependencies)` / `useWiredX()` split
 * `integrations-port.hooks.ts` documents as the canonical shape for this app.
 */
export interface DeploymentOverviewPort {
  getDeploymentOverview(): Promise<AdminDeploymentOverview>;
}
