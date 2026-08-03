import type { Express } from "express";

import { listTaxonomiesWithTerms } from "#src/features/taxonomy/list";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { TaxonomyRouteDeps } from "./deps";

/**
 * @file design-spec.md §2.2/§2.8 — `GET /api/admin/v1/taxonomy` (Categories & Tags' two-pane
 * source, ADR-044). Gated by `admin.taxonomy.manage` — ADR-044 registers exactly one permission
 * for this whole domain (no `.read`/`.write` split), so this list route reuses it rather than
 * inventing an unratified `admin.taxonomy.read` string.
 */
export function registerAdminTaxonomyListRoute(app: Express, deps: TaxonomyRouteDeps): void {
  app.get("/api/admin/v1/taxonomy", async (_req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.taxonomy.manage",
        workspaceId: deps.workspaceId,
        entityType: "taxonomy",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.taxonomy.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.taxonomy.manage", reason: authResult.reason },
        });
        return;
      }

      const result = await listTaxonomiesWithTerms({ taxonomies: deps.taxonomyRepo, terms: deps.termRepo });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "internal error";
      res.status(500).json({ error: message, code: "INTERNAL_ERROR" });
    }
  });
}
