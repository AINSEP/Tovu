import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import type { Response } from "express";

import { IdentityForbiddenError, IdentityValidationError } from "@jini-ai/user-management";
import { createPolicy } from "@jini-ai/user-management/server";
import { toAdminPolicyResponse } from "#src/server/inbound/admin-http/http/users";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { identityServiceDepsFrom, type UsersRouteRegistrar } from "./deps.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";

/** This route's `name`/`description` POST fields, read off an untyped body in one place.
 *  @complexity O(1). */
function parsePolicyCreateBody({ rawBody }: { rawBody: unknown }, _optional = {}): { name: string; description: string | undefined } {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  return {
    name: String(body.name ?? ""),
    description: body.description !== undefined ? String(body.description) : undefined,
  };
}

/** Maps this route's thrown error types onto the admin error envelope. @complexity O(1). */
function sendPolicyCreateError({ res, err }: { res: Response; err: unknown }, _optional = {}): void {
  if (err instanceof IdentityForbiddenError) {
    res.status(403).json({ error: err.message, code: "FORBIDDEN", details: { permission: err.permission, reason: err.reason } });
    return;
  }
  if (err instanceof IdentityValidationError) {
    res.status(400).json({ error: err.message, code: "VALIDATION_ERROR" });
    return;
  }
  sendAdminFailure({ res, error: err }, { operation: "routes/users/create-policy", code: "INTERNAL_ERROR" });
}

/**
 * POST policies — `CREATE_POLICY` (state.spec §3). Gated by `role.manage`;
 * always mints `isBuiltin=false` and `isFrozen=false`.
 */
export const registerAdminPolicyCreateRoute: UsersRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/policies", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const caller = getAuthedPrincipal(res);
      const { name, description } = parsePolicyCreateBody({ rawBody: req.body });

      const { policy } = await createPolicy({
        deps: identityServiceDepsFrom(deps),
        input: {
          workspaceId: deps.workspaceId,
          callerPrincipalId: caller.id,
          name,
        },
      }, { description });

      res.status(201).json({ policy: toAdminPolicyResponse(policy) });
    } catch (err) {
      sendPolicyCreateError({ res, err });
    }
  });
};
