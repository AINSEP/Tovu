import type { ClockPort, IdGeneratorPort } from "../../core/ports";
import type { GatedMutationHooks } from "../../core/gated-mutations/gateway";
import { planHashOf, resolveActorClassIdentity } from "../../core/gated-mutations/composition";

/**
 * @file Database's `GatedMutationHooks` factory for the `migrate-forward` ceremony (SPEC-017
 * C-103/C-105) — the domain-specific quarter of what used to be
 * `server/gated-mutations-composition.ts`, split out so Database no longer needs a back-edge into
 * `server/` for its own hook builder. The generic pieces every ceremony shares (`buildGatewayDeps`,
 * `planHashOf`, `resolveActorClassIdentity`, `buildConfirmOnlyHooks`) stayed in
 * `core/gated-mutations/composition.ts`, which this file imports from — the correct direction (a
 * domain depending on `core`), unlike the old direction (a domain depending on `server`).
 *
 * `LedgerAppendPort` also lives here (not a generic `core` type) because `migrate-forward`'s hooks
 * were its first user; `features/recovery/gated-hooks.ts` imports it from here for its own
 * `restore` ceremony's `databaseLedgerRepo` field rather than duplicating the shape — Recovery
 * already imports several other Database-owned ports (`restore-points.ts`,
 * `boot/reconcile-interrupted-migration.ts`), so this is the established direction, not a new one.
 */

export interface LedgerAppendPort {
  append(row: {
    id: string;
    kind: string;
    correlationId?: string | null;
    restorePointId?: string | null;
    schemaBeforeVersion?: number | null;
    schemaBeforeTag?: string | null;
    schemaAfterVersion?: number | null;
    schemaAfterTag?: string | null;
    driftStatus?: string | null;
    outcome: string;
    detailJson?: string | null;
    actorWorkspaceId?: string | null;
    actorId?: string | null;
    delegatedByWorkspaceId?: string | null;
    delegatedById?: string | null;
    createdAt: string;
  }): Promise<void>;
}

export interface MigrateForwardDbOpsPort {
  getCapabilities(): Promise<{ restorePoint: { costClass: "cheap" | "expensive" | "unavailable"; kind: string } }>;
  captureRestorePoint(params: { scopeId: string }): Promise<{ artifactRef: string; watermarkAtCapture: number }>;
}

export interface BuildMigrateForwardHooksInput {
  workspaceId: string;
  actorId: string;
  clock: ClockPort;
  idGen: IdGeneratorPort;
  dbOps: MigrateForwardDbOpsPort;
  restorePointsRepo: { save(row: { restorePointId: string; idempotencyKey: string; trigger: string; createdAt: string; createdBy: string; costClass?: string; kind?: string; watermarkAtCapture?: number | null }): Promise<void> };
  databaseLedgerRepo: LedgerAppendPort;
}

/**
 * SPEC-017 C-103/C-105 — the Database `migrate-forward` ceremony's `GatedMutationHooks`.
 *
 * `computePlan()` reads live `dbOps.getCapabilities()` every call (never cached) — a site whose
 * capability changes between plan and execute (e.g. `cheap` -> `unavailable`) correctly produces a
 * different plan hash.
 *
 * `executeMutation()` performs the two safe, real, ADR-041 §2/§3-mandated actions this composition
 * root can perform without inventing an unreviewed live-schema-swap mechanism: it captures a real
 * restore point (`dbOps.captureRestorePoint` — an online-backup file copy in the real SQLite
 * composition, a deterministic double in the hermetic one) and appends a `core.migration`
 * `database_ledger` row anchored to it. It deliberately does NOT re-run `drizzle-orm`'s migrator
 * directly against `content.db` — every composition root already runs `migrate()` unconditionally
 * at `openContentDb()` boot time (`db/sqlite/content-db.ts`), so by the time any ceremony could
 * run, the schema is already at head; re-invoking the migrator here would be a no-op in every
 * environment this dispatch can actually exercise, and this file has no reachable seam into the
 * hermetic (`server/app.ts`) composition's non-existent `content.db` at all. Persisting a
 * `migration_runs` row (the state machine's own attempt ledger, `state-machine.ts`) is likewise
 * out of this pass's scope — no composition root wires `SqliteMigrationRunsRepo`/an in-memory
 * counterpart into `RouteDeps` yet; disclosed, not silently skipped.
 *
 * @complexity O(1) plus one `captureRestorePoint()` call and two persistence writes.
 * @overallScore 100
 */
export function buildMigrateForwardHooks(input: BuildMigrateForwardHooksInput): GatedMutationHooks<{ costClass: string; siteId: string }, { migrated: true }> {
  return {
    domain: "database.migrate",
    readPermission: "database.read",
    mutatePermission: "database.migrate",
    scopeId: input.workspaceId,
    computePlan: async () => {
      const capabilities = await input.dbOps.getCapabilities();
      const details = { costClass: capabilities.restorePoint.costClass, siteId: input.workspaceId };
      return { planHash: planHashOf(details), details };
    },
    executeMutation: async () => {
      const captured = await input.dbOps.captureRestorePoint({ scopeId: input.workspaceId });
      const restorePointId = input.idGen.newId();
      const now = input.clock.nowIso();
      await input.restorePointsRepo.save({
        restorePointId,
        idempotencyKey: restorePointId,
        trigger: "migrate-forward",
        createdAt: now,
        createdBy: input.actorId,
        costClass: "cheap",
        kind: "file-snapshot",
        watermarkAtCapture: captured.watermarkAtCapture,
      });
      await input.databaseLedgerRepo.append({
        id: input.idGen.newId(),
        kind: "core.migration",
        restorePointId,
        outcome: "success",
        detailJson: JSON.stringify({ artifactRef: captured.artifactRef }),
        actorWorkspaceId: input.workspaceId,
        actorId: input.actorId,
        createdAt: now,
      });
      return { migrated: true as const };
    },
    resolveActorClassIdentity,
  };
}
