import type { Express } from "express";

import { ForbiddenError } from "@jini-ai/cms/core";
import { createPostBackedContentLookup } from "#src/features/taxonomy/content-lookup";
import { noopStampWatermark, toTaxonomyOutbox } from "#src/features/taxonomy/repo.memory";
import {
  TaxonomyNotApplicableError,
  WorkspaceMismatchError,
  ContentTypeMismatchError,
} from "#src/features/taxonomy/validation-chain";
import {
  assignTerms,
  ContentRecordNotFoundError,
  TermRecordNotFoundError,
} from "#src/features/taxonomy/write-service";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { TaxonomyRouteDeps } from "./deps";

function statusFor(err: unknown): { status: number; code: string; message: string } {
  if (err instanceof ForbiddenError) return { status: 403, code: "FORBIDDEN", message: err.message };
  if (err instanceof TermRecordNotFoundError) return { status: 404, code: "TERM_NOT_FOUND", message: err.message };
  if (err instanceof ContentRecordNotFoundError) return { status: 404, code: "CONTENT_NOT_FOUND", message: err.message };
  if (
    err instanceof TaxonomyNotApplicableError ||
    err instanceof WorkspaceMismatchError ||
    err instanceof ContentTypeMismatchError
  ) {
    return { status: 400, code: "VALIDATION_ERROR", message: err.message };
  }
  return { status: 500, code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : "internal error" };
}

/**
 * @file design-spec.md §1.6/§2.8 — `POST /api/admin/v1/taxonomy/assign-terms` (the `<TermPicker>`
 * shared by Collections §1.6 and Categories & Tags §2.2, AC-17/AC-20/INV-05/REQ-13/REQ-14).
 * Gated by `admin.taxonomy.manage`.
 *
 * ADR-041/043/044/045 re-audit (2026-07-16, TM-adr041-043-044-045-audit-001, Finding 1 fix):
 * `assignTerms` now runs `validation-chain.ts`'s `validateContentJoin` allow-list/workspace/lens
 * chain via `createPostBackedContentLookup` (the "content repo port" the old disclosed-gap
 * comment said this needed).
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
          workspaceId: deps.workspaceId,
          contentLookup: createPostBackedContentLookup({ postRepo: deps.postRepo, workspaceId: deps.workspaceId }),
        },
        principalId: principal.id,
        contentType: body.contentType,
        contentId: body.contentId,
        termIds: body.termIds,
      });

      res.status(204).send();
    } catch (err) {
      const { status, code, message } = statusFor(err);
      res.status(status).json({ error: message, code });
    }
  });
}
