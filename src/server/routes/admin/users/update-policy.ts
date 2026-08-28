import type { Response } from "express";

import {
  IdentityForbiddenError,
  IdentityNotFoundError,
  IdentityValidationError,
  updatePolicy,
} from "@jini-ai/cms/identity";
import { toAdminPolicyResponse } from "#src/server/http/admin/users";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { identityServiceDepsFrom, type UsersRouteRegistrar } from "./deps.js";

/** This route's two writable PATCH fields — `undefined` means "leave unchanged" — read off an
 *  untyped body in one place. @complexity O(1). */
function parsePolicyUpdateBody(rawBody: unknown): { name: string | undefined; description: string | undefined } {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  return {
    name: body.name !== undefined ? String(body.name) : undefined,
    description: body.description !== undefined ? String(body.description) : undefined,
  };
}

/** Maps this route's thrown error types onto the admin error envelope. @complexity O(1). */
function sendPolicyUpdateError(res: Response, err: unknown): void {
  if (err instanceof IdentityForbiddenError) {
    res.status(403).json({ error: err.message, code: "FORBIDDEN", details: { permission: err.permission, reason: err.reason } });
    return;
  }
  if (err instanceof IdentityValidationError) {
    res.status(400).json({ error: err.message, code: "VALIDATION_ERROR" });
    return;
  }
  if (err instanceof IdentityNotFoundError) {
    res.status(404).json({ error: err.message, code: "RESOURCE_NOT_FOUND" });
    return;
  }
  res.status(500).json({ error: "internal error" });
}

/**
 * PATCH policies/:policyId — `UPDATE_POLICY` (SPEC-006 0.6.0, REQ-18) — rename/re-describe a
 * non-built-in, non-frozen policy. Gated by `role.manage`; a built-in or frozen target is refused
 * `VALIDATION_ERROR` (INV-06/AC-26, AC-30).
 */
export const registerAdminPolicyUpdateRoute: UsersRouteRegistrar = (app, deps) => {
  app.patch("/api/admin/v1/workspaces/:workspaceId/policies/:policyId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const caller = getAuthedPrincipal(res);

      const { policy } = await updatePolicy({
        deps: identityServiceDepsFrom(deps),
        input: {
          workspaceId: deps.workspaceId,
          callerPrincipalId: caller.id,
          policyId: String(req.params.policyId ?? ""),
          ...parsePolicyUpdateBody(req.body),
        },
      });

      res.json({ policy: toAdminPolicyResponse(policy) });
    } catch (err) {
      sendPolicyUpdateError(res, err);
    }
  });
};
