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

/** Build the admin ports; `failure` carries the per-route `sendAdminFailure` options (operation, status…).
 * @returns Ports for `mountJsonRoute`; the workspace and authorize ports read only `AdminJsonRoutePortDeps`.
 * @complexity O(1) per request beyond the injected authorizer and the shared failure lifecycle.
 */
export function createAdminJsonRoutePorts(
  required: { failure?: FailureOptions; authorization?: AdminRouteAuthorization } = {},
  _optional: Record<string, never> = {},
): JsonRoutePorts<AdminJsonRoutePortDeps, OperatorPrincipalRecord> {
  return {
    // Same rule and body as `rejectForeignWorkspace` (shared/route-guards.ts), before any auth.
    workspace: ({ raw, deps }) => {
      if (String(raw.params.workspaceId ?? "") !== deps.workspaceId) rejectRoute({ status: 404, error: "workspace was not found" });
    },
    authenticate: ({ res }) => {
      const principal = { ...getAuthedPrincipal(res) };
      const publishTrust = required.authorization === "direct" ? null : getPublishTrustContext(res);
      if (publishTrust) publishTrustByContext.set(principal, publishTrustAuthorizeFor(publishTrust));
      return principal;
    },
    authorize: async ({ context, deps, permission, entityType }) => {
      if (!context) throw new Error("admin JSON route authorization has no authenticated principal");
      const authorize = publishTrustByContext.get(context) ?? deps.authorize;
      const result = await authorize({ principalId: context.id, permission, workspaceId: deps.workspaceId, entityType });
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
  optional: { failure?: FailureOptions; authorization?: AdminRouteAuthorization } = {},
): void {
  const ports = optional.failure || optional.authorization ? createAdminJsonRoutePorts(optional) : adminJsonRoutePorts;
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
