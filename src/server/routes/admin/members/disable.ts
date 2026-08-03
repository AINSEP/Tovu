import { disableMember, MemberNotFoundError, MemberValidationError } from "#src/members/index";
import { toAdminMemberResponse } from "#src/server/http/admin/members";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RouteRegistrar } from "#src/server/routes/types";
import { toMembersWriteServiceDeps, type MembersRouteDeps } from "./deps";

/**
 * POST disable a member (ADR-021 §5 disable-only, never hard-delete — there
 * is intentionally no DELETE route for members, matching the write-service's
 * `disableMember` being the sole lifecycle-removal path). Idempotent at the
 * write-service layer: disabling an already-disabled member returns 200 with
 * the unchanged record rather than erroring.
 *
 * SPEC-006 REQ-05 wiring proof (second route, alongside posts create/update):
 * this route does not flow through the SPEC-001 command gateway (no
 * change-set is recorded for a member disable — a pre-existing gap unrelated
 * to this spec, see the Programmer handoff), so `authorize()` is called
 * directly rather than via `executeCommand`'s `deps.authorize` hook.
 */
export const registerAdminMemberDisableRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as MembersRouteDeps;

  app.post("/api/admin/v1/workspaces/:workspaceId/members/:memberId/disable", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const memberId = String(req.params.memberId ?? "");

    try {
      // Inside the try: requireAdminSession always sets res.locals.principal before this
      // route runs, but Express 4 doesn't catch a synchronous throw from an async handler
      // outside try/catch (the request would otherwise hang instead of 500ing).
      const principal = getAuthedPrincipal(res);

      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "member.manage",
        workspaceId: deps.workspaceId,
        entityType: "member",
        entityId: memberId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'member.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "member.manage", reason: authResult.reason },
        });
        return;
      }

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

      if (err instanceof MemberValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};
