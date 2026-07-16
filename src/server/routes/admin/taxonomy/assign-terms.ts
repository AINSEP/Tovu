import type { Express } from "express";

import { ForbiddenError } from "../../../../core/commands/command";
import { noopStampWatermark, toTaxonomyOutbox } from "../../../../features/taxonomy/repo.memory";
import { assignTerms } from "../../../../features/taxonomy/write-service";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { TaxonomyRouteDeps } from "./deps";

/**
 * @file design-spec.md §1.6/§2.8 — `POST /api/admin/v1/taxonomy/assign-terms` (the `<TermPicker>`
 * shared by Collections §1.6 and Categories & Tags §2.2, AC-17/AC-20/INV-05/REQ-13/REQ-14).
 * Gated by `admin.taxonomy.manage`.
 *
 * Known scope gap disclosed by `write-service.ts`'s own file header: `assignTerms` does not run
 * `validation-chain.ts`'s `validateContentJoin` allow-list/workspace/lens chain — that chain needs
 * a content-repo port this dispatch's scope (read-side + route-wiring only) does not build. This
 * route inherits that same disclosed gap, not a new one.
 */
export function registerAdminTaxonomyAssignTermsRoute(app: Express, deps: TaxonomyRouteDeps): void {
  app.post("/api/admin/v1/taxonomy/assign-terms", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const body = req.body ?? {};
      if (typeof body.contentType !== "string" || typeof body.contentId !== "string" || !Array.isArray(body.termIds)) {
        res.status(400).json({ error: "'contentType', 'contentId' (strings), and 'termIds' (array) are required", code: "VALIDATION_ERROR" });
        return;
      }

      await assignTerms({
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
        contentType: body.contentType,
        contentId: body.contentId,
        termIds: body.termIds,
      });

      res.status(204).send();
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
