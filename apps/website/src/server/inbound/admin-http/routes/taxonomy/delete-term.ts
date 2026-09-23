import type { Express } from "express";

import { trashTerm } from "#src/features/taxonomy/trash-term";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { TaxonomyRouteDeps } from "./deps.js";

/**
 * @file `DELETE /api/admin/v1/taxonomy/terms/:id` moves a term to the Trash (T6, trash parallel
 * plan §2, owner decision 5) — this REPLACES the prior hard-delete call into `@jini-ai/cms/taxonomy`'s
 * `deleteTerm` (see `features/taxonomy/trash-term.ts`'s file header for why: an assigned term is
 * now trashable, only the child-term blocker survives, as the Trash's own generic
 * `TERM_HAS_CHILDREN`). Gated by `admin.taxonomy.manage`, same as every other taxonomy route, via
 * the shared `authorizeOrRespond` guard (`trashTerm` has no permission hook of its own — same
 * precedent as `routes/menus/delete.ts`'s just-landed `trashMenu` wiring).
 */
export function registerAdminTaxonomyDeleteTermRoute(app: Express, deps: TaxonomyRouteDeps): void {
  app.delete("/api/admin/v1/taxonomy/terms/:id", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const termId = String(req.params.id);

      const authorized = await authorizeOrRespond(res, deps.authorize, {
        principalId: principal.id,
        permission: "admin.taxonomy.manage",
        workspaceId: deps.workspaceId,
        entityType: "term",
        entityId: termId,
      });
      if (!authorized) return;

      const outcome = await trashTerm(
        { workspaceId: deps.workspaceId, termId, actor: { principalId: principal.id, pluginId: null } },
        { termRepo: deps.termRepo, remove: deps.removeTerm, clock: deps.clock }
      );

      if (!outcome.ok && outcome.reason === "not-found") {
        res.status(404).json({ error: `term '${termId}' was not found`, code: "TERM_NOT_FOUND" });
        return;
      }
      if (!outcome.ok && outcome.reason === "blocked") {
        res.status(409).json({ error: `term '${termId}' still has child terms`, code: outcome.code, count: outcome.count });
        return;
      }
      if (!outcome.ok) {
        res.status(409).json({ error: `term '${termId}' changed while it was being deleted`, code: "TRASH_VERSION_CHANGED" });
        return;
      }
      res.status(200).json({ trashed: true, id: termId, version: outcome.version });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
