import type { Express } from "express";

import { acquireOperationLock, releaseOperationLock } from "../../../../core/operation-lock";
import { confirm, execute, plan } from "../../../../core/gated-mutations/gateway";
import { confirmRestore, executeRestore, planRestore } from "../../../../features/recovery/recovery-orchestrator";
import { buildConfirmOnlyHooks, buildRestoreHooks, toRecoveryResult, type RecoveryErrorPayload } from "../../../gated-mutations-composition";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { RouteDeps } from "../../types";

/**
 * @file SPEC-019 C-301/C-302/C-303 — `POST /api/admin/v1/recovery/restore/{plan,confirm,execute}`
 * (ADR-045 §3's restore ceremony). Gated by `backup.read` (`plan`/`confirm`) / `backup.restore`
 * (`execute`, enforced inside `gateway.ts`'s own fixed check-sequence). Mirrors
 * `routes/admin/taxonomy/merge-term.ts`'s 3-endpoint shape, composed directly over
 * `features/recovery/recovery-orchestrator.ts`'s already-built `planRestore`/`confirmRestore`/
 * `executeRestore` wrappers (this file supplies the `Result`-wrapped gateway binding + the real
 * `core/operation-lock.ts` primitive those wrappers were built to receive from a composition root
 * — see `gated-mutations-composition.ts`'s `buildRestoreHooks` doc comment for the disclosed scope
 * boundary: the ceremony's token/authorize/lock plumbing is fully real, the final physical
 * `content.db` file replacement is not).
 */
function statusForCode(code: string): number {
  switch (code) {
    case "NOT_AUTHORIZED":
    case "AGENT_CANNOT_CONFIRM":
    case "ACTOR_CLASS_MISMATCH":
      return 403;
    case "VALIDATION_ERROR":
      return 400;
    case "COST_CLASS_UNAVAILABLE":
    case "PLAN_STALE":
    case "TOKEN_EXPIRED":
    case "TOKEN_ALREADY_REDEEMED":
    case "RESTORE_OPERATION_IN_FLIGHT":
      return 409;
    default:
      return 500;
  }
}

function sendRecoveryError(res: import("express").Response, error: RecoveryErrorPayload): void {
  res.status(statusForCode(error.code)).json({ error: error.message ?? error.code, code: error.code });
}

export function registerAdminRecoveryRestoreRoutes(app: Express, deps: RouteDeps): void {
  app.post("/api/admin/v1/recovery/restore/plan", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const restorePointId = req.body?.restorePointId;
      if (typeof restorePointId !== "string") {
        res.status(400).json({ error: "'restorePointId' (string) is required", code: "VALIDATION_ERROR" });
        return;
      }

      const result = await planRestore({
        deps: {
          dbOps: {
            getCapabilities: async () => {
              const capabilities = await deps.dbOps.getCapabilities();
              return { costClass: capabilities.restorePoint.costClass, restorePointKind: capabilities.restorePoint.kind };
            },
          },
          gateway: {
            plan: (input) =>
              toRecoveryResult(() =>
                plan({
                  deps: deps.gatedMutations.gatewayDeps,
                  principalId: input.principalId,
                  principalKind: input.principalKind,
                  hooks: buildRestoreHooks({
                    workspaceId: deps.workspaceId,
                    actorId: principal.id,
                    restorePointId: input.restorePointId,
                    clock: deps.clock,
                    idGen: deps.idGen,
                    restorePointsRepo: deps.restorePointsRepo,
                    databaseLedgerRepo: deps.databaseLedgerRepo,
                    dbOps: deps.dbOps,
                    migrationRunsRepo: deps.migrationRunsRepo,
                    siteStatus: deps.siteStatusRepo,
                  }) as never,
                })
              ),
          },
        },
        input: { principalId: principal.id, principalKind: "user", restorePointId },
      });

      if (!result.ok) {
        sendRecoveryError(res, result.error);
        return;
      }
      res.json(result.value);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "internal error", code: "INTERNAL_ERROR" });
    }
  });

  app.post("/api/admin/v1/recovery/restore/confirm", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const { planId, planHash, disclosureAcknowledged } = req.body ?? {};
      if (typeof planId !== "string" || typeof planHash !== "string") {
        res.status(400).json({ error: "'planId' and 'planHash' (strings) are required", code: "VALIDATION_ERROR" });
        return;
      }

      const result = await confirmRestore({
        deps: {
          gateway: {
            confirm: (input) =>
              toRecoveryResult(async () => {
                const hooks = buildConfirmOnlyHooks({
                  domain: "backup.restore",
                  readPermission: "backup.read",
                  mutatePermission: "backup.restore",
                  scopeId: deps.workspaceId,
                });
                const record = await confirm({
                  deps: deps.gatedMutations.gatewayDeps,
                  principalId: principal.id,
                  principalKind: "user",
                  hooks,
                  planId: input.planId,
                  planHash: input.planHash,
                });
                return { confirmationToken: record.confirmationToken };
              }),
          },
        },
        input: { principalId: principal.id, principalKind: "user", planId, planHash, disclosureAcknowledged: disclosureAcknowledged === true },
      });

      if (!result.ok) {
        sendRecoveryError(res, result.error);
        return;
      }
      res.json(result.value);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "internal error", code: "INTERNAL_ERROR" });
    }
  });

  app.post("/api/admin/v1/recovery/restore/execute", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);

      // Audit finding AUD-001 (2026-07-16, external audit TM-20260716-full-session-001):
      // executeRestore acquires the shared cross-domain operation lock strictly before
      // gatewayExecute() runs -- that ordering exists for mutation-failure/lock-leak safety, not
      // authorization, so an unauthorized-but-authenticated caller could still reach and briefly
      // hold the lock before the gateway's own authorize() rejected them, contending with a
      // concurrent authorized restore. Authorize inline, before any lock acquisition; the
      // gateway's fresh authorize() re-check at execute time (CIC U-001) remains the authoritative
      // check and is unchanged by this.
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "backup.restore",
        workspaceId: deps.workspaceId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'backup.restore' (${authResult.reason})`,
          code: "NOT_AUTHORIZED",
          details: { permission: "backup.restore", reason: authResult.reason },
        });
        return;
      }

      const { confirmationToken, restorePointId } = req.body ?? {};
      if (typeof confirmationToken !== "string" || typeof restorePointId !== "string") {
        res.status(400).json({ error: "'confirmationToken' and 'restorePointId' (strings) are required", code: "VALIDATION_ERROR" });
        return;
      }

      const hooks = buildRestoreHooks({
        workspaceId: deps.workspaceId,
        actorId: principal.id,
        restorePointId,
        clock: deps.clock,
        idGen: deps.idGen,
        restorePointsRepo: deps.restorePointsRepo,
        databaseLedgerRepo: deps.databaseLedgerRepo,
        dbOps: deps.dbOps,
        migrationRunsRepo: deps.migrationRunsRepo,
        siteStatus: deps.siteStatusRepo,
      });

      const result = await executeRestore({
        deps: {
          gateway: {
            execute: (input) =>
              toRecoveryResult(async () => {
                return execute({
                  deps: deps.gatedMutations.gatewayDeps,
                  principalId: principal.id,
                  principalKind: "user",
                  hooks: hooks as never,
                  confirmationToken: input.confirmationToken,
                });
              }),
          },
          operationLock: { acquireOperationLock, releaseOperationLock },
          clock: deps.clock,
        },
        input: { principalId: principal.id, principalKind: "user", confirmationToken, siteId: deps.workspaceId },
      });

      if (!result.ok) {
        sendRecoveryError(res, result.error);
        return;
      }
      res.json(result.value);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
