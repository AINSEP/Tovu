import { api, type AdminDockerfileSource } from "@/lib/api";
import type { DockerfileSourcePort } from "./dockerfile-source-port.hooks";

/** The live implementation, as a module-level singleton — matches
 *  `deployment-overview-dependencies.hooks.ts`'s `defaultDeploymentOverviewPort`. */
export const defaultDockerfileSourcePort: DockerfileSourcePort = {
  getDockerfileSource: () => api.getDockerfileSource(),
  setDockerfileSource: (contents, ifMatch) => api.setDockerfileSource(contents, ifMatch),
};

/** A fixed, deliberately-fake-looking etag for {@link createFakeDockerfileSourcePort}'s default
 *  write echo — never meant to resemble a real sha256 digest, so a test asserting on it can never
 *  be confused about whether it observed the real transport or this stub. Exported so tests can
 *  assert against this exact value instead of duplicating the literal (and risking silent drift if
 *  it ever changes). */
export const FAKE_DOCKERFILE_ETAG = '"fake-etag"';

/** An in-memory {@link DockerfileSourcePort} for tests — resolves a caller-supplied snapshot (or
 *  rejects, for the load-error path) instead of a real fetch.
 *
 *  `setDockerfileSource` defaults to echoing `contents` back as
 *  `{ exists: true, contents, etag: FAKE_DOCKERFILE_ETAG }` — the same SHAPE the real `PUT` route
 *  returns for any successful write (an `ifMatch`-checked write, in production) — so existing
 *  get-only callers of this factory need no changes. This default does NOT check `ifMatch` against
 *  anything (it always "succeeds"); a test exercising the save-error or conflict path overrides it
 *  via `options.setDockerfileSource` (e.g. `() => Promise.reject(new Error("disk full"))`, or a
 *  rejection shaped like the real `ApiError` for the 412 path — see
 *  `use-dockerfile-source.unit.test.tsx`'s own conflict tests). */
export function createFakeDockerfileSourcePort(
  snapshot: AdminDockerfileSource | (() => Promise<AdminDockerfileSource>),
  options: { setDockerfileSource?: (contents: string, ifMatch: string) => Promise<AdminDockerfileSource> } = {}
): DockerfileSourcePort {
  return {
    getDockerfileSource: () => (typeof snapshot === "function" ? snapshot() : Promise.resolve(snapshot)),
    setDockerfileSource:
      options.setDockerfileSource ??
      ((contents: string) => Promise.resolve({ exists: true, contents, etag: FAKE_DOCKERFILE_ETAG })),
  };
}
