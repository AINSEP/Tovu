import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { sendAdminFailure } from "#src/server/inbound/admin-http/routes/system/site-share-errors";
import type { Request } from "express";
import { ToolInputError } from "@jini-ai/core";
import { encodeListCursor } from "@jini-ai/core/list-page";

import { toAdminMemberResponse } from "#src/server/inbound/admin-http/http/members";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteRegistrar } from "#src/server/routes/types";
import type { MembersRouteDeps } from "./deps.js";

/** Reads the `?limit=`/`?cursor=` pair (refactor pattern list-cursor). An invalid or missing `limit`
 *  falls through to the repo's own page size (`undefined`, not an error), as before. `?afterId=` is
 *  the older form of the cursor, kept so existing API clients do not break: the page starts after
 *  that id's position. A cursor this list did not issue is refused by the repo (400), never read as
 *  page one. @complexity O(1). */
function parseMembersListQuery(query: Request["query"]): { limit?: number; cursor: string | null } {
  const rawLimit = typeof query.limit === "string" ? Number(query.limit) : undefined;
  const limit = rawLimit !== undefined && Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : undefined;
  const cursor = typeof query.cursor === "string" && query.cursor !== "" ? query.cursor : null;
  const afterId = typeof query.afterId === "string" && query.afterId !== "" ? query.afterId : undefined;
  return { ...(limit === undefined ? {} : { limit }), cursor: cursor ?? (afterId === undefined ? null : encodeListCursor({ position: [afterId] })) };
}

/**
 * GET members — list a workspace's members for the admin UI (all statuses,
 * `pending`/`active`/`disabled` included; mirrors `listAdminPosts`'s "admin
 * sees everything" behavior in `registerAdminPostListRoute`).
 *
 * No dedicated `listAdminMembers` business-logic function exists in
 * `apps/website/src/features/members/index.ts` (that library exports `MembersWriteService` mutations only,
 * no read-side wrappers) — this route calls `MemberRepoPort.list` directly.
 * That port is keyset-paginated and bounded (100 per page), so the
 * `limit`/`cursor` pair is passed through and the response keeps `members`
 * and adds `nextCursor` (null on the last page) rather than re-implementing a cap here.
 *
 * ADR-PIPE-013 §1 (FEAT-013 Phase 1): previously ran behind session auth only
 * — no per-action `authorize()` call, unlike `disable.ts`. Closes that live
 * authorization gap by requiring `member.manage`, copying `disable.ts`'s
 * exact call shape (workspace-id 404 check first, then authorize).
 */
export const registerAdminMemberListRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as MembersRouteDeps;

  app.get("/api/admin/v1/workspaces/:workspaceId/members", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = getAuthedPrincipal(res);

      const params = { principalId: principal.id, permission: "member.manage", workspaceId: deps.workspaceId, entityType: "member" };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const page = await deps.memberRepo.list({ workspaceId: deps.workspaceId }, parseMembersListQuery(req.query));
      res.json({ members: page.items.map(toAdminMemberResponse), nextCursor: page.nextCursor });
    } catch (error) {
      if (error instanceof ToolInputError) {
        res.status(400).json({ error: error.message, code: "VALIDATION_ERROR" });
        return;
      }
      sendAdminFailure({ res, error }, { operation: "routes/members/list", code: "INTERNAL_ERROR" });
    }
  });
};
