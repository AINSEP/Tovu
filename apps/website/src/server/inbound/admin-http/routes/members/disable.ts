import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { disableMember } from "@jini-ai/user-management/members/member-admin-writes";
import { MemberConflictError, MemberNotFoundError, MemberValidationError } from "@jini-ai/user-management/members/types";
import { toAdminMemberResponse } from "#src/server/inbound/admin-http/http/members";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteRegistrar } from "#src/server/routes/types";
import { toMembersWriteServiceDeps, type MembersRouteDeps } from "./deps.js";

/**
 * POST disable a member (ADR-021 §5): retain it in the roster while revoking access.
 * Owner 2026-10-24 adds a separate DELETE-to-Trash route; neither route hard-deletes. Idempotent at the
 * write-service layer: disabling an already-disabled member returns 200 with
 * the unchanged record rather than erroring.
 *
 * SPEC-006 REQ-05 wiring proof (second route, alongside posts create/update):
 * this route does not flow through the SPEC-001 command gateway (no
 * change-set is recorded for a member disable — a pre-existing gap unrelated
 * to this spec, see the Programmer handoff), so `authorize()` is called
 * directly rather than via `executeCommand`'s `deps.authorize` hook.
 */
/**
 * C058: the reload copy for a disable that lost the member compare-and-set. It is the admin's shared
 * `VERSION_CONFLICT_MESSAGE` text: the members screen shows the server `error` as-is, and the
 * `VERSION_CONFLICT` code lets any caller classify it like the other editors' stale saves.
 */
export const MEMBER_VERSION_CONFLICT_MESSAGE =
  "Someone else changed this while you were editing. Your changes were not saved. Copy anything you want to keep, then reload to see their version.";

export const registerAdminMemberDisableRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as MembersRouteDeps;

  app.post("/api/admin/v1/workspaces/:workspaceId/members/:memberId/disable", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    const memberId = String(req.params.memberId ?? "");

    try {
      // Inside the try: requireAdminSession always sets res.locals.principal before this
      // route runs, but Express 4 doesn't catch a synchronous throw from an async handler
      // outside try/catch (the request would otherwise hang instead of 500ing).
      const principal = getAuthedPrincipal(res);

      const authorized = await authorizeOrRespond({ res, authorize: deps.authorize, params: {
        principalId: principal.id,
        permission: "member.manage",
        workspaceId: deps.workspaceId,
        entityType: "member",
        entityId: memberId,
      } });
      if (!authorized) return;

      const result = await disableMember({
        deps: toMembersWriteServiceDeps(deps),
        input: { workspaceId: deps.workspaceId, memberId },
      });

      res.json({ member: toAdminMemberResponse(result.member) });
    } catch (err) {
      if (err instanceof MemberNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }

      if (err instanceof MemberConflictError) {
        res.status(409).json({ code: "VERSION_CONFLICT", error: MEMBER_VERSION_CONFLICT_MESSAGE });
        return;
      }

      if (err instanceof MemberValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }

      sendAdminFailure({ res, error: err }, { operation: "routes/members/disable", code: "INTERNAL_ERROR" });
    }
  });
};
