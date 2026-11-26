import type { Express, RequestHandler, Response } from "express";
import type { OriginContext, RouteErrorPorts, RouteHostContext } from "@jini-ai/core/contracts/server";
import { mountRawRoute, type RawRouteSpec } from "@jini-ai/http-kit";

import { RouteRefusalError } from "@jini-ai/core/errors/route-refusal";

import type { OperatorPrincipalRecord } from "./dev-auth.js";
import { adminPortsFor, requireRouteErrors, routeAdapterFor, createPublicJsonRoutePorts, preflightReadHeaders, routeMountOptionsFor, type AdminJsonRouteMountOptions, type AdminJsonRoutePortDeps, type PublicRouteFailure, type PublicRouteMountOptions, type RequestDepsMountOption } from "./admin-json-route-ports.js";

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
function adapterFor({ spec, origin, errors }: { spec: { path: string; requireSameOrigin?: boolean }; origin: OriginContext | undefined; errors: RouteErrorPorts }, _optional: Record<string, never> = {}): { adapter: RouteHostContext & { errors: RouteErrorPorts } } {
  if (spec.requireSameOrigin && !origin) throw new Error(`raw route ${spec.path}: requireSameOrigin needs the host's origin context — pass \`origin\` to the mount`);
  return routeAdapterFor({ origin, errors });
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
  required: { app: Express; spec: Omit<RawRouteSpec<Deps & AdminJsonRoutePortDeps, OperatorPrincipalRecord>, "ports">; deps: Deps & AdminJsonRoutePortDeps; origin?: OriginContext; errors: RouteErrorPorts; handlerName?: string },
  optional: AdminJsonRouteMountOptions & RequestDepsMountOption<Deps & AdminJsonRoutePortDeps> = {},
): void {
  const { bodyParsers, requestDeps, ...portOptions } = optional;
  const errors = requireRouteErrors({ path: required.spec.path, errors: required.errors });
  const adapter = adapterFor({ spec: required.spec, origin: required.origin, errors });
  const app = required.handlerName === undefined ? required.app : registeringUnderName({ app: required.app, method: required.spec.method, name: required.handlerName });
  const ports = adminPortsFor({ path: required.spec.path, options: portOptions, requireSameOrigin: required.spec.requireSameOrigin }, { reporter: errors.reporter });
  const readHeaders = preflightReadHeaders({ spec: required.spec, preflight: portOptions.preflight });
  mountRawRoute<Deps & AdminJsonRoutePortDeps, OperatorPrincipalRecord>({ app, spec: { ...required.spec, ...readHeaders, ports }, deps: required.deps, ...adapter }, { ...routeMountOptionsFor({ bodyParsers, requestDeps }), preserveHostErrorRouting: true });
}

/** The one-method app `mountRawRoute` registers on, naming the handler it is given. `mountRawRoute`
 *  only calls `app[spec.method](path, handler)`; a new use of `app` there fails loudly here.
 * @complexity O(1). */
function registeringUnderName(
  { app, method, name }: { app: Express; method: RawRouteSpec<unknown>["method"]; name: string },
  _optional: Record<string, never> = {},
): Express {
  // Any `bodyParsers` keep their own names ahead of it; the one handler is named.
  const register = (path: string, ...handlers: RequestHandler[]) => {
    const handler = handlers.pop() as RequestHandler;
    return (app as unknown as Record<string, (path: string, ...registered: RequestHandler[]) => unknown>)[method](path, ...handlers, Object.defineProperty(handler, "name", { value: name }));
  };
  return { [method]: register } as unknown as Express;
}

/** A host-owned unexpected-failure writer for a public raw mount whose answer is not JSON (a text/plain 500). */
export type PublicRawFailureWriter = (required: { res: Response; error: unknown }) => void;

/** Mount a raw public spec behind the visitor ports (`createPublicJsonRoutePorts`); `workspaceId`
 * opts a `:workspaceId` path into the shared workspace 404; `origin` as for {@link mountAdminRawRoute}.
 * `failure` is the visitor copy of the JSON 500, or a {@link PublicRawFailureWriter} that writes the host's own
 * 500 (it owns the incident report); a `RouteRefusalError` still takes the shared refusal writer either way.
 * @returns Void; registers one endpoint.
 * @throws At registration, when the spec sets `requireSameOrigin` and `origin` is absent.
 * @complexity O(1) setup.
 * @example mountPublicRawRoute({ app, spec: sitemapRoute, deps, failure: { operation: "site:sitemap", visitorError } });
 */
export function mountPublicRawRoute<Deps extends object>(
  required: { app: Express; spec: Omit<RawRouteSpec<Deps>, "ports">; deps: Deps; failure: PublicRouteFailure | PublicRawFailureWriter; workspaceId?: string; origin?: OriginContext; errors: RouteErrorPorts; handlerName?: string },
  optional: PublicRouteMountOptions<Deps> = {},
): void {
  const errors = requireRouteErrors({ path: required.spec.path, errors: required.errors });
  const adapter = adapterFor({ spec: required.spec, origin: required.origin, errors });
  const workspaceId = required.spec.path.includes(":workspaceId") ? required.workspaceId : undefined;
  const { failure } = required;
  const base = createPublicJsonRoutePorts(typeof failure === "function" ? { operation: "", visitorError: "", workspaceId } : { ...failure, workspaceId }, { reporter: errors.reporter });
  const ports = typeof failure !== "function" ? base : {
    ...base,
    onError: ({ res, error }: { res: Response; error: unknown }) => {
      if (error instanceof RouteRefusalError) base.onError?.({ res, error });
      else failure({ res, error });
    },
  };
  const app = required.handlerName === undefined ? required.app : registeringUnderName({ app: required.app, method: required.spec.method, name: required.handlerName });
  mountRawRoute<Deps>({ app, spec: { ...required.spec, ports }, deps: required.deps, ...adapter }, { ...routeMountOptionsFor(optional), preserveHostErrorRouting: true });
}
