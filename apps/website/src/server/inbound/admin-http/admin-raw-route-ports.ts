import type { Express } from "express";
import { mountRawRoute, type RawRouteSpec } from "@jini-ai/http-kit";

import type { OperatorPrincipalRecord } from "./dev-auth.js";
import { adminPortsFor, createPublicJsonRoutePorts, type AdminJsonRouteMountOptions, type AdminJsonRoutePortDeps, type PublicRouteFailure } from "./admin-json-route-ports.js";

/**
 * @file Raw (non-JSON) Jini route specs — HTML, XML/text, streams, downloads, `express.raw` uploads,
 * `302` + `Set-Cookie` — mounted behind the SAME host ports as the JSON specs (w3-rtfnd T1), so a
 * route moved here keeps the workspace 404, the session and RBAC/grant decisions, the credential-kind
 * gate and the redacted 500 the hand-written route answered. http-kit's `mountRawRoute` registers with
 * `app[method](path, handler)`, never `app.use`, so the route-table pin keeps its shape.
 */

/** Mount a raw admin spec behind the admin ports; takes every `mountAdminJsonRoute` option.
 * @returns Void; registers one endpoint.
 * @complexity O(1) setup; per request the admin ports, the handler and the body copy.
 * @example mountAdminRawRoute({ app, spec: pluginsInstallRoute, deps }, { failure: { operation: "routes/plugins/install" } });
 */
export function mountAdminRawRoute<Deps>(
  required: { app: Express; spec: Omit<RawRouteSpec<Deps & AdminJsonRoutePortDeps, OperatorPrincipalRecord>, "ports">; deps: Deps & AdminJsonRoutePortDeps },
  optional: AdminJsonRouteMountOptions = {},
): void {
  const ports = adminPortsFor({ path: required.spec.path, options: optional });
  mountRawRoute<Deps & AdminJsonRoutePortDeps, OperatorPrincipalRecord>({ app: required.app, spec: { ...required.spec, ports }, deps: required.deps });
}

/** Mount a raw public spec behind the visitor ports (`createPublicJsonRoutePorts`); `workspaceId`
 * opts a `:workspaceId` path into the shared workspace 404.
 * @returns Void; registers one endpoint.
 * @complexity O(1) setup.
 * @example mountPublicRawRoute({ app, spec: sitemapRoute, deps, failure: { operation: "site:sitemap", visitorError } });
 */
export function mountPublicRawRoute<Deps extends object>(
  required: { app: Express; spec: Omit<RawRouteSpec<Deps>, "ports">; deps: Deps; failure: PublicRouteFailure; workspaceId?: string },
  _optional: Record<string, never> = {},
): void {
  const workspaceId = required.spec.path.includes(":workspaceId") ? required.workspaceId : undefined;
  const ports = createPublicJsonRoutePorts({ ...required.failure, workspaceId });
  mountRawRoute<Deps>({ app: required.app, spec: { ...required.spec, ports }, deps: required.deps });
}
