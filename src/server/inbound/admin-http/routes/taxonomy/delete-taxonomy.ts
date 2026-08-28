import type { Express } from "express";

import { ForbiddenError } from "@jini-ai/cms/core";
import {
  createPostBackedContentLookup,
  toTaxonomyOutbox,
  deleteTaxonomy,
  TaxonomyRecordNotFoundError,
  TaxonomyHasAssignedContentError,
} from "#src/features/taxonomy/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { TaxonomyRouteDeps } from "./deps.js";

/**
 * @file Backend-gap closure — the Categories & Tags admin screen had no way to remove a dummy
 * taxonomy created to prove `createTaxonomy` works (see this dispatch's brief). `DELETE
 * /api/admin/v1/taxonomy/:id`. Gated by `admin.taxonomy.manage`, same as every other taxonomy
 * route.
 *
 * Refuses (409) when ANY member term is still assigned to content — the count reported is the
 * sum across all member terms, not a single term's count. If nothing is assigned, the taxonomy
 * AND its (necessarily unassigned) member terms are deleted together in the same call — see
 * `write-service.ts`'s `deleteTaxonomy` doc comment for why that cascade is safe here in a way
 * `deleteTerm`'s own "has children" guard does not need to separately re-check.
 *
 * `transaction: (fn) => deps.taxonomyRepo.transaction(fn)` — same atomicity/TOCTOU rationale as
 * `delete-term.ts`'s identical wiring; here it also covers the multi-term cascade delete, which
 * has no FK/CASCADE at the schema level to fall back on if it fails partway through.
 */
function statusFor(err: unknown): { status: number; code: string; message: string; extra?: Record<string, number> } {
  if (err instanceof ForbiddenError) return { status: 403, code: "FORBIDDEN", message: err.message };
  if (err instanceof TaxonomyRecordNotFoundError) return { status: 404, code: "TAXONOMY_NOT_FOUND", message: err.message };
  if (err instanceof TaxonomyHasAssignedContentError) {
    return { status: 409, code: "TAXONOMY_HAS_ASSIGNMENTS", message: err.message, extra: { assignedCount: err.assignedCount } };
  }
  return { status: 500, code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : "internal error" };
}

export function registerAdminTaxonomyDeleteRoute(app: Express, deps: TaxonomyRouteDeps): void {
  app.delete("/api/admin/v1/taxonomy/:id", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);

      const result = await deleteTaxonomy({
        deps: {
          authorize: (params) => deps.authorize({ ...params, workspaceId: deps.workspaceId }),
          clock: deps.clock,
          idGen: deps.idGen,
          taxonomies: deps.taxonomyRepo,
          terms: deps.termRepo,
          entryTerms: deps.entryTermRepo,
          revisions: deps.taxonomyRevisionRepo,
          stampWatermark: deps.stampWatermark,
          outbox: toTaxonomyOutbox(deps),
          workspaceId: deps.workspaceId,
          contentLookup: createPostBackedContentLookup({ postRepo: deps.postRepo, workspaceId: deps.workspaceId }),
          transaction: (fn) => deps.taxonomyRepo.transaction(fn),
        },
        principalId: principal.id,
        taxonomyId: String(req.params.id),
      });

      res.json(result);
    } catch (err) {
      const { status, code, message, extra } = statusFor(err);
      res.status(status).json({ error: message, code, ...extra });
    }
  });
}
