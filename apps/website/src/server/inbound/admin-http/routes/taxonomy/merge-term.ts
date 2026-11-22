import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import type { Express } from "express";

import { confirm, execute, ForbiddenError, PlanStaleError, plan, type GatedMutationHooks } from "#src/contracts/core/gated-mutations/gateway";
import { TokenAlreadyRedeemedError, TokenExpiredError } from "#src/contracts/core/gated-mutations/token";
import { confirmMergeTerm, executeMergeTerm, planMergeTerm, SameTermMergeError } from "@jini-ai/cms/taxonomy";
import { buildConfirmOnlyHooks } from "#src/contracts/core/gated-mutations/composition";
import { buildMergeTermHooks } from "#src/features/taxonomy/gated-hooks";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file SPEC-018 C-207 — `POST /api/admin/v1/taxonomy/terms/:id/merge/{plan,confirm,execute}`
 * (ADR-044's one gated mutation). `:id` is `fromTermId`; `intoTermId` is supplied in the request
 * body on `plan` and `execute` (mirrors `gateway.ts`'s own 3-method shape — this is the first
 * gated-mutation route wired in this codebase, no prior 1-endpoint-vs-3-endpoint precedent
 * existed to follow, so this dispatch establishes the 3-endpoint convention the dispatch brief
 * itself named as the natural fit). Gated by `admin.taxonomy.manage` throughout (ADR-044 registers
 * one flat permission for the whole domain).
 *
 * `resolveMergeTermError` centralizes the gated-mutation error-to-HTTP-status mapping every one of
 * this dispatch's 3 ceremony route files repeats (kept per-file rather than a shared helper module,
 * since each ceremony's own domain error — `SameTermMergeError` here — differs).
 *
 * Trash parallel plan, owner decision 5: merge stays a hard delete (`executeMergeTerm` migrates
 * `intoTermId`'s content and removes `fromTermId` outright) — unlike `delete-term.ts`/
 * `delete-taxonomy.ts`, this file is NOT converted to the Trash. No code change here.
 */
function statusFor({ err }: { err: unknown }, _optional = {}): { status: number; code: string; message: string } | null {
  if (err instanceof ForbiddenError) return { status: 403, code: err.reasonCode, message: err.message };
  if (err instanceof PlanStaleError) return { status: 409, code: "PLAN_STALE", message: err.message };
  if (err instanceof TokenExpiredError) return { status: 409, code: "TOKEN_EXPIRED", message: err.message };
  if (err instanceof TokenAlreadyRedeemedError) return { status: 409, code: "TOKEN_ALREADY_REDEEMED", message: err.message };
  if (err instanceof SameTermMergeError) return { status: 400, code: "SAME_TERM_MERGE", message: err.message };
  return null;
}

function registerAdminTaxonomyMergePlanRoute({ app, deps }: { app: Express; deps: RouteDeps }) {
  app.post("/api/admin/v1/taxonomy/terms/:id/merge/plan", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const fromTermId = String(req.params.id);
      const intoTermId = req.body?.intoTermId;
      if (typeof intoTermId !== "string") {
        res.status(400).json({ error: "'intoTermId' (string) is required", code: "VALIDATION_ERROR" });
        return;
      }

      const hooks = buildMergeTermHooks({
        workspaceId: deps.workspaceId,
        fromTermId,
        intoTermId,
        actorId: principal.id,
        clock: deps.clock,
        termRepo: deps.termRepo,
        entryTermRepo: deps.entryTermRepo,
        taxonomyRevisionRepo: deps.taxonomyRevisionRepo,
      });

      const result = await planMergeTerm({
        principalId: principal.id,
        principalKind: "user",
        fromTermId,
        intoTermId,
        computeOverlap: async () => ({ overlappingContentCount: await deps.entryTermRepo.countOverlap({ fromTermId, intoTermId }) }),
        gatewayPlan: async () =>
          plan({
            deps: deps.gatedMutations.gatewayDeps,
            principalId: principal.id,
            principalKind: "user",
            hooks: hooks as unknown as GatedMutationHooks<unknown, unknown>,
          }),
      });

      res.json(result);
    } catch (err) {
      const failure = statusFor({ err });
      if (!failure) { sendAdminFailure({ res, error: err }); return; }
      res.status(failure.status).json({ error: failure.message, code: failure.code });
    }
  });
}

function registerAdminTaxonomyMergeConfirmRoute({ app, deps }: { app: Express; deps: RouteDeps }) {
  app.post("/api/admin/v1/taxonomy/terms/:id/merge/confirm", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const { planId, planHash } = req.body ?? {};
      if (typeof planId !== "string" || typeof planHash !== "string") {
        res.status(400).json({ error: "'planId' and 'planHash' (strings) are required", code: "VALIDATION_ERROR" });
        return;
      }

      const hooks = buildConfirmOnlyHooks({
        domain: "taxonomy.merge",
        readPermission: "admin.taxonomy.manage",
        mutatePermission: "admin.taxonomy.manage",
        scopeId: deps.workspaceId,
      });

      const { token } = await confirmMergeTerm({
        principalId: principal.id,
        principalKind: "user",
        planId,
        planHash,
        gatewayConfirm: async (params) => {
          const record = await confirm({
            deps: deps.gatedMutations.gatewayDeps,
            principalId: principal.id,
            principalKind: "user",
            hooks: hooks as unknown as GatedMutationHooks<unknown, unknown>,
            planId: params.planId,
            planHash: params.planHash,
          });
          return { token: record.confirmationToken };
        },
      });

      res.json({ confirmationToken: token });
    } catch (err) {
      const failure = statusFor({ err });
      if (!failure) { sendAdminFailure({ res, error: err }); return; }
      res.status(failure.status).json({ error: failure.message, code: failure.code });
    }
  });
}

export function registerAdminTaxonomyMergeTermRoutes({ app, deps }: { app: Express; deps: RouteDeps }, _optional: Record<string, never> = {}): void {
  registerAdminTaxonomyMergePlanRoute({ app, deps });
  registerAdminTaxonomyMergeConfirmRoute({ app, deps });

  app.post("/api/admin/v1/taxonomy/terms/:id/merge/execute", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const fromTermId = String(req.params.id);
      const { intoTermId, confirmationToken } = req.body ?? {};
      if (typeof intoTermId !== "string" || typeof confirmationToken !== "string") {
        res.status(400).json({ error: "'intoTermId' and 'confirmationToken' (strings) are required", code: "VALIDATION_ERROR" });
        return;
      }

      const hooks = buildMergeTermHooks({
        workspaceId: deps.workspaceId,
        fromTermId,
        intoTermId,
        actorId: principal.id,
        clock: deps.clock,
        termRepo: deps.termRepo,
        entryTermRepo: deps.entryTermRepo,
        taxonomyRevisionRepo: deps.taxonomyRevisionRepo,
      });

      const result = await executeMergeTerm({
        confirmationToken,
        gatewayExecute: (params) =>
          execute({
            deps: deps.gatedMutations.gatewayDeps,
            principalId: principal.id,
            principalKind: "user",
            hooks: hooks as unknown as GatedMutationHooks<unknown, { mergedCount: number }>,
            confirmationToken: params.confirmationToken,
          }),
      });

      res.json(result);
    } catch (err) {
      const failure = statusFor({ err });
      if (!failure) { sendAdminFailure({ res, error: err }); return; }
      res.status(failure.status).json({ error: failure.message, code: failure.code });
    }
  });
}
