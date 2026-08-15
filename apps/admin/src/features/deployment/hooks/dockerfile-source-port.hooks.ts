import type { AdminDockerfileSource } from "../../../lib/api";

/**
 * @file What `useDockerfileSource` needs from the outside world, as an interface rather than a
 * direct `lib/api` import — same shape as `deployment-overview-port.hooks.ts` in this directory.
 *
 * 2026-08-15: gained {@link DockerfileSourcePort.setDockerfileSource} alongside the existing read —
 * the tab is now editable (backend landed same day: `PUT .../system/dockerfile`,
 * `api.setDockerfileSource`, see `use-dockerfile-source.hooks.ts`'s header for the full write-side
 * story).
 */
export interface DockerfileSourcePort {
  getDockerfileSource(): Promise<AdminDockerfileSource>;
  /** Overwrites the repo-root Dockerfile with `contents` (creating it if it didn't exist) and
   *  resolves with the snapshot it now has — same contract as `api.setDockerfileSource`. */
  setDockerfileSource(contents: string): Promise<AdminDockerfileSource>;
}
