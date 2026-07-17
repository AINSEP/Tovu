import {
  createUser,
  IdentityConflictError,
  IdentityForbiddenError,
  IdentityValidationError,
} from "../../../../identity";
import { toAdminUserResponse } from "../../../http/admin/users";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import { identityServiceDepsFrom, type UsersRouteRegistrar } from "./deps";

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
          username: String(req.body?.username ?? ""),
          email: req.body?.email !== undefined ? String(req.body.email) : undefined,
          password: String(req.body?.password ?? ""),
        },
      });

      res.status(201).json({ user: toAdminUserResponse(principal, user, [], []) });
    } catch (err) {
      if (err instanceof IdentityForbiddenError) {
        res.status(403).json({
          error: err.message,
          code: "FORBIDDEN",
          details: { permission: err.permission, reason: err.reason },
        });
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
  });
};
