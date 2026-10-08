import { processOutbox } from "#src/contracts/core/events/index";
import { createWorkspace, WorkspaceConflictError, WorkspaceValidationError } from "#src/features/workspace/index";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { WorkspaceRouteRegistrar } from "./deps.js";

/**
 * POST workspaces — `CREATE_WORKSPACE` (SPEC-044 REQ-01). The hybrid synchronous command
 * and outbox-flush path requires AUTH_SESSION (mounted on /api/admin by core.ts) plus
 * `workspace.manage` authorization; unauthenticated callers must not create workspace rows.
 */
export const registerAdminWorkspaceCreateRoute: WorkspaceRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      if (
        !(await authorizeOrRespond(res, deps.authorize, {
          principalId: principal.id,
          permission: "workspace.manage",
          workspaceId: deps.workspaceId,
        }))
      )
        return;

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
