import type { Express } from "express";

import { acquireOperationLock, releaseOperationLock } from "../../../../core/operation-lock";
import { confirm, execute, ForbiddenError, PlanStaleError, plan, type GatedMutationHooks } from "../../../../core/gated-mutations/gateway";
import { TokenAlreadyRedeemedError, TokenExpiredError } from "../../../../core/gated-mutations/token";
import {
  executeMigrateForward,
  MigrationAlreadyInFlightError,
  RestorePointUnavailableError,
} from "../../../../features/storage/migrate-forward/execute";
import { buildConfirmOnlyHooks, buildMigrateForwardHooks } from "../../../gated-mutations-composition";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { RouteDeps } from "../../types";

/**
 * @file SPEC-017 C-103/C-105 — `POST /api/admin/v1/storage/migrate-forward/{plan,confirm,execute}`
 * (ADR-041 §3's forward-migrate ceremony). Gated by `storage.read` (`plan`) / `storage.migrate`
 * (`confirm`/`execute`). Mirrors `routes/admin/taxonomy/merge-term.ts`'s 3-endpoint shape — the
 * `/execute` step additionally wires `core/operation-lock.ts`'s cross-domain lock via
 * `migrate-forward/execute.ts`'s own `executeMigrateForward` orchestration wrapper (U-003-ORD1:
 * lock acquired strictly before the gateway's own `execute()` runs).
 */
function statusFor(err: unknown): { status: number; code: string } {
  if (err instanceof ForbiddenError) return { status: 403, code: err.reasonCode };
  if (err instanceof PlanStaleError) return { status: 409, code: "PLAN_STALE" };
  if (err instanceof TokenExpiredError) return { status: 409, code: "TOKEN_EXPIRED" };
  if (err instanceof TokenAlreadyRedeemedError) return { status: 409, code: "TOKEN_ALREADY_REDEEMED" };
  if (err instanceof RestorePointUnavailableError) return { status: 409, code: "RESTORE_POINT_UNAVAILABLE" };
  if (err instanceof MigrationAlreadyInFlightError) return { status: 409, code: "OPERATION_IN_FLIGHT" };
  return { status: 500, code: "INTERNAL_ERROR" };
}

export function registerAdminStorageMigrateForwardRoutes(app: Express, deps: RouteDeps): void {
  app.post("/api/admin/v1/storage/migrate-forward/plan", async (_req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const hooks = buildMigrateForwardHooks({
        workspaceId: deps.workspaceId,
        actorId: principal.id,
        clock: deps.clock,
        idGen: deps.idGen,
        dbOps: deps.dbOps,
        restorePointsRepo: deps.restorePointsRepo,
        storageLedgerRepo: deps.storageLedgerRepo,
      });

      const result = await plan({
        deps: deps.gatedMutations.gatewayDeps,
        principalId: principal.id,
        principalKind: "user",
        hooks: hooks as unknown as GatedMutationHooks<unknown, unknown>,
      });

      res.json(result);
    } catch (err) {
      const { status, code } = statusFor(err);
      res.status(status).json({ error: err instanceof Error ? err.message : "internal error", code });
    }
  });

  app.post("/api/admin/v1/storage/migrate-forward/confirm", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const { planId, planHash } = req.body ?? {};
      if (typeof planId !== "string" || typeof planHash !== "string") {
        res.status(400).json({ error: "'planId' and 'planHash' (strings) are required", code: "VALIDATION_ERROR" });
        return;
      }

      const hooks = buildConfirmOnlyHooks({
        domain: "storage.migrate",
        readPermission: "storage.read",
        mutatePermission: "storage.migrate",
        scopeId: deps.workspaceId,
      });

      const record = await confirm({
        deps: deps.gatedMutations.gatewayDeps,
        principalId: principal.id,
        principalKind: "user",
        hooks,
        planId,
        planHash,
      });

      res.json({ confirmationToken: record.confirmationToken });
    } catch (err) {
      const { status, code } = statusFor(err);
      res.status(status).json({ error: err instanceof Error ? err.message : "internal error", code });
    }
  });

  app.post("/api/admin/v1/storage/migrate-forward/execute", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);

      // Audit finding AUD-001 (2026-07-16, external audit TM-20260716-full-session-001):
      // executeMigrateForward acquires the shared cross-domain operation lock strictly before
      // gatewayExecute() runs (U-003-ORD1) -- that ordering exists for mutation-failure/lock-leak
      // safety, not authorization, so an unauthorized-but-authenticated caller could still reach
      // and briefly hold the lock before the gateway's own authorize() rejected them, contending
      // with a concurrent authorized migration. Authorize inline, before any lock acquisition; the
      // gateway's fresh authorize() re-check at execute time (CIC U-001) remains the authoritative
      // check and is unchanged by this.
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "storage.migrate",
        workspaceId: deps.workspaceId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'storage.migrate' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "storage.migrate", reason: authResult.reason },
        });
        return;
      }

      const { confirmationToken } = req.body ?? {};
      if (typeof confirmationToken !== "string") {
        res.status(400).json({ error: "'confirmationToken' (string) is required", code: "VALIDATION_ERROR" });
        return;
      }

      const hooks = buildMigrateForwardHooks({
        workspaceId: deps.workspaceId,
        actorId: principal.id,
        clock: deps.clock,
        idGen: deps.idGen,
        dbOps: deps.dbOps,
        restorePointsRepo: deps.restorePointsRepo,
        storageLedgerRepo: deps.storageLedgerRepo,
      });

      const capabilities = await deps.dbOps.getCapabilities();

      const result = await executeMigrateForward({
        siteId: deps.workspaceId,
        confirmationToken,
        costClass: capabilities.restorePoint.costClass,
        operationLock: { acquireOperationLock, releaseOperationLock },
        gatewayExecute: () =>
          execute({
            deps: deps.gatedMutations.gatewayDeps,
            principalId: principal.id,
            principalKind: "user",
            hooks: hooks as unknown as GatedMutationHooks<unknown, { migrated: true }>,
            confirmationToken,
          }),
      });

      res.json(result);
    } catch (err) {
      const { status, code } = statusFor(err);
      res.status(status).json({ error: err instanceof Error ? err.message : "internal error", code });
    }
  });
}
