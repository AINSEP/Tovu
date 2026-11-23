import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import type { Express, Request, Response } from "express";

import { acquireOperationLock, releaseOperationLock } from "#src/contracts/core/operation-lock";
import { authorizeForHooks, confirm, execute, ForbiddenError, PlanStaleError, plan } from "#src/contracts/core/gated-mutations/gateway";
import type { GatedMutationHooks } from "@jini-ai/core/gated-mutations";
import { TokenAlreadyRedeemedError, TokenExpiredError } from "#src/contracts/core/gated-mutations/token";
import {
  executeMigrateForward,
  MigrationAlreadyInFlightError,
  RestorePointUnavailableError,
} from "@jini-ai/db/recovery/migrate-forward-execute";
import { buildConfirmOnlyHooks } from "#src/contracts/core/gated-mutations/composition";
import { buildMigrateForwardHooks } from "#src/features/database/gated-hooks";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

const MIGRATE_PERMISSION = "database.migrate";

/**
 * @file SPEC-017 C-103/C-105 — `POST /api/admin/v1/database/migrate-forward/{plan,confirm,execute}`
 * (ADR-041 §3's forward-migrate ceremony). Gated by `database.read` (`plan`) / `database.migrate`
 * (`confirm`/`execute`). Mirrors `apps/website/src/server/inbound/admin-http/routes/taxonomy/merge-term.ts`'s 3-endpoint shape — the
 * `/execute` step additionally wires `core/operation-lock.ts`'s cross-domain lock via
 * `migrate-forward/execute.ts`'s own `executeMigrateForward` orchestration wrapper (U-003-ORD1:
 * lock acquired strictly before the gateway's own `execute()` runs).
 */
function statusFor({ err }: { err: unknown }, _optional = {}): { status: number; code: string; message: string } | null {
  if (err instanceof ForbiddenError) return { status: 403, code: err.reasonCode, message: err.message };
  if (err instanceof PlanStaleError) return { status: 409, code: "PLAN_STALE", message: err.message };
  if (err instanceof TokenExpiredError) return { status: 409, code: "TOKEN_EXPIRED", message: err.message };
  if (err instanceof TokenAlreadyRedeemedError) return { status: 409, code: "TOKEN_ALREADY_REDEEMED", message: err.message };
  if (err instanceof RestorePointUnavailableError) return { status: 409, code: "RESTORE_POINT_UNAVAILABLE", message: err.message };
  if (err instanceof MigrationAlreadyInFlightError) return { status: 409, code: "OPERATION_IN_FLIGHT", message: err.message };
  return null;
}

function sendMigrateForwardFailure(input: { res: Response; err: unknown }): void {
  const { res, err } = input;
  const failure = statusFor({ err });
  if (!failure) { sendAdminFailure({ res, error: err }); return; }
  res.status(failure.status).json({ error: failure.message, code: failure.code });
}

/** The migrate hooks every plan/execute call builds the same way. */
function migrateHooksFor(input: { deps: RouteDeps; actorId: string }) {
  const { deps, actorId } = input;
  return buildMigrateForwardHooks({
    workspaceId: deps.workspaceId,
    actorId,
    clock: deps.clock,
    idGen: deps.idGen,
    dbOps: deps.dbOps,
    restorePointsRepo: deps.restorePointsRepo,
    databaseLedgerRepo: deps.databaseLedgerRepo,
  });
}

async function handleMigratePlan(input: { deps: RouteDeps; res: Response }): Promise<void> {
  const { deps, res } = input;
  try {
    const principal = getAuthedPrincipal(res);
    const hooks = migrateHooksFor({ deps, actorId: principal.id });

    const result = await plan({
      deps: deps.gatedMutations.gatewayDeps,
      principalId: principal.id,
      principalKind: "user",
      hooks: hooks as unknown as GatedMutationHooks<unknown, unknown>,
    });

    res.json(result);
  } catch (err) {
    sendMigrateForwardFailure({ res, err });
  }
}

async function handleMigrateConfirm(input: { deps: RouteDeps; req: Request; res: Response }): Promise<void> {
  const { deps, req, res } = input;
  try {
    const principal = getAuthedPrincipal(res);
    const { planId, planHash } = req.body ?? {};
    if (typeof planId !== "string" || typeof planHash !== "string") {
      res.status(400).json({ error: "'planId' and 'planHash' (strings) are required", code: "VALIDATION_ERROR" });
      return;
    }

    const hooks = buildConfirmOnlyHooks({
      domain: MIGRATE_PERMISSION,
      readPermission: "database.read",
      mutatePermission: MIGRATE_PERMISSION,
      scopeId: deps.workspaceId,
      scopeKind: "instance",
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
    sendMigrateForwardFailure({ res, err });
  }
}

async function handleMigrateExecute(input: { deps: RouteDeps; req: Request; res: Response }): Promise<void> {
  const { deps, req, res } = input;
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
    //
    // Routed through `authorizeForHooks` (not a hardcoded `deps.authorize` workspace-scoped
    // call) with `scopeKind: "instance"` -- `database.migrate`'s real scope, per
    // `features/database/gated-hooks.ts`'s `buildMigrateForwardHooks` doc comment -- so this
    // pre-check agrees with what `execute()`'s own internal check will decide. A hardcoded
    // workspace-scoped check here would let a workspace-scoped-but-not-instance-authorized
    // caller pass this gate, briefly hold the lock, and only then be rejected deeper inside
    // `execute()` -- reopening the very race AUD-001 closed, one layer up.
    const authResult = await authorizeForHooks(
      { deps: deps.gatedMutations.gatewayDeps,
      hooks: buildConfirmOnlyHooks({
        domain: MIGRATE_PERMISSION,
        readPermission: "database.read",
        mutatePermission: MIGRATE_PERMISSION,
        scopeId: deps.workspaceId,
        scopeKind: "instance",
      }),
      required: { principalId: principal.id, permission: MIGRATE_PERMISSION } }
    );
    if (!authResult.allowed) {
      res.status(403).json({
        error: `principal '${principal.id}' is not authorized for 'database.migrate' (${authResult.reason})`,
        code: "FORBIDDEN",
        details: { permission: MIGRATE_PERMISSION, reason: authResult.reason },
      });
      return;
    }

    const { confirmationToken } = req.body ?? {};
    if (typeof confirmationToken !== "string") {
      res.status(400).json({ error: "'confirmationToken' (string) is required", code: "VALIDATION_ERROR" });
      return;
    }

    const hooks = migrateHooksFor({ deps, actorId: principal.id });

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
    sendMigrateForwardFailure({ res, err });
  }
}

export function registerAdminDatabaseMigrateForwardRoutes({ app, deps }: { app: Express; deps: RouteDeps }, _optional: Record<string, never> = {}): void {
  app.post("/api/admin/v1/database/migrate-forward/plan", (_req, res) => handleMigratePlan({ deps, res }));
  app.post("/api/admin/v1/database/migrate-forward/confirm", (req, res) => handleMigrateConfirm({ deps, req, res }));
  app.post("/api/admin/v1/database/migrate-forward/execute", (req, res) => handleMigrateExecute({ deps, req, res }));
}
