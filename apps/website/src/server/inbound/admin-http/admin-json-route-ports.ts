import type { Express, Response } from "express";
import { mountJsonRoute, type JsonRoutePorts, type JsonRouteSpec } from "@jini-ai/http-kit";
import type { JsonRouteAuthorizeScope, RouteInputContext, ServerApiError } from "@jini-ai/core/contracts/server";
import { RouteRefusalError, rejectRoute } from "@jini-ai/core/errors/route-refusal";

import type { RouteDeps } from "#src/server/routes/types";
import { adminFailureResponse, reportServerFailure, sendAdminFailure, type FailureOptions } from "#src/server/inbound/shared/admin-failure";
import { asyncRoute, type AsyncRouteHandler } from "#src/platform/express/async-route";
import { getAuthedPrincipal, type OperatorPrincipalRecord } from "./dev-auth.js";
import { recordAdminRequestFacts, refuseUnlessSessionCredential, routeRequestFactsFor, type SessionCredentialGate } from "./admin-request-facts.js";
import { getPublishTrustContext, publishTrustAuthorizeFor } from "./publish-trust-auth.js";

/**
 * @file The host ports every Jini route spec mounts through (RT-K1-0.T). Jini specs are
 * server-framework neutral and answer in core shapes; these ports keep Tovu's wire contract: the
 * mount-path 404, the session principal, the RBAC/publish-credential 403 and the redacted 500 all
 * come from the same helpers the hand-written routes call, so a route moved to Jini answers
 * byte-for-byte as before. Composition only: nothing here is generic enough to leave Tovu.
 */

/** The only `RouteDeps` fields the ports read; a mount passes these plus its route's own deps. */
export interface AdminJsonRoutePortDeps { workspaceId: string; authorize: RouteDeps["authorize"] }

// A publishing credential authorizes from its grant's closed capability set, never from RBAC
// (`authorize-guard.ts`). The authorize port has no `res`, so the decision is resolved when the
// principal is read and keyed on that request's own principal copy — never shared across requests.
const publishTrustByContext = new WeakMap<OperatorPrincipalRecord, ReturnType<typeof publishTrustAuthorizeFor>>();

/** A refusal keeps its flat `{ error, code?, details? }` body; returned core failures use the same flat shape.
 * @complexity O(1).
 */
function writeRefusal({ res, error }: { res: Response; error: RouteRefusalError }, _optional: Record<string, never> = {}): void {
  res.status(error.response.status).json(error.response.body);
}

/** Returned parse/handler failures answer like thrown refusals: `{ error: <message>, code, details? }`.
 * Statuses follow core's code table, so a route that needs another status throws `rejectRoute` instead.
 * @complexity O(1).
 */
function writeReturnedFailure({ res, error, status }: { res: Response; error: ServerApiError; status: number }, _optional: Record<string, never> = {}): void {
  res.status(status).json({ error: error.message, code: error.code, ...(error.details === undefined ? {} : { details: error.details }) });
}

/** `"guarded"` is `authorizeOrRespond` (a publishing credential answers from its grant);
 * `"direct"` is `authorizeDirectOrRespond`, for routes that never consulted that override —
 * switching them is an authorization change for the owner, not part of a move. */
export type AdminRouteAuthorization = "guarded" | "direct";

/** Per-mount port choices. Every field defaults to the behaviour the hand-written routes had. */
export interface AdminJsonRouteMountOptions {
  /** Per-route `sendAdminFailure` options (operation, status…). */
  failure?: FailureOptions;
  /** The mount-wide decision source; absent means `"guarded"`. */
  authorization?: AdminRouteAuthorization;
  /** Per-permission exceptions to {@link AdminJsonRouteMountOptions.authorization}, keyed by the
   *  permission a spec asks for. A route whose hand-written version answered two checks from two
   *  sources (Menus update-tree: `admin.menus.update` direct, the raw-HTML permission guarded) keeps
   *  both decisions this way instead of forcing one mode on every check. */
  authorizationByPermission?: Readonly<Record<string, AdminRouteAuthorization>>;
  /** Opt-in: a request with no session principal reaches `parse` instead of failing in
   *  `authenticate`. Refused together with {@link AdminJsonRouteMountOptions.sessionCredentialOnly}. Only for routes whose hand-written version refused a bad body BEFORE reading the
   *  principal (so that 400 still wins); the spec must call `authorize` before any side effect,
   *  because that is where the missing principal then fails closed. */
  deferMissingPrincipal?: boolean;
  /** Refuse every credential but a session with `rejectUnlessSessionCredential`'s exact 403, in
   *  `authenticate` — after the workspace 404, before parse, authorization or any side effect. */
  sessionCredentialOnly?: SessionCredentialGate;
  /** The route's own denial reply (media where-used/import-url), instead of `authorizeOrRespond`'s
   *  403 body. Given the decision that was denied; whatever it answers is written as-is. */
  forbidden?: (args: AdminForbiddenArgs) => { status: number; body: unknown };
  /** Per-error failure options (agent-plugins memory: a Node system error has its own operation and
   *  copy); `undefined` keeps {@link AdminJsonRouteMountOptions.failure}. */
  failureFor?: (error: unknown) => FailureOptions | undefined;
  /** `"route"` (default) is `sendAdminFailure`'s method/route-derived copy; `"operation"` is the
   *  operation-only `adminFailureResponse` body the presentation PATCH writes. */
  failureCopy?: "route" | "operation";
  /** Opt-in: register the handler through `asyncRoute` (named `forwardRejection`), as the
   *  hand-written route was. A rejection that escapes the spec adapter (its own error answer
   *  failing) then reaches `next(error)` and the app's error middleware instead of leaving the
   *  request open; the route-table pin sees the same registration as before the move. */
  forwardRejection?: boolean;
}

/** The denied decision a {@link AdminJsonRouteMountOptions.forbidden} override answers. */
export interface AdminForbiddenArgs { principalId: string; permission: string; entityType?: string; entityId?: string; reason: string }

/** The mode one permission is answered by: its override, else the mount default (`"guarded"`).
 * @complexity O(1). */
function authorizationFor({ options, permission }: { options: AdminJsonRouteMountOptions; permission: string }, _optional: Record<string, never> = {}): AdminRouteAuthorization {
  const overrides = options.authorizationByPermission;
  const override = overrides && Object.hasOwn(overrides, permission) ? overrides[permission] : undefined;
  return override ?? options.authorization ?? "guarded";
}

/** Whether any check on this mount may answer from a publishing grant, so `authenticate` must read it.
 * @complexity O(k) in the override count. */
function mountMayUseGrant({ options }: { options: AdminJsonRouteMountOptions }, _optional: Record<string, never> = {}): boolean {
  if (options.authorization !== "direct") return true;
  return Object.values(options.authorizationByPermission ?? {}).includes("guarded");
}

type AdminPorts = JsonRoutePorts<AdminJsonRoutePortDeps, OperatorPrincipalRecord>;

/** The host `authorize` port. A by-id route names its entity (`entityId`), as the hand-written routes
 * passed it to `deps.authorize`; an id-free route (list, import) sends no `entityId` key, and a
 * type-free check (users list-roles) no `entityType` key — the hand-written calls pinned exactly that.
 * @complexity O(1) plus the injected authorizer.
 */
async function authorizeWithPorts(
  { args, scope, options }: { args: Parameters<NonNullable<AdminPorts["authorize"]>>[0]; scope: JsonRouteAuthorizeScope; options: AdminJsonRouteMountOptions },
  _optional: Record<string, never> = {},
): Promise<void> {
  const { context, deps, permission } = args;
  // Read off the args object (not destructured with a type) so this compiles whether the adapter's
  // `entityType` is required or optional; the key is forwarded only when the spec named one.
  const entityType: string | undefined = args.entityType;
  if (!context) throw new Error("getAuthedPrincipal: no principal on res.locals — requireAdminSession must run before this route");
  // Per permission: a `"direct"` check never consults the grant even when another check on
  // this mount does (Menus update-tree asks one of each).
  const grant = authorizationFor({ options, permission }) === "guarded" ? publishTrustByContext.get(context) : undefined;
  const authorize = grant ?? deps.authorize;
  const entity = { ...(entityType === undefined ? {} : { entityType }), ...(scope.entityId === undefined ? {} : { entityId: scope.entityId }) };
  const result = await authorize({ principalId: context.id, permission, workspaceId: deps.workspaceId, ...entity });
  if (result.allowed) return;
  if (options.forbidden) throw new RouteRefusalError(options.forbidden({ principalId: context.id, permission, ...entity, reason: result.reason }));
  // Same 403 body `authorizeOrRespond` writes (authorize-guard.ts `writeForbidden`).
  rejectRoute({
    status: 403, error: `principal '${context.id}' is not authorized for '${permission}' (${result.reason})`,
    code: "FORBIDDEN", details: { permission, reason: result.reason },
  });
}

/** An unexpected failure: the per-error options if `failureFor` claims it, else the mount's; written
 * with `sendAdminFailure`'s route-derived copy, or — `failureCopy: "operation"` — exactly as the
 * presentation PATCH writes `adminFailureResponse` (operation-only copy, the request's tracker).
 * @complexity The shared failure lifecycle.
 */
function writeAdminFailure({ res, error, options }: { res: Response; error: unknown; options: AdminJsonRouteMountOptions }, _optional: Record<string, never> = {}): void {
  const failure = options.failureFor?.(error) ?? options.failure;
  if (options.failureCopy !== "operation") { sendAdminFailure({ res, error }, failure); return; }
  const { status, body } = adminFailureResponse({ error, tracker: res.locals?.adminFailureTracker }, failure);
  res.status(status).json(body);
}

/** Build the admin ports; `failure` carries the per-route `sendAdminFailure` options (operation, status…).
 * @returns Ports for `mountJsonRoute`; the workspace and authorize ports read only `AdminJsonRoutePortDeps`.
 * @throws Error at registration for `deferMissingPrincipal` + `sessionCredentialOnly` (rv1123l T6): a
 *   deferred sessionless request would skip the credential gate, which must answer before parse.
 * @complexity O(1) per request beyond the injected authorizer and the shared failure lifecycle.
 */
export function createAdminJsonRoutePorts(
  required: AdminJsonRouteMountOptions & { workspaceScoped?: boolean } = {},
  _optional: Record<string, never> = {},
): AdminPorts {
  if (required.deferMissingPrincipal && required.sessionCredentialOnly) {
    throw new Error("admin route ports: deferMissingPrincipal cannot be combined with sessionCredentialOnly — the credential gate must run before parse");
  }
  return {
    // Same rule and body as `rejectForeignWorkspace` (shared/route-guards.ts), before any auth —
    // including its `?? ""` fallback, so a missing param on a workspace path is still the 404.
    // Deployment-level paths (`/api/admin/v1/database/*`, `/recovery/*`) never ran that guard.
    workspace: ({ raw, deps }) => {
      if (required.workspaceScoped === false) return;
      if (String(raw.params.workspaceId ?? "") !== deps.workspaceId) rejectRoute({ status: 404, error: "workspace was not found" });
    },
    // A missing session is deferred only on an opted-in mount (`deferMissingPrincipal`): those
    // hand-written routes validated the body before reading the principal, so their 400 must still
    // win, and `authorize` fails closed below with `getAuthedPrincipal`'s own error (the same
    // redacted 500). Every other mount throws here, before parse, exactly as before.
    authenticate: ({ res }) => {
      if (required.deferMissingPrincipal && !res.locals.principal) return undefined;
      if (required.sessionCredentialOnly) refuseUnlessSessionCredential({ res, gate: required.sessionCredentialOnly });
      const principal = { ...getAuthedPrincipal(res) };
      recordAdminRequestFacts({ principal, res });
      const publishTrust = mountMayUseGrant({ options: required }) ? getPublishTrustContext(res) : null;
      if (publishTrust) publishTrustByContext.set(principal, publishTrustAuthorizeFor(publishTrust));
      return principal;
    },
    authorize: (args, scope = {}) => authorizeWithPorts({ args, scope, options: required }),
    onError: ({ res, error }) => {
      if (error instanceof RouteRefusalError) { writeRefusal({ res, error }); return; }
      writeAdminFailure({ res, error, options: required });
    },
    onReturnedError: writeReturnedFailure,
    requestFacts: routeRequestFactsFor,
  };
}

/** The default admin ports: `sendAdminFailure`'s route-derived copy for unexpected failures. */
export const adminJsonRoutePorts = createAdminJsonRoutePorts();

/** A public route's unexpected-failure copy: `operation` for the incident sink, the visitor-safe sentence. */
export interface PublicRouteFailure { operation: string; visitorError: string; status?: number }

/** Build the public (visitor) ports: no session or RBAC; an unexpected failure is reported to the
 * incident sink and the visitor sees only the route's own safe copy plus the error ID.
 * @param required.operation - `<area>:<step>` for `reportServerFailure`.
 * @param required.visitorError - The visitor-safe sentence the hand-written route writes today.
 * @param required.workspaceId - When given, a foreign `:workspaceId` is the shared 404 (opt-in).
 * @complexity O(1) plus the shared incident report.
 */
export function createPublicJsonRoutePorts(
  required: PublicRouteFailure & { workspaceId?: string },
  _optional: Record<string, never> = {},
): JsonRoutePorts<object> {
  const { workspaceId } = required;
  return {
    // Opt-in (a mount given `workspaceId`): the same rule and body as `rejectForeignWorkspace`.
    ...(workspaceId === undefined ? {} : { workspace: ({ raw }: { raw: RouteInputContext }) => {
      if (String(raw.params.workspaceId ?? "") !== workspaceId) rejectRoute({ status: 404, error: "workspace was not found" });
    } }),
    onError: ({ res, error }) => {
      if (error instanceof RouteRefusalError) { writeRefusal({ res, error }); return; }
      const { errorId } = reportServerFailure({ error, operation: required.operation }, { tracker: res.locals.adminFailureTracker });
      res.status(required.status ?? 500).json({ error: required.visitorError, errorId });
    },
    onReturnedError: writeReturnedFailure,
    requestFacts: routeRequestFactsFor,
  };
}

/** The admin ports one mount uses: the shared default instance unless the mount customizes them or its
 * path is deployment-level.
 * Shared by `mountAdminJsonRoute` and `admin-raw-route-ports.ts`'s `mountAdminRawRoute`.
 * @complexity O(options).
 */
export function adminPortsFor({ path, options }: { path: string; options: AdminJsonRouteMountOptions }, _optional: Record<string, never> = {}): AdminPorts {
  // A path without `:workspaceId` is deployment-level: its hand-written route never ran the guard.
  const workspaceScoped = path.includes(":workspaceId");
  const customized = Object.values(options).some((value) => value !== undefined);
  return customized || !workspaceScoped ? createAdminJsonRoutePorts({ ...options, workspaceScoped }) : adminJsonRoutePorts;
}

/** Mount a Jini admin route spec behind the admin ports. `deps` is the route's own small deps type
 * plus the two port fields — built from `RouteDeps` at registration, never passed whole.
 * @returns Void; registers one endpoint.
 * @complexity O(1) setup; per request as `createAdminJsonRoutePorts`.
 */
export function mountAdminJsonRoute<Input, Output, Deps>(
  required: { app: Express; spec: Omit<JsonRouteSpec<Input, Output, Deps, OperatorPrincipalRecord>, "ports">; deps: Deps & AdminJsonRoutePortDeps },
  optional: AdminJsonRouteMountOptions = {},
): void {
  const { forwardRejection, ...portOptions } = optional;
  const ports = adminPortsFor({ path: required.spec.path, options: portOptions });
  const app = forwardRejection ? registeringThroughAsyncRoute({ app: required.app, method: required.spec.method }) : required.app;
  mountJsonRoute<Input, Output, Deps & AdminJsonRoutePortDeps, OperatorPrincipalRecord>({ app, spec: { ...required.spec, ports }, deps: required.deps });
}

/** The one-method app `mountJsonRoute` registers on, wrapping its handler in `asyncRoute`.
 *  `mountJsonRoute` only calls `app[spec.method](path, handler)`; a new use of `app` there fails
 *  loudly here (not a silent bypass), and `admin-json-route-ports.test.ts` pins the wrapped name.
 * @complexity O(1). */
function registeringThroughAsyncRoute(
  { app, method }: { app: Express; method: JsonRouteSpec<unknown, unknown, unknown>["method"] },
  _optional: Record<string, never> = {},
): Express {
  const register = (path: string, handler: AsyncRouteHandler) => app[method](path, asyncRoute({ handler }));
  return { [method]: register } as unknown as Express;
}

/** Mount a Jini public route spec behind the visitor ports (see `createPublicJsonRoutePorts`).
 * @returns Void; registers one endpoint.
 * @complexity O(1) setup.
 */
export function mountPublicJsonRoute<Input, Output, Deps extends object>(
  required: { app: Express; spec: Omit<JsonRouteSpec<Input, Output, Deps>, "ports">; deps: Deps; failure: PublicRouteFailure; workspaceId?: string },
  _optional: Record<string, never> = {},
): void {
  // Only a `:workspaceId` path can name a foreign workspace; elsewhere the option is inert.
  const workspaceId = required.spec.path.includes(":workspaceId") ? required.workspaceId : undefined;
  mountJsonRoute<Input, Output, Deps>({ app: required.app, spec: { ...required.spec, ports: createPublicJsonRoutePorts({ ...required.failure, workspaceId }) }, deps: required.deps });
}
