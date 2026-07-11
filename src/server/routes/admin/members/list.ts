import type { MemberRecord } from "../../../../members";
import { toAdminMemberResponse } from "../../../http/admin/members";
import type { RouteRegistrar } from "../../../routes/types";
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
 */
export const registerAdminMemberListRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as MembersRouteDeps;

  app.get("/api/admin/v1/workspaces/:workspaceId/members", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const afterId = typeof req.query.afterId === "string" ? req.query.afterId : undefined;
    const rawLimit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const limit = rawLimit !== undefined && Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : undefined;

    try {
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
