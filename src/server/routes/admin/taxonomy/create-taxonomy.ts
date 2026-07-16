import type { Express } from "express";

import { ForbiddenError } from "../../../../core/commands/command";
import { noopStampWatermark, toTaxonomyOutbox } from "../../../../features/taxonomy/repo.memory";
import { createTaxonomy } from "../../../../features/taxonomy/write-service";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { RouteDeps } from "../../types";

/**
 * @file design-spec.md §2.3/§2.8 — `POST /api/admin/v1/taxonomy` (creates a taxonomy, AC-01/
 * AC-26). Gated by `admin.taxonomy.manage`.
 */
export function registerAdminTaxonomyCreateRoute(app: Express, deps: RouteDeps): void {
  app.post("/api/admin/v1/taxonomy", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const body = req.body ?? {};
      if (typeof body.name !== "string" || typeof body.hierarchical !== "boolean") {
        res.status(400).json({ error: "'name' (string) and 'hierarchical' (boolean) are required", code: "VALIDATION_ERROR" });
        return;
      }

      const taxonomy = await createTaxonomy({
        deps: {
          authorize: (params) => deps.authorize({ ...params, workspaceId: deps.workspaceId }),
          clock: deps.clock,
          idGen: deps.idGen,
          taxonomies: deps.taxonomyRepo,
          terms: deps.termRepo,
          entryTerms: deps.entryTermRepo,
          revisions: deps.taxonomyRevisionRepo,
          stampWatermark: noopStampWatermark,
          outbox: toTaxonomyOutbox(deps),
        },
        principalId: principal.id,
        name: body.name,
        hierarchical: body.hierarchical,
      });

      res.status(201).json({ taxonomy });
    } catch (err) {
      if (err instanceof ForbiddenError) {
        res.status(403).json({ error: err.message, code: "FORBIDDEN" });
        return;
      }
      const message = err instanceof Error ? err.message : "internal error";
      res.status(500).json({ error: message, code: "INTERNAL_ERROR" });
    }
  });
}
