import type { Express, Response } from "express";
import { randomUUID } from "node:crypto";

import {
  listRestorePoints,
  createRestorePoint,
  RestorePointUnavailableError,
  ValidationError,
  type RestorePointCostClass,
} from "#src/features/database/restore-points";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { DatabaseRecoveryRouteDeps } from "../database-recovery/deps.js";

/**
 * This route's three writable POST body fields, read off an untyped body in one place.
 *
 * `idempotencyKey` omission (line below, `randomUUID()`) is a deliberate opt-out, not a bug: no
 * caller in this codebase sends `idempotencyKey` today (the admin UI never does), so making it
 * required would turn every existing real call into a 400 for a body shape no one currently
 * requests updating. A caller that wants retry-safety must supply its own key; one that omits it
 * gets a fresh key per request and is treated as "not asking for idempotency," matching the
 * `findExistingRestorePointSummary` check below, which only ever short-circuits a key the caller
 * chose to repeat.
 *
 * @complexity O(1).
 */
function parseRestorePointCreateBody(rawBody: unknown): { trigger: string; costAck: boolean; idempotencyKey: string } {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  return {
    trigger: typeof body.trigger === "string" ? body.trigger : "manual",
    costAck: body.costAck === true,
    idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : randomUUID(),
  };
}

/**
 * Resolves the two fields the `capture` closure fills in, into the shape `restorePointsRepo.save`
 * persists — `watermarkAtCapture` defaults to `null` (never captured), `artifactRef` stays
 * `undefined` the same way the inline version did (see the 2026-07-16 note this route carries).
 *
 * @complexity O(1).
 */
function toCapturedRow(captured: { artifactRef: string; watermarkAtCapture: number } | undefined): {
  watermarkAtCapture: number | null;
  artifactRef: string | undefined;
} {
  return {
    watermarkAtCapture: captured?.watermarkAtCapture ?? null,
    artifactRef: captured?.artifactRef,
  };
}

/**
 * AC-11 idempotency check — if `idempotencyKey` already names a persisted restore point, reconstructs
 * the same `{id, costClass, kind}` summary shape a fresh create returns, instead of re-running the
 * real (costly) `capture()` and inserting a second ledger row. Must be called BEFORE `capture()`,
 * not merely before `save()` — checking only before the insert still burns a real backup on every
 * retry.
 *
 * Pairs the narrow `findByIdempotencyKey` lookup with the same `list()` read the GET route already
 * serves, rather than widening `findByIdempotencyKey`'s own return shape — no change needed to
 * either concrete repo (`SqliteRestorePointsRepo`/`InMemoryRestorePointsRepo` already implement
 * both methods). Mirrors `features/recovery/repo.memory.ts`'s `RestorePointDeepLinkLookup` for the
 * identical accepted O(n) tradeoff (restore points are an operator-curated, low-volume list).
 *
 * Two concurrent requests sharing the same key can still both miss this lookup and both capture —
 * this check alone does not close that race. The `(site_id, idempotency_key)` unique index on the
 * `restore_points` table (`database-journal-schema.ts`) prevents a second row from being persisted,
 * but does not prevent a second real capture from running; closing that fully needs an in-process
 * lock, which is out of scope here (see this dispatch's report).
 *
 * @complexity O(1) lookup plus O(n) over the restore-points list only when a repeat key is found.
 */
async function findExistingRestorePointSummary(
  repo: DatabaseRecoveryRouteDeps["restorePointsRepo"],
  idempotencyKey: string
): Promise<{ id: string; costClass: RestorePointCostClass; kind: string } | undefined> {
  const existing = await repo.findByIdempotencyKey(idempotencyKey);
  if (!existing) return undefined;

  const items = await repo.list();
  const row = items.find((item) => item.id === existing.restorePointId);
  // Defensive: the idempotency index just resolved this id, so a missing row here would mean the
  // two reads observed inconsistent state, not a legitimate "not found" — surface it as an error
  // rather than silently falling through to re-capture (which is what this function exists to
  // prevent).
  if (!row) {
    throw new Error(`restore point '${existing.restorePointId}' has a known idempotency key but no persisted row`);
  }
  return { id: row.id, costClass: row.costClass as RestorePointCostClass, kind: row.kind };
}

/** Maps this route's thrown error types onto the admin error envelope. @complexity O(1). */
function sendRestorePointCreateError(res: Response, err: unknown): void {
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

      const { trigger, costAck, idempotencyKey } = parseRestorePointCreateBody(req.body);

      // AC-11: a repeat idempotencyKey returns the ORIGINAL restore point — checked before any
      // capability/cost-gate work and, critically, before `capture()` below, since the whole point
      // is to never re-run the real (costly) backup on a retry.
      const existingSummary = await findExistingRestorePointSummary(deps.restorePointsRepo, idempotencyKey);
      if (existingSummary) {
        res.status(201).json({ restorePoint: existingSummary });
        return;
      }

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
        idempotencyKey,
        trigger,
        createdAt: deps.clock.nowIso(),
        createdBy: principal.id,
        costClass: summary.costClass,
        kind: summary.kind,
        // 2026-07-16: was captured above but previously never persisted — the root cause of why
        // Recovery's restore ceremony could only write a "ledger-only" note (no way to know which
        // file to restore from). See `features/recovery/gated-hooks.ts`'s `buildRestoreHooks`.
        ...toCapturedRow(captured),
      });

      res.status(201).json({ restorePoint: summary });
    } catch (err) {
      sendRestorePointCreateError(res, err);
    }
  });
}
