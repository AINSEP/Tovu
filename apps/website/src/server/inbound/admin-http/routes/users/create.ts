import type { Response } from "express";

import {
  createUser,
  IdentityConflictError,
  IdentityForbiddenError,
  IdentityValidationError,
  normalizeUsername,
} from "@jini-ai/cms/identity";
import { toAdminUserResponse } from "#src/server/inbound/admin-http/http/users";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { UsernameInTrashError } from "#src/features/identity/delete-user-service";
import { identityServiceDepsFrom, type UsersRouteDeps, type UsersRouteRegistrar } from "./deps.js";

/** This route's three body fields, read off an untyped body in one place.
 *  @complexity O(1). */
function parseUserCreateBody(rawBody: unknown): { username: string; email: string | undefined; password: string } {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  return {
    username: String(body.username ?? ""),
    email: body.email !== undefined ? String(body.email) : undefined,
    password: String(body.password ?? ""),
  };
}

/** Maps this route's thrown error types onto the admin error envelope.
 *  @complexity O(1). */
function sendUserCreateError(res: Response, err: unknown): void {
  if (err instanceof UsernameInTrashError) {
    res.status(409).json({ error: err.message, code: "USERNAME_IN_TRASH" });
    return;
  }
  if (err instanceof IdentityForbiddenError) {
    res.status(403).json({ error: err.message, code: "FORBIDDEN", details: { permission: err.permission, reason: err.reason } });
    return;
  }
  if (err instanceof IdentityConflictError) {
    res.status(409).json({ error: err.message, code: "RESOURCE_CONFLICT", details: { field: "username" } });
    return;
  }
  if (err instanceof IdentityValidationError) {
    res.status(400).json({ error: err.message, code: "VALIDATION_ERROR" });
    return;
  }
  res.status(500).json({ error: "internal error" });
}

/**
 * OWNER DECISION 2026-09-24 (delete-user plan v2, decision 7) — re-derives whether `rawUsername`'s
 * existing holder (the one `createUser` itself just found and rejected as a conflict) is currently
 * in the Trash. Run only AFTER `createUser` throws `IdentityConflictError`, not as a pre-check
 * before calling it: `createUser` runs its own permission gate first (`assertCallerHasAnyPermission`),
 * so pre-checking here would leak "a trashed user holds this username" to a caller who was never
 * authorized to reach the conflict path at all. `normalizeUsername` is the exact function
 * `createUser` normalizes with internally (`@jini-ai/cms/identity`, re-exported), so this looks up
 * the SAME row `createUser` found.
 *
 * @complexity O(1): one normalize, one indexed `findByUsername`, one `isInTrash` check.
 */
async function usernameHeldByTrashedUser(deps: UsersRouteDeps, rawUsername: string): Promise<boolean> {
  const username = normalizeUsername(rawUsername);
  if (!username) return false;
  const existingUser = await deps.userRepo.findByUsername({ workspaceId: deps.workspaceId, username });
  if (!existingUser) return false;
  return deps.isInTrash(existingUser.principalId);
}

/**
 * POST users — `CREATE_USER` (state.spec §3, REQ-01/MF-1). Gated by
 * `user.manage` OR `member.manage` (AC-22, admin onboarding), enforced
 * inside `grant-service.ts`'s `createUser` rather than here — see that
 * file's header for why the gate lives in the service function.
 *
 * Not routed through the SPEC-001 command gateway: `CREATE_USER` mints two
 * rows (principal + user) as one structural unit, not a single entity with a
 * natural inverse-capture/revert story — same reasoning as
 * `members/disable.ts` calling identity functions directly.
 */
export const registerAdminUserCreateRoute: UsersRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/users", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const body = parseUserCreateBody(req.body);
    try {
      // Inside the try: requireAdminSession always sets res.locals.principal before this
      // route runs, but Express 4 doesn't catch a synchronous throw from an async handler
      // outside try/catch (the request would otherwise hang instead of 500ing).
      const caller = getAuthedPrincipal(res);

      const { principal, user } = await createUser({
        deps: identityServiceDepsFrom(deps),
        input: {
          workspaceId: deps.workspaceId,
          callerPrincipalId: caller.id,
          ...body,
        },
      });

      res.status(201).json({ user: toAdminUserResponse({ principal, user, roleIds: [], policyIds: [] }) });
    } catch (err) {
      // OWNER DECISION 2026-09-24 (decision 7) — a username conflict `createUser` itself already
      // found and rejected may belong to a TRASHED user; see `usernameHeldByTrashedUser`'s doc for
      // why this re-check runs only here, after `createUser`'s own permission gate has passed.
      if (err instanceof IdentityConflictError && (await usernameHeldByTrashedUser(deps, body.username))) {
        sendUserCreateError(res, new UsernameInTrashError("a user with this username is in the Trash; restore or delete them permanently first"));
        return;
      }
      sendUserCreateError(res, err);
    }
  });
};
