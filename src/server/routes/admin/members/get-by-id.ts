import { MemberNotFoundError } from "../../../../members";
import { toAdminMemberResponse } from "../../../http/admin/members";
import type { RouteRegistrar } from "../../../routes/types";
import type { MembersRouteDeps } from "./deps";

/**
 * GET a single member by id.
 *
 * No dedicated `getAdminMemberById` business-logic function exists in
 * `src/members` (see `list.ts`'s file note) — this route calls
 * `MemberRepoPort.findById` directly and throws the library's own
 * `MemberNotFoundError` on a miss, mirroring the not-found translation
 * `getAdminPostById` performs internally for posts.
 */
export const registerAdminMemberGetRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as MembersRouteDeps;

  app.get("/api/admin/v1/workspaces/:workspaceId/members/:memberId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const memberId = String(req.params.memberId ?? "");

    try {
      const member = await deps.memberRepo.findById({ workspaceId: deps.workspaceId, id: memberId });
      if (!member) {
        throw new MemberNotFoundError(`member '${memberId}' was not found`);
      }

      res.json({ member: toAdminMemberResponse(member) });
    } catch (err) {
      if (err instanceof MemberNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};
