import { toAdminUserResponse } from "../../../http/admin/users";
import type { RouteRegistrar } from "../../types";

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
 */
export const registerAdminUserListRoute: RouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/users", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principals = await deps.principalRepo.list({ workspaceId: deps.workspaceId });
      const humanPrincipals = principals.filter((principal) => principal.kind === "user");

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

          return toAdminUserResponse(
            principal,
            userRow,
            roleLinks.map((link) => link.roleId),
            policyLinks.map((link) => link.policyId)
          );
        })
      );

      res.json({ users: users.filter((user): user is NonNullable<typeof user> => user !== null) });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};
