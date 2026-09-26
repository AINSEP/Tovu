import type { Express, Request, Response } from "express";

import { EntityNotLiveError, ForbiddenError } from "@jini-ai/cms/core";
import { authorizeContentEdit, createContentTargetPorts } from "#src/features/taxonomy/collection-term-policy";
import {
  toTaxonomyOutbox,
  TaxonomyNotApplicableError,
  WorkspaceMismatchError,
  ContentTypeMismatchError,
  assignTerms,
  unassignTerms,
  ContentRecordNotFoundError,
  TermRecordNotFoundError,
} from "#src/features/taxonomy/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { TaxonomyRouteDeps } from "./deps.js";

/** The `EntityNotLiveError` arm is S10 (web-high fix plan, 2026-09-24) — assigning terms to a
 * trashed post/page now 409s instead of silently joining terms to it. */
function statusFor(err: unknown): { status: number; code: string; message: string } {
  if (err instanceof EntityNotLiveError) return { status: 409, code: err.code, message: err.message };
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

const TAXONOMY_PERMISSION = "admin.taxonomy.manage";

/** Jini's write deps for one assignment call: posts/pages and collection entries both resolve,
 *  and an entry takes any taxonomy while its collection is live (`createContentTargetPorts`). */
function writeDeps(deps: TaxonomyRouteDeps) {
  return {
    authorize: (params: { principalId: string; permission: string }) => deps.authorize({ ...params, workspaceId: deps.workspaceId }),
    clock: deps.clock,
    idGen: deps.idGen,
    taxonomies: deps.taxonomyRepo,
    terms: deps.termRepo,
    entryTerms: deps.entryTermRepo,
    revisions: deps.taxonomyRevisionRepo,
    stampWatermark: deps.stampWatermark,
    outbox: toTaxonomyOutbox(deps),
    workspaceId: deps.workspaceId,
    ...createContentTargetPorts(deps),
  };
}

/** The shared `{ contentType, contentId, termIds }` body, or `null` after answering 400. */
function readAssignmentBody(req: Request, res: Response): { contentType: string; contentId: string; termIds: string[] } | null {
  const body = req.body ?? {};
  if (typeof body.contentType !== "string" || typeof body.contentId !== "string" || !Array.isArray(body.termIds)) {
    res.status(400).json({ error: "'contentType', 'contentId' (strings), and 'termIds' (array) are required", code: "VALIDATION_ERROR" });
    return null;
  }
  return { contentType: body.contentType, contentId: body.contentId, termIds: body.termIds };
}

function sendError(res: Response, err: unknown): void {
  const { status, code, message } = statusFor(err);
  res.status(status).json({ error: message, code });
}

/**
 * @file design-spec.md §1.6/§2.8 — `POST /api/admin/v1/taxonomy/assign-terms` (the `<TermPicker>`
 * shared by Collections §1.6 and Categories & Tags §2.2, AC-17/AC-20/INV-05/REQ-13/REQ-14).
 * Gated by `admin.taxonomy.manage`.
 *
 * ADR-041/043/044/045 re-audit (2026-07-16, TM-adr041-043-044-045-audit-001, Finding 1 fix):
 * `assignTerms` now runs `validation-chain.ts`'s `validateContentJoin` allow-list/workspace/lens
 * chain via a content lookup (the "content repo port" the old disclosed-gap comment said this
 * needed). Since 2026-09-26 that lookup also resolves collection entries, admitted by the same
 * live-collection policy publishing uses. Tagging also needs the content's own edit permission:
 * `content.write` for a post/page, `admin.collections.manage` for an entry.
 */
export function registerAdminTaxonomyAssignTermsRoute(app: Express, deps: TaxonomyRouteDeps): void {
  app.post("/api/admin/v1/taxonomy/assign-terms", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const body = readAssignmentBody(req, res);
      if (!body) return;
      await authorizeContentEdit(deps, principal.id, body.contentType);
      await assignTerms({ deps: writeDeps(deps), principalId: principal.id, ...body });
      res.status(204).send();
    } catch (err) {
      sendError(res, err);
    }
  });
}

/**
 * `POST /api/admin/v1/taxonomy/unassign-terms` — the removal half the post, page and entry editors'
 * Categories & Tags box saves with (Jini `unassignTerms`: same permission, target and term checks as assign;
 * removing a term that is not assigned is a no-op).
 */
export function registerAdminTaxonomyUnassignTermsRoute(app: Express, deps: TaxonomyRouteDeps): void {
  app.post("/api/admin/v1/taxonomy/unassign-terms", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const body = readAssignmentBody(req, res);
      if (!body) return;
      await authorizeContentEdit(deps, principal.id, body.contentType);
      await unassignTerms({ deps: writeDeps(deps), principalId: principal.id, ...body });
      res.status(204).send();
    } catch (err) {
      sendError(res, err);
    }
  });
}

/**
 * `GET /api/admin/v1/taxonomy/assigned-terms?contentType=&contentId=` — `{ termIds }`, the terms one
 * post, page or entry holds now, so the editor shows them ticked. Same permissions as a write.
 */
export function registerAdminTaxonomyAssignedTermsRoute(app: Express, deps: TaxonomyRouteDeps): void {
  app.get("/api/admin/v1/taxonomy/assigned-terms", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const { contentType, contentId } = req.query;
      if (typeof contentType !== "string" || typeof contentId !== "string" || contentType === "" || contentId === "") {
        res.status(400).json({ error: "'contentType' and 'contentId' query parameters are required", code: "VALIDATION_ERROR" });
        return;
      }
      const allowed = await deps.authorize({ principalId: principal.id, permission: TAXONOMY_PERMISSION, workspaceId: deps.workspaceId });
      if (!allowed.allowed) {
        throw new ForbiddenError(`principal '${principal.id}' is not authorized for '${TAXONOMY_PERMISSION}' (${allowed.reason})`, TAXONOMY_PERMISSION, allowed.reason);
      }
      await authorizeContentEdit(deps, principal.id, contentType);
      const rows = await deps.entryTermRepo.listForContent({ contentType, contentId });
      res.json({ termIds: rows.map((row) => row.termId).sort() });
    } catch (err) {
      sendError(res, err);
    }
  });
}
