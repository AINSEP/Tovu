import type { Response } from "express";

import { IdentityForbiddenError, IdentityNotFoundError, OwnerRequiredError } from "@jini-ai/user-management";
import { updateUser } from "@jini-ai/user-management/server";
import { toAdminUserResponse } from "#src/server/inbound/admin-http/http/users";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { UserInTrashError } from "#src/features/identity/delete-user-service";
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
  if (!principal) throw new IdentityNotFoundError({ message: `principal '${principalId}' was not found` });
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
  if (err instanceof UserInTrashError) {
    res.status(409).json({ error: err.message, code: "USER_IN_TRASH" });
    return;
  }
  if (err instanceof IdentityForbiddenError) {
    res.status(403).json({ error: err.message, code: "FORBIDDEN", details: { permission: err.permission, reason: err.reason } });
    return;
  }
  if (err instanceof IdentityNotFoundError) {
    res.status(404).json({ error: err.message, code: "RESOURCE_NOT_FOUND" });
    return;
  }
  if (err instanceof OwnerRequiredError) {
    res.status(409).json({ error: err.message, code: "OWNER_REQUIRED" });
    return;
  }
  res.status(500).json({ error: "internal error" });
}

/**
 * PATCH users/:principalId — `UPDATE_USER` (SPEC-006 0.6.0, REQ-16). Gated by `user.manage`;
 * existing self-profile edits also accept `member.manage`. Only owners may edit owner targets.
 * `email`-only — `username` and
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

      // OWNER DECISION 2026-09-24 (delete-user plan v2, decision 7) — refuse BEFORE the transition;
      // see `enable.ts`'s identical guard for why.
      if (await deps.isInTrash(principalId)) {
        throw new UserInTrashError("this user is in the Trash; restore them first");
      }

      const serviceDeps = identityServiceDepsFrom(deps);
      const { email } = parseUserUpdateBody(req.body);
      const { user } = await deps.transactions.run({
        workspaceId: deps.workspaceId,
        execute: async () => {
          // Jini's email setter clears an omitted value. HTTP PATCH retains an omitted field;
          // read and write in the same identity transaction so a competing edit cannot be lost.
          const current = email === undefined
            ? await deps.userRepo.findByPrincipalId({ workspaceId: deps.workspaceId, principalId })
            : undefined;
          return updateUser({
            deps: serviceDeps,
            input: { workspaceId: deps.workspaceId, callerPrincipalId: caller.id, principalId },
          }, { email: email === undefined ? current?.email : email });
        },
      });

      res.json({ user: await assembleUpdatedUserResponse(deps, principalId, user) });
    } catch (err) {
      sendUserUpdateError(res, err);
    }
  });
};
