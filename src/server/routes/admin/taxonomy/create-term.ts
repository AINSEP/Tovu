import type { Express } from "express";

import { ForbiddenError } from "@jini-ai/cms/core";
import {
  TaxonomyRecordNotFoundError,
  HierarchyCycleDetectedError,
  ParentCrossTaxonomyError,
  TaxonomyNotHierarchicalError,
  TermNotFoundError,
  createPostBackedContentLookup,
  toTaxonomyOutbox,
  createTerm,
} from "#src/features/taxonomy/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { TaxonomyRouteDeps } from "./deps.js";

function statusFor(err: unknown): { status: number; code: string; message: string } {
  if (err instanceof ForbiddenError) return { status: 403, code: "FORBIDDEN", message: err.message };
  if (err instanceof TaxonomyRecordNotFoundError) return { status: 404, code: "TAXONOMY_NOT_FOUND", message: err.message };
  if (
    err instanceof HierarchyCycleDetectedError ||
    err instanceof ParentCrossTaxonomyError ||
    err instanceof TaxonomyNotHierarchicalError ||
    err instanceof TermNotFoundError
  ) {
    return { status: 400, code: "VALIDATION_ERROR", message: err.message };
  }
  return { status: 500, code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : "internal error" };
}

/**
 * @file design-spec.md §2.3/§2.8 — `POST /api/admin/v1/taxonomy/:taxonomyId/terms` (creates a
 * term, AC-03/AC-13/EC-04). Gated by `admin.taxonomy.manage`.
 */
export function registerAdminTaxonomyCreateTermRoute(app: Express, deps: TaxonomyRouteDeps): void {
  app.post("/api/admin/v1/taxonomy/:taxonomyId/terms", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const body = req.body ?? {};
      if (typeof body.name !== "string") {
        res.status(400).json({ error: "'name' (string) is required", code: "VALIDATION_ERROR" });
        return;
      }

      const term = await createTerm({
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
        },
        principalId: principal.id,
        taxonomyId: String(req.params.taxonomyId),
        name: body.name,
        parentId: typeof body.parentId === "string" ? body.parentId : null,
      });

      res.status(201).json({ term });
    } catch (err) {
      const { status, code, message } = statusFor(err);
      res.status(status).json({ error: message, code });
    }
  });
}
