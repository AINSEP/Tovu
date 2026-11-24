import type { Express, RequestHandler } from "express";
import type { OriginContext } from "@jini-ai/core/contracts/server";
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
 * A spec that sets `requireSameOrigin` needs the host's same-origin policy (`origin`): http-kit's gate
 * otherwise throws on every request. Both wrappers forward it and refuse a guarded spec without one at
 * registration, so the wiring bug stops the server from starting instead of answering 500s.
 */

/** Throws at registration when a guarded spec has no origin context to check against. */
function assertOriginContext({ spec, origin }: { spec: { path: string; requireSameOrigin?: boolean }; origin: OriginContext | undefined }, _optional: Record<string, never> = {}): void {
  if (spec.requireSameOrigin && !origin) throw new Error(`raw route ${spec.path} sets requireSameOrigin but its mount has no origin context`);
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
  required: { app: Express; spec: Omit<RawRouteSpec<Deps & AdminJsonRoutePortDeps, OperatorPrincipalRecord>, "ports">; deps: Deps & AdminJsonRoutePortDeps; origin?: OriginContext; handlerName?: string },
  optional: AdminJsonRouteMountOptions = {},
): void {
  assertOriginContext({ spec: required.spec, origin: required.origin });
  const app = required.handlerName === undefined ? required.app : registeringUnderName({ app: required.app, method: required.spec.method, name: required.handlerName });
  const ports = adminPortsFor({ path: required.spec.path, options: optional, requireSameOrigin: required.spec.requireSameOrigin });
  const readHeaders = preflightReadHeaders({ spec: required.spec, preflight: optional.preflight });
  mountRawRoute<Deps & AdminJsonRoutePortDeps, OperatorPrincipalRecord>({ app, spec: { ...required.spec, ...readHeaders, ports }, deps: required.deps, adapter: required.origin });
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
  required: { app: Express; spec: Omit<RawRouteSpec<Deps>, "ports">; deps: Deps; failure: PublicRouteFailure; workspaceId?: string; origin?: OriginContext },
  _optional: Record<string, never> = {},
): void {
  assertOriginContext({ spec: required.spec, origin: required.origin });
  const workspaceId = required.spec.path.includes(":workspaceId") ? required.workspaceId : undefined;
  const ports = createPublicJsonRoutePorts({ ...required.failure, workspaceId });
  mountRawRoute<Deps>({ app: required.app, spec: { ...required.spec, ports }, deps: required.deps, adapter: required.origin });
}
