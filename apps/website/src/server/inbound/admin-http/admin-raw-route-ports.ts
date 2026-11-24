import type { Express, RequestHandler } from "express";
import type { RouteHostContext } from "@jini-ai/core/contracts/server";
import { mountRawRoute, type RawRouteSpec } from "@jini-ai/http-kit";

import type { OperatorPrincipalRecord } from "./dev-auth.js";
import { adminPortsFor, createPublicJsonRoutePorts, preflightReadHeaders, type AdminJsonRouteMountOptions, type AdminJsonRoutePortDeps, type PublicRouteFailure } from "./admin-json-route-ports.js";

/**
 * @file Raw (non-JSON) Jini route specs — HTML, XML/text, streams, downloads, `express.raw` uploads,
 * `302` + `Set-Cookie` — mounted behind the SAME host ports as the JSON specs (w3-rtfnd T1), so a
 * route moved here keeps the workspace 404, the session and RBAC/grant decisions, the credential-kind
 * gate and the redacted 500 the hand-written route answered. http-kit's `mountRawRoute` registers with
 * `app[method](path, handler)`, never `app.use`, so the route-table pin keeps its shape.
 *
 * `origin` is the host's same-origin context (rv1123l T5): http-kit's guard needs it for a spec with
 * `requireSameOrigin: true`, so both wrappers forward it, and a guarded spec mounted without it is
 * refused here at registration — never a per-request 500 after the workspace and session gates ran.
 */

/** Refuse a same-origin-guarded spec mounted without the host's origin context.
 * @throws Error at registration when `spec.requireSameOrigin` is set and `origin` is absent.
 * @complexity O(1).
 */
function adapterFor({ spec, origin }: { spec: { path: string; requireSameOrigin?: boolean }; origin: RouteHostContext | undefined }, _optional: Record<string, never> = {}): { adapter?: RouteHostContext } {
  if (spec.requireSameOrigin && !origin) throw new Error(`raw route ${spec.path}: requireSameOrigin needs the host's origin context — pass \`origin\` to the mount`);
  return origin ? { adapter: origin } : {};
}

/** Mount a raw admin spec behind the admin ports; takes every `mountAdminJsonRoute` option.
 * `origin` is the host's same-origin policy, required when the spec sets `requireSameOrigin`.
 * `handlerName` opts into naming the one registered Express handler (function `name`): the hand-written
 * route was registered as a named function, and the route-table pin records that name, so a moved
 * route keeps the pinned registration instead of an `<anonymous>` one. Absent, the handler stays anonymous.
 * @returns Void; registers one endpoint.
 * @throws At registration, when the spec sets `requireSameOrigin` and `origin` is absent.
 * @complexity O(1) setup; per request the admin ports, the handler and the body copy.
 * @example mountAdminRawRoute({ app, spec: pluginsInstallRoute, deps }, { failure: { operation: "routes/plugins/install" } });
 */
export function mountAdminRawRoute<Deps>(
  required: { app: Express; spec: Omit<RawRouteSpec<Deps & AdminJsonRoutePortDeps, OperatorPrincipalRecord>, "ports">; deps: Deps & AdminJsonRoutePortDeps; origin?: RouteHostContext; handlerName?: string },
  optional: AdminJsonRouteMountOptions = {},
): void {
  const adapter = adapterFor({ spec: required.spec, origin: required.origin });
  const app = required.handlerName === undefined ? required.app : registeringUnderName({ app: required.app, method: required.spec.method, name: required.handlerName });
  const ports = adminPortsFor({ path: required.spec.path, options: optional, requireSameOrigin: required.spec.requireSameOrigin });
  const readHeaders = preflightReadHeaders({ spec: required.spec, preflight: optional.preflight });
  mountRawRoute<Deps & AdminJsonRoutePortDeps, OperatorPrincipalRecord>({ app, spec: { ...required.spec, ...readHeaders, ports }, deps: required.deps, ...adapter });
}

/** The one-method app `mountRawRoute` registers on, naming the handler it is given. `mountRawRoute`
 *  only calls `app[spec.method](path, handler)`; a new use of `app` there fails loudly here.
 * @complexity O(1). */
function registeringUnderName(
  { app, method, name }: { app: Express; method: RawRouteSpec<unknown>["method"]; name: string },
  _optional: Record<string, never> = {},
): Express {
  const register = (path: string, handler: RequestHandler) => app[method](path, Object.defineProperty(handler, "name", { value: name }));
  return { [method]: register } as unknown as Express;
}

/** Mount a raw public spec behind the visitor ports (`createPublicJsonRoutePorts`); `workspaceId`
 * opts a `:workspaceId` path into the shared workspace 404; `origin` as for {@link mountAdminRawRoute}.
 * @returns Void; registers one endpoint.
 * @throws At registration, when the spec sets `requireSameOrigin` and `origin` is absent.
 * @complexity O(1) setup.
 * @example mountPublicRawRoute({ app, spec: sitemapRoute, deps, failure: { operation: "site:sitemap", visitorError } });
 */
export function mountPublicRawRoute<Deps extends object>(
  required: { app: Express; spec: Omit<RawRouteSpec<Deps>, "ports">; deps: Deps; failure: PublicRouteFailure; workspaceId?: string; origin?: RouteHostContext },
  _optional: Record<string, never> = {},
): void {
  const adapter = adapterFor({ spec: required.spec, origin: required.origin });
  const workspaceId = required.spec.path.includes(":workspaceId") ? required.workspaceId : undefined;
  const ports = createPublicJsonRoutePorts({ ...required.failure, workspaceId });
  mountRawRoute<Deps>({ app: required.app, spec: { ...required.spec, ports }, deps: required.deps, ...adapter });
}
