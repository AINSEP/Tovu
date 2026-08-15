import { api, type AdminDockerfileSource } from "../../../lib/api";
import type { DockerfileSourcePort } from "./dockerfile-source-port.hooks";

/** The live implementation, as a module-level singleton — matches
 *  `deployment-overview-dependencies.hooks.ts`'s `defaultDeploymentOverviewPort`. */
export const defaultDockerfileSourcePort: DockerfileSourcePort = {
  getDockerfileSource: () => api.getDockerfileSource(),
  setDockerfileSource: (contents) => api.setDockerfileSource(contents),
};

/** An in-memory {@link DockerfileSourcePort} for tests — resolves a caller-supplied snapshot (or
 *  rejects, for the load-error path) instead of a real fetch.
 *
 *  `setDockerfileSource` defaults to echoing `contents` back as `{ exists: true, contents }` — the
 *  same shape the real `PUT` route returns for any successful write — so existing get-only callers
 *  of this factory need no changes. A test exercising the save-error path overrides it via
 *  `options.setDockerfileSource` (e.g. `() => Promise.reject(new Error("disk full"))`). */
export function createFakeDockerfileSourcePort(
  snapshot: AdminDockerfileSource | (() => Promise<AdminDockerfileSource>),
  options: { setDockerfileSource?: (contents: string) => Promise<AdminDockerfileSource> } = {}
): DockerfileSourcePort {
  return {
    getDockerfileSource: () => (typeof snapshot === "function" ? snapshot() : Promise.resolve(snapshot)),
    setDockerfileSource:
      options.setDockerfileSource ?? ((contents: string) => Promise.resolve({ exists: true, contents })),
  };
}
