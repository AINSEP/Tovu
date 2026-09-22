import type { Express } from "express";

import { trashTaxonomy } from "#src/features/taxonomy/trash-term";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { TaxonomyRouteDeps } from "./deps.js";

/**
 * @file `DELETE /api/admin/v1/taxonomy/:id` moves a taxonomy to the Trash (T6, trash parallel
 * plan §2, owner decision 5) — this REPLACES the prior hard-delete call into `@jini-ai/cms/taxonomy`'s
 * `deleteTaxonomy` (see `features/taxonomy/trash-term.ts`'s file header). A taxonomy declares no
 * blocker (`RemoveTaxonomyFn` is narrowed, unlike `RemoveTermFn`) — its member terms read as
 * trashed the instant the taxonomy does (`hiddenWithParent`), no separate cascade write. Gated by
 * `admin.taxonomy.manage`, same as every other taxonomy route, via the shared `authorizeOrRespond`
 * guard — same precedent as `delete-term.ts`/`routes/menus/delete.ts`.
 */
export function registerAdminTaxonomyDeleteRoute(app: Express, deps: TaxonomyRouteDeps): void {
  app.delete("/api/admin/v1/taxonomy/:id", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const taxonomyId = String(req.params.id);

      const authorized = await authorizeOrRespond(res, deps.authorize, {
        principalId: principal.id,
        permission: "admin.taxonomy.manage",
        workspaceId: deps.workspaceId,
        entityType: "taxonomy",
        entityId: taxonomyId,
      });
      if (!authorized) return;

      const outcome = await trashTaxonomy(
        { workspaceId: deps.workspaceId, taxonomyId, actor: { principalId: principal.id, pluginId: null } },
        { taxonomyRepo: deps.taxonomyRepo, remove: deps.removeTaxonomy, clock: deps.clock }
      );

      if (!outcome.ok && outcome.reason === "not-found") {
        res.status(404).json({ error: `taxonomy '${taxonomyId}' was not found`, code: "TAXONOMY_NOT_FOUND" });
        return;
      }
      if (!outcome.ok) {
        res
          .status(409)
          .json({ error: `taxonomy '${taxonomyId}' changed while it was being deleted`, code: "TRASH_VERSION_CHANGED" });
        return;
      }
      res.status(200).json({ trashed: true, id: taxonomyId, version: outcome.version });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
