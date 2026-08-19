import type { Express } from "express";
import { randomUUID } from "node:crypto";

import { listRestorePoints, createRestorePoint, RestorePointUnavailableError, ValidationError } from "#src/features/database/restore-points";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { DatabaseRecoveryRouteDeps } from "../database-recovery/deps.js";

/**
 * @file design-spec.md §3.2/§3.8 — `GET /api/admin/v1/database/restore-points` (newest-first
 * restore-points list, the shared column source Database's and Recovery's own restore-points list
 * views both read — `database.read`'s own description already names "restore points" as part of
 * what it covers, ADR-041 §6). Gated by `database.read`.
 */
export function registerAdminDatabaseRestorePointsListRoute(app: Express, deps: DatabaseRecoveryRouteDeps): void {
  app.get("/api/admin/v1/database/restore-points", async (_req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "database.read",
        workspaceId: deps.workspaceId,
        entityType: "restore-point",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'database.read' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "database.read", reason: authResult.reason },
        });
        return;
      }

      const result = await listRestorePoints({ repo: deps.restorePointsRepo });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "internal error";
      res.status(500).json({ error: message, code: "INTERNAL_ERROR" });
    }
  });
}

/**
 * @file design-spec.md §3.3/§3.8 — `POST /api/admin/v1/database/restore-points` (mints an ad hoc
 * restore point independent of any migration, REQ-22/AC-26/AC-27). Gated by `backup.create`.
 *
 * Composes two already-certified pieces without modifying either: `database/restore-points.ts`'s
 * `createRestorePoint` (the cost-gate decision + the real `dbOps.captureRestorePoint()` backup)
 * and `restorePointsRepo.save()` (the durable row `createRestorePoint` itself never writes — see
 * that function's own doc comment: persistence is deliberately the caller's job). The `capture`
 * closure's result is captured via an outer variable so the route can persist the real
 * `artifactRef`/`watermarkAtCapture` `createRestorePoint`'s return value does not carry.
 */
export function registerAdminDatabaseRestorePointsCreateRoute(app: Express, deps: DatabaseRecoveryRouteDeps): void {
  app.post("/api/admin/v1/database/restore-points", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "backup.create",
        workspaceId: deps.workspaceId,
        entityType: "restore-point",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'backup.create' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "backup.create", reason: authResult.reason },
        });
        return;
      }

      const body = req.body ?? {};
      const trigger = typeof body.trigger === "string" ? body.trigger : "manual";
      const costAck = body.costAck === true;

      const capabilities = await deps.dbOps.getCapabilities();
      let captured: { artifactRef: string; watermarkAtCapture: number } | undefined;

      const summary = await createRestorePoint({
        costClass: capabilities.restorePoint.costClass,
        costAck,
        capture: async () => {
          captured = await deps.dbOps.captureRestorePoint({ scopeId: deps.workspaceId });
          return captured;
        },
      });

      await deps.restorePointsRepo.save({
        restorePointId: summary.id,
        idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : randomUUID(),
        trigger,
        createdAt: deps.clock.nowIso(),
        createdBy: principal.id,
        costClass: summary.costClass,
        kind: summary.kind,
        watermarkAtCapture: captured?.watermarkAtCapture ?? null,
        // 2026-07-16: was captured above but previously never persisted — the root cause of why
        // Recovery's restore ceremony could only write a "ledger-only" note (no way to know which
        // file to restore from). See `features/recovery/gated-hooks.ts`'s `buildRestoreHooks`.
        artifactRef: captured?.artifactRef,
      });

      res.status(201).json({ restorePoint: summary });
    } catch (err) {
      if (err instanceof RestorePointUnavailableError) {
        res.status(409).json({ error: err.message, code: "RESTORE_POINT_UNAVAILABLE" });
        return;
      }
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message, code: "VALIDATION_ERROR" });
        return;
      }
      const message = err instanceof Error ? err.message : "internal error";
      res.status(500).json({ error: message, code: "INTERNAL_ERROR" });
    }
  });
}
