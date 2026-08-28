import type { Response } from "express";

import { IdentityForbiddenError, IdentityNotFoundError, updateUser } from "@jini-ai/cms/identity";
import { toAdminUserResponse } from "#src/server/http/admin/users";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { identityServiceDepsFrom, type UsersRouteDeps, type UsersRouteRegistrar } from "./deps.js";

/** This route's one writable PATCH field — `undefined` means "leave unchanged" — read off an
 *  untyped body in one place. @complexity O(1). */
function parseUserUpdateBody(rawBody: unknown): { email: string | undefined } {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  return { email: body.email !== undefined ? String(body.email) : undefined };
}

/**
 * Loads the principal record plus role/policy links for `principalId` and builds the admin
 * response shape. `updateUser` returns only the updated `UserRecord`; the response also needs the
 * paired `PrincipalRecord`, so this re-fetches it — a missing principal here is defensive, not an
 * expected runtime path (the same id `updateUser` itself just succeeded against).
 *
 * @complexity O(1) plus three repo reads.
 */
async function assembleUpdatedUserResponse(deps: UsersRouteDeps, principalId: string, user: Parameters<typeof toAdminUserResponse>[0]["user"]) {
  const principal = await deps.principalRepo.findById({ workspaceId: deps.workspaceId, id: principalId });
  if (!principal) throw new IdentityNotFoundError(`principal '${principalId}' was not found`);
  const [roleLinks, policyLinks] = await Promise.all([
    deps.principalRoleRepo.listByPrincipalId({ workspaceId: deps.workspaceId, principalId }),
    deps.principalPolicyRepo.listByPrincipalId({ workspaceId: deps.workspaceId, principalId }),
  ]);
  return toAdminUserResponse({
    principal,
    user,
    roleIds: roleLinks.map((link) => link.roleId),
    policyIds: policyLinks.map((link) => link.policyId),
  });
}

/** Maps this route's thrown error types onto the admin error envelope. @complexity O(1). */
function sendUserUpdateError(res: Response, err: unknown): void {
  if (err instanceof IdentityForbiddenError) {
    res.status(403).json({ error: err.message, code: "FORBIDDEN", details: { permission: err.permission, reason: err.reason } });
    return;
  }
  if (err instanceof IdentityNotFoundError) {
    res.status(404).json({ error: err.message, code: "RESOURCE_NOT_FOUND" });
    return;
  }
  res.status(500).json({ error: "internal error" });
}

/**
 * PATCH users/:principalId — `UPDATE_USER` (SPEC-006 0.6.0, REQ-16). Gated by `user.manage` **or**
 * `member.manage` (mirrors `CREATE_USER`'s admin-onboarding gate). `email`-only — `username` and
 * `password` fields in the body are silently ignored (AC-28), not rejected.
 */
export const registerAdminUserUpdateRoute: UsersRouteRegistrar = (app, deps) => {
  app.patch("/api/admin/v1/workspaces/:workspaceId/users/:principalId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const caller = getAuthedPrincipal(res);
      const principalId = String(req.params.principalId ?? "");

      const { user } = await updateUser({
        deps: identityServiceDepsFrom(deps),
        input: {
          workspaceId: deps.workspaceId,
          callerPrincipalId: caller.id,
          principalId,
          ...parseUserUpdateBody(req.body),
        },
      });

      res.json({ user: await assembleUpdatedUserResponse(deps, principalId, user) });
    } catch (err) {
      sendUserUpdateError(res, err);
    }
  });
};
