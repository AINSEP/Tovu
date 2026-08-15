import { api, type AdminDockerfileSource } from "../../../lib/api";
import type { DockerfileSourcePort } from "./dockerfile-source-port.hooks";

/** The live implementation, as a module-level singleton — matches
 *  `deployment-overview-dependencies.hooks.ts`'s `defaultDeploymentOverviewPort`. */
export const defaultDockerfileSourcePort: DockerfileSourcePort = {
  getDockerfileSource: () => api.getDockerfileSource(),
};

/** An in-memory {@link DockerfileSourcePort} for tests — resolves a caller-supplied snapshot (or
 *  rejects, for the load-error path) instead of a real fetch. */
export function createFakeDockerfileSourcePort(
  snapshot: AdminDockerfileSource | (() => Promise<AdminDockerfileSource>)
): DockerfileSourcePort {
  return {
    getDockerfileSource: () => (typeof snapshot === "function" ? snapshot() : Promise.resolve(snapshot)),
  };
}
