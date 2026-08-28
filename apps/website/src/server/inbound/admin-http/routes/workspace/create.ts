import { processOutbox } from "#src/contracts/core/events/index";
import { createWorkspace, WorkspaceConflictError, WorkspaceValidationError } from "#src/features/workspace/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { WorkspaceRouteRegistrar } from "./deps.js";

/**
 * POST workspaces — `CREATE_WORKSPACE` (SPEC-044 REQ-01). Moved from the original unauthenticated
 * `POST /workspaces` in `server/app.ts` (removed there) — this is the same `hybrid execution model`
 * (synchronous command path + outbox flush) that route always had, now gated by `AUTH_SESSION`
 * (mounted globally on `/api/admin` by `core.ts`'s `requireAdminSession`) + `authorize()` for
 * `workspace.manage`, closing the gap this spec exists to close: any unauthenticated caller could
 * previously create a workspace row.
 */
export const registerAdminWorkspaceCreateRoute: WorkspaceRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "workspace.manage",
        workspaceId: deps.workspaceId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'workspace.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "workspace.manage", reason: authResult.reason },
        });
        return;
      }

      const { id } = await createWorkspace({
        deps: { idGen: deps.idGen, clock: deps.clock, repo: deps.workspaceRepo, outbox: deps.outbox },
        input: { name: String(req.body?.name ?? ""), slug: String(req.body?.slug ?? "") },
      });

      await processOutbox({ outbox: deps.outbox, bus: deps.bus, clock: deps.clock });

      res.status(201).json({ id });
    } catch (err) {
      if (err instanceof WorkspaceValidationError) {
        res.status(400).json({ error: err.message, code: "VALIDATION_ERROR" });
        return;
      }

      if (err instanceof WorkspaceConflictError) {
        res.status(409).json({ error: err.message, code: "RESOURCE_CONFLICT", details: { field: "slug" } });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};
