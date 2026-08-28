import type { Response } from "express";

import {
  createPolicy,
  IdentityForbiddenError,
  IdentityValidationError,
} from "@jini-ai/cms/identity";
import { toAdminPolicyResponse } from "#src/server/http/admin/users";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { identityServiceDepsFrom, type UsersRouteRegistrar } from "./deps.js";

/** This route's `name`/`description` POST fields, read off an untyped body in one place.
 *  @complexity O(1). */
function parsePolicyCreateBody(rawBody: unknown): { name: string; description: string | undefined } {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  return {
    name: String(body.name ?? ""),
    description: body.description !== undefined ? String(body.description) : undefined,
  };
}

/** Maps this route's thrown error types onto the admin error envelope. @complexity O(1). */
function sendPolicyCreateError(res: Response, err: unknown): void {
  if (err instanceof IdentityForbiddenError) {
    res.status(403).json({ error: err.message, code: "FORBIDDEN", details: { permission: err.permission, reason: err.reason } });
    return;
  }
  if (err instanceof IdentityValidationError) {
    res.status(400).json({ error: err.message, code: "VALIDATION_ERROR" });
    return;
  }
  res.status(500).json({ error: "internal error" });
}

/**
 * POST policies — `CREATE_POLICY` (state.spec §3). Gated by `role.manage`;
 * always mints `isBuiltin=false` and `isFrozen=false`.
 */
export const registerAdminPolicyCreateRoute: UsersRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/policies", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const caller = getAuthedPrincipal(res);

      const { policy } = await createPolicy({
        deps: identityServiceDepsFrom(deps),
        input: {
          workspaceId: deps.workspaceId,
          callerPrincipalId: caller.id,
          ...parsePolicyCreateBody(req.body),
        },
      });

      res.status(201).json({ policy: toAdminPolicyResponse(policy) });
    } catch (err) {
      sendPolicyCreateError(res, err);
    }
  });
};
