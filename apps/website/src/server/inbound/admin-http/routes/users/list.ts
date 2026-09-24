import { toAdminUserResponse } from "#src/server/inbound/admin-http/http/users";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { UsersRouteRegistrar } from "./deps.js";

/**
 * GET users — list a workspace's human (`kind='user'`) principals for the
 * admin UI. No dedicated `listUsers` business-logic function exists in
 * `src/identity` (that library exports grant-writing mutations, not
 * read-side wrappers) — this route calls the repo ports directly, mirroring
 * `routes/admin/members/list.ts`'s reasoning.
 *
 * Non-human principals (`system`, `agent`, `api_key` — including the
 * disabled legacy `user-local` seed row) are filtered out: this screen is
 * "Users" (human operators), not the full principal roster.
 *
 * Gated by `user.manage`/`member.manage` (either), matching `createUser`'s own gate
 * (`grant-service.ts`) — no separate `user.read` permission exists in the catalog. 2026-07-16
 * authz sweep: this route previously had zero permission check beyond session auth, letting any
 * authenticated admin session read the full user roster regardless of role.
 */
export const registerAdminUserListRoute: UsersRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/users", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const [userManageResult, memberManageResult] = await Promise.all([
        deps.authorize({ principalId: principal.id, permission: "user.manage", workspaceId: deps.workspaceId }),
        deps.authorize({ principalId: principal.id, permission: "member.manage", workspaceId: deps.workspaceId }),
      ]);
      if (!userManageResult.allowed && !memberManageResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'user.manage' or 'member.manage' (${userManageResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "user.manage", reason: userManageResult.reason },
        });
        return;
      }

      const principals = await deps.principalRepo.list({ workspaceId: deps.workspaceId });
      const nonTrashedHumanPrincipals = (
        await Promise.all(
          principals
            .filter((principal) => principal.kind === "user")
            .map(async (principal) => ({
              principal,
              // OWNER DECISION 2026-09-24 (delete-user plan v2, decision 7's list side): a user
              // trashed via DELETE_USER is `status:'disabled'` plus a `trashed_items` row — this
              // screen must not list them as an ordinary disabled user, since restoring them here
              // means EnablePrincipal, not the Trash's own restore. An intentionally-disabled user
              // (never trashed) has no `trashed_items` row and stays listed.
              trashed: principal.status === "disabled" && (await deps.isInTrash(principal.id)),
            }))
        )
      )
        .filter((entry) => !entry.trashed)
        .map((entry) => entry.principal);
      const humanPrincipals = nonTrashedHumanPrincipals;

      // O(n) repo round trips, n = human principal count. Unbounded by a caller-controlled
      // collection (this is an operator-managed roster, not member/content scale — the same
      // assumption `identity/INFO.md` and `resolveEffectivePermissions` already make) — no cap
      // needed this pass; a future pagination pass would mirror `MemberRepoPort.list`'s
      // afterId/limit shape if this workspace's operator count ever grows unexpectedly large.
      const users = await Promise.all(
        humanPrincipals.map(async (principal) => {
          const userRow = await deps.userRepo.findByPrincipalId({
            workspaceId: deps.workspaceId,
            principalId: principal.id,
          });
          // Every kind='user' principal has a paired users row by construction
          // (CREATE_USER/SEED_FIRST_BOOT's atomicity guarantee) — this null
          // check is defensive, not an expected runtime path.
          if (!userRow) return null;

          const [roleLinks, policyLinks] = await Promise.all([
            deps.principalRoleRepo.listByPrincipalId({ workspaceId: deps.workspaceId, principalId: principal.id }),
            deps.principalPolicyRepo.listByPrincipalId({ workspaceId: deps.workspaceId, principalId: principal.id }),
          ]);

          return toAdminUserResponse({
            principal,
            user: userRow,
            roleIds: roleLinks.map((link) => link.roleId),
            policyIds: policyLinks.map((link) => link.policyId),
          });
        })
      );

      res.json({ users: users.filter((user): user is NonNullable<typeof user> => user !== null) });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};
