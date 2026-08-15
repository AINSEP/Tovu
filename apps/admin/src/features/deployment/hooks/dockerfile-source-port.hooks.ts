import type { AdminDockerfileSource } from "../../../lib/api";

/**
 * @file What `useDockerfileSource` needs from the outside world, as an interface rather than a
 * direct `lib/api` import — same shape as `deployment-overview-port.hooks.ts` in this directory.
 */
export interface DockerfileSourcePort {
  getDockerfileSource(): Promise<AdminDockerfileSource>;
}
