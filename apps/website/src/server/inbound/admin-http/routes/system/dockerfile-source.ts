import type { Express } from "express";

import { dockerfileReadRoute, dockerfileWriteRoute } from "@jini-ai/cms/admin-http/routes/system/dockerfile-source";
import { readDockerfileSource, writeDockerfileSourceWithIfMatch } from "@jini-ai/devops/deploy/site/dockerfile";
import { mountAdminJsonRoute, type AdminJsonRouteMountOptions } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Host binding for the admin Deployment panel → Dockerfile tab (`GET`/`PUT
 * /api/admin/v1/workspaces/:workspaceId/system/dockerfile`).
 *
 * K1 (x8-server): the routes are Jini specs (`@jini-ai/cms/admin-http/routes/system/dockerfile-source`; the
 * `If-Match`/`ETag` decision record lives in its header). This file only injects the host's Dockerfile access
 * (`@jini-ai/devops/deploy/site/dockerfile`, shared with the `deployment_{get,set}_dockerfile` agent tools) and
 * mounts both specs "direct": these routes never consulted a publishing grant.
 */
export type AdminDockerfileSourceDeps = Pick<RouteDeps, "workspaceId" | "authorize">;

const MOUNT: AdminJsonRouteMountOptions = { authorization: "direct", failure: { operation: "routes/system/dockerfile-source", code: "INTERNAL_ERROR" } };

export function registerAdminDockerfileSourceRoute({ app, deps }: { app: Express; deps: AdminDockerfileSourceDeps }, _optional: Record<string, never> = {}): void {
  const routeDeps = { workspaceId: deps.workspaceId, authorize: deps.authorize, read: () => readDockerfileSource(), writeWithIfMatch: writeDockerfileSourceWithIfMatch };
  mountAdminJsonRoute({ app, spec: dockerfileReadRoute, deps: routeDeps }, MOUNT);
  mountAdminJsonRoute({ app, spec: dockerfileWriteRoute, deps: routeDeps }, MOUNT);
}
