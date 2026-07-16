import type { Express } from "express";

import { ForbiddenError } from "../../../../core/commands/command";
import { createPostBackedContentLookup } from "../../../../features/taxonomy/content-lookup";
import { noopStampWatermark, toTaxonomyOutbox } from "../../../../features/taxonomy/repo.memory";
import { renameTerm, TermRecordNotFoundError } from "../../../../features/taxonomy/write-service";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { TaxonomyRouteDeps } from "./deps";

/**
 * @file design-spec.md §2.3/§2.8 — `PUT /api/admin/v1/taxonomy/terms/:id` (renames a term,
 * AC-15/AC-19/AC-25). Gated by `admin.taxonomy.manage`.
 */
export function registerAdminTaxonomyRenameTermRoute(app: Express, deps: TaxonomyRouteDeps): void {
  app.put("/api/admin/v1/taxonomy/terms/:id", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const body = req.body ?? {};
      if (typeof body.newName !== "string") {
        res.status(400).json({ error: "'newName' (string) is required", code: "VALIDATION_ERROR" });
        return;
      }

      const term = await renameTerm({
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
          workspaceId: deps.workspaceId,
          contentLookup: createPostBackedContentLookup({ postRepo: deps.postRepo, workspaceId: deps.workspaceId }),
        },
        principalId: principal.id,
        termId: String(req.params.id),
        newName: body.newName,
      });

      res.json({ term });
    } catch (err) {
      if (err instanceof ForbiddenError) {
        res.status(403).json({ error: err.message, code: "FORBIDDEN" });
        return;
      }
      if (err instanceof TermRecordNotFoundError) {
        res.status(404).json({ error: err.message, code: "TERM_NOT_FOUND" });
        return;
      }
      const message = err instanceof Error ? err.message : "internal error";
      res.status(500).json({ error: message, code: "INTERNAL_ERROR" });
    }
  });
}
