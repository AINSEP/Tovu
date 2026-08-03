import type { MemberRecord } from "#src/members/index";
import { toAdminMemberResponse } from "#src/server/http/admin/members";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RouteRegistrar } from "#src/server/routes/types";
import type { MembersRouteDeps } from "./deps";

/**
 * GET members — list a workspace's members for the admin UI (all statuses,
 * `pending`/`active`/`disabled` included; mirrors `listAdminPosts`'s "admin
 * sees everything" behavior in `registerAdminPostListRoute`).
 *
 * No dedicated `listAdminMembers` business-logic function exists in
 * `src/members` (that library exports `MembersWriteService` mutations only,
 * no read-side wrappers) — this route calls `MemberRepoPort.list` directly.
 * That port is already keyset-paginated and bounded (`DEFAULT_LIST_LIMIT =
 * 100` in `repo.memory.ts`), so an `afterId`/`limit` query pair is passed
 * through rather than re-implementing a cap here.
 *
 * ADR-PIPE-013 §1 (FEAT-013 Phase 1): previously ran behind session auth only
 * — no per-action `authorize()` call, unlike `disable.ts`. Closes that live
 * authorization gap by requiring `member.manage`, copying `disable.ts`'s
 * exact call shape (workspace-id 404 check first, then authorize).
 */
export const registerAdminMemberListRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as MembersRouteDeps;

  app.get("/api/admin/v1/workspaces/:workspaceId/members", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);

      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "member.manage",
        workspaceId: deps.workspaceId,
        entityType: "member",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'member.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "member.manage", reason: authResult.reason },
        });
        return;
      }

      const afterId = typeof req.query.afterId === "string" ? req.query.afterId : undefined;
      const rawLimit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
      const limit = rawLimit !== undefined && Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : undefined;

      const members: MemberRecord[] = await deps.memberRepo.list({
        workspaceId: deps.workspaceId,
        afterId,
        limit,
      });
      res.json({ members: members.map(toAdminMemberResponse) });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};
