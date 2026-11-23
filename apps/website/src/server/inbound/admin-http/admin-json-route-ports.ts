import type { Express, Response } from "express";
import { mountJsonRoute, type JsonRoutePorts, type JsonRouteSpec } from "@jini-ai/http-kit";
import type { ServerApiError } from "@jini-ai/core/contracts/server";
import { RouteRefusalError, rejectRoute } from "@jini-ai/core/errors/route-refusal";

import type { RouteDeps } from "#src/server/routes/types";
import { reportServerFailure, sendAdminFailure, type FailureOptions } from "#src/server/inbound/shared/admin-failure";
import { getAuthedPrincipal, type OperatorPrincipalRecord } from "./dev-auth.js";
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
   *  `authenticate`. Only for routes whose hand-written version refused a bad body BEFORE reading the
   *  principal (so that 400 still wins); the spec must call `authorize` before any side effect,
   *  because that is where the missing principal then fails closed. */
  deferMissingPrincipal?: boolean;
}

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

/** Build the admin ports; `failure` carries the per-route `sendAdminFailure` options (operation, status…).
 * @returns Ports for `mountJsonRoute`; the workspace and authorize ports read only `AdminJsonRoutePortDeps`.
 * @complexity O(1) per request beyond the injected authorizer and the shared failure lifecycle.
 */
export function createAdminJsonRoutePorts(
  required: AdminJsonRouteMountOptions & { workspaceScoped?: boolean } = {},
  _optional: Record<string, never> = {},
): JsonRoutePorts<AdminJsonRoutePortDeps, OperatorPrincipalRecord> {
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
      const principal = { ...getAuthedPrincipal(res) };
      const publishTrust = mountMayUseGrant({ options: required }) ? getPublishTrustContext(res) : null;
      if (publishTrust) publishTrustByContext.set(principal, publishTrustAuthorizeFor(publishTrust));
      return principal;
    },
    // A by-id route names its entity (`entityId`), as the hand-written routes passed it to
    // `deps.authorize`; an id-free route (list, import) sends no `entityId` key at all.
    authorize: async ({ context, deps, permission, entityType }, scope = {}) => {
      if (!context) throw new Error("getAuthedPrincipal: no principal on res.locals — requireAdminSession must run before this route");
      // Per permission: a `"direct"` check never consults the grant even when another check on
      // this mount does (Menus update-tree asks one of each).
      const grant = authorizationFor({ options: required, permission }) === "guarded" ? publishTrustByContext.get(context) : undefined;
      const authorize = grant ?? deps.authorize;
      const entity = scope.entityId === undefined ? { entityType } : { entityType, entityId: scope.entityId };
      const result = await authorize({ principalId: context.id, permission, workspaceId: deps.workspaceId, ...entity });
      // Same 403 body `authorizeOrRespond` writes (authorize-guard.ts `writeForbidden`).
      if (!result.allowed) rejectRoute({
        status: 403, error: `principal '${context.id}' is not authorized for '${permission}' (${result.reason})`,
        code: "FORBIDDEN", details: { permission, reason: result.reason },
      });
    },
    onError: ({ res, error }) => {
      if (error instanceof RouteRefusalError) { writeRefusal({ res, error }); return; }
      sendAdminFailure({ res, error }, required.failure);
    },
    onReturnedError: writeReturnedFailure,
  };
}

/** The default admin ports: `sendAdminFailure`'s route-derived copy for unexpected failures. */
export const adminJsonRoutePorts = createAdminJsonRoutePorts();

/** Build the public (visitor) ports: no session or RBAC; an unexpected failure is reported to the
 * incident sink and the visitor sees only the route's own safe copy plus the error ID.
 * @param required.operation - `<area>:<step>` for `reportServerFailure`.
 * @param required.visitorError - The visitor-safe sentence the hand-written route writes today.
 * @complexity O(1) plus the shared incident report.
 */
export function createPublicJsonRoutePorts(
  required: { operation: string; visitorError: string; status?: number },
  _optional: Record<string, never> = {},
): JsonRoutePorts<object> {
  return {
    onError: ({ res, error }) => {
      if (error instanceof RouteRefusalError) { writeRefusal({ res, error }); return; }
      const { errorId } = reportServerFailure({ error, operation: required.operation }, { tracker: res.locals.adminFailureTracker });
      res.status(required.status ?? 500).json({ error: required.visitorError, errorId });
    },
    onReturnedError: writeReturnedFailure,
  };
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
  // A path without `:workspaceId` is deployment-level: its hand-written route never ran the guard.
  const workspaceScoped = required.spec.path.includes(":workspaceId");
  const customized = Object.values(optional).some((value) => value !== undefined);
  const ports = customized || !workspaceScoped ? createAdminJsonRoutePorts({ ...optional, workspaceScoped }) : adminJsonRoutePorts;
  mountJsonRoute<Input, Output, Deps & AdminJsonRoutePortDeps, OperatorPrincipalRecord>({ app: required.app, spec: { ...required.spec, ports }, deps: required.deps });
}

/** Mount a Jini public route spec behind the visitor ports (see `createPublicJsonRoutePorts`).
 * @returns Void; registers one endpoint.
 * @complexity O(1) setup.
 */
export function mountPublicJsonRoute<Input, Output, Deps extends object>(
  required: { app: Express; spec: Omit<JsonRouteSpec<Input, Output, Deps>, "ports">; deps: Deps; failure: { operation: string; visitorError: string; status?: number } },
  _optional: Record<string, never> = {},
): void {
  mountJsonRoute<Input, Output, Deps>({ app: required.app, spec: { ...required.spec, ports: createPublicJsonRoutePorts(required.failure) }, deps: required.deps });
}
