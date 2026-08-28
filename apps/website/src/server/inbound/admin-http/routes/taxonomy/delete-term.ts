import type { Express } from "express";

import { ForbiddenError } from "@jini-ai/cms/core";
import {
  createPostBackedContentLookup,
  toTaxonomyOutbox,
  deleteTerm,
  TermRecordNotFoundError,
  TermHasAssignedContentError,
  TermHasChildTermsError,
} from "#src/features/taxonomy/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { TaxonomyRouteDeps } from "./deps.js";

/**
 * @file Backend-gap closure — the Categories & Tags admin screen had no way to remove a dummy
 * term created to prove `createTerm` works (see this dispatch's brief). `DELETE
 * /api/admin/v1/taxonomy/terms/:id`. Gated by `admin.taxonomy.manage`, same as every other
 * taxonomy route.
 *
 * Refuses (409) rather than cascades when the term still has children or is still assigned to
 * content — see `write-service.ts`'s `deleteTerm` doc comment for why this is a direct delete
 * with no plan()/confirmation ceremony (an unassigned, childless term destroys nothing
 * recoverable, unlike `mergeTerm` which migrates data).
 *
 * `transaction: (fn) => deps.taxonomyRepo.transaction(fn)` — `deleteTerm` wraps its own guard
 * reads and the delete itself in one transaction; this just supplies the primitive (coordinator
 * review, hazards #1/#2: atomicity and TOCTOU). `taxonomyRepo`/`termRepo`/`entryTermRepo` all
 * share the same underlying `db` connection (`server/deps.ts`), so a transaction opened via
 * `taxonomyRepo` covers every write this call makes through the other two as well.
 */
function statusFor(err: unknown): { status: number; code: string; message: string; extra?: Record<string, number> } {
  if (err instanceof ForbiddenError) return { status: 403, code: "FORBIDDEN", message: err.message };
  if (err instanceof TermRecordNotFoundError) return { status: 404, code: "TERM_NOT_FOUND", message: err.message };
  if (err instanceof TermHasChildTermsError) {
    return { status: 409, code: "TERM_HAS_CHILDREN", message: err.message, extra: { childCount: err.childCount } };
  }
  if (err instanceof TermHasAssignedContentError) {
    return { status: 409, code: "TERM_HAS_ASSIGNMENTS", message: err.message, extra: { assignedCount: err.assignedCount } };
  }
  return { status: 500, code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : "internal error" };
}

export function registerAdminTaxonomyDeleteTermRoute(app: Express, deps: TaxonomyRouteDeps): void {
  app.delete("/api/admin/v1/taxonomy/terms/:id", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);

      const result = await deleteTerm({
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
        termId: String(req.params.id),
      });

      res.json(result);
    } catch (err) {
      const { status, code, message, extra } = statusFor(err);
      res.status(status).json({ error: message, code, ...extra });
    }
  });
}
